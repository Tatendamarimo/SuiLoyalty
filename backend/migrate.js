import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  try {
    console.log('Running migration...');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_object_id VARCHAR(66) UNIQUE;');
    console.log('✅ Added avatar_object_id to users');
    
    await pool.query('ALTER TABLE loyalty_cards DROP CONSTRAINT IF EXISTS loyalty_cards_on_chain_card_id_key;');
    console.log('✅ Dropped unique constraint from loyalty_cards');
  } catch (err) {
    console.error('Migration failed', err);
  } finally {
    await pool.end();
  }
}
run();
