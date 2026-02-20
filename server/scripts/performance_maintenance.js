const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function runMaintenance() {
    const client = await pool.connect();
    try {
        console.log('🚀 Starting Performance Maintenance & Renaming...');

        // 1. Rename WhatsApp Number to Office Number in users table
        try {
            await client.query('ALTER TABLE users RENAME COLUMN whatsapp_number TO office_number;');
            console.log('✅ Renamed users.whatsapp_number to office_number');
        } catch (e) {
            if (e.code === '42701') { // column_already_exists
                console.log('ℹ️ users.office_number already exists');
            } else if (e.code === '42703') { // undefined_column
                console.log('ℹ️ users.whatsapp_number not found (maybe already renamed)');
            } else {
                console.error('❌ Error renaming column:', e.message);
            }
        }

        // 2. Add performance indexes to leads table
        console.log('📈 Adding performance indexes to leads table...');

        // Index for dashboard/history sorting and list views
        await client.query('CREATE INDEX IF NOT EXISTS idx_leads_updated_at ON leads(updated_at DESC);');
        await client.query('CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);');

        // Index for role-based filtering (assigned_staff_id)
        await client.query('CREATE INDEX IF NOT EXISTS idx_leads_assigned_staff_id ON leads(assigned_staff_id);');

        // Index for common filter: status
        await client.query('CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);');

        // 3. Optimize text search if common (optional but good for speed)
        // await client.query('CREATE INDEX IF NOT EXISTS idx_leads_name_trgm ON leads USING gin (name gin_trgm_ops);');

        console.log('✅ Database maintenance completed successfully!');

    } catch (err) {
        console.error('❌ Maintenance failed:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

runMaintenance();
