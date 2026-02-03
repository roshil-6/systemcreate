const bcrypt = require('bcryptjs');
const db = require('../config/database');
require('dotenv').config();

async function createInitialUsers() {
  try {
    console.log('👤 Creating initial users...\n');
    
    // Check if users already exist
    const existingUsers = await db.getUsers();
    if (existingUsers.length > 0) {
      console.log(`⚠️  ${existingUsers.length} user(s) already exist in database.`);
      console.log('   Existing users:');
      existingUsers.forEach(u => {
        console.log(`   - ${u.name} (${u.email}) - ${u.role}`);
      });
      console.log('\n💡 To create new users, use: npm run create-user');
      return;
    }
    
    // Create admin user
    const adminPassword = await bcrypt.hash('admin123', 10);
    const admin = await db.createUser({
      name: 'Admin',
      email: 'admin@toniosenora.com',
      password: adminPassword,
      role: 'ADMIN',
      team: null,
      managed_by: null,
    });
    console.log('✅ Admin user created:');
    console.log('   Email: admin@toniosenora.com');
    console.log('   Password: admin123');
    console.log('   Role: ADMIN\n');
    
    // Create sales team head users
    const varshaPassword = await bcrypt.hash('varshasenora876', 10);
    const varsha = await db.createUser({
      name: 'Varsha',
      email: 'varsha@toniosenora.com',
      password: varshaPassword,
      role: 'SALES_TEAM_HEAD',
      team: null,
      managed_by: null,
    });
    console.log('✅ Sales Team Head created:');
    console.log('   Email: varsha@toniosenora.com');
    console.log('   Password: varshasenora876');
    console.log('   Role: SALES_TEAM_HEAD\n');
    
    const kiranPassword = await bcrypt.hash('kiransenora098', 10);
    const kiran = await db.createUser({
      name: 'Kiran',
      email: 'kiran@toniosenora.com',
      password: kiranPassword,
      role: 'SALES_TEAM_HEAD',
      team: null,
      managed_by: null,
    });
    console.log('✅ Sales Team Head created:');
    console.log('   Email: kiran@toniosenora.com');
    console.log('   Password: kiransenora098');
    console.log('   Role: SALES_TEAM_HEAD\n');
    
    // Create sales team members
    const salesTeamMembers = [
      { name: 'Emy', email: 'emy@toniosenora.com', password: 'emysenora321' },
      { name: 'Shilpa', email: 'shilpa@toniosenora.com', password: 'shilpasenora432' },
      { name: 'Asna', email: 'asna@toniosenora.com', password: 'asnasenora543' },
      { name: 'Karthika', email: 'karthika@toniosenora.com', password: 'karthikasenora654' },
      { name: 'Jibina', email: 'jibina@toniosenora.com', password: 'jibinasenora765' },
    ];
    
    for (const member of salesTeamMembers) {
      const hashedPassword = await bcrypt.hash(member.password, 10);
      await db.createUser({
        name: member.name,
        email: member.email,
        password: hashedPassword,
        role: 'SALES_TEAM',
        team: null,
        managed_by: null, // Both heads see all 5 staff
      });
      console.log(`✅ Sales Team member created: ${member.name} (${member.email})`);
    }
    
    console.log('\n✅ All initial users created successfully!');
    console.log('\n📋 Login Credentials:');
    console.log('\nAdmin:');
    console.log('   Email: admin@toniosenora.com');
    console.log('   Password: admin123');
    console.log('\nSales Team Heads:');
    console.log('   Varsha: varsha@toniosenora.com / varshasenora876');
    console.log('   Kiran: kiran@toniosenora.com / kiransenora098');
    console.log('\nSales Team:');
    salesTeamMembers.forEach(m => {
      console.log(`   ${m.name}: ${m.email} / ${m.password}`);
    });
    
  } catch (error) {
    console.error('❌ Error creating users:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  createInitialUsers()
    .then(() => {
      console.log('\n✅ Done!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Failed:', error.message);
      process.exit(1);
    });
}

module.exports = { createInitialUsers };
