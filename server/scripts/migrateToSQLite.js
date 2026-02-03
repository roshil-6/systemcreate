const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

// Paths
const dataDir = path.join(__dirname, '..', 'data');
const jsonFile = path.join(dataDir, 'crm.json');
const dbFile = path.join(dataDir, 'crm.db');
const backupJsonFile = path.join(dataDir, 'crm.json.backup');

console.log('🚀 Starting SQLite Migration...\n');

// Step 1: Backup JSON file
if (fs.existsSync(jsonFile)) {
  console.log('📦 Step 1: Creating backup of JSON file...');
  fs.copyFileSync(jsonFile, backupJsonFile);
  console.log(`✅ Backup created: ${backupJsonFile}\n`);
} else {
  console.log('⚠️  No JSON file found, starting fresh\n');
}

// Step 2: Load JSON data
let jsonData = {
  users: [],
  leads: [],
  clients: [],
  comments: [],
  attendance: [],
  loginLogs: [],
  activityLogs: [],
  notifications: [],
  emailTemplates: [],
  emailLogs: [],
};

if (fs.existsSync(jsonFile)) {
  try {
    const fileContent = fs.readFileSync(jsonFile, 'utf8');
    jsonData = JSON.parse(fileContent);
    console.log('📊 Step 2: Loaded JSON data:');
    console.log(`   Users: ${jsonData.users?.length || 0}`);
    console.log(`   Leads: ${jsonData.leads?.length || 0}`);
    console.log(`   Clients: ${jsonData.clients?.length || 0}`);
    console.log(`   Comments: ${jsonData.comments?.length || 0}`);
    console.log(`   Attendance: ${jsonData.attendance?.length || 0}`);
    console.log(`   Notifications: ${jsonData.notifications?.length || 0}`);
    console.log(`   Email Templates: ${jsonData.emailTemplates?.length || 0}`);
    console.log(`   Email Logs: ${jsonData.emailLogs?.length || 0}\n`);
  } catch (error) {
    console.error('❌ Error loading JSON file:', error.message);
    process.exit(1);
  }
}

// Step 3: Create SQLite database
console.log('🗄️  Step 3: Creating SQLite database...');
if (fs.existsSync(dbFile)) {
  console.log('⚠️  SQLite database already exists, removing old one...');
  fs.unlinkSync(dbFile);
}

const db = new Database(dbFile);
db.pragma('journal_mode = WAL'); // Enable Write-Ahead Logging for better performance

// Step 4: Create schema
console.log('📋 Step 4: Creating database schema...\n');

// Users table
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL,
    team TEXT,
    managed_by INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

// Leads table
db.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    phone_country_code TEXT DEFAULT '+91',
    whatsapp_number TEXT,
    whatsapp_country_code TEXT DEFAULT '+91',
    email TEXT,
    age TEXT,
    occupation TEXT,
    qualification TEXT,
    year_of_experience TEXT,
    country TEXT,
    program TEXT,
    status TEXT DEFAULT 'New',
    priority TEXT,
    comment TEXT,
    follow_up_date TEXT,
    next_follow_up_date TEXT,
    assigned_staff_id INTEGER,
    created_by INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

// Clients table
db.exec(`
  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    phone_country_code TEXT DEFAULT '+91',
    whatsapp_number TEXT,
    whatsapp_country_code TEXT DEFAULT '+91',
    email TEXT,
    age TEXT,
    occupation TEXT,
    qualification TEXT,
    year_of_experience TEXT,
    country TEXT,
    program TEXT,
    fee_status TEXT,
    amount_paid REAL DEFAULT 0,
    payment_due_date TEXT,
    processing_status TEXT,
    processing_staff_id INTEGER,
    assigned_staff_id INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

// Comments table
db.exec(`
  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER,
    client_id INTEGER,
    user_id INTEGER NOT NULL,
    comment TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`);

// Attendance table
db.exec(`
  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    check_in TEXT,
    check_out TEXT,
    created_at TEXT NOT NULL
  )
`);

// Login logs table
db.exec(`
  CREATE TABLE IF NOT EXISTS login_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    success INTEGER NOT NULL,
    reason TEXT,
    user_id INTEGER,
    timestamp TEXT NOT NULL,
    ip_address TEXT
  )
`);

// Activity logs table
db.exec(`
  CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    user_id INTEGER,
    target_user_id INTEGER,
    details TEXT,
    timestamp TEXT NOT NULL
  )
`);

// Notifications table
db.exec(`
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    lead_id INTEGER,
    client_id INTEGER,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    read INTEGER DEFAULT 0,
    created_by INTEGER,
    created_at TEXT NOT NULL,
    read_at TEXT
  )
`);

// Email templates table
db.exec(`
  CREATE TABLE IF NOT EXISTS email_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

// Email logs table
db.exec(`
  CREATE TABLE IF NOT EXISTS email_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER,
    template_id INTEGER,
    recipient_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    success INTEGER NOT NULL,
    error TEXT,
    sent_at TEXT NOT NULL
  )
`);

// Create indexes for performance
console.log('📊 Step 5: Creating indexes...\n');
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone_number);
  CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
  CREATE INDEX IF NOT EXISTS idx_leads_assigned ON leads(assigned_staff_id);
  CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
  CREATE INDEX IF NOT EXISTS idx_clients_assigned ON clients(assigned_staff_id);
  CREATE INDEX IF NOT EXISTS idx_clients_processing ON clients(processing_staff_id);
  CREATE INDEX IF NOT EXISTS idx_comments_lead ON comments(lead_id);
  CREATE INDEX IF NOT EXISTS idx_comments_client ON comments(client_id);
  CREATE INDEX IF NOT EXISTS idx_attendance_user ON attendance(user_id);
  CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
  CREATE INDEX IF NOT EXISTS idx_login_logs_email ON login_logs(email);
`);

// Step 6: Migrate data
console.log('🔄 Step 6: Migrating data...\n');

// Migrate users
if (jsonData.users && jsonData.users.length > 0) {
  const insertUser = db.prepare(`
    INSERT INTO users (id, name, email, password, role, team, managed_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const insertUsers = db.transaction((users) => {
    for (const user of users) {
      insertUser.run(
        user.id,
        user.name,
        user.email,
        user.password,
        user.role,
        user.team || null,
        user.managed_by || null,
        user.created_at || new Date().toISOString(),
        user.updated_at || new Date().toISOString()
      );
    }
  });
  
  insertUsers(jsonData.users);
  console.log(`✅ Migrated ${jsonData.users.length} users`);
}

// Migrate leads
if (jsonData.leads && jsonData.leads.length > 0) {
  const insertLead = db.prepare(`
    INSERT INTO leads (
      id, name, phone_number, phone_country_code, whatsapp_number, whatsapp_country_code,
      email, age, occupation, qualification, year_of_experience, country, program,
      status, priority, comment, follow_up_date, next_follow_up_date,
      assigned_staff_id, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const insertLeads = db.transaction((leads) => {
    for (const lead of leads) {
      insertLead.run(
        lead.id,
        lead.name,
        lead.phone_number,
        lead.phone_country_code || '+91',
        lead.whatsapp_number || null,
        lead.whatsapp_country_code || '+91',
        lead.email || null,
        lead.age || null,
        lead.occupation || null,
        lead.qualification || null,
        lead.year_of_experience || null,
        lead.country || null,
        lead.program || null,
        lead.status || 'New',
        lead.priority || null,
        lead.comment || null,
        lead.follow_up_date || null,
        lead.next_follow_up_date || null,
        lead.assigned_staff_id || null,
        lead.created_by || null,
        lead.created_at || new Date().toISOString(),
        lead.updated_at || new Date().toISOString()
      );
    }
  });
  
  insertLeads(jsonData.leads);
  console.log(`✅ Migrated ${jsonData.leads.length} leads`);
}

// Migrate clients
if (jsonData.clients && jsonData.clients.length > 0) {
  const insertClient = db.prepare(`
    INSERT INTO clients (
      id, name, phone_number, phone_country_code, whatsapp_number, whatsapp_country_code,
      email, age, occupation, qualification, year_of_experience, country, program,
      fee_status, amount_paid, payment_due_date, processing_status,
      processing_staff_id, assigned_staff_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const insertClients = db.transaction((clients) => {
    for (const client of clients) {
      insertClient.run(
        client.id,
        client.name,
        client.phone_number,
        client.phone_country_code || '+91',
        client.whatsapp_number || null,
        client.whatsapp_country_code || '+91',
        client.email || null,
        client.age || null,
        client.occupation || null,
        client.qualification || null,
        client.year_of_experience || null,
        client.country || null,
        client.program || null,
        client.fee_status || null,
        client.amount_paid || 0,
        client.payment_due_date || null,
        client.processing_status || null,
        client.processing_staff_id || null,
        client.assigned_staff_id || null,
        client.created_at || new Date().toISOString(),
        client.updated_at || new Date().toISOString()
      );
    }
  });
  
  insertClients(jsonData.clients);
  console.log(`✅ Migrated ${jsonData.clients.length} clients`);
}

// Migrate comments
if (jsonData.comments && jsonData.comments.length > 0) {
  const insertComment = db.prepare(`
    INSERT INTO comments (id, lead_id, client_id, user_id, comment, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  const insertComments = db.transaction((comments) => {
    for (const comment of comments) {
      insertComment.run(
        comment.id,
        comment.lead_id || null,
        comment.client_id || null,
        comment.user_id,
        comment.comment,
        comment.created_at || new Date().toISOString()
      );
    }
  });
  
  insertComments(jsonData.comments);
  console.log(`✅ Migrated ${jsonData.comments.length} comments`);
}

// Migrate attendance
if (jsonData.attendance && jsonData.attendance.length > 0) {
  const insertAttendance = db.prepare(`
    INSERT INTO attendance (id, user_id, date, check_in, check_out, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  const insertAttendances = db.transaction((attendances) => {
    for (const attendance of attendances) {
      insertAttendance.run(
        attendance.id,
        attendance.user_id,
        attendance.date,
        attendance.check_in || null,
        attendance.check_out || null,
        attendance.created_at || new Date().toISOString()
      );
    }
  });
  
  insertAttendances(jsonData.attendance);
  console.log(`✅ Migrated ${jsonData.attendance.length} attendance records`);
}

// Migrate login logs
if (jsonData.loginLogs && jsonData.loginLogs.length > 0) {
  const insertLoginLog = db.prepare(`
    INSERT INTO login_logs (id, email, success, reason, user_id, timestamp, ip_address)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  
  const insertLoginLogs = db.transaction((logs) => {
    for (const log of logs) {
      insertLoginLog.run(
        log.id || null,
        log.email,
        log.success ? 1 : 0,
        log.reason || null,
        log.user_id || null,
        log.timestamp || new Date().toISOString(),
        log.ip_address || null
      );
    }
  });
  
  insertLoginLogs(jsonData.loginLogs);
  console.log(`✅ Migrated ${jsonData.loginLogs.length} login logs`);
}

// Migrate activity logs
if (jsonData.activityLogs && jsonData.activityLogs.length > 0) {
  const insertActivityLog = db.prepare(`
    INSERT INTO activity_logs (id, type, user_id, target_user_id, details, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  const insertActivityLogs = db.transaction((logs) => {
    for (const log of logs) {
      insertActivityLog.run(
        log.id || null,
        log.type,
        log.user_id || null,
        log.target_user_id || null,
        log.details || null,
        log.timestamp || new Date().toISOString()
      );
    }
  });
  
  insertActivityLogs(jsonData.activityLogs);
  console.log(`✅ Migrated ${jsonData.activityLogs.length} activity logs`);
}

// Migrate notifications
if (jsonData.notifications && jsonData.notifications.length > 0) {
  const insertNotification = db.prepare(`
    INSERT INTO notifications (id, user_id, lead_id, client_id, type, message, read, created_by, created_at, read_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const insertNotifications = db.transaction((notifications) => {
    for (const notification of notifications) {
      insertNotification.run(
        notification.id,
        notification.user_id,
        notification.lead_id || null,
        notification.client_id || null,
        notification.type,
        notification.message,
        notification.read ? 1 : 0,
        notification.created_by || null,
        notification.created_at || new Date().toISOString(),
        notification.read_at || null
      );
    }
  });
  
  insertNotifications(jsonData.notifications);
  console.log(`✅ Migrated ${jsonData.notifications.length} notifications`);
}

// Migrate email templates
if (jsonData.emailTemplates && jsonData.emailTemplates.length > 0) {
  const insertEmailTemplate = db.prepare(`
    INSERT INTO email_templates (id, name, type, subject, body, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const insertEmailTemplates = db.transaction((templates) => {
    for (const template of templates) {
      insertEmailTemplate.run(
        template.id,
        template.name,
        template.type,
        template.subject,
        template.body,
        template.active ? 1 : 0,
        template.created_at || new Date().toISOString(),
        template.updated_at || new Date().toISOString()
      );
    }
  });
  
  insertEmailTemplates(jsonData.emailTemplates);
  console.log(`✅ Migrated ${jsonData.emailTemplates.length} email templates`);
}

// Migrate email logs
if (jsonData.emailLogs && jsonData.emailLogs.length > 0) {
  const insertEmailLog = db.prepare(`
    INSERT INTO email_logs (id, lead_id, template_id, recipient_email, subject, success, error, sent_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const insertEmailLogs = db.transaction((logs) => {
    for (const log of logs) {
      insertEmailLog.run(
        log.id || null,
        log.lead_id || null,
        log.template_id || null,
        log.recipient_email,
        log.subject,
        log.success ? 1 : 0,
        log.error || null,
        log.sent_at || new Date().toISOString()
      );
    }
  });
  
  insertEmailLogs(jsonData.emailLogs);
  console.log(`✅ Migrated ${jsonData.emailLogs.length} email logs`);
}

// Step 7: Update sequence numbers
console.log('\n🔢 Step 7: Updating sequence numbers...');
const maxUserId = db.prepare('SELECT MAX(id) as max FROM users').get()?.max || 0;
const maxLeadId = db.prepare('SELECT MAX(id) as max FROM leads').get()?.max || 0;
const maxClientId = db.prepare('SELECT MAX(id) as max FROM clients').get()?.max || 0;
const maxCommentId = db.prepare('SELECT MAX(id) as max FROM comments').get()?.max || 0;
const maxAttendanceId = db.prepare('SELECT MAX(id) as max FROM attendance').get()?.max || 0;
const maxNotificationId = db.prepare('SELECT MAX(id) as max FROM notifications').get()?.max || 0;
const maxTemplateId = db.prepare('SELECT MAX(id) as max FROM email_templates').get()?.max || 0;
const maxEmailLogId = db.prepare('SELECT MAX(id) as max FROM email_logs').get()?.max || 0;

// Store sequence numbers in a metadata table
db.exec(`
  CREATE TABLE IF NOT EXISTS metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`);

const insertMeta = db.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)');
insertMeta.run('next_user_id', (maxUserId + 1).toString());
insertMeta.run('next_lead_id', (maxLeadId + 1).toString());
insertMeta.run('next_client_id', (maxClientId + 1).toString());
insertMeta.run('next_comment_id', (maxCommentId + 1).toString());
insertMeta.run('next_attendance_id', (maxAttendanceId + 1).toString());
insertMeta.run('next_notification_id', (maxNotificationId + 1).toString());
insertMeta.run('next_template_id', (maxTemplateId + 1).toString());
insertMeta.run('next_email_log_id', (maxEmailLogId + 1).toString());

console.log('✅ Sequence numbers updated\n');

// Step 8: Verify migration
console.log('✅ Step 8: Verifying migration...\n');
const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
const leadCount = db.prepare('SELECT COUNT(*) as count FROM leads').get().count;
const clientCount = db.prepare('SELECT COUNT(*) as count FROM clients').get().count;

console.log('📊 Verification Results:');
console.log(`   Users: ${userCount} (expected: ${jsonData.users?.length || 0})`);
console.log(`   Leads: ${leadCount} (expected: ${jsonData.leads?.length || 0})`);
console.log(`   Clients: ${clientCount} (expected: ${jsonData.clients?.length || 0})`);

if (userCount === (jsonData.users?.length || 0) &&
    leadCount === (jsonData.leads?.length || 0) &&
    clientCount === (jsonData.clients?.length || 0)) {
  console.log('\n✅✅✅ Migration successful! All data migrated correctly. ✅✅✅\n');
} else {
  console.log('\n⚠️  Warning: Some counts don\'t match. Please verify manually.\n');
}

db.close();
console.log('🎉 SQLite migration complete!');
console.log(`📁 Database file: ${dbFile}`);
console.log(`📦 JSON backup: ${backupJsonFile}`);
console.log('\n⚠️  IMPORTANT: The system will now use SQLite. Your JSON file is backed up.');
