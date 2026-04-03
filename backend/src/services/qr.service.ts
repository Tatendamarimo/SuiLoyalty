import { randomUUID } from 'crypto';
import pool from '../config/database.js';

export async function generateQRToken(brand_id?: string, points_value?: number) {
  const token_uuid = randomUUID();

  const result = await pool.query(
    `INSERT INTO qr_tokens (token_uuid, expires_at, brand_id, points_value)
     VALUES ($1, NULL, $2, $3)
     RETURNING *`,
    [token_uuid, brand_id || null, points_value ?? 10]
  );

  return result.rows[0];
}

export async function validateQRToken(token_uuid: string, user_id: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tokenResult = await client.query(
      `UPDATE qr_tokens
       SET used = TRUE, used_by = $2, used_at = NOW()
       WHERE token_uuid = $1
       AND used = FALSE
       AND (expires_at IS NULL OR expires_at > NOW())
       RETURNING *`,
      [token_uuid, user_id]
    );

    if (tokenResult.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new Error('Token is invalid, already used, or expired');
    }

    const token = tokenResult.rows[0];

    if (token.brand_id) {
      const pointsToAdd = token.points_value ?? 10;
      await client.query(
        `INSERT INTO loyalty_cards (on_chain_card_id, user_id, brand_id, points_balance, scan_count)
         VALUES (gen_random_uuid()::text, $1, $2, $3, 1)
         ON CONFLICT (user_id, brand_id) DO UPDATE
         SET points_balance = loyalty_cards.points_balance + $3,
             scan_count = loyalty_cards.scan_count + 1,
             tier = CASE
               WHEN loyalty_cards.points_balance + $3 >= 500 THEN 2
               WHEN loyalty_cards.points_balance + $3 >= 100 THEN 1
               ELSE 0
             END`,
        [user_id, token.brand_id, pointsToAdd]
      );
    }

    await client.query('COMMIT');

    // Return token with brand info
    const fullResult = await pool.query(
      `SELECT qt.*, b.name as brand_name, b.color as brand_color, b.category as brand_category
       FROM qr_tokens qt
       LEFT JOIN brands b ON b.id = qt.brand_id
       WHERE qt.id = $1`,
      [token.id]
    );

    return fullResult.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
