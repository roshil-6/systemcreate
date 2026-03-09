/**
 * Safe schema migration — adds columns/tables that were added after initial deployment.
 * Uses IF NOT EXISTS / IF NOT EXISTS checks so it is safe to run multiple times.
 * Run via Render Shell: node scripts/migrateSchema.js
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function migrate() {
  const client = await pool.connect();
  console.log('=================================================');
  console.log('  CRM Schema Migration');
  console.log('=================================================\n');

  try {
    // ── leads table: add missing columns ────────────────────────────────────
    console.log('📋 Patching leads table...');

    await client.query(`
      ALTER TABLE leads
        ADD COLUMN IF NOT EXISTS secondary_phone_number TEXT,
        ADD COLUMN IF NOT EXISTS excel_row_data         TEXT,
        ADD COLUMN IF NOT EXISTS whatsapp_country_code  TEXT DEFAULT '+91',
        ADD COLUMN IF NOT EXISTS age                    TEXT,
        ADD COLUMN IF NOT EXISTS qualification          TEXT,
        ADD COLUMN IF NOT EXISTS year_of_experience     TEXT,
        ADD COLUMN IF NOT EXISTS ielts_score            TEXT
    `);
    console.log('  ✅ leads: secondary_phone_number, excel_row_data, whatsapp_country_code, age, qualification, year_of_experience, ielts_score');

    // ── users table: add contact / profile columns ───────────────────────────
    console.log('\n📋 Patching users table...');

    await client.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS phone_number   TEXT,
        ADD COLUMN IF NOT EXISTS office_number  TEXT,
        ADD COLUMN IF NOT EXISTS dob            TEXT,
        ADD COLUMN IF NOT EXISTS profile_photo  TEXT
    `);
    console.log('  ✅ users: phone_number, office_number, dob, profile_photo');

    console.log('\n📋 Creating staff_documents table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS staff_documents (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        slot_number INTEGER NOT NULL,
        file_path   TEXT NOT NULL,
        file_name   TEXT NOT NULL,
        uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, slot_number)
      )
    `);
    console.log('  ✅ staff_documents table ready');

    // ── import_history table ─────────────────────────────────────────────────
    console.log('\n📋 Creating import_history table...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS import_history (
        id               SERIAL PRIMARY KEY,
        filename         TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        total_rows       INTEGER DEFAULT 0,
        successful_rows  INTEGER DEFAULT 0,
        skipped_rows     INTEGER DEFAULT 0,
        error_rows       INTEGER DEFAULT 0,
        created_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('  ✅ import_history table ready');

    // ── indexes for new columns ──────────────────────────────────────────────
    console.log('\n📋 Adding indexes...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_leads_secondary_phone ON leads(secondary_phone_number);
      CREATE INDEX IF NOT EXISTS idx_import_history_user   ON import_history(created_by);
      CREATE INDEX IF NOT EXISTS idx_staff_documents_user  ON staff_documents(user_id);
    `);
    console.log('  ✅ Indexes added');

    console.log('\n=================================================');
    console.log('  Migration completed successfully!');
    console.log('=================================================');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Migration failed:', err.message);
    console.error(err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
