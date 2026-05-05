import { randomUUID } from 'crypto';
import pool from '../config/database.js';
import { mintAvatarOnChain, addBrandToAvatarOnChain, addBrandPointsOnChain } from './blockchain.service.js';

/**
 * Generates a new unique QR token to be scanned by a user.
 * Tokens are stored in the database and can optionally be tied to a specific brand or points value.
 *
 * @param brand_id - (Optional) The UUID of the brand issuing the QR code.
 * @param points_value - (Optional) The number of points this scan will award (defaults to 10).
 * @returns The newly created QR token record.
 */
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

/**
 * Validates a scanned QR token. If valid, marks it as used and awards loyalty points to the user.
 *
 * Flow:
 * 1. Atomically marks the QR token as used (prevents double-spend).
 * 2. Checks if the user has a LoyaltyAvatar — mints one on-chain if not.
 * 3. Checks if the user's avatar has a BrandNode for this brand — creates one if not.
 * 4. Calls add_brand_points on-chain to award points to that brand node.
 * 5. Updates the database to mirror the on-chain state.
 *
 * @param token_uuid - The unique UUID of the scanned QR token.
 * @param user_id - The internal DB user ID of the person scanning the code.
 * @returns An object containing the token details, enriched brand info, and the blockchain tx digest.
 * @throws Error if the token is invalid, already used, or expired.
 */
export async function validateQRToken(token_uuid: string, user_id: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Atomically mark QR as used to prevent double-spend
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
      // 2. Look up brand name for the brand ID
      const brandResult = await pool.query(
        `SELECT name FROM brands WHERE id = $1`,
        [token.brand_id]
      );
      const brandName: string = brandResult.rows[0]?.name || 'Unknown Brand';

      // Track the brand node id so we can record the earn event in point_transactions
      // after the on-chain call succeeds. Without this, the dashboard's transaction
      // history and points-over-time chart will read from an empty table.
      let nodeId: string | null = null;

      // 3. Check if user has a LoyaltyAvatar
      const existingAvatar = await pool.query(
        `SELECT on_chain_avatar_id FROM loyalty_avatars WHERE user_id = $1`,
        [user_id]
      );

      let avatarObjectId: string;

      if (existingAvatar.rows.length === 0) {
        // No avatar yet — mint one on-chain
        const userResult = await pool.query(
          `SELECT display_name, wallet_address FROM users WHERE id = $1`,
          [user_id]
        );
        const displayName = userResult.rows[0]?.display_name || 'Customer';
        const walletAddress = userResult.rows[0]?.wallet_address;

        if (!walletAddress) {
          throw new Error('Unable to mint avatar: User has no wallet address');
        }

        avatarObjectId = await mintAvatarOnChain(displayName, walletAddress);

        // Record the avatar in the database
        await pool.query(
          `INSERT INTO loyalty_avatars (on_chain_avatar_id, user_id)
           VALUES ($1, $2)`,
          [avatarObjectId, user_id]
        );

        // Add the brand node to the new avatar
        await addBrandToAvatarOnChain(avatarObjectId, brandName);

        // Record the brand relationship — capture id for the audit-log INSERT below.
        const newNode = await pool.query(
          `INSERT INTO loyalty_brand_nodes (user_id, brand_id, brand_name, points_balance, scan_count, tier)
           VALUES ($1, $2, $3, $4, 1, 0)
           RETURNING id`,
          [user_id, token.brand_id, brandName, pointsToAdd]
        );
        nodeId = newNode.rows[0].id;

        // Award initial points to the brand node
        txDigest = await addBrandPointsOnChain(avatarObjectId, brandName, pointsToAdd);

      } else {
        // Avatar exists — check if brand node exists
        avatarObjectId = existingAvatar.rows[0].on_chain_avatar_id;

        const existingBrandNode = await pool.query(
          `SELECT id FROM loyalty_brand_nodes WHERE user_id = $1 AND brand_id = $2`,
          [user_id, token.brand_id]
        );

        if (existingBrandNode.rows.length === 0) {
          // Brand node doesn't exist yet — add it on-chain first
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
          // Brand node exists — just update points
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

        // Award points on-chain for the brand
        txDigest = await addBrandPointsOnChain(avatarObjectId, brandName, pointsToAdd);
      }

      // Record this earn event in the off-chain audit log. The dashboard transaction
      // history, points-over-time chart, and Recent Activity feed all read from
      // point_transactions — without this row they appear empty even after a successful scan.
      if (nodeId && txDigest) {
        await pool.query(
          `INSERT INTO point_transactions (node_id, points_added, sui_tx_digest)
           VALUES ($1, $2, $3)`,
          [nodeId, pointsToAdd, txDigest]
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
