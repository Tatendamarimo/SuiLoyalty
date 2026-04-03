import { randomUUID } from 'crypto';
import pool from '../config/database.js';
import { mintCardOnChain, earnPointsOnChain } from './blockchain.service.js';

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

    // 1. Atomically mark QR as used
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
    await client.query('COMMIT');

    const pointsToAdd = token.points_value ?? 10;
    let txDigest: string | null = null;

    if (token.brand_id) {
      // 2. Check whether this user already has a card for this brand
      const existingCard = await pool.query(
        `SELECT on_chain_card_id FROM loyalty_cards WHERE user_id = $1 AND brand_id = $2`,
        [user_id, token.brand_id]
      );

      let cardObjectId: string;

      if (existingCard.rows.length === 0) {
        // No card yet — mint one on-chain (card goes to backend wallet)
        const userResult = await pool.query(
          `SELECT display_name FROM users WHERE id = $1`,
          [user_id]
        );
        const displayName = userResult.rows[0]?.display_name || 'Customer';
        cardObjectId = await mintCardOnChain(displayName);

        // Insert loyalty card with real on-chain object ID
        await pool.query(
          `INSERT INTO loyalty_cards (on_chain_card_id, user_id, brand_id, points_balance, scan_count, tier)
           VALUES ($1, $2, $3, $4, 1, 0)`,
          [cardObjectId, user_id, token.brand_id, pointsToAdd]
        );
      } else {
        // Card exists — earn points on-chain
        cardObjectId = existingCard.rows[0].on_chain_card_id;
        txDigest = await earnPointsOnChain(cardObjectId, pointsToAdd);

        // Update DB points + tier
        await pool.query(
          `UPDATE loyalty_cards
           SET points_balance = points_balance + $1,
               scan_count     = scan_count + 1,
               tier = CASE
                 WHEN points_balance + $1 >= 500 THEN 2
                 WHEN points_balance + $1 >= 100 THEN 1
                 ELSE 0
               END
           WHERE user_id = $2 AND brand_id = $3`,
          [pointsToAdd, user_id, token.brand_id]
        );
      }
    }

    // Return token enriched with brand info
    const fullResult = await pool.query(
      `SELECT qt.*, b.name as brand_name, b.color as brand_color, b.category as brand_category
       FROM qr_tokens qt
       LEFT JOIN brands b ON b.id = qt.brand_id
       WHERE qt.id = $1`,
      [token.id]
    );

    return { ...fullResult.rows[0], tx_digest: txDigest };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    throw err;
  } finally {
    client.release();
  }
}
