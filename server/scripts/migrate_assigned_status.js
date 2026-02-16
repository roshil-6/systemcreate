const { Pool } = require('pg');
const path = require('path');
// Fix path resolution - script is in server/scripts, .env is in project root
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

// Use the same connection logic as the main app
const pool = new Pool({
    // Fallback to local string if env not loaded (for script execution)
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/crm_db',
    ssl: (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost')) ? false : { rejectUnauthorized: false }
});

async function migrateAssignedStatus() {
    const client = await pool.connect();
    try {
        console.log('🔄 Starting migration: Fixing Lead Status vs Assignment...');

        // 1. Update leads that have an assigned staff but status is 'Unassigned' or 'New'
        const result1 = await client.query(`
      UPDATE leads
      SET status = 'Assigned'
      WHERE assigned_staff_id IS NOT NULL 
      AND (status = 'Unassigned' OR status = 'New')
    `);
        console.log(`✅ Updated ${result1.rowCount} leads to 'Assigned' status (had staff but wrong status).`);

        // 2. Update leads that have NO assigned staff but status is 'Assigned'
        const result2 = await client.query(`
      UPDATE leads
      SET status = 'Unassigned'
      WHERE (assigned_staff_id IS NULL OR assigned_staff_id::text = '')
      AND status = 'Assigned'
    `);
        console.log(`✅ Updated ${result2.rowCount} leads to 'Unassigned' status (had 'Assigned' status but no staff).`);

        // 3. Update leads with 'New' status to 'Unassigned' (cleanup)
        const result3 = await client.query(`
      UPDATE leads
      SET status = 'Unassigned'
      WHERE status = 'New'
    `);
        console.log(`✅ Updated ${result3.rowCount} remaining 'New' leads to 'Unassigned'.`);

        console.log('🎉 Migration completed successfully!');
    } catch (error) {
        console.error('❌ Migration failed:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

migrateAssignedStatus();
