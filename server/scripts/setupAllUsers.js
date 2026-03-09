const db = require('../config/database');
const bcrypt = require('bcryptjs');

// All staff for Tonio & Senora CRM
// This script creates new accounts OR resets credentials for existing ones (upsert)
const ALL_USERS = [
  // ── Sales Team ──────────────────────────────────────────────────────────────
  { name: 'Emy',      email: 'emy@toniosenora.com',      password: 'emysenora321',      role: 'SALES_TEAM',      team: 'sales', managed_by_email: 'varsha@toniosenora.com' },
  { name: 'Shilpa',   email: 'shilpa@toniosenora.com',   password: 'shilpasenora432',   role: 'SALES_TEAM',      team: 'sales', managed_by_email: 'varsha@toniosenora.com' },
  { name: 'Asna',     email: 'asna@toniosenora.com',     password: 'asnasenora543',     role: 'SALES_TEAM',      team: 'sales', managed_by_email: 'varsha@toniosenora.com' },
  { name: 'Karthika', email: 'karthika@toniosenora.com', password: 'karthikasenora654', role: 'SALES_TEAM',      team: 'sales', managed_by_email: 'kiran@toniosenora.com'  },
  { name: 'Jibina',   email: 'jibina@toniosenora.com',   password: 'jibinasenora765',   role: 'SALES_TEAM',      team: 'sales', managed_by_email: 'kiran@toniosenora.com'  },
  { name: 'Ronjan',   email: 'ronjan@toniosenora.com',   password: 'ronjansenora111',   role: 'SALES_TEAM',      team: 'sales' },
  { name: 'Anagha',   email: 'anagha@toniosenora.com',   password: 'anaghasenora222',   role: 'SALES_TEAM',      team: 'sales' },

  // ── Sales Team Heads ────────────────────────────────────────────────────────
  { name: 'Varsha',   email: 'varsha@toniosenora.com',   password: 'varshasenora876',   role: 'SALES_TEAM_HEAD', team: 'sales' },
  { name: 'Kiran',    email: 'kiran@toniosenora.com',    password: 'kiransenora098',    role: 'SALES_TEAM_HEAD', team: 'sales' },

  // ── Processing ──────────────────────────────────────────────────────────────
  { name: 'Kripa',    email: 'kripa@toniosenora.com',    password: 'kripasenora325',    role: 'ADMIN',           team: 'admin' },

  // ── Admin ───────────────────────────────────────────────────────────────────
  { name: 'ROJISHA',      email: 'rojishahead@toniosenora.com', password: 'rojishasenoramain000',  role: 'ADMIN', team: 'admin' },
  { name: 'SREELAKSHMI',  email: 'sreelakshmi@toniosenora.com', password: 'sreelakshmisenora000', role: 'ADMIN', team: 'admin' },
  { name: 'SHEELA',       email: 'sheela@toniosenora.com',      password: 'sheelasenorasub000',   role: 'ADMIN', team: 'admin' },
  { name: 'SNEHA',        email: 'sneha@toniosenora.com',       password: 'snehasenora010',       role: 'ADMIN', team: 'admin' },

  // ── HR Manager ──────────────────────────────────────────────────────────────
  { name: 'Sneha Unnikrishnan', email: 'hr@toniosenora.com', password: 'hrmainsenora000', role: 'HR', team: 'hr' },
];

async function setupAllUsers() {
  console.log('=================================================');
  console.log('  Tonio & Senora CRM — User Setup / Credential Fix');
  console.log('=================================================\n');

  let created = 0;
  let updated = 0;
  let errors  = 0;

  // Build head email → DB id map (needed for managed_by)
  // We do a first pass to ensure all users exist before assigning managed_by
  const emailToId = {};

  // ── Pass 1: upsert every user (create or update password+role) ──────────────
  for (const u of ALL_USERS) {
    try {
      const hashedPassword = await bcrypt.hash(u.password, 10);
      const existing = await db.getUsers({ email: u.email });

      if (existing.length > 0) {
        // Reset password and ensure correct role
        await db.updateUser(existing[0].id, {
          password: hashedPassword,
          role:     u.role,
          name:     u.name,
          team:     u.team,
        });
        emailToId[u.email] = existing[0].id;
        console.log(`🔄 Updated : ${u.name} (${u.email}) — Role: ${u.role}`);
        updated++;
      } else {
        const newUser = await db.createUser({
          name:       u.name,
          email:      u.email,
          password:   hashedPassword,
          role:       u.role,
          team:       u.team,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        emailToId[u.email] = newUser.id;
        console.log(`✅ Created : ${newUser.name} (${newUser.email}) — Role: ${newUser.role}`);
        created++;
      }
    } catch (err) {
      console.error(`❌ Failed  : ${u.name} (${u.email}) — ${err.message}`);
      errors++;
    }
  }

  // ── Pass 2: wire up managed_by for sales team members ──────────────────────
  console.log('\n── Assigning team managers ────────────────────────');
  for (const u of ALL_USERS) {
    if (!u.managed_by_email) continue;
    const managerId = emailToId[u.managed_by_email];
    const memberId  = emailToId[u.email];
    if (!managerId || !memberId) continue;
    try {
      await db.updateUser(memberId, { managed_by: managerId });
      console.log(`🔗 ${u.name} → managed by ${u.managed_by_email}`);
    } catch (err) {
      console.error(`❌ Could not set manager for ${u.name}: ${err.message}`);
    }
  }

  console.log('\n=================================================');
  console.log(`  Done.  Created: ${created}  Updated: ${updated}  Errors: ${errors}`);
  console.log('=================================================');
  process.exit(errors > 0 ? 1 : 0);
}

setupAllUsers().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
