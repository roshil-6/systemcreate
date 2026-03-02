const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const db = require('./config/database');

async function checkTrash() {
    try {
        console.log('🔍 Checking database for trashed leads...');

        // Check column types
        const columnsResult = await db.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'leads' 
            AND column_name IN ('deleted_at', 'deleted_by')
        `);
        console.log('📊 Column Types:', columnsResult.rows);

        // Check for any leads that are soft-deleted
        const deletedCountResult = await db.query('SELECT COUNT(*) FROM leads WHERE deleted_at IS NOT NULL');
        console.log('🗑️ Total leads with deleted_at IS NOT NULL:', deletedCountResult.rows[0].count);

        // Check first 5 deleted leads
        const sampleDeletedResult = await db.query('SELECT id, name, deleted_at, deleted_by FROM leads WHERE deleted_at IS NOT NULL LIMIT 5');
        console.log('📄 Sample Deleted Leads:', sampleDeletedResult.rows);

        // Test the getTrashedLeads function
        const trashedLeads = await db.getTrashedLeads();
        console.log('✅ db.getTrashedLeads() returned:', trashedLeads.length, 'leads');

    } catch (error) {
        console.error('❌ Diagnostic failed:', error);
    } finally {
        await db.end();
    }
}

checkTrash();
