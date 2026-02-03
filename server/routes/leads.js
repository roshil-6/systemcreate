const express = require('express');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const XLSX = require('xlsx');
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
    const { status, search } = req.query;

    const filter = {};

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

    // Apply role-based filtering
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

    // If multiple accessible users, filter leads
    if (accessibleUserIds && accessibleUserIds.length > 1) {
      leads = leads.filter(lead =>
        !lead.assigned_staff_id || accessibleUserIds.includes(lead.assigned_staff_id)
      );
    }

    // CRITICAL: Filter out "Registration Completed" leads - they should not appear in leads list
    // They are now clients and should be in the clients section
    leads = leads.filter(lead => lead.status !== 'Registration Completed');

    // Add assigned staff name
    const leadsWithNames = await Promise.all(leads.map(async lead => {
      let assignedStaffName = null;
      if (lead.assigned_staff_id) {
        try {
          assignedStaffName = await db.getUserName(lead.assigned_staff_id);
        } catch (error) {
          console.error('Error getting assigned staff name:', error);
        }
      }
      return {
        ...lead,
        assigned_staff_name: assignedStaffName,
      };
    }));
    leads = leadsWithNames;

    res.json(leads);
  } catch (error) {
    console.error('Get leads error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
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

      await db.updateLead(leadId, { assigned_staff_id: staffId });
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
        status = 'New',
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
      if (leadOwnerId !== userId) {
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

        // For non-admin roles, verify they own the lead before transferring
        if (role !== 'ADMIN') {
          const leadOwnerId = existingLead.assigned_staff_id ? Number(existingLead.assigned_staff_id) : null;

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
            const teamMembers = await db.getUsers({ managed_by: userId, id: normalizedStaffId });
            if (normalizedStaffId !== userId && teamMembers.length === 0) {
              return res.status(400).json({ error: 'Can only transfer to yourself or your team members' });
            }
          } else {
            // Regular staff can only transfer their own leads
            if (leadOwnerId !== userId) {
              return res.status(403).json({ error: 'You can only transfer leads assigned to you' });
            }
            // Regular staff can transfer to any non-admin staff member
            // (No additional restriction - already validated targetUser is not admin above)
          }
        }
      }

      // Create notification if assignment changed (including from null/unassigned to assigned)
      const existingStaffId = existingLead.assigned_staff_id ? Number(existingLead.assigned_staff_id) : null;
      if (normalizedStaffId && existingStaffId !== normalizedStaffId) {
        const assignedUsers = await db.getUsers({ id: normalizedStaffId });
        const assignedUser = assignedUsers[0];
        if (assignedUser) {
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

    // Add author names
    const commentsWithAuthorsPromises = comments.map(async comment => ({
      ...comment,
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
      author_id: userId,
      text: text.trim(),
    });

    // Add author name
    const commentWithAuthor = {
      ...comment,
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
        headerValues = jsonData[0].map(h => String(h || '').trim()).filter(h => h.length > 0);

        // Convert remaining rows to CSV-like format for processing
        lines = [headerValues.join(',')]; // Header line
        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i].map(cell => {
            const value = String(cell || '').trim();
            // Escape commas and quotes in CSV format
            if (value.includes(',') || value.includes('"') || value.includes('\n')) {
              return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
          });
          lines.push(row.join(','));
        }

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
      // Parse CSV - handle different encodings and line endings
      let csvText;
      try {
        // Try UTF-8 first, fallback to other encodings if needed
        csvText = req.file.buffer.toString('utf-8');

        // Remove BOM if present (common in Excel exports)
        if (csvText.charCodeAt(0) === 0xFEFF) {
          csvText = csvText.slice(1);
        }

        console.log('✅ CSV file read, length:', csvText.length, 'bytes');
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

      // Split by lines and filter out completely empty lines (but keep lines with just commas)
      lines = csvText.split('\n').filter(line => line.trim() || line.includes(','));
      console.log('📊 CSV lines found:', lines.length);

      if (lines.length < 2) {
        console.error('❌ Bulk import: CSV file too short, only', lines.length, 'lines');
        return res.status(400).json({
          error: 'CSV file must contain at least a header row and one data row',
          details: `Found ${lines.length} line(s). Need at least 2 lines (header + data).`
        });
      }
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

    // Parse header - handle various CSV formats with proper CSV parsing
    let headerLine = lines[0];
    // Remove any remaining BOM or special characters
    headerLine = headerLine.replace(/^\uFEFF/, '').trim();

    // If headerValues not already set (from Excel), parse from CSV line
    if (headerValues.length === 0) {
      headerValues = parseCSVLine(headerLine);
    }
    // Normalize headers: trim, lowercase, remove quotes, replace spaces with underscores
    // BUT keep it simple - don't remove too many characters
    const headers = headerValues.map(h => {
      return h.trim()
        .toLowerCase()
        .replace(/^["']+|["']+$/g, '') // Remove surrounding quotes
        .replace(/\s+/g, '_') // Replace spaces with underscores
        .replace(/[^\w_-]/g, ''); // Remove special characters except underscore and dash
    }).filter(h => h.length > 0); // Remove empty headers

    console.log('📋 Raw header line:', headerLine);
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
      // Meta Ads fields that can go into comment: Ad Name, Campaign Name, Form Name, etc.
      comment: ['comment', 'notes', 'note', 'remarks', 'ad name', 'campaign name', 'form name', 'ad_name', 'campaign_name', 'form_name', 'ad_name', 'campaign_name', 'form_name'],
      follow_up_date: ['follow_up_date', 'followup_date', 'follow_up', 'next_followup', 'created time', 'created_time', 'created date', 'created_date'],
      follow_up_status: ['follow_up_status', 'followup_status', 'follow_up_status'],
      assigned_staff: ['assigned_staff', 'assigned_to', 'staff', 'assigned_staff_id'],
      // Meta Ads source fields
      source: ['source', 'lead_source', 'lead source', 'ad name', 'campaign name', 'ad_name', 'campaign_name', 'form name', 'form_name'],
      ielts_score: ['ielts_score', 'ielts', 'ielts_band', 'ielts score'],
    };

    // Find column indices for each field (ULTRA AGGRESSIVE matching)
    const findColumnIndex = (fieldNames) => {
      for (const fieldName of fieldNames) {
        const fieldLower = fieldName.toLowerCase().trim();

        // Strategy 1: Exact match (headers are already lowercase)
        let index = headers.findIndex(h => h === fieldLower);
        if (index !== -1) {
          console.log(`✅ Found "${fieldName}" → "${headers[index]}" (exact match)`);
          return index;
        }

        // Strategy 2: Exact match with original header values (case-insensitive)
        index = headerValues.findIndex((h, idx) => {
          const normalized = h.trim().toLowerCase().replace(/^["']+|["']+$/g, '').replace(/\s+/g, '_').replace(/[^\w_-]/g, '');
          return normalized === fieldLower;
        });
        if (index !== -1) {
          console.log(`✅ Found "${fieldName}" → "${headerValues[index]}" (exact from original)`);
          return index;
        }

        // Strategy 3: Starts with match (phone matches phone_number, but not vice versa)
        index = headers.findIndex(h => h.startsWith(fieldLower));
        if (index !== -1) {
          console.log(`✅ Found "${fieldName}" → "${headers[index]}" (starts with)`);
          return index;
        }

        // Strategy 4: Contains match (header contains field - phone_number contains phone)
        index = headers.findIndex(h => h.includes(fieldLower));
        if (index !== -1) {
          console.log(`✅ Found "${fieldName}" → "${headers[index]}" (contains)`);
          return index;
        }

        // Strategy 5: Match without underscores/spaces/dashes
        const fieldNormalized = fieldLower.replace(/[_\s-]/g, '');
        index = headers.findIndex(h => {
          const hNormalized = h.replace(/[_\s-]/g, '');
          return hNormalized === fieldNormalized;
        });
        if (index !== -1) {
          console.log(`✅ Found "${fieldName}" → "${headers[index]}" (normalized)`);
          return index;
        }

        // Strategy 6: Substring match (normalized - phone matches phone_number)
        index = headers.findIndex(h => {
          const hNormalized = h.replace(/[_\s-]/g, '');
          return hNormalized.includes(fieldNormalized) || fieldNormalized.includes(hNormalized);
        });
        if (index !== -1) {
          console.log(`✅ Found "${fieldName}" → "${headers[index]}" (substring normalized)`);
          return index;
        }

        // Strategy 7: Try matching against original header values directly (case-insensitive)
        index = headerValues.findIndex(h => {
          const hLower = h.trim().toLowerCase().replace(/^["']+|["']+$/g, '');
          return hLower === fieldLower || hLower.includes(fieldLower) || fieldLower.includes(hLower);
        });
        if (index !== -1) {
          console.log(`✅ Found "${fieldName}" → "${headerValues[index]}" (direct original match)`);
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

    // DIRECT FALLBACK: Check original headers if normalized matching fails
    const findDirectIndex = (searchTerms) => {
      for (const term of searchTerms) {
        const termLower = term.toLowerCase();
        // Check normalized headers
        let idx = headers.findIndex(h => h === termLower || h.includes(termLower) || termLower.includes(h));
        if (idx !== -1) return idx;
        // Check original headers
        idx = headerValues.findIndex(h => {
          const hNorm = h.trim().toLowerCase().replace(/[^\w]/g, '_');
          return hNorm === termLower || hNorm.includes(termLower) || termLower.includes(hNorm);
        });
        if (idx !== -1) return idx;
      }
      return -1;
    };

    // NUCLEAR OPTION: Keyword-based search as last resort - ULTRA AGGRESSIVE
    const findKeywordIndex = (keywords) => {
      for (const keyword of keywords) {
        const keywordLower = keyword.toLowerCase().replace(/[_\s-]/g, '');
        // Search in original headers - try multiple variations
        const idx = headerValues.findIndex((h, i) => {
          const hLower = h.toLowerCase().replace(/[_\s-]/g, '');
          const hOriginal = h.toLowerCase();

          // Try exact match (normalized)
          if (hLower === keywordLower) return true;

          // Try contains match (normalized)
          if (hLower.includes(keywordLower) || keywordLower.includes(hLower)) return true;

          // Try original with underscores/spaces
          if (hOriginal.includes(keywordLower) || keywordLower.includes(hOriginal.replace(/[_\s-]/g, ''))) return true;

          // Try partial match - "first" matches "first_name"
          const keywordParts = keywordLower.split('_');
          if (keywordParts.length > 0) {
            const mainKeyword = keywordParts[0];
            if (hLower.includes(mainKeyword) && mainKeyword.length >= 3) return true;
          }

          return false;
        });
        if (idx !== -1) {
          console.log(`✅ Found via keyword search: "${keyword}" → "${headerValues[idx]}"`);
          return idx;
        }
      }
      return -1;
    };

    // SIMPLE DIRECT CHECK: Search original header values directly (case-insensitive)
    // This is the most reliable method for common column names
    const findSimpleIndex = (searchTerms) => {
      for (const term of searchTerms) {
        const termLower = term.toLowerCase().trim();
        // Check original header values directly with multiple strategies
        const idx = headerValues.findIndex((h, i) => {
          // Remove quotes and trim
          const hClean = h.trim().replace(/^["']+|["']+$/g, '');
          const hLower = hClean.toLowerCase();

          // Strategy 1: Exact match
          if (hLower === termLower) return true;

          // Strategy 2: Match without special characters
          const hNormalized = hLower.replace(/[^\w]/g, '_');
          const termNormalized = termLower.replace(/[^\w]/g, '_');
          if (hNormalized === termNormalized) return true;

          // Strategy 3: Match without underscores/spaces
          const hNoUnderscore = hLower.replace(/[_\s-]/g, '');
          const termNoUnderscore = termLower.replace(/[_\s-]/g, '');
          if (hNoUnderscore === termNoUnderscore) return true;

          // Strategy 4: Contains match (bidirectional)
          if (hLower.includes(termLower) || termLower.includes(hLower)) return true;

          // Strategy 5: Check normalized headers too
          if (i < headers.length && headers[i]) {
            const normHeader = headers[i].toLowerCase();
            if (normHeader === termLower ||
              normHeader.includes(termLower) ||
              termLower.includes(normHeader)) return true;
          }

          return false;
        });
        if (idx !== -1) {
          console.log(`✅ Simple direct match: "${term}" → "${headerValues[idx]}" (index: ${idx})`);
          return idx;
        }
      }
      return -1;
    };

    // Check for name (either 'name' OR 'first_name' + 'last_name')
    // START WITH SIMPLE DIRECT CHECK FIRST (most reliable for common column names)
    let nameIndex = findSimpleIndex(['name', 'full_name', 'fullname']);
    let firstNameIndex = findSimpleIndex(['first_name', 'firstname', 'fname']);
    let lastNameIndex = findSimpleIndex(['last_name', 'lastname', 'lname', 'surname']);

    // Then try the complex matching if simple check failed
    if (nameIndex === -1) nameIndex = findColumnIndex(columnMapping.name);
    if (firstNameIndex === -1) firstNameIndex = findColumnIndex(columnMapping.first_name);
    if (lastNameIndex === -1) lastNameIndex = findColumnIndex(columnMapping.last_name);

    // Fallback to direct search if matching failed
    if (nameIndex === -1) nameIndex = findDirectIndex(columnMapping.name);
    if (firstNameIndex === -1) firstNameIndex = findDirectIndex(columnMapping.first_name);
    if (lastNameIndex === -1) lastNameIndex = findDirectIndex(columnMapping.last_name);

    // NUCLEAR FALLBACK: Keyword search
    if (nameIndex === -1) nameIndex = findKeywordIndex(['name', 'fullname', 'full_name']);
    if (firstNameIndex === -1) firstNameIndex = findKeywordIndex(['first', 'fname', 'firstname']);
    if (lastNameIndex === -1) lastNameIndex = findKeywordIndex(['last', 'lname', 'lastname', 'surname']);

    const hasName = nameIndex !== -1 || (firstNameIndex !== -1 && lastNameIndex !== -1);

    console.log('🔍 Name column check:', {
      nameIndex,
      firstNameIndex,
      lastNameIndex,
      hasName
    });

    // Check for phone - try multiple variations
    // START WITH SIMPLE DIRECT CHECK FIRST (most reliable for common column names)
    let phoneIndex = findSimpleIndex(['phone', 'phone_number', 'mobile', 'mobile_number', 'contact_number', 'phone_no']);

    // Then try the complex matching if simple check failed
    if (phoneIndex === -1) phoneIndex = findColumnIndex(columnMapping.phone_number);

    // Fallback to direct search if matching failed
    if (phoneIndex === -1) phoneIndex = findDirectIndex(columnMapping.phone_number);

    // NUCLEAR FALLBACK: Keyword search
    if (phoneIndex === -1) phoneIndex = findKeywordIndex(['phone', 'mobile', 'contact', 'tel', 'number']);

    const hasPhone = phoneIndex !== -1;

    console.log('🔍 Phone column check:', {
      phoneIndex,
      hasPhone,
      searchedFor: columnMapping.phone_number
    });

    if (!hasName) {
      console.error('❌ Bulk import: Missing name column');
      console.error('   Available normalized headers:', headers);
      console.error('   Available original headers:', headerValues);
      console.error('   Searched for name:', columnMapping.name);
      console.error('   Searched for first_name:', columnMapping.first_name);
      console.error('   Searched for last_name:', columnMapping.last_name);
      console.error('   nameIndex:', nameIndex, 'firstNameIndex:', firstNameIndex, 'lastNameIndex:', lastNameIndex);
      return res.status(400).json({
        error: 'Missing required columns: name, phone_number',
        details: `Found columns: ${headerValues.join(', ')}. Required: name OR (first_name + last_name), and phone_number OR phone`,
        availableColumns: headerValues // Return original headers for user reference
      });
    }

    if (!hasPhone) {
      console.error('❌ Bulk import: Missing phone column');
      console.error('   Available normalized headers:', headers);
      console.error('   Available original headers:', headerValues);
      console.error('   Searched for phone:', columnMapping.phone_number);
      console.error('   phoneIndex:', phoneIndex);
      return res.status(400).json({
        error: 'Missing required columns: name, phone_number',
        details: `Found columns: ${headerValues.join(', ')}. Required: phone_number, phone, or mobile`,
        availableColumns: headerValues // Return original headers for user reference
      });
    }

    // Map all column indices
    // Also detect Meta Ads specific columns
    const metaAdsColumns = {
      ad_name: findSimpleIndex(['ad name', 'ad_name', 'adname']),
      campaign_name: findSimpleIndex(['campaign name', 'campaign_name', 'campaignname']),
      form_name: findSimpleIndex(['form name', 'form_name', 'formname']),
      lead_id: findSimpleIndex(['lead id', 'lead_id', 'leadid', 'id']),
      created_time: findSimpleIndex(['created time', 'created_time', 'created date', 'created_date', 'date', 'timestamp']),
    };

    const columnIndices = {
      name: nameIndex,
      first_name: firstNameIndex,
      last_name: lastNameIndex,
      phone_number: phoneIndex,
      phone_country_code: findColumnIndex(columnMapping.phone_country_code),
      whatsapp_number: findColumnIndex(columnMapping.whatsapp_number),
      whatsapp_country_code: findColumnIndex(columnMapping.whatsapp_country_code),
      email: findColumnIndex(columnMapping.email),
      age: findColumnIndex(columnMapping.age),
      occupation: findColumnIndex(columnMapping.occupation),
      qualification: findColumnIndex(columnMapping.qualification),
      year_of_experience: findColumnIndex(columnMapping.year_of_experience),
      country: findColumnIndex(columnMapping.country),
      program: findColumnIndex(columnMapping.program),
      status: findColumnIndex(columnMapping.status),
      priority: findColumnIndex(columnMapping.priority),
      comment: findColumnIndex(columnMapping.comment),
      follow_up_date: findColumnIndex(columnMapping.follow_up_date),
      follow_up_status: findColumnIndex(columnMapping.follow_up_status),
      assigned_staff: findColumnIndex(columnMapping.assigned_staff),
      source: findColumnIndex(columnMapping.source),
      ielts_score: findColumnIndex(columnMapping.ielts_score),
      // Meta Ads specific columns
      meta_ad_name: metaAdsColumns.ad_name,
      meta_campaign_name: metaAdsColumns.campaign_name,
      meta_form_name: metaAdsColumns.form_name,
      meta_lead_id: metaAdsColumns.lead_id,
      meta_created_time: metaAdsColumns.created_time,
    };

    console.log('✅ Column mapping successful:', {
      name: columnIndices.name !== -1 ? 'found' : (columnIndices.first_name !== -1 && columnIndices.last_name !== -1 ? 'first_name + last_name' : 'missing'),
      phone: columnIndices.phone_number !== -1 ? 'found' : 'missing',
      email: columnIndices.email !== -1 ? 'found' : 'missing',
    });

    // Get all existing leads for duplicate checking (PostgreSQL)
    const existingLeads = await db.getLeads();
    const existingPhones = new Set(existingLeads.map(l => l.phone_number?.toLowerCase()));
    const existingEmails = new Set(existingLeads.filter(l => l.email).map(l => l.email.toLowerCase()));

    const results = {
      total: lines.length - 1,
      created: 0,
      skipped: 0,
      errors: 0,
      errorRows: [],
    };

    // Collect valid leads for batch insert
    const validLeads = [];
    const now = new Date().toISOString();
    const assignedStaffId = (role === 'ADMIN') ? null : userId;

    // Process each row
    for (let i = 1; i < lines.length; i++) {
      let line = lines[i].trim();
      // Skip completely empty lines, but process lines with commas (even if mostly empty)
      if (!line && !lines[i].includes(',')) continue;

      // If line is empty but has commas, keep it (might be a row with empty values)
      if (!line && lines[i].includes(',')) {
        line = lines[i];
      }

      try {
        // Parse CSV row using the same parser function (handle quoted values)
        const values = parseCSVLine(line);

        // Ensure we have enough values (pad with empty strings if needed)
        while (values.length < headers.length) {
          values.push('');
        }

        // Map values using column indices
        const getValue = (index) => {
          if (index === -1 || index >= values.length) return '';
          return values[index]?.trim() || '';
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

        // If phone number starts with +, extract country code
        if (phoneNumber && phoneNumber.startsWith('+') && !phoneCountryCode) {
          // Try to extract country code (common formats: +91, +971, +1, etc.)
          const match = phoneNumber.match(/^(\+\d{1,3})(.+)$/);
          if (match) {
            phoneCountryCode = match[1]; // e.g., +91
            phoneNumber = match[2].trim(); // e.g., 9876543210
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

        // Build source from Meta Ads fields or use provided source
        if (!source && (metaAdName || metaCampaignName || metaFormName)) {
          const metaParts = [];
          if (metaCampaignName) metaParts.push(`Campaign: ${metaCampaignName}`);
          if (metaAdName) metaParts.push(`Ad: ${metaAdName}`);
          if (metaFormName) metaParts.push(`Form: ${metaFormName}`);
          source = metaParts.join(' | ');
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

        const followUpDate = getValue(columnIndices.follow_up_date) || metaCreatedTime; // Use Meta created time if no follow_up_date
        const followUpStatus = getValue(columnIndices.follow_up_status) || 'Pending';
        const whatsappNumber = getValue(columnIndices.whatsapp_number);
        const whatsappCountryCode = getValue(columnIndices.whatsapp_country_code);

        // Handle assigned_staff - can be name or ID
        let finalAssignedStaffId = assignedStaffId; // Default to current user or null for admin
        const assignedStaffValue = getValue(columnIndices.assigned_staff);
        if (assignedStaffValue && role === 'ADMIN') {
          // Try to find user by name (case-insensitive)
          const allUsers = await db.getUsers();
          const matchedUser = allUsers.find(u =>
            u.name.toLowerCase() === assignedStaffValue.toLowerCase() ||
            u.email.toLowerCase() === assignedStaffValue.toLowerCase()
          );
          if (matchedUser) {
            finalAssignedStaffId = matchedUser.id;
            console.log(`✅ Found staff "${assignedStaffValue}" → ID: ${matchedUser.id}`);
          } else {
            console.log(`⚠️ Staff "${assignedStaffValue}" not found, lead will be unassigned`);
          }
        }

        // Validate required fields

        if (!name || !phoneNumber) {
          results.errors++;
          results.errorRows.push({
            row: i + 1,
            message: 'Missing required fields: name or phone_number',
          });
          continue;
        }

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
          status = 'New';
        } else {
          // Normalize status values
          const statusLower = status.toLowerCase();
          if (statusLower.includes('new') || statusLower.includes('pending')) {
            status = 'New';
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
            const validStatuses = ['New', 'Follow-up', 'Prospect', 'Pending Lead', 'Not Eligible', 'Not Interested', 'Registration Completed'];
            if (!validStatuses.includes(status)) {
              status = 'New'; // Default to New if unknown
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
          whatsapp_number: whatsappNumber || null,
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
        });
      } catch (error) {
        results.errors++;
        results.errorRows.push({
          row: i + 1,
          message: error.message || 'Error processing row',
        });
      }
    }

    // Batch insert all valid leads using PostgreSQL transaction
    if (validLeads.length > 0) {
      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');

        // Insert leads one by one in transaction
        // Note: We let PostgreSQL auto-generate IDs using the sequence
        for (const lead of validLeads) {
          try {
            await client.query(`
              INSERT INTO leads (
                name, phone_number, phone_country_code, whatsapp_number, whatsapp_country_code,
                email, age, occupation, qualification, year_of_experience, country, program,
                status, priority, comment, follow_up_date, follow_up_status,
                assigned_staff_id, source, ielts_score, created_by, created_at, updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
            `, [
              lead.name,
              lead.phone_number || '',
              lead.phone_country_code || '+91',
              lead.whatsapp_number || null,
              lead.whatsapp_country_code || '+91',
              lead.email || null,
              lead.age || null,
              lead.occupation || null,
              lead.qualification || null,
              lead.year_of_experience || null,
              lead.country || null,
              lead.program || null,
              lead.status || 'New',
              lead.priority || null,
              lead.comment || null,
              lead.follow_up_date || null,
              lead.follow_up_status || 'Pending',
              lead.assigned_staff_id || null,
              lead.source || null,
              lead.ielts_score || null,
              lead.created_by || null,
              lead.created_at || new Date().toISOString(),
              lead.updated_at || new Date().toISOString()
            ]);

            // Update duplicate check sets
            existingPhones.add(lead.phone_number.toLowerCase());
            if (lead.email) {
              existingEmails.add(lead.email.toLowerCase());
            }
          } catch (leadError) {
            console.error(`❌ Error inserting lead ${lead.name}:`, leadError.message);
            results.errors++;
            results.errorRows.push({
              row: 'batch',
              message: `Error inserting ${lead.name}: ${leadError.message}`,
            });
          }
        }

        await client.query('COMMIT');
        results.created = validLeads.length - results.errors;
        console.log(`✅ Bulk import: Created ${results.created} leads in batch transaction`);
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

module.exports = router;
