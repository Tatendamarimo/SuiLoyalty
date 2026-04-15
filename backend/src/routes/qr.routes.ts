import { Router } from 'express';
import type { Request, Response } from 'express';
import { generateQRToken, validateQRToken } from '../services/qr.service.js';

const router = Router();

/**
 * @route POST /api/qr/generate
 * @description Creates a new QR token. Used primarily by merchants to generate a scannable token.
 */
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const token = await generateQRToken();
    res.status(201).json({ success: true, token });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to generate token' });
  }
});

/**
 * @route POST /api/qr/validate
 * @description Validates a scanned QR token and updates points or mints a card.
 */
router.post('/validate', async (req, res) => {
  try {
    const { token_uuid, user_id } = req.body;

    if (!token_uuid || !user_id) {
      return res.status(400).json({ success: false, error: 'token_uuid and user_id are required' });
    }

    const token = await validateQRToken(token_uuid, user_id);
    res.json({ success: true, token });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

export default router;
