const fs = require('fs');
const content = fs.readFileSync('c:/Users/Abhinand Antony/Desktop/CRM/client/src/pages/Dashboard.js', 'utf8');
let openCount = 0;
let closeCount = 0;
for (let i = 0; i < content.length; i++) {
    if (content[i] === '{') openCount++;
    if (content[i] === '}') closeCount++;
}
console.log(`Open: ${openCount}, Close: ${closeCount}`);
