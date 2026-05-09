import { Router } from 'express';
import type { Response } from 'express';
import { requireBrandAuth, listBrandMemberships, type BrandAuthedRequest } from '../middleware/brandAuth.js';
import pool from '../config/database.js';
import {
  listPendingForBrand,
  listRecentlyResolvedForBrand,
  markFulfilled,
  markCancelled,
  summariseRedemptionsForBrand,
  getBrandReportData,
} from '../services/redemption.service.js';
import { generateCampaignReportPDF } from '../services/report.service.js';

const router = Router();

/**
 * GET /api/brand/memberships
 * Returns the list of brands the signed-in operator has access to.
 * Used by the merchant terminal to render the brand selector after
 * sign-in. Only the X-Sui-Address header is required.
 */
router.get('/memberships', async (req, res) => {
  try {
    const sessionUserId = (req.session as any)?.userId;
    if (!sessionUserId) {
      return res.status(401).json({ success: false, error: 'Not signed in — please sign in first' });
    }
    const memberships = await listBrandMemberships(sessionUserId);
    res.json({ success: true, memberships });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/brand/:brand_id/redemptions/pending
 * Pending fulfilment queue for the operator's brand.
 */
router.get(
  '/:brand_id/redemptions/pending',
  requireBrandAuth,
  async (req: BrandAuthedRequest, res: Response) => {
    try {
      const rows = await listPendingForBrand(req.brandId!);
      res.json({ success: true, redemptions: rows });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  },
);

/**
 * GET /api/brand/:brand_id/redemptions/recent
 * Last 100 fulfilled or cancelled redemptions for the brand.
 */
router.get(
  '/:brand_id/redemptions/recent',
  requireBrandAuth,
  async (req: BrandAuthedRequest, res: Response) => {
    try {
      const rows = await listRecentlyResolvedForBrand(req.brandId!);
      res.json({ success: true, redemptions: rows });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  },
);

/**
 * POST /api/brand/:brand_id/redemptions/:request_id/fulfil
 * Mark a pending redemption as fulfilled (e.g. barista handed over the drink).
 */
router.post(
  '/:brand_id/redemptions/:request_id/fulfil',
  requireBrandAuth,
  async (req: BrandAuthedRequest, res: Response) => {
    try {
      const { request_id } = req.params as { request_id: string };
      const note = typeof req.body?.note === 'string' ? req.body.note : undefined;
      const updated = await markFulfilled(request_id, req.brandId!, req.userId!, note);
      res.json({ success: true, redemption: updated });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  },
);

/**
 * POST /api/brand/:brand_id/redemptions/:request_id/cancel
 * Cancel a pending redemption and refund points to the customer.
 */
router.post(
  '/:brand_id/redemptions/:request_id/cancel',
  requireBrandAuth,
  async (req: BrandAuthedRequest, res: Response) => {
    try {
      const { request_id } = req.params as { request_id: string };
      const note = typeof req.body?.note === 'string' ? req.body.note : undefined;
      const updated = await markCancelled(request_id, req.brandId!, req.userId!, note);
      res.json({ success: true, redemption: updated });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  },
);

/**
 * GET /api/brand/:brand_id/summary
 * Headline numbers for the dashboard home tile.
 */
router.get(
  '/:brand_id/summary',
  requireBrandAuth,
  async (req: BrandAuthedRequest, res: Response) => {
    try {
      const summary = await summariseRedemptionsForBrand(req.brandId!);
      res.json({ success: true, summary, role: req.brandRole });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  },
);

/**
 * GET /api/brand/:brand_id/report.pdf
 * Printable campaign report PDF — what brand operators want for "how is
 * my campaign performing?" Includes summary stats, redemption metrics,
 * and a code-level activity table. Streams directly to the response.
 */
router.get(
  '/:brand_id/report.pdf',
  requireBrandAuth,
  async (req: BrandAuthedRequest, res: Response) => {
    try {
      const campaign = req.query.campaign as string | undefined;
      await generateCampaignReportPDF(req.brandId!, res, campaign);
    } catch (error: any) {
      // If the PDF stream has already started, we can't reliably send JSON.
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: error.message });
      } else {
        res.end();
      }
    }
  },
);

/**
 * GET /api/brand/:brand_id/report.csv
 * Raw-data CSV export — secondary alternative to the PDF. Useful for
 * spreadsheet analysis. Returns text/csv with a Content-Disposition
 * header so the browser triggers a download dialog.
 */
router.get(
  '/:brand_id/report.csv',
  requireBrandAuth,
  async (req: BrandAuthedRequest, res: Response) => {
    try {
      const campaign = req.query.campaign as string | undefined;
      const rows = await getBrandReportData(req.brandId!, campaign);

      const header = [
        'token_uuid',
        'campaign_name',
        'brand_name',
        'points_value',
        'created_at',
        'printed',
        'used',
        'used_at',
        'used_by_address',
        'status',
      ].join(',');

      const escape = (v: unknown): string => {
        if (v === null || v === undefined) return '';
        const s = String(v);
        // RFC 4180 — wrap in quotes if it contains a comma, quote, or newline.
        if (/[,"\n\r]/.test(s)) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      };

      const statusOf = (r: typeof rows[number]): string => {
        if (r.used) return 'scanned';
        if (r.printed) return 'printed';
        return 'generated';
      };

      const maskUuid = (uuid: string) => {
        const clean = uuid.replace(/-/g, '');
        return `${clean.slice(0, 6)}...${clean.slice(-4)}`;
      };

      const lines = rows.map((r) =>
        [
          maskUuid(r.token_uuid),
          r.campaign_name,
          r.brand_name,
          r.points_value,
          r.created_at,
          r.printed,
          r.used,
          r.used_at,
          r.used_by_address,
          statusOf(r),
        ].map(escape).join(','),
      );

      const csv = [header, ...lines].join('\r\n') + '\r\n';
      const filename = `suiloyalty-campaign-${req.brandId}-${new Date().toISOString().slice(0, 10)}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  },
);

/**
 * GET /api/brand/:brand_id/campaigns
 * Get a list of distinct campaign names for a brand.
 */
router.get(
  '/:brand_id/campaigns',
  requireBrandAuth,
  async (req: BrandAuthedRequest, res: Response) => {
    try {
      const result = await pool.query(
        `SELECT name FROM campaigns WHERE brand_id = $1 ORDER BY name`,
        [req.brandId!]
      );
      res.json({ success: true, campaigns: result.rows.map(r => r.name) });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

export default router;
