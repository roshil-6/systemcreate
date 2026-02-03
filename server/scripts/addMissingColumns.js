const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function addMissingColumns() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Checking and adding missing columns to leads table...\n');
    
    await client.query('BEGIN');
    
    // Check if source column exists, if not add it
    try {
      await client.query(`
        ALTER TABLE leads ADD COLUMN IF NOT EXISTS source TEXT
      `);
      console.log('✅ source column added (or already exists)');
    } catch (error) {
      if (error.message.includes('duplicate column') || error.message.includes('already exists')) {
        console.log('ℹ️  source column already exists');
      } else {
        throw error;
      }
    }
    
    // Check if ielts_score column exists, if not add it
    try {
      await client.query(`
        ALTER TABLE leads ADD COLUMN IF NOT EXISTS ielts_score TEXT
      `);
      console.log('✅ ielts_score column added (or already exists)');
    } catch (error) {
      if (error.message.includes('duplicate column') || error.message.includes('already exists')) {
        console.log('ℹ️  ielts_score column already exists');
      } else {
        throw error;
      }
    }
    
    // Check if follow_up_status column exists, if not add it
    try {
      await client.query(`
        ALTER TABLE leads ADD COLUMN IF NOT EXISTS follow_up_status TEXT DEFAULT 'Pending'
      `);
      console.log('✅ follow_up_status column added (or already exists)');
    } catch (error) {
      if (error.message.includes('duplicate column') || error.message.includes('already exists')) {
        console.log('ℹ️  follow_up_status column already exists');
      } else {
        throw error;
      }
    }
    
    await client.query('COMMIT');
    console.log('\n✅ All missing columns added successfully!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error adding columns:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

addMissingColumns()
  .then(() => {
    console.log('Migration completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
