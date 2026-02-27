const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('🚀 Adding excel_row_data column to leads table...');
        await client.query(`
            ALTER TABLE leads 
            ADD COLUMN IF NOT EXISTS excel_row_data JSONB;
        `);
        console.log('✅ Column excel_row_data added (or already exists).');
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        throw err;
    } finally {
        client.release();
        await pool.end();
    }
}

migrate().then(() => {
    console.log('Migration complete.');
    process.exit(0);
}).catch(() => process.exit(1));
