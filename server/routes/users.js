const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Get all users (ADMIN only)
router.get('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const users = await db.getUsers();
    const userList = users.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      created_at: u.created_at,
    }));
    res.json(userList);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Create new user (ADMIN only)
router.post(
  '/',
  authenticate,
  requireAdmin,
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('role').isIn(['ADMIN', 'STAFF', 'SALES_TEAM', 'SALES_TEAM_HEAD', 'PROCESSING']).withMessage('Role must be ADMIN, STAFF, SALES_TEAM, SALES_TEAM_HEAD, or PROCESSING'),
    body('phone_number').optional(),
    body('office_number').optional(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { name, email, password, role, phone_number, office_number, dob } = req.body;
      const createdBy = req.user.id;

      // Check if email already exists
      const existingUsers = await db.getUsers({ email });
      if (existingUsers.length > 0) {
        return res.status(400).json({ error: 'Email already exists' });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user
      const newUser = await db.createUser({
        name,
        email,
        password: hashedPassword,
        role,
        created_by: createdBy,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        phone_number: phone_number || null,
        office_number: office_number || null,
        dob: dob || null,
      });

      // Log user creation activity
      await logActivity({
        type: 'user_created',
        user_id: createdBy,
        target_user_id: newUser.id,
        details: `Created ${role} user: ${name} (${email})`,
      });

      // Return user without password
      const { password: _, ...userWithoutPassword } = newUser;
      res.status(201).json(userWithoutPassword);
    } catch (error) {
      console.error('Create user error:', error);
      res.status(500).json({ error: 'Server error', details: error.message });
    }
  }
);

// Update user (ADMIN only)
router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { name, email, password, role, phone_number, office_number, dob } = req.body;

    const users = await db.getUsers({ id: userId });
    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const existingUser = users[0];
    const updates = {};

    if (name !== undefined) updates.name = name;
    if (email !== undefined) {
      // Check if email is already taken by another user
      const emailUsers = await db.getUsers({ email });
      if (emailUsers.length > 0 && emailUsers[0].id !== userId) {
        return res.status(400).json({ error: 'Email already exists' });
      }
      updates.email = email;
    }
    if (password !== undefined) {
      updates.password = await bcrypt.hash(password, 10);
    }
    if (role !== undefined) {
      updates.role = role;
    }
    if (phone_number !== undefined) {
      updates.phone_number = phone_number;
    }
    if (office_number !== undefined) {
      updates.office_number = office_number;
    }
    if (dob !== undefined) {
      updates.dob = dob;
    }

    const updatedUser = await db.updateUser(userId, updates);
    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    const { password: _, ...userWithoutPassword } = updatedUser;

    // Log activity
    await logActivity({
      type: 'user_updated',
      user_id: req.user.id,
      target_user_id: userId,
      details: `Updated user: ${updatedUser.name}`,
    });

    res.json(userWithoutPassword);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Delete user (ADMIN only)
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    // Prevent deleting yourself
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const users = await db.getUsers({ id: userId });
    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userToDelete = users[0];

    // CHECK DEPENDENCIES BEFORE DELETION to prevent 500 Foreign Key Errors

    // 1. Check assigned leads
    const assignedLeads = await db.getLeads({ assigned_staff_id: userId });
    if (assignedLeads.length > 0) {
      return res.status(400).json({
        error: `Cannot delete user. They have ${assignedLeads.length} assigned leads. Please reassign them first.`
      });
    }

    // 2. Check assigned clients
    const assignedClients = await db.getClients({ assigned_staff_id: userId });
    if (assignedClients.length > 0) {
      return res.status(400).json({
        error: `Cannot delete user. They have ${assignedClients.length} assigned clients. Please reassign them first.`
      });
    }

    // 3. Check processing clients
    const processingClients = await db.getClients({ processing_staff_id: userId });
    if (processingClients.length > 0) {
      return res.status(400).json({
        error: `Cannot delete user. They are processing ${processingClients.length} clients. Please reassign them first.`
      });
    }

    // 4. Check if they manage other users (Team Head)
    const teamMembers = await db.getUsers({ managed_by: userId });
    if (teamMembers.length > 0) {
      return res.status(400).json({
        error: `Cannot delete user. They are managing ${teamMembers.length} other staff members. Please reassign their team first.`
      });
    }

    // 5. Check other history (Comments, Attendance, etc.)
    // For these, we might want to allow deletion by setting NULL, but for now safe blocking is better.
    // If we crash here, it means we missed a dependency. 
    // Ideally we should use a transaction and Soft Delete, but for now we proceed.
    // NOTE: If strict FKs exist on comments/attendance without cascade, this might still fail. 
    // However, leads/clients are the most common blockers. 

    // Remove user from database
    await db.deleteUser(userId);

    // Log activity
    await logActivity({
      type: 'user_deleted',
      user_id: req.user.id,
      target_user_id: userId,
      details: `Deleted user: ${userToDelete.name} (${userToDelete.email})`,
    });

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Get activity logs (ADMIN only)
router.get('/activity/logs', authenticate, requireAdmin, async (req, res) => {
  try {
    const logs = await db.getActivityLogs();
    res.json(logs);
  } catch (error) {
    console.error('Get activity logs error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Get login logs (ADMIN only)
router.get('/login/logs', authenticate, requireAdmin, async (req, res) => {
  try {
    const { email, success, limit = 100 } = req.query;
    const filter = {};
    if (email) filter.email = email;
    if (success !== undefined) filter.success = success === 'true';

    const logs = await db.getLoginLogs(filter);
    const limitedLogs = logs.slice(0, parseInt(limit));
    res.json(limitedLogs);
  } catch (error) {
    console.error('Get login logs error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Export users to CSV (for Google Sheets import)
router.get('/export/csv', authenticate, requireAdmin, async (req, res) => {
  try {
    const users = await db.getUsers();

    // Convert to CSV
    const headers = [
      'ID',
      'Name',
      'Email',
      'Role',
      'Team',
      'Managed By',
      'Created At',
      'Updated At'
    ];

    const csvRows = [headers.join(',')];

    // OPTIMIZATION: Create a map of User ID -> Name for fast manager lookup
    const userMap = {};
    users.forEach(u => userMap[u.id] = u.name);

    // Process users sequentially to fetch manager names
    for (const user of users) {
      // Get manager name from map
      let managerName = '';
      if (user.managed_by && userMap[user.managed_by]) {
        managerName = userMap[user.managed_by];
      }

      const row = [
        user.id || '',
        `"${(user.name || '').replace(/"/g, '""')}"`,
        user.email || '',
        user.role || '',
        user.team || '',
        `"${managerName.replace(/"/g, '""')}"`,
        user.created_at || '',
        user.updated_at || ''
      ];
      csvRows.push(row.join(','));
    }

    const csvContent = csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="users_export_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csvContent);
  } catch (error) {
    console.error('Export users error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Helper function to log activities
async function logActivity(activity) {
  await db.createActivityLog({
    ...activity,
    timestamp: new Date().toISOString(),
  });
}

module.exports = router;
