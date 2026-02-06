require('dotenv').config({ path: '.env' });
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function resetData() {
    const client = await pool.connect();
    try {
        console.log('🗑️  Starting data cleanup...');

        // 1. Delete Clients (Child data mostly, or at least derived)
        console.log('   Deleting all clients...');
        await client.query('DELETE FROM clients');

        // 2. Delete Leads
        console.log('   Deleting all leads...');
        await client.query('DELETE FROM leads');

        // 3. Optional: Reset sequences if possible (Best effort)
        try {
            await client.query('ALTER SEQUENCE leads_id_seq RESTART WITH 1');
            await client.query('ALTER SEQUENCE clients_id_seq RESTART WITH 1');
            console.log('   Sequences reset to 1.');
        } catch (seqError) {
            console.log('   (Note: Could not reset sequences, likely restricted or different names. Ignoring.)');
        }

        console.log('✅ DATABASE CLEARED SUCCESSFULLY (Users preserved).');
    } catch (err) {
        console.error('❌ Error clearing data:', err);
    } finally {
        client.release();
        pool.end();
    }
}

resetData();
