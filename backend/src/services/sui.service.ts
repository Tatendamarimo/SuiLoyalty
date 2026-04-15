import dotenv from 'dotenv';
dotenv.config();

/**
 * @deprecated This service is superseded by blockchain.service.ts.
 * Use mintAvatarOnChain, addBrandToAvatarOnChain, and addBrandPointsOnChain from there instead.
 *
 * Keeping this file as a thin re-export for any external callers that may still reference it.
 */
export {
  mintAvatarOnChain as mintCardOnChain,
  addBrandPointsOnChain as earnPointsOnChain,
  getAvatarByObjectId as getCardByObjectId,
} from './blockchain.service.js';
