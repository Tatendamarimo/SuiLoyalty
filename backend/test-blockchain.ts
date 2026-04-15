import { mintCardOnChain, earnPointsOnChain } from './src/services/blockchain.service.js';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
  try {
    console.log('Minting card...');
    const cardId = await mintCardOnChain('TestUser', process.env.SUI_BACKEND_ADDRESS!);
    console.log('Blockchain tx SUCCESS, cardId:', cardId);
    
    console.log('Earning points...');
    const tx = await earnPointsOnChain(cardId, 10);
    console.log('Blockchain tx SUCCESS:', tx);
    
  } catch(e: any) {
    console.error('ERROR:', e.message);
  }
}

test();
