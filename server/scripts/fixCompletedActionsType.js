
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') || process.env.DATABASE_URL?.includes('127.0.0.1')
        ? false
        : { rejectUnauthorized: false },
});

async function fixCompletedActionsType() {
    const client = await pool.connect();

    try {
        console.log('🔧 Checking schema for completed_actions...');

        // Check current type
        const res = await client.query(`
      SELECT data_type, udt_name 
      FROM information_schema.columns 
      WHERE table_name = 'clients' AND column_name = 'completed_actions'
    `);

        if (res.rows.length > 0) {
            const type = res.rows[0].data_type;
            console.log(`Current type: ${type} (${res.rows[0].udt_name})`);

            if (type === 'jsonb') {
                console.log('✅ completed_actions is already JSONB. No action needed.');
                return;
            }

            console.log('⚠️ Column exists but is not JSONB. Dropping and recreating...');
            // Drop to avoid casting errors from corrupted "[object Object]" strings
            await client.query('ALTER TABLE clients DROP COLUMN completed_actions');
        } else {
            console.log('ℹ️ Column does not exist. Creating...');
        }

        // Create as JSONB
        await client.query("ALTER TABLE clients ADD COLUMN completed_actions JSONB DEFAULT '[]'::JSONB");
        console.log('✅ completed_actions column created/reset as JSONB');

    } catch (error) {
        console.error('❌ Error fixing schema:', error.message);
    } finally {
        client.release();
        // Don't close pool if imported? 
        // If run directly, close it.
        if (require.main === module) {
            await pool.end();
        }
    }
}

if (require.main === module) {
    fixCompletedActionsType()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}

module.exports = fixCompletedActionsType;
