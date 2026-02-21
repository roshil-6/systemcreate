const express = require('express');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const XLSX = require('xlsx');
const iconv = require('iconv-lite');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');

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
    const { status, search, assigned_staff_id } = req.query;

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
      // Filter out other Admins if desired, but keep for now
      users = allUsers.filter(u => u.role !== 'ADMIN');
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

// Bulk import leads from CSV
router.post('/bulk-import', authenticate, (req, res, next) => {
  console.log('📥 Bulk import - Before multer middleware');
  console.log('   User:', req.user?.id, req.user?.name, req.user?.role);
  console.log('   Content-Type:', req.headers['content-type']);
  console.log('   Content-Length:', req.headers['content-length']);

  upload.single('file')(req, res, (err) => {
    if (err) {
      console.error('❌ Multer error:', err.message);
      console.error('   Error code:', err.code);
      console.error('   Error field:', err.field);
      return res.status(400).json({
        error: 'File upload error',
        details: err.message || 'Invalid file format. Please upload a CSV file.'
      });
    }
    console.log('✅ Multer middleware passed');
    next();
  });
}, async (req, res) => {
  try {
    console.log('📥 Bulk import - After multer middleware');
    console.log('   User:', req.user?.id, req.user?.name, req.user?.role);
    console.log('   File:', req.file ? {
      filename: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      fieldname: req.file.fieldname
    } : 'NO FILE');
    console.log('   Body keys:', Object.keys(req.body));

    const role = req.user.role;
    const userId = req.user.id;

    // Allow ADMIN and all staff roles
    const canImport = role === 'ADMIN' || role === 'SALES_TEAM_HEAD' || role === 'SALES_TEAM' || role === 'PROCESSING' || role === 'STAFF';
    if (!canImport) {
      console.error('❌ Bulk import: Access denied for role:', role);
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!req.file) {
      console.error('❌ Bulk import: No file provided');
      console.error('   Request body keys:', Object.keys(req.body));
      console.error('   Request files:', req.files);
      console.error('   Content-Type:', req.headers['content-type']);
      return res.status(400).json({
        error: 'CSV file is required',
        details: 'Please select a CSV file to upload. Make sure the file input name is "file".'
      });
    }

    console.log('✅ Bulk import: File received:', {
      filename: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    });

    // Determine file type and parse accordingly
    const isExcel = req.file.originalname.toLowerCase().endsWith('.xlsx') ||
      req.file.originalname.toLowerCase().endsWith('.xls') ||
      req.file.mimetype.includes('spreadsheet') ||
      req.file.mimetype.includes('excel');

    let lines = [];
    let headerValues = [];
    let dataRows = [];

    if (isExcel) {
      // Parse Excel file
      try {
        console.log('📊 Parsing Excel file...');
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // Convert to JSON with header row
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        if (jsonData.length < 2) {
          return res.status(400).json({
            error: 'Excel file must contain at least a header row and one data row',
            details: `Found ${jsonData.length} row(s). Need at least 2 rows (header + data).`
          });
        }

        // First row is headers
        headerValues = jsonData[0].map(h => String(h || '').trim());

        // Store data rows directly as arrays (SKIP THE HEADER ROW AT INDEX 0)
        dataRows = jsonData.slice(1);

        console.log('✅ Excel file parsed:', {
          rows: jsonData.length,
          headers: headerValues.length,
          sheet: sheetName
        });
      } catch (error) {
        console.error('❌ Error parsing Excel file:', error);
        return res.status(400).json({
          error: 'Error parsing Excel file',
          details: error.message
        });
      }
    } else {
      // Smart encoding detection: handle UTF-8 BOM, UTF-8, and Windows-1252 (ANSI/Latin-1)
      // CSVs from Excel are often saved as Windows-1252 which causes ? for special chars
      let csvText;
      try {
        const buf = req.file.buffer;

        // 1. Check for UTF-8 BOM (EF BB BF)
        if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
          csvText = iconv.decode(buf.slice(3), 'utf-8');
          console.log('✅ CSV decoded as UTF-8 (with BOM stripped)');

          // 2. Check for UTF-16 LE BOM (FF FE)
        } else if (buf[0] === 0xFF && buf[1] === 0xFE) {
          csvText = iconv.decode(buf.slice(2), 'utf-16le');
          console.log('✅ CSV decoded as UTF-16 LE');

          // 3. Heuristic: detect Windows-1252 vs UTF-8
          // If buffer contains bytes 0x80-0x9F (Windows-1252 control range) or invalid UTF-8
          // sequences, decode as windows-1252 instead of UTF-8
        } else {
          const isValidUTF8 = iconv.encodingExists('utf-8') && (() => {
            try {
              // Try decoding as UTF-8 and re-encoding; if roundtrip has replacements it's not UTF-8
              const asUtf8 = buf.toString('utf-8');
              // Check for replacement character (U+FFFD) which Node inserts for invalid UTF-8
              return !asUtf8.includes('\uFFFD');
            } catch (e) {
              return false;
            }
          })();

          if (isValidUTF8) {
            csvText = buf.toString('utf-8');
            console.log('✅ CSV decoded as UTF-8');
          } else {
            // Fall back to Windows-1252 (covers ANSI/Latin-1 exports from Excel)
            csvText = iconv.decode(buf, 'win1252');
            console.log('✅ CSV decoded as Windows-1252 (Excel ANSI export)');
          }
        }

        console.log('✅ CSV file read, length:', csvText.length, 'chars');
      } catch (error) {
        console.error('❌ Error reading CSV file:', error);
        return res.status(400).json({
          error: 'Error reading CSV file',
          details: error.message
        });
      }

      // Handle different line endings (Windows \r\n, Unix \n, Mac \r)
      // Normalize all line endings to \n first
      csvText = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

      // Split by lines and filter out completely empty lines
      const rawLines = csvText.split('\n').filter(line => line.trim() || line.includes(','));
      console.log('📊 CSV lines found:', rawLines.length);

      if (rawLines.length < 2) {
        console.error('❌ Bulk import: CSV file too short, only', rawLines.length, 'lines');
        return res.status(400).json({
          error: 'CSV file must contain at least a header row and one data row',
          details: `Found ${rawLines.length} line(s). Need at least 2 lines (header + data).`
        });
      }

      // Parse all lines into arrays immediately to prevent comma-splitting bugs later
      const allRows = rawLines.map(line => parseCSVLine(line.trim() || (line.includes(',') ? line : '')));
      headerValues = allRows[0].map(h => String(h || '').trim());
      dataRows = allRows.slice(1);
    }

    // Proper CSV parsing function (handle quoted values)
    const parseCSVLine = (line) => {
      const values = [];
      let current = '';
      let inQuotes = false;

      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim()); // Add last value
      return values;
    };

    // Headers are already set at this point (either from Excel or CSV parse above)
    // Normalize headers: trim, lowercase, remove quotes, replace spaces with underscores
    // BUT keep it simple - don't remove too many characters
    const headers = headerValues.map(h => {
      return h.trim()
        .toLowerCase()
        .replace(/^["']+|["']+$/g, '') // Remove surrounding quotes
        .replace(/\s+/g, '_') // Replace spaces with underscores
        .replace(/[^\w_-]/g, ''); // Remove special characters except underscore and dash
    });

    console.log('📋 Parsed header values:', headerValues);
    console.log('📋 Normalized headers:', headers);
    console.log('📋 Looking for: first_name, last_name, phone');
    console.log('📋 Total header count:', headerValues.length, 'normalized:', headers.length);

    // Column mapping - support multiple column name variations
    // Includes Meta Ads (Facebook Ads) export format support
    const columnMapping = {
      // Name fields (can be first_name + last_name OR name)
      // Meta Ads format: "First Name", "Last Name"
      name: ['name', 'full_name', 'fullname', 'full name'],
      first_name: ['first_name', 'firstname', 'fname', 'first name', 'firstname'],
      last_name: ['last_name', 'lastname', 'lname', 'surname', 'last name'],

      // Phone fields
      // Meta Ads format: "Phone Number"
      phone_number: ['phone_number', 'phone', 'phone_no', 'mobile', 'mobile_number', 'contact_number', 'phone number', 'phonenumber'],
      phone_country_code: ['phone_country_code', 'country_code', 'phone_code', 'country code', 'phone code'],
      whatsapp_number: ['whatsapp_number', 'whatsapp', 'whatsapp_no', 'whatsapp number'],
      whatsapp_country_code: ['whatsapp_country_code', 'whatsapp_country_code', 'whatsapp country code'],

      // Other fields
      // Meta Ads format: "Email"
      email: ['email', 'email_address', 'e_mail', 'email address'],
      age: ['age'],
      occupation: ['occupation', 'job', 'profession'],
      qualification: ['qualification', 'education', 'educational_qualification'],
      year_of_experience: ['year_of_experience', 'work_experience_years', 'experience_years', 'years_of_experience', 'experience'],
      country: ['country', 'country_of_interest', 'current_country', 'country of interest'],
      program: ['program', 'course', 'course_program'],
      status: ['status', 'lead_status', 'leadstatus', 'lead status'],
      priority: ['priority'],
      // Comment mapping: removed Meta-ads specific terms to prevent source collisions
      comment: ['comment', 'notes', 'note', 'remarks'],
      follow_up_date: ['follow_up_date', 'followup_date', 'follow_up', 'next_followup', 'created time', 'created_time', 'created date', 'created_date'],
      follow_up_status: ['follow_up_status', 'followup_status', 'follow_up_status'],
      assigned_staff: ['assigned_staff', 'assigned_to', 'staff', 'assigned_staff_id', 'agent', 'agent_name', 'staff_name'],
      // Source: only explicit source columns
      source: ['source', 'lead_source', 'leadsource', 'lead source', 'utm_source', 'channel', 'source_name', 'ad_source', 'marketing_source'],
      ielts_score: ['ielts_score', 'ielts', 'ielts_band', 'ielts score'],
    };

    // Find column indices for each field
    const findColumnIndex = (fieldNames) => {
      for (const field of fieldNames) {
        const fieldLower = field.toLowerCase().trim();

        // STRICT EXACT MATCH ONLY for short fields (like 'age', 'id')
        const isStrictField = ['age', 'id', 'sex'].includes(fieldLower) || fieldLower.length <= 3;

        // Strategy 1 & 2: Check headers
        let index = -1;

        if (isStrictField) {
          // Strict check against ORIGINAL headers
          index = headerValues.findIndex(h => {
            const hLower = h.trim().toLowerCase().replace(/^["']+|["']+$/g, '');
            return hLower === fieldLower;
          });
          if (index !== -1) return index;
          continue; // If strict field not found exactly, DO NOT fuzzy match
        }

        // Strategy 2: Exact match with original header values (case-insensitive)
        index = headerValues.findIndex((h, idx) => {
          const normalized = h.trim().toLowerCase().replace(/^["']+|["']+$/g, '').replace(/\s+/g, '_').replace(/[^\w_-]/g, '');
          return normalized === fieldLower;
        });
        if (index !== -1) {
          console.log(`✅ Found "${field}" → "${headerValues[index]}" (exact from original)`);
          return index;
        }

        // STRICT CHECK: For short fields (like 'age', 'id'), SKIP fuzzy matching (Strategies 3-6)
        // to prevent 'age' matching 'agent', 'agency', etc.
        const isShortField = fieldLower.replace(/[_\s-]/g, '').length <= 3;

        if (!isShortField) {
          // Strategy 3: Starts with match (phone matches phone_number, but not vice versa)
          index = headers.findIndex(h => h.startsWith(fieldLower));
          if (index !== -1) {
            console.log(`✅ Found "${field}" → "${headers[index]}" (starts with)`);
            return index;
          }

          // Strategy 4: Contains match (header contains field - phone_number contains phone)
          index = headers.findIndex(h => h.includes(fieldLower));
          if (index !== -1) {
            console.log(`✅ Found "${field}" → "${headers[index]}" (contains)`);
            return index;
          }

          // Strategy 5: Match without underscores/spaces/dashes
          const fieldNormalized = fieldLower.replace(/[_\s-]/g, '');
          index = headers.findIndex(h => {
            const hNormalized = h.replace(/[_\s-]/g, '');
            return hNormalized === fieldNormalized;
          });
          if (index !== -1) {
            console.log(`✅ Found "${field}" → "${headers[index]}" (normalized)`);
            return index;
          }

          // Strategy 6: Substring match (normalized - field matches header start/end)
          index = headers.findIndex(h => {
            const hNormalized = h.replace(/[_\s-]/g, '');
            // Only match if header contains field, not vice-versa (e.g. 'phone' matches 'phone_number')
            return hNormalized.includes(fieldNormalized);
          });
          if (index !== -1) {
            console.log(`✅ Found "${field}" → "${headers[index]}" (substring normalized)`);
            return index;
          }
        }

        // Strategy 7: Try matching against original header values directly (case-insensitive)
        index = headerValues.findIndex(h => {
          if (!h || !h.trim()) return false; // SKIP EMPTY HEADERS
          const hLower = h.trim().toLowerCase().replace(/^["']+|["']+$/g, '');

          if (isStrictField) {
            // Strict equality only for short fields
            return hLower === fieldLower;
          }

          return hLower === fieldLower || hLower.includes(fieldLower) || fieldLower.includes(hLower);
        });
        if (index !== -1) {
          console.log(`✅ Found "${field}" → "${headerValues[index]}" (direct original match)`);
          return index;
        }
      }
      console.log(`❌ NOT FOUND after all strategies: ${fieldNames.join(', ')}`);
      console.log(`   Available normalized headers: ${headers.join(', ')}`);
      console.log(`   Available original headers: ${headerValues.join(', ')}`);
      return -1;
    };

    // Check for required fields
    console.log('📋 Bulk import: Headers found:', headers);
    console.log('📋 Total headers:', headers.length);
    console.log('📋 Original header values:', headerValues);

    // --- MULTI-PASS ROBUST COLUMN MAPPING ---
    const detectedIndices = {};
    const usedIndices = new Set();

    const solveField = (field, searchTerms, strategy) => {
      if (detectedIndices[field] !== undefined && detectedIndices[field] !== -1) return;

      for (const term of searchTerms) {
        const termLower = term.toLowerCase().trim();
        const termNorm = termLower.replace(/[_\s-]/g, '');

        for (let idx = 0; idx < headerValues.length; idx++) {
          if (usedIndices.has(idx)) continue;

          const hRaw = (headerValues[idx] || '').trim();
          if (!hRaw) continue;

          const hLower = hRaw.toLowerCase();
          const hNorm = hLower.replace(/[_\s-]/g, '');

          let isMatch = false;

          if (strategy === 'exact') {
            isMatch = (hLower === termLower || hNorm === termNorm);
          } else if (strategy === 'fuzzy') {
            // Fuzzy: normalized header contains normalized term
            isMatch = (hNorm.includes(termNorm) || termNorm.includes(hNorm));

            // CRITICAL: Prevent dangerous collisions for 'name' field
            if (isMatch && field === 'name') {
              const dangerousKeywords = ['campaign', 'ad', 'form', 'agent', 'staff', 'user', 'assigned', 'source', 'utm'];
              if (dangerousKeywords.some(k => hLower.includes(k))) {
                isMatch = false;
              }
            }
          }

          if (isMatch) {
            detectedIndices[field] = idx;
            usedIndices.add(idx);
            console.log(`📍 Pass [${strategy}] mapped [${field}] to header "${hRaw}" (Index ${idx})`);
            return;
          }
        }
      }
    };

    // PASS 1: Exact matches for ALL fields
    const allFields = Object.keys(columnMapping);
    allFields.forEach(f => solveField(f, columnMapping[f], 'exact'));

    // PASS 2: Fuzzy matches for remaining fields (excluding name-collisions)
    allFields.forEach(f => solveField(f, columnMapping[f], 'fuzzy'));

    // Helper for Meta Ads search (not used for core mapping to avoid collisions)
    const findSimpleIndex = (searchTerms) => {
      for (const term of searchTerms) {
        const termLower = term.toLowerCase().trim();
        const idx = headerValues.findIndex(h => h && h.trim().toLowerCase().replace(/[_\s-]/g, '').includes(termLower.replace(/[_\s-]/g, '')));
        if (idx !== -1) return idx;
      }
      return -1;
    };

    // Special case: Meta Ads specific columns
    const metaAdsColumns = {
      ad_name: findSimpleIndex(['ad name', 'ad_name', 'adname', 'ad', 'utm_content']),
      campaign_name: findSimpleIndex(['campaign name', 'campaign_name', 'campaignname', 'campaign', 'utm_campaign', 'marketing_campaign', 'ad_campaign']),
      form_name: findSimpleIndex(['form name', 'form_name', 'formname', 'form']),
      lead_id: findSimpleIndex(['lead id', 'lead_id', 'leadid', 'id', 'meta_id']),
      created_time: findSimpleIndex(['created time', 'created_time', 'created date', 'created_date', 'date', 'timestamp', 'time']),
    };

    const columnIndices = {
      name: detectedIndices.name !== undefined ? detectedIndices.name : -1,
      first_name: detectedIndices.first_name !== undefined ? detectedIndices.first_name : -1,
      last_name: detectedIndices.last_name !== undefined ? detectedIndices.last_name : -1,
      phone_number: detectedIndices.phone_number !== undefined ? detectedIndices.phone_number : -1,
      phone_country_code: detectedIndices.phone_country_code !== undefined ? detectedIndices.phone_country_code : -1,
      whatsapp_number: detectedIndices.whatsapp_number !== undefined ? detectedIndices.whatsapp_number : -1,
      whatsapp_country_code: detectedIndices.whatsapp_country_code !== undefined ? detectedIndices.whatsapp_country_code : -1,
      email: detectedIndices.email !== undefined ? detectedIndices.email : -1,
      age: detectedIndices.age !== undefined ? detectedIndices.age : -1,
      occupation: detectedIndices.occupation !== undefined ? detectedIndices.occupation : -1,
      qualification: detectedIndices.qualification !== undefined ? detectedIndices.qualification : -1,
      year_of_experience: detectedIndices.year_of_experience !== undefined ? detectedIndices.year_of_experience : -1,
      country: detectedIndices.country !== undefined ? detectedIndices.country : -1,
      program: detectedIndices.program !== undefined ? detectedIndices.program : -1,
      status: detectedIndices.status !== undefined ? detectedIndices.status : -1,
      priority: detectedIndices.priority !== undefined ? detectedIndices.priority : -1,
      comment: detectedIndices.comment !== undefined ? detectedIndices.comment : -1,
      follow_up_date: detectedIndices.follow_up_date !== undefined ? detectedIndices.follow_up_date : -1,
      follow_up_status: detectedIndices.follow_up_status !== undefined ? detectedIndices.follow_up_status : -1,
      assigned_staff: detectedIndices.assigned_staff !== undefined ? detectedIndices.assigned_staff : -1,
      source: detectedIndices.source !== undefined ? detectedIndices.source : -1,
      ielts_score: detectedIndices.ielts_score !== undefined ? detectedIndices.ielts_score : -1,
      meta_ad_name: metaAdsColumns.ad_name,
      meta_campaign_name: metaAdsColumns.campaign_name,
      meta_form_name: metaAdsColumns.form_name,
      meta_lead_id: metaAdsColumns.lead_id,
      meta_created_time: metaAdsColumns.created_time,
    };

    // Validation
    const hasName = columnIndices.name !== -1 || (columnIndices.first_name !== -1 && columnIndices.last_name !== -1);
    const hasPhone = columnIndices.phone_number !== -1;

    if (!hasName || !hasPhone) {
      console.error('❌ Bulk import: Missing required columns');
      return res.status(400).json({
        error: 'Missing required columns: name, phone_number',
        details: `Found columns: ${headerValues.join(', ')}. Required: name (or first_name+last_name) and phone`,
        availableColumns: headerValues
      });
    }

    console.log('✅ Column mapping successful:', {
      name: columnIndices.name !== -1 ? 'found' : (columnIndices.first_name !== -1 && columnIndices.last_name !== -1 ? 'first_name + last_name' : 'missing'),
      phone: columnIndices.phone_number !== -1 ? 'found' : 'missing',
      email: columnIndices.email !== -1 ? 'found' : 'missing',
    });

    // Fast duplicate check: only fetch phone_number and email columns
    let existingPhones = new Set();
    let existingEmails = new Set();
    try {
      const phoneRows = await db.getLeadPhones();
      phoneRows.forEach(r => { if (r.phone_number) existingPhones.add(r.phone_number.toLowerCase()); });
      phoneRows.forEach(r => { if (r.email) existingEmails.add(r.email.toLowerCase()); });
    } catch (e) {
      console.warn('Could not prefetch existing leads for duplicate check:', e.message);
    }

    const results = {
      total: dataRows.length,
      created: 0,
      skipped: 0,
      errors: 0,
      errorRows: [],
    };

    // Collect valid leads for batch insert
    const validLeads = [];
    const now = new Date().toISOString();
    // OPTIMIZATION: Assign imported leads to the current staff member (if not Admin)
    const assignedStaffId = role === 'ADMIN' ? null : userId;

    // Helper: Parse Date (handles Excel serials + strings)
    const parseDate = (val) => {
      if (!val) return null;
      // Excel Serial Date (e.g. 46023)
      // ~25569 is 1970-01-01 in Excel serial days (1900 system)
      const num = Number(val);
      if (!isNaN(num) && num > 10000 && num < 90000) {
        return new Date((num - 25569) * 86400 * 1000).toISOString();
      }
      // Standard Date
      const d = new Date(val);
      if (!isNaN(d.getTime())) return d.toISOString();
      return null;
    };

    // Process each row
    for (let i = 0; i < dataRows.length; i++) {
      const values = dataRows[i];

      // Skip empty rows (no data in any column)
      if (!values || values.length === 0 || values.every(v => !String(v).trim())) continue;

      try {
        // Ensure we have enough values (pad with empty strings if needed)
        while (values.length < headerValues.length) {
          values.push('');
        }

        // Map values using column indices
        const getValue = (index) => {
          if (index === -1 || index >= values.length) return '';
          const val = values[index];
          if (val === null || val === undefined) return '';
          return String(val).trim(); // Fix: Force to String before trim to handle numbers/dates
        };

        // Get name (either from 'name' column OR 'first_name' + 'last_name')
        let name = '';
        if (columnIndices.name !== -1) {
          name = getValue(columnIndices.name);
        } else if (columnIndices.first_name !== -1 && columnIndices.last_name !== -1) {
          const firstName = getValue(columnIndices.first_name);
          const lastName = getValue(columnIndices.last_name);
          name = `${firstName} ${lastName}`.trim();
        }

        // Get phone number and extract country code if present
        let phoneNumber = getValue(columnIndices.phone_number);
        let phoneCountryCode = getValue(columnIndices.phone_country_code);
        let secondaryPhoneNumber = null;

        // If phone number starts with +, extract country code
        if (phoneNumber && phoneNumber.startsWith('+') && !phoneCountryCode) {
          // Try to extract country code (common formats: +91, +971, +1, etc.)
          const match = phoneNumber.match(/^(\+\d{1,3})(.+)$/);
          if (match) {
            phoneCountryCode = match[1]; // e.g., +91
            phoneNumber = match[2].trim(); // e.g., 9876543210
          }
        }

        // Fix repeating phone numbers (common CSV export error)
        // Fix repeating phone numbers (common CSV export error)
        if (phoneNumber && typeof phoneNumber === 'string') {
          // Normalize ALL whitespace (including NBSP, tabs) to a single space
          const cleanVal = phoneNumber.replace(/[\s\u00A0]+/g, ' ').trim();

          // Method 1: Split by delimiters (space, comma, semicolon, slash, dash)
          // Since we normalized to space, splitting by space is robust
          const parts = cleanVal.split(/[ ,;/]+| - /).filter(p => p.trim().length > 0);

          if (parts.length >= 2) {
            phoneNumber = parts[0]; // Keep only first part

            // Move second part to secondary if empty
            if (!secondaryPhoneNumber) {
              secondaryPhoneNumber = parts[1];
            }
          }
          // Method 2: Check concatenated duplication (e.g. "123123") - ONLY if single part
          else if (parts.length === 1 && cleanVal.length > 10 && cleanVal.length % 2 === 0) {
            const half = cleanVal.length / 2;
            if (cleanVal.substring(0, half) === cleanVal.substring(half)) {
              phoneNumber = cleanVal.substring(0, half);
              if (!secondaryPhoneNumber) {
                secondaryPhoneNumber = cleanVal.substring(half);
              }
            }
          }
        }

        // Get other fields
        const email = getValue(columnIndices.email);
        const age = getValue(columnIndices.age);
        const occupation = getValue(columnIndices.occupation);
        const qualification = getValue(columnIndices.qualification);
        const yearOfExperience = getValue(columnIndices.year_of_experience);
        const country = getValue(columnIndices.country);
        const program = getValue(columnIndices.program);
        let status = getValue(columnIndices.status);
        const priority = getValue(columnIndices.priority);

        // Get Meta Ads specific fields
        const metaAdName = getValue(columnIndices.meta_ad_name);
        const metaCampaignName = getValue(columnIndices.meta_campaign_name);
        const metaFormName = getValue(columnIndices.meta_form_name);
        const metaLeadId = getValue(columnIndices.meta_lead_id);
        const metaCreatedTime = getValue(columnIndices.meta_created_time);

        // Get source and IELTS score
        let source = getValue(columnIndices.source);
        const ieltsScore = getValue(columnIndices.ielts_score);

        // EXTRA STRICTNESS: If source is identical to name, it was probably a mis-mapping
        if (source && name && source.toLowerCase() === name.toLowerCase()) {
          source = ''; // Reset so Meta Ads logic can provide a better source
        }

        // Build source from Meta Ads fields or use provided source
        // If source was not found in a dedicated column, try to build it from Meta Ads fields
        if (!source || source === 'Direct/Import') {
          if (metaCampaignName) {
            source = metaCampaignName;
          } else if (metaAdName || metaFormName) {
            const metaParts = [];
            if (metaAdName) metaParts.push(`Ad: ${metaAdName}`);
            if (metaFormName) metaParts.push(`Form: ${metaFormName}`);
            source = metaParts.join(' | ');
          }
        }

        // Fallback for source if still empty
        if (!source) {
          source = 'Direct/Import';
        }

        // Build comment - combine existing comment with Meta Ads info
        let comment = getValue(columnIndices.comment) || '';
        if (metaLeadId || metaCreatedTime || metaAdName || metaCampaignName) {
          const metaInfo = [];
          if (metaLeadId) metaInfo.push(`Lead ID: ${metaLeadId}`);
          if (metaCreatedTime) metaInfo.push(`Created: ${metaCreatedTime}`);
          if (metaAdName && !source) metaInfo.push(`Ad: ${metaAdName}`);
          if (metaCampaignName && !source) metaInfo.push(`Campaign: ${metaCampaignName}`);
          if (metaFormName) metaInfo.push(`Form: ${metaFormName}`);

          if (metaInfo.length > 0) {
            const metaInfoStr = `Meta Ads: ${metaInfo.join(', ')}`;
            comment = comment ? `${comment} | ${metaInfoStr}` : metaInfoStr;
          }
        }

        // If no comment but we have source, use source as comment
        if (!comment && source) {
          comment = source;
        }

        const followUpDate = parseDate(getValue(columnIndices.follow_up_date) || metaCreatedTime); // Use Meta created time if no follow_up_date
        const followUpStatus = getValue(columnIndices.follow_up_status) || 'Pending';
        const whatsappNumber = getValue(columnIndices.whatsapp_number);
        const whatsappCountryCode = getValue(columnIndices.whatsapp_country_code);

        // Handle assigned_staff - can be name or ID
        let finalAssignedStaffId = assignedStaffId; // Default to current user or null for admin
        const assignedStaffValue = getValue(columnIndices.assigned_staff);
        if (assignedStaffValue) {
          // Try to find user by name (case-insensitive) or email
          const allUsers = await db.getUsers();
          const matchedUser = allUsers.find(u =>
            u.name.toLowerCase() === assignedStaffValue.toLowerCase() ||
            u.email.toLowerCase() === assignedStaffValue.toLowerCase()
          );
          if (matchedUser) {
            finalAssignedStaffId = matchedUser.id;
            console.log(`✅ Found staff "${assignedStaffValue}" → ID: ${matchedUser.id}`);
          } else {
            console.log(`⚠️ Staff "${assignedStaffValue}" not found, using default assignment`);
          }
        }

        // Validate required fields

        // Skip empty rows (fixes trailing empty lines issue)
        if (!name && !phoneNumber && !email && !status) {
          continue;
        }

        // Handle missing name
        if (!name) {
          name = `Unknown Lead (Row ${i + 1})`;
          comment = comment ? `${comment} | Name missing in import` : 'Name missing in import';
        }

        // Handle missing phone
        if (!phoneNumber) {
          // Create unique dummy phone to bypass NOT NULL constraint
          // format: 000-timestamp-row
          phoneNumber = `000-${Date.now().toString().slice(-6)}-${i}`;
          comment = comment ? `${comment} | Phone missing in import` : 'Phone missing in import';
        }

        /* 
        // Strict check removed effectively
        if (!name || !phoneNumber) { ... } 
        */

        // Check for duplicates using in-memory sets (FAST!)
        if (existingPhones.has(phoneNumber.toLowerCase())) {
          results.skipped++;
          continue;
        }

        if (email && existingEmails.has(email.toLowerCase())) {
          results.skipped++;
          continue;
        }

        // Map status values (handle different status formats)
        if (!status) {
          status = 'Unassigned';
        } else {
          // Normalize status values
          const statusLower = status.toLowerCase();
          if (statusLower.includes('new') || statusLower.includes('pending') || statusLower.includes('unassigned')) {
            status = 'Unassigned';
          } else if (statusLower.includes('follow') || statusLower.includes('followup')) {
            status = 'Follow-up';
          } else if (statusLower.includes('prospect')) {
            status = 'Prospect';
          } else if (statusLower.includes('not eligible') || statusLower.includes('ineligible')) {
            status = 'Not Eligible';
          } else if (statusLower.includes('not interested') || statusLower.includes('uninterested')) {
            status = 'Not Interested';
          } else if (statusLower.includes('registration') || statusLower.includes('completed')) {
            status = 'Registration Completed';
          } else {
            // Check if it matches a valid status exactly
            const validStatuses = ['Unassigned', 'Follow-up', 'Prospect', 'Pending Lead', 'Not Eligible', 'Not Interested', 'Registration Completed'];
            if (!validStatuses.includes(status)) {
              status = 'Unassigned'; // Default to Unassigned if unknown
            }
          }
        }

        // Validate priority
        let finalPriority = priority || null;
        if (finalPriority) {
          const validPriorities = ['hot', 'warm', 'cold', 'not interested', 'not eligible'];
          if (!validPriorities.includes(finalPriority.toLowerCase())) {
            finalPriority = null;
          }
        }

        // Add to batch insert array
        validLeads.push({
          name,
          phone_number: phoneNumber,
          phone_country_code: phoneCountryCode || '+91',
          whatsapp_number: (whatsappNumber && whatsappNumber !== '-' && whatsappNumber.trim().length > 0) ? whatsappNumber : null,
          whatsapp_country_code: whatsappCountryCode || '+91',
          email: email || null,
          age: age || null,
          occupation: occupation || null,
          qualification: qualification || null,
          year_of_experience: yearOfExperience || null,
          country: country || null,
          program: program || null,
          status,
          priority: finalPriority,
          comment: comment || null,
          follow_up_date: followUpDate || null,
          follow_up_status: followUpStatus || 'Pending',
          assigned_staff_id: finalAssignedStaffId,
          source: source || null,
          ielts_score: ieltsScore || null,
          created_by: userId,
          created_at: now,
          updated_at: now,
          secondary_phone_number: secondaryPhoneNumber,
        });
      } catch (error) {
        results.errors++;
        results.errorRows.push({
          row: i + 1,
          message: error.message || 'Error processing row',
        });
      }
    }

    // Batch insert all valid leads using multi-row INSERT (EXTREMELY FAST)
    if (validLeads.length > 0) {
      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');

        // Maximum parameters per query is 65535 in Postgres
        // Each lead has 24 fields. 65535 / 24 approx 2700 leads per batch.
        const BATCH_SIZE = 500;
        for (let i = 0; i < validLeads.length; i += BATCH_SIZE) {
          const batch = validLeads.slice(i, i + BATCH_SIZE);
          const placeholders = [];
          const flatValues = [];
          let paramIdx = 1;

          batch.forEach((lead, rowIdx) => {
            const rowPlaceholders = [];
            [
              lead.name, lead.phone_number, lead.phone_country_code, lead.whatsapp_number, lead.whatsapp_country_code,
              lead.email, lead.age, lead.occupation, lead.qualification, lead.year_of_experience, lead.country, lead.program,
              lead.status, lead.priority, lead.comment, lead.follow_up_date, lead.follow_up_status,
              lead.assigned_staff_id, lead.source, lead.ielts_score, lead.created_by, lead.created_at, lead.updated_at, lead.secondary_phone_number
            ].forEach(val => {
              rowPlaceholders.push(`$${paramIdx++}`);
              flatValues.push(val);
            });
            placeholders.push(`(${rowPlaceholders.join(', ')})`);
          });

          const queryText = `
            INSERT INTO leads (
              name, phone_number, phone_country_code, whatsapp_number, whatsapp_country_code,
              email, age, occupation, qualification, year_of_experience, country, program,
              status, priority, comment, follow_up_date, follow_up_status,
              assigned_staff_id, source, ielts_score, created_by, created_at, updated_at, secondary_phone_number
            ) VALUES ${placeholders.join(', ')}
          `;

          await client.query(queryText, flatValues);
        }

        await client.query('COMMIT');
        results.created = validLeads.length;
        console.log(`✅ Bulk import: Created ${results.created} leads in optimized batch inserts`);
      } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Batch insert error:', error);
        results.errors += validLeads.length;
        results.errorRows.push({
          row: 'batch',
          message: error.message || 'Batch insert failed',
        });
      } finally {
        client.release();
      }
    }

    res.json({
      success: true,
      ...results,
    });
  } catch (error) {
    console.error('Bulk import error:', error);
    res.status(500).json({
      error: 'Server error',
      details: error.message
    });
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
