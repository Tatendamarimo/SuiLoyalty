const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://localhost:5432/suiloyalty' });

async function run() {
  try {
    await pool.query("ALTER TABLE qr_tokens ADD COLUMN IF NOT EXISTS campaign_name VARCHAR(100) DEFAULT 'General Campaign'");
    console.log('Migration done');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    process.exit(0);
  }
}
run();
