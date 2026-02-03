const { Pool } = require('pg');
const dns = require('dns');

// Force IPv4 resolution first (helps with IPv6-only addresses)
dns.setDefaultResultOrder('ipv4first');

// Initialize PostgreSQL connection pool
// Production-ready configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Simplified SSL for serverless
  max: 3, // Lower max connections for serverless
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  // Production optimizations
  statement_timeout: 30000, // 30 second query timeout
  query_timeout: 30000,
});

// Test connection
pool.on('connect', () => {
  console.log('✅ PostgreSQL database connected');
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL database connection error:', err);
});

// Helper to execute queries
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV === 'development') {
      console.log('Executed query', { text, duration, rows: res.rowCount });
    }
    return res;
  } catch (error) {
    console.error('Query error:', { text, params, error: error.message });
    throw error;
  }
}

// Helper to get next ID using sequences (PostgreSQL native)
async function getNextId(sequenceName) {
  const result = await query(`SELECT nextval('${sequenceName}')`);
  return parseInt(result.rows[0].nextval, 10);
}

// Database API (same interface as before for backward compatibility)
const database = {
  // Users
  getUsers: async (filter = {}) => {
    let queryText = 'SELECT * FROM users WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (filter.id) {
      queryText += ` AND id = $${paramIndex++}`;
      params.push(filter.id);
    }
    if (filter.email) {
      queryText += ` AND email ILIKE $${paramIndex++}`;
      params.push(filter.email);
    }
    if (filter.name) {
      queryText += ` AND name ILIKE $${paramIndex++}`;
      params.push(filter.name);
    }
    if (filter.role) {
      queryText += ` AND role = $${paramIndex++}`;
      params.push(filter.role);
    }
    if (filter.team) {
      queryText += ` AND team = $${paramIndex++}`;
      params.push(filter.team);
    }
    if (filter.managed_by !== undefined) {
      queryText += ` AND managed_by = $${paramIndex++}`;
      params.push(filter.managed_by);
    }

    const result = await query(queryText, params);
    return result.rows;
  },

  getTeamMembers: async (team) => {
    const result = await query('SELECT * FROM users WHERE team = $1', [team]);
    return result.rows;
  },

  createUser: async (userData) => {
    const id = await getNextId('users_id_seq');
    const now = new Date().toISOString();

    await query(`
      INSERT INTO users (id, name, email, password, role, team, managed_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      id,
      userData.name,
      userData.email,
      userData.password,
      userData.role,
      userData.team || null,
      userData.managed_by || null,
      userData.created_at || now,
      userData.updated_at || now
    ]);

    const users = await database.getUsers({ id });
    return users[0];
  },

  updateUser: async (id, updates) => {
    const updatesList = [];
    const params = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      updatesList.push(`name = $${paramIndex++}`);
      params.push(updates.name);
    }
    if (updates.email !== undefined) {
      updatesList.push(`email = $${paramIndex++}`);
      params.push(updates.email);
    }
    if (updates.password !== undefined) {
      updatesList.push(`password = $${paramIndex++}`);
      params.push(updates.password);
    }
    if (updates.role !== undefined) {
      updatesList.push(`role = $${paramIndex++}`);
      params.push(updates.role);
    }
    if (updates.team !== undefined) {
      updatesList.push(`team = $${paramIndex++}`);
      params.push(updates.team);
    }
    if (updates.managed_by !== undefined) {
      updatesList.push(`managed_by = $${paramIndex++}`);
      params.push(updates.managed_by);
    }

    updatesList.push(`updated_at = $${paramIndex++}`);
    params.push(new Date().toISOString());
    params.push(id);

    await query(`UPDATE users SET ${updatesList.join(', ')} WHERE id = $${paramIndex}`, params);
    const users = await database.getUsers({ id });
    return users[0];
  },

  deleteUser: async (id) => {
    const result = await query('DELETE FROM users WHERE id = $1', [id]);
    return result.rowCount > 0;
  },

  // Leads
  getLeads: async (filter = {}) => {
    let queryText = 'SELECT * FROM leads WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (filter.id !== undefined) {
      queryText += ` AND id = $${paramIndex++}`;
      params.push(Number(filter.id));
    }
    if (filter.assigned_staff_id !== undefined && filter.assigned_staff_id !== null) {
      queryText += ` AND assigned_staff_id = $${paramIndex++}`;
      params.push(Number(filter.assigned_staff_id));
    }
    if (filter.status) {
      queryText += ` AND status = $${paramIndex++}`;
      params.push(filter.status);
    }
    if (filter.search) {
      queryText += ` AND (name LIKE $${paramIndex} OR phone_number LIKE $${paramIndex + 1} OR email LIKE $${paramIndex + 2})`;
      const searchTerm = `%${filter.search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
      paramIndex += 3;
    }

    queryText += ' ORDER BY updated_at DESC, created_at DESC';

    const result = await query(queryText, params);
    return result.rows;
  },

  createLead: async (leadData) => {
    const id = await getNextId('leads_id_seq');
    const now = new Date().toISOString();

    await query(`
      INSERT INTO leads (
        id, name, phone_number, phone_country_code, whatsapp_number, whatsapp_country_code,
        email, age, occupation, qualification, year_of_experience, country, program,
        status, priority, comment, follow_up_date, follow_up_status,
        assigned_staff_id, source, ielts_score, created_by, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
    `, [
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
      leadData.follow_up_status || 'Pending',
      leadData.assigned_staff_id || null,
      leadData.source || null,
      leadData.ielts_score || null,
      leadData.created_by || null,
      leadData.created_at || now,
      leadData.updated_at || now
    ]);

    const leads = await database.getLeads({ id });
    return leads[0];
  },

  updateLead: async (id, updates) => {
    const updatesList = [];
    const params = [];
    let paramIndex = 1;

    const allowedFields = [
      'name', 'phone_number', 'phone_country_code', 'whatsapp_number', 'whatsapp_country_code',
      'email', 'age', 'occupation', 'qualification', 'year_of_experience', 'country', 'program',
      'status', 'priority', 'comment', 'follow_up_date', 'follow_up_status',
      'assigned_staff_id', 'source', 'ielts_score'
    ];

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        updatesList.push(`${field} = $${paramIndex++}`);
        params.push(updates[field]);
      }
    }

    if (updatesList.length === 0) {
      const leads = await database.getLeads({ id });
      return leads[0];
    }

    updatesList.push(`updated_at = $${paramIndex++}`);
    params.push(new Date().toISOString());
    params.push(Number(id));

    await query(`UPDATE leads SET ${updatesList.join(', ')} WHERE id = $${paramIndex}`, params);
    const leads = await database.getLeads({ id });
    return leads[0];
  },

  deleteLead: async (id) => {
    const result = await query('DELETE FROM leads WHERE id = $1', [Number(id)]);
    return result.rowCount > 0;
  },

  // Comments
  getComments: async (leadId) => {
    if (leadId === null || leadId === undefined) {
      const result = await query('SELECT * FROM comments ORDER BY created_at ASC');
      return result.rows;
    }
    const result = await query('SELECT * FROM comments WHERE lead_id = $1 ORDER BY created_at ASC', [leadId]);
    return result.rows;
  },

  createComment: async (commentData) => {
    const id = await getNextId('comments_id_seq');
    const now = new Date().toISOString();

    await query(`
      INSERT INTO comments (id, lead_id, client_id, user_id, comment, created_at)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      id,
      commentData.lead_id || null,
      commentData.client_id || null,
      commentData.user_id,
      commentData.comment,
      commentData.created_at || now
    ]);

    const result = await query('SELECT * FROM comments WHERE id = $1', [id]);
    return result.rows[0];
  },

  // Attendance
  getAttendance: async (filter = {}) => {
    let queryText = 'SELECT * FROM attendance WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (filter.user_id) {
      queryText += ` AND user_id = $${paramIndex++}`;
      params.push(filter.user_id);
    }
    if (filter.date) {
      queryText += ` AND date = $${paramIndex++}`;
      params.push(filter.date);
    }
    if (filter.startDate) {
      queryText += ` AND date >= $${paramIndex++}`;
      params.push(filter.startDate);
    }
    if (filter.endDate) {
      queryText += ` AND date <= $${paramIndex++}`;
      params.push(filter.endDate);
    }

    queryText += ' ORDER BY date DESC';

    const result = await query(queryText, params);
    return result.rows;
  },

  createAttendance: async (attendanceData) => {
    const id = await getNextId('attendance_id_seq');
    const now = new Date().toISOString();

    await query(`
      INSERT INTO attendance (id, user_id, date, check_in, check_out, created_at)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      id,
      attendanceData.user_id,
      attendanceData.date,
      attendanceData.check_in || null,
      attendanceData.check_out || null,
      attendanceData.created_at || now
    ]);

    const result = await query('SELECT * FROM attendance WHERE id = $1', [id]);
    return result.rows[0];
  },

  updateAttendance: async (id, updates) => {
    const updatesList = [];
    const params = [];
    let paramIndex = 1;

    if (updates.check_in !== undefined) {
      updatesList.push(`check_in = $${paramIndex++}`);
      params.push(updates.check_in);
    }
    if (updates.check_out !== undefined) {
      updatesList.push(`check_out = $${paramIndex++}`);
      params.push(updates.check_out);
    }
    if (updates.date !== undefined) {
      updatesList.push(`date = $${paramIndex++}`);
      params.push(updates.date);
    }

    if (updatesList.length === 0) {
      const result = await query('SELECT * FROM attendance WHERE id = $1', [id]);
      return result.rows[0];
    }

    params.push(id);
    await query(`UPDATE attendance SET ${updatesList.join(', ')} WHERE id = $${paramIndex}`, params);
    const result = await query('SELECT * FROM attendance WHERE id = $1', [id]);
    return result.rows[0];
  },

  // Helper to get user name
  getUserName: async (userId) => {
    const result = await query('SELECT name FROM users WHERE id = $1', [userId]);
    return result.rows[0]?.name || null;
  },

  // Activity Logs
  getActivityLogs: async (filter = {}) => {
    let queryText = 'SELECT * FROM activity_logs WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (filter.user_id) {
      queryText += ` AND user_id = $${paramIndex++}`;
      params.push(filter.user_id);
    }
    if (filter.type) {
      queryText += ` AND type = $${paramIndex++}`;
      params.push(filter.type);
    }

    queryText += ' ORDER BY timestamp DESC';

    const result = await query(queryText, params);
    return result.rows;
  },

  createActivityLog: async (logData) => {
    await query(`
      INSERT INTO activity_logs (type, user_id, target_user_id, details, timestamp)
      VALUES ($1, $2, $3, $4, $5)
    `, [
      logData.type,
      logData.user_id || null,
      logData.target_user_id || null,
      logData.details || null,
      logData.timestamp || new Date().toISOString()
    ]);
  },

  // Login Logs
  getLoginLogs: async (filter = {}) => {
    let queryText = 'SELECT * FROM login_logs WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (filter.email) {
      queryText += ` AND email = $${paramIndex++}`;
      params.push(filter.email);
    }
    if (filter.success !== undefined) {
      queryText += ` AND success = $${paramIndex++}`;
      params.push(filter.success);
    }
    if (filter.user_id) {
      queryText += ` AND user_id = $${paramIndex++}`;
      params.push(filter.user_id);
    }

    queryText += ' ORDER BY timestamp DESC';

    const result = await query(queryText, params);
    return result.rows.map(row => ({
      ...row,
      success: row.success === true || row.success === 1
    }));
  },

  createLoginLog: async (logData) => {
    await query(`
      INSERT INTO login_logs (email, success, reason, user_id, timestamp, ip_address)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      logData.email,
      logData.success || false,
      logData.reason || null,
      logData.user_id || null,
      logData.timestamp || new Date().toISOString(),
      logData.ip_address || null
    ]);
  },

  // Notifications
  getNotifications: async (filter = {}) => {
    let queryText = 'SELECT * FROM notifications WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (filter.id !== undefined) {
      queryText += ` AND id = $${paramIndex++}`;
      params.push(Number(filter.id));
    }
    if (filter.user_id !== undefined && filter.user_id !== null) {
      queryText += ` AND user_id = $${paramIndex++}`;
      params.push(Number(filter.user_id));
    }
    if (filter.read !== undefined) {
      queryText += ` AND read = $${paramIndex++}`;
      params.push(filter.read);
    }

    queryText += ' ORDER BY created_at DESC';

    const result = await query(queryText, params);
    return result.rows.map(row => ({
      ...row,
      read: row.read === true || row.read === 1
    }));
  },

  createNotification: async (notificationData) => {
    const id = await getNextId('notifications_id_seq');
    const now = new Date().toISOString();

    await query(`
      INSERT INTO notifications (id, user_id, lead_id, client_id, type, message, read, created_by, created_at, read_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      id,
      notificationData.user_id,
      notificationData.lead_id || null,
      notificationData.client_id || null,
      notificationData.type,
      notificationData.message,
      false, // read = false
      notificationData.created_by || null,
      notificationData.created_at || now,
      null
    ]);

    const notifications = await database.getNotifications({ id });
    return notifications[0];
  },

  markNotificationAsRead: async (id) => {
    await query('UPDATE notifications SET read = $1, read_at = $2 WHERE id = $3', [
      true,
      new Date().toISOString(),
      id
    ]);
    const notifications = await database.getNotifications({ id });
    return notifications[0];
  },

  markAllNotificationsAsRead: async (userId) => {
    await query('UPDATE notifications SET read = $1, read_at = $2 WHERE user_id = $3 AND read = $4', [
      true,
      new Date().toISOString(),
      userId,
      false
    ]);
    return await database.getNotifications({ user_id: userId });
  },

  // Email Templates
  getEmailTemplates: async (filter = {}) => {
    let queryText = 'SELECT * FROM email_templates WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (filter.id) {
      queryText += ` AND id = $${paramIndex++}`;
      params.push(filter.id);
    }
    if (filter.type) {
      queryText += ` AND type = $${paramIndex++}`;
      params.push(filter.type);
    }
    if (filter.active !== undefined) {
      queryText += ` AND active = $${paramIndex++}`;
      params.push(filter.active);
    }

    const result = await query(queryText, params);
    return result.rows.map(row => ({
      ...row,
      active: row.active === true || row.active === 1
    }));
  },

  createEmailTemplate: async (templateData) => {
    const id = await getNextId('email_templates_id_seq');
    const now = new Date().toISOString();

    await query(`
      INSERT INTO email_templates (id, name, type, subject, body, active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      id,
      templateData.name,
      templateData.type,
      templateData.subject,
      templateData.body,
      templateData.active !== false,
      templateData.created_at || now,
      templateData.updated_at || now
    ]);

    const templates = await database.getEmailTemplates({ id });
    return templates[0];
  },

  updateEmailTemplate: async (id, updates) => {
    const updatesList = [];
    const params = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      updatesList.push(`name = $${paramIndex++}`);
      params.push(updates.name);
    }
    if (updates.type !== undefined) {
      updatesList.push(`type = $${paramIndex++}`);
      params.push(updates.type);
    }
    if (updates.subject !== undefined) {
      updatesList.push(`subject = $${paramIndex++}`);
      params.push(updates.subject);
    }
    if (updates.body !== undefined) {
      updatesList.push(`body = $${paramIndex++}`);
      params.push(updates.body);
    }
    if (updates.active !== undefined) {
      updatesList.push(`active = $${paramIndex++}`);
      params.push(updates.active);
    }

    updatesList.push(`updated_at = $${paramIndex++}`);
    params.push(new Date().toISOString());
    params.push(id);

    await query(`UPDATE email_templates SET ${updatesList.join(', ')} WHERE id = $${paramIndex}`, params);
    const templates = await database.getEmailTemplates({ id });
    return templates[0];
  },

  deleteEmailTemplate: async (id) => {
    const result = await query('DELETE FROM email_templates WHERE id = $1', [id]);
    return result.rowCount > 0;
  },

  // Email Logs
  getEmailLogs: async (filter = {}) => {
    let queryText = 'SELECT * FROM email_logs WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (filter.lead_id) {
      queryText += ` AND lead_id = $${paramIndex++}`;
      params.push(filter.lead_id);
    }
    if (filter.template_id) {
      queryText += ` AND template_id = $${paramIndex++}`;
      params.push(filter.template_id);
    }
    if (filter.success !== undefined) {
      queryText += ` AND success = $${paramIndex++}`;
      params.push(filter.success);
    }

    queryText += ' ORDER BY sent_at DESC';

    const result = await query(queryText, params);
    return result.rows.map(row => ({
      ...row,
      success: row.success === true || row.success === 1
    }));
  },

  createEmailLog: async (logData) => {
    const id = await getNextId('email_logs_id_seq');
    const now = new Date().toISOString();

    await query(`
      INSERT INTO email_logs (id, lead_id, template_id, recipient_email, subject, success, error, sent_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      id,
      logData.lead_id || null,
      logData.template_id || null,
      logData.recipient_email,
      logData.subject,
      logData.success || false,
      logData.error || null,
      logData.sent_at || now
    ]);

    const result = await query('SELECT * FROM email_logs WHERE id = $1', [id]);
    return result.rows[0];
  },

  // Clients
  getClients: async (filter = {}) => {
    let queryText = 'SELECT * FROM clients WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (filter.id !== undefined) {
      queryText += ` AND id = $${paramIndex++}`;
      params.push(Number(filter.id));
    }
    if (filter.assigned_staff_id !== undefined && filter.assigned_staff_id !== null) {
      queryText += ` AND assigned_staff_id = $${paramIndex++}`;
      params.push(Number(filter.assigned_staff_id));
    }
    if (filter.processing_staff_id !== undefined && filter.processing_staff_id !== null) {
      queryText += ` AND processing_staff_id = $${paramIndex++}`;
      params.push(Number(filter.processing_staff_id));
    }
    if (filter.fee_status) {
      queryText += ` AND fee_status = $${paramIndex++}`;
      params.push(filter.fee_status);
    }
    if (filter.search) {
      queryText += ` AND (name LIKE $${paramIndex} OR phone_number LIKE $${paramIndex + 1} OR email LIKE $${paramIndex + 2})`;
      const searchTerm = `%${filter.search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
      paramIndex += 3;
    }

    queryText += ' ORDER BY updated_at DESC, created_at DESC';

    const result = await query(queryText, params);
    return result.rows;
  },

  createClient: async (clientData) => {
    const id = await getNextId('clients_id_seq');
    const now = new Date().toISOString();

    // Build dynamic INSERT query with only provided fields
    const fields = [];
    const values = [];
    const params = [];
    let paramIndex = 1;

    // Required fields
    fields.push('id', 'name', 'phone_number', 'created_at', 'updated_at');
    values.push(`$${paramIndex++}`, `$${paramIndex++}`, `$${paramIndex++}`, `$${paramIndex++}`, `$${paramIndex++}`);
    params.push(id, clientData.name, clientData.phone_number, now, now);

    // Optional fields
    const optionalFields = {
      phone_country_code: clientData.phone_country_code || '+91',
      whatsapp_number: clientData.whatsapp_number,
      whatsapp_country_code: clientData.whatsapp_country_code || '+91',
      email: clientData.email,
      age: clientData.age,
      occupation: clientData.occupation,
      qualification: clientData.qualification,
      year_of_experience: clientData.year_of_experience,
      country: clientData.country,
      target_country: clientData.target_country || clientData.country,
      residing_country: clientData.residing_country,
      program: clientData.program,
      assessment_authority: clientData.assessment_authority,
      occupation_mapped: clientData.occupation_mapped,
      registration_fee_paid: clientData.registration_fee_paid === true || clientData.registration_fee_paid === 'Yes',
      fee_status: clientData.fee_status,
      amount_paid: clientData.amount_paid || 0,
      payment_due_date: clientData.payment_due_date,
      processing_status: clientData.processing_status,
      processing_staff_id: clientData.processing_staff_id,
      assigned_staff_id: clientData.assigned_staff_id,
      lead_id: clientData.lead_id,
      created_by: clientData.created_by,
    };

    for (const [field, value] of Object.entries(optionalFields)) {
      if (value !== undefined && value !== null) {
        fields.push(field);
        values.push(`$${paramIndex++}`);
        params.push(value);
      }
    }

    await query(`
      INSERT INTO clients (${fields.join(', ')})
      VALUES (${values.join(', ')})
    `, params);

    const clients = await database.getClients({ id });
    return clients[0];
  },

  updateClient: async (id, updates) => {
    const updatesList = [];
    const params = [];
    let paramIndex = 1;

    const allowedFields = [
      'name', 'phone_number', 'phone_country_code', 'whatsapp_number', 'whatsapp_country_code',
      'email', 'age', 'occupation', 'qualification', 'year_of_experience', 'country', 'target_country', 'residing_country', 'program',
      'assessment_authority', 'occupation_mapped', 'registration_fee_paid',
      'fee_status', 'amount_paid', 'payment_due_date', 'processing_status',
      'processing_staff_id', 'assigned_staff_id', 'completed_actions', 'lead_id'
    ];

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        if (field === 'processing_staff_id' || field === 'assigned_staff_id') {
          updatesList.push(`${field} = $${paramIndex++}`);
          params.push(updates[field] !== null ? Number(updates[field]) : null);
        } else if (field === 'completed_actions') {
          // Handle array field - convert to PostgreSQL array format
          updatesList.push(`${field} = $${paramIndex++}`);
          const actionsArray = Array.isArray(updates[field]) ? updates[field] : [];
          params.push(actionsArray);
        } else {
          updatesList.push(`${field} = $${paramIndex++}`);
          params.push(updates[field]);
        }
      }
    }

    if (updatesList.length === 0) {
      const clients = await database.getClients({ id });
      return clients[0];
    }

    updatesList.push(`updated_at = $${paramIndex++}`);
    params.push(new Date().toISOString());
    params.push(Number(id));

    await query(`UPDATE clients SET ${updatesList.join(', ')} WHERE id = $${paramIndex}`, params);
    const clients = await database.getClients({ id });
    return clients[0];
  },

  deleteClient: async (id) => {
    const result = await query('DELETE FROM clients WHERE id = $1', [Number(id)]);
    return result.rowCount > 0;
  },

  // Expose pool for advanced queries
  pool,

  // Expose query function for advanced usage
  query,

  // Backward compatibility stubs (no-op for PostgreSQL)
  save: () => {
    // PostgreSQL auto-saves, no action needed
  },

  loadDatabase: () => {
    // PostgreSQL is always loaded, no action needed
  },

  getDatabase: () => pool,
};

module.exports = database;
