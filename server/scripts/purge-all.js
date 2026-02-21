const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function main() {
    console.log('--- Comprehensive Purge Started ---');
    try {
        const tablesToClear = [
            'leads',
            'comments',
            'notifications',
            'activity_logs',
            'login_logs',
            'attendance',
            'staff_documents',
            'clients',
            'email_logs',
            'import_history'
        ];

        console.log(`Purging tables: ${tablesToClear.join(', ')}`);

        // Check which tables actually exist before truncating to avoid errors
        const tableCheck = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema='public' 
      AND table_name = ANY($1)
    `, [tablesToClear]);

        const existingTables = tableCheck.rows.map(r => r.table_name);

        if (existingTables.length > 0) {
            const truncateQuery = `TRUNCATE ${existingTables.join(', ')} RESTART IDENTITY CASCADE`;
            await pool.query(truncateQuery);
            console.log('✅ DATABASE PURGED: ' + existingTables.join(', '));
        } else {
            console.log('⚠️ No target tables found to purge.');
        }

        // --- FILE CLEANUP ---
        const fs = require('fs');
        const path = require('path');
        const importDir = path.join(__dirname, '../uploads/imports');

        if (fs.existsSync(importDir)) {
            const files = fs.readdirSync(importDir);
            for (const file of files) {
                fs.unlinkSync(path.join(importDir, file));
            }
            console.log(`✅ CLEARED: ${files.length} import files from uploads/imports`);
        }

        process.exit(0);
    } catch (err) {
        console.error('❌ Error purging database:', err);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();
