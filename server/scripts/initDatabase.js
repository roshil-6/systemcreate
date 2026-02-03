const db = require('../config/database');
const bcrypt = require('bcryptjs');

async function initDatabase() {
  try {
    console.log('Initializing database...');

    // Check if admin exists
    const adminCheck = db.getUsers({ role: 'ADMIN' });
    
    if (adminCheck.length === 0) {
      // Create admin user
      const adminPassword = await bcrypt.hash('admin123', 10);
      db.createUser({
        name: 'Admin User',
        email: 'admin@toniosenora.com',
        password: adminPassword,
        role: 'ADMIN',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      console.log('Admin user created: admin@toniosenora.com / admin123');
    }

    // Check if Emy P Thomas exists
    const emyCheck = db.getUsers({ email: 'emy@toniosenora.com' });
    
    if (emyCheck.length === 0) {
      // Create Emy P Thomas as STAFF (NOT admin)
      const staffPassword = await bcrypt.hash('staff123', 10);
      db.createUser({
        name: 'Emy P Thomas',
        email: 'emy@toniosenora.com',
        password: staffPassword,
        role: 'STAFF',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      console.log('Staff user created: Emy P Thomas (emy@toniosenora.com / staff123)');
    }

    console.log('Database initialization completed!');
    console.log(`Database file: server/data/crm.json`);
    process.exit(0);
  } catch (error) {
    console.error('Error initializing database:', error);
    process.exit(1);
  }
}

initDatabase();
