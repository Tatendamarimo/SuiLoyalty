import pool from '../config/database.js';

/**
 * A row in `redemption_requests` — the canonical record of one
 * customer asking to spend points for a reward.
 */
export interface RedemptionRequest {
  id: string;
  user_id: string;
  brand_id: string;
  points_redeemed: number;
  reward_name: string;
  status: 'pending' | 'fulfilled' | 'cancelled';
  created_at: string;
  fulfilled_at: string | null;
  fulfilled_by: string | null;
  fulfilled_note: string | null;
}

/**
 * Joined view of a pending request with the customer's wallet/display name
 * and the brand's display fields. What the brand-operator dashboard renders
 * in its "Pending Redemptions" panel.
 */
export interface PendingRedemption {
  id: string;
  brand_id: string;
  brand_name: string;
  brand_color: string;
  user_id: string;
  customer_wallet: string;
  customer_display_name: string | null;
  points_redeemed: number;
  reward_name: string;
  created_at: string;
}

/**
 * Create a pending redemption request when a customer redeems points
 * on the consumer dashboard. Atomically:
 *   1. Locks the customer's loyalty_brand_nodes row
 *   2. Verifies sufficient balance
 *   3. Deducts the points
 *   4. Inserts a pending redemption_requests row
 *
 * Returns the new request. Both the deduction and the queue insertion
 * happen in one transaction so they can never disagree.
 */
export async function createRedemptionRequest(
  userId: string,
  brandId: string,
  pointsToRedeem: number,
  rewardName: string,
): Promise<RedemptionRequest> {
  if (pointsToRedeem <= 0) {
    throw new Error('points_to_redeem must be positive');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const nodeResult = await client.query<{ id: string; points_balance: string }>(
      `SELECT id, points_balance FROM loyalty_brand_nodes
       WHERE user_id = $1 AND brand_id = $2 FOR UPDATE`,
      [userId, brandId],
    );
    if (nodeResult.rows.length === 0) {
      throw new Error('No loyalty card for this brand — earn points first');
    }
    const node = nodeResult.rows[0];
    if (Number(node.points_balance) < pointsToRedeem) {
      throw new Error('Insufficient points');
    }

    await client.query(
      `UPDATE loyalty_brand_nodes
       SET points_balance = points_balance - $1
       WHERE id = $2`,
      [pointsToRedeem, node.id],
    );

    const insertResult = await client.query<RedemptionRequest>(
      `INSERT INTO redemption_requests (user_id, brand_id, points_redeemed, reward_name)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [userId, brandId, pointsToRedeem, rewardName],
    );

    await client.query('COMMIT');
    return insertResult.rows[0];
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* swallow */ }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Return the pending fulfilment queue for one brand, oldest first.
 * Backed by the `pending_redemptions_view` created in migration 004.
 */
export async function listPendingForBrand(brandId: string): Promise<PendingRedemption[]> {
  const result = await pool.query<PendingRedemption>(
    `SELECT * FROM pending_redemptions_view WHERE brand_id = $1`,
    [brandId],
  );
  return result.rows;
}

/**
 * Return historical (non-pending) redemptions for a brand — useful for the
 * "recently fulfilled" view in the dashboard. Limited to the last 100.
 */
export async function listRecentlyResolvedForBrand(brandId: string): Promise<RedemptionRequest[]> {
  const result = await pool.query<RedemptionRequest>(
    `SELECT * FROM redemption_requests
     WHERE brand_id = $1 AND status <> 'pending'
     ORDER BY COALESCE(fulfilled_at, created_at) DESC
     LIMIT 100`,
    [brandId],
  );
  return result.rows;
}

/**
 * Mark a pending request as fulfilled. The brand-id guard prevents one
 * brand from acting on another brand's queue. The status guard prevents
 * double-fulfilment of the same request.
 */
export async function markFulfilled(
  requestId: string,
  brandId: string,
  fulfilledByUserId: string,
  note?: string,
): Promise<RedemptionRequest> {
  const result = await pool.query<RedemptionRequest>(
    `UPDATE redemption_requests
     SET status = 'fulfilled',
         fulfilled_at = NOW(),
         fulfilled_by = $3,
         fulfilled_note = $4
     WHERE id = $1
       AND brand_id = $2
       AND status = 'pending'
     RETURNING *`,
    [requestId, brandId, fulfilledByUserId, note ?? null],
  );
  if (result.rows.length === 0) {
    throw new Error('Redemption not found, already resolved, or belongs to a different brand');
  }
  return result.rows[0];
}

/**
 * Cancel a pending request and refund the points to the customer's
 * loyalty_brand_nodes row. Both the status flip and the points refund
 * happen in one transaction.
 */
export async function markCancelled(
  requestId: string,
  brandId: string,
  cancelledByUserId: string,
  note?: string,
): Promise<RedemptionRequest> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const updateResult = await client.query<RedemptionRequest>(
      `UPDATE redemption_requests
       SET status = 'cancelled',
           fulfilled_at = NOW(),
           fulfilled_by = $3,
           fulfilled_note = $4
       WHERE id = $1 AND brand_id = $2 AND status = 'pending'
       RETURNING *`,
      [requestId, brandId, cancelledByUserId, note ?? null],
    );
    if (updateResult.rows.length === 0) {
      throw new Error('Redemption not found, already resolved, or belongs to a different brand');
    }
    const request = updateResult.rows[0];

    await client.query(
      `UPDATE loyalty_brand_nodes
       SET points_balance = points_balance + $1
       WHERE user_id = $2 AND brand_id = $3`,
      [request.points_redeemed, request.user_id, request.brand_id],
    );

    await client.query('COMMIT');
    return request;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* swallow */ }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Aggregate metrics for the brand-portal home tile: counts of pending,
 * fulfilled, and cancelled requests in the last 30 days. One round-trip.
 */
export async function summariseRedemptionsForBrand(brandId: string): Promise<{
  pending: number;
  fulfilled_30d: number;
  cancelled_30d: number;
  points_redeemed_30d: number;
}> {
  const result = await pool.query<{
    pending: string;
    fulfilled_30d: string;
    cancelled_30d: string;
    points_redeemed_30d: string;
  }>(
    `SELECT
        COUNT(*) FILTER (WHERE status = 'pending')                                   AS pending,
        COUNT(*) FILTER (WHERE status = 'fulfilled' AND fulfilled_at > NOW() - INTERVAL '30 days') AS fulfilled_30d,
        COUNT(*) FILTER (WHERE status = 'cancelled' AND fulfilled_at > NOW() - INTERVAL '30 days') AS cancelled_30d,
        COALESCE(SUM(points_redeemed) FILTER (WHERE status = 'fulfilled' AND fulfilled_at > NOW() - INTERVAL '30 days'), 0) AS points_redeemed_30d
       FROM redemption_requests
      WHERE brand_id = $1`,
    [brandId],
  );
  const r = result.rows[0];
  return {
    pending: Number(r.pending),
    fulfilled_30d: Number(r.fulfilled_30d),
    cancelled_30d: Number(r.cancelled_30d),
    points_redeemed_30d: Number(r.points_redeemed_30d),
  };
}

/**
 * One row of the brand campaign report — every QR token issued for
 * the brand, with its scan and redemption metadata.
 */
export interface CampaignReportRow {
  token_uuid: string;
  points_value: number;
  created_at: string;
  printed: boolean;
  used: boolean;
  used_at: string | null;
  used_by_address: string | null;
  brand_name: string;
  campaign_name: string;
}

/**
 * Return all QR tokens for a brand with their lifecycle state, ready
 * to be CSV-encoded by the route handler. The JOIN to users uses
 * LEFT JOIN so unredeemed tokens still appear.
 */
export async function getBrandReportData(brandId: string, campaignName?: string): Promise<CampaignReportRow[]> {
  const query = `
    SELECT q.token_uuid, q.campaign_name, q.points_value, q.created_at, q.printed,
           q.used, q.used_at, u.wallet_address AS used_by_address,
           b.name AS brand_name
      FROM qr_tokens q
      LEFT JOIN users  u ON u.id = q.used_by
      LEFT JOIN brands b ON b.id = q.brand_id
     WHERE q.brand_id = $1 ${campaignName ? 'AND q.campaign_name = $2' : ''}
     ORDER BY q.created_at DESC
  `;
  const params: any[] = [brandId];
  if (campaignName) params.push(campaignName);
  
  const result = await pool.query<CampaignReportRow>(query, params);
  return result.rows;
}
