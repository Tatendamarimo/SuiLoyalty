import { createHmac } from 'crypto';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { generateNonce, generateRandomness, jwtToAddress } from '@mysten/zklogin';
import dotenv from 'dotenv';

dotenv.config();

const ephemeralStore = new Map<string, { keypair: Ed25519Keypair; maxEpoch: number; randomness: string }>();

/**
 * Derives a deterministic user salt based on their Google subject ID (googleSub),
 * ensuring the generated Sui address remains consistent across logins.
 */
export function deriveSalt(googleSub: string): string {
  return createHmac('sha256', process.env.ZKLOGIN_SALT_SECRET!)
    .update(googleSub)
    .digest('hex');
}

/**
 * Computes a Sui address from the provided zkLogin JWT and derived salt.
 */
export function computeSuiAddress(jwt: string, salt: string): string {
  return jwtToAddress(jwt, BigInt('0x' + salt.slice(0, 32)));
}

/**
 * Generates an ephemeral Ed25519 keypair for the OAuth transaction,
 * constructing a precise nonce and max epoch for transaction validity limit.
 */
export function generateEphemeralKeypair(currentEpoch: number) {
  const keypair = new Ed25519Keypair();
  const randomness = generateRandomness();
  const maxEpoch = currentEpoch + 10;
  const nonce = generateNonce(keypair.getPublicKey(), maxEpoch, randomness);

  ephemeralStore.set(nonce, { keypair, maxEpoch, randomness });

  return {
    nonce,
    maxEpoch,
    randomness,
    ephemeralPublicKey: keypair.getPublicKey().toBase64(),
  };
}

/**
 * Retrieves the cached ephemeral keypair components needed later to
 * combine zkLogin proofs and sign blockchain transactions.
 */
export function getEphemeralKeypair(nonce: string) {
  return ephemeralStore.get(nonce);
}
