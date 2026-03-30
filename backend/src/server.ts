import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { Router } from 'express';
import { generateQRToken, validateQRToken } from './services/qr.service.js';

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

app.listen(PORT, () => {
  console.log(`SuiLoyalty backend running on port ${PORT}`);
});
