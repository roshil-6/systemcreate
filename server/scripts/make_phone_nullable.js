require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function migrate() {
    try {
        console.log('🔄 Making phone_number nullable in leads table...');
        await pool.query('ALTER TABLE leads ALTER COLUMN phone_number DROP NOT NULL');
        console.log('✅ phone_number is now nullable.');
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
    } finally {
        await pool.end();
        process.exit(0);
    }
}

migrate();
