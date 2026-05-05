import pg from 'pg';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const sql = readFileSync('./migrations/005_sessions_and_brands.sql', 'utf8');
  try {
    console.log('Applying migration 005...');
    await pool.query(sql);
    console.log('✅ Migration 005 applied successfully');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}
run();
