const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function createAllUsers() {
  try {
    console.log('👤 Creating all users...\n');
    
    // Check existing users
    const result = await pool.query('SELECT * FROM users');
    const existingUsers = result.rows;
    
    if (existingUsers.length > 0) {
      console.log(`⚠️  ${existingUsers.length} user(s) already exist.`);
      console.log('   Updating/creating all users...\n');
    }
    
    // Head Admin - ROJISHA (Full access)
    const rojishaPassword = await bcrypt.hash('rojishasenoramain000', 10);
    await upsertUser('ROJISHA', 'rojishahead@toniosenora.com', rojishaPassword, 'ADMIN');
    
    // Admins (Full dashboard access)
    const sreelakshmiPassword = await bcrypt.hash('sreelakshmisenora000', 10);
    await upsertUser('SREELAKSHMI', 'sreelakshmi@toniosenora.com', sreelakshmiPassword, 'ADMIN');
    
    const sheelaPassword = await bcrypt.hash('sheelasenorasub000', 10);
    await upsertUser('SHEELA', 'sheela@toniosenora.com', sheelaPassword, 'ADMIN');
    
    const snehaPassword = await bcrypt.hash('snehasenora010', 10);
    await upsertUser('SNEHA', 'sneha@toniosenora.com', snehaPassword, 'ADMIN');
    
    // Sales Team Heads
    const varshaPassword = await bcrypt.hash('varshasenora876', 10);
    await upsertUser('Varsha', 'varsha@toniosenora.com', varshaPassword, 'SALES_TEAM_HEAD');
    
    const kiranPassword = await bcrypt.hash('kiransenora098', 10);
    await upsertUser('Kiran', 'kiran@toniosenora.com', kiranPassword, 'SALES_TEAM_HEAD');
    
    // Sales Team
    const salesTeam = [
      { name: 'Emy', email: 'emy@toniosenora.com', password: 'emysenora321' },
      { name: 'Shilpa', email: 'shilpa@toniosenora.com', password: 'shilpasenora432' },
      { name: 'Asna', email: 'asna@toniosenora.com', password: 'asnasenora543' },
      { name: 'Karthika', email: 'karthika@toniosenora.com', password: 'karthikasenora654' },
      { name: 'Jibina', email: 'jibina@toniosenora.com', password: 'jibinasenora765' },
    ];
    
    for (const member of salesTeam) {
      const hashedPassword = await bcrypt.hash(member.password, 10);
      await upsertUser(member.name, member.email, hashedPassword, 'SALES_TEAM');
    }
    
    // Processing
    const kripaPassword = await bcrypt.hash('kripasenora325', 10);
    await upsertUser('Kripa', 'kripa@toniosenora.com', kripaPassword, 'PROCESSING');
    
    console.log('\n✅ All users created/updated successfully!');
    console.log('\n📋 Login Credentials Summary:');
    console.log('\n🔴 HEAD ADMIN:');
    console.log('   ROJISHA: rojishahead@toniosenora.com / rojishasenoramain000');
    console.log('\n🟢 ADMINS (Full Dashboard Access):');
    console.log('   SREELAKSHMI: sreelakshmi@toniosenora.com / sreelakshmisenora000');
    console.log('   SHEELA: sheela@toniosenora.com / sheelasenorasub000');
    console.log('   SNEHA: sneha@toniosenora.com / snehasenora010');
    console.log('\n🟡 SALES TEAM HEADS:');
    console.log('   Varsha: varsha@toniosenora.com / varshasenora876');
    console.log('   Kiran: kiran@toniosenora.com / kiransenora098');
    console.log('\n🔵 SALES TEAM:');
    salesTeam.forEach(m => {
      console.log(`   ${m.name}: ${m.email} / ${m.password}`);
    });
    console.log('\n🟣 PROCESSING:');
    console.log('   Kripa: kripa@toniosenora.com / kripasenora325');
    
    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    await pool.end();
    throw error;
  }
}

async function upsertUser(name, email, hashedPassword, role) {
  // Check if user exists
  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  
  if (existing.rows.length > 0) {
    // Update existing user
    await pool.query(`
      UPDATE users 
      SET name = $1, password = $2, role = $3, updated_at = NOW()
      WHERE email = $4
    `, [name, hashedPassword, role, email]);
    console.log(`✅ Updated: ${name} (${email}) - ${role}`);
  } else {
    // Create new user
    await pool.query(`
      INSERT INTO users (name, email, password, role, team, managed_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
    `, [name, email, hashedPassword, role, null, null]);
    console.log(`✅ Created: ${name} (${email}) - ${role}`);
  }
}

createAllUsers()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
