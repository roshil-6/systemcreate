require('dotenv').config({ path: __dirname + '/../.env' });
const db = require('../config/database');

async function addIndexes() {
    try {
        console.log('🚀 Beginning database index optimizations...');

        // Add primary indices for filtering
        await db.query('CREATE INDEX IF NOT EXISTS idx_leads_assigned_staff_id ON leads(assigned_staff_id);');
        await db.query('CREATE INDEX IF NOT EXISTS idx_leads_deleted_at ON leads(deleted_at);');
        await db.query('CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);');

        // Add index for the sorting we implemented earlier (created_at and updated_at)
        await db.query('CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);');
        await db.query('CREATE INDEX IF NOT EXISTS idx_leads_updated_at ON leads(updated_at DESC);');

        // Add a composite index specifically tailored for the Sales Team view (which filters by staff_id, checks deleted_at, and sorts by updated_at)
        await db.query('CREATE INDEX IF NOT EXISTS idx_leads_sales_team_optimized ON leads(assigned_staff_id, deleted_at, created_at DESC);');
        await db.query('CREATE INDEX IF NOT EXISTS idx_leads_sales_team_optimized_updated ON leads(assigned_staff_id, deleted_at, updated_at DESC);');

        // Index for clients table for the dashboard queries
        await db.query('CREATE INDEX IF NOT EXISTS idx_clients_assigned_staff_id ON clients(assigned_staff_id);');

        console.log('✅ All indexes added successfully! DB queries should now be incredibly fast.');
    } catch (e) {
        console.error('❌ Error adding indexes:', e.message);
    } finally {
        process.exit(0);
    }
}

addIndexes();
