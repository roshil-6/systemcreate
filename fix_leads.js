const fs = require('fs');
const path = 'c:/Users/Abhinand Antony/Desktop/CRM/server/routes/leads.js';
let content = fs.readFileSync(path, 'utf8');
const searchBlock = /if\s*\(search\)\s*\{\s*filter\.search\s*=\s*search;\s*\}/g;
if (searchBlock.test(content) && !content.includes('filter.phone = phone')) {
    content = content.replace(searchBlock, (match) => match + '\n\n    if (phone) {\n      filter.phone = phone;\n    }');
    fs.writeFileSync(path, content);
    console.log('Fixed leads.js');
} else {
    console.log('Target not found or already fixed');
}
