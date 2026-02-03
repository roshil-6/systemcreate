const { Pool } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') || process.env.DATABASE_URL?.includes('127.0.0.1')
    ? false
    : { rejectUnauthorized: false },
});

async function addMissingClientColumns() {
  const client = await pool.connect();

  try {
    console.log('🔧 Adding missing columns to clients table...\n');

    const columnsToAdd = [
      { name: 'assessment_authority', type: 'TEXT' },
      { name: 'occupation_mapped', type: 'TEXT' },
      { name: 'registration_fee_paid', type: 'BOOLEAN DEFAULT false' },
      { name: 'target_country', type: 'TEXT' },
      { name: 'residing_country', type: 'TEXT' },
      { name: 'lead_id', type: 'INTEGER' },
      { name: 'created_by', type: 'INTEGER' },
      { name: 'completed_actions', type: 'TEXT[] DEFAULT ARRAY[]::TEXT[]' },
      { name: 'is_active', type: 'BOOLEAN DEFAULT true' },
      { name: 'processing_staff_id', type: 'INTEGER' }
    ];

    for (const column of columnsToAdd) {
      try {
        await client.query(`
          ALTER TABLE clients 
          ADD COLUMN IF NOT EXISTS ${column.name} ${column.type}
        `);
        console.log(`✅ ${column.name} column added (or already exists)`);
      } catch (error) {
        console.log(`ℹ️  ${column.name} column check: ${error.message}`);
      }
    }

    // Add foreign key for lead_id if it doesn't exist
    try {
      await client.query(`
        ALTER TABLE clients 
        ADD CONSTRAINT fk_clients_lead_id 
        FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
      `);
      console.log('✅ Foreign key for lead_id added');
    } catch (error) {
      console.log('ℹ️  Foreign key for lead_id check (might already exist)');
    }

    // Add foreign key for created_by if it doesn't exist
    try {
      await client.query(`
        ALTER TABLE clients 
        ADD CONSTRAINT fk_clients_created_by 
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      `);
      console.log('✅ Foreign key for created_by added');
    } catch (error) {
      console.log('ℹ️  Foreign key for created_by check (might already exist)');
    }

    console.log('\n✅ Schema update attempted!');

  } catch (error) {
    console.error('❌ Error in migration script:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

addMissingClientColumns()
  .then(() => {
    console.log('Migration completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
