const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: './server/.env' }); // Explicit path to env

async function checkHrUser() {
    console.log('🔍 Checking HR User...');
    console.log('URL:', process.env.DATABASE_URL ? 'Loaded' : 'Missing');

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        const email = 'hr@toniosenora.com';
        const res = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

        if (res.rows.length === 0) {
            console.log('❌ HR User NOT found in database.');

            // Attempt to create it
            console.log('🛠️ Attempting to create HR user...');
            const password = await bcrypt.hash('hrmainsenora000', 10);

            // Get next ID
            // users table usually has `id` as integer.
            // Let's check the max id
            const maxRes = await pool.query('SELECT MAX(id) as max_id FROM users');
            const nextId = (maxRes.rows[0].max_id || 0) + 1;

            await pool.query(`
        INSERT INTO users (id, name, email, password, role, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [nextId, 'HR Manager', email, password, 'HR', new Date().toISOString(), new Date().toISOString()]);

            console.log('✅ HR User CREATED with ID:', nextId);
        } else {
            console.log('✅ HR User FOUND:', res.rows[0].email, 'Role:', res.rows[0].role);

            // Verify password matches?
            const match = await bcrypt.compare('hrmainsenora000', res.rows[0].password);
            console.log('🔑 Password match:', match);

            if (!match) {
                console.log('⚠️ Password does NOT match. Updating password...');
                const newPass = await bcrypt.hash('hrmainsenora000', 10);
                await pool.query('UPDATE users SET password = $1 WHERE email = $2', [newPass, email]);
                console.log('✅ Password updated.');
            }

            if (res.rows[0].role !== 'HR') {
                console.log('⚠️ Role is NOT HR. Updating...');
                await pool.query('UPDATE users SET role = $1 WHERE email = $2', ['HR', email]);
                console.log('✅ Role updated to HR.');
            }
        }
    } catch (err) {
        console.error('❌ Error:', err);
    } finally {
        pool.end();
    }
}

checkHrUser();
