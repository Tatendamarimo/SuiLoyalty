import { Router } from 'express';
import type { Response } from 'express';
import pool from '../config/database.js';

const router = Router();

// Helper to check if user has access to a brand
async function getBrandRole(userId: string, brandId: string): Promise<'owner' | 'admin' | 'operator' | null> {
  const result = await pool.query<{ role: 'owner' | 'admin' | 'operator' }>(
    'SELECT role FROM brand_members WHERE user_id = $1 AND brand_id = $2',
    [userId, brandId]
  );
  return result.rows[0]?.role ?? null;
}

/**
 * GET /api/brand/campaigns?brandId=<uuid>
 * List campaigns for a given brand. Requires valid session and brand membership.
 */
router.get('/', async (req: any, res: Response) => {
  try {
    const sessionUserId = req.session?.userId;
    if (!sessionUserId) {
      return res.status(401).json({ success: false, error: 'Sign in first' });
    }

    const { brandId } = req.query;
    if (!brandId) {
      return res.status(400).json({ success: false, error: 'brandId query parameter is required' });
    }

    const role = await getBrandRole(sessionUserId, brandId as string);
    if (!role) {
      return res.status(403).json({ success: false, error: 'Access denied to this brand' });
    }

    const campaigns = await pool.query(
      `SELECT c.*,
         COUNT(qt.id)::int AS total_tokens,
         COUNT(qt.id) FILTER (WHERE qt.used = true)::int AS redeemed_tokens,
         COUNT(qt.id) FILTER (WHERE qt.printed = true)::int AS printed_tokens
       FROM campaigns c
       LEFT JOIN qr_tokens qt ON qt.campaign_id = c.id
       WHERE c.brand_id = $1 AND c.is_archived = FALSE
       GROUP BY c.id
       ORDER BY c.created_at DESC`,
      [brandId]
    );

    res.json({ success: true, campaigns: campaigns.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/brand/campaigns/:id
 * Get a single campaign by ID with stats.
 */
router.get('/:id', async (req: any, res: Response) => {
  try {
    const sessionUserId = req.session?.userId;
    if (!sessionUserId) {
      return res.status(401).json({ success: false, error: 'Sign in first' });
    }

    const { id } = req.params;

    // Get campaign details to resolve brand_id
    const campaignResult = await pool.query(
      'SELECT * FROM campaigns WHERE id = $1',
      [id]
    );
    if (campaignResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }
    const campaign = campaignResult.rows[0];

    const role = await getBrandRole(sessionUserId, campaign.brand_id);
    if (!role) {
      return res.status(403).json({ success: false, error: 'Access denied to this brand' });
    }

    // Load detailed aggregated stats
    const statsResult = await pool.query(
      `SELECT
         COUNT(id)::int AS total_tokens,
         COUNT(id) FILTER (WHERE used = true)::int AS redeemed_tokens,
         COUNT(id) FILTER (WHERE printed = true)::int AS printed_tokens,
         COUNT(id) FILTER (WHERE expires_at IS NOT NULL AND expires_at < NOW() AND used = false)::int AS expired_tokens
       FROM qr_tokens
       WHERE campaign_id = $1`,
      [id]
    );

    res.json({
      success: true,
      campaign,
      stats: statsResult.rows[0]
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/brand/campaigns
 * Create a new campaign.
 */
router.post('/', async (req: any, res: Response) => {
  try {
    const sessionUserId = req.session?.userId;
    if (!sessionUserId) {
      return res.status(401).json({ success: false, error: 'Sign in first' });
    }

    const { name, brandId, points_per_scan, description, expires_hours, starts_at, ends_at } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Campaign name is required' });
    }
    if (!brandId) {
      return res.status(400).json({ success: false, error: 'brandId is required' });
    }

    const role = await getBrandRole(sessionUserId, brandId);
    if (!role || role === 'operator') {
      return res.status(403).json({ success: false, error: 'Requires admin or owner role' });
    }

    // Resolve brand name
    const brandResult = await pool.query('SELECT name FROM brands WHERE id = $1', [brandId]);
    if (brandResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Brand not found' });
    }
    const brandName = brandResult.rows[0].name;

    const result = await pool.query(
      `INSERT INTO campaigns (brand_id, name, brand_name, points_per_scan, description, expires_hours, starts_at, ends_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        brandId,
        name.trim(),
        brandName,
        points_per_scan || 10,
        description?.trim() || null,
        expires_hours || null,
        starts_at || null,
        ends_at || null
      ]
    );

    res.status(201).json({ success: true, campaign: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/brand/campaigns/:id
 * Edit an existing campaign.
 */
router.put('/:id', async (req: any, res: Response) => {
  try {
    const sessionUserId = req.session?.userId;
    if (!sessionUserId) {
      return res.status(401).json({ success: false, error: 'Sign in first' });
    }

    const { id } = req.params;
    const { name, points_per_scan, is_active, description, expires_hours, starts_at, ends_at } = req.body;

    const campaignResult = await pool.query('SELECT brand_id FROM campaigns WHERE id = $1', [id]);
    if (campaignResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }
    const brandId = campaignResult.rows[0].brand_id;

    const role = await getBrandRole(sessionUserId, brandId);
    if (!role || role === 'operator') {
      return res.status(403).json({ success: false, error: 'Requires admin or owner role' });
    }

    const result = await pool.query(
      `UPDATE campaigns
       SET name = COALESCE($1, name),
           points_per_scan = COALESCE($2, points_per_scan),
           is_active = COALESCE($3, is_active),
           description = COALESCE($4, description),
           expires_hours = COALESCE($5, expires_hours),
           starts_at = COALESCE($6, starts_at),
           ends_at = COALESCE($7, ends_at),
           updated_at = NOW()
       WHERE id = $8
       RETURNING *`,
      [
        name?.trim() || null,
        points_per_scan || null,
        is_active !== undefined ? is_active : null,
        description?.trim() || null,
        expires_hours || null,
        starts_at || null,
        ends_at || null,
        id
      ]
    );

    res.json({ success: true, campaign: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/brand/campaigns/:id
 * Soft delete (deactivate) an existing campaign.
 */
router.delete('/:id', async (req: any, res: Response) => {
  try {
    const sessionUserId = req.session?.userId;
    if (!sessionUserId) {
      return res.status(401).json({ success: false, error: 'Sign in first' });
    }

    const { id } = req.params;

    const campaignResult = await pool.query('SELECT brand_id FROM campaigns WHERE id = $1', [id]);
    if (campaignResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }
    const brandId = campaignResult.rows[0].brand_id;

    const role = await getBrandRole(sessionUserId, brandId);
    if (!role || role === 'operator') {
      return res.status(403).json({ success: false, error: 'Requires admin or owner role' });
    }

    const result = await pool.query(
      'UPDATE campaigns SET is_active = false, is_archived = true, updated_at = NOW() WHERE id = $1 RETURNING *',
      [id]
    );

    res.json({ success: true, campaign: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
