const express = require('express');
const db = require('../config/database');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Check-in
router.post('/checkin', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date().toISOString().split('T')[0];

    // Check if already checked in today
    const existingAttendance = await db.getAttendance({ user_id: userId, date: today });
    const existingCheck = existingAttendance.find(a => !a.check_out);

    if (existingCheck) {
      return res.status(400).json({ error: 'Already checked in today' });
    }

    const attendance = await db.createAttendance({
      user_id: userId,
      check_in: new Date().toISOString(),
      date: today,
      check_out: null,
    });

    res.status(201).json(attendance);
  } catch (error) {
    console.error('Check-in error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Check-out
router.post('/checkout', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date().toISOString().split('T')[0];

    const existingAttendance = await db.getAttendance({ user_id: userId, date: today });
    const existingCheck = existingAttendance.find(a => !a.check_out);

    if (!existingCheck) {
      return res.status(400).json({ error: 'No active check-in found for today' });
    }

    const updated = await db.updateAttendance(existingCheck.id, {
      check_out: new Date().toISOString(),
    });

    res.json(updated);
  } catch (error) {
    console.error('Check-out error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Get attendance status for today
router.get('/today', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date().toISOString().split('T')[0];

    const attendance = db.getAttendance({ user_id: userId, date: today });
    const todayRecord = attendance[0];

    if (!todayRecord) {
      return res.json({ checkedIn: false, checkedOut: false });
    }

    res.json({
      checkedIn: true,
      checkedOut: todayRecord.check_out !== null,
      checkIn: todayRecord.check_in,
      checkOut: todayRecord.check_out,
    });
  } catch (error) {
    console.error('Get today attendance error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Helper function to get accessible user IDs for attendance
async function getAccessibleUserIdsForAttendance(user) {
  const role = user.role;
  const userId = user.id;
  
  if (role === 'ADMIN') {
    return null; // null means all users
  } else if (role === 'SALES_TEAM_HEAD') {
    // Sales team head sees themselves + only their team members (those managed by them)
    const teamMembers = await db.getUsers({ managed_by: userId });
    return [userId, ...teamMembers.map(u => u.id)];
  } else if (role === 'SALES_TEAM' || role === 'PROCESSING') {
    return [userId];
  } else if (role === 'STAFF') {
    return [userId];
  }
  
  return [userId];
}

// Get attendance history
router.get('/history', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;
    const { startDate, endDate, staffId } = req.query;

    const filter = {};

    if (role === 'ADMIN') {
      // ADMIN can see all or filter by staff
      if (staffId) {
        filter.user_id = parseInt(staffId);
      }
    } else {
      // Get accessible user IDs based on role
      const accessibleUserIds = await getAccessibleUserIdsForAttendance(req.user);
      if (accessibleUserIds) {
        // For team-based access, we need to filter attendance records
        // This will be handled after fetching
      } else {
        filter.user_id = userId;
      }
    }

    if (startDate) {
      filter.startDate = startDate;
    }

    if (endDate) {
      filter.endDate = endDate;
    }

    let attendance = await db.getAttendance(filter);

    // Apply team-based filtering if needed
    if (role !== 'ADMIN' && !staffId) {
      const accessibleUserIds = getAccessibleUserIdsForAttendance(req.user);
      if (accessibleUserIds) {
        attendance = attendance.filter(a => accessibleUserIds.includes(a.user_id));
      }
    }

    // Add user names
    const attendanceWithNames = await Promise.all(attendance.map(async a => ({
      ...a,
      user_name: await db.getUserName(a.user_id) || 'Unknown',
    })));
    attendance = attendanceWithNames;

    // Limit to 100 records
    attendance = attendance.slice(0, 100);

    res.json(attendance);
  } catch (error) {
    console.error('Get attendance history error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Get all staff for admin filter
router.get('/staff', authenticate, async (req, res) => {
  try {
    const role = req.user.role;
    const userId = req.user.id;
    let staff = [];
    
    if (role === 'ADMIN') {
      // Admin sees all staff
      const allUsers = await db.getUsers();
      staff = allUsers.filter(u => u.role !== 'ADMIN');
    } else if (role === 'SALES_TEAM_HEAD') {
      // Sales team head sees only their team members (those managed by them)
      const teamMembers = await db.getUsers({ managed_by: userId });
      staff = [req.user, ...teamMembers];
    } else {
      // Others see only themselves
      staff = [req.user];
    }
    
    const staffList = staff.map(s => ({
      id: s.id,
      name: s.name,
      email: s.email,
    }));

    res.json(staffList);
  } catch (error) {
    console.error('Get staff list error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Get missing attendance (users who didn't check in today)
router.get('/missing', authenticate, async (req, res) => {
  try {
    const role = req.user.role;
    const userId = req.user.id;
    const today = new Date().toISOString().split('T')[0];
    
    // Get all staff based on role
    let allStaff = [];
    if (role === 'ADMIN') {
      // Admin sees all non-admin staff
      const allUsers = await db.getUsers();
      allStaff = allUsers.filter(u => u.role !== 'ADMIN');
    } else if (role === 'SALES_TEAM_HEAD') {
      // Sales team head sees themselves and their team members
      const teamMembers = await db.getUsers({ managed_by: userId });
      allStaff = [req.user, ...teamMembers];
    } else {
      // Others don't have access to this endpoint
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Get today's attendance records
    const todayAttendance = await db.getAttendance({ date: today });
    const checkedInUserIds = new Set(todayAttendance.map(a => a.user_id));
    
    // Find staff who didn't check in
    const missingAttendance = allStaff
      .filter(staff => !checkedInUserIds.has(staff.id))
      .map(staff => ({
        id: staff.id,
        name: staff.name,
        email: staff.email,
        role: staff.role,
      }));
    
    res.json({
      date: today,
      missingCount: missingAttendance.length,
      totalStaff: allStaff.length,
      checkedInCount: checkedInUserIds.size,
      missingStaff: missingAttendance,
    });
  } catch (error) {
    console.error('Get missing attendance error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

module.exports = router;
