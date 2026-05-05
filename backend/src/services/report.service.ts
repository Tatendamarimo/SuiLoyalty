import PDFDocument from 'pdfkit';
import type { Response } from 'express';
import pool from '../config/database.js';
import { getBrandReportData } from './redemption.service.js';

/**
 * Brand-level summary used at the top of the PDF report.
 * Joined with redemption_requests so operators see both the QR-side
 * (printed/scanned) and the spend-side (pending/fulfilled) at a glance.
 */
interface BrandReportSummary {
  brand_name: string;
  brand_color: string;
  brand_category: string;
  total_codes: number;
  printed_codes: number;
  scanned_codes: number;
  outstanding_codes: number;
  scan_rate: number;
  total_points_earned: number;
  pending_redemptions: number;
  fulfilled_redemptions_30d: number;
  points_redeemed_30d: number;
}

async function getBrandReportSummary(brandId: string): Promise<BrandReportSummary> {
  const result = await pool.query<{
    brand_name: string;
    brand_color: string;
    brand_category: string;
    total_codes: string;
    printed_codes: string;
    scanned_codes: string;
    total_points_earned: string;
    pending_redemptions: string;
    fulfilled_redemptions_30d: string;
    points_redeemed_30d: string;
  }>(
    `SELECT
       b.name                                                              AS brand_name,
       b.color                                                             AS brand_color,
       COALESCE(b.category, '')                                            AS brand_category,
       COUNT(q.id)::int                                                    AS total_codes,
       COUNT(q.id) FILTER (WHERE q.printed = TRUE)::int                    AS printed_codes,
       COUNT(q.id) FILTER (WHERE q.used = TRUE)::int                       AS scanned_codes,
       COALESCE(SUM(q.points_value) FILTER (WHERE q.used = TRUE), 0)::int  AS total_points_earned,
       (SELECT COUNT(*) FROM redemption_requests rr
          WHERE rr.brand_id = b.id AND rr.status = 'pending')              AS pending_redemptions,
       (SELECT COUNT(*) FROM redemption_requests rr
          WHERE rr.brand_id = b.id AND rr.status = 'fulfilled'
            AND rr.fulfilled_at > NOW() - INTERVAL '30 days')              AS fulfilled_redemptions_30d,
       (SELECT COALESCE(SUM(points_redeemed), 0) FROM redemption_requests rr
          WHERE rr.brand_id = b.id AND rr.status = 'fulfilled'
            AND rr.fulfilled_at > NOW() - INTERVAL '30 days')              AS points_redeemed_30d
       FROM brands b
       LEFT JOIN qr_tokens q ON q.brand_id = b.id
      WHERE b.id = $1
      GROUP BY b.id`,
    [brandId],
  );

  if (result.rows.length === 0) {
    throw new Error('Brand not found');
  }
  const r = result.rows[0];
  const total = Number(r.total_codes);
  const printed = Number(r.printed_codes);
  const scanned = Number(r.scanned_codes);
  return {
    brand_name: r.brand_name,
    brand_color: r.brand_color || '#6366f1',
    brand_category: r.brand_category,
    total_codes: total,
    printed_codes: printed,
    scanned_codes: scanned,
    outstanding_codes: Math.max(0, printed - scanned),
    scan_rate: printed > 0 ? Math.round((scanned / printed) * 100) : 0,
    total_points_earned: Number(r.total_points_earned),
    pending_redemptions: Number(r.pending_redemptions),
    fulfilled_redemptions_30d: Number(r.fulfilled_redemptions_30d),
    points_redeemed_30d: Number(r.points_redeemed_30d),
  };
}

/** Format an ISO timestamp as "01 May 2026 — 14:32" (UK style, readable in print). */
function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${dd} ${months[d.getMonth()]} ${d.getFullYear()} — ${hh}:${mm}`;
}

/** Truncate a long string to a max length with ellipsis. */
function truncate(s: string, n: number): string {
  if (!s) return '';
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/**
 * Stream a printable campaign report PDF for a brand directly into the
 * Express Response. Designed for A4 portrait, sized for printing without
 * margin clipping. Includes:
 *   - Brand-coloured header bar
 *   - Generation timestamp + filter context
 *   - Four-cell summary block (QR lifecycle metrics + redemption metrics)
 *   - Tabular code list with status, paginated automatically by pdfkit
 *   - Footer with page numbers
 */
export async function generateCampaignReportPDF(brandId: string, res: Response): Promise<void> {
  const summary = await getBrandReportSummary(brandId);
  const rows = await getBrandReportData(brandId);

  const filename = `SuiLoyalty-${summary.brand_name.replace(/[^a-zA-Z0-9]+/g, '_')}-Campaign-${new Date().toISOString().slice(0, 10)}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 60, bottom: 60, left: 50, right: 50 },
    info: {
      Title: `Campaign Report — ${summary.brand_name}`,
      Author: 'SuiLoyalty',
      Subject: 'Brand Campaign Report',
      CreationDate: new Date(),
    },
  });

  doc.pipe(res);

  const PAGE_WIDTH = doc.page.width;
  const LEFT = doc.page.margins.left;
  const RIGHT = PAGE_WIDTH - doc.page.margins.right;
  const CONTENT_W = RIGHT - LEFT;

  // ─── Header bar (brand-coloured ribbon) ─────────────────────────────────────
  doc.rect(0, 0, PAGE_WIDTH, 90).fill(summary.brand_color);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(22)
     .text('Campaign Report', LEFT, 28);
  doc.fillColor('#ffffff').font('Helvetica').fontSize(12)
     .text(summary.brand_name, LEFT, 56);
  doc.fillColor('#ffffff').font('Helvetica').fontSize(9)
     .text('SuiLoyalty', RIGHT - 90, 32, { width: 90, align: 'right' })
     .text(`Generated ${formatDate(new Date().toISOString())}`, RIGHT - 220, 56, { width: 220, align: 'right' });

  doc.fillColor('#000000');

  // ─── Summary cards ──────────────────────────────────────────────────────────
  const summaryTop = 120;
  const cards = [
    { label: 'Total codes',        value: summary.total_codes.toString(),         color: '#475569' },
    { label: 'Printed',            value: summary.printed_codes.toString(),       color: '#6366f1' },
    { label: 'Scanned',            value: summary.scanned_codes.toString(),       color: '#10b981' },
    { label: 'Scan rate',          value: `${summary.scan_rate}%`,                color: '#ec4899' },
  ];

  const cardW = (CONTENT_W - 12 * 3) / 4;
  cards.forEach((c, i) => {
    const x = LEFT + i * (cardW + 12);
    doc.roundedRect(x, summaryTop, cardW, 60, 6).fillAndStroke('#f8fafc', '#e2e8f0');
    doc.fillColor(c.color).font('Helvetica-Bold').fontSize(20)
       .text(c.value, x + 12, summaryTop + 12, { width: cardW - 24 });
    doc.fillColor('#64748b').font('Helvetica').fontSize(8)
       .text(c.label.toUpperCase(), x + 12, summaryTop + 38, { width: cardW - 24, characterSpacing: 0.5 });
  });

  // Second row of summary — redemption side
  const redemptionTop = summaryTop + 76;
  const redemptionCards = [
    { label: 'Pending redemptions',     value: summary.pending_redemptions.toString(),         color: '#f59e0b' },
    { label: 'Fulfilled (30d)',         value: summary.fulfilled_redemptions_30d.toString(),   color: '#0ea5e9' },
    { label: 'Points earned (lifetime)', value: summary.total_points_earned.toLocaleString(),   color: '#22c55e' },
    { label: 'Points redeemed (30d)',   value: summary.points_redeemed_30d.toLocaleString(),   color: '#a855f7' },
  ];
  redemptionCards.forEach((c, i) => {
    const x = LEFT + i * (cardW + 12);
    doc.roundedRect(x, redemptionTop, cardW, 60, 6).fillAndStroke('#f8fafc', '#e2e8f0');
    doc.fillColor(c.color).font('Helvetica-Bold').fontSize(18)
       .text(c.value, x + 12, redemptionTop + 14, { width: cardW - 24 });
    doc.fillColor('#64748b').font('Helvetica').fontSize(7.5)
       .text(c.label.toUpperCase(), x + 12, redemptionTop + 38, { width: cardW - 24, characterSpacing: 0.5 });
  });

  // ─── Table heading ──────────────────────────────────────────────────────────
  let y = redemptionTop + 88;
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(13)
     .text('Code Activity', LEFT, y);
  y += 22;

  // Table column layout — widths sum to CONTENT_W
  const cols = [
    { header: 'Token',       width: 70 },
    { header: 'Campaign',    width: 90 },
    { header: 'Created',     width: 80  },
    { header: 'Pts',         width: 35  },
    { header: 'Status',      width: 55  },
    { header: 'Scanned',     width: 80  },
    { header: 'Scanner',     width: CONTENT_W - 70 - 90 - 80 - 35 - 55 - 80 },
  ];

  const drawRowBorder = (yy: number) => {
    doc.moveTo(LEFT, yy).lineTo(RIGHT, yy).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
  };

  const drawHeaderRow = (yy: number) => {
    doc.rect(LEFT, yy, CONTENT_W, 22).fill('#f1f5f9');
    doc.fillColor('#475569').font('Helvetica-Bold').fontSize(8.5);
    let x = LEFT + 8;
    cols.forEach((c) => {
      doc.text(c.header.toUpperCase(), x, yy + 7, { width: c.width - 8, characterSpacing: 0.4 });
      x += c.width;
    });
    doc.fillColor('#0f172a');
  };

  drawHeaderRow(y);
  y += 22;
  drawRowBorder(y);

  doc.font('Helvetica').fontSize(8.5);

  const statusOf = (r: typeof rows[number]): { label: string; color: string } => {
    if (r.used)    return { label: 'Scanned',   color: '#10b981' };
    if (r.printed) return { label: 'Printed',   color: '#6366f1' };
    return                  { label: 'Generated', color: '#94a3b8' };
  };

  const ROW_HEIGHT = 18;
  const PAGE_BOTTOM = doc.page.height - doc.page.margins.bottom - 30;

  rows.forEach((row) => {
    if (y + ROW_HEIGHT > PAGE_BOTTOM) {
      doc.addPage();
      y = doc.page.margins.top;
      drawHeaderRow(y);
      y += 22;
      drawRowBorder(y);
      doc.font('Helvetica').fontSize(8.5);
    }

    const s = statusOf(row);
    let x = LEFT + 8;

    doc.fillColor('#0f172a').text(truncate(row.token_uuid.replace(/-/g, ''), 10), x, y + 5, { width: cols[0].width - 8 });
    x += cols[0].width;

    doc.fillColor('#475569').text(truncate(row.campaign_name || 'General', 18), x, y + 5, { width: cols[1].width - 8 });
    x += cols[1].width;

    doc.fillColor('#475569').text(formatDate(row.created_at).split(' —')[0], x, y + 5, { width: cols[2].width - 8 });
    x += cols[2].width;

    doc.fillColor('#0f172a').text(row.points_value.toString(), x, y + 5, { width: cols[3].width - 8 });
    x += cols[3].width;

    doc.fillColor(s.color).text(s.label, x, y + 5, { width: cols[4].width - 8 });
    x += cols[4].width;

    doc.fillColor('#475569').text(row.used_at ? formatDate(row.used_at).split(' —')[0] : '—', x, y + 5, { width: cols[5].width - 8 });
    x += cols[5].width;

    const scanner = row.used_by_address
      ? `${row.used_by_address.slice(0, 6)}…${row.used_by_address.slice(-4)}`
      : '—';
    doc.fillColor('#475569').text(scanner, x, y + 5, { width: cols[6].width - 8 });

    y += ROW_HEIGHT;
    drawRowBorder(y);
  });

  if (rows.length === 0) {
    doc.fillColor('#94a3b8').font('Helvetica-Oblique').fontSize(10)
       .text('No QR codes generated for this brand yet.', LEFT, y + 14, { width: CONTENT_W, align: 'center' });
  }

  // ─── Footer with page numbers ───────────────────────────────────────────────
  const pageRange = doc.bufferedPageRange();
  for (let i = 0; i < pageRange.count; i++) {
    doc.switchToPage(pageRange.start + i);
    doc.fillColor('#94a3b8').font('Helvetica').fontSize(8);
    doc.text(
      `SuiLoyalty Campaign Report · ${summary.brand_name} · Page ${i + 1} of ${pageRange.count}`,
      LEFT,
      doc.page.height - 40,
      { width: CONTENT_W, align: 'center' },
    );
  }

  doc.end();
}
