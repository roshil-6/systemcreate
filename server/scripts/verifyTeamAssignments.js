const db = require('../config/database');

console.log('=== Verifying Team Assignments ===\n');

// Get sales team heads
const varsha = db.getUsers({ email: 'varsha@toniosenora.com' })[0];
const kiran = db.getUsers({ email: 'kiran@toniosenora.com' })[0];

console.log('Sales Team Heads:');
if (varsha) {
  console.log(`  ✓ Varsha (ID: ${varsha.id}, Email: ${varsha.email}, Role: ${varsha.role})`);
} else {
  console.log('  ✗ Varsha NOT FOUND');
}

if (kiran) {
  console.log(`  ✓ Kiran (ID: ${kiran.id}, Email: ${kiran.email}, Role: ${kiran.role})`);
} else {
  console.log('  ✗ Kiran NOT FOUND');
}

console.log('\n=== Sales Team Members ===');

// Expected team members
const expectedTeams = {
  varsha: ['emy@toniosenora.com', 'shilpa@toniosenora.com', 'asna@toniosenora.com'],
  kiran: ['karthika@toniosenora.com', 'jibina@toniosenora.com']
};

// Check Varsha's team
if (varsha) {
  console.log(`\nVarsha's Team (managed_by: ${varsha.id}):`);
  const varshaTeam = db.getUsers({ managed_by: varsha.id });
  console.log(`  Found ${varshaTeam.length} team members:`);
  varshaTeam.forEach(m => {
    console.log(`    ✓ ${m.name} (${m.email}, ID: ${m.id}, Role: ${m.role})`);
  });
  
  // Check if all expected members are present
  const varshaEmails = varshaTeam.map(m => m.email.toLowerCase());
  expectedTeams.varsha.forEach(email => {
    if (varshaEmails.includes(email.toLowerCase())) {
      console.log(`    ✓ Expected: ${email} - FOUND`);
    } else {
      console.log(`    ✗ Expected: ${email} - MISSING!`);
    }
  });
}

// Check Kiran's team
if (kiran) {
  console.log(`\nKiran's Team (managed_by: ${kiran.id}):`);
  const kiranTeam = db.getUsers({ managed_by: kiran.id });
  console.log(`  Found ${kiranTeam.length} team members:`);
  kiranTeam.forEach(m => {
    console.log(`    ✓ ${m.name} (${m.email}, ID: ${m.id}, Role: ${m.role})`);
  });
  
  // Check if all expected members are present
  const kiranEmails = kiranTeam.map(m => m.email.toLowerCase());
  expectedTeams.kiran.forEach(email => {
    if (kiranEmails.includes(email.toLowerCase())) {
      console.log(`    ✓ Expected: ${email} - FOUND`);
    } else {
      console.log(`    ✗ Expected: ${email} - MISSING!`);
    }
  });
}

// Check all sales team members
console.log('\n=== All Sales Team Members ===');
const allSalesTeam = db.getUsers({ role: 'SALES_TEAM' });
console.log(`Total SALES_TEAM users: ${allSalesTeam.length}`);
allSalesTeam.forEach(m => {
  const manager = m.managed_by ? db.getUsers({ id: m.managed_by })[0] : null;
  console.log(`  ${m.name} (${m.email}) - managed_by: ${manager ? manager.name : 'NONE'}`);
});

console.log('\n=== Summary ===');
if (varsha) {
  const varshaTeam = db.getUsers({ managed_by: varsha.id });
  console.log(`Varsha should see: ${1 + varshaTeam.length} staff (herself + ${varshaTeam.length} team members)`);
}
if (kiran) {
  const kiranTeam = db.getUsers({ managed_by: kiran.id });
  console.log(`Kiran should see: ${1 + kiranTeam.length} staff (himself + ${kiranTeam.length} team members)`);
}
