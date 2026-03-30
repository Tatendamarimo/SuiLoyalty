import { Router, Request, Response } from 'express';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { generateEphemeralKeypair, deriveSalt, computeSuiAddress } from '../services/zklogin.service.js';
import pool from '../config/database.js';
import dotenv from 'dotenv';

dotenv.config();

const router = Router();
const suiClient = new SuiClient({ url: getFullnodeUrl('devnet') });

router.post('/zklogin', async (req: Request, res: Response) => {
  try {
    const { epoch } = await suiClient.getLatestSuiSystemState();
    const currentEpoch = Number(epoch);
    const ephemeral = generateEphemeralKeypair(currentEpoch);

    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: 'http://localhost:3000/api/auth/callback',
      response_type: 'code',
      scope: 'openid email profile',
      nonce: ephemeral.nonce,
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;

    res.json({
      success: true,
      authUrl,
      ephemeralPublicKey: ephemeral.ephemeralPublicKey,
      maxEpoch: ephemeral.maxEpoch,
      randomness: ephemeral.randomness,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/session', (req: Request, res: Response) => {
  res.json({ authenticated: false, message: 'Session management coming in Sprint 3' });
});

export default router;
