const express = require('express');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const XLSX = require('xlsx');
const iconv = require('iconv-lite');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// Configure multer for CSV file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    console.log('🔍 Multer fileFilter - File info:', {
      originalname: file.originalname,
      mimetype: file.mimetype,
      fieldname: file.fieldname
    });

    // Accept CSV, Excel, and other spreadsheet files
    const allowedExtensions = ['.csv', '.xlsx', '.xls', '.xlsm', '.xlsb'];
    const allowedMimeTypes = [
      'text/csv',
      'application/csv',
      'text/plain',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel.sheet.macroEnabled.12',
      'application/vnd.ms-excel.sheet.binary.macroEnabled.12'
    ];

    const hasValidExtension = allowedExtensions.some(ext =>
      file.originalname.toLowerCase().endsWith(ext)
    );
    const hasValidMimeType = allowedMimeTypes.includes(file.mimetype);

    if (hasValidExtension || hasValidMimeType) {
      console.log('✅ Multer: File accepted');
      cb(null, true);
    } else {
      console.error('❌ Multer: File rejected - not a supported format');
      cb(new Error(`Invalid file type. Expected CSV or Excel, got: ${file.mimetype || 'unknown'}`));
    }
  },
});



// Get all leads (with role-based filtering)
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;
    const { status, search, phone, assigned_staff_id } = req.query;

    const filter = {};

    if (assigned_staff_id) {
      filter.assigned_staff_id = assigned_staff_id;
    }

    // Determine accessible user IDs based on role
    let accessibleUserIds = null;
    if (role === 'ADMIN') {
      // Admin sees all
      accessibleUserIds = null;
    } else if (role === 'SALES_TEAM_HEAD') {
      // Sales team head sees themselves + only their team members (those managed by them)
      const teamMembers = await db.getUsers({ managed_by: userId });
      accessibleUserIds = [userId, ...teamMembers.map(u => u.id)];
    } else if (role === 'SALES_TEAM' || role === 'PROCESSING') {
      // Sales team and processing see only their own
      accessibleUserIds = [userId];
    } else if (role === 'STAFF') {
      // Legacy STAFF role
      accessibleUserIds = [userId];
    } else {
      accessibleUserIds = [userId];
    }

    if (accessibleUserIds && accessibleUserIds.length > 1) {
      filter.assigned_staff_ids = accessibleUserIds;
    }

    if (status) {
      filter.status = status;
    }

    if (search) {
      filter.search = search;
    }

    if (phone) {
      filter.phone = phone;
    }

    // Performance: Filter out Registration Completed at database level
    filter.excludeStatus = 'Registration Completed';

    let leads = await db.getLeads(filter);

    // OPTIMIZATION: Fetch all users once and create a lookup map
    // This replaces the N+1 query pattern where we fetched user name for every single lead
    let userMap = {};
    try {
      const allUsers = await db.getUsers();
      allUsers.forEach(u => {
        userMap[u.id] = u.name;
      });
    } catch (error) {
      console.error('Optimization warning: Failed to fetch users for lookup, falling back to null names', error);
    }

    // Add assigned staff name using the lookup map
    leads = leads.map(lead => ({
      ...lead,
      assigned_staff_name: lead.assigned_staff_id ? (userMap[lead.assigned_staff_id] || null) : null,
    }));

    // Exclude leads with "Registration Completed" status
    leads = leads.filter(l => l.status !== 'Registration Completed');

    res.json(leads);
  } catch (error) {
    console.error('Get leads error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Get staff list for assignment
router.get('/staff/list', authenticate, async (req, res) => {
  try {
    const role = req.user.role;
    const userId = req.user.id;
    let users = [];

    // Admin can assign to anyone
    if (role === 'ADMIN') {
      const allUsers = await db.getUsers();
      // Allow Admin to see everyone including other admins
      users = allUsers;
    }
    // Sales Team Head can assign to self + team
    else if (role === 'SALES_TEAM_HEAD') {
      const teamMembers = await db.getUsers({ managed_by: userId });
      users = [req.user, ...teamMembers];
    }
    // Regular Staff/Sales/Processing
    else {
      // Can assign to self (Claim)
      users.push(req.user);

      // Can transfer to other staff? 
      // Existing logic allows transfer to non-admins. So they should see other staff.
      const allStaff = await db.getUsers();
      const otherStaff = allStaff.filter(u =>
        u.role !== 'ADMIN' && u.id !== userId
      );
      users = [...users, ...otherStaff];
    }

    // Deduplicate by ID
    const uniqueUsers = Array.from(new Map(users.map(item => [item.id, item])).values());

    // Sort by name
    uniqueUsers.sort((a, b) => a.name.localeCompare(b.name));

    res.json(uniqueUsers);
  } catch (error) {
    console.error('Error fetching staff list:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Bulk assign leads (admin, sales team head, and staff for their own leads)
router.post('/bulk-assign', authenticate, async (req, res) => {
  try {
    const role = req.user.role;
    const userId = req.user.id;
    const { leadIds, assigned_staff_id } = req.body;

    // Allow ADMIN, SALES_TEAM_HEAD, and staff to transfer their own leads
    const canBulkAssign = role === 'ADMIN' || role === 'SALES_TEAM_HEAD' || role === 'SALES_TEAM' || role === 'PROCESSING' || role === 'STAFF';

    if (!canBulkAssign) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({ error: 'leadIds must be a non-empty array' });
    }

    const staffId = assigned_staff_id !== null && assigned_staff_id !== undefined
      ? Number(assigned_staff_id)
      : null;

    if (!staffId || Number.isNaN(staffId)) {
      return res.status(400).json({ error: 'Valid assigned_staff_id is required' });
    }

    const staffUsers = await db.getUsers({ id: staffId });
    const staffUser = staffUsers[0];
    if (!staffUser || staffUser.role === 'ADMIN') {
      return res.status(400).json({ error: 'Invalid staff member' });
    }

    // For non-admin roles, check if they can assign to the target staff
    if (role !== 'ADMIN') {
      if (role === 'SALES_TEAM_HEAD') {
        // Sales team head can assign to themselves or their team members
        const teamMembers = await db.getUsers({ managed_by: userId, id: staffId });
        if (staffId !== userId && teamMembers.length === 0) {
          return res.status(403).json({ error: 'Can only assign to yourself or your team members' });
        }
      } else {
        // Other staff can transfer their leads to any non-admin staff member
        const targetStaffUsers = await db.getUsers({ id: staffId });
        const targetStaff = targetStaffUsers[0];
        if (!targetStaff || targetStaff.role === 'ADMIN') {
          return res.status(403).json({ error: 'Can only transfer to staff members' });
        }
      }
    }

    const updatedLeadIds = [];
    const unchangedLeadIds = [];
    const notFoundLeadIds = [];

    // Process leads sequentially to avoid race conditions
    for (const leadIdRaw of leadIds) {
      const leadId = Number(leadIdRaw);
      if (Number.isNaN(leadId)) {
        notFoundLeadIds.push(leadIdRaw);
        continue;
      }

      const leads = await db.getLeads({ id: leadId });
      const lead = leads[0];
      if (!lead) {
        notFoundLeadIds.push(leadId);
        continue;
      }

      // For non-admin roles, verify they own the lead
      if (role !== 'ADMIN' && role !== 'SALES_TEAM_HEAD') {
        const leadOwnerId = lead.assigned_staff_id ? Number(lead.assigned_staff_id) : null;
        if (leadOwnerId !== userId) {
          notFoundLeadIds.push(leadId);
          continue;
        }
      } else if (role === 'SALES_TEAM_HEAD') {
        // Sales team head can only transfer their own or their team's leads
        const leadOwnerId = lead.assigned_staff_id ? Number(lead.assigned_staff_id) : null;
        if (leadOwnerId !== userId) {
          const teamMembers = await db.getUsers({ managed_by: userId });
          const teamMemberIds = teamMembers.map(u => u.id);
          if (!leadOwnerId || !teamMemberIds.includes(leadOwnerId)) {
            notFoundLeadIds.push(leadId);
            continue;
          }
        }
      }

      const existingLeadStaffId = lead.assigned_staff_id ? Number(lead.assigned_staff_id) : null;
      if (existingLeadStaffId === staffId) {
        unchangedLeadIds.push(leadId);
        continue;
      }

      const updates = { assigned_staff_id: staffId };
      // AUTOMATIC STATUS UPDATE: Set to 'Assigned' if currently 'Unassigned'
      if (lead.status === 'Unassigned') {
        updates.status = 'Assigned';
      }

      await db.updateLead(leadId, updates);
      updatedLeadIds.push(leadId);
      const assignedUsers = await db.getUsers({ id: staffId });
      const assignedUser = assignedUsers[0];
      if (assignedUser) {
        const notification = await db.createNotification({
          user_id: staffId,
          lead_id: leadId,
          type: 'lead_assigned',
          message: `Lead "${lead.name}" has been assigned to you`,
          created_by: userId,
        });
        console.log(`✅ Bulk assign notification created for user ${staffId}:`, notification);
      }
    }

    res.json({
      updatedCount: updatedLeadIds.length,
      unchangedCount: unchangedLeadIds.length,
      notFoundCount: notFoundLeadIds.length,
      updatedLeadIds,
      unchangedLeadIds,
      notFoundLeadIds,
    });
  } catch (error) {
    console.error('Bulk assign leads error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Get single lead
// Maintenance route to fix phone numbers (Run once)
router.get('/fix-phones-maintenance', async (req, res) => {
  if (req.query.key !== 'fix_my_phones_please') {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const client = await db.pool.connect();
  try {
    // DEBUG: Get specific lead to see what's wrong
    const result = await client.query("SELECT id, name, phone_number, length(phone_number) as len FROM leads WHERE name ILIKE '%digiya%'");
    const leads = result.rows;

    // Return debug info immediately
    return res.json({
      debug: true,
      found: leads.length,
      samples: leads.map(l => ({
        name: l.name,
        phone: l.phone_number,
        len: l.len,
        hex: l.phone_number ? Buffer.from(l.phone_number).toString('hex') : null
      }))
    });
    let fixedCount = 0;

    await client.query('BEGIN');

    for (const lead of leads) {
      if (!lead.phone_number) continue;

      const cleanVal = lead.phone_number.trim();
      let parts = cleanVal.split(/[\s,;/]+/).filter(p => p.trim().length > 0);

      // Handle concatenated duplicates (e.g. 123123)
      if (parts.length === 1 && cleanVal.length > 15 && cleanVal.length % 2 === 0) {
        const half = cleanVal.length / 2;
        if (cleanVal.substring(0, half) === cleanVal.substring(half)) {
          parts = [cleanVal.substring(0, half), cleanVal.substring(half)];
        }
      }

      if (parts.length >= 2) {
        const p1 = parts[0];
        const p2 = parts[1];
        let newSecondary = lead.secondary_phone_number;

        // Always move 2nd part to secondary if empty, even if duplicate
        // This splits "123 123" into Primary: 123, Secondary: 123
        if (!newSecondary) newSecondary = p2;

        // Verify change - strict check
        if (lead.phone_number !== p1 || newSecondary !== lead.secondary_phone_number) {
          await client.query('UPDATE leads SET phone_number = $1, secondary_phone_number = $2 WHERE id = $3', [p1, newSecondary, lead.id]);
          fixedCount++;
        }
      }
    }

    // Also fix bad Age values (e.g. "Kiran")
    const ageResult = await client.query("UPDATE leads SET age = NULL WHERE age ~ '[^0-9]'");
    console.log(`✅ Cleared ${ageResult.rowCount} non-numeric age values`);

    await client.query('COMMIT');
    res.json({ success: true, message: `Fixed ${fixedCount} leads`, totalScanned: leads.length });

  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Maintenance route to wipe ALL leads (Run with caution)
// Maintenance route to wipe ALL leads (Run with caution)
router.get('/delete-all-maintenance', async (req, res) => {
  if (req.query.key !== 'fix_my_phones_please') {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // Delete related data first to avoid FK constraints if cascade isn't set up
    await client.query('DELETE FROM comments WHERE lead_id IS NOT NULL');
    await client.query('DELETE FROM notifications WHERE lead_id IS NOT NULL');
    await client.query('DELETE FROM email_logs WHERE lead_id IS NOT NULL');

    // Delete leads
    const result = await client.query('DELETE FROM leads');

    await client.query('COMMIT');
    res.json({ success: true, message: `Deleted ${result.rowCount} leads and related data` });

  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Check which version of backend is running
router.get('/version-check', (req, res) => {
  res.json({
    version: '1.6.1-IMPORT-FIX',
    timestamp: new Date().toISOString(),
    message: 'Backend is running the LATEST (1.6.1) code with Crash Fixes'
  });
});

// List all previous imports
router.get('/import-history', authenticate, async (req, res) => {
  try {
    const result = await db.query('SELECT h.*, u.name as creator_name FROM import_history h LEFT JOIN users u ON h.created_by = u.id ORDER BY h.created_at DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('❌ API ERROR: /import-history:', error);
    res.status(500).json({ error: 'Failed to fetch import history', details: error.message });
  }
});

// Download a specific file from history
router.get('/import-history/:id/download', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT filename, original_filename FROM import_history WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Record not found' });

    const { filename, original_filename } = result.rows[0];
    const filePath = path.join(__dirname, '../uploads/imports', filename);

    if (fs.existsSync(filePath)) {
      res.download(filePath, original_filename);
    } else {
      res.status(404).json({ error: 'File not found on server' });
    }
  } catch (error) {
    console.error('❌ API ERROR: /import-history/download:', error.message);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

// Keep the "last-imported-file" for backward compatibility if needed, but point to latest history record
router.get('/last-imported-file', authenticate, async (req, res) => {
  try {
    const result = await db.query('SELECT filename, original_filename FROM import_history ORDER BY created_at DESC LIMIT 1');
    if (result.rows.length === 0) return res.status(404).json({ error: 'No recent import found' });

    const { filename, original_filename } = result.rows[0];
    const filePath = path.join(__dirname, '../uploads/imports', filename);

    if (fs.existsSync(filePath)) {
      res.download(filePath, original_filename);
    } else {
      res.status(404).json({ error: 'File not found' });
    }
  } catch (error) {
    console.error('❌ API ERROR: /last-imported-file:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single lead
router.get('/:id', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;
    const leadId = parseInt(req.params.id);

    const filter = { id: leadId };

    // CRITICAL: Non-admin roles can only see their own leads (or team leads for heads)
    if (role === 'STAFF' || role === 'SALES_TEAM' || role === 'PROCESSING') {
      filter.assigned_staff_id = userId;
    } else if (role === 'SALES_TEAM_HEAD') {
      // Sales team head can see their own and their team's leads
      const teamMembers = await db.getUsers({ managed_by: userId });
      const accessibleIds = [userId, ...teamMembers.map(u => u.id)];
      // We'll filter after fetching
    }

    let leads = await db.getLeads(filter);

    // Apply team head filtering if needed
    if (role === 'SALES_TEAM_HEAD') {
      const teamMembers = await db.getUsers({ managed_by: userId });
      const accessibleIds = [userId, ...teamMembers.map(u => u.id)];
      leads = leads.filter(l => !l.assigned_staff_id || accessibleIds.includes(l.assigned_staff_id));
    }

    // CRITICAL: Filter out "Registration Completed" leads - they are now clients
    leads = leads.filter(lead => lead.status !== 'Registration Completed');

    const lead = leads[0];

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found or has been converted to client' });
    }

    // Add assigned staff name
    let assignedStaffName = null;
    if (lead.assigned_staff_id) {
      try {
        assignedStaffName = await db.getUserName(lead.assigned_staff_id);
      } catch (error) {
        console.error('Error getting assigned staff name:', error);
      }
    }
    const leadWithStaff = {
      ...lead,
      assigned_staff_name: assignedStaffName,
    };

    res.json(leadWithStaff);
  } catch (error) {
    console.error('Get lead error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Create new lead
router.post(
  '/',
  authenticate,
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('phone_number').notEmpty().withMessage('Phone number is required'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const userId = req.user.id;
      const role = req.user.role;
      const {
        name,
        phone_number,
        phone_country_code,
        whatsapp_number,
        whatsapp_country_code,
        email,
        age,
        occupation,
        qualification,
        year_of_experience,
        country,
        program,
        status = 'Unassigned',
        assigned_staff_id,
        priority,
        comment,
        follow_up_date,
        follow_up_status,
        source,
        ielts_score,
      } = req.body;

      // CRITICAL: Non-admin roles can only assign leads to themselves (or their team for heads)
      let finalAssignedStaffId = assigned_staff_id;
      if (role === 'STAFF' || role === 'SALES_TEAM' || role === 'PROCESSING') {
        finalAssignedStaffId = userId;
      } else if (role === 'SALES_TEAM_HEAD') {
        // Sales team head can assign to themselves or their team members
        if (assigned_staff_id && assigned_staff_id !== userId) {
          const teamMembers = await db.getUsers({ managed_by: userId, id: assigned_staff_id });
          if (teamMembers.length === 0) {
            return res.status(400).json({ error: 'Can only assign to yourself or your team members' });
          }
        } else {
          finalAssignedStaffId = userId;
        }
      } else if (role === 'ADMIN') {
        // ADMIN can assign to any staff or leave null
        if (assigned_staff_id) {
          const staffUsers = await db.getUsers({ id: assigned_staff_id });
          if (staffUsers.length === 0) {
            return res.status(400).json({ error: 'Invalid staff member' });
          }
        }
      }

      // Check for duplicate phone/email
      const allLeads = await db.getLeads();
      const duplicate = allLeads.find(l =>
        l.phone_number === phone_number ||
        (email && l.email === email)
      );

      if (duplicate) {
        return res.status(400).json({ error: 'Lead with this phone number or email already exists' });
      }

      const newLead = await db.createLead({
        name,
        phone_number,
        phone_country_code: phone_country_code || '+91',
        whatsapp_number: whatsapp_number || null,
        whatsapp_country_code: whatsapp_country_code || '+91',
        email: email || null,
        age: age || null,
        occupation: occupation || null,
        qualification: qualification || null,
        year_of_experience: year_of_experience || null,
        country: country || null,
        program: program || null,
        status,
        assigned_staff_id: finalAssignedStaffId || null,
        priority: priority || null,
        comment: comment || null,
        follow_up_date: follow_up_date || null,
        follow_up_status: follow_up_status || 'Pending',
        source: source || null,
        ielts_score: ielts_score || null,
        created_by: userId,
      });

      // Create notification if lead is assigned to staff (admin or team head)
      if (finalAssignedStaffId) {
        // AUTOMATIC STATUS UPDATE: If lead is assigned, set status to 'Assigned' (if it was Unassigned)
        if (status === 'Unassigned') {
          await db.updateLead(newLead.id, { status: 'Assigned' });
          newLead.status = 'Assigned'; // Update response object
        }

        const assignedUsers = await db.getUsers({ id: finalAssignedStaffId });
        const assignedUser = assignedUsers[0];
        if (assignedUser && assignedUser.role !== 'ADMIN') {
          const notification = await db.createNotification({
            user_id: finalAssignedStaffId,
            lead_id: newLead.id,
            type: 'lead_assigned',
            message: `Lead "${name}" has been assigned to you`,
            created_by: userId,
          });
          console.log(`✅ Notification created for user ${finalAssignedStaffId}:`, notification);
        }
      }

      res.status(201).json(newLead);
    } catch (error) {
      console.error('Create lead error:', error);
      res.status(500).json({ error: 'Server error', details: error.message });
    }
  }
);

// Update lead
router.put('/:id', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;
    const leadId = parseInt(req.params.id);

    // Check if lead exists - get it first without role filtering
    let existingLeads = await db.getLeads({ id: leadId });
    let existingLead = existingLeads[0];

    if (!existingLead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Check if user has access to this lead
    if (role === 'STAFF' || role === 'SALES_TEAM' || role === 'PROCESSING') {
      const leadOwnerId = existingLead.assigned_staff_id ? Number(existingLead.assigned_staff_id) : null;
      // Allow update if assigned to self OR if unassigned (claiming)
      if (leadOwnerId !== userId && leadOwnerId !== null) {
        return res.status(403).json({ error: 'You can only update leads assigned to you' });
      }
    } else if (role === 'SALES_TEAM_HEAD') {
      // Sales team head can update their own and their team's leads
      const leadOwnerId = existingLead.assigned_staff_id ? Number(existingLead.assigned_staff_id) : null;
      if (leadOwnerId !== userId) {
        const teamMembers = await db.getUsers({ managed_by: userId });
        const teamMemberIds = teamMembers.map(u => u.id);
        if (!leadOwnerId || !teamMemberIds.includes(leadOwnerId)) {
          return res.status(403).json({ error: 'You can only update leads assigned to you or your team' });
        }
      }
    }

    const {
      name,
      phone_number,
      phone_country_code,
      whatsapp_number,
      whatsapp_country_code,
      email,
      age,
      occupation,
      qualification,
      year_of_experience,
      country,
      program,
      status,
      assigned_staff_id,
      priority,
      comment,
      follow_up_date,
      follow_up_status,
      source,
      ielts_score,
    } = req.body;

    const updates = {};

    if (name !== undefined) updates.name = name;
    if (phone_number !== undefined) updates.phone_number = phone_number;
    if (phone_country_code !== undefined) updates.phone_country_code = phone_country_code;
    if (whatsapp_number !== undefined) updates.whatsapp_number = whatsapp_number;
    if (whatsapp_country_code !== undefined) updates.whatsapp_country_code = whatsapp_country_code;
    if (email !== undefined) updates.email = email;
    if (age !== undefined) updates.age = age;
    if (occupation !== undefined) updates.occupation = occupation;
    if (qualification !== undefined) updates.qualification = qualification;
    if (year_of_experience !== undefined) updates.year_of_experience = year_of_experience;
    if (country !== undefined) updates.country = country;
    if (program !== undefined) updates.program = program;
    if (status !== undefined) updates.status = status;
    if (priority !== undefined) updates.priority = priority;
    if (comment !== undefined) updates.comment = comment;
    if (follow_up_date !== undefined) updates.follow_up_date = follow_up_date;
    if (follow_up_status !== undefined) updates.follow_up_status = follow_up_status;
    if (source !== undefined) updates.source = source;
    if (ielts_score !== undefined) updates.ielts_score = ielts_score;

    const canReassign = role === 'ADMIN' || role === 'SALES_TEAM_HEAD' || role === 'STAFF' || role === 'SALES_TEAM' || role === 'PROCESSING';
    if (assigned_staff_id !== undefined) {
      if (!canReassign) {
        return res.status(403).json({ error: 'Not allowed to change lead assignment' });
      }

      const normalizedStaffId = assigned_staff_id !== null && assigned_staff_id !== ''
        ? Number(assigned_staff_id)
        : null;

      if (normalizedStaffId && Number.isNaN(normalizedStaffId)) {
        return res.status(400).json({ error: 'Invalid staff member' });
      }

      if (!normalizedStaffId) {
        if (role !== 'ADMIN' && role !== 'SALES_TEAM_HEAD') {
          return res.status(400).json({ error: 'Only admin can unassign leads' });
        }
      } else {
        const targetUsers = await db.getUsers({ id: normalizedStaffId });
        const targetUser = targetUsers[0];
        if (!targetUser || targetUser.role === 'ADMIN') {
          return res.status(400).json({ error: 'Invalid staff member' });
        }

        // For non-admin roles, verify permissions
        if (role !== 'ADMIN') {
          const leadOwnerId = existingLead.assigned_staff_id ? Number(existingLead.assigned_staff_id) : null;

          // Case 1: Lead is currently Unassigned - Allow claiming
          if (leadOwnerId === null) {
            // Staff/Sales can only claim to themselves
            if (role !== 'SALES_TEAM_HEAD' && normalizedStaffId !== userId) {
              return res.status(403).json({ error: 'You can only claim leads for yourself' });
            }
            // Sales Head can claim for self or team (checked below in team logic, or implicitly allowed if target is self)
            if (role === 'SALES_TEAM_HEAD' && normalizedStaffId !== userId) {
              const teamMembers = await db.getUsers({ managed_by: userId, id: normalizedStaffId });
              if (teamMembers.length === 0) {
                return res.status(403).json({ error: 'Can only assign to yourself or your team' });
              }
            }
          }
          // Case 2: Lead is already assigned - Transfer rules
          else {
            if (role === 'SALES_TEAM_HEAD') {
              // Sales team head can transfer their own or their team's leads
              if (leadOwnerId !== userId) {
                const teamMembers = await db.getUsers({ managed_by: userId });
                const teamMemberIds = teamMembers.map(u => u.id);
                if (!leadOwnerId || !teamMemberIds.includes(leadOwnerId)) {
                  return res.status(403).json({ error: 'You can only transfer leads assigned to you or your team' });
                }
              }
              // Sales team head can transfer to themselves or team members
              if (normalizedStaffId !== userId) {
                const teamMembers = await db.getUsers({ managed_by: userId, id: normalizedStaffId });
                if (teamMembers.length === 0) {
                  return res.status(400).json({ error: 'Can only transfer to yourself or your team members' });
                }
              }
            } else {
              // Regular staff can only transfer their own leads
              if (leadOwnerId !== userId) {
                return res.status(403).json({ error: 'You can only transfer leads assigned to you' });
              }
            }
          }
        }
      }

      // Create notification if assignment changed (including from null/unassigned to assigned)
      const existingStaffId = existingLead.assigned_staff_id ? Number(existingLead.assigned_staff_id) : null;
      if (normalizedStaffId && existingStaffId !== normalizedStaffId) {

        // AUTOMATIC STATUS UPDATE: If lead is being assigned, set status to 'Assigned'
        // Only if current status is 'Unassigned'
        if (existingLead.status === 'Unassigned') {
          updates.status = 'Assigned';
          console.log(`🔄 Auto-updating status to 'Assigned' for lead ${leadId}`);
        }

        const assignedUsers = await db.getUsers({ id: normalizedStaffId });
        const assignedUser = assignedUsers[0];
        if (assignedUser && assignedUser.role !== 'ADMIN') {
          const notification = await db.createNotification({
            user_id: normalizedStaffId,
            lead_id: leadId,
            type: 'lead_assigned',
            message: `Lead "${existingLead.name}" has been assigned to you`,
            created_by: userId,
          });
          console.log(`✅ Notification created for user ${normalizedStaffId}:`, notification);
        } else {
          console.error(`❌ User ${normalizedStaffId} not found for notification`);
        }
      }

      // AUTOMATIC STATUS UPDATE: If lead is being UNASSIGNED (staffId is null)
      if ((assigned_staff_id === null || assigned_staff_id === '') && existingStaffId !== null) {
        // Only if current status is 'Assigned'
        if (existingLead.status === 'Assigned') {
          updates.status = 'Unassigned';
          console.log(`🔄 Auto-updating status to 'Unassigned' for lead ${leadId}`);
        }
      }

      updates.assigned_staff_id = normalizedStaffId;
    }

    // CRITICAL: If status is being changed to "Registration Completed", we need registration form data
    // This should come from a separate endpoint, so we just update the status here
    // The actual client creation happens via POST /api/leads/:id/complete-registration

    const updatedLead = await db.updateLead(leadId, updates);

    if (!updatedLead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    res.json(updatedLead);
  } catch (error) {
    console.error('Update lead error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Complete registration (Convert Lead to Client)
router.post('/:id/complete-registration', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;
    const leadId = parseInt(req.params.id);
    const { assessment_authority, occupation_mapped, registration_fee_paid } = req.body;

    // Check if lead exists
    const leads = await db.getLeads({ id: leadId });
    const lead = leads[0];

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    if (lead.status === 'Registration Completed') {
      return res.status(400).json({ error: 'Lead is already registered' });
    }

    // Check permissions (Admin, Sales Head, or Lead Owner)
    if (role !== 'ADMIN') {
      if (role === 'SALES_TEAM_HEAD') {
        const teamMembers = await db.getUsers({ managed_by: userId });
        const teamIds = teamMembers.map(u => u.id);
        const leadOwnerId = lead.assigned_staff_id ? Number(lead.assigned_staff_id) : null;

        if (leadOwnerId !== userId && !teamIds.includes(leadOwnerId) && lead.assigned_staff_id !== null) {
          return res.status(403).json({ error: 'Access denied' });
        }
      } else {
        // Staff/Sales Team
        const leadOwnerId = lead.assigned_staff_id ? Number(lead.assigned_staff_id) : null;
        if (leadOwnerId !== userId) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }
    }

    // Find Sneha (Processing Staff) to assign the client to
    let processingStaffId = null;
    try {
      const snehaUsers = await db.getUsers({ email: 'sneha@toniosenora.com' });
      if (snehaUsers.length > 0) {
        processingStaffId = snehaUsers[0].id;
      } else {
        const snehaByName = await db.getUsers({ name: 'Sneha' });
        if (snehaByName.length > 0) {
          processingStaffId = snehaByName[0].id;
        }
      }
    } catch (e) {
      console.error('Error finding Sneha for assignment:', e);
    }

    // 1. Create Client Record
    const clientData = {
      name: lead.name,
      phone_number: lead.phone_number,
      phone_country_code: lead.phone_country_code,
      email: lead.email,
      age: lead.age,
      occupation: lead.occupation,
      qualification: lead.qualification,
      year_of_experience: lead.year_of_experience,
      country: lead.country, // Current country
      target_country: lead.country, // Default target to current if not specified, or use logic
      program: lead.program,
      assigned_staff_id: lead.assigned_staff_id, // Keep sales rep
      processing_staff_id: processingStaffId, // Auto-assign to Sneha
      fee_status: 'Payment Pending', // Initial status
      processing_status: 'Agreement Pending',
      assessment_authority: assessment_authority,
      occupation_mapped: occupation_mapped,
      registration_fee_paid: registration_fee_paid, // Flag from form
      amount_paid: 0,
    };

    // Fix bug where client creation fails if fields are null
    // (Assuming db.createClient handles nulls, otherwise we need to sanitize)

    // Create logic for determining processing staff (Round robin or logic?)
    // For now, leave null (Processing Head assigns or they pick it up)

    const newClient = await db.createClient(clientData);

    // 2. Update Lead Status
    await db.updateLead(leadId, { status: 'Registration Completed' });

    // 3. Create Notification for Processing Team (Sneha/Kripa)
    // Find processing team users
    const processingUsers = await db.getUsers({ role: 'PROCESSING' }); // Or specific IDs
    // Also include Admin
    const admins = await db.getUsers({ role: 'ADMIN' });

    const notifyUsers = [...processingUsers, ...admins];
    const uniqueNotifyIds = [...new Set(notifyUsers.map(u => u.id))];

    for (const notifyUserId of uniqueNotifyIds) {
      await db.createNotification({
        user_id: notifyUserId,
        lead_id: leadId,
        type: 'registration_completed',
        message: `New Registration: "${lead.name}" is now a client.`,
        created_by: userId,
      });
    }

    console.log(`✅ Registration completed for lead ${leadId} -> Client ${newClient.id}`);
    res.json({ success: true, clientId: newClient.id, client: newClient });

  } catch (error) {
    console.error('Complete registration error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Get comments for a lead
router.get('/:id/comments', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;
    const leadId = parseInt(req.params.id);

    // Check if user has access to this lead
    let filter = { id: leadId };
    if (role === 'STAFF' || role === 'SALES_TEAM' || role === 'PROCESSING') {
      filter.assigned_staff_id = userId;
    } else if (role === 'SALES_TEAM_HEAD') {
      // Sales team head can see their own and their team's leads
      const teamMembers = await db.getUsers({ managed_by: userId });
      const accessibleIds = [userId, ...teamMembers.map(u => u.id)];
      // We'll filter after fetching
    }

    let leads = await db.getLeads(filter);

    // Apply team head filtering if needed
    if (role === 'SALES_TEAM_HEAD') {
      const teamMembers = await db.getUsers({ managed_by: userId });
      const accessibleIds = [userId, ...teamMembers.map(u => u.id)];
      leads = leads.filter(l => !l.assigned_staff_id || accessibleIds.includes(l.assigned_staff_id));
    }

    if (leads.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const comments = await db.getComments(leadId);

    // Add author names and map 'comment' to 'text' for frontend compatibility
    const commentsWithAuthorsPromises = comments.map(async comment => ({
      ...comment,
      text: comment.comment, // Map DB column 'comment' to frontend expected 'text'
      author_name: await db.getUserName(comment.user_id) || 'Unknown',
    }));
    const commentsWithAuthors = await Promise.all(commentsWithAuthorsPromises);

    res.json(commentsWithAuthors);
  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Add comment to a lead
router.post('/:id/comments', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;
    const leadId = parseInt(req.params.id);
    const { text } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'Comment text is required' });
    }

    // Check if user has access to this lead
    let filter = { id: leadId };
    if (role === 'STAFF' || role === 'SALES_TEAM' || role === 'PROCESSING') {
      filter.assigned_staff_id = userId;
    } else if (role === 'SALES_TEAM_HEAD') {
      // Sales team head can see their own and their team's leads
      const teamMembers = await db.getUsers({ managed_by: userId });
      const accessibleIds = [userId, ...teamMembers.map(u => u.id)];
      // We'll filter after fetching
    }

    let leads = await db.getLeads(filter);

    // Apply team head filtering if needed
    if (role === 'SALES_TEAM_HEAD') {
      const teamMembers = await db.getUsers({ managed_by: userId });
      const accessibleIds = [userId, ...teamMembers.map(u => u.id)];
      leads = leads.filter(l => !l.assigned_staff_id || accessibleIds.includes(l.assigned_staff_id));
    }

    if (leads.length === 0) {
      return res.status(404).json({ error: 'Lead not found or access denied' });
    }

    const comment = await db.createComment({
      lead_id: leadId,
      user_id: userId,
      comment: text.trim(),
    });

    // Add author name and map 'comment' to 'text'
    const commentWithAuthor = {
      ...comment,
      text: comment.comment, // Map DB column 'comment' to frontend expected 'text'
      author_name: await db.getUserName(userId) || 'Unknown',
    };

    res.status(201).json(commentWithAuthor);
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Get all staff members (for assigning leads)
router.get('/staff/list', authenticate, async (req, res) => {
  try {
    // Get all non-admin users for lead assignment
    const allUsers = await db.getUsers();
    const staff = allUsers.filter(u => u.role !== 'ADMIN');
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

// Robust CSV parser that handles escaped quotes ""
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}


router.post('/bulk-import', authenticate, upload.single('file'), async (req, res) => {
  try {
    const role = req.user.role;
    const userId = req.user.id;
    if (!['ADMIN', 'SALES_TEAM_HEAD', 'SALES_TEAM', 'PROCESSING', 'STAFF'].includes(role)) return res.status(403).json({ error: 'Access denied' });
    if (!req.file) return res.status(400).json({ error: 'File is required' });

    const isExcel = req.file.originalname.toLowerCase().endsWith('.xlsx') || req.file.originalname.toLowerCase().endsWith('.xls');
    const sheetsData = [];

    if (isExcel) {
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      for (const sheetName of workbook.SheetNames) {
        const sLower = sheetName.toLowerCase();
        if (['old', 'archive', 'summary', 'total', 'deleted', 'junk', 'temp', 'back', 'sheet2', 'sheet3'].some(k => sLower.includes(k))) continue;
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        if (rows.length === 0) continue;

        let headerIdx = -1;
        for (let i = 0; i < Math.min(rows.length, 30); i++) {
          const r = (rows[i] || []).map(h => String(h || '').trim().toLowerCase().replace(/[^\w]/g, ''));
          // Look for any row that has at least 2 common CRM headers
          const matches = ['name', 'phone', 'mobile', 'contact', 'email', 'source', 'status'].filter(k => r.some(rh => rh.includes(k)));
          if (matches.length >= 2) { headerIdx = i; break; }
        }

        if (headerIdx !== -1) {
          sheetsData.push({ sheetName, headerValues: rows[headerIdx].map(h => String(h || '').trim()), dataRows: rows.slice(headerIdx + 1) });
        } else {
          // If no header found, assume row 0 is header but definitely treat first column as Name
          sheetsData.push({ sheetName, headerValues: rows[0].map((h, idx) => String(h || `Column ${idx + 1}`).trim()), dataRows: rows.slice(1) });
        }
      }
    } else {
      // SMART ENCODING: Check for BOM (UTF-8 or UTF-16LE), then try UTF-8, then fallback
      const buffer = req.file.buffer;
      let text;

      // UTF-8 BOM: 0xEF 0xBB 0xBF
      if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
        console.log('💎 UTF-8 BOM detected');
        text = iconv.decode(buffer.slice(3), 'utf8');
      }
      // UTF-16LE BOM: 0xFF 0xFE
      else if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
        console.log('💎 UTF-16LE BOM detected');
        text = iconv.decode(buffer.slice(2), 'utf16le');
      }
      else {
        const utf8Text = iconv.decode(buffer, 'utf8');
        const corruptionCount = (utf8Text.match(/\ufffd/g) || []).length;

        // ONLY fallback if corruption is massive (e.g. >50 chars or >5% of file)
        // This prevents a single emoji/bad char from destroying the whole file
        if (corruptionCount > 50 || (corruptionCount > 0 && corruptionCount > (utf8Text.length * 0.05))) {
          console.log(`⚠️ Massive UTF-8 corruption detected (${corruptionCount} errors), trying Win1252...`);
          text = iconv.decode(buffer, 'win1252');
        } else {
          text = utf8Text;
        }
      }

      text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const rawLines = text.split('\n');
      const allRowsRaw = [];
      let currentLine = '';
      for (const line of rawLines) {
        if (currentLine) currentLine += '\n' + line;
        else currentLine = line;
        const quoteCount = (currentLine.match(/"/g) || []).length;
        if (quoteCount % 2 === 0) {
          allRowsRaw.push(parseCSVLine(currentLine));
          currentLine = '';
        }
      }
      if (currentLine) allRowsRaw.push(parseCSVLine(currentLine)); // Fallback for unmatched quote
      if (allRowsRaw.length > 0) {
        let headerIdx = -1;
        for (let i = 0; i < Math.min(allRowsRaw.length, 30); i++) {
          const r = (allRowsRaw[i] || []).map(h => String(h || '').trim().toLowerCase().replace(/[^\w]/g, ''));
          const matches = ['name', 'phone', 'mobile', 'contact', 'email', 'source', 'status'].filter(k => r.some(rh => rh.includes(k)));
          if (matches.length >= 2) { headerIdx = i; break; }
        }
        if (headerIdx !== -1) {
          sheetsData.push({ sheetName: 'CSV', headerValues: allRowsRaw[headerIdx].map(h => String(h || '').trim()), dataRows: allRowsRaw.slice(headerIdx + 1) });
        } else {
          sheetsData.push({ sheetName: 'CSV', headerValues: allRowsRaw[0].map((h, idx) => String(h || `Column ${idx + 1}`).trim()), dataRows: allRowsRaw.slice(1) });
        }
      }
    }

    if (sheetsData.length === 0) return res.status(400).json({ error: 'No valid data found in file' });

    const validLeads = [];
    const results = { total: 0, created: 0, skipped: 0, errors: 0, errorRows: [], skippedRows: [] };
    const existingPhones = new Set();
    const existingEmails = new Set();

    const phoneData = await db.getLeadPhones();
    phoneData.forEach(r => { if (r.phone_number) existingPhones.add(String(r.phone_number).toLowerCase().replace(/\D/g, '')); });

    const emailData = await db.getLeadEmails();
    emailData.forEach(r => { if (r.email) existingEmails.add(String(r.email).toLowerCase().trim()); });

    const cachedUsers = await db.getUsers();
    const columnMapping = {
      name: ['name', 'full name', 'fullname', 'client name', 'student name', 'candidate name', 'applicant', 'client', 'student', 'lead name', 'name *', 'full name *', 'customer name', 'beneficiary'],
      first_name: ['first name', 'fname', 'given name'],
      last_name: ['last name', 'lname', 'surname', 'family name'],
      phone_number: ['phone', 'mobile', 'contact', 'whatsapp', 'tel', 'phone no', 'mobile no', 'phone_number', 'contact_number', 'p:', 'phone:', 'contact no', 'mobile number'],
      phone_country_code: ['country code', 'phone code', 'dial code', 'cc', 'phone_country_code', 'dial_code', 'country_code_phone', 'code'],
      whatsapp_number: ['whatsapp', 'wa', 'wa number', 'whatsapp number', 'whatsapp_no'],
      email: ['email', 'e-mail', 'mail id', 'email address', 'email_id'],
      country: ['country', 'nation', 'destination'],
      program: ['program', 'course', 'degree', 'interest'],
      occupation: ['occupation', 'job title', 'job', 'designation', 'work', 'employment', 'profession', 'job_title'],
      source: ['campaign name', 'campaign_name', 'campaign', 'source', 'lead source', 'lead_source', 'leadsource', 'utm_source', 'utm_medium', 'channel'],
      assigned_staff: ['assigned', 'assign to', 'staff', 'sales representative', 'counselor', 'assigned_to', 'allotted to'],
      comment: ['comment', 'remark', 'note', 'details', 'description', 'message', 'activity', 'feedback'],
      status: ['status', 'lead status', 'stage', 'disposition'],
      priority: ['priority', 'lead priority', 'level', 'urgency', 'type', 'interest level'],
      follow_up_date: ['follow up date', 'next follow up', 'callback date', 'remind on', 'followup_date'],
      follow_up_status: ['follow up status', 'next action'],
      ielts_score: ['ielts', 'ielts score', 'band score', 'score'],
      secondary_phone_number: ['secondary phone', 'secondary number', 'alternate no', 'alternative number', 'emergency contact', 'alternate number', 'extra phone', 'phone 2', 'mobile 2', 'contact 2', 'second number', 'second phone', 'alternate', 'sec phone', 'other no', 'other number', 'other phone', 'mobile no 2', 'phone no 2']
    };

    // Helper for robust name cleaning (removes underscores, symbols, leading junk)
    function cleanName(val) {
      if (!val) return '';
      // Remove wrapping underscores, dashes, at-symbols (handles _ADI_, @ADI, -ADI-)
      let n = String(val).trim().replace(/^[\_\-\@\*\s]+|[\_\-\@\*\s]+$/g, '');
      // If it's still wrapped in quotes or brackets
      n = n.replace(/^[\'\(\[]+|[\'\]\)]+$/g, '');
      return n.trim();
    }
    // SAVE UPLOADED FILE FOR HISTORY (Once per file, not per sheet)
    let uniqueFilename = '';
    try {
      const importDir = path.join(__dirname, '../uploads/imports');
      if (!fs.existsSync(importDir)) fs.mkdirSync(importDir, { recursive: true });

      const timestamp = Date.now();
      const safeOriginalName = req.file.originalname.replace(/[^a-zA-Z0-9\.]/g, '_');
      uniqueFilename = `${timestamp}_${safeOriginalName}`;

      const filePath = path.join(importDir, uniqueFilename);
      fs.writeFileSync(filePath, req.file.buffer);
      console.log(`💾 Saved import file: ${filePath}`);
    } catch (err) {
      console.error('❌ Failed to save import file:', err.message);
    }

    function parseDate(val) {
      if (!val) return null;
      const num = Number(val);
      if (!isNaN(num) && num > 10000 && num < 90000) return new Date((num - 25569) * 86400 * 1000).toISOString();
      const d = new Date(val);
      return isNaN(d.getTime()) ? null : d.toISOString();
    }

    for (const sheet of sheetsData) {
      const { headerValues, dataRows, sheetName } = sheet;
      console.log(`📂 Processing Sheet: ${sheetName}`);
      console.log(`📋 Raw Headers: [${headerValues.join(' | ')}]`);
      results.total += dataRows.length;

      const colIdx = {};
      Object.keys(columnMapping).forEach(f => colIdx[f] = -1);
      const usedIndices = new Set();

      const solve = (field, searchTerms, strategy) => {
        if (colIdx[field] !== -1) return;
        for (const term of searchTerms) {
          // STRIP ALL NON-ALPHANUMERIC for matching (strips *, spacing, symbols)
          const tNorm = term.toLowerCase().replace(/[^a-z0-9]/g, '');
          for (let idx = 0; idx < headerValues.length; idx++) {
            if (usedIndices.has(idx)) continue;
            const hRaw = (headerValues[idx] || '').trim().toLowerCase();
            const hNorm = hRaw.replace(/[^a-z0-9]/g, '');
            if (!hNorm) continue; // CRITICAL: Skip empty/anonymous headers during mapping

            let match = (strategy === 'exact') ? (hRaw === term.toLowerCase() || hNorm === tNorm) : (hNorm.includes(tNorm) || tNorm.includes(hNorm));
            if (match) {
              // REFINED NAME DETECTION: Skip if header suggests numbers, IDs, or broad details
              const blackList = ['phone', 'mobile', 'contact', 'whatsapp', 'source', 'assigned', 'staff', 'id', 'no', 'remark', 'comment', 'details', 'description', 'message', 'info', 'age', 'qualification', 'score', 'date'];
              if (field === 'name' && blackList.some(k => hRaw.includes(k))) match = false;
              if (field === 'secondary_phone_number' && ['age', 'qualification', 'score', 'date', 'source', 'status'].some(k => hRaw.includes(k))) match = false;
              if (match) {
                colIdx[field] = idx;
                usedIndices.add(idx);
                console.log(`📍 Found [${field}] at index ${idx} in ${sheetName} (Header: "${hRaw}")`);
                return;
              }
            }
          }
        }
      };

      // Apply mapping strategies
      ['name', 'phone_number', 'phone_country_code', 'secondary_phone_number', 'email', 'assigned_staff', 'source', 'status', 'priority'].forEach(f => solve(f, columnMapping[f], 'exact'));
      Object.keys(columnMapping).forEach(f => solve(f, columnMapping[f], 'exact'));
      Object.keys(columnMapping).forEach(f => solve(f, columnMapping[f], 'fuzzy'));

      // STICK TO EXACT HEADERS IF POSSIBLE
      ['name', 'phone_number', 'secondary_phone_number', 'email', 'assigned_staff', 'source', 'status', 'priority'].forEach(f => solve(f, columnMapping[f], 'exact'));
      Object.keys(columnMapping).forEach(f => solve(f, columnMapping[f], 'exact'));
      Object.keys(columnMapping).forEach(f => solve(f, columnMapping[f], 'fuzzy'));

      // If Name still unmapped, take Index 0
      if (colIdx.name === -1 && colIdx.first_name === -1) {
        colIdx.name = 0;
        console.log(`🎯 Name fallback to Index 0`);
      }

      console.log(`📊 Final Mapping for ${sheetName}:`, JSON.stringify(colIdx, null, 2));

      // Process rows for this sheet
      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        if (!row || row.length === 0 || row.every(v => !String(v).trim())) continue;
        try {
          const g = (idx) => (idx === -1 || idx >= row.length) ? '' : String(row[idx] || '').trim();
          let nameRaw = colIdx.name !== -1 ? g(colIdx.name) : `${g(colIdx.first_name)} ${g(colIdx.last_name)}`.trim();
          let name = cleanName(nameRaw);
          let email = g(colIdx.email).toLowerCase();
          let phone = '';
          let secPhone = '';

          // Validate name - if it ended up empty after cleaning or is purely numbers, fallback to raw col 0
          if (!name || /^\d+$/.test(name.replace(/\s/g, ''))) {
            name = cleanName(g(0)) || nameRaw || `Row ${i + 1}`;
          }

          // Try to get phone and country code from mapped columns
          let mappedPhone = g(colIdx.phone_number).replace(/[^\d+]/g, '');
          let mappedSecPhone = g(colIdx.secondary_phone_number).replace(/[^\d+]/g, '');
          let mappedCC = g(colIdx.phone_country_code).replace(/[^\d+]/g, '');
          if (mappedCC && !mappedCC.startsWith('+')) mappedCC = '+' + mappedCC;

          // IDENTIFY PHONE CANDIDATES: Collect all unique numeric strings from the entire row
          const rowCandidates = [];
          for (let j = 0; j < row.length; j++) {
            const val = String(row[j] || '').trim();
            const lowVal = val.toLowerCase();
            const cleaned = val.replace(/\D/g, '');
            const isGarbage = ['yrs', 'age', 'qualification', 'score', 'date', 'interest', 'course', 'exp'].some(k => lowVal.includes(k));
            // MOBILE NUMBER HARDENING: Minimum 10 digits for scanner
            if (cleaned.length >= 10 && cleaned.length <= 16 && !isGarbage) {
              const fullVal = val.replace(/[^\d+]/g, '');
              if (!rowCandidates.includes(fullVal)) rowCandidates.push(fullVal);
            }
          }

          // Distinguish between CRM-duplicates and unique-to-import
          const uniqueCandidates = rowCandidates.filter(c => !existingPhones.has(c.replace(/\D/g, '')));
          const emailIsDupe = email && existingEmails.has(email);

          if (emailIsDupe) {
            results.skipped++;
            if (results.skippedRows.length < 100) results.skippedRows.push({ row: i + 1, sheet: sheetName, message: `Skipped: Email ${email} already in CRM` });
            continue;
          }

          phone = '';
          secPhone = '';

          // 1. Prioritize mapped phone (Ensure it's actually a number, at least 7 digits)
          if (mappedPhone && mappedPhone.replace(/\D/g, '').length >= 7 && !existingPhones.has(mappedPhone.replace(/\D/g, ''))) {
            phone = mappedPhone;
          }
          // 2. If no mapped phone or it's a dupe, use scanner
          if (!phone && uniqueCandidates.length > 0) {
            phone = uniqueCandidates[0];
          }

          // 3. Handle secondary phone (Ensure it's actually a number, at least 7 digits)
          if (mappedSecPhone && mappedSecPhone.replace(/\D/g, '').length >= 7 && mappedSecPhone !== phone && !existingPhones.has(mappedSecPhone.replace(/\D/g, ''))) {
            secPhone = mappedSecPhone;
          }
          // 4. Fill from candidates if still empty
          if (!secPhone) {
            secPhone = uniqueCandidates.find(c => c.replace(/\D/g, '') !== phone.replace(/\D/g, '')) || '';
          }

          if (i < 10) {
            console.log(`✅ ROW ${i + 1}: Name="${name}" | Phone="${phone}" (CC: "${mappedCC}") | Sec="${secPhone}"`);
            if (i < 3) console.log(`   📝 Raw Data: [${row.slice(0, 10).join(' | ')}${row.length > 10 ? ' ...' : ''}]`);
          }

          if (!phone && rowCandidates.length > 0) {
            // All candidates are already in CRM
            results.skipped++;
            if (results.skippedRows.length < 100) results.skippedRows.push({ row: i + 1, sheet: sheetName, message: `Skipped: Phone(s) ${rowCandidates.join(', ')} already in CRM` });
            continue;
          }

          // If phone is missing but row is otherwise valid, it's allowed (nullable)
          if (!phone) phone = '';

          // INTELLIGENT COUNTRY CODE IDENTIFICATION
          let phoneCountryCode = mappedCC;
          let leadCountry = (g(colIdx.country) || '').toLowerCase();

          if (phone) {
            // 1. If phone has a '+' prefix, extract correctly
            if (phone.startsWith('+')) {
              if (phone.startsWith('+91')) { phoneCountryCode = '+91'; phone = phone.substring(3); }
              else if (phone.startsWith('+971')) { phoneCountryCode = '+971'; phone = phone.substring(4); }
              else if (phone.startsWith('+1')) { phoneCountryCode = '+1'; phone = phone.substring(2); }
              else if (phone.startsWith('+44')) { phoneCountryCode = '+44'; phone = phone.substring(3); }
              else {
                const match = phone.match(/^\+\d{1,3}/);
                if (match) {
                  phoneCountryCode = match[0];
                  phone = phone.substring(match[0].length);
                }
              }
            }
            // 2. Fallback to patterns if no CC from column or prefix
            if (!phoneCountryCode) {
              if (phone.length === 12 && phone.startsWith('91')) {
                phoneCountryCode = '+91';
                phone = phone.substring(2);
              } else if (phone.length === 11 && phone.startsWith('0')) {
                phoneCountryCode = '+91';
                phone = phone.substring(1);
              } else if (/^[6789]\d{9}$/.test(phone) || phone.length === 10) {
                phoneCountryCode = '+91';
              }
            }
            // 3. Last resort: Country column
            if (!phoneCountryCode) {
              if (leadCountry.includes('india') || leadCountry === 'in') phoneCountryCode = '+91';
              else if (leadCountry.includes('uae') || leadCountry.includes('emirates')) phoneCountryCode = '+971';
            }
          }

          if (i < 10) {
            console.log(`✅ ROW ${i + 1}: Name="${name}" | Phone="${phone}" | CC="${phoneCountryCode}" | Sec="${secPhone}"`);
          }

          let staffId = null;
          const assignedText = g(colIdx.assigned_staff);
          if (assignedText) {
            const u = cachedUsers.find(u =>
              u.name.toLowerCase() === assignedText.toLowerCase() ||
              u.email.toLowerCase() === assignedText.toLowerCase() ||
              (u.name.toLowerCase().includes(assignedText.toLowerCase()) && assignedText.length > 3)
            );
            if (u) staffId = u.id;
          }

          let st = g(colIdx.status) || 'Unassigned';
          const sl = st.toLowerCase();

          // AUTO-ASSIGN LOGIC: If staffId is found, the status should be 'Assigned' 
          // (unless the user explicitly provided a more specific status like 'Follow-up')
          if (staffId && (sl === 'unassigned' || !st)) {
            st = 'Assigned';
          } else if (sl.includes('follow')) {
            st = 'Follow-up';
          } else if (sl.includes('prospect')) {
            st = 'Prospect';
          } else if (sl.includes('eligible')) {
            st = 'Not Eligible';
          } else if (sl.includes('interested')) {
            st = 'Not Interested';
          } else if (sl.includes('completed')) {
            st = 'Registration Completed';
          } else if (!staffId) {
            st = 'Unassigned';
          }

          const now = new Date().toISOString();
          const fileComment = g(colIdx.comment);

          // ADD TO SETS TO PREVENT INTRA-CSV DUPLICATES
          if (email) existingEmails.add(email);
          if (phone) existingPhones.add(phone.replace(/\D/g, ''));
          if (secPhone) existingPhones.add(secPhone.replace(/\D/g, ''));

          validLeads.push({
            name, phone_number: phone, phone_country_code: phoneCountryCode,
            whatsapp_number: g(colIdx.whatsapp_number) || null,
            whatsapp_country_code: phoneCountryCode || '+91',
            email: email || null, country: g(colIdx.country) || null, program: g(colIdx.program) || null,
            occupation: g(colIdx.occupation) || null,
            status: st, priority: g(colIdx.priority) || 'Medium',
            comment: fileComment || 'Bulk Imported',
            follow_up_date: parseDate(g(colIdx.follow_up_date)), follow_up_status: g(colIdx.follow_up_status) || 'Pending',
            assigned_staff_id: staffId, source: g(colIdx.source) || 'Bulk Import',
            ielts_score: g(colIdx.ielts_score) || null, created_by: userId, created_at: now, updated_at: now,
            secondary_phone_number: secPhone || null
          });
        } catch (e) { results.errors++; results.errorRows.push({ row: i + 1, sheet: sheetName, message: e.message }); }
      }
    }

    if (validLeads.length > 0) {
      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');
        const BATCH_SIZE = 1000; // Increased batch size for much faster imports
        for (let i = 0; i < validLeads.length; i += BATCH_SIZE) {
          const batch = validLeads.slice(i, i + BATCH_SIZE);
          const placeholders = [];
          const flatValues = [];
          let pIdx = 1;
          batch.forEach(l => {
            const vals = [
              l.name, l.phone_number, l.phone_country_code, l.whatsapp_number, l.email,
              l.country, l.program, l.occupation, l.status, l.priority, l.comment,
              l.follow_up_date, l.follow_up_status, l.assigned_staff_id, l.source, l.ielts_score,
              l.created_by, l.created_at, l.updated_at, l.secondary_phone_number
            ];
            const rowP = vals.map(() => `$${pIdx++}`);
            flatValues.push(...vals);
            placeholders.push(`(${rowP.join(', ')})`);
          });
          const query = `INSERT INTO leads (
            name, phone_number, phone_country_code, whatsapp_number, email,
            country, program, occupation, status, priority, comment,
            follow_up_date, follow_up_status, assigned_staff_id, source, ielts_score,
            created_by, created_at, updated_at, secondary_phone_number
          ) VALUES ${placeholders.join(', ')} RETURNING id`;
          const leadResult = await client.query(query, flatValues);

          // CREATE AUTOMATIC ACTIVITY COMMENTS
          const leadIds = leadResult.rows.map(r => r.id);
          const commentPlaceholders = [];
          const commentValues = [];
          let cIdx = 1;
          const importTime = new Date().toISOString();

          leadIds.forEach((id, idx) => {
            const leadData = batch[idx];
            // Use the actual comment from Excel if it's meaningful, otherwise fallback to system notice
            const excelComment = leadData.comment && leadData.comment !== 'Bulk Imported' ? leadData.comment : null;
            const commentText = excelComment || `System: Lead imported from ${leadData.source || 'Bulk Import'}. Initial Status: ${leadData.status}.`;

            commentValues.push(id, userId, commentText, importTime);
            commentPlaceholders.push(`($${cIdx++}, $${cIdx++}, $${cIdx++}, $${cIdx++})`);
          });

          if (commentPlaceholders.length > 0) {
            await client.query(`INSERT INTO comments (lead_id, user_id, comment, created_at) VALUES ${commentPlaceholders.join(', ')}`, commentValues);
          }
        }
        await client.query('COMMIT');
        results.created = validLeads.length;

        // RECORD TO IMPORT HISTORY
        try {
          await client.query(`
            INSERT INTO import_history 
            (filename, original_filename, total_rows, successful_rows, skipped_rows, error_rows, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, [
            uniqueFilename,
            req.file.originalname,
            results.total,
            results.created,
            results.skipped,
            results.errors,
            userId
          ]);
        } catch (historyErr) {
          console.error('⚠️ Failed to log import history:', historyErr.message);
        }
      } catch (e) { await client.query('ROLLBACK'); throw e; }
      finally { client.release(); }
    }
    res.json({ success: true, ...results });
  } catch (error) {
    console.error('Bulk Import Error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});



// Bulk delete leads
router.post('/bulk-delete', authenticate, async (req, res) => {
  const client = await db.pool.connect();
  try {
    const userId = req.user.id;
    const role = req.user.role;
    const { leadIds } = req.body;

    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({ error: 'No lead IDs provided' });
    }

    await client.query('BEGIN');
    let queryText = 'DELETE FROM leads WHERE id = ANY($1)';
    const queryParams = [leadIds];

    const result = await client.query(queryText, queryParams);

    await client.query('COMMIT');

    console.log(`✅ Bulk deleted ${result.rowCount} leads by user ${userId}`);
    res.json({ success: true, deletedCount: result.rowCount });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Bulk delete error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  } finally {
    client.release();
  }
});

// Export leads to CSV (for Google Sheets import)
router.get('/export/csv', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;
    const { status, search } = req.query;

    const filter = {};

    // Determine accessible user IDs based on role
    let accessibleUserIds = null;
    if (role === 'ADMIN') {
      accessibleUserIds = null;
    } else if (role === 'SALES_TEAM_HEAD') {
      const teamMembers = await db.getUsers({ managed_by: userId });
      accessibleUserIds = [userId, ...teamMembers.map(u => u.id)];
    } else if (role === 'SALES_TEAM' || role === 'PROCESSING') {
      accessibleUserIds = [userId];
    } else if (role === 'STAFF') {
      accessibleUserIds = [userId];
    } else {
      accessibleUserIds = [userId];
    }

    if (accessibleUserIds && accessibleUserIds.length === 1) {
      filter.assigned_staff_id = accessibleUserIds[0];
    }

    if (status) {
      filter.status = status;
    }

    if (search) {
      filter.search = search;
    }

    if (phone) {
      filter.phone = phone;
    }

    let leads = await db.getLeads(filter);

    if (accessibleUserIds && accessibleUserIds.length > 1) {
      leads = leads.filter(lead =>
        !lead.assigned_staff_id || accessibleUserIds.includes(lead.assigned_staff_id)
      );
    }

    // Add assigned staff name
    const leadsWithNames = await Promise.all(leads.map(async lead => ({
      ...lead,
      assigned_staff_name: lead.assigned_staff_id ? await db.getUserName(lead.assigned_staff_id) : 'Unassigned',
    })));
    leads = leadsWithNames;

    // Convert to CSV
    const headers = [
      'ID',
      'Name',
      'Phone Country Code',
      'Phone Number',
      'WhatsApp Country Code',
      'WhatsApp Number',
      'Email',
      'Age',
      'Occupation',
      'Qualification',
      'Year of Experience',
      'Country',
      'Program',
      'Status',
      'Source',
      'Priority',
      'Comment',
      'Follow-up Date',
      'Next Follow-up Date',
      'Assigned Staff',
      'Created At',
      'Updated At'
    ];

    const csvRows = [headers.join(',')];

    leads.forEach(lead => {
      const row = [
        lead.id || '',
        `"${(lead.name || '').replace(/"/g, '""')}"`,
        lead.phone_country_code || '',
        lead.phone_number || '',
        lead.whatsapp_country_code || '',
        lead.whatsapp_number || '',
        lead.email || '',
        lead.age || '',
        `"${(lead.occupation || '').replace(/"/g, '""')}"`,
        lead.qualification || '',
        lead.year_of_experience || '',
        lead.country || '',
        lead.program || '',
        lead.status || '',
        `"${(lead.source || '').replace(/"/g, '""')}"`,
        lead.priority || '',
        `"${(lead.comment || '').replace(/"/g, '""')}"`,
        lead.follow_up_date || '',
        lead.follow_up_status || 'Pending',
        `"${(lead.assigned_staff_name || '').replace(/"/g, '""')}"`,
        lead.created_at || '',
        lead.updated_at || ''
      ];
      csvRows.push(row.join(','));
    });

    const csvContent = csvRows.join('\n');

    // Support both CSV and Excel export
    const format = req.query.format || 'csv';

    if (format === 'xlsx' || format === 'excel') {
      // Export as Excel
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet([
        headers,
        ...leads.map(lead => [
          lead.id || '',
          lead.name || '',
          lead.phone_country_code || '',
          lead.phone_number || '',
          lead.whatsapp_country_code || '',
          lead.whatsapp_number || '',
          lead.email || '',
          lead.age || '',
          lead.occupation || '',
          lead.qualification || '',
          lead.year_of_experience || '',
          lead.country || '',
          lead.program || '',
          lead.status || '',
          lead.priority || '',
          lead.comment || '',
          lead.follow_up_date || '',
          lead.follow_up_status || 'Pending',
          lead.assigned_staff_name || '',
          lead.created_at || '',
          lead.updated_at || ''
        ])
      ]);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Leads');
      const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="leads_export_${new Date().toISOString().split('T')[0]}.xlsx"`);
      res.send(excelBuffer);
    } else {
      // Export as CSV (default)
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="leads_export_${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csvContent);
    }
  } catch (error) {
    console.error('Export leads error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Complete registration (convert lead to client)
router.post('/:id/complete-registration', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;
    const leadId = parseInt(req.params.id);
    const {
      assessment_authority,
      occupation_mapped,
      registration_fee_paid,
    } = req.body;

    // Validate required fields
    if (!assessment_authority || !occupation_mapped) {
      return res.status(400).json({ error: 'Assessment Authority and Occupation Mapped are required' });
    }

    // Get lead details
    const existingLeads = await db.getLeads({ id: leadId });
    const lead = existingLeads[0];
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Check access rights
    if (role === 'STAFF' || role === 'SALES_TEAM' || role === 'PROCESSING') {
      if (Number(lead.assigned_staff_id) !== Number(userId)) {
        return res.status(403).json({ error: 'Access denied: You can only convert your own leads' });
      }
    } else if (role === 'SALES_TEAM_HEAD') {
      const teamMembers = await db.getUsers({ managed_by: userId });
      const accessibleIds = [userId, ...teamMembers.map(u => u.id)];
      if (lead.assigned_staff_id && !accessibleIds.includes(Number(lead.assigned_staff_id))) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    // Find Sneha (Processing) for automatic assignment
    let snehaUserId = null;
    let snehaUser = null;
    try {
      const users = await db.getUsers({ email: 'sneha@toniosenora.com' });
      if (users.length > 0) {
        snehaUser = users[0];
        snehaUserId = snehaUser.id;
      } else {
        const byName = await db.getUsers({ name: 'Sneha' });
        if (byName.length > 0) {
          snehaUser = byName[0];
          snehaUserId = snehaUser.id;
        }
      }
    } catch (e) {
      console.error('Error finding Sneha for assignment:', e);
    }

    // Prepare client data
    const clientData = {
      name: lead.name,
      phone_number: lead.phone_number,
      phone_country_code: lead.phone_country_code,
      whatsapp_number: lead.whatsapp_number,
      whatsapp_country_code: lead.whatsapp_country_code,
      email: lead.email,
      age: lead.age,
      occupation: lead.occupation,
      qualification: lead.qualification,
      year_of_experience: lead.year_of_experience,
      country: lead.country,
      target_country: lead.target_country || lead.country,
      residing_country: lead.residing_country,
      program: lead.program,
      assigned_staff_id: lead.assigned_staff_id, // Original sales staff
      processing_staff_id: snehaUserId, // Automatically assigned processing staff
      lead_id: leadId,
      created_by: userId,

      // Registration specific
      assessment_authority,
      occupation_mapped,
      registration_fee_paid: registration_fee_paid === 'Yes' || registration_fee_paid === true,

      // Initialize processing status
      processing_status: 'New Registration',
      fee_status: 'Payment Pending',
    };

    // Create Client
    const newClient = await db.createClient(clientData);

    // Update Lead Status
    await db.updateLead(leadId, { status: 'Registration Completed' });

    // Send notification to Sneha if found
    if (snehaUser) {
      await db.createNotification({
        user_id: snehaUser.id,
        client_id: newClient.id,
        type: 'client_assigned',
        message: `New Registration: ${newClient.name} (Converted by ${req.user.name})`,
        created_by: userId
      });
      console.log(`✅ Assigned new client ${newClient.id} to Sneha (${snehaUser.id})`);
    } else {
      console.warn('⚠️ Sneha not found, client created but no automatic processing assignment');
    }

    // Also notify Kripa? User said "duplicate to task box of sneha and kripa". 
    // Usually Kripa helps Sneha, but Sneha is the primary for fee management.
    // Dashboard logic handles the visibility for Kripa.

    res.status(201).json(newClient);

  } catch (error) {
    console.error('❌ Complete registration error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Delete a lead
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;
    const leadId = parseInt(req.params.id);

    // Fetch existing lead to check permissions
    const existingLeads = await db.getLeads({ id: leadId });
    const existingLead = existingLeads[0];

    if (!existingLead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Permission Check
    let canDelete = false;

    if (role === 'ADMIN') {
      canDelete = true;
    } else if (role === 'SALES_TEAM_HEAD') {
      const teamMembers = await db.getUsers({ managed_by: userId });
      const teamMemberIds = teamMembers.map(u => u.id);
      if (existingLead.assigned_staff_id === userId || teamMemberIds.includes(existingLead.assigned_staff_id)) {
        canDelete = true;
      }
    } else {
      // Staff/Sales/Processing
      // Can delete if they created it OR if it is assigned to them
      if (existingLead.assigned_staff_id === userId || existingLead.created_by === userId) {
        canDelete = true;
      }
    }

    if (!canDelete) {
      return res.status(403).json({ error: 'Not authorized to delete this lead' });
    }

    const success = await db.deleteLead(leadId);
    if (success) {
      res.json({ message: 'Lead deleted successfully' });
    } else {
      res.status(500).json({ error: 'Failed to delete lead' });
    }

  } catch (error) {
    console.error('❌ Delete lead error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
