const db = require('../config/database');

async function updateTeamAssignments() {
  try {
    console.log('Updating team assignments...\n');

    // Get team heads
    const varsha = db.getUsers({ email: 'varsha@toniosenora.com' })[0];
    const kiran = db.getUsers({ email: 'kiran@toniosenora.com' })[0];

    if (!varsha || !kiran) {
      console.error('❌ Team heads not found!');
      process.exit(1);
    }

    // Assign sales team members to Varsha (first 3)
    const varshaTeam = ['emy@toniosenora.com', 'shilpa@toniosenora.com', 'asna@toniosenora.com'];
    // Assign sales team members to Kiran (last 2)
    const kiranTeam = ['karthika@toniosenora.com', 'jibina@toniosenora.com'];

    let updated = 0;

    // Update Varsha's team
    for (const email of varshaTeam) {
      const user = db.getUsers({ email })[0];
      if (user) {
        db.updateUser(user.id, { managed_by: varsha.id });
        console.log(`✅ Assigned ${user.name} to Varsha`);
        updated++;
      }
    }

    // Update Kiran's team
    for (const email of kiranTeam) {
      const user = db.getUsers({ email })[0];
      if (user) {
        db.updateUser(user.id, { managed_by: kiran.id });
        console.log(`✅ Assigned ${user.name} to Kiran`);
        updated++;
      }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Updated: ${updated} team assignments`);
    console.log(`\n✅ Team assignments completed!`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error updating team assignments:', error);
    process.exit(1);
  }
}

updateTeamAssignments();
