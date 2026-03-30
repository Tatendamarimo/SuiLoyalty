import dotenv from 'dotenv';
dotenv.config();

export async function getLoyaltyCard(walletAddress: string) {
  try {
    const { SuiJsonRpcClient, getJsonRpcFullnodeUrl } = await import('@mysten/sui/jsonRpc');
    const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl('devnet'), network: 'devnet' });

    const objects = await client.getOwnedObjects({
      owner: walletAddress,
      filter: {
        StructType: `${process.env.SUI_PACKAGE_ID}::loyalty_card::LoyaltyCard`
      },
      options: { showContent: true }
    });

    if (objects.data.length === 0) {
      return null;
    }

    const card = objects.data[0];
    const content = card.data?.content as any;
    const fields = content?.fields;

    return {
      objectId: card.data?.objectId,
      owner: walletAddress,
      points: Number(fields?.points || 0),
      tier: Number(fields?.tier || 0),
      scan_count: Number(fields?.scan_count || 0),
      owner_name: fields?.owner_name || 'Unknown',
    };
  } catch (error: any) {
    throw new Error(`Failed to fetch NFT: ${error.message}`);
  }
}