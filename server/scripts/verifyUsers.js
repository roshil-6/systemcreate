const db = require('../config/database');

function verifyUsers() {
  try {
    console.log('Verifying all users in the database...\n');

    const allUsers = db.getUsers();
    
    console.log(`Total users in database: ${allUsers.length}\n`);
    
    // Group by role
    const byRole = {
      ADMIN: [],
      SALES_TEAM_HEAD: [],
      SALES_TEAM: [],
      PROCESSING: [],
      STAFF: [],
    };

    allUsers.forEach(user => {
      const role = user.role || 'STAFF';
      if (byRole[role]) {
        byRole[role].push(user);
      } else {
        if (!byRole['STAFF']) byRole['STAFF'] = [];
        byRole['STAFF'].push(user);
      }
    });

    // Display by role
    console.log('=== ADMINS ===');
    byRole.ADMIN.forEach(u => {
      console.log(`  ✅ ${u.name} - ${u.email} (ID: ${u.id})`);
    });

    console.log('\n=== SALES TEAM HEADS ===');
    byRole.SALES_TEAM_HEAD.forEach(u => {
      console.log(`  ✅ ${u.name} - ${u.email} (ID: ${u.id})`);
    });

    console.log('\n=== SALES TEAM ===');
    byRole.SALES_TEAM.forEach(u => {
      const manager = u.managed_by ? db.getUsers({ id: u.managed_by })[0] : null;
      console.log(`  ✅ ${u.name} - ${u.email} (ID: ${u.id})${manager ? ` [Managed by: ${manager.name}]` : ''}`);
    });

    console.log('\n=== PROCESSING ===');
    byRole.PROCESSING.forEach(u => {
      console.log(`  ✅ ${u.name} - ${u.email} (ID: ${u.id})`);
    });

    console.log('\n=== STAFF ===');
    byRole.STAFF.forEach(u => {
      console.log(`  ✅ ${u.name} - ${u.email} (ID: ${u.id})`);
    });

    // Verify specific accounts
    console.log('\n=== VERIFICATION ===');
    const requiredAccounts = [
      { email: 'abhinand@123.com', name: 'Abhinand (Dummy Staff)', role: 'STAFF' },
      { email: 'varsha@toniosenora.com', name: 'Varsha', role: 'SALES_TEAM_HEAD' },
      { email: 'kiran@toniosenora.com', name: 'Kiran', role: 'SALES_TEAM_HEAD' },
      { email: 'emy@toniosenora.com', name: 'Emy', role: 'SALES_TEAM' },
      { email: 'shilpa@toniosenora.com', name: 'Shilpa', role: 'SALES_TEAM' },
      { email: 'asna@toniosenora.com', name: 'Asna', role: 'SALES_TEAM' },
      { email: 'karthika@toniosenora.com', name: 'Karthika', role: 'SALES_TEAM' },
      { email: 'jibina@toniosenora.com', name: 'Jibina', role: 'SALES_TEAM' },
      { email: 'kripa@toniosenora.com', name: 'Kripa', role: 'PROCESSING' },
      { email: 'rojishahead@toniosenora.com', name: 'ROJISHA', role: 'ADMIN' },
      { email: 'sreelakshmi@toniosenora.com', name: 'SREELAKSHMI', role: 'ADMIN' },
      { email: 'sheela@toniosenora.com', name: 'SHEELA', role: 'ADMIN' },
      { email: 'sneha@toniosenora.com', name: 'SNEHA', role: 'ADMIN' },
    ];

    let allFound = true;
    requiredAccounts.forEach(required => {
      const found = allUsers.find(u => u.email === required.email);
      if (found) {
        if (found.role === required.role) {
          console.log(`  ✅ ${required.name} (${required.email}) - Role: ${found.role} - VERIFIED`);
        } else {
          console.log(`  ⚠️  ${required.name} (${required.email}) - Expected role: ${required.role}, Found: ${found.role}`);
          allFound = false;
        }
      } else {
        console.log(`  ❌ ${required.name} (${required.email}) - NOT FOUND`);
        allFound = false;
      }
    });

    if (allFound) {
      console.log('\n✅ All required accounts are present and verified!');
    } else {
      console.log('\n⚠️  Some accounts are missing or have incorrect roles.');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error verifying users:', error);
    process.exit(1);
  }
}

verifyUsers();
