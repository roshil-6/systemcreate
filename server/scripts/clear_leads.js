/**
 * One-shot script: Delete all leads from the database.
 * Run with: node server/scripts/clear_leads.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');

let connectionString = process.env.DATABASE_URL;
if (connectionString && !connectionString.includes('sslmode=')) {
    connectionString += (connectionString.includes('?') ? '&' : '?') + 'sslmode=no-verify';
}

const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

async function clearLeads() {
    const client = await pool.connect();
    try {
        // List all tables first
        const tableRes = await client.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`);
        console.log('📋 Tables in DB:', tableRes.rows.map(r => r.tablename).join(', '));

        const tables = tableRes.rows.map(r => r.tablename);

        // Delete comments first (FK constraint)
        const commentTable = tables.find(t => t.includes('comment'));
        if (commentTable) {
            const c = await client.query(`DELETE FROM "${commentTable}"`);
            console.log(`🗑  Deleted ${c.rowCount} rows from ${commentTable}`);
        }

        // Delete notifications related to leads
        const notifTable = tables.find(t => t.includes('notif'));
        if (notifTable) {
            const n = await client.query(`DELETE FROM "${notifTable}" WHERE lead_id IS NOT NULL`);
            console.log(`🗑  Deleted ${n.rowCount} rows from ${notifTable}`);
        }

        // Delete leads
        const leads = await client.query('DELETE FROM leads RETURNING id');
        console.log(`✅ Deleted ${leads.rowCount} leads successfully!`);
        console.log('Done! You can now re-import your CSV file.');
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        client.release();
        await pool.end();
    }
}

clearLeads();
