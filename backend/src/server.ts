import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { generateQRToken, validateQRToken } from './services/qr.service.js';
import { generateEphemeralKeypair } from './services/zklogin.service.js';
import { getLoyaltyCard } from './services/nft.service.js';

dotenv.config();

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
});
