/**
 * SuiLoyalty Backend – server.ts
 * Production-grade: JWKS JWT verification, server-side sessions,
 * dynamic brand management (no hardcoded brands).
 */
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { createHmac } from 'crypto';
import { generateQRToken, validateQRToken } from './services/qr.service.js';
import { generateEphemeralKeypair, deriveSalt, computeSuiAddress } from './services/zklogin.service.js';
import { getLoyaltyAvatar } from './services/nft.service.js';
import { createRedemptionRequest } from './services/redemption.service.js';
import brandRouter from './routes/brand.routes.js';
import pool from './config/database.js';

// --- Auto Migration ---
pool.query("ALTER TABLE qr_tokens ADD COLUMN IF NOT EXISTS campaign_name VARCHAR(100) DEFAULT 'General Campaign';")
  .then(() => console.log('[DB] campaign_name migration applied'))
  .catch((err) => console.log('[DB] migration notice:', err.message));

// ─── TypeScript session augmentation ─────────────────────────────────────────
declare module 'express-session' {
  interface SessionData {
    userId: string;
    suiAddress: string;
    googleSub: string;
    email: string;
    name: string;
  }
}

// ─── JWKS client – verifies Google JWTs cryptographically ────────────────────
const googleJwks = jwksClient({
  jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
  cache: true,
  rateLimit: true,
});

function verifyGoogleJwt(idToken: string): Promise<jwt.JwtPayload> {
  return new Promise((resolve, reject) => {
    jwt.verify(
      idToken,
      (header, callback) => {
        googleJwks.getSigningKey(header.kid, (err, key) => {
          if (err) return callback(err);
          callback(null, key?.getPublicKey());
        });
      },
      {
        algorithms: ['RS256'],
        audience: process.env.GOOGLE_CLIENT_ID!,
        issuer: ['https://accounts.google.com', 'accounts.google.com'],
      },
      (err, decoded) => {
        if (err) return reject(new Error(`JWT verification failed: ${err.message}`));
        resolve(decoded as jwt.JwtPayload);
      },
    );
  });
}

// ─── App setup ────────────────────────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

const allowedOrigins = [
  'http://localhost:3001',
  'http://localhost:3000',
  process.env.FRONTEND_URL,
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(null, true); // dev: allow all; tighten in prod
  },
  credentials: true,
}));

app.use(express.json());

// ─── Session (PostgreSQL-backed, HttpOnly cookie) ─────────────────────────────
const PgSession = connectPgSimple(session);

app.use(session({
  store: new PgSession({
    pool,
    tableName: 'session',
    createTableIfMissing: false,
  }),
  name: 'sui_loyalty_sid',
  secret: process.env.SESSION_SECRET || 'change-me-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    maxAge: 24 * 60 * 60 * 1000, // 24 h
  },
}));

// ─── Brand-portal operator routes ─────────────────────────────────────────────
app.use('/api/brand', brandRouter);

// ─── Health ──────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// ─── Auth: initiate zkLogin ───────────────────────────────────────────────────
app.post('/api/auth/zklogin', async (req, res) => {
  try {
    const { SuiJsonRpcClient, getJsonRpcFullnodeUrl } = await import('@mysten/sui/jsonRpc');
    const network = (process.env.SUI_NETWORK || 'testnet') as 'devnet' | 'testnet' | 'mainnet';
    const suiClient = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(network), network });
    const { epoch } = await suiClient.getLatestSuiSystemState();
    const ephemeral = generateEphemeralKeypair(Number(epoch));

    const { returnUrl } = req.body || {};
    const redirectUri = process.env.REDIRECT_URI!;
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      nonce: ephemeral.nonce,
    });
    
    // Pass the returnUrl through Google's state parameter so we know where to redirect back
    if (returnUrl) {
      params.append('state', returnUrl);
    }

    res.json({
      success: true,
      authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
      ephemeralPublicKey: ephemeral.ephemeralPublicKey,
      maxEpoch: ephemeral.maxEpoch,
      randomness: ephemeral.randomness,
    });
  } catch (error: any) {
    console.error('[zklogin]', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Auth: OAuth callback (POST from frontend) ────────────────────────────────
app.post('/api/auth/callback', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'No code provided' });

    const redirectUri = req.get('origin')
      ? `${req.get('origin')}/`
      : 'http://localhost:3001/';

    // Exchange code for Google tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: process.env.REDIRECT_URI!,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData: any = await tokenRes.json();
    const idToken: string = tokenData.id_token;

    if (!idToken) {
      console.error('[callback] No id_token in response:', tokenData);
      return res.status(400).json({ error: 'No ID token received from Google' });
    }

    // 🔐 Cryptographically verify the JWT via Google's JWKS
    let claims: jwt.JwtPayload;
    try {
      claims = await verifyGoogleJwt(idToken);
    } catch (jwtErr: any) {
      console.error('[callback] JWT verification error:', jwtErr.message);
      return res.status(401).json({ error: 'Invalid Google JWT — please sign in again' });
    }

    const googleSub: string = claims.sub as string;
    const email: string | undefined = claims.email as string | undefined;
    const name: string | undefined = claims.name as string | undefined;

    // Derive deterministic Sui address
    const salt = deriveSalt(googleSub);
    const suiAddress = computeSuiAddress(idToken, salt);

    // Upsert user — track google_sub for reliable re-identification
    const userResult = await pool.query<{ id: string }>(
      `INSERT INTO users (wallet_address, email, display_name, google_sub)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (wallet_address) DO UPDATE
         SET email       = COALESCE(EXCLUDED.email, users.email),
             display_name = COALESCE(EXCLUDED.display_name, users.display_name),
             google_sub   = EXCLUDED.google_sub
       RETURNING id`,
      [suiAddress, email ?? null, name ?? null, googleSub],
    );
    const userId: string = userResult.rows[0]!.id;

    // Establish server-side session
    req.session.userId = userId;
    req.session.suiAddress = suiAddress;
    req.session.googleSub = googleSub;
    req.session.email = email ?? '';
    req.session.name = name ?? email ?? '';

    res.json({
      success: true,
      user: { suiAddress, email, name },
    });
  } catch (error: any) {
    console.error('[auth/callback POST]', error);
    res.status(500).json({ error: error.message || 'Authentication failed' });
  }
});

// ─── Auth: OAuth callback (GET — Google redirect) ────────────────────────────
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
        redirect_uri: process.env.REDIRECT_URI!,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData: any = await tokenRes.json();
    const idToken: string = tokenData.id_token;
    if (!idToken) return res.status(400).json({ error: 'No ID token received' });

    // 🔐 Verify JWT
    let claims: jwt.JwtPayload;
    try {
      claims = await verifyGoogleJwt(idToken);
    } catch (jwtErr: any) {
      return res.status(401).json({ error: 'Invalid Google JWT' });
    }

    const googleSub: string = claims.sub!;
    const email: string | undefined = claims.email as string | undefined;
    const name: string | undefined = claims.name as string | undefined;

    const salt = deriveSalt(googleSub);
    const suiAddress = computeSuiAddress(idToken, salt);

    const userResult = await pool.query<{ id: string }>(
      `INSERT INTO users (wallet_address, email, display_name, google_sub)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (wallet_address) DO UPDATE
         SET email       = COALESCE(EXCLUDED.email, users.email),
             display_name = COALESCE(EXCLUDED.display_name, users.display_name),
             google_sub   = EXCLUDED.google_sub
       RETURNING id`,
      [suiAddress, email ?? null, name ?? null, googleSub],
    );
    const userId: string = userResult.rows[0]!.id;

    req.session.userId = userId;
    req.session.suiAddress = suiAddress;
    req.session.googleSub = googleSub;
    req.session.email = email ?? '';
    req.session.name = name ?? email ?? '';

    // Redirect back to where they came from (consumer vs merchant)
    const state = req.query.state as string;
    const hostname = req.hostname || 'localhost';
    
    if (state && state.startsWith('http')) {
      // Consumer app needs the address in the URL since it relies on localStorage right now
      const url = new URL(state);
      url.searchParams.set('address', suiAddress);
      if (name) url.searchParams.set('name', name);
      res.redirect(url.toString());
    } else {
      const frontendBase = process.env.FRONTEND_URL || 'https://sui-loyalty.vercel.app';
      res.redirect(`${frontendBase}/merchant`);
    }
  } catch (error: any) {
    console.error('[auth/callback GET]', error);
    res.status(500).json({ error: error?.message || String(error) });
  }
});

// ─── Auth: session check ─────────────────────────────────────────────────────
app.get('/api/auth/session', async (req, res) => {
  if (!req.session?.userId) {
    return res.json({ authenticated: false });
  }
  res.json({
    authenticated: true,
    userId: req.session.userId,
    suiAddress: req.session.suiAddress,
    email: req.session.email,
    name: req.session.name,
  });
});

// ─── Auth: logout ─────────────────────────────────────────────────────────────
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error('[logout]', err);
    res.clearCookie('sui_loyalty_sid');
    res.json({ success: true });
  });
});

// ─── Brands: list all (public, for consumer dropdown) ────────────────────────
app.get('/api/brands', async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, category, color, description FROM brands WHERE is_active = TRUE ORDER BY name`,
    );
    res.json({ success: true, brands: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch brands' });
  }
});

// ─── Brands: create (requires active session — anyone signed in can create) ───
app.post('/api/brands', async (req, res) => {
  if (!req.session?.userId) {
    return res.status(401).json({ success: false, error: 'Sign in first' });
  }
  try {
    const { name, category, color, description } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Brand name is required' });
    }

    // Derive a URL-safe slug; make it unique with a timestamp suffix if needed.
    const baseSlug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
    const slug = `${baseSlug}-${Date.now().toString(36)}`;

    const brandResult = await pool.query<{ id: string }>(
      `INSERT INTO brands (name, category, color, description, slug, owner_user_id, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE)
       RETURNING id`,
      [
        name.trim(),
        category || null,
        color || '#6366f1',
        description || null,
        slug,
        req.session.userId,
      ],
    );
    const brandId = brandResult.rows[0]!.id;

    // Auto-grant the creator owner access
    await pool.query(
      `INSERT INTO brand_members (user_id, brand_id, role)
       VALUES ($1, $2, 'owner')
       ON CONFLICT (user_id, brand_id) DO UPDATE SET role = 'owner'`,
      [req.session.userId, brandId],
    );

    const brand = await pool.query(`SELECT * FROM brands WHERE id = $1`, [brandId]);
    res.status(201).json({ success: true, brand: brand.rows[0] });
  } catch (error: any) {
    console.error('[brands POST]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Brands: edit (owner/admin only) ──────────────────────────────────────────
app.put('/api/brands/:brand_id', async (req, res) => {
  if (!req.session?.userId) {
    return res.status(401).json({ success: false, error: 'Sign in first' });
  }
  try {
    const { brand_id } = req.params;
    const { name, category, color, description } = req.body;

    // Verify caller is owner or admin
    const callerRole = await pool.query(
      `SELECT role FROM brand_members WHERE user_id = $1 AND brand_id = $2`,
      [req.session.userId, brand_id]
    );
    if (callerRole.rows.length === 0 || !['owner', 'admin'].includes(callerRole.rows[0].role)) {
      return res.status(403).json({ success: false, error: 'Forbidden: only owners/admins can edit the brand' });
    }

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Brand name is required' });
    }

    const updated = await pool.query(
      `UPDATE brands
       SET name = $1, category = $2, color = $3, description = $4
       WHERE id = $5
       RETURNING *`,
      [name.trim(), category || null, color || '#6366f1', description || null, brand_id]
    );

    if (updated.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Brand not found' });
    }

    res.json({ success: true, brand: updated.rows[0] });
  } catch (error: any) {
    console.error('[brands PUT]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Brands: grant membership (owner/admin only) ──────────────────────────────
app.post('/api/brands/:brand_id/members', async (req, res) => {
  if (!req.session?.userId) {
    return res.status(401).json({ success: false, error: 'Sign in first' });
  }
  try {
    const { brand_id } = req.params;
    const { wallet_address, role = 'operator' } = req.body;

    // Check caller has owner/admin access
    const callerRole = await pool.query(
      `SELECT role FROM brand_members WHERE user_id = $1 AND brand_id = $2`,
      [req.session.userId, brand_id],
    );
    if (callerRole.rows.length === 0 || !['owner', 'admin'].includes(callerRole.rows[0].role)) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions' });
    }

    if (!wallet_address || !wallet_address.startsWith('0x')) {
      return res.status(400).json({ success: false, error: 'Valid wallet_address required' });
    }

    // Look up or create the target user
    const userResult = await pool.query<{ id: string }>(
      `SELECT id FROM users WHERE wallet_address = $1`,
      [wallet_address],
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'No account found for that wallet address — they must sign in first' });
    }
    const targetUserId = userResult.rows[0]!.id;

    await pool.query(
      `INSERT INTO brand_members (user_id, brand_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, brand_id) DO UPDATE SET role = EXCLUDED.role`,
      [targetUserId, brand_id, role],
    );

    res.json({ success: true, message: `Access granted as ${role}` });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Brands: list members (owner/admin) ──────────────────────────────────────
app.get('/api/brands/:brand_id/members', async (req, res) => {
  if (!req.session?.userId) {
    return res.status(401).json({ success: false, error: 'Sign in first' });
  }
  try {
    const { brand_id } = req.params;
    const callerRole = await pool.query(
      `SELECT role FROM brand_members WHERE user_id = $1 AND brand_id = $2`,
      [req.session.userId, brand_id],
    );
    if (callerRole.rows.length === 0) {
      return res.status(403).json({ success: false, error: 'No access to this brand' });
    }
    const members = await pool.query(
      `SELECT u.wallet_address, u.display_name, u.email, bm.role, bm.created_at
       FROM brand_members bm JOIN users u ON u.id = bm.user_id
       WHERE bm.brand_id = $1 ORDER BY bm.created_at`,
      [brand_id],
    );
    res.json({ success: true, members: members.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── QR: mark-printed ────────────────────────────────────────────────────────
app.post('/api/qr/mark-printed', async (req, res) => {
  try {
    const { token_uuids } = req.body;
    if (!Array.isArray(token_uuids) || token_uuids.length === 0) {
      return res.status(400).json({ success: false, error: 'token_uuids array required' });
    }
    await pool.query(`UPDATE qr_tokens SET printed = TRUE WHERE token_uuid = ANY($1)`, [token_uuids]);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Failed to mark tokens as printed' });
  }
});

// ─── QR: clear unprinted ─────────────────────────────────────────────────────
app.post('/api/qr/clear-unprinted', async (req, res) => {
  try {
    const { brand_id } = req.body;
    await pool.query(
      `DELETE FROM qr_tokens WHERE brand_id = $1 AND printed = FALSE AND used = FALSE`,
      [brand_id],
    );
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Failed to clear tokens' });
  }
});

// ─── QR: inventory by brand ───────────────────────────────────────────────────
app.get('/api/qr/brand/:brand_id', async (req, res) => {
  try {
    const [tokensResult, statsResult] = await Promise.all([
      pool.query(
        `SELECT q.token_uuid, q.points_value, q.printed, q.used,
                q.used_at, q.created_at,
                u.wallet_address AS used_by_address
           FROM qr_tokens q
           LEFT JOIN users u ON u.id = q.used_by
          WHERE q.brand_id = $1
          ORDER BY q.created_at DESC
          LIMIT 200`,
        [req.params.brand_id],
      ),
      pool.query(
        `SELECT
           COUNT(*)                                    AS total,
           COUNT(*) FILTER (WHERE printed)             AS printed,
           COUNT(*) FILTER (WHERE used)                AS scanned,
           COUNT(*) FILTER (WHERE printed AND NOT used) AS outstanding
         FROM qr_tokens WHERE brand_id = $1`,
        [req.params.brand_id],
      ),
    ]);
    const s = statsResult.rows[0];
    res.json({
      success: true,
      tokens: tokensResult.rows,
      stats: {
        total: Number(s.total),
        printed: Number(s.printed),
        scanned: Number(s.scanned),
        outstanding: Number(s.outstanding),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── QR: generate ─────────────────────────────────────────────────────────────
app.post('/api/qr/generate', async (req, res) => {
  try {
    const { brand_id, points_value, campaign_name, expires_in_days } = req.body;
    const token = await generateQRToken(brand_id, points_value, campaign_name, expires_in_days);
    res.status(201).json({ success: true, token });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Failed to generate token' });
  }
});

// ─── QR: validate ─────────────────────────────────────────────────────────────
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
      const userResult = await pool.query(`SELECT id FROM users WHERE wallet_address = $1`, [user_id]);
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

// ─── User ─────────────────────────────────────────────────────────────────────
app.get('/api/user/:address', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT wallet_address, display_name, email FROM users WHERE wallet_address = $1`,
      [req.params.address],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    res.json({ success: true, user: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── NFT ─────────────────────────────────────────────────────────────────────
app.get('/api/nft/:address', async (req, res) => {
  try {
    const avatar = await getLoyaltyAvatar(req.params.address);
    if (!avatar) return res.status(404).json({ success: false, error: 'No loyalty avatar found' });
    res.json({ success: true, avatar });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Loyalty cards ────────────────────────────────────────────────────────────
app.get('/api/loyalty-cards/:address', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT lbn.points_balance, lbn.tier, lbn.scan_count, lbn.created_at,
              b.id as brand_id, b.name as brand_name, b.color as brand_color, b.category as brand_category
       FROM loyalty_brand_nodes lbn
       JOIN brands b ON b.id = lbn.brand_id
       WHERE lbn.user_id = (SELECT id FROM users WHERE wallet_address = $1)
       ORDER BY lbn.points_balance DESC`,
      [req.params.address],
    );
    res.json({ success: true, cards: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Transactions ─────────────────────────────────────────────────────────────
app.get('/api/transactions/:address', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT pt.id, pt.points_added, pt.created_at, b.name as brand_name, b.color as brand_color
       FROM point_transactions pt
       JOIN loyalty_brand_nodes lbn ON pt.node_id = lbn.id
       JOIN brands b ON lbn.brand_id = b.id
       WHERE lbn.user_id = (SELECT id FROM users WHERE wallet_address = $1)
       ORDER BY pt.created_at DESC LIMIT 50`,
      [req.params.address],
    );
    res.json({ success: true, transactions: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Redeem ──────────────────────────────────────────────────────────────────
app.post('/api/redeem', async (req, res) => {
  try {
    const { user_address, brand_id, points_to_redeem, reward_name } = req.body;
    if (!user_address || !brand_id || !points_to_redeem) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    const userResult = await pool.query(`SELECT id FROM users WHERE wallet_address = $1`, [user_address]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    const userId = userResult.rows[0].id;
    const request = await createRedemptionRequest(userId, brand_id, Number(points_to_redeem), reward_name || 'Reward');
    res.json({
      success: true,
      message: `Pending redemption created for ${reward_name || 'reward'}.`,
      redemption: request,
    });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ─── Delete Account ──────────────────────────────────────────────────────────
app.delete('/api/users/me', async (req, res) => {
  if (!req.session?.userId) {
    return res.status(401).json({ success: false, error: 'Sign in first' });
  }
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // 1. Unlink any QR tokens scanned by this user (preserves analytics, anonymises identity)
    await client.query('UPDATE qr_tokens SET used_by = NULL WHERE used_by = $1', [req.session.userId]);
    
    // 2. Delete the user row (this cascades to avatars, brand nodes, redemptions, brand_members)
    await client.query('DELETE FROM users WHERE id = $1', [req.session.userId]);
    
    await client.query('COMMIT');
    
    // 3. Destroy the server-side session
    req.session.destroy((err) => {
      if (err) console.error('Error destroying session on delete:', err);
    });
    res.clearCookie('sui_loyalty_sid');
    
    res.json({ success: true, message: 'Account deleted successfully' });
  } catch (error: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

// ─── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT as number, '0.0.0.0', () => {
  console.log(`✅ SuiLoyalty backend running on port ${PORT}`);
  console.log(`   Sessions: PostgreSQL-backed HttpOnly cookies`);
  console.log(`   JWT:      Verified via Google JWKS`);
  if (process.env.LOCAL_LAN_IP) {
    console.log(`   LAN:      http://${process.env.LOCAL_LAN_IP}:${PORT}`);
  }
});
