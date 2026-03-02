
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const db = require('./config/database');

async function debugTrash() {
    const logFile = path.join(__dirname, 'trash_debug.log');
    fs.writeFileSync(logFile, `=== Trash Debug Log ${new Date().toISOString()} ===\n`);

    try {
        const trashedLeads = await db.getTrashedLeads();
        fs.appendFileSync(logFile, `Total Trasher Leads from db.getTrashedLeads(): ${trashedLeads.length}\n`);

        if (trashedLeads.length > 0) {
            trashedLeads.forEach(l => {
                fs.appendFileSync(logFile, `ID: ${l.id}, Name: ${l.name}, Status: ${l.status}, DeletedAt: ${l.deleted_at}, DeletedBy: ${l.deleted_by_name || l.deleted_by}\n`);
            });
        } else {
            fs.appendFileSync(logFile, "No trashed leads found.\n");
        }

        // Check if they are filtered in the main getLeads call
        const allLeads = await db.getLeads({ limit: 10000 });
        const deletedInMain = allLeads.filter(l => l.deleted_at !== null);
        fs.appendFileSync(logFile, `Leads with deleted_at IS NOT NULL in main getLeads call: ${deletedInMain.length}\n`);

        // Check user roles
        const users = await db.getUsers();
        fs.appendFileSync(logFile, "\n=== User Roles ===\n");
        users.forEach(u => {
            fs.appendFileSync(logFile, `User: ${u.name}, Role: ${u.role}\n`);
        });

    } catch (e) {
        fs.appendFileSync(logFile, `ERROR: ${e.message}\n${e.stack}\n`);
    } finally {
        await db.end();
        console.log(`Debug log written to ${logFile}`);
    }
}

debugTrash();
