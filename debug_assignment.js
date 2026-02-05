
const db = require('./server/config/database');

async function debugSystem() {
    try {
        console.log('🔍 -- Debugging Processing Team Assignment --');

        // 1. Check Sneha & Kripa Users
        const users = await db.getUsers();
        const sneha = users.find(u => u.name.toLowerCase().includes('sneha') || u.email.includes('sneha'));
        const kripa = users.find(u => u.name.toLowerCase().includes('kripa') || u.email.includes('kripa'));

        console.log('👤 Sneha User:', sneha ? `${sneha.name} (ID: ${sneha.id}, Role: ${sneha.role})` : 'NOT FOUND');
        console.log('👤 Kripa User:', kripa ? `${kripa.name} (ID: ${kripa.id}, Role: ${kripa.role})` : 'NOT FOUND');

        // 2. Check Recent Clients
        const clients = await db.getClients();
        console.log(`\n📋 Recent Clients (Total: ${clients.length}):`);

        // Sort by id desc to see newest
        const recentClients = clients.sort((a, b) => b.id - a.id).slice(0, 5);

        recentClients.forEach(c => {
            console.log(`- Client ID: ${c.id} | Name: ${c.name}`);
            console.log(`  Assigned Left (Sales): ${c.assigned_staff_id}`);
            console.log(`  Processing Staff (Should be Sneha): ${c.processing_staff_id}`);
            console.log(`  Status: ${c.processing_status}`);
            console.log('---');
        });

    } catch (error) {
        console.error('❌ Error:', error);
    }
}

debugSystem();
