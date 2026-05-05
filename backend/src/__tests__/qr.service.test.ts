/**
 * Unit tests for qr.service.ts
 * Sprint 4 — QR replay prevention & security validation
 *
 * Uses jest.unstable_mockModule (ESM-safe) so mocks are applied before
 * the service module loads. No live Postgres or Sui node required.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ── Mock pg pool ──────────────────────────────────────────────────────────────
// pool.query  → used by generateQRToken directly
// pool.connect → returns a client used by validateQRToken

const mockPoolQuery    = jest.fn<(...args: unknown[]) => Promise<{ rows: unknown[] }>>();
const mockClientQuery  = jest.fn<(...args: unknown[]) => Promise<{ rows: unknown[] }>>();
const mockClientRelease = jest.fn<() => void>();

jest.unstable_mockModule('../config/database.js', () => ({
  default: {
    query: mockPoolQuery,
    connect: jest.fn(() =>
      Promise.resolve({
        query:   mockClientQuery,
        release: mockClientRelease,
      })
    ),
  },
}));

// ── Mock blockchain service ───────────────────────────────────────────────────

const mockMintAvatar = jest.fn<(displayName: string, recipientAddress: string) => Promise<string>>();
const mockAddBrand   = jest.fn<(avatarObjectId: string, brandName: string) => Promise<string>>();
const mockAddPoints  = jest.fn<(avatarObjectId: string, brandName: string, points: number) => Promise<string>>();

jest.unstable_mockModule('../services/blockchain.service.js', () => ({
  mintAvatarOnChain:       mockMintAvatar,
  addBrandToAvatarOnChain: mockAddBrand,
  addBrandPointsOnChain:   mockAddPoints,
}));

// ── Dynamic import (must come AFTER unstable_mockModule) ──────────────────────

const { generateQRToken, validateQRToken } = await import('../services/qr.service.js');

// ── constants ─────────────────────────────────────────────────────────────────

const VALID_UUID    = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const USED_UUID     = 'deadbeef-dead-beef-dead-beefdeadbeef';
const USER_ID       = 'a0000000-0000-0000-0000-000000000001';   // valid uuid
const BRAND_ID      = 'b0000000-0000-0000-0000-000000000002';
const AVATAR_OBJ_ID = '0xabc123';

beforeEach(() => {
  jest.clearAllMocks();
});

// ── generateQRToken ───────────────────────────────────────────────────────────

describe('generateQRToken', () => {
  it('inserts a row and returns the created token', async () => {
    const fakeToken = { id: 1, token_uuid: VALID_UUID, points_value: 10, used: false };
    mockPoolQuery.mockResolvedValueOnce({ rows: [fakeToken] });

    const result = await generateQRToken();

    expect(mockPoolQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockPoolQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO qr_tokens');
    expect(params[1]).toBeNull();   // no brand_id
    expect(params[2]).toBe(10);     // default points
    expect(result).toEqual(fakeToken);
  });

  it('passes brand_id and points_value when provided', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 2, token_uuid: VALID_UUID, points_value: 50 }] });

    await generateQRToken(BRAND_ID, 50);

    const [, params] = mockPoolQuery.mock.calls[0] as [string, unknown[]];
    expect(params[1]).toBe(BRAND_ID);
    expect(params[2]).toBe(50);
  });
});

// ── validateQRToken — replay prevention ───────────────────────────────────────

describe('validateQRToken — replay prevention', () => {
  it('rejects a token that is already used (UPDATE returns 0 rows)', async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })   // BEGIN
      .mockResolvedValueOnce({ rows: [] })   // UPDATE → 0 rows (already used)
      .mockResolvedValueOnce({ rows: [] });  // ROLLBACK

    await expect(validateQRToken(USED_UUID, USER_ID)).rejects.toThrow(
      'Token is invalid, already used, or expired'
    );
  });

  it('atomic UPDATE SQL contains the double-spend guard (used = FALSE)', async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })  // BEGIN
      .mockResolvedValueOnce({ rows: [] })  // UPDATE → 0 rows
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    try { await validateQRToken(VALID_UUID, USER_ID); } catch {}

    const calls = mockClientQuery.mock.calls as [string, unknown[]][];
    const updateCall = calls.find(([sql]) => sql.includes('UPDATE qr_tokens'));
    expect(updateCall).toBeDefined();
    const [sql] = updateCall!;
    expect(sql).toContain('used = FALSE');
    expect(sql).toContain('expires_at IS NULL OR expires_at > NOW()');
  });
});

// ── validateQRToken — no brand ────────────────────────────────────────────────

describe('validateQRToken — valid token without brand', () => {
  it('returns null tx_digest when brand_id is null', async () => {
    const fakeToken = { id: 99, token_uuid: VALID_UUID, brand_id: null, points_value: 10 };
    const fullRow   = { ...fakeToken, brand_name: null, tx_digest: null };

    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })            // BEGIN
      .mockResolvedValueOnce({ rows: [fakeToken] })   // UPDATE
      .mockResolvedValueOnce({ rows: [] });            // COMMIT

    mockPoolQuery.mockResolvedValueOnce({ rows: [fullRow] }); // final SELECT

    const result = await validateQRToken(VALID_UUID, USER_ID);
    expect(result.tx_digest).toBeNull();
    expect(result.brand_name).toBeNull();
  });
});

// ── validateQRToken — new user with brand ────────────────────────────────────

describe('validateQRToken — new user with brand', () => {
  it('mints avatar, adds brand, and awards points on-chain', async () => {
    const fakeToken = { id: 7, token_uuid: VALID_UUID, brand_id: BRAND_ID, points_value: 25 };

    mockMintAvatar.mockResolvedValueOnce(AVATAR_OBJ_ID);
    mockAddBrand.mockResolvedValueOnce('tx-add-brand');
    mockAddPoints.mockResolvedValueOnce('tx-add-points');

    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })             // BEGIN
      .mockResolvedValueOnce({ rows: [fakeToken] })    // UPDATE
      .mockResolvedValueOnce({ rows: [] });             // COMMIT

    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ name: 'Nike' }] })                                     // brand lookup
      .mockResolvedValueOnce({ rows: [] })                                                      // no avatar yet
      .mockResolvedValueOnce({ rows: [{ display_name: 'Alice', wallet_address: '0xabc' }] })   // user info
      .mockResolvedValueOnce({ rows: [] })                                                      // INSERT avatars
      .mockResolvedValueOnce({ rows: [{ id: 'node-1' }] })                                      // INSERT brand_nodes RETURNING id
      .mockResolvedValueOnce({ rows: [] })                                                      // INSERT point_transactions
      .mockResolvedValueOnce({ rows: [{ ...fakeToken, brand_name: 'Nike', tx_digest: 'tx-add-points' }] }); // final SELECT

    const result = await validateQRToken(VALID_UUID, USER_ID);

    expect(mockMintAvatar).toHaveBeenCalledTimes(1);
    expect(mockAddBrand).toHaveBeenCalledWith(AVATAR_OBJ_ID, 'Nike');
    expect(mockAddPoints).toHaveBeenCalledWith(AVATAR_OBJ_ID, 'Nike', 25);
    expect(result.tx_digest).toBe('tx-add-points');
  });
});

// ── validateQRToken — returning user ─────────────────────────────────────────

describe('validateQRToken — returning user', () => {
  it('skips mint, updates existing brand node points', async () => {
    const fakeToken = { id: 8, token_uuid: VALID_UUID, brand_id: BRAND_ID, points_value: 10 };

    mockAddPoints.mockResolvedValueOnce('tx-points-only');

    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [fakeToken] })
      .mockResolvedValueOnce({ rows: [] });

    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ name: 'Adidas' }] })                                       // brand lookup
      .mockResolvedValueOnce({ rows: [{ on_chain_avatar_id: AVATAR_OBJ_ID }] })                   // existing avatar
      .mockResolvedValueOnce({ rows: [{ id: 'node-1' }] })                                         // existing brand_node lookup
      .mockResolvedValueOnce({ rows: [] })                                                         // UPDATE brand_node
      .mockResolvedValueOnce({ rows: [] })                                                         // INSERT point_transactions
      .mockResolvedValueOnce({ rows: [{ ...fakeToken, brand_name: 'Adidas', tx_digest: 'tx-points-only' }] }); // final SELECT

    const result = await validateQRToken(VALID_UUID, USER_ID);

    expect(mockMintAvatar).not.toHaveBeenCalled();
    expect(mockAddBrand).not.toHaveBeenCalled();
    expect(mockAddPoints).toHaveBeenCalledWith(AVATAR_OBJ_ID, 'Adidas', 10);
    expect(result.tx_digest).toBe('tx-points-only');
  });
});

// ── validateQRToken — error paths ─────────────────────────────────────────────

describe('validateQRToken — error handling', () => {
  it('rethrows on blockchain failure', async () => {
    const fakeToken = { id: 9, token_uuid: VALID_UUID, brand_id: BRAND_ID, points_value: 10 };
    mockMintAvatar.mockRejectedValueOnce(new Error('Sui node unreachable'));

    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [fakeToken] })
      .mockResolvedValueOnce({ rows: [] });

    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ name: 'Nike' }] })
      .mockResolvedValueOnce({ rows: [] })  // no avatar
      .mockResolvedValueOnce({ rows: [{ display_name: 'Bob', wallet_address: '0xdef' }] });

    await expect(validateQRToken(VALID_UUID, USER_ID)).rejects.toThrow('Sui node unreachable');
  });

  it('rejects when user has no wallet_address', async () => {
    const fakeToken = { id: 10, token_uuid: VALID_UUID, brand_id: BRAND_ID, points_value: 10 };

    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [fakeToken] })
      .mockResolvedValueOnce({ rows: [] });

    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ name: 'Nike' }] })
      .mockResolvedValueOnce({ rows: [] })  // no avatar
      .mockResolvedValueOnce({ rows: [{ display_name: 'Bob', wallet_address: null }] });

    await expect(validateQRToken(VALID_UUID, USER_ID)).rejects.toThrow(
      'Unable to mint avatar: User has no wallet address'
    );
  });
});
