const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function main() {
    console.log('--- Database Cleanup Started ---');
    try {
        const res = await pool.query('TRUNCATE leads, comments, notifications RESTART IDENTITY CASCADE');
        console.log('✅ LEADS DATABASE FULLY CLEARED');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error clearing database:', err);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();
