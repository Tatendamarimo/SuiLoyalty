import dotenv from 'dotenv';
dotenv.config();

import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';

const PACKAGE_ID = process.env.SUI_PACKAGE_ID!;
const ADMIN_CAP_ID = process.env.ADMIN_CAP_ID!;
const NETWORK = (process.env.SUI_NETWORK || 'testnet') as 'devnet' | 'testnet' | 'mainnet';

/**
 * Decodes the base64/hex private key from environment variables
 * and returns an Ed25519 keypair for signing transactions.
 */
function getKeypair(): Ed25519Keypair {
  const { secretKey } = decodeSuiPrivateKey(process.env.SUI_PRIVATE_KEY!);
  return Ed25519Keypair.fromSecretKey(secretKey);
}

/**
 * Instantiates and returns a configured Sui JSON RPC Client
 * communicating with the appropriate network (devnet, testnet, or mainnet).
 */
function getClient(): SuiJsonRpcClient {
  return new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(NETWORK), network: NETWORK });
}

// ─── Avatar Functions ─────────────────────────────────────────────────────────

/**
 * Mints a new LoyaltyAvatar NFT for a user on-chain.
 * The avatar is transferred to the recipientAddress.
 * Returns the created LoyaltyAvatar object ID.
 *
 * @param displayName - The user's display name to embed in the avatar.
 * @param recipientAddress - The Sui wallet address to send the avatar to.
 */
export async function mintAvatarOnChain(displayName: string, recipientAddress: string): Promise<string> {
  const keypair = getKeypair();
  const client = getClient();

  // mint_avatar is an entry fun — it transfers to ctx.sender() (backend wallet).
  // We use a PTB to call mint_avatar then transfer the result to the recipient.
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::loyalty_nft::mint_avatar`,
    arguments: [tx.pure.string(displayName)],
  });

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showObjectChanges: true, showEffects: true },
  });

  const status = (result as any).effects?.status?.status;
  if (status && status !== 'success') {
    throw new Error(`mint_avatar failed: ${(result as any).effects?.status?.error}`);
  }

  const objectChanges: any[] = (result as any).objectChanges ?? [];
  const created = objectChanges.find(
    (c: any) => c.type === 'created' && c.objectType?.includes('LoyaltyAvatar')
  );
  if (!created) {
    throw new Error('mint_avatar tx succeeded but no LoyaltyAvatar object found in changes');
  }

  const digest = (result as any).digest as string;
  console.log(`[blockchain] Avatar minted. Tx: ${digest}`);

  return created.objectId as string;
}

/**
 * Adds a brand relationship to a user's LoyaltyAvatar as a BrandNode dynamic object field.
 * Must be called before adding points for that brand.
 * The backend wallet must own the avatar to call this.
 *
 * @param avatarObjectId - The Sui object ID of the user's LoyaltyAvatar.
 * @param brandName - The brand name string to register on the avatar.
 */
export async function addBrandToAvatarOnChain(avatarObjectId: string, brandName: string): Promise<string> {
  const keypair = getKeypair();
  const client = getClient();

  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::loyalty_nft::add_brand`,
    arguments: [
      tx.object(ADMIN_CAP_ID),
      tx.object(avatarObjectId),
      tx.pure.string(brandName),
    ],
  });

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true },
  });

  const status = (result as any).effects?.status?.status;
  if (status && status !== 'success') {
    throw new Error(`add_brand failed: ${(result as any).effects?.status?.error}`);
  }

  const digest = (result as any).digest as string;
  console.log(`[blockchain] Brand "${brandName}" added to avatar ${avatarObjectId}. Tx: ${digest}`);
  return digest;
}

/**
 * Adds loyalty points to a specific brand relationship on a user's LoyaltyAvatar.
 * Also awards experience points to the avatar equal to the points added.
 *
 * @param avatarObjectId - The Sui object ID of the user's LoyaltyAvatar.
 * @param brandName - The brand to add points to (must already exist on the avatar).
 * @param points - The number of points to award.
 */
export async function addBrandPointsOnChain(avatarObjectId: string, brandName: string, points: number): Promise<string> {
  const keypair = getKeypair();
  const client = getClient();

  const tx = new Transaction();

  // Add brand-specific points
  tx.moveCall({
    target: `${PACKAGE_ID}::loyalty_nft::add_brand_points`,
    arguments: [
      tx.object(ADMIN_CAP_ID),
      tx.object(avatarObjectId),
      tx.pure.string(brandName),
      tx.pure.u64(points),
    ],
  });

  // Award XP equal to points added (cross-brand experience)
  tx.moveCall({
    target: `${PACKAGE_ID}::loyalty_nft::gain_experience`,
    arguments: [
      tx.object(ADMIN_CAP_ID),
      tx.object(avatarObjectId),
      tx.pure.u64(points),
    ],
  });

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true },
  });

  const status = (result as any).effects?.status?.status;
  if (status && status !== 'success') {
    throw new Error(`add_brand_points failed: ${(result as any).effects?.status?.error}`);
  }

  const digest = (result as any).digest as string;
  console.log(`[blockchain] +${points} pts to brand "${brandName}" on avatar ${avatarObjectId}. Tx: ${digest}`);
  return digest;
}

// ─── Read Functions ────────────────────────────────────────────────────────────

/**
 * Fetches a LoyaltyAvatar's top-level fields directly from the Sui RPC by object ID.
 * Returns null if the object does not exist or is not a LoyaltyAvatar.
 *
 * @param objectId - The Sui object ID of the LoyaltyAvatar.
 */
export async function getAvatarByObjectId(objectId: string) {
  const client = getClient();
  const obj = await client.getObject({ id: objectId, options: { showContent: true } });
  if (!obj.data) return null;

  const fields = (obj.data.content as any)?.fields;
  return {
    objectId,
    name: fields?.name || 'Unknown',
    level: Number(fields?.level || 1),
    experience: Number(fields?.experience || 0),
    locked: Boolean(fields?.locked),
  };
}

// ─── Legacy alias ─────────────────────────────────────────────────────────────
// Kept for backward compatibility with any remaining references to getCardByObjectId.
/** @deprecated Use getAvatarByObjectId instead. */
export const getCardByObjectId = getAvatarByObjectId;
