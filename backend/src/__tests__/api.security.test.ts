/**
 * Integration tests for API security — Sprint 4
 *
 * HTTP-level tests for input validation, UUID format enforcement,
 * and endpoint error handling. No live DB or blockchain needed.
 */

import { jest, describe, it, expect, beforeAll } from '@jest/globals';
import express, { type Application } from 'express';
import request from 'supertest';

// ── Mock all external dependencies before any routes load ─────────────────────

const mockPoolQuery = jest.fn<(...args: unknown[]) => Promise<{ rows: unknown[] }>>();

jest.unstable_mockModule('../config/database.js', () => ({
  default: {
    query:   mockPoolQuery,
    connect: jest.fn(() => Promise.resolve({ query: jest.fn(), release: jest.fn() })),
  },
}));

jest.unstable_mockModule('../services/blockchain.service.js', () => ({
  mintAvatarOnChain:       jest.fn(),
  addBrandToAvatarOnChain: jest.fn(),
  addBrandPointsOnChain:   jest.fn(),
}));

jest.unstable_mockModule('../services/nft.service.js', () => ({
  getLoyaltyAvatar: jest.fn(),
}));

// ── Build app after mocks ─────────────────────────────────────────────────────

let app: Application;

beforeAll(async () => {
  app = express();
  app.use(express.json());

  const { default: qrRouter } = await import('../routes/qr.routes.js');
  app.use('/api/qr', qrRouter);

  // Replicate the UUID validation logic from server.ts for security tests
  app.post('/api/validate-strict', (req, res) => {
    const { token_uuid, user_id } = req.body as { token_uuid?: string; user_id?: string };
    if (!token_uuid || !user_id) {
      return res.status(400).json({ success: false, error: 'token_uuid and user_id are required' });
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(token_uuid)) {
      return res.status(400).json({ success: false, error: 'Invalid QR code. Please scan a SuiLoyalty QR code.' });
    }
    return res.json({ success: true });
  });
});

// ── /api/qr/generate ─────────────────────────────────────────────────────────

describe('POST /api/qr/generate', () => {
  it('returns 201 on success', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: 1, token_uuid: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', points_value: 10 }],
    });

    const res = await request(app).post('/api/qr/generate').send({});
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('returns 500 when DB throws', async () => {
    mockPoolQuery.mockRejectedValueOnce(new Error('DB down'));

    const res = await request(app).post('/api/qr/generate').send({});
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

// ── /api/qr/validate ─────────────────────────────────────────────────────────

describe('POST /api/qr/validate', () => {
  it('returns 400 when token_uuid is missing', async () => {
    const res = await request(app)
      .post('/api/qr/validate')
      .send({ user_id: 'user-123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('token_uuid');
  });

  it('returns 400 when user_id is missing', async () => {
    const res = await request(app)
      .post('/api/qr/validate')
      .send({ token_uuid: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('user_id');
  });
});

// ── UUID format validation ────────────────────────────────────────────────────

describe('UUID format validation (injection & replay guard)', () => {
  const validUUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

  it('accepts a well-formed UUID', async () => {
    const res = await request(app)
      .post('/api/validate-strict')
      .send({ token_uuid: validUUID, user_id: 'u1' });
    expect(res.status).toBe(200);
  });

  it('rejects a SQL injection attempt', async () => {
    const res = await request(app)
      .post('/api/validate-strict')
      .send({ token_uuid: "'; DROP TABLE qr_tokens; --", user_id: 'u1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid QR code');
  });

  it('rejects a plain non-UUID string', async () => {
    const res = await request(app)
      .post('/api/validate-strict')
      .send({ token_uuid: 'not-a-uuid', user_id: 'u1' });
    expect(res.status).toBe(400);
  });

  it('rejects an empty token_uuid', async () => {
    const res = await request(app)
      .post('/api/validate-strict')
      .send({ token_uuid: '', user_id: 'u1' });
    expect(res.status).toBe(400);
  });

  it('rejects a UUID with extra characters appended', async () => {
    const res = await request(app)
      .post('/api/validate-strict')
      .send({ token_uuid: `${validUUID}extra`, user_id: 'u1' });
    expect(res.status).toBe(400);
  });
});

// ── Body edge cases ───────────────────────────────────────────────────────────

describe('Request body edge cases', () => {
  it('returns 400 for empty body on /validate', async () => {
    const res = await request(app)
      .post('/api/qr/validate')
      .set('Content-Type', 'application/json')
      .send('{}');
    expect(res.status).toBe(400);
  });
});
