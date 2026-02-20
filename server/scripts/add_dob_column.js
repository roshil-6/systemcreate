const { Pool } = require('pg');
require('dotenv').config({ path: '../.env' });

const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
    connectionString: connectionString,
    ssl: {
        rejectUnauthorized: false
    }
});

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('🔍 Checking for dob column in users table...');
        const res = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='users' AND column_name='dob';
    `);

        if (res.rowCount === 0) {
            console.log('➕ Adding dob column to users table...');
            await client.query('ALTER TABLE users ADD COLUMN dob DATE;');
            console.log('✅ dob column added successfully.');
        } else {
            console.log('ℹ️ dob column already exists.');
        }
    } catch (err) {
        console.error('❌ Migration failed:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

migrate();
