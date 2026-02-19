const { Pool } = require('pg');
require('dotenv').config();
const dns = require('dns');

// Force IPv4 first to avoid Railway/Render connection timeouts
try {
    dns.setDefaultResultOrder('ipv4first');
} catch (error) {
    // Ignore if not supported
}

// --- CONNECTION STRING SANITIZATION ---
let connectionString = process.env.DATABASE_URL;
if (connectionString && !connectionString.includes('sslmode=')) {
    // Railway/Neon often requires explicit sslmode in the string for some driver versions
    connectionString += (connectionString.includes('?') ? '&' : '?') + 'sslmode=no-verify';
}

const pool = new Pool({
    connectionString: connectionString,
    ssl: {
        rejectUnauthorized: false,
        minVersion: 'TLSv1.2'
    },
    connectionTimeoutMillis: 10000,
});

async function addUserColumns() {
    const client = await pool.connect();

    try {
        console.log('🔧 Checking and adding phone columns to users table...\n');

        await client.query('BEGIN');

        // Check if phone_number column exists, if not add it
        try {
            await client.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number TEXT
      `);
            console.log('✅ phone_number column added (or already exists)');
        } catch (error) {
            console.log('ℹ️  Error checking/adding phone_number column: ' + error.message);
        }

        // Check if whatsapp_number column exists, if not add it
        try {
            await client.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_number TEXT
      `);
            console.log('✅ whatsapp_number column added (or already exists)');
        } catch (error) {
            console.log('ℹ️  Error checking/adding whatsapp_number column: ' + error.message);
        }

        await client.query('COMMIT');
        console.log('\n✅ User columns migration completed successfully!');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error adding columns:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

addUserColumns()
    .then(() => {
        process.exit(0);
    })
    .catch((error) => {
        console.error('Migration failed:', error);
        process.exit(1);
    });
