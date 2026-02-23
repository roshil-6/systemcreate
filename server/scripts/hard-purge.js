const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function main() {
    console.log('--- EMERGENCY PURGE ---');
    try {
        // Just run the command directly on all likely tables.
        // If one doesn't exist, we'll catch it.
        const tables = ['leads', 'comments', 'notifications', 'activity_logs', 'clients', 'attendance', 'staff_documents'];
        for (const table of tables) {
            try {
                await pool.query(`TRUNCATE ${table} RESTART IDENTITY CASCADE`);
                console.log(`✅ Cleared ${table}`);
            } catch (e) {
                console.log(`⚠️ Skip ${table}: ${e.message}`);
            }
        }
        process.exit(0);
    } catch (err) {
        console.error('❌ Critical error:', err);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();
