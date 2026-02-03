const fs = require('fs');
const path = require('path');
const readline = require('readline');

const dataDir = path.join(__dirname, '..', 'data');
const dbFile = path.join(dataDir, 'crm.json');
const backupDir = path.join(dataDir, 'backups');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function listBackups() {
  if (!fs.existsSync(backupDir)) {
    console.log('❌ No backup directory found');
    return [];
  }

  const backups = fs.readdirSync(backupDir)
    .filter(f => f.startsWith('crm_backup_') && f.endsWith('.json'))
    .map(f => {
      const filePath = path.join(backupDir, f);
      const stats = fs.statSync(filePath);
      return {
        name: f,
        path: filePath,
        time: stats.mtime,
        size: stats.size
      };
    })
    .sort((a, b) => b.time - a.time);

  return backups;
}

function restoreBackup(backupPath) {
  try {
    // Create backup of current database before restoring
    if (fs.existsSync(dbFile)) {
      const currentBackup = path.join(backupDir, `crm_pre_restore_${Date.now()}.json`);
      fs.copyFileSync(dbFile, currentBackup);
      console.log(`✅ Current database backed up to: ${currentBackup}`);
    }

    // Restore from backup
    const backupData = fs.readFileSync(backupPath, 'utf8');
    
    // Validate JSON
    try {
      JSON.parse(backupData);
    } catch (err) {
      console.error('❌ Backup file is corrupted! Cannot restore.');
      return false;
    }

    // Write to database file
    fs.writeFileSync(dbFile, backupData);
    console.log(`✅ Database restored from: ${backupPath}`);
    return true;
  } catch (error) {
    console.error('❌ Restore failed:', error.message);
    return false;
  }
}

// List available backups
const backups = listBackups();

if (backups.length === 0) {
  console.log('❌ No backups found');
  process.exit(1);
}

console.log('\n📦 Available Backups:');
console.log('─'.repeat(80));
backups.forEach((backup, index) => {
  console.log(`${index + 1}. ${backup.name}`);
  console.log(`   Date: ${backup.time.toLocaleString()}`);
  console.log(`   Size: ${(backup.size / 1024).toFixed(2)} KB`);
  console.log('');
});

rl.question('Enter backup number to restore (or "q" to quit): ', (answer) => {
  if (answer.toLowerCase() === 'q') {
    rl.close();
    process.exit(0);
  }

  const index = parseInt(answer) - 1;
  if (index >= 0 && index < backups.length) {
    const backup = backups[index];
    console.log(`\n⚠️ WARNING: This will overwrite your current database!`);
    rl.question('Are you sure? (yes/no): ', (confirm) => {
      if (confirm.toLowerCase() === 'yes') {
        restoreBackup(backup.path);
      } else {
        console.log('Restore cancelled');
      }
      rl.close();
    });
  } else {
    console.log('Invalid selection');
    rl.close();
  }
});
