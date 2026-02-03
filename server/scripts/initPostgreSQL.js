const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function initDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('📋 Initializing PostgreSQL database schema...\n');
    
    await client.query('BEGIN');
    
    // Create sequences for auto-increment IDs
    console.log('Creating sequences...');
    await client.query(`
      CREATE SEQUENCE IF NOT EXISTS users_id_seq;
      CREATE SEQUENCE IF NOT EXISTS leads_id_seq;
      CREATE SEQUENCE IF NOT EXISTS clients_id_seq;
      CREATE SEQUENCE IF NOT EXISTS comments_id_seq;
      CREATE SEQUENCE IF NOT EXISTS attendance_id_seq;
      CREATE SEQUENCE IF NOT EXISTS login_logs_id_seq;
      CREATE SEQUENCE IF NOT EXISTS activity_logs_id_seq;
      CREATE SEQUENCE IF NOT EXISTS notifications_id_seq;
      CREATE SEQUENCE IF NOT EXISTS email_templates_id_seq;
      CREATE SEQUENCE IF NOT EXISTS email_logs_id_seq;
    `);
    
    // Users table
    console.log('Creating users table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY DEFAULT nextval('users_id_seq'),
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL,
        team TEXT,
        managed_by INTEGER,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (managed_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    
    // Leads table
    console.log('Creating leads table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id INTEGER PRIMARY KEY DEFAULT nextval('leads_id_seq'),
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
        follow_up_date TIMESTAMP,
        follow_up_status TEXT DEFAULT 'Pending',
        assigned_staff_id INTEGER,
        source TEXT,
        ielts_score TEXT,
        created_by INTEGER,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (assigned_staff_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    
    // Clients table
    console.log('Creating clients table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS clients (
        id INTEGER PRIMARY KEY DEFAULT nextval('clients_id_seq'),
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
        payment_due_date TIMESTAMP,
        processing_status TEXT,
        processing_staff_id INTEGER,
        assigned_staff_id INTEGER,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (processing_staff_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (assigned_staff_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    
    // Comments table
    console.log('Creating comments table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS comments (
        id INTEGER PRIMARY KEY DEFAULT nextval('comments_id_seq'),
        lead_id INTEGER,
        client_id INTEGER,
        user_id INTEGER NOT NULL,
        comment TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    
    // Attendance table
    console.log('Creating attendance table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS attendance (
        id INTEGER PRIMARY KEY DEFAULT nextval('attendance_id_seq'),
        user_id INTEGER NOT NULL,
        date DATE NOT NULL,
        check_in TIMESTAMP,
        check_out TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    
    // Login logs table
    console.log('Creating login_logs table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS login_logs (
        id INTEGER PRIMARY KEY DEFAULT nextval('login_logs_id_seq'),
        email TEXT NOT NULL,
        success BOOLEAN NOT NULL DEFAULT false,
        reason TEXT,
        user_id INTEGER,
        timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ip_address TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    
    // Activity logs table
    console.log('Creating activity_logs table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY DEFAULT nextval('activity_logs_id_seq'),
        type TEXT NOT NULL,
        user_id INTEGER,
        target_user_id INTEGER,
        details TEXT,
        timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    
    // Notifications table
    console.log('Creating notifications table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY DEFAULT nextval('notifications_id_seq'),
        user_id INTEGER NOT NULL,
        lead_id INTEGER,
        client_id INTEGER,
        type TEXT NOT NULL,
        message TEXT NOT NULL,
        read BOOLEAN DEFAULT false,
        created_by INTEGER,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        read_at TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    
    // Email templates table
    console.log('Creating email_templates table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS email_templates (
        id INTEGER PRIMARY KEY DEFAULT nextval('email_templates_id_seq'),
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Email logs table
    console.log('Creating email_logs table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS email_logs (
        id INTEGER PRIMARY KEY DEFAULT nextval('email_logs_id_seq'),
        lead_id INTEGER,
        template_id INTEGER,
        recipient_email TEXT NOT NULL,
        subject TEXT NOT NULL,
        success BOOLEAN NOT NULL DEFAULT false,
        error TEXT,
        sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL,
        FOREIGN KEY (template_id) REFERENCES email_templates(id) ON DELETE SET NULL
      )
    `);
    
    // Create indexes for performance
    console.log('Creating indexes...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone_number);
      CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
      CREATE INDEX IF NOT EXISTS idx_leads_assigned ON leads(assigned_staff_id);
      CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
      CREATE INDEX IF NOT EXISTS idx_leads_follow_up_date ON leads(follow_up_date);
      CREATE INDEX IF NOT EXISTS idx_clients_assigned ON clients(assigned_staff_id);
      CREATE INDEX IF NOT EXISTS idx_clients_processing ON clients(processing_staff_id);
      CREATE INDEX IF NOT EXISTS idx_comments_lead ON comments(lead_id);
      CREATE INDEX IF NOT EXISTS idx_comments_client ON comments(client_id);
      CREATE INDEX IF NOT EXISTS idx_attendance_user ON attendance(user_id);
      CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
      CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
      CREATE INDEX IF NOT EXISTS idx_login_logs_email ON login_logs(email);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    `);
    
    await client.query('COMMIT');
    console.log('\n✅ PostgreSQL database schema initialized successfully!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error initializing database:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

initDatabase()
  .then(() => {
    console.log('Database initialization completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Database initialization failed:', error);
    process.exit(1);
  });
