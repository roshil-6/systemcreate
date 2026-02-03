const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const dbFile = path.join(dataDir, 'crm.json');
const backupDir = path.join(dataDir, 'backups');

// Ensure backup directory exists
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

function createBackup() {
  try {
    if (!fs.existsSync(dbFile)) {
      console.log('⚠️ No database file to backup');
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + '_' + 
                     new Date().toTimeString().split(' ')[0].replace(/:/g, '-');
    const backupFile = path.join(backupDir, `crm_backup_${timestamp}.json`);

    // Read current database
    const data = fs.readFileSync(dbFile, 'utf8');
    
    // Validate JSON before backing up
    try {
      JSON.parse(data);
    } catch (err) {
      console.error('❌ Database file is corrupted! Cannot create backup.');
      return;
    }

    // Create backup
    fs.writeFileSync(backupFile, data);
    
    // Keep only last 30 backups
    const backups = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('crm_backup_') && f.endsWith('.json'))
      .map(f => ({
        name: f,
        path: path.join(backupDir, f),
        time: fs.statSync(path.join(backupDir, f)).mtime
      }))
      .sort((a, b) => b.time - a.time);

    if (backups.length > 30) {
      backups.slice(30).forEach(backup => {
        fs.unlinkSync(backup.path);
        console.log(`🗑️ Deleted old backup: ${backup.name}`);
      });
    }

    const stats = fs.statSync(dbFile);
    console.log(`✅ Backup created: ${backupFile}`);
    console.log(`   Original size: ${(stats.size / 1024).toFixed(2)} KB`);
    console.log(`   Total backups: ${backups.length}`);
  } catch (error) {
    console.error('❌ Backup failed:', error.message);
  }
}

// Run backup
createBackup();
