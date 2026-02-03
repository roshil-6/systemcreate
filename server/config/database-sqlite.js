const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbFile = path.join(dataDir, 'crm.db');

// Initialize SQLite database
let db;
try {
  db = new Database(dbFile);
  db.pragma('journal_mode = WAL'); // Enable Write-Ahead Logging for better performance
  db.pragma('foreign_keys = ON'); // Enable foreign key constraints
  console.log('✅ SQLite database connected');
} catch (error) {
  console.error('❌ SQLite database connection error:', error);
  throw error;
}

// Helper to get next ID from metadata table
function getNextId(key) {
  const meta = db.prepare('SELECT value FROM metadata WHERE key = ?').get(key);
  if (!meta) {
    // Initialize if not exists
    db.prepare('INSERT INTO metadata (key, value) VALUES (?, ?)').run(key, '1');
    return 1;
  }
  const nextId = parseInt(meta.value, 10);
  db.prepare('UPDATE metadata SET value = ? WHERE key = ?').run((nextId + 1).toString(), key);
  return nextId;
}

// Helper to convert SQLite row to object
function rowToObject(row) {
  if (!row) return null;
  const obj = {};
  for (const key in row) {
    obj[key] = row[key];
  }
  return obj;
}

// Database API (same interface as before)
const database = {
  // Users
  getUsers: (filter = {}) => {
    let query = 'SELECT * FROM users WHERE 1=1';
    const params = [];
    
    if (filter.id) {
      query += ' AND id = ?';
      params.push(filter.id);
    }
    if (filter.email) {
      query += ' AND email = ?';
      params.push(filter.email);
    }
    if (filter.role) {
      query += ' AND role = ?';
      params.push(filter.role);
    }
    if (filter.team) {
      query += ' AND team = ?';
      params.push(filter.team);
    }
    if (filter.managed_by !== undefined) {
      query += ' AND managed_by = ?';
      params.push(filter.managed_by);
    }
    
    const stmt = db.prepare(query);
    const rows = params.length > 0 ? stmt.all(...params) : stmt.all();
    return rows;
  },
  
  getTeamMembers: (team) => {
    return db.prepare('SELECT * FROM users WHERE team = ?').all(team);
  },
  
  createUser: (userData) => {
    const id = getNextId('next_user_id');
    const now = new Date().toISOString();
    
    db.prepare(`
      INSERT INTO users (id, name, email, password, role, team, managed_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      userData.name,
      userData.email,
      userData.password,
      userData.role,
      userData.team || null,
      userData.managed_by || null,
      userData.created_at || now,
      userData.updated_at || now
    );
    
    return database.getUsers({ id })[0];
  },
  
  updateUser: (id, updates) => {
    const updatesList = [];
    const params = [];
    
    if (updates.name !== undefined) {
      updatesList.push('name = ?');
      params.push(updates.name);
    }
    if (updates.email !== undefined) {
      updatesList.push('email = ?');
      params.push(updates.email);
    }
    if (updates.password !== undefined) {
      updatesList.push('password = ?');
      params.push(updates.password);
    }
    if (updates.role !== undefined) {
      updatesList.push('role = ?');
      params.push(updates.role);
    }
    if (updates.team !== undefined) {
      updatesList.push('team = ?');
      params.push(updates.team);
    }
    if (updates.managed_by !== undefined) {
      updatesList.push('managed_by = ?');
      params.push(updates.managed_by);
    }
    
    updatesList.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);
    
    db.prepare(`UPDATE users SET ${updatesList.join(', ')} WHERE id = ?`).run(...params);
    return database.getUsers({ id })[0];
  },
  
  deleteUser: (id) => {
    const result = db.prepare('DELETE FROM users WHERE id = ?').run(id);
    return result.changes > 0;
  },
  
  // Leads
  getLeads: (filter = {}) => {
    let query = 'SELECT * FROM leads WHERE 1=1';
    const params = [];
    
    if (filter.id !== undefined) {
      query += ' AND id = ?';
      params.push(Number(filter.id));
    }
    if (filter.assigned_staff_id !== undefined && filter.assigned_staff_id !== null) {
      query += ' AND assigned_staff_id = ?';
      params.push(Number(filter.assigned_staff_id));
    }
    if (filter.status) {
      query += ' AND status = ?';
      params.push(filter.status);
    }
    if (filter.search) {
      query += ' AND (name LIKE ? OR phone_number LIKE ? OR email LIKE ?)';
      const searchTerm = `%${filter.search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }
    
    query += ' ORDER BY updated_at DESC, created_at DESC';
    
    const stmt = db.prepare(query);
    const rows = params.length > 0 ? stmt.all(...params) : stmt.all();
    return rows;
  },
  
  createLead: (leadData) => {
    const id = getNextId('next_lead_id');
    const now = new Date().toISOString();
    
    db.prepare(`
      INSERT INTO leads (
        id, name, phone_number, phone_country_code, whatsapp_number, whatsapp_country_code,
        email, age, occupation, qualification, year_of_experience, country, program,
        status, priority, comment, follow_up_date, next_follow_up_date,
        assigned_staff_id, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      leadData.name,
      leadData.phone_number,
      leadData.phone_country_code || '+91',
      leadData.whatsapp_number || null,
      leadData.whatsapp_country_code || '+91',
      leadData.email || null,
      leadData.age || null,
      leadData.occupation || null,
      leadData.qualification || null,
      leadData.year_of_experience || null,
      leadData.country || null,
      leadData.program || null,
      leadData.status || 'New',
      leadData.priority || null,
      leadData.comment || null,
      leadData.follow_up_date || null,
      leadData.next_follow_up_date || null,
      leadData.assigned_staff_id || null,
      leadData.created_by || null,
      leadData.created_at || now,
      leadData.updated_at || now
    );
    
    return database.getLeads({ id })[0];
  },
  
  updateLead: (id, updates) => {
    const updatesList = [];
    const params = [];
    
    const allowedFields = [
      'name', 'phone_number', 'phone_country_code', 'whatsapp_number', 'whatsapp_country_code',
      'email', 'age', 'occupation', 'qualification', 'year_of_experience', 'country', 'program',
      'status', 'priority', 'comment', 'follow_up_date', 'next_follow_up_date',
      'assigned_staff_id'
    ];
    
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        updatesList.push(`${field} = ?`);
        params.push(updates[field]);
      }
    }
    
    if (updatesList.length === 0) return database.getLeads({ id })[0];
    
    updatesList.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(Number(id));
    
    db.prepare(`UPDATE leads SET ${updatesList.join(', ')} WHERE id = ?`).run(...params);
    return database.getLeads({ id })[0];
  },
  
  deleteLead: (id) => {
    const result = db.prepare('DELETE FROM leads WHERE id = ?').run(Number(id));
    return result.changes > 0;
  },
  
  // Comments
  getComments: (leadId) => {
    if (leadId === null || leadId === undefined) {
      return db.prepare('SELECT * FROM comments ORDER BY created_at ASC').all();
    }
    return db.prepare('SELECT * FROM comments WHERE lead_id = ? ORDER BY created_at ASC').all(leadId);
  },
  
  createComment: (commentData) => {
    const id = getNextId('next_comment_id');
    const now = new Date().toISOString();
    
    db.prepare(`
      INSERT INTO comments (id, lead_id, client_id, user_id, comment, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      commentData.lead_id || null,
      commentData.client_id || null,
      commentData.user_id,
      commentData.comment,
      commentData.created_at || now
    );
    
    return db.prepare('SELECT * FROM comments WHERE id = ?').get(id);
  },
  
  // Attendance
  getAttendance: (filter = {}) => {
    let query = 'SELECT * FROM attendance WHERE 1=1';
    const params = [];
    
    if (filter.user_id) {
      query += ' AND user_id = ?';
      params.push(filter.user_id);
    }
    if (filter.date) {
      query += ' AND date = ?';
      params.push(filter.date);
    }
    if (filter.startDate) {
      query += ' AND date >= ?';
      params.push(filter.startDate);
    }
    if (filter.endDate) {
      query += ' AND date <= ?';
      params.push(filter.endDate);
    }
    
    query += ' ORDER BY date DESC';
    
    const stmt = db.prepare(query);
    const rows = params.length > 0 ? stmt.all(...params) : stmt.all();
    return rows;
  },
  
  createAttendance: (attendanceData) => {
    const id = getNextId('next_attendance_id');
    const now = new Date().toISOString();
    
    db.prepare(`
      INSERT INTO attendance (id, user_id, date, check_in, check_out, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      attendanceData.user_id,
      attendanceData.date,
      attendanceData.check_in || null,
      attendanceData.check_out || null,
      attendanceData.created_at || now
    );
    
    return db.prepare('SELECT * FROM attendance WHERE id = ?').get(id);
  },
  
  updateAttendance: (id, updates) => {
    const updatesList = [];
    const params = [];
    
    if (updates.check_in !== undefined) {
      updatesList.push('check_in = ?');
      params.push(updates.check_in);
    }
    if (updates.check_out !== undefined) {
      updatesList.push('check_out = ?');
      params.push(updates.check_out);
    }
    if (updates.date !== undefined) {
      updatesList.push('date = ?');
      params.push(updates.date);
    }
    
    if (updatesList.length === 0) return db.prepare('SELECT * FROM attendance WHERE id = ?').get(id);
    
    params.push(id);
    db.prepare(`UPDATE attendance SET ${updatesList.join(', ')} WHERE id = ?`).run(...params);
    return db.prepare('SELECT * FROM attendance WHERE id = ?').get(id);
  },
  
  // Helper to get user name
  getUserName: (userId) => {
    const user = db.prepare('SELECT name FROM users WHERE id = ?').get(userId);
    return user?.name || null;
  },
  
  // Activity Logs
  getActivityLogs: (filter = {}) => {
    let query = 'SELECT * FROM activity_logs WHERE 1=1';
    const params = [];
    
    if (filter.user_id) {
      query += ' AND user_id = ?';
      params.push(filter.user_id);
    }
    if (filter.type) {
      query += ' AND type = ?';
      params.push(filter.type);
    }
    
    query += ' ORDER BY timestamp DESC';
    
    const stmt = db.prepare(query);
    const rows = params.length > 0 ? stmt.all(...params) : stmt.all();
    return rows;
  },
  
  createActivityLog: (logData) => {
    db.prepare(`
      INSERT INTO activity_logs (type, user_id, target_user_id, details, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      logData.type,
      logData.user_id || null,
      logData.target_user_id || null,
      logData.details || null,
      logData.timestamp || new Date().toISOString()
    );
  },
  
  // Login Logs
  getLoginLogs: (filter = {}) => {
    let query = 'SELECT * FROM login_logs WHERE 1=1';
    const params = [];
    
    if (filter.email) {
      query += ' AND email = ?';
      params.push(filter.email);
    }
    if (filter.success !== undefined) {
      query += ' AND success = ?';
      params.push(filter.success ? 1 : 0);
    }
    if (filter.user_id) {
      query += ' AND user_id = ?';
      params.push(filter.user_id);
    }
    
    query += ' ORDER BY timestamp DESC';
    
    const stmt = db.prepare(query);
    const rows = params.length > 0 ? stmt.all(...params) : stmt.all();
    // Convert success back to boolean
    return rows.map(row => ({
      ...row,
      success: row.success === 1
    }));
  },
  
  createLoginLog: (logData) => {
    db.prepare(`
      INSERT INTO login_logs (email, success, reason, user_id, timestamp, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      logData.email,
      logData.success ? 1 : 0,
      logData.reason || null,
      logData.user_id || null,
      logData.timestamp || new Date().toISOString(),
      logData.ip_address || null
    );
  },
  
  // Notifications
  getNotifications: (filter = {}) => {
    let query = 'SELECT * FROM notifications WHERE 1=1';
    const params = [];
    
    if (filter.id !== undefined) {
      query += ' AND id = ?';
      params.push(Number(filter.id));
    }
    if (filter.user_id !== undefined && filter.user_id !== null) {
      query += ' AND user_id = ?';
      params.push(Number(filter.user_id));
    }
    if (filter.read !== undefined) {
      query += ' AND read = ?';
      params.push(filter.read ? 1 : 0);
    }
    
    query += ' ORDER BY created_at DESC';
    
    const stmt = db.prepare(query);
    const rows = params.length > 0 ? stmt.all(...params) : stmt.all();
    // Convert read back to boolean
    return rows.map(row => ({
      ...row,
      read: row.read === 1
    }));
  },
  
  createNotification: (notificationData) => {
    const id = getNextId('next_notification_id');
    const now = new Date().toISOString();
    
    db.prepare(`
      INSERT INTO notifications (id, user_id, lead_id, client_id, type, message, read, created_by, created_at, read_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      notificationData.user_id,
      notificationData.lead_id || null,
      notificationData.client_id || null,
      notificationData.type,
      notificationData.message,
      0, // read = false
      notificationData.created_by || null,
      notificationData.created_at || now,
      null
    );
    
    return database.getNotifications({ id })[0];
  },
  
  markNotificationAsRead: (id) => {
    db.prepare('UPDATE notifications SET read = 1, read_at = ? WHERE id = ?').run(
      new Date().toISOString(),
      id
    );
    return database.getNotifications({ id })[0];
  },
  
  markAllNotificationsAsRead: (userId) => {
    db.prepare('UPDATE notifications SET read = 1, read_at = ? WHERE user_id = ? AND read = 0').run(
      new Date().toISOString(),
      userId
    );
    return database.getNotifications({ user_id: userId });
  },
  
  // Email Templates
  getEmailTemplates: (filter = {}) => {
    let query = 'SELECT * FROM email_templates WHERE 1=1';
    const params = [];
    
    if (filter.id) {
      query += ' AND id = ?';
      params.push(filter.id);
    }
    if (filter.type) {
      query += ' AND type = ?';
      params.push(filter.type);
    }
    if (filter.active !== undefined) {
      query += ' AND active = ?';
      params.push(filter.active ? 1 : 0);
    }
    
    const stmt = db.prepare(query);
    const rows = params.length > 0 ? stmt.all(...params) : stmt.all();
    // Convert active back to boolean
    return rows.map(row => ({
      ...row,
      active: row.active === 1
    }));
  },
  
  createEmailTemplate: (templateData) => {
    const id = getNextId('next_template_id');
    const now = new Date().toISOString();
    
    db.prepare(`
      INSERT INTO email_templates (id, name, type, subject, body, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      templateData.name,
      templateData.type,
      templateData.subject,
      templateData.body,
      templateData.active !== false ? 1 : 0,
      templateData.created_at || now,
      templateData.updated_at || now
    );
    
    return database.getEmailTemplates({ id })[0];
  },
  
  updateEmailTemplate: (id, updates) => {
    const updatesList = [];
    const params = [];
    
    if (updates.name !== undefined) {
      updatesList.push('name = ?');
      params.push(updates.name);
    }
    if (updates.type !== undefined) {
      updatesList.push('type = ?');
      params.push(updates.type);
    }
    if (updates.subject !== undefined) {
      updatesList.push('subject = ?');
      params.push(updates.subject);
    }
    if (updates.body !== undefined) {
      updatesList.push('body = ?');
      params.push(updates.body);
    }
    if (updates.active !== undefined) {
      updatesList.push('active = ?');
      params.push(updates.active ? 1 : 0);
    }
    
    updatesList.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);
    
    db.prepare(`UPDATE email_templates SET ${updatesList.join(', ')} WHERE id = ?`).run(...params);
    return database.getEmailTemplates({ id })[0];
  },
  
  deleteEmailTemplate: (id) => {
    const result = db.prepare('DELETE FROM email_templates WHERE id = ?').run(id);
    return result.changes > 0;
  },
  
  // Email Logs
  getEmailLogs: (filter = {}) => {
    let query = 'SELECT * FROM email_logs WHERE 1=1';
    const params = [];
    
    if (filter.lead_id) {
      query += ' AND lead_id = ?';
      params.push(filter.lead_id);
    }
    if (filter.template_id) {
      query += ' AND template_id = ?';
      params.push(filter.template_id);
    }
    if (filter.success !== undefined) {
      query += ' AND success = ?';
      params.push(filter.success ? 1 : 0);
    }
    
    query += ' ORDER BY sent_at DESC';
    
    const stmt = db.prepare(query);
    const rows = params.length > 0 ? stmt.all(...params) : stmt.all();
    // Convert success back to boolean
    return rows.map(row => ({
      ...row,
      success: row.success === 1
    }));
  },
  
  createEmailLog: (logData) => {
    const id = getNextId('next_email_log_id');
    const now = new Date().toISOString();
    
    db.prepare(`
      INSERT INTO email_logs (id, lead_id, template_id, recipient_email, subject, success, error, sent_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      logData.lead_id || null,
      logData.template_id || null,
      logData.recipient_email,
      logData.subject,
      logData.success ? 1 : 0,
      logData.error || null,
      logData.sent_at || now
    );
    
    return db.prepare('SELECT * FROM email_logs WHERE id = ?').get(id);
  },
  
  // Clients
  getClients: (filter = {}) => {
    let query = 'SELECT * FROM clients WHERE 1=1';
    const params = [];
    
    if (filter.id !== undefined) {
      query += ' AND id = ?';
      params.push(Number(filter.id));
    }
    if (filter.assigned_staff_id !== undefined && filter.assigned_staff_id !== null) {
      query += ' AND assigned_staff_id = ?';
      params.push(Number(filter.assigned_staff_id));
    }
    if (filter.processing_staff_id !== undefined && filter.processing_staff_id !== null) {
      query += ' AND processing_staff_id = ?';
      params.push(Number(filter.processing_staff_id));
    }
    if (filter.fee_status) {
      query += ' AND fee_status = ?';
      params.push(filter.fee_status);
    }
    if (filter.search) {
      query += ' AND (name LIKE ? OR phone_number LIKE ? OR email LIKE ?)';
      const searchTerm = `%${filter.search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }
    
    query += ' ORDER BY updated_at DESC, created_at DESC';
    
    const stmt = db.prepare(query);
    const rows = params.length > 0 ? stmt.all(...params) : stmt.all();
    return rows;
  },
  
  createClient: (clientData) => {
    const id = getNextId('next_client_id');
    const now = new Date().toISOString();
    
    db.prepare(`
      INSERT INTO clients (
        id, name, phone_number, phone_country_code, whatsapp_number, whatsapp_country_code,
        email, age, occupation, qualification, year_of_experience, country, program,
        fee_status, amount_paid, payment_due_date, processing_status,
        processing_staff_id, assigned_staff_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      clientData.name,
      clientData.phone_number,
      clientData.phone_country_code || '+91',
      clientData.whatsapp_number || null,
      clientData.whatsapp_country_code || '+91',
      clientData.email || null,
      clientData.age || null,
      clientData.occupation || null,
      clientData.qualification || null,
      clientData.year_of_experience || null,
      clientData.country || null,
      clientData.program || null,
      clientData.fee_status || null,
      clientData.amount_paid || 0,
      clientData.payment_due_date || null,
      clientData.processing_status || null,
      clientData.processing_staff_id || null,
      clientData.assigned_staff_id || null,
      clientData.created_at || now,
      clientData.updated_at || now
    );
    
    return database.getClients({ id })[0];
  },
  
  updateClient: (id, updates) => {
    const updatesList = [];
    const params = [];
    
    const allowedFields = [
      'name', 'phone_number', 'phone_country_code', 'whatsapp_number', 'whatsapp_country_code',
      'email', 'age', 'occupation', 'qualification', 'year_of_experience', 'country', 'program',
      'fee_status', 'amount_paid', 'payment_due_date', 'processing_status',
      'processing_staff_id', 'assigned_staff_id'
    ];
    
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        if (field === 'processing_staff_id' || field === 'assigned_staff_id') {
          updatesList.push(`${field} = ?`);
          params.push(updates[field] !== null ? Number(updates[field]) : null);
        } else {
          updatesList.push(`${field} = ?`);
          params.push(updates[field]);
        }
      }
    }
    
    if (updatesList.length === 0) return database.getClients({ id })[0];
    
    updatesList.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(Number(id));
    
    db.prepare(`UPDATE clients SET ${updatesList.join(', ')} WHERE id = ?`).run(...params);
    return database.getClients({ id })[0];
  },
  
  deleteClient: (id) => {
    const result = db.prepare('DELETE FROM clients WHERE id = ?').run(Number(id));
    return result.changes > 0;
  },
  
  // Expose db object for backward compatibility (for login logs, etc.)
  get db() {
    return {
      loginLogs: [],
      activityLogs: [],
      notifications: [],
      emailTemplates: [],
      emailLogs: [],
      clients: [],
      leads: [],
      users: []
    };
  },
  
  // Save function (no-op for SQLite, data is auto-saved)
  save: () => {
    // SQLite auto-saves, no action needed
  },
  
  // Load function (no-op for SQLite)
  loadDatabase: () => {
    // SQLite is always loaded, no action needed
  },
  
  // Get database instance for advanced queries
  getDatabase: () => db,
};

module.exports = database;
