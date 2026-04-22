/**
 * Unit tests for zklogin.service.ts
 * Sprint 4 — zkLogin end-to-end & JWT verification
 *
 * These tests verify the pure/crypto logic without hitting the network.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

// Set required env before importing the module
process.env.ZKLOGIN_SALT_SECRET = 'test-secret-for-unit-tests-only';

import {
  deriveSalt,
  generateEphemeralKeypair,
  getEphemeralKeypair,
} from '../services/zklogin.service.js';

// ── deriveSalt ────────────────────────────────────────────────────────────────

describe('deriveSalt', () => {
  it('returns a hex string of length 64', () => {
    const salt = deriveSalt('google-sub-12345');
    expect(salt).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic — same input always gives same output', () => {
    const a = deriveSalt('google-sub-abc');
    const b = deriveSalt('google-sub-abc');
    expect(a).toBe(b);
  });

  it('returns different salts for different subjects', () => {
    const a = deriveSalt('user-001');
    const b = deriveSalt('user-002');
    expect(a).not.toBe(b);
  });

  it('changes when ZKLOGIN_SALT_SECRET changes', () => {
    const salt1 = deriveSalt('same-sub');

    // Temporarily override secret
    const original = process.env.ZKLOGIN_SALT_SECRET;
    process.env.ZKLOGIN_SALT_SECRET = 'different-secret';
    const salt2 = deriveSalt('same-sub');
    process.env.ZKLOGIN_SALT_SECRET = original;

    expect(salt1).not.toBe(salt2);
  });
});

// ── generateEphemeralKeypair ──────────────────────────────────────────────────

describe('generateEphemeralKeypair', () => {
  const EPOCH = 42;

  it('returns the expected fields', () => {
    const result = generateEphemeralKeypair(EPOCH);
    expect(result).toHaveProperty('nonce');
    expect(result).toHaveProperty('maxEpoch');
    expect(result).toHaveProperty('randomness');
    expect(result).toHaveProperty('ephemeralPublicKey');
  });

  it('maxEpoch is currentEpoch + 10', () => {
    const { maxEpoch } = generateEphemeralKeypair(EPOCH);
    expect(maxEpoch).toBe(EPOCH + 10);
  });

  it('nonce is a non-empty string', () => {
    const { nonce } = generateEphemeralKeypair(EPOCH);
    expect(typeof nonce).toBe('string');
    expect(nonce.length).toBeGreaterThan(0);
  });

  it('ephemeralPublicKey is a valid base64 string', () => {
    const { ephemeralPublicKey } = generateEphemeralKeypair(EPOCH);
    expect(() => Buffer.from(ephemeralPublicKey, 'base64')).not.toThrow();
    expect(ephemeralPublicKey.length).toBeGreaterThan(0);
  });

  it('generates a unique nonce on every call', () => {
    const a = generateEphemeralKeypair(EPOCH);
    const b = generateEphemeralKeypair(EPOCH);
    // Randomness is freshly generated each time, so nonces differ
    expect(a.nonce).not.toBe(b.nonce);
  });
});

// ── getEphemeralKeypair ───────────────────────────────────────────────────────

describe('getEphemeralKeypair', () => {
  it('retrieves the keypair stored under the returned nonce', () => {
    const { nonce } = generateEphemeralKeypair(100);
    const stored = getEphemeralKeypair(nonce);
    expect(stored).toBeDefined();
    expect(stored!.maxEpoch).toBe(110);
  });

  it('returns undefined for an unknown nonce', () => {
    expect(getEphemeralKeypair('does-not-exist')).toBeUndefined();
  });

  it('stored randomness matches what was returned', () => {
    const { nonce, randomness } = generateEphemeralKeypair(200);
    const stored = getEphemeralKeypair(nonce);
    expect(stored!.randomness).toBe(randomness);
  });
});
