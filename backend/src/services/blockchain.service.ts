import dotenv from 'dotenv';
dotenv.config();

import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';

const PACKAGE_ID = process.env.SUI_PACKAGE_ID!;
const NETWORK = (process.env.SUI_NETWORK || 'devnet') as 'devnet' | 'testnet' | 'mainnet';

function getKeypair(): Ed25519Keypair {
  const { secretKey } = decodeSuiPrivateKey(process.env.SUI_PRIVATE_KEY!);
  return Ed25519Keypair.fromSecretKey(secretKey);
}

function getClient(): SuiJsonRpcClient {
  return new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(NETWORK), network: NETWORK });
}

/**
 * Calls mint_card() on-chain. The card is transferred to the backend wallet (ctx.sender).
 * Returns the created LoyaltyCard object ID.
 */
export async function mintCardOnChain(displayName: string): Promise<string> {
  const keypair = getKeypair();
  const client = getClient();

  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::loyalty_card::mint_card`,
    arguments: [tx.pure.string(displayName)],
  });

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showObjectChanges: true, showEffects: true },
  });

  const status = (result as any).effects?.status?.status;
  if (status && status !== 'success') {
    throw new Error(`mint_card failed: ${(result as any).effects?.status?.error}`);
  }

  const objectChanges: any[] = (result as any).objectChanges ?? [];
  const created = objectChanges.find(
    (c: any) => c.type === 'created' && c.objectType?.includes('LoyaltyCard')
  );
  if (!created) {
    throw new Error('mint_card tx succeeded but no LoyaltyCard object found in changes');
  }

  return created.objectId as string;
}

/**
 * Calls earn_points() on-chain for a card owned by the backend wallet.
 * Returns the transaction digest.
 */
export async function earnPointsOnChain(cardObjectId: string, points: number): Promise<string> {
  const keypair = getKeypair();
  const client = getClient();

  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::loyalty_card::earn_points`,
    arguments: [tx.object(cardObjectId), tx.pure.u64(points)],
  });

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true },
  });

  const status = (result as any).effects?.status?.status;
  if (status && status !== 'success') {
    throw new Error(`earn_points failed: ${(result as any).effects?.status?.error}`);
  }

  return (result as any).digest as string;
}

/**
 * Fetches a LoyaltyCard object directly by its Sui object ID.
 */
export async function getCardByObjectId(objectId: string) {
  const client = getClient();
  const obj = await client.getObject({ id: objectId, options: { showContent: true } });
  if (!obj.data) return null;
  const fields = (obj.data.content as any)?.fields;
  return {
    objectId,
    points: Number(fields?.points || 0),
    tier: Number(fields?.tier || 0),
    scan_count: Number(fields?.scan_count || 0),
    owner_name: fields?.owner_name || 'Unknown',
  };
}
