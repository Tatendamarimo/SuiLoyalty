import { randomUUID } from 'crypto';
import pool from '../config/database.js';
import { mintAvatarOnChain, addBrandToAvatarOnChain, addBrandPointsOnChain } from './blockchain.service.js';

// Generates a cryptographically secure token (UUID v4) to prevent enumeration attacks.
export async function generateQRToken(brand_id?: string, points_value?: number, campaign_name?: string, expires_in_days?: number) {
  const token_uuid = randomUUID();
  
  let expiresAt: Date | null = null;
  if (expires_in_days && expires_in_days > 0) {
    expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expires_in_days);
  }

  const result = await pool.query(
    `INSERT INTO qr_tokens (token_uuid, expires_at, brand_id, points_value, campaign_name)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [token_uuid, expiresAt, brand_id || null, points_value ?? 10, campaign_name || 'General Campaign']
  );

  return result.rows[0];
}

// Validates token scanned by user. Uses atomic transactions to prevent double-spend attacks.
export async function validateQRToken(token_uuid: string, user_id: string) {
  const client = await pool.connect();
  try {
    // Begin transaction block to ensure atomic operations and data integrity
    await client.query('BEGIN');

    // Claim the token atomically using an UPDATE lock to prevent race conditions (double-scan)
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
    await client.query('COMMIT'); // Commit early to minimize transaction lock duration

    const pointsToAdd = token.points_value ?? 10;
    let txDigest: string | null = null;

    if (token.brand_id) {
      const brandResult = await pool.query(
        `SELECT name FROM brands WHERE id = $1`,
        [token.brand_id]
      );
      const brandName: string = brandResult.rows[0]?.name || 'Unknown Brand';

      let nodeId: string | null = null;

      // Check if user already has an on-chain avatar to maintain referential integrity off-chain
      const existingAvatar = await pool.query(
        `SELECT on_chain_avatar_id FROM loyalty_avatars WHERE user_id = $1`,
        [user_id]
      );

      let avatarObjectId: string;

      if (existingAvatar.rows.length === 0) {
        const userResult = await pool.query(
          `SELECT display_name, wallet_address FROM users WHERE id = $1`,
          [user_id]
        );
        const displayName = userResult.rows[0]?.display_name || 'Customer';
        const walletAddress = userResult.rows[0]?.wallet_address;

        if (!walletAddress) {
          throw new Error('Unable to mint avatar: User has no wallet address');
        }

        // Lazy-mint the avatar on-chain on first scan to optimize gas costs
        avatarObjectId = await mintAvatarOnChain(displayName, walletAddress);

        await pool.query(
          `INSERT INTO loyalty_avatars (on_chain_avatar_id, user_id)
           VALUES ($1, $2)`,
          [avatarObjectId, user_id]
        );

        await addBrandToAvatarOnChain(avatarObjectId, brandName);

        const newNode = await pool.query(
          `INSERT INTO loyalty_brand_nodes (user_id, brand_id, brand_name, points_balance, scan_count, tier)
           VALUES ($1, $2, $3, $4, 1, 0)
           RETURNING id`,
          [user_id, token.brand_id, brandName, pointsToAdd]
        );
        nodeId = newNode.rows[0].id;

        txDigest = await addBrandPointsOnChain(avatarObjectId, brandName, pointsToAdd);

      } else {
        avatarObjectId = existingAvatar.rows[0].on_chain_avatar_id;

        const existingBrandNode = await pool.query(
          `SELECT id FROM loyalty_brand_nodes WHERE user_id = $1 AND brand_id = $2`,
          [user_id, token.brand_id]
        );

        if (existingBrandNode.rows.length === 0) {
          await addBrandToAvatarOnChain(avatarObjectId, brandName);

          const newNode = await pool.query(
            `INSERT INTO loyalty_brand_nodes (user_id, brand_id, brand_name, points_balance, scan_count, tier)
             VALUES ($1, $2, $3, $4, 1, 0)
             RETURNING id`,
            [user_id, token.brand_id, brandName, pointsToAdd]
          );
          nodeId = newNode.rows[0].id;
        } else {
          nodeId = existingBrandNode.rows[0].id;
          await pool.query(
            `UPDATE loyalty_brand_nodes
             SET points_balance = points_balance + $1,
                 scan_count     = scan_count + 1,
                 tier = CASE
                   WHEN points_balance + $1 >= 1000 THEN 2
                   WHEN points_balance + $1 >= 500 THEN 1
                   ELSE 0
                 END
             WHERE user_id = $2 AND brand_id = $3`,
            [pointsToAdd, user_id, token.brand_id]
          );
        }

        txDigest = await addBrandPointsOnChain(avatarObjectId, brandName, pointsToAdd);
      }

      // Log the transaction in the off-chain audit table for reporting and dashboard synchronization
      if (nodeId && txDigest) {
        await pool.query(
          `INSERT INTO point_transactions (node_id, points_added, sui_tx_digest)
           VALUES ($1, $2, $3)`,
          [nodeId, pointsToAdd, txDigest]
        );
      }
    }

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
