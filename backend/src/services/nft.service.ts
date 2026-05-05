import dotenv from 'dotenv';
dotenv.config();

import pool from '../config/database.js';
import { getAvatarByObjectId } from './blockchain.service.js';

/**
 * Looks up the user's LoyaltyAvatar objectId from the database using their wallet address,
 * then fetches its live on-chain state (level, experience, locked status).
 * Returns null if the user has no avatar registered.
 *
 * @param walletAddress - The Sui wallet address of the user.
 */
export async function getLoyaltyAvatar(walletAddress: string) {
  const result = await pool.query(
    `SELECT la.on_chain_avatar_id
     FROM loyalty_avatars la
     JOIN users u ON u.id = la.user_id
     WHERE u.wallet_address = $1
     LIMIT 1`,
    [walletAddress]
  );

  if (result.rows.length === 0) return null;

  return getAvatarByObjectId(result.rows[0].on_chain_avatar_id);
}

