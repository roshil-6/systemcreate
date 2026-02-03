const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: '../.env' }); // Adjust path if running from scripts folder

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const users = [
    // Sales Team
    { name: 'Emy', email: 'emy@toniosenora.com', password: 'emysenora321', role: 'staff', team: 'Sales' },
    { name: 'Shilpa', email: 'shilpa@toniosenora.com', password: 'shilpasenora432', role: 'staff', team: 'Sales' },
    { name: 'Asna', email: 'asna@toniosenora.com', password: 'asnasenora543', role: 'staff', team: 'Sales' },
    { name: 'Karthika', email: 'karthika@toniosenora.com', password: 'karthikasenora654', role: 'staff', team: 'Sales' },
    { name: 'Jibina', email: 'jibina@toniosenora.com', password: 'jibinasenora765', role: 'staff', team: 'Sales' },

    // Leadership / Heads
    { name: 'Varsha', email: 'varsha@toniosenora.com', password: 'varshasenora876', role: 'admin', team: 'Sales Head' },
    { name: 'Kiran', email: 'kiran@toniosenora.com', password: 'kiransenora098', role: 'admin', team: 'Sales Head' },
    { name: 'Kripa', email: 'kripa@toniosenora.com', password: 'kripasenora325', role: 'admin', team: 'Sales Head' },
    { name: 'Rojisha', email: 'rojishahead@toniosenora.com', password: 'rojishasenoramain000', role: 'admin', team: 'Sales Head' },
    { name: 'Sreelakshmi', email: 'sreelakshmi@toniosenora.com', password: 'sreelakshmisenora000', role: 'admin', team: 'Sales Head' },
    { name: 'Sheela', email: 'sheela@toniosenora.com', password: 'sheelasenorasub000', role: 'admin', team: 'Sales Head' },
    { name: 'Sneha', email: 'sneha@toniosenora.com', password: 'snehasenora010', role: 'admin', team: 'Sales Head' }
];

async function seedUsers() {
    console.log('🌱 Seeding staff users...');

    try {
        for (const user of users) {
            // Check if user exists
            const res = await pool.query('SELECT * FROM users WHERE email = $1', [user.email]);

            if (res.rows.length === 0) {
                // Hash password
                const salt = await bcrypt.genSalt(10);
                const hashedPassword = await bcrypt.hash(user.password, salt);

                // Insert user
                await pool.query(
                    `INSERT INTO users (name, email, password, role, team, created_at, updated_at) 
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
                    [user.name, user.email, hashedPassword, user.role, user.team]
                );
                console.log(`✅ Created: ${user.name} (${user.email})`);
            } else {
                // Update password if exists (to ensure they can login)
                const salt = await bcrypt.genSalt(10);
                const hashedPassword = await bcrypt.hash(user.password, salt);

                await pool.query(
                    `UPDATE users SET password = $1, role = $2, team = $3, updated_at = NOW() WHERE email = $4`,
                    [hashedPassword, user.role, user.team, user.email]
                );
                console.log(`🔄 Updated: ${user.name} (${user.email})`);
            }
        }
        console.log('\n✨ All users seeded successfully!');
    } catch (error) {
        console.error('❌ Seeding failed:', error);
    } finally {
        await pool.end();
    }
}

seedUsers();
