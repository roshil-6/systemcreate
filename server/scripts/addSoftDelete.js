/**
 * Migration: Add soft-delete columns to leads table
 * Run once: node server/scripts/addSoftDelete.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');

let connectionString = process.env.DATABASE_URL;
if (connectionString && !connectionString.includes('sslmode=')) {
    connectionString += (connectionString.includes('?') ? '&' : '?') + 'sslmode=no-verify';
}

const pool = new Pool({ connectionString });

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('🔄 Running soft-delete migration...');

        await client.query(`
      ALTER TABLE leads
        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS deleted_by  INTEGER      DEFAULT NULL;
    `);

        // Index to speed up trash queries
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_leads_deleted_at ON leads (deleted_at)
        WHERE deleted_at IS NOT NULL;
    `);

        console.log('✅ Migration complete! Columns added: deleted_at, deleted_by');
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

migrate();
