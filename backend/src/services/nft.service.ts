import dotenv from 'dotenv';
dotenv.config();

import pool from '../config/database.js';
import { getCardByObjectId } from './blockchain.service.js';

/**
 * Looks up the customer's highest-value LoyaltyCard objectId from the DB,
 * then fetches its live on-chain state. Cards are backend-custodied (owned by backend wallet).
 */
export async function getLoyaltyCard(walletAddress: string) {
  const result = await pool.query(
    `SELECT lc.on_chain_card_id
     FROM loyalty_cards lc
     JOIN users u ON u.id = lc.user_id
     WHERE u.wallet_address = $1
     ORDER BY lc.points_balance DESC
     LIMIT 1`,
    [walletAddress]
  );

  if (result.rows.length === 0) return null;

  return getCardByObjectId(result.rows[0].on_chain_card_id);
}
