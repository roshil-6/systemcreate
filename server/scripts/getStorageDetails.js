const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbFile = path.join(__dirname, '..', 'data', 'crm.db');
const db = new Database(dbFile);

console.log('=== CRM Storage Details ===\n');

// Database file info
const dbStats = fs.statSync(dbFile);
console.log('Database File:');
console.log('  Location:', dbFile);
console.log('  Size:', (dbStats.size / 1024 / 1024).toFixed(3), 'MB');
console.log('  Last Modified:', dbStats.mtime.toLocaleString());
console.log('');

// Get all tables
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();

console.log('=== Database Tables ===\n');

tables.forEach(table => {
  const tableName = table.name;
  console.log(`Table: ${tableName}`);
  
  // Get column info
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  console.log('  Columns:', columns.map(c => c.name).join(', '));
  
  // Get row count
  const count = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get();
  console.log('  Row Count:', count.count);
  console.log('');
});

// Get data statistics
console.log('=== Data Statistics ===\n');

const leads = db.prepare('SELECT COUNT(*) as count FROM leads').get();
const clients = db.prepare('SELECT COUNT(*) as count FROM clients').get();
const users = db.prepare('SELECT COUNT(*) as count FROM users').get();
const comments = db.prepare('SELECT COUNT(*) as count FROM comments').get();
const attendance = db.prepare('SELECT COUNT(*) as count FROM attendance').get();
const notifications = db.prepare('SELECT COUNT(*) as count FROM notifications').get();

console.log('Total Leads:', leads.count);
console.log('Total Clients:', clients.count);
console.log('Total Users:', users.count);
console.log('Total Comments:', comments.count);
console.log('Total Attendance Records:', attendance.count);
console.log('Total Notifications:', notifications.count);
console.log('');

// Leads by status
console.log('=== Leads by Status ===\n');
const statusCounts = db.prepare(`
  SELECT status, COUNT(*) as count 
  FROM leads 
  GROUP BY status 
  ORDER BY count DESC
`).all();

statusCounts.forEach(row => {
  console.log(`  ${row.status}: ${row.count}`);
});

// Users by role
console.log('\n=== Users by Role ===\n');
const roleCounts = db.prepare(`
  SELECT role, COUNT(*) as count 
  FROM users 
  GROUP BY role 
  ORDER BY count DESC
`).all();

roleCounts.forEach(row => {
  console.log(`  ${row.role}: ${row.count}`);
});

// Check backup files
const backupDir = path.join(__dirname, '..', 'data', 'backups');
if (fs.existsSync(backupDir)) {
  const backupFiles = fs.readdirSync(backupDir).filter(f => f.endsWith('.json'));
  const backupStats = backupFiles.map(f => {
    const filePath = path.join(backupDir, f);
    const stats = fs.statSync(filePath);
    return { name: f, size: stats.size, date: stats.mtime };
  });
  
  const totalBackupSize = backupStats.reduce((sum, f) => sum + f.size, 0);
  
  console.log('\n=== Backup Files ===\n');
  console.log('Total Backup Files:', backupFiles.length);
  console.log('Total Backup Size:', (totalBackupSize / 1024 / 1024).toFixed(2), 'MB');
  if (backupStats.length > 0) {
    console.log('Oldest Backup:', backupStats.sort((a, b) => a.date - b.date)[0].name);
    console.log('Newest Backup:', backupStats.sort((a, b) => b.date - a.date)[0].name);
  }
}

// Database file sizes
console.log('\n=== Database Files ===\n');
const dataDir = path.join(__dirname, '..', 'data');
const dbFiles = ['crm.db', 'crm.db-shm', 'crm.db-wal', 'crm.json', 'crm.json.backup'];
dbFiles.forEach(fileName => {
  const filePath = path.join(dataDir, fileName);
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    console.log(`${fileName}:`, (stats.size / 1024 / 1024).toFixed(3), 'MB');
  }
});

db.close();
console.log('\n✅ Storage details report complete');
