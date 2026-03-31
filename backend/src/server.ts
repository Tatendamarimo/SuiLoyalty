import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { generateQRToken, validateQRToken } from './services/qr.service.js';
import { generateEphemeralKeypair, deriveSalt, computeSuiAddress } from './services/zklogin.service.js';
import { getLoyaltyCard } from './services/nft.service.js';
import pool from './config/database.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.post('/api/qr/generate', async (req, res) => {
  try {
    const token = await generateQRToken();
    res.status(201).json({ success: true, token });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to generate token' });
  }
});

app.post('/api/qr/validate', async (req, res) => {
  try {
    const { token_uuid, user_id } = req.body;
    if (!token_uuid || !user_id) {
      return res.status(400).json({ success: false, error: 'token_uuid and user_id required' });
    }
    const token = await validateQRToken(token_uuid, user_id);
    res.json({ success: true, token });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.post('/api/auth/zklogin', async (req, res) => {
  try {
    const { SuiJsonRpcClient, getJsonRpcFullnodeUrl } = await import('@mysten/sui/jsonRpc');
    const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl('devnet'), network: 'devnet' });
    const { epoch } = await client.getLatestSuiSystemState();
    const ephemeral = generateEphemeralKeypair(Number(epoch));

    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: 'http://localhost:3000/api/auth/callback',
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
        redirect_uri: 'http://localhost:3000/api/auth/callback',
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

    res.redirect(`http://localhost:3001/dashboard?address=${suiAddress}&name=${encodeURIComponent(name)}`);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/auth/session', (req, res) => {
  res.json({ authenticated: false });
});

app.get('/api/nft/:address', async (req, res) => {
  try {
    const card = await getLoyaltyCard(req.params.address);
    if (!card) {
      return res.status(404).json({ success: false, error: 'No loyalty card found' });
    }
    res.json({ success: true, card });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`SuiLoyalty backend running on port ${PORT}`);
  console.log(`Google Client ID: ${process.env.GOOGLE_CLIENT_ID?.slice(0, 20)}...`);
});
