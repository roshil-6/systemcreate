const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('🚀 Starting migration: Create import_skipped_leads table...');

        await client.query(`
      CREATE TABLE IF NOT EXISTS import_skipped_leads (
        id SERIAL PRIMARY KEY,
        import_history_id INTEGER REFERENCES import_history(id) ON DELETE CASCADE,
        row_number INTEGER,
        sheet_name TEXT,
        name TEXT,
        phone_number TEXT,
        email TEXT,
        skip_reason TEXT NOT NULL,
        existing_lead_id INTEGER REFERENCES leads(id),
        existing_lead_name TEXT,
        existing_lead_status TEXT,
        raw_data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

        console.log('✅ Table import_skipped_leads created or already exists.');

        // Create indexes for faster queries
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_import_skipped_leads_import_id 
      ON import_skipped_leads(import_history_id);
    `);

        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_import_skipped_leads_phone 
      ON import_skipped_leads(phone_number);
    `);

        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_import_skipped_leads_email 
      ON import_skipped_leads(email);
    `);

        console.log('✅ Indexes created for import_skipped_leads.');

    } catch (err) {
        console.error('❌ Migration failed:', err.message);
    } finally {
        client.release();
        await pool.end();
    }
}

migrate();
