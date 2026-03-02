/**
 * Migration: Add performance indexes to leads table
 * Run once: node server/scripts/addLeadIndexes.js
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
        console.log('🔄 Adding performance indexes to leads table...');

        // Index for ORDER BY updated_at DESC (the default sort)
        await client.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_updated_at ON leads (updated_at DESC) WHERE deleted_at IS NULL;`);
        console.log('✅ Index: idx_leads_updated_at');

        // Index for filtering by assigned_staff_id (most common filter)
        await client.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_assigned_staff ON leads (assigned_staff_id) WHERE deleted_at IS NULL;`);
        console.log('✅ Index: idx_leads_assigned_staff');

        // Index for status filtering
        await client.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_status ON leads (status) WHERE deleted_at IS NULL;`);
        console.log('✅ Index: idx_leads_status');

        // Composite index for the most common combined query (staff + status + updated_at)
        await client.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_staff_status_updated ON leads (assigned_staff_id, status, updated_at DESC) WHERE deleted_at IS NULL;`);
        console.log('✅ Index: idx_leads_staff_status_updated');

        console.log('\n🎉 All indexes created! Leads queries will now be significantly faster.');
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

migrate();
