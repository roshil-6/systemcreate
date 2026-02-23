require('dotenv').config();
const db = require('../config/database');

async function migrate() {
    try {
        console.log('🔄 Adding secondary_phone_number to leads table...');
        // We use a safe check to avoid errors if the column already exists
        await db.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='secondary_phone_number') THEN
          ALTER TABLE leads ADD COLUMN secondary_phone_number TEXT;
        END IF;
      END $$;
    `);
        console.log('✅ secondary_phone_number column added or already exists.');
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
    } finally {
        process.exit(0);
    }
}

migrate();
