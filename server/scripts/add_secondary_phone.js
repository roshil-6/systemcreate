require('dotenv').config({ path: '.env' });
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('🔄 Adding secondary_phone_number column...');

        // Add to leads
        try {
            await client.query('ALTER TABLE leads ADD COLUMN secondary_phone_number VARCHAR(50)');
            console.log('   ✅ Added to leads table.');
        } catch (e) {
            if (e.message.includes('already exists')) {
                console.log('   ℹ️  Column already exists in leads.');
            } else {
                throw e;
            }
        }

        // Add to clients
        try {
            await client.query('ALTER TABLE clients ADD COLUMN secondary_phone_number VARCHAR(50)');
            console.log('   ✅ Added to clients table.');
        } catch (e) {
            if (e.message.includes('already exists')) {
                console.log('   ℹ️  Column already exists in clients.');
            } else {
                throw e;
            }
        }

        console.log('✅ Migration complete.');
    } catch (err) {
        console.error('❌ Migration failed:', err);
    } finally {
        client.release();
        pool.end();
    }
}

migrate();
