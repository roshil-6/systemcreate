require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');

let connectionString = process.env.DATABASE_URL;
if (connectionString && !connectionString.includes('sslmode=')) {
    connectionString += (connectionString.includes('?') ? '&' : '?') + 'sslmode=no-verify';
}

const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

async function checkSchema() {
    const client = await pool.connect();
    try {
        const res = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'attendance'
    `);
        console.log('--- Attendance Table Schema ---');
        res.rows.forEach(row => {
            console.log(`${row.column_name}: ${row.data_type}`);
        });
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        client.release();
        await pool.end();
    }
}

checkSchema();
