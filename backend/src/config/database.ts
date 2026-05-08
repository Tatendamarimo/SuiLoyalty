import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

// Debug: confirm which DB host Railway is connecting to
const dbUrl = process.env.DATABASE_URL || '';
try {
  const host = new URL(dbUrl).hostname;
  console.log(`[DB] Connecting to host: ${host}`);
} catch {
  console.error(`[DB] Invalid DATABASE_URL: "${dbUrl.slice(0, 30)}..."`);
}

const pool = new Pool({
  connectionString: dbUrl,
  ssl: dbUrl.includes('supabase.com')
    ? { rejectUnauthorized: false }
    : false,
});

pool.on('error', (err) => {
  console.error('Database pool error:', err);
});

export default pool;
export { pool };
