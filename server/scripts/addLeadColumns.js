require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');

let cs = process.env.DATABASE_URL;
if (cs && !cs.includes('sslmode=')) cs += (cs.includes('?') ? '&' : '?') + 'sslmode=no-verify';
const pool = new Pool({ connectionString: cs });

pool.query(`
  ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS target_country TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS residing_country TEXT DEFAULT NULL;
`).then(() => {
    console.log('✅ Migration done: target_country and residing_country columns added to leads');
    pool.end();
}).catch(e => {
    console.error('❌ Error:', e.message);
    pool.end();
    process.exit(1);
});
