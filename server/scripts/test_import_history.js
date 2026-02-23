const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function test() {
    try {
        console.log('🔍 Testing import_history table...');
        const result = await pool.query('SELECT * FROM import_history LIMIT 1');
        console.log('✅ Success! Data found:', result.rows);
    } catch (err) {
        console.error('❌ Query failed:', err.message);
    } finally {
        await pool.end();
    }
}

test();
