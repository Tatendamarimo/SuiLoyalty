import type { Request, Response, NextFunction } from 'express';
import pool from '../config/database.js';

/**
 * Express request augmented with the authenticated brand operator's identity.
 * Populated by `requireBrandAuth` after session + membership verification.
 */
export interface BrandAuthedRequest extends Request {
  /** Internal users.id of the authenticated operator. */
  userId?: string;
  /** brands.id the operator has access to (resolved from URL param). */
  brandId?: string;
  /** Operator's role within the brand. */
  brandRole?: 'owner' | 'admin' | 'operator';
}

/**
 * Brand-portal authentication middleware (session-based).
 *
 * Reads the operator identity from the server-side session established by
 * POST /api/auth/callback. Then verifies the operator has a row in
 * `brand_members` for the requested brand.
 *
 * Brand id is resolved from the URL parameter `:brand_id`.
 *
 * On success: populates req.userId, req.brandId, req.brandRole.
 * On failure: 401 (not signed in) or 403 (no membership).
 */
export async function requireBrandAuth(
  req: BrandAuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // Check for a valid server-side session
    const sessionUserId = (req.session as any)?.userId;
    if (!sessionUserId) {
      res.status(401).json({ success: false, error: 'Not signed in — please sign in first' });
      return;
    }

    const brandId = req.params.brand_id as string | undefined;
    if (!brandId) {
      res.status(400).json({ success: false, error: 'brand_id URL parameter is required' });
      return;
    }

    // Single query: verify membership and load role
    const lookup = await pool.query<{ role: 'owner' | 'admin' | 'operator' }>(
      `SELECT bm.role
         FROM brand_members bm
        WHERE bm.user_id = $1 AND bm.brand_id = $2`,
      [sessionUserId, brandId],
    );

    if (lookup.rows.length === 0) {
      res.status(403).json({ success: false, error: 'No access to this brand portal' });
      return;
    }

    req.userId = sessionUserId;
    req.brandId = brandId;
    req.brandRole = lookup.rows[0]!.role;
    next();
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Brand auth failed' });
  }
}

/**
 * Returns every brand the signed-in operator has access to.
 * Used by the merchant terminal's brand picker screen.
 * Requires a valid session (checked inline — no middleware needed).
 */
export async function listBrandMemberships(userId: string) {
  const result = await pool.query<{
    brand_id: string;
    brand_name: string;
    brand_color: string;
    brand_category: string | null;
    role: 'owner' | 'admin' | 'operator';
  }>(
    `SELECT b.id AS brand_id, b.name AS brand_name, b.color AS brand_color,
            b.category AS brand_category, bm.role
       FROM brand_members bm
       JOIN brands b ON b.id = bm.brand_id
      WHERE bm.user_id = $1 AND b.is_active = TRUE
      ORDER BY b.name`,
    [userId],
  );
  return result.rows;
}
