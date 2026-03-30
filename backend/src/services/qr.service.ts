import { randomUUID } from 'crypto';
import pool from '../config/database.js';

export async function generateQRToken() {
  const token_uuid = randomUUID();
  const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const result = await pool.query(
    `INSERT INTO qr_tokens (token_uuid, expires_at)
     VALUES ($1, $2)
     RETURNING *`,
    [token_uuid, expires_at]
  );

  return result.rows[0];
}

export async function validateQRToken(token_uuid: string, user_id: string) {
  const result = await pool.query(
    `UPDATE qr_tokens
     SET used = TRUE, used_by = $2, used_at = NOW()
     WHERE token_uuid = $1
     AND used = FALSE
     AND (expires_at IS NULL OR expires_at > NOW())
     RETURNING *`,
    [token_uuid, user_id]
  );

  if (result.rows.length === 0) {
    throw new Error('Token is invalid, already used, or expired');
  }

  return result.rows[0];
}