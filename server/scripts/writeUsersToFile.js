const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

async function writeUsersToFile() {
  try {
    const dbFile = path.join(__dirname, '..', 'data', 'crm.json');
    
    // Read existing file
    let dbData = { users: [], leads: [], comments: [], attendance: [], loginLogs: [], activityLogs: [], notifications: [], nextId: { users: 1, leads: 1, comments: 1, attendance: 1, notifications: 1 } };
    if (fs.existsSync(dbFile)) {
      try {
        dbData = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
      } catch (e) {
        console.error('Error reading file:', e);
      }
    }

    // Create all users
    const salesTeamHeads = [
      { name: 'Varsha', email: 'varsha@toniosenora.com', password: 'varshasenora876', role: 'SALES_TEAM_HEAD', team: 'sales' },
      { name: 'Kiran', email: 'kiran@toniosenora.com', password: 'kiransenora098', role: 'SALES_TEAM_HEAD', team: 'sales' },
    ];

    const users = [
      { name: 'Emy', email: 'emy@toniosenora.com', password: 'emysenora321', role: 'SALES_TEAM', team: 'sales', managed_by_email: 'varsha@toniosenora.com' },
      { name: 'Shilpa', email: 'shilpa@toniosenora.com', password: 'shilpasenora432', role: 'SALES_TEAM', team: 'sales', managed_by_email: 'varsha@toniosenora.com' },
      { name: 'Asna', email: 'asna@toniosenora.com', password: 'asnasenora543', role: 'SALES_TEAM', team: 'sales', managed_by_email: 'varsha@toniosenora.com' },
      { name: 'Karthika', email: 'karthika@toniosenora.com', password: 'karthikasenora654', role: 'SALES_TEAM', team: 'sales', managed_by_email: 'kiran@toniosenora.com' },
      { name: 'Jibina', email: 'jibina@toniosenora.com', password: 'jibinasenora765', role: 'SALES_TEAM', team: 'sales', managed_by_email: 'kiran@toniosenora.com' },
      { name: 'Kripa', email: 'kripa@toniosenora.com', password: 'kripasenora325', role: 'PROCESSING', team: 'processing' },
      { name: 'ROJISHA', email: 'rojishahead@toniosenora.com', password: 'rojishasenoramain000', role: 'ADMIN', team: 'admin' },
      { name: 'SREELAKSHMI', email: 'sreelakshmi@toniosenora.com', password: 'sreelakshmisenora000', role: 'ADMIN', team: 'admin' },
      { name: 'SHEELA', email: 'sheela@toniosenora.com', password: 'sheelasenorasub000', role: 'ADMIN', team: 'admin' },
      { name: 'SNEHA', email: 'sneha@toniosenora.com', password: 'snehasenora010', role: 'ADMIN', team: 'admin' },
      { name: 'Abhinand (Dummy Staff)', email: 'abhinand@123.com', password: '32123456', role: 'STAFF', team: 'staff' },
    ];

    // Create heads first
    const headIdMap = {};
    let userId = dbData.nextId.users || 1;
    
    for (const headData of salesTeamHeads) {
      const existing = dbData.users.find(u => u.email === headData.email);
      if (existing) {
        headIdMap[headData.email] = existing.id;
        continue;
      }
      
      const hashedPassword = await bcrypt.hash(headData.password, 10);
      const user = {
        id: userId++,
        name: headData.name,
        email: headData.email,
        password: hashedPassword,
        role: headData.role,
        team: headData.team,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      dbData.users.push(user);
      headIdMap[headData.email] = user.id;
      console.log(`✅ Created: ${user.name} (${user.email})`);
    }

    // Create other users
    for (const userData of users) {
      const existing = dbData.users.find(u => u.email === userData.email);
      if (existing) {
        console.log(`⏭️  Skipped: ${userData.name} (${userData.email}) - already exists`);
        continue;
      }

      const hashedPassword = await bcrypt.hash(userData.password, 10);
      const user = {
        id: userId++,
        name: userData.name,
        email: userData.email,
        password: hashedPassword,
        role: userData.role,
        team: userData.team,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (userData.managed_by_email && headIdMap[userData.managed_by_email]) {
        user.managed_by = headIdMap[userData.managed_by_email];
      }

      dbData.users.push(user);
      console.log(`✅ Created: ${user.name} (${user.email}) - Role: ${user.role}`);
    }

    // Update nextId
    dbData.nextId.users = userId;

    // Write to file
    fs.writeFileSync(dbFile, JSON.stringify(dbData, null, 2));
    console.log(`\n✅ Successfully wrote ${dbData.users.length} users to ${dbFile}`);
    
    // Verify
    const verifyData = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
    const dummy = verifyData.users.find(u => u.email === 'abhinand@123.com');
    if (dummy) {
      console.log(`\n✅ Dummy account verified: ${dummy.name} (${dummy.email}) - Role: ${dummy.role}`);
    } else {
      console.log(`\n❌ Dummy account NOT found in file!`);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

writeUsersToFile();
