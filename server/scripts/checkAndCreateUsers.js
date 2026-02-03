const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkAndCreateUsers() {
  try {
    console.log('👤 Checking and creating users...\n');
    
    // Check existing users
    const result = await pool.query('SELECT * FROM users');
    const existingUsers = result.rows;
    
    if (existingUsers.length > 0) {
      console.log(`⚠️  ${existingUsers.length} user(s) already exist:`);
      existingUsers.forEach(u => {
        console.log(`   - ${u.name} (${u.email}) - ${u.role}`);
      });
      console.log('\n💡 Users already exist. Login should work!');
      console.log('\n📋 Login Credentials:');
      existingUsers.forEach(u => {
        console.log(`   ${u.email} - Role: ${u.role}`);
      });
      await pool.end();
      return;
    }
    
    console.log('📝 No users found. Creating initial users...\n');
    
    // Create admin
    const adminPassword = await bcrypt.hash('admin123', 10);
    await pool.query(`
      INSERT INTO users (name, email, password, role, team, managed_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
    `, ['Admin', 'admin@toniosenora.com', adminPassword, 'ADMIN', null, null]);
    console.log('✅ Admin created: admin@toniosenora.com / admin123');
    
    // Create sales team heads
    const varshaPassword = await bcrypt.hash('varshasenora876', 10);
    await pool.query(`
      INSERT INTO users (name, email, password, role, team, managed_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
    `, ['Varsha', 'varsha@toniosenora.com', varshaPassword, 'SALES_TEAM_HEAD', null, null]);
    console.log('✅ Varsha created: varsha@toniosenora.com / varshasenora876');
    
    const kiranPassword = await bcrypt.hash('kiransenora098', 10);
    await pool.query(`
      INSERT INTO users (name, email, password, role, team, managed_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
    `, ['Kiran', 'kiran@toniosenora.com', kiranPassword, 'SALES_TEAM_HEAD', null, null]);
    console.log('✅ Kiran created: kiran@toniosenora.com / kiransenora098');
    
    // Create sales team
    const salesTeam = [
      { name: 'Emy', email: 'emy@toniosenora.com', password: 'emysenora321' },
      { name: 'Shilpa', email: 'shilpa@toniosenora.com', password: 'shilpasenora432' },
      { name: 'Asna', email: 'asna@toniosenora.com', password: 'asnasenora543' },
      { name: 'Karthika', email: 'karthika@toniosenora.com', password: 'karthikasenora654' },
      { name: 'Jibina', email: 'jibina@toniosenora.com', password: 'jibinasenora765' },
    ];
    
    for (const member of salesTeam) {
      const hashedPassword = await bcrypt.hash(member.password, 10);
      await pool.query(`
        INSERT INTO users (name, email, password, role, team, managed_by, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      `, [member.name, member.email, hashedPassword, 'SALES_TEAM', null, null]);
      console.log(`✅ ${member.name} created: ${member.email} / ${member.password}`);
    }
    
    console.log('\n✅ All users created successfully!');
    console.log('\n📋 Login Credentials:');
    console.log('\nAdmin:');
    console.log('   admin@toniosenora.com / admin123');
    console.log('\nSales Team Heads:');
    console.log('   varsha@toniosenora.com / varshasenora876');
    console.log('   kiran@toniosenora.com / kiransenora098');
    console.log('\nSales Team:');
    salesTeam.forEach(m => {
      console.log(`   ${m.email} / ${m.password}`);
    });
    
    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    await pool.end();
    throw error;
  }
}

checkAndCreateUsers()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
