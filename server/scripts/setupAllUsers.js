const db = require('../config/database');
const bcrypt = require('bcryptjs');

async function setupAllUsers() {
  try {
    console.log('Setting up all users for Tonio & Senora CRM...\n');

    // First, create sales team heads (we need their IDs for team assignment)
    const salesTeamHeads = [
      { name: 'Varsha', email: 'varsha@toniosenora.com', password: 'varshasenora876', role: 'SALES_TEAM_HEAD', team: 'sales' },
      { name: 'Kiran', email: 'kiran@toniosenora.com', password: 'kiransenora098', role: 'SALES_TEAM_HEAD', team: 'sales' },
    ];

    const users = [
      // Sales Team - assigned to Varsha (first 3) and Kiran (last 2)
      { name: 'Emy', email: 'emy@toniosenora.com', password: 'emysenora321', role: 'SALES_TEAM', team: 'sales', managed_by_email: 'varsha@toniosenora.com' },
      { name: 'Shilpa', email: 'shilpa@toniosenora.com', password: 'shilpasenora432', role: 'SALES_TEAM', team: 'sales', managed_by_email: 'varsha@toniosenora.com' },
      { name: 'Asna', email: 'asna@toniosenora.com', password: 'asnasenora543', role: 'SALES_TEAM', team: 'sales', managed_by_email: 'varsha@toniosenora.com' },
      { name: 'Karthika', email: 'karthika@toniosenora.com', password: 'karthikasenora654', role: 'SALES_TEAM', team: 'sales', managed_by_email: 'kiran@toniosenora.com' },
      { name: 'Jibina', email: 'jibina@toniosenora.com', password: 'jibinasenora765', role: 'SALES_TEAM', team: 'sales', managed_by_email: 'kiran@toniosenora.com' },
      
      // Processing
      { name: 'Kripa', email: 'kripa@toniosenora.com', password: 'kripasenora325', role: 'PROCESSING', team: 'processing' },
      
      // Admins (Full Access)
      { name: 'ROJISHA', email: 'rojishahead@toniosenora.com', password: 'rojishasenoramain000', role: 'ADMIN', team: 'admin' },
      { name: 'SREELAKSHMI', email: 'sreelakshmi@toniosenora.com', password: 'sreelakshmisenora000', role: 'ADMIN', team: 'admin' },
      { name: 'SHEELA', email: 'sheela@toniosenora.com', password: 'sheelasenorasub000', role: 'ADMIN', team: 'admin' },
      { name: 'SNEHA', email: 'sneha@toniosenora.com', password: 'snehasenora010', role: 'ADMIN', team: 'admin' },
      
      // Dummy Staff Account
      { name: 'Abhinand (Dummy Staff)', email: 'abhinand@123.com', password: '32123456', role: 'STAFF', team: 'staff' },
    ];

    // Create sales team heads first
    const headIdMap = {}; // email -> id mapping
    for (const headData of salesTeamHeads) {
      const existingUsers = db.getUsers({ email: headData.email });
      if (existingUsers.length > 0) {
        console.log(`⏭️  Skipped: ${headData.name} (${headData.email}) - already exists`);
        headIdMap[headData.email] = existingUsers[0].id;
        continue;
      }

      const hashedPassword = await bcrypt.hash(headData.password, 10);
      const newUser = db.createUser({
        name: headData.name,
        email: headData.email,
        password: hashedPassword,
        role: headData.role,
        team: headData.team,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      headIdMap[headData.email] = newUser.id;
      console.log(`✅ Created: ${newUser.name} (${newUser.email}) - Role: ${newUser.role}`);
    }

    let created = 0;
    let skipped = 0;

    // Now create all other users
    for (const userData of users) {
      // Check if user already exists
      const existingUsers = db.getUsers({ email: userData.email });
      if (existingUsers.length > 0) {
        console.log(`⏭️  Skipped: ${userData.name} (${userData.email}) - already exists`);
        skipped++;
        continue;
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(userData.password, 10);

      // Prepare user object
      const userObj = {
        name: userData.name,
        email: userData.email,
        password: hashedPassword,
        role: userData.role,
        team: userData.team,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Add managed_by if specified
      if (userData.managed_by_email && headIdMap[userData.managed_by_email]) {
        userObj.managed_by = headIdMap[userData.managed_by_email];
      }

      // Create user
      const newUser = db.createUser(userObj);

      console.log(`✅ Created: ${newUser.name} (${newUser.email}) - Role: ${newUser.role}${newUser.managed_by ? ` (Managed by: ${userData.managed_by_email})` : ''}`);
      created++;
    }

    // Get all current data
    const allUsers = db.getUsers();
    console.log(`\n📝 Writing ${allUsers.length} users to database file...`);
    
    // Read existing file to preserve other data
    const fs = require('fs');
    const path = require('path');
    const dbFile = path.join(__dirname, '..', 'data', 'crm.json');
    console.log(`📁 Database file path: ${dbFile}`);
    
    let dbData = { users: [], leads: [], comments: [], attendance: [], loginLogs: [], activityLogs: [], notifications: [], nextId: {} };
    if (fs.existsSync(dbFile)) {
      try {
        dbData = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
        console.log(`📖 Read existing database with ${dbData.users.length} users`);
      } catch (e) {
        console.error('Error reading existing database:', e);
      }
    }
    
    // Update with new data
    dbData.users = allUsers;
    dbData.leads = db.getLeads();
    dbData.comments = db.getComments();
    dbData.attendance = db.getAttendance();
    
    // Ensure nextId is set correctly
    if (!dbData.nextId) dbData.nextId = {};
    if (allUsers.length > 0) {
      const maxUserId = Math.max(...allUsers.map(u => u.id || 0));
      dbData.nextId.users = maxUserId + 1;
    } else {
      dbData.nextId.users = 1;
    }
    
    // Write to file
    try {
      fs.writeFileSync(dbFile, JSON.stringify(dbData, null, 2));
      console.log(`✅ Successfully wrote ${dbData.users.length} users to database file`);
      
      // Verify by reading back
      const verifyData = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
      console.log(`✅ Verified: File contains ${verifyData.users.length} users`);
    } catch (e) {
      console.error('❌ Error writing to database file:', e);
    }
    
    // Verify by reading back
    const verifyUsers = db.getUsers();
    console.log(`\n📊 Summary:`);
    console.log(`   Created: ${created} users`);
    console.log(`   Skipped: ${skipped} users (already exist)`);
    console.log(`   Total users in database: ${verifyUsers.length}`);
    console.log(`\n✅ All users setup completed and saved to database!`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error setting up users:', error);
    process.exit(1);
  }
}

setupAllUsers();
