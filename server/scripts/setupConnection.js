const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const dns = require('dns');

// Force IPv4 resolution first
dns.setDefaultResultOrder('ipv4first');

const envPath = path.join(__dirname, '..', '.env');
const password = 'wmEhA2J91dufKGXt';
const projectId = 'ecfjjffprxyelzxvuday';

console.log('🔧 Supabase Connection Setup\n');

// Get connection string from command line argument
const connectionString = process.argv[2];

if (!connectionString) {
  console.log('❌ No connection string provided!');
  console.log('\n📋 Usage:');
  console.log('   node scripts/setupConnection.js "YOUR_CONNECTION_STRING"');
  console.log('\n💡 How to get connection string:');
  console.log('   1. Go to Supabase Dashboard → Settings → Database');
  console.log('   2. Scroll to "Connection pooling"');
  console.log('   3. Copy connection string from "Transaction mode"');
  console.log('   4. Replace [YOUR-PASSWORD] with:', password);
  console.log('\n📝 Example:');
  console.log(`   node scripts/setupConnection.js "postgresql://postgres.${projectId}:${password}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true"`);
  process.exit(1);
}

// Validate connection string format
if (!connectionString.includes('postgresql://')) {
  console.log('❌ Invalid connection string format!');
  console.log('   Should start with: postgresql://');
  process.exit(1);
}

if (!connectionString.includes(projectId)) {
  console.log('⚠️  Warning: Connection string doesn\'t contain project ID:', projectId);
}

// Update .env file
console.log('📝 Updating server/.env...');

let envContent = '';
if (fs.existsSync(envPath)) {
  envContent = fs.readFileSync(envPath, 'utf8');
} else {
  console.log('⚠️  .env file not found, creating new one...');
}

// Update or add DATABASE_URL
if (envContent.match(/DATABASE_URL=/)) {
  envContent = envContent.replace(/DATABASE_URL=.*/g, `DATABASE_URL=${connectionString}`);
  console.log('✅ Updated existing DATABASE_URL');
} else {
  envContent += `\nDATABASE_URL=${connectionString}\n`;
  console.log('✅ Added DATABASE_URL');
}

// Ensure other required vars exist
if (!envContent.includes('JWT_SECRET=')) {
  envContent += `JWT_SECRET=your-secret-key-change-this-in-production\n`;
}
if (!envContent.includes('NODE_ENV=')) {
  envContent += `NODE_ENV=development\n`;
}
if (!envContent.includes('PORT=')) {
  envContent += `PORT=5001\n`;
}

fs.writeFileSync(envPath, envContent);
console.log('✅ Updated server/.env file');

// Test connection
console.log('\n🔍 Testing connection...');
const pool = new Pool({
  connectionString: connectionString,
  connectionTimeoutMillis: 15000,
  ssl: { rejectUnauthorized: false }
});

pool.query('SELECT NOW() as current_time, version() as pg_version')
  .then(result => {
    console.log('✅ Connection successful!');
    console.log(`   Server time: ${result.rows[0].current_time}`);
    console.log(`   PostgreSQL: ${result.rows[0].pg_version.split(' ')[0]} ${result.rows[0].pg_version.split(' ')[1]}`);
    pool.end();
    
    console.log('\n✅ Setup complete!');
    console.log('\n📋 Next steps:');
    console.log('   1. Initialize database: npm run init-db');
    console.log('   2. Add missing columns: npm run migrate-columns');
    console.log('   3. Start server: npm start');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Connection failed:', error.message);
    if (error.code) {
      console.error('   Error code:', error.code);
    }
    if (error.code === 'ENOTFOUND') {
      console.error('\n💡 Hostname not found. Check:');
      console.error('   - Project is Active in Supabase dashboard');
      console.error('   - Connection string is correct');
      console.error('   - Network connection is working');
    } else if (error.code === 'XX000' || error.message.includes('Tenant')) {
      console.error('\n💡 Tenant not found. Check:');
      console.error('   - Region in connection string matches your project');
      console.error('   - Project ID is correct');
      console.error('   - Connection string format is correct');
    } else if (error.code === '28P01') {
      console.error('\n💡 Authentication failed. Check:');
      console.error('   - Password is correct');
      console.error('   - Username is correct');
    }
    pool.end();
    process.exit(1);
  });
