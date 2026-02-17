const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function setupHrSchema() {
    console.log('🛠️ Starting HR Schema Setup...');

    // 1. Configure DB Connection
    let connectionString = process.env.DATABASE_URL;
    if (connectionString && !connectionString.includes('sslmode=') && connectionString.includes('render.com')) {
        connectionString += '?sslmode=require';
    }

    const pool = new Pool({
        connectionString,
        ssl: connectionString && connectionString.includes('localhost') ? false : { rejectUnauthorized: false }
    });

    try {
        // 2. Create staff_documents Table
        console.log('creating staff_documents table if not exists...');
        await pool.query(`
      CREATE TABLE IF NOT EXISTS staff_documents (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        slot_number INTEGER NOT NULL CHECK (slot_number BETWEEN 1 AND 10),
        file_path TEXT NOT NULL,
        file_name TEXT NOT NULL,
        uploaded_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, slot_number)
      );
    `);
        console.log('✅ staff_documents table ready.');

        // 3. Seed HR User
        const hrEmail = 'hr@toniosenora.com';
        const hrPassword = 'hrmainsenora000';
        const hrName = 'HR Manager';

        console.log(`🔍 Checking for HR user: ${hrEmail}`);
        const res = await pool.query('SELECT * FROM users WHERE email = $1', [hrEmail]);

        if (res.rows.length === 0) {
            console.log('👤 HR User not found. Creating...');
            const hashedPassword = await bcrypt.hash(hrPassword, 10);

            // Get next ID (assuming sequence exists, or use MAX+1 if robust)
            // We'll rely on the users_id_seq if it exists, or insert without ID if auto-increment (which it seems like it handles manually in database.js)
            // database.js manually uses nextval('users_id_seq'). let's try to simulate that or just let postgres handle it if serial?
            // database.js: const id = await getNextId('users_id_seq');

            // Let's execute the nextval query
            const idRes = await pool.query("SELECT nextval('users_id_seq')");
            const nextId = idRes.rows[0].nextval;

            await pool.query(`
        INSERT INTO users (id, name, email, password, role, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [nextId, hrName, hrEmail, hashedPassword, 'HR', new Date().toISOString(), new Date().toISOString()]);

            console.log('✅ HR User created successfully.');
        } else {
            console.log('👤 HR User exists. Updating role to Ensure it is HR...');
            await pool.query('UPDATE users SET role = $1 WHERE email = $2', ['HR', hrEmail]);
            console.log('✅ HR User role verified.');
        }

    } catch (error) {
        console.error('❌ Error initializing HR Schema:', error);
    } finally {
        await pool.end();
    }
}

// Run if called directly
if (require.main === module) {
    setupHrSchema();
}

module.exports = setupHrSchema;
