import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

// Use SUPABASE_DATABASE_URL first, fall back to DATABASE_URL for compatibility
const dbUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL || '';
try {
  const host = new URL(dbUrl).hostname;
  console.log(`[DB] Connecting to host: ${host}`);
} catch {
  console.error(`[DB] Invalid DATABASE_URL: "${dbUrl.slice(0, 30)}..."`);
}

// Strip sslmode from URL — we handle SSL programmatically to avoid
// pg treating 'require' as 'verify-full' and rejecting Supabase certs.
const cleanUrl = dbUrl.replace(/[?&]sslmode=[^&]*/g, '').replace(/\?$/, '');

const pool = new Pool({
  connectionString: cleanUrl,
  ssl: dbUrl.includes('supabase.com')
    ? { rejectUnauthorized: false }
    : false,
});

pool.on('error', (err) => {
  console.error('Database pool error:', err);
});

export default pool;
export { pool };
