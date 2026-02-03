const fs = require('fs');
const path = require('path');

const dbFile = path.join(__dirname, '..', 'data', 'crm.json');
const data = JSON.parse(fs.readFileSync(dbFile, 'utf8'));

console.log(`Users in file: ${data.users.length}\n`);
data.users.forEach(u => {
  console.log(`  ✅ ${u.name} (${u.email}) - Role: ${u.role}`);
});
