const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../data/crm.db');
const db = new Database(dbPath);

console.log('🔄 Starting follow-up fields migration...\n');

try {
  // Add follow_up_status column if it doesn't exist
  try {
    db.prepare(`
      ALTER TABLE leads ADD COLUMN follow_up_status TEXT DEFAULT 'Pending'
    `).run();
    console.log('✅ Added follow_up_status column');
  } catch (error) {
    if (error.message.includes('duplicate column')) {
      console.log('ℹ️  follow_up_status column already exists');
    } else {
      throw error;
    }
  }

  // Update existing records: set follow_up_status to 'Pending' if null
  const updateResult = db.prepare(`
    UPDATE leads 
    SET follow_up_status = 'Pending' 
    WHERE follow_up_status IS NULL
  `).run();
  console.log(`✅ Updated ${updateResult.changes} leads with default follow_up_status`);

  // Note: We're NOT dropping next_follow_up_date column to preserve existing data
  // The column will remain but won't be used in new code
  console.log('ℹ️  next_follow_up_date column kept for data preservation (not used in new code)');

  console.log('\n✅ Migration completed successfully!');
  db.close();
} catch (error) {
  console.error('❌ Migration failed:', error);
  db.close();
  process.exit(1);
}
