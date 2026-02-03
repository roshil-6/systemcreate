const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const envPath = path.join(__dirname, '..', '.env');

console.log('🚀 Production Setup Script\n');

// Check required environment variables
const requiredVars = ['DATABASE_URL', 'JWT_SECRET'];
const missingVars = [];

for (const varName of requiredVars) {
  if (!process.env[varName] || process.env[varName].includes('[YOUR') || process.env[varName].includes('your-')) {
    missingVars.push(varName);
  }
}

if (missingVars.length > 0) {
  console.error('❌ Missing or incomplete environment variables:');
  missingVars.forEach(v => console.error(`   - ${v}`));
  console.error('\n💡 Please update server/.env with valid values');
  process.exit(1);
}

console.log('✅ Environment variables check passed');

// Test database connection
console.log('\n🔍 Testing database connection...');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});

(async () => {
try {
  const result = await pool.query('SELECT NOW() as current_time, version() as pg_version');
  console.log('✅ Database connection successful!');
  console.log(`   Server time: ${result.rows[0].current_time}`);
  console.log(`   PostgreSQL: ${result.rows[0].pg_version.split(' ')[0]} ${result.rows[0].pg_version.split(' ')[1]}`);
  
  // Check if tables exist
  const tablesResult = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  
  const tables = tablesResult.rows.map(r => r.table_name);
  console.log(`\n📊 Found ${tables.length} tables:`, tables.join(', '));
  
  let missingColumns = [];
  if (tables.length === 0) {
    console.log('\n⚠️  No tables found. Run: npm run init-db');
  } else if (!tables.includes('leads')) {
    console.log('\n⚠️  Leads table missing. Run: npm run init-db');
  } else {
    // Check if required columns exist
    const columnsResult = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'leads'
      ORDER BY column_name
    `);
    const columns = columnsResult.rows.map(r => r.column_name);
    const requiredColumns = ['source', 'ielts_score', 'follow_up_status'];
    missingColumns = requiredColumns.filter(col => !columns.includes(col));
    
    if (missingColumns.length > 0) {
      console.log(`\n⚠️  Missing columns in leads table: ${missingColumns.join(', ')}`);
      console.log('   Run: npm run migrate-columns');
    } else {
      console.log('\n✅ All required columns exist');
    }
  }
  
  await pool.end();
  
  console.log('\n✅ Production setup check complete!');
  console.log('\n📋 Next steps:');
  if (tables.length === 0) {
    console.log('   1. npm run init-db');
  }
  if (missingColumns && missingColumns.length > 0) {
    console.log('   2. npm run migrate-columns');
  }
  console.log('   3. npm start');
  
} catch (error) {
  console.error('❌ Database connection failed:', error.message);
  if (error.code === 'ENOTFOUND') {
    console.error('\n💡 Hostname not found. Check:');
    console.error('   - DATABASE_URL is correct');
    console.error('   - Database server is accessible');
    console.error('   - Network connection is working');
  } else if (error.code === '28P01') {
    console.error('\n💡 Authentication failed. Check:');
    console.error('   - Database password is correct');
    console.error('   - Username is correct');
  } else if (error.code === '3D000') {
    console.error('\n💡 Database does not exist. Create it first.');
  }
  await pool.end();
  process.exit(1);
}
})();
