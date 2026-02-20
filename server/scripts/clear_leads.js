const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function clearLeads() {
    const client = await pool.connect();
    try {
        console.log('--- Database Cleanup Started ---');

        // We use CASCADE to handle any child tables (like comments or history)
        await client.query('TRUNCATE TABLE leads RESTART IDENTITY CASCADE;');

        console.log('✅ Successfully cleared all leads.');
        console.log('✅ Reset lead ID sequences.');

    } catch (err) {
        console.error('❌ Error clearing leads:', err.message);
    } finally {
        client.release();
        await pool.end();
        console.log('--- Cleanup Finished ---');
    }
}

clearLeads();
