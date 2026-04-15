import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { generateQRToken, validateQRToken } from './services/qr.service.js';
import { generateEphemeralKeypair, deriveSalt, computeSuiAddress } from './services/zklogin.service.js';
import { getLoyaltyAvatar } from './services/nft.service.js';
import pool from './config/database.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors({ origin: '*' })); // Allow all origins for local testing
app.use(express.json());

/**
 * Basic health check endpoint to verify backend service is running.
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

/**
 * Retrieves the full list of brands available in the system.
 */
app.get('/api/brands', async (_req, res) => {
  try {
    const result = await pool.query('SELECT * FROM brands ORDER BY name');
    res.json({ success: true, brands: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch brands' });
  }
});

/**
 * Helper endpoint to mark one or more QR tokens as 'printed'.
 * Expects an array of token_uuids in the request body.
 */
app.post('/api/qr/mark-printed', async (req, res) => {
  try {
    const { token_uuids } = req.body;
    if (!Array.isArray(token_uuids) || token_uuids.length === 0) {
      return res.status(400).json({ success: false, error: 'token_uuids array required' });
    }
    await pool.query(
      `UPDATE qr_tokens SET printed = TRUE WHERE token_uuid = ANY($1)`,
      [token_uuids]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to mark tokens as printed' });
  }
});

/**
 * Clears unprinted QR tokens for a given brand to prevent database bloat.
 * Expects a brand_id in the request body.
 */
app.post('/api/qr/clear-unprinted', async (req, res) => {
  try {
    const { brand_id } = req.body;
    await pool.query(
      `DELETE FROM qr_tokens WHERE brand_id = $1 AND printed = FALSE AND used = FALSE`,
      [brand_id]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to clear tokens' });
  }
});

/**
 * Generates a new QR token.
 * Optionally accepts a brand_id and points_value to associate with the token.
 */
app.post('/api/qr/generate', async (req, res) => {
  try {
    const { brand_id, points_value } = req.body;
    const token = await generateQRToken(brand_id, points_value);
    res.status(201).json({ success: true, token });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to generate token' });
  }
});

/**
 * Validates a scanned QR token and adds points/mints a card for the user.
 * Expects token_uuid (scanned from QR) and user_id (who scanned it).
 */
app.post('/api/qr/validate', async (req, res) => {
  try {
    const { token_uuid, user_id } = req.body;
    if (!token_uuid || !user_id) {
      return res.status(400).json({ success: false, error: 'token_uuid and user_id required' });
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(token_uuid)) {
      return res.status(400).json({ success: false, error: 'Invalid QR code. Please scan a SuiLoyalty QR code.' });
    }
    let realUserId = user_id;
    if (user_id.startsWith('0x')) {
      const userResult = await pool.query(
        'SELECT id FROM users WHERE wallet_address = $1',
        [user_id]
      );
      if (userResult.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }
      realUserId = userResult.rows[0].id;
    }
    const token = await validateQRToken(token_uuid, realUserId);
    res.json({ success: true, token });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Initiates the zkLogin OAuth flow by generating an ephemeral keypair
 * and redirecting the user to the Google OAuth login page.
 */
app.post('/api/auth/zklogin', async (req, res) => {
  try {
    const { SuiJsonRpcClient, getJsonRpcFullnodeUrl } = await import('@mysten/sui/jsonRpc');
    const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl('devnet'), network: 'devnet' });
    const { epoch } = await client.getLatestSuiSystemState();
    const ephemeral = generateEphemeralKeypair(Number(epoch));
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: `http://${req.get('host')}/api/auth/callback`,
      response_type: 'code',
      scope: 'openid email profile',
      nonce: ephemeral.nonce,
    });
    res.json({
      success: true,
      authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
      ephemeralPublicKey: ephemeral.ephemeralPublicKey,
      maxEpoch: ephemeral.maxEpoch,
      randomness: ephemeral.randomness,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Callback URL for the Google OAuth process.
 * Handles the redirect logic, exchanges the auth code for a JWT,
 * derives the user's Sui address, and inserts/updates the user record in the DB.
 */
app.get('/api/auth/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).json({ error: 'No code provided' });
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: code as string,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `http://${req.get('host')}/api/auth/callback`,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();
    const jwt = tokenData.id_token;
    if (!jwt) return res.status(400).json({ error: 'No JWT received', details: tokenData });
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64').toString());
    const googleSub = payload.sub;
    const email = payload.email;
    const name = payload.name || email;
    const salt = deriveSalt(googleSub);
    const suiAddress = computeSuiAddress(jwt, salt);
    await pool.query(
      `INSERT INTO users (wallet_address, email, display_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (wallet_address) DO UPDATE
       SET email = $2, display_name = $3`,
      [suiAddress, email, name]
    );
    const hostname = req.hostname || 'localhost';
    res.redirect(`http://${hostname}:3001/dashboard?address=${suiAddress}&name=${encodeURIComponent(name)}`);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/auth/session', (req, res) => {
  res.json({ authenticated: false });
});

/**
 * Retrieves basic user info directly from the database using their wallet address.
 */
app.get('/api/user/:address', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT wallet_address, display_name, email FROM users WHERE wallet_address = $1',
      [req.params.address]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    res.json({ success: true, user: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Fetches the user's LoyaltyAvatar top-level data (level, experience, locked status)
 * by looking up the on-chain avatar object tied to the user's wallet address.
 */
app.get('/api/nft/:address', async (req, res) => {
  try {
    const avatar = await getLoyaltyAvatar(req.params.address);
    if (!avatar) {
      return res.status(404).json({ success: false, error: 'No loyalty avatar found' });
    }
    res.json({ success: true, avatar });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Fetches all brand loyalty nodes for a user, grouped by brand.
 * Each entry contains brand info, points balance, tier, and scan count.
 */
app.get('/api/loyalty-cards/:address', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT lbn.points_balance, lbn.tier, lbn.scan_count, lbn.created_at,
              b.id as brand_id, b.name as brand_name, b.color as brand_color, b.category as brand_category
       FROM loyalty_brand_nodes lbn
       JOIN brands b ON b.id = lbn.brand_id
       WHERE lbn.user_id = (SELECT id FROM users WHERE wallet_address = $1)
       ORDER BY lbn.points_balance DESC`,
      [req.params.address]
    );
    res.json({ success: true, cards: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT as number, '0.0.0.0', () => {
  console.log(`SuiLoyalty backend running on port ${PORT} (0.0.0.0)`);
  console.log(`Your local IP is: 192.168.1.48 (use this on your phone!)`);
  console.log(`Google Client ID: ${process.env.GOOGLE_CLIENT_ID?.slice(0, 20)}...`);
});
