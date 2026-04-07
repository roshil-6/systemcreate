const express = require('express');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const XLSX = require('xlsx');
const iconv = require('iconv-lite');
const db = require('../config/database');
const { authenticate, requireAdmin } = require('../middleware/auth');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// Staff who hold ADMIN role but are also assignable processing/sales members
const PROCESSING_ADMIN_EMAILS = ['sneha@toniosenora.com', 'kripa@toniosenora.com'];

/** ADMIN emails that still appear in assign/transfer lists and may receive lead assignments (in addition to assignable_for_leads and Sneha/Kripa rules). */
const ASSIGNABLE_LEAD_ADMIN_EMAILS = ['sreelakshmi@toniosenora.com'];

// Returns true if user is Sneha or Kripa (processing staff who may hold ADMIN role)
function isProcessingAdmin(u) {
  if (!u) return false;
  const email = (u.email || '').toLowerCase();
  const name  = (u.name  || '').toLowerCase();
  return PROCESSING_ADMIN_EMAILS.includes(email) ||
         name.includes('sneha') ||
         name.includes('kripa');
}

/** Admins who can still appear in assign lists and receive lead assignments (promoted staff, etc.) */
function isAssignableLeadTarget(u) {
  if (!u) return false;
  if (u.assignable_for_leads === true) return true;
  const email = (u.email || '').toLowerCase();
  if (ASSIGNABLE_LEAD_ADMIN_EMAILS.includes(email)) return true;
  return isProcessingAdmin(u);
}

/** Another lead (not excludeLeadId) with same digits on phone, WhatsApp, or secondary (min 7 digits). */
async function findOtherLeadWithPhoneDigits(excludeLeadId, digits) {
  if (!digits || String(digits).length < 7) return null;
  const r = await db.query(
    `SELECT id, name, status FROM leads WHERE deleted_at IS NULL AND id != $1 AND (
      regexp_replace(COALESCE(phone_number,''), '\\D', '', 'g') = $2
      OR regexp_replace(COALESCE(whatsapp_number,''), '\\D', '', 'g') = $2
      OR regexp_replace(COALESCE(secondary_phone_number,''), '\\D', '', 'g') = $2
    ) LIMIT 1`,
    [excludeLeadId, String(digits)]
  );
  return r.rows[0] || null;
}

async function findOtherLeadWithEmail(excludeLeadId, emailLowerTrimmed) {
  if (!emailLowerTrimmed || !String(emailLowerTrimmed).trim()) return null;
  const r = await db.query(
    `SELECT id, name, status FROM leads WHERE deleted_at IS NULL AND id != $1 AND LOWER(TRIM(email)) = $2 LIMIT 1`,
    [excludeLeadId, String(emailLowerTrimmed).trim().toLowerCase()]
  );
  return r.rows[0] || null;
}

/**
 * Robust permission check for single lead access.
 * Returns the lead object if access is granted, null otherwise.
 */
async function getLeadWithAccessCheck(leadId, user) {
  const userId = user.id;
  const role = user.role;

  // 1. Fetch the lead by ID only (no restrictive filter yet)
  const leads = await db.getLeads({ id: leadId });
  const lead = leads[0];

  if (!lead) return null;
  const leadAssignedUserId = lead.assigned_staff_id !== null && lead.assigned_staff_id !== undefined
    ? Number(lead.assigned_staff_id)
    : null;

  // 2. CRITICAL: Filter out "Registration Completed" leads - they are now clients
  // (unless role is ADMIN/PROCESSING who might need to see them, but typically they go to Client route)
  if (lead.status === 'Registration Completed' && role !== 'ADMIN' && role !== 'PROCESSING' && role !== 'HR') {
    return null;
  }

  // High-priority: Strict isolation for specific users regardless of role
  const userName = user.name || '';
  const userEmail = user.email || '';
  const restrictedNames = ['Sneha', 'SNEHA', 'Kripa', 'KRIPA', 'Emy', 'EMY', 'Shilpa', 'SHILPA', 'Jibna', 'JIBNA', 'Karthika', 'KARTHIKA', 'Asna', 'ASNA'];
  const restrictedEmails = ['sneha@toniosenora.com', 'kripa@toniosenora.com', 'emy@toniosenora.com', 'shilpa@toniosenora.com', 'jibna@toniosenora.com', 'karthika@toniosenora.com', 'asna@toniosenora.com'];
  const isTargetedUser = restrictedNames.includes(userName) || restrictedEmails.includes(userEmail);

  // 3. Permission logic
  if (!isTargetedUser && (role === 'ADMIN' || role === 'PROCESSING')) {
    return lead; // Full access for regular Admin and Processing
  }

  if (role === 'STAFF') {
    if (leadAssignedUserId === Number(userId)) return lead;
    return null;
  }

  if (role === 'PROCESSING') {
    // Processing staff (Sneha, Kripa) can access leads assigned to them
    if (leadAssignedUserId === Number(userId)) return lead;
    return null;
  }

  if (role === 'HR') {
    // HR should only access leads assigned to themselves
    if (leadAssignedUserId === Number(userId)) return lead;
    return null;
  }

  if (role === 'SALES_TEAM_HEAD') {
    // Heads can see leads assigned to self, unassigned leads, or leads assigned to their team
    if (leadAssignedUserId === Number(userId) || leadAssignedUserId === null) return lead;

    const teamMembers = await db.getUsers({ managed_by: userId });
    const teamMemberIds = teamMembers.map(u => Number(u.id));
    if (teamMemberIds.includes(leadAssignedUserId)) return lead;

    return null;
  }

  if (role === 'SALES_TEAM') {
    // Current owner
    if (leadAssignedUserId === Number(userId)) return lead;

    // Original creator
    if (lead.created_by === userId) return lead;

    // Historically handled (assigned it to someone else)
    const assignmentNotif = await db.query(
      "SELECT 1 FROM notifications WHERE type = 'lead_assigned' AND lead_id = $1 AND created_by = $2 LIMIT 1",
      [lead.id, userId]
    );
    if (assignmentNotif.rows.length > 0) return lead;

    return null;
  }

  return null;
}

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



// Get all leads (with role-based filtering and pagination)
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;
    const { status, search, phone, assigned_staff_id, viewType, limit, offset, created_from, created_to, created_month, created_on, updated_from, updated_to, sort, follow_up_date, follow_up_overdue, created_today, lead_source_type, name_starts, priority } = req.query;

    const filter = {
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
      viewType: viewType || undefined
    };


    // High-priority: Strict isolation for specific users regardless of role
    const userName = req.user.name || '';
    const userEmail = req.user.email || '';
    const restrictedNames = ['Sneha', 'SNEHA', 'SNEHA RIGIN', 'Kripa', 'KRIPA', 'Emy', 'EMY', 'Shilpa', 'SHILPA', 'Jibna', 'JIBNA', 'Jibina', 'JIBINA', 'Karthika', 'KARTHIKA', 'Asna', 'ASNA'];
    const restrictedEmails = ['sneha@toniosenora.com', 'kripa@toniosenora.com', 'emy@toniosenora.com', 'shilpa@toniosenora.com', 'jibna@toniosenora.com', 'jibina@toniosenora.com', 'karthika@toniosenora.com', 'asna@toniosenora.com'];
    const restrictedUserIds = [12, 13, 4, 5, 8, 7, 6]; // Sneha(12), Kripa(13), Emy(4), Shilpa(5), Jibina(8), Karthika(7), Asna(6)

    const isTargetedUser = restrictedNames.some(n => userName.toUpperCase().startsWith(n.toUpperCase())) || restrictedEmails.includes(userEmail.toLowerCase()) || restrictedUserIds.includes(userId);

    // Determine accessible user IDs based on role
    let accessibleUserIds = null;

    if (isTargetedUser || role === 'SALES_TEAM' || role === 'STAFF' || role === 'PROCESSING' || role === 'HR') {
      accessibleUserIds = [userId];
      delete filter.assigned_staff_id;
      delete filter.assigned_staff_ids;
    } else if (role === 'SALES_TEAM_HEAD') {
      // SALES_TEAM_HEAD sees themselves and their team
      const teamMembers = await db.getUsers({ managed_by: userId });
      accessibleUserIds = [userId, ...teamMembers.map(m => m.id)];
    } else {
      // ADMIN sees everyone (if they are NOT one of the targeted users above)
      // Honour the assigned_staff_id query param for filtering by staff
      if (assigned_staff_id) {
        filter.assigned_staff_id = assigned_staff_id;
      }
      accessibleUserIds = null;
    }

    if (accessibleUserIds && accessibleUserIds.length > 1) {
      filter.assigned_staff_ids = accessibleUserIds;
    } else if (accessibleUserIds && accessibleUserIds.length === 1) {
      filter.assigned_staff_id = accessibleUserIds[0];
    }

    // Quick view "new" = New/Unassigned/Direct Lead only. After assignment, leads become status "Assigned",
    // so HR/staff/sales see an empty list and think routing failed. Ignore "new" for single-bucket list users.
    const singleBucketAssignee =
      accessibleUserIds && accessibleUserIds.length === 1 &&
      (role === 'HR' || role === 'STAFF' || role === 'PROCESSING' || role === 'SALES_TEAM' || isTargetedUser);
    if (singleBucketAssignee && filter.viewType === 'new') {
      delete filter.viewType;
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
    if (name_starts && String(name_starts).trim()) {
      filter.name_starts = String(name_starts).trim();
    }
    if (created_on) {
      filter.created_on = created_on;
    } else if (created_month && /^\d{4}-\d{2}$/.test(String(created_month).trim())) {
      filter.created_month = String(created_month).trim();
    } else {
      if (created_from) filter.created_from = created_from;
      if (created_to) filter.created_to = created_to;
    }
    if (updated_from) filter.updated_from = updated_from;
    if (updated_to) filter.updated_to = updated_to;
    if (sort) filter.sort = sort;
    if (follow_up_date) filter.follow_up_date = follow_up_date;
    if (follow_up_overdue === 'true' || follow_up_overdue === true) filter.follow_up_overdue = true;
    if (created_today === 'true' || created_today === true) filter.created_today = true;
    if (lead_source_type) filter.lead_source_type = lead_source_type;
    if (priority && String(priority).trim()) filter.priority = String(priority).trim();

    // Performance: Only filter out Registration Completed at database level when not explicitly requested
    if (!status) {
      filter.excludeStatus = 'Registration Completed';
    }

    const leadsRaw = await db.getLeads(filter);
    const totalCount = leadsRaw.length > 0 ? parseInt(leadsRaw[0].full_count) : 0;

    // OPTIMIZATION: Fetch all users once and create a lookup map (keyed by string for safe access)
    let userMap = {};
    try {
      const allUsers = await db.getUsers();
      allUsers.forEach(u => {
        userMap[String(u.id)] = u.name;
      });
    } catch (error) {
      console.error('Optimization warning: Failed to fetch users for lookup, falling back to null names', error);
    }

    const leads = leadsRaw.map(lead => ({
      ...lead,
      assigned_staff_name: lead.assigned_staff_id ? (userMap[String(lead.assigned_staff_id)] || null) : null,
      full_count: undefined
    }));

    // Response includes leads and the real total count from database
    res.json({
      leads,
      totalCount
    });
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

    // Only real company staff — exclude pure admins unless flagged assignable (or Sneha/Kripa).
    const isRealStaff = (u) =>
      u.email && u.email.endsWith('@toniosenora.com') &&
      (u.role !== 'ADMIN' || isAssignableLeadTarget(u));

    // Admin and HR can assign to any real staff
    if (role === 'ADMIN' || role === 'HR') {
      const allUsers = await db.getUsers();
      users = allUsers.filter(isRealStaff);
    }
    // Sales Team Head can assign to self + team
    else if (role === 'SALES_TEAM_HEAD') {
      const teamMembers = await db.getUsers({ managed_by: userId });
      users = [req.user, ...teamMembers].filter(isRealStaff);
    }
    // Regular Staff/Sales/Processing
    else {
      users.push(req.user);
      const allStaff = await db.getUsers();
      const otherStaff = allStaff.filter(u => isRealStaff(u) && u.id !== userId);
      users = [...users, ...otherStaff];
    }

    // Deduplicate by ID and sort
    const uniqueUsers = Array.from(new Map(users.map(item => [item.id, item])).values());
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
    const canBulkAssign = role === 'ADMIN' || role === 'SALES_TEAM_HEAD' || role === 'SALES_TEAM' || role === 'PROCESSING' || role === 'STAFF' || role === 'HR';

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
    if (!staffUser || (staffUser.role === 'ADMIN' && !isAssignableLeadTarget(staffUser))) {
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
        const targetStaffUsers = await db.getUsers({ id: staffId });
        const targetStaff = targetStaffUsers[0];
        if (!targetStaff || (targetStaff.role === 'ADMIN' && !isAssignableLeadTarget(targetStaff))) {
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
      // AUTOMATIC STATUS UPDATE: Set to 'Assigned' when assigning from initial/unassigned buckets
      if (lead.status === 'Unassigned' || lead.status === 'New' || lead.status === 'Direct Lead') {
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
router.get('/fix-phones-maintenance', authenticate, requireAdmin, async (req, res) => {
  const maintenanceKey = process.env.MAINTENANCE_KEY || 'fix_my_phones_please';
  if (req.query.key !== maintenanceKey) {
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
router.get('/delete-all-maintenance', authenticate, requireAdmin, async (req, res) => {
  const maintenanceKey = process.env.MAINTENANCE_KEY || 'fix_my_phones_please';
  if (req.query.key !== maintenanceKey) {
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

// Check for duplicate phone/whatsapp number (used by frontend real-time check)
// IMPORTANT: This must be defined BEFORE the /:id wildcard route
router.get('/check-duplicate', authenticate, async (req, res) => {
  try {
    const { phone, email, name: nameQuery } = req.query;

    if (phone && phone.trim().length >= 5) {
      const cleanPhone = phone.trim().replace(/\D/g, '');
      if (cleanPhone.length >= 7) {
        const result = await db.query(
          `SELECT id, name, status, phone_number, whatsapp_number FROM leads
           WHERE deleted_at IS NULL AND (
             regexp_replace(COALESCE(phone_number,''), '\\D', '', 'g') = $1
             OR regexp_replace(COALESCE(whatsapp_number,''), '\\D', '', 'g') = $1
             OR regexp_replace(COALESCE(secondary_phone_number,''), '\\D', '', 'g') = $1
             OR (
               length($1) >= 10 AND length(regexp_replace(COALESCE(phone_number,''), '\\D', '', 'g')) >= 10
               AND right(regexp_replace(COALESCE(phone_number,''), '\\D', '', 'g'), 10) = right($1, 10)
             )
             OR (
               length($1) >= 10 AND length(regexp_replace(COALESCE(whatsapp_number,''), '\\D', '', 'g')) >= 10
               AND right(regexp_replace(COALESCE(whatsapp_number,''), '\\D', '', 'g'), 10) = right($1, 10)
             )
             OR (
               length($1) >= 10 AND length(regexp_replace(COALESCE(secondary_phone_number,''), '\\D', '', 'g')) >= 10
               AND right(regexp_replace(COALESCE(secondary_phone_number,''), '\\D', '', 'g'), 10) = right($1, 10)
             )
           ) LIMIT 1`,
          [cleanPhone]
        );
        if (result.rows.length > 0) {
          const match = result.rows[0];
          return res.json({ exists: true, field: 'phone', lead: { id: match.id, name: match.name, status: match.status } });
        }
      }
    }

    if (email && email.trim().length >= 3) {
      const result = await db.query(
        `SELECT id, name, status FROM leads WHERE deleted_at IS NULL AND LOWER(TRIM(email)) = $1 LIMIT 1`,
        [email.trim().toLowerCase()]
      );
      if (result.rows.length > 0) {
        const match = result.rows[0];
        return res.json({ exists: true, field: 'email', lead: { id: match.id, name: match.name, status: match.status } });
      }
    }

    if (nameQuery && String(nameQuery).trim().length >= 3) {
      const result = await db.query(
        `SELECT id, name, status FROM leads WHERE deleted_at IS NULL AND LOWER(TRIM(name)) = LOWER(TRIM($1)) LIMIT 1`,
        [String(nameQuery).trim()]
      );
      if (result.rows.length > 0) {
        const match = result.rows[0];
        return res.json({ exists: true, field: 'name', lead: { id: match.id, name: match.name, status: match.status } });
      }
    }

    res.json({ exists: false });
  } catch (error) {
    console.error('Check duplicate error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Bulk delete leads (soft delete — moves to Recycle Bin)
router.post('/bulk-delete', authenticate, async (req, res) => {
  const client = await db.pool.connect();
  try {
    const userId = req.user.id;
    const role = req.user.role;
    const { leadIds } = req.body;

    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({ error: 'No lead IDs provided' });
    }

    const normalizedLeadIds = Array.from(
      new Set(
        leadIds
          .map(id => Number(id))
          .filter(id => Number.isInteger(id) && id > 0)
      )
    );

    if (normalizedLeadIds.length === 0) {
      return res.status(400).json({ error: 'No valid lead IDs provided' });
    }

    await client.query('BEGIN');
    const leadsResult = await client.query(
      'SELECT id, assigned_staff_id, created_by FROM leads WHERE id = ANY($1) AND deleted_at IS NULL',
      [normalizedLeadIds]
    );

    const existingLeads = leadsResult.rows;
    let permittedLeadIds = [];

    if (role === 'ADMIN') {
      permittedLeadIds = existingLeads.map(l => l.id);
    } else if (role === 'SALES_TEAM_HEAD') {
      const teamMembers = await db.getUsers({ managed_by: userId });
      const teamMemberIds = new Set(teamMembers.map(u => Number(u.id)));
      permittedLeadIds = existingLeads
        .filter(l => {
          const assignedTo = l.assigned_staff_id !== null ? Number(l.assigned_staff_id) : null;
          const createdBy = l.created_by !== null ? Number(l.created_by) : null;
          return assignedTo === userId || teamMemberIds.has(assignedTo) || createdBy === userId;
        })
        .map(l => l.id);
    } else {
      // Sales/Staff/Processing can only delete leads assigned to them or created by them.
      permittedLeadIds = existingLeads
        .filter(l => {
          const assignedTo = l.assigned_staff_id !== null ? Number(l.assigned_staff_id) : null;
          const createdBy = l.created_by !== null ? Number(l.created_by) : null;
          return assignedTo === userId || createdBy === userId;
        })
        .map(l => l.id);
    }

    if (permittedLeadIds.length === 0) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not authorized to delete the selected leads' });
    }

    const result = await client.query(
      'UPDATE leads SET deleted_at = NOW(), deleted_by = $2 WHERE id = ANY($1) AND deleted_at IS NULL',
      [permittedLeadIds, userId]
    );
    await client.query('COMMIT');

    console.log(`✅ Soft-deleted ${result.rowCount} leads by user ${userId}`);
    res.json({
      success: true,
      deletedCount: result.rowCount,
      skippedCount: normalizedLeadIds.length - result.rowCount
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Bulk soft-delete error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  } finally {
    client.release();
  }
});

// GET /api/leads/trash — Fetch recently deleted leads (latest first)
router.get('/trash', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const userName = req.user.name || '';
    const userEmail = req.user.email || '';
    const restrictedNames = ['Sneha', 'SNEHA', 'Kripa', 'KRIPA', 'Emy', 'EMY', 'Shilpa', 'SHILPA', 'Jibna', 'JIBNA', 'Karthika', 'KARTHIKA', 'Asna', 'ASNA'];
    const restrictedEmails = ['sneha@toniosenora.com', 'kripa@toniosenora.com', 'emy@toniosenora.com', 'shilpa@toniosenora.com', 'jibna@toniosenora.com', 'karthika@toniosenora.com', 'asna@toniosenora.com'];
    const isTargetedUser = restrictedNames.includes(userName) || restrictedEmails.includes(userEmail);

    let trashedLeads = await db.getTrashedLeads();

    if (isTargetedUser) {
      trashedLeads = trashedLeads.filter(l => l.assigned_staff_id === userId);
    }

    // Attach assigned staff names
    const allUsers = await db.getUsers();
    const userMap = {};
    allUsers.forEach(u => { userMap[u.id] = u.name; });

    const leads = trashedLeads.map(l => ({
      ...l,
      assigned_staff_name: l.assigned_staff_id ? (userMap[l.assigned_staff_id] || null) : null,
    }));

    res.json(leads);
  } catch (error) {
    console.error('Trash fetch error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// POST /api/leads/restore — Restore selected leads from trash
router.post('/restore', authenticate, async (req, res) => {
  try {
    const role = req.user.role;
    if (role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only admins can restore leads' });
    }
    const { leadIds } = req.body;
    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({ error: 'No lead IDs provided' });
    }

    const result = await db.query(
      'UPDATE leads SET deleted_at = NULL, deleted_by = NULL WHERE id = ANY($1)',
      [leadIds]
    );

    res.json({ success: true, restoredCount: result.rowCount });
  } catch (error) {
    console.error('Restore error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// POST /api/leads/permanent-delete — Permanently destroy leads (must be in trash first)
router.post('/permanent-delete', authenticate, async (req, res) => {
  try {
    const role = req.user.role;
    if (role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only admins can permanently delete leads' });
    }
    const { leadIds } = req.body;
    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({ error: 'No lead IDs provided' });
    }

    // Only delete leads that are already soft-deleted (in trash)
    const result = await db.query(
      'DELETE FROM leads WHERE id = ANY($1) AND deleted_at IS NOT NULL',
      [leadIds]
    );

    console.log(`🔥 Permanently deleted ${result.rowCount} leads`);
    res.json({ success: true, deletedCount: result.rowCount });
  } catch (error) {
    console.error('Permanent delete error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Export leads to CSV (for Google Sheets import)
router.get('/export/csv', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;
    const { status, search, phone, created_from, created_to } = req.query;
    const filter = {};

    let accessibleUserIds = null;
    const userName = req.user.name || '';
    const userEmail = req.user.email || '';
    const restrictedNames = ['Sneha', 'SNEHA', 'Kripa', 'KRIPA', 'Emy', 'EMY', 'Shilpa', 'SHILPA', 'Jibna', 'JIBNA', 'Karthika', 'KARTHIKA', 'Asna', 'ASNA'];
    const restrictedEmails = ['sneha@toniosenora.com', 'kripa@toniosenora.com', 'emy@toniosenora.com', 'shilpa@toniosenora.com', 'jibna@toniosenora.com', 'karthika@toniosenora.com', 'asna@toniosenora.com'];
    const isTargetedUser = restrictedNames.includes(userName) || restrictedEmails.includes(userEmail);

    if (isTargetedUser || role === 'SALES_TEAM' || role === 'STAFF' || role === 'HR') {
      accessibleUserIds = [userId];
    } else {
      // Regular ADMIN, SALES_TEAM_HEAD, PROCESSING see everyone
      accessibleUserIds = null;
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
    if (created_from) filter.created_from = created_from;
    if (created_to) filter.created_to = created_to;

    let leads = await db.getLeads(filter);

    if (accessibleUserIds && accessibleUserIds.length > 1) {
      leads = leads.filter(lead =>
        !lead.assigned_staff_id || accessibleUserIds.includes(lead.assigned_staff_id)
      );
    }

    let userMap = {};
    try {
      const allUsers = await db.getUsers();
      allUsers.forEach(u => {
        userMap[String(u.id)] = u.name;
      });
    } catch (error) {
      console.error('Optimization warning: Failed to fetch users for lookup, falling back to null names', error);
    }

    leads = leads.map(lead => ({
      ...lead,
      assigned_staff_name: lead.assigned_staff_id ? (userMap[String(lead.assigned_staff_id)] || 'Unassigned') : 'Unassigned',
    }));

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

// Get single lead
// Get the original Excel row data for a lead (only works for imported leads)
router.get('/:id/excel-details', authenticate, async (req, res) => {
  try {
    const leadId = parseInt(req.params.id);
    const result = await db.query(
      'SELECT excel_row_data FROM leads WHERE id = $1',
      [leadId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    const rawData = result.rows[0].excel_row_data;
    if (!rawData) {
      return res.status(404).json({ error: 'No Excel data available for this lead' });
    }
    // Parse if stored as string
    const parsed = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
    res.json({ excel_row_data: parsed });
  } catch (error) {
    console.error('Error fetching excel details:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const leadId = parseInt(req.params.id);
    const lead = await getLeadWithAccessCheck(leadId, req.user);

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found or access denied' });
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
      if (role === 'SALES_TEAM' || role === 'STAFF' || role === 'HR') {
        finalAssignedStaffId = userId;
      } else if (role === 'SALES_TEAM_HEAD' || role === 'PROCESSING') {
        // Now allowed to assign based on the regular flow or leave as is.
      } else if (role === 'ADMIN') {
        if (assigned_staff_id) {
          const staffUsers = await db.getUsers({ id: assigned_staff_id });
          const assignee = staffUsers[0];
          if (!assignee || (assignee.role === 'ADMIN' && !isAssignableLeadTarget(assignee))) {
            return res.status(400).json({ error: 'Invalid staff member' });
          }
        }
      }

      // Check for duplicate phone/email using dedicated indexes (not paginated getLeads)
      const normalizedPhone = phone_number ? String(phone_number).replace(/\D/g, '') : '';
      const normalizedWhatsapp = whatsapp_number ? String(whatsapp_number).replace(/\D/g, '') : '';
      const [phoneRows, emailRows] = await Promise.all([
        (normalizedPhone || normalizedWhatsapp) ? db.getLeadPhones() : Promise.resolve([]),
        email ? db.getLeadEmails() : Promise.resolve([]),
      ]);
      const existingPhones = new Set(phoneRows.map(r => String(r.phone_number || '').replace(/\D/g, '')));
      const existingEmails = new Set(emailRows.map(r => String(r.email || '').toLowerCase()));

      if (normalizedPhone && existingPhones.has(normalizedPhone)) {
        return res.status(400).json({ error: 'Lead with this phone number already exists' });
      }
      if (normalizedWhatsapp && existingPhones.has(normalizedWhatsapp)) {
        return res.status(400).json({ error: 'Lead with this WhatsApp number already exists' });
      }
      if (email && existingEmails.has(email.toLowerCase().trim())) {
        return res.status(400).json({ error: 'Lead with this email already exists' });
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
        if (status === 'New' || status === 'Unassigned' || status === 'Direct Lead') {
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

    // Check if lead exists and user has at least read access
    const existingLead = await getLeadWithAccessCheck(leadId, req.user);

    if (!existingLead) {
      return res.status(404).json({ error: 'Lead not found or access denied' });
    }

    // Role-based editing restrictions
    if (role === 'SALES_TEAM' || role === 'PROCESSING' || role === 'STAFF') {
      const leadOwnerId = existingLead.assigned_staff_id ? Number(existingLead.assigned_staff_id) : null;
      // Allow update if assigned to self OR if unassigned (claiming)
      if (leadOwnerId !== userId && leadOwnerId !== null) {
        return res.status(403).json({ error: 'You can only update leads assigned to you' });
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

    const canReassign = role === 'ADMIN' || role === 'SALES_TEAM_HEAD' || role === 'STAFF' || role === 'SALES_TEAM' || role === 'PROCESSING' || role === 'HR';
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
        if (!targetUser || (targetUser.role === 'ADMIN' && !isAssignableLeadTarget(targetUser))) {
          return res.status(400).json({ error: 'Invalid staff member' });
        }

        // For non-admin roles, verify permissions
        if (role !== 'ADMIN') {
          const leadOwnerId = existingLead.assigned_staff_id ? Number(existingLead.assigned_staff_id) : null;

          // Case 1: Lead is currently Unassigned - Allow claiming
          if (leadOwnerId === null) {
            // Sales and Staff can only claim to themselves
            if ((role === 'SALES_TEAM' || role === 'STAFF') && normalizedStaffId !== userId) {
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
            } else if (role === 'SALES_TEAM' || role === 'STAFF' || role === 'PROCESSING' || role === 'HR') {
              // Staff can only transfer leads assigned to them
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
        if ((status === undefined || status === null || status === '') &&
          (existingLead.status === 'Unassigned' || existingLead.status === 'New' || existingLead.status === 'Direct Lead')) {
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
        if ((status === undefined || status === null || status === '') && existingLead.status === 'Assigned') {
          updates.status = 'Unassigned';
          console.log(`🔄 Auto-updating status to 'Unassigned' for lead ${leadId}`);
        }
      }

      updates.assigned_staff_id = normalizedStaffId;
    }

    // CRITICAL: If status is being changed to "Registration Completed", we need registration form data
    // This should come from a separate endpoint, so we just update the status here
    // The actual client creation happens via POST /api/leads/:id/complete-registration

    if (phone_number !== undefined || whatsapp_number !== undefined || email !== undefined) {
      const nextPhone = phone_number !== undefined ? phone_number : existingLead.phone_number;
      const nextWhatsapp = whatsapp_number !== undefined ? whatsapp_number : existingLead.whatsapp_number;
      const nextEmail = email !== undefined ? email : existingLead.email;

      const np = nextPhone ? String(nextPhone).replace(/\D/g, '') : '';
      const nw = nextWhatsapp ? String(nextWhatsapp).replace(/\D/g, '') : '';
      const checked = new Set();
      for (const d of [np, nw]) {
        if (d.length < 7 || checked.has(d)) continue;
        checked.add(d);
        const dupPhone = await findOtherLeadWithPhoneDigits(leadId, d);
        if (dupPhone) {
          const whatsappMsg = d === nw && d !== np;
          return res.status(400).json({
            error: whatsappMsg
              ? 'Lead with this WhatsApp number already exists'
              : 'Lead with this phone number already exists',
          });
        }
      }

      if (nextEmail && String(nextEmail).trim()) {
        const dupEmail = await findOtherLeadWithEmail(leadId, String(nextEmail).trim().toLowerCase());
        if (dupEmail) {
          return res.status(400).json({ error: 'Lead with this email already exists' });
        }
      }
    }

    const updatedLead = await db.updateLead(leadId, updates);

    if (!updatedLead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    let assignedStaffName = null;
    if (updatedLead.assigned_staff_id) {
      try {
        assignedStaffName = await db.getUserName(updatedLead.assigned_staff_id);
      } catch (e) {
        console.error('Error resolving assigned staff name on update:', e);
      }
    }

    res.json({ ...updatedLead, assigned_staff_name: assignedStaffName });
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

    // Check if lead exists and user has at least read access
    const existingLead = await getLeadWithAccessCheck(leadId, req.user);

    if (!existingLead) {
      return res.status(404).json({ error: 'Lead not found or access denied' });
    }

    // Role-based editing restrictions
    const leadOwnerId = existingLead.assigned_staff_id ? Number(existingLead.assigned_staff_id) : null;

    if (role !== 'ADMIN') {
      if (role === 'SALES_TEAM_HEAD') {
        const teamMembers = await db.getUsers({ managed_by: userId });
        const teamIds = teamMembers.map(u => u.id);

        if (leadOwnerId !== userId && !teamIds.includes(leadOwnerId) && existingLead.assigned_staff_id !== null) {
          return res.status(403).json({ error: 'Access denied' });
        }
      } else if (role === 'SALES_TEAM' || role === 'PROCESSING' || role === 'STAFF' || role === 'HR') {
        if (leadOwnerId !== userId) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }
    }

    // Assign to Sneha or Kripa (processing staff) for remaining procedure — round-robin by client count
    let processingStaffId = null;
    try {
      const snehaUsers = await db.getUsers({ email: 'sneha@toniosenora.com' });
      const kripaUsers = await db.getUsers({ email: 'kripa@toniosenora.com' });
      const sneha = snehaUsers[0] || (await db.getUsers({ name: 'Sneha' }))[0];
      const kripa = kripaUsers[0] || (await db.getUsers({ name: 'Kripa' }))[0];
      const snehaId = sneha?.id;
      const kripaId = kripa?.id;
      if (snehaId && kripaId) {
        const countRes = await db.query(
          'SELECT COUNT(*) as c FROM clients WHERE processing_staff_id IN ($1, $2)',
          [snehaId, kripaId]
        );
        const c = parseInt(countRes.rows[0]?.c || 0, 10);
        processingStaffId = c % 2 === 0 ? snehaId : kripaId;
      } else if (snehaId) {
        processingStaffId = snehaId;
      } else if (kripaId) {
        processingStaffId = kripaId;
      }
    } catch (e) {
      console.error('Error finding Sneha/Kripa for assignment:', e);
    }

    const lead = existingLead;
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
      country: lead.country,
      target_country: lead.country,
      program: lead.program,
      assigned_staff_id: lead.assigned_staff_id,
      processing_staff_id: processingStaffId,
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
    const leadId = parseInt(req.params.id);
    const lead = await getLeadWithAccessCheck(leadId, req.user);

    if (!lead) {
      return res.status(404).json({ error: 'Access denied' });
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
    const leadId = parseInt(req.params.id);
    const { text } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'Comment text is required' });
    }

    // Check if user has access to this lead
    const lead = await getLeadWithAccessCheck(leadId, req.user);

    if (!lead) {
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

      // Track phones seen in THIS import file to catch within-file duplicates
      const seenInThisImport = new Set();

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

          // Check for within-file duplicate email
          if (email && seenInThisImport.has('email:' + email)) {
            results.skipped++;
            if (results.skippedRows.length < 100) results.skippedRows.push({ row: i + 1, sheet: sheetName, message: `Skipped: Duplicate email in file: ${email}` });
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

          // Within-file phone duplicate check (after phone is resolved)
          if (phone) {
            const normalizedPhone = phone.replace(/\D/g, '');
            if (seenInThisImport.has('phone:' + normalizedPhone)) {
              results.skipped++;
              if (results.skippedRows.length < 100) results.skippedRows.push({ row: i + 1, sheet: sheetName, message: `Skipped: Duplicate phone in file: ${phone}` });
              continue;
            }
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

          let st = g(colIdx.status) || 'New';
          const sl = st.toLowerCase();

          // AUTO-ASSIGN LOGIC: If staffId is found, the status should be 'Assigned' 
          // (unless the user explicitly provided a more specific status like 'Follow-up')
          if (staffId && (sl === 'new' || sl === 'unassigned' || sl === 'direct lead' || !st)) {
            st = 'Assigned';
          } else if (sl.includes('direct')) {
            st = 'Direct Lead';
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
          } else if (!staffId && sl === 'unassigned') {
            st = 'New';
          } else if (!staffId && !st) {
            st = 'New';
          }

          const now = new Date().toISOString();
          const fileComment = g(colIdx.comment);

          // ADD TO SETS TO PREVENT INTRA-CSV DUPLICATES
          if (email) {
            existingEmails.add(email);
            seenInThisImport.add('email:' + email);
          }
          if (phone) {
            const normalizedPhone = phone.replace(/\D/g, '');
            existingPhones.add(normalizedPhone);
            seenInThisImport.add('phone:' + normalizedPhone);
          }
          if (secPhone) {
            const normalizedSec = secPhone.replace(/\D/g, '');
            existingPhones.add(normalizedSec);
            seenInThisImport.add('phone:' + normalizedSec);
          }

          // Build raw Excel row as key-value object for all original columns
          const excelRowData = {};
          headerValues.forEach((header, idx) => {
            if (header && String(header).trim()) {
              excelRowData[String(header).trim()] = String(row[idx] || '').trim();
            }
          });

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
            secondary_phone_number: secPhone || null,
            excel_row_data: Object.keys(excelRowData).length > 0 ? JSON.stringify(excelRowData) : null,
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
              l.created_by, l.created_at, l.updated_at, l.secondary_phone_number, l.excel_row_data
            ];
            const rowP = vals.map(() => `$${pIdx++}`);
            flatValues.push(...vals);
            placeholders.push(`(${rowP.join(', ')})`);
          });
          const query = `INSERT INTO leads (
            name, phone_number, phone_country_code, whatsapp_number, email,
            country, program, occupation, status, priority, comment,
            follow_up_date, follow_up_status, assigned_staff_id, source, ielts_score,
            created_by, created_at, updated_at, secondary_phone_number, excel_row_data
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

// Delete a lead (Soft delete — moves to Recycle Bin)
router.delete('/:id', authenticate, async (req, res) => {
  const client = await db.pool.connect();
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

    // Perform soft delete
    await client.query('BEGIN');
    const result = await client.query(
      'UPDATE leads SET deleted_at = NOW(), deleted_by = $2 WHERE id = $1 AND deleted_at IS NULL',
      [leadId, userId]
    );
    await client.query('COMMIT');

    if (result.rowCount > 0) {
      res.json({ message: 'Lead moved to Recycle Bin successfully', softDeleted: true });
    } else {
      res.status(500).json({ error: 'Failed to delete lead or lead already deleted' });
    }

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Delete lead error:', error);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

module.exports = router;
