const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function analyze() {
    try {
        const query = `
      EXPLAIN ANALYZE
      SELECT id FROM leads 
      WHERE 1=1 AND deleted_at IS NULL AND (status = 'New' OR status = 'Unassigned') AND NOT EXISTS (SELECT 1 FROM comments WHERE lead_id = leads.id)
      ORDER BY created_at DESC, updated_at DESC 
      LIMIT 200 OFFSET 0;
    `;
        const res = await pool.query(query);
        console.log("== NEW TAB QUERY ==");
        console.log(res.rows.map(r => r["QUERY PLAN"]).join('\n'));

        const query2 = `
      EXPLAIN ANALYZE
      SELECT COUNT(*) FROM leads 
      WHERE 1=1 AND deleted_at IS NULL AND (status = 'New' OR status = 'Unassigned') AND NOT EXISTS (SELECT 1 FROM comments WHERE lead_id = leads.id);
    `;
        const res2 = await pool.query(query2);
        console.log("\n== NEW TAB COUNT QUERY ==");
        console.log(res2.rows.map(r => r["QUERY PLAN"]).join('\n'));

        const query3 = `
      EXPLAIN ANALYZE
      SELECT id FROM leads 
      WHERE 1=1 AND deleted_at IS NULL AND EXISTS (SELECT 1 FROM comments WHERE lead_id = leads.id)
      ORDER BY created_at DESC, updated_at DESC 
      LIMIT 200 OFFSET 0;
    `;
        const res3 = await pool.query(query3);
        console.log("\n== FOLLOW UP TAB QUERY ==");
        console.log(res3.rows.map(r => r["QUERY PLAN"]).join('\n'));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

analyze();
