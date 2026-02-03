const db = require('../config/database');
const bcrypt = require('bcryptjs');

async function createUser() {
  try {
    const args = process.argv.slice(2);
    
    if (args.length < 3) {
      console.log('Usage: node createUser.js <name> <email> <password> [role]');
      console.log('Example: node createUser.js "John Doe" "john@example.com" "password123" "STAFF"');
      process.exit(1);
    }

    const name = args[0];
    const email = args[1];
    const password = args[2];
    const role = args[3] || 'STAFF';

    if (!['ADMIN', 'STAFF'].includes(role)) {
      console.error('Role must be either ADMIN or STAFF');
      process.exit(1);
    }

    // Check if email already exists
    const existingUsers = db.getUsers({ email });
    if (existingUsers.length > 0) {
      console.error(`User with email ${email} already exists!`);
      process.exit(1);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const newUser = db.createUser({
      name,
      email,
      password: hashedPassword,
      role,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    console.log('✅ User created successfully!');
    console.log(`Name: ${newUser.name}`);
    console.log(`Email: ${newUser.email}`);
    console.log(`Role: ${newUser.role}`);
    console.log(`ID: ${newUser.id}`);
    console.log(`\nLogin credentials:`);
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);

    process.exit(0);
  } catch (error) {
    console.error('Error creating user:', error);
    process.exit(1);
  }
}

createUser();
