const express = require('express');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

function getDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return value.toISOString().split('T')[0];
  }
  return String(value).split('T')[0];
}

function buildLeadMetrics(leads) {
  const today = new Date().toISOString().split('T')[0];
  const isActiveStatus = (status) => status !== 'Pending Lead' && status !== 'Closed / Rejected';

  const todayFollowups = leads.filter(l => {
    const followDate = getDateOnly(l.follow_up_date);
    return followDate === today && isActiveStatus(l.status);
  }).length;

  const dueFollowups = leads.filter(l => {
    const followDate = getDateOnly(l.follow_up_date);
    return followDate && followDate < today && isActiveStatus(l.status);
  }).length;

  return {
    totalLeads: leads.length,
    newLeads: leads.filter(l => l.status === 'Unassigned').length,
    followupLeads: leads.filter(l => l.status === 'Follow-up').length,
    processingLeads: leads.filter(l => l.status === 'Prospect').length,
    convertedLeads: leads.filter(l => l.status === 'Pending Lead').length,
    closedLeads: leads.filter(l => l.status === 'Closed / Rejected').length,
    todayFollowups,
    dueFollowups,
  };
}

// Helper function to get accessible user IDs based on role
async function getAccessibleUserIds(user) {
  const role = user.role;
  const userId = user.id;

  if (role === 'SALES_TEAM') {
    // Only Sales team sees only themselves
    return [userId];
  }

  // Admin, Sales Team Head, Staff, Processing, etc. see everyone
  return null;
}

// Get staff-specific dashboard data (admin, sales team head, and Emy for monitoring)
router.get('/staff/:id', authenticate, async (req, res) => {
  try {
    // SQLite doesn't need loadDatabase - data is always fresh
    const role = req.user.role;
    const userId = req.user.id;
    const userName = req.user.name || '';
    const userEmail = req.user.email || '';

    // Check if user is Emy
    const isEmy = userName === 'Emy' || userName === 'EMY' || userEmail === 'emy@toniosenora.com';

    const staffId = Number(req.params.id);
    if (Number.isNaN(staffId)) {
      console.error('❌ Invalid staff ID provided:', req.params.id);
      return res.status(400).json({ error: 'Invalid staff id' });
    }

    // Allow users to view their OWN dashboard regardless of role
    const isOwnDashboard = userId === staffId;

    if (role !== 'ADMIN' && role !== 'SALES_TEAM_HEAD' && !isEmy && !isOwnDashboard) {
      return res.status(403).json({ error: 'Admin, Sales Team Head, Emy, or own dashboard access required' });
    }

    console.log('🔍 Fetching dashboard for staff ID:', staffId);
    const staffUsers = await db.getUsers({ id: staffId });
    const staffUser = staffUsers[0];

    // Check if this is Sneha or Kripa (they can be ADMIN but are also processing team)
    const isSneha = staffUser && (staffUser.name === 'Sneha' || staffUser.name === 'SNEHA' || staffUser.email === 'sneha@toniosenora.com');
    const isKripa = staffUser && (staffUser.name === 'Kripa' || staffUser.name === 'KRIPA' || staffUser.email === 'kripa@toniosenora.com');
    const isProcessingTeam = isSneha || isKripa;

    if (!staffUser) {
      console.error('❌ Staff member not found:', { staffId });
      return res.status(404).json({ error: 'Staff member not found' });
    }

    // Allow Sneha and Kripa even if they're ADMIN (they're processing team members)
    if (staffUser.role === 'ADMIN' && !isProcessingTeam) {
      console.error('❌ Staff member is admin (not processing team):', { staffId, name: staffUser.name, role: staffUser.role });
      return res.status(404).json({ error: 'Staff member not found' });
    }

    console.log('✅ Found staff member:', { id: staffUser.id, name: staffUser.name, email: staffUser.email });

    // Emy can only monitor specific staff: Karthika, Jibina, Asna, Shilpa
    if (isEmy) {
      const allowedStaffNames = ['Karthika', 'Jibina', 'Asna', 'Shilpa'];
      if (!allowedStaffNames.includes(staffUser.name)) {
        return res.status(403).json({ error: 'Access denied. You can only monitor Karthika, Jibina, Asna, and Shilpa dashboards' });
      }
    }

    // Sales team head can only access their own dashboard or their team members' dashboards
    if (role === 'SALES_TEAM_HEAD') {
      if (staffId !== userId) {
        // Check if the staff member is in their team
        const teamMembers = await db.getUsers({ managed_by: userId, id: staffId });

        // Fallback: If no direct reports found, check if target is a SALES_TEAM member (Safety Net)
        if (teamMembers.length === 0) {
          const targetUser = await db.getUsers({ id: staffId });
          const isSalesMember = targetUser.length > 0 && (targetUser[0].role === 'SALES_TEAM' || targetUser[0].role === 'STAFF');

          if (!isSalesMember) {
            return res.status(403).json({ error: 'Access denied. You can only view your own dashboard or your team members\' dashboards' });
          }
        }
      }
    }

    // isSneha, isKripa, and isProcessingTeam are already declared above (lines 89-91)

    if (isProcessingTeam && req.query.type !== 'main') {
      // Processing Team Dashboard - Show client processing data
      let processingClients = [];
      let snehaClientsList = []; // For Kripa: Sneha's clients section

      // Get Sneha user ID for Kripa's dashboard
      let snehaUserId = null;
      if (isKripa) {
        try {
          const snehaUsers = await db.getUsers({ email: 'sneha@toniosenora.com' });
          if (snehaUsers.length > 0) {
            snehaUserId = snehaUsers[0].id;
          } else {
            const snehaByName = await db.getUsers({ name: 'Sneha' });
            if (snehaByName.length > 0) snehaUserId = snehaByName[0].id;
          }
        } catch (error) {
          console.error('Error finding Sneha user:', error);
        }
      }

      if (isSneha) {
        // Sneha's clients (assigned to her for fee management)
        const allClients = await db.getClients({});
        processingClients = allClients.filter(c =>
          c.processing_staff_id === staffId || // PRIMARY: Assigned for processing
          c.assigned_staff_id === staffId || // SECONDARY: Assigned as sales rep
          (c.processing_staff_id === null && c.assigned_staff_id !== null) // FALLBACK: Newly registered/Unassigned processing
        );
      } else if (isKripa) {
        // Kripa's clients (assigned for processing OR unassigned fallback)
        const allClients = await db.getClients({});
        processingClients = allClients.filter(c =>
          c.processing_staff_id === staffId ||
          (c.processing_staff_id === null && c.status === 'Client')
        );

        // Also get Sneha's clients (to help if Sneha is on leave)
        if (snehaUserId) {
          const snehaClients = await db.getClients({ assigned_staff_id: snehaUserId });
          snehaClientsList = snehaClients.map(client => ({
            id: client.id,
            name: client.name,
            phone_number: client.phone_number,
            phone_country_code: client.phone_country_code,
            email: client.email,
            fee_status: client.fee_status,
            amount_paid: client.amount_paid,
            payment_due_date: client.payment_due_date,
            processing_status: client.processing_status,
            assigned_staff_id: client.assigned_staff_id,
            created_at: client.created_at,
            updated_at: client.updated_at,
          }));
        }
      }

      // Calculate processing metrics
      const processingMetrics = {
        totalClients: processingClients.length,
        paymentPending: processingClients.filter(c => c.fee_status === 'Payment Pending').length,
        firstInstallmentCompleted: processingClients.filter(c => c.fee_status === '1st Installment Completed').length,
        pteFeePaid: processingClients.filter(c => c.fee_status === 'PTE Fee Paid').length,
        withSneha: isSneha ? processingClients.length : 0,
        withKripa: isKripa ? processingClients.length : 0,
      };

      // Get client details for display
      const clientsList = processingClients.map(client => ({
        id: client.id,
        name: client.name,
        phone_number: client.phone_number,
        phone_country_code: client.phone_country_code,
        email: client.email,
        fee_status: client.fee_status,
        amount_paid: client.amount_paid,
        payment_due_date: client.payment_due_date,
        processing_status: client.processing_status,
        processing_staff_id: client.processing_staff_id,
        assigned_staff_id: client.assigned_staff_id,
        completed_actions: client.completed_actions || [],
        created_at: client.created_at,
        updated_at: client.updated_at,
      }));

      // For Kripa: Also get Sneha's clients (to help if Sneha is on leave)
      if (isKripa) {
        // Find Sneha user ID
        let snehaUsers = await db.getUsers({ email: 'sneha@toniosenora.com' });
        let snehaUser = snehaUsers[0];
        if (!snehaUser) {
          snehaUsers = await db.getUsers({ name: 'Sneha' });
          snehaUser = snehaUsers[0];
        }
        if (!snehaUser) {
          snehaUsers = await db.getUsers({ name: 'SNEHA' });
          snehaUser = snehaUsers[0];
        }

        if (snehaUser) {
          const snehaClients = await db.getClients({ assigned_staff_id: snehaUser.id });
          snehaClientsList = snehaClients.map(client => ({
            id: client.id,
            name: client.name,
            phone_number: client.phone_number,
            phone_country_code: client.phone_country_code,
            email: client.email,
            fee_status: client.fee_status,
            amount_paid: client.amount_paid,
            payment_due_date: client.payment_due_date,
            processing_status: client.processing_status,
            assigned_staff_id: client.assigned_staff_id,
            created_at: client.created_at,
            updated_at: client.updated_at,
          }));
        }
      }

      if (req.query.metricsOnly === 'true') {
        return res.json({ metrics: processingMetrics });
      }

      res.json({
        role: role,
        isReadOnly: isEmy,
        isProcessingTeam: true,
        processingRole: isSneha ? 'sneha' : 'kripa',
        staff: {
          id: staffUser.id,
          name: staffUser.name,
          email: staffUser.email,
        },
        metrics: processingMetrics,
        clientsList,
        snehaClientsList: isKripa ? snehaClientsList : [], // For Kripa: Sneha's clients section
      });
    } else {
      // Regular Staff Dashboard - Show lead metrics AND clients they converted
      const metrics = await db.getLeadsMetrics({ assigned_staff_id: staffId });

      // Get leads list (top 200 for dashboard view is sufficient)
      const staffLeads = await db.getLeads({ assigned_staff_id: staffId });

      // Get clients converted by this staff member (assigned_staff_id = staffId)
      const staffClients = await db.getClients({ assigned_staff_id: staffId });

      // Add client count to metrics
      metrics.totalClients = staffClients.length;

      // Get leads with details for this staff member (paginated)
      const leadsList = staffLeads.map(lead => ({
        id: lead.id,
        name: lead.name,
        phone_number: lead.phone_number,
        phone_country_code: lead.phone_country_code,
        email: lead.email,
        status: lead.status,
        priority: lead.priority,
        comment: lead.comment,
        follow_up_date: lead.follow_up_date,
        created_at: lead.created_at,
        updated_at: lead.updated_at,
      }));

      // Get clients list (without payment details for non-authorized users)
      const userName = req.user.name || '';
      const userEmail = req.user.email || '';
      const isEmyViewer = userName === 'Emy' || userName === 'EMY' || userEmail === 'emy@toniosenora.com';
      const canViewPaymentData = role === 'ADMIN' || isEmyViewer;

      const clientsList = staffClients.map(client => {
        const clientData = {
          id: client.id,
          name: client.name,
          phone_number: client.phone_number,
          phone_country_code: client.phone_country_code,
          email: client.email,
          created_at: client.created_at,
          updated_at: client.updated_at,
        };

        // Only include payment data if authorized
        if (canViewPaymentData) {
          clientData.fee_status = client.fee_status;
          clientData.amount_paid = client.amount_paid;
          clientData.payment_due_date = client.payment_due_date;
        }

        return clientData;
      });

      console.log('📤 Sending regular staff dashboard:', {
        staffId: staffUser.id,
        staffName: staffUser.name,
        leadsCount: staffLeads.length,
        clientsCount: staffClients.length
      });

      if (req.query.metricsOnly === 'true') {
        return res.json({ metrics });
      }

      res.json({
        role: role,
        isReadOnly: isEmy,
        isProcessingTeam: false,
        staff: {
          id: staffUser.id,
          name: staffUser.name,
          email: staffUser.email,
        },
        metrics,
        leadsList,
        clientsList, // Clients converted by this staff member
      });
    }
  } catch (error) {
    console.error('Staff dashboard error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Get leads assigned by the current user to a specific staff member
router.get('/assigned-leads/:staffId', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const staffId = Number(req.params.staffId);
    const role = req.user.role;

    // For ADMIN: show ALL leads currently assigned to the target staff member.
    // For other roles: show leads assigned to that staff that were created by this user.
    // Use notifications to find leads this user personally assigned (for all roles including Admin)
    let leads = [];
    // Use broad criteria: leads where this user is the created_by OR has an assignment notification
    const leadsResult = await db.query(`
      SELECT DISTINCT l.*
      FROM leads l
      LEFT JOIN notifications n ON l.id = n.lead_id AND n.type = 'lead_assigned' AND n.created_by = $1 AND n.user_id = $2
      WHERE l.deleted_at IS NULL 
      AND l.assigned_staff_id = $2
      AND (l.created_by = $1 OR n.id IS NOT NULL)
    `, [userId, staffId]);

    leads = leadsResult.rows;

    // Get staff name for the response
    const staffName = await db.getUserName(staffId);

    // Sort by most recent update
    const detailedLeads = leads.map(l => ({
      ...l,
      assigned_staff_name: staffName
    })).sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));

    res.json(detailedLeads);
  } catch (error) {
    console.error('Error fetching assigned leads:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get dashboard data
router.get('/', authenticate, async (req, res) => {
  // Set cache-control header to prevent caching
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  try {
    // SQLite doesn't need loadDatabase - data is always fresh
    const userId = req.user.id;
    const role = req.user.role;
    const accessibleUserIds = await getAccessibleUserIds(req.user);

    // Determine if this is a restricted view (strictly SALES_TEAM)
    const isRestrictedView = role === 'SALES_TEAM';

    if (isRestrictedView) {
      // Restricted view - only accessible metrics
      const metrics = await db.getLeadsMetrics({
        assigned_staff_ids: accessibleUserIds,
        assigned_staff_id: (!accessibleUserIds || accessibleUserIds.length === 0) ? userId : undefined
      }) || {};

      // Ensure leadsByStatus exists to prevent frontend/backend crashes
      metrics.leadsByStatus = metrics.leadsByStatus || {};
      metrics.leadsByStatus['Registration Completed'] = metrics.leadsByStatus['Registration Completed'] || 0;

      // Get clients for restricted view (strictly filtered for this Staff Member)
      const allClientsReq = await db.getClients() || [];
      const restrictedClients = allClientsReq.filter(c => Number(c.assigned_staff_id) === Number(userId));

      // Get Sneha and Kripa user IDs dynamically
      let snehaUserId = null;
      let kripaUserId = null;
      try {
        const users = await db.getUsers();
        const sneha = users.find(u => u.email === 'sneha@toniosenora.com' || u.name === 'Sneha');
        const kripa = users.find(u => u.email === 'kripa@toniosenora.com' || u.name === 'Kripa');
        snehaUserId = sneha?.id;
        kripaUserId = kripa?.id;
      } catch (error) {
        console.error('Error finding processing users:', error);
      }

      metrics.totalClients = restrictedClients.length;
      metrics.clientsByStatus = {
        'Total Clients': restrictedClients.length,
        'With Sneha': snehaUserId ? restrictedClients.filter(c => c.processing_staff_id === snehaUserId || c.assigned_staff_id === snehaUserId).length : 0,
        'With Kripa': kripaUserId ? restrictedClients.filter(c => c.processing_staff_id === kripaUserId).length : 0,
        'Payment Pending': restrictedClients.filter(c => c.fee_status === 'Payment Pending').length,
        '1st Installment Completed': restrictedClients.filter(c => c.fee_status === '1st Installment Completed').length,
        'PTE Fee Paid': restrictedClients.filter(c => c.fee_status === 'PTE Fee Paid').length,
      };

      // Log for debugging
      console.log('📊 Restricted view dashboard metrics:');
      console.log('  Total clients:', restrictedClients?.length || 0);
      console.log('  Registration Completed count:', metrics?.leadsByStatus?.['Registration Completed'] || 0);

      // Recent activity
      // OPTIMIZATION: Prepare User Map for fast lookups
      const userMap = {};
      try {
        // We might have fetched specific users or all users depending on logic above, 
        // but for safety in restricted view we can fetch all or rely on accessible logic.
        // Since this is restricted view, we might not want to fetch ALL users if sensitive, 
        // but fetching names is generally safe. Let's fetch all for consistent performance.
        const allUsers = await db.getUsers();
        allUsers.forEach(u => userMap[u.id] = u.name);
      } catch (e) { console.error('Error building user map', e); }

      // Recent leads (last 5, sorted by most recent)
      // Optimized: Use userMap instead of async db calls inside map
      // Fetch specifically for restricted view to save memory
      const restrictedRecentLeads = await db.getLeads({
        assigned_staff_ids: accessibleUserIds,
        assigned_staff_id: (!accessibleUserIds || accessibleUserIds.length === 0) ? userId : undefined,
        limit: 5 // We only need 5 for the recent activity overview
      });

      const recentLeads = (restrictedRecentLeads || [])
        .sort((a, b) => new Date(b?.updated_at || b?.created_at || Date.now()) - new Date(a?.updated_at || a?.created_at || Date.now()))
        .map(l => ({
          type: 'status_change',
          lead_id: l?.id,
          lead_name: l?.name || 'Unknown',
          status: l?.status || 'Unknown',
          timestamp: l?.updated_at || l?.created_at,
          user_name: l?.assigned_staff_id ? (userMap[l.assigned_staff_id] || 'Unknown') : 'Unknown',
        }));

      const allComments = await db.getComments(null);
      const userCommentsPromises = (allComments || [])
        .filter(c => c?.lead_id)
        .slice(0, 5)
        .map(async c => {
          try {
            const leads = await db.getLeads({ id: c.lead_id });
            const lead = leads?.[0];
            if (!lead || !lead.assigned_staff_id || Number(lead.assigned_staff_id) !== Number(userId)) {
              return null;
            }
            let userName = 'Unknown';
            if (c.user_id) {
              try {
                userName = await db.getUserName(c.user_id) || 'Unknown';
              } catch (error) {
                console.error('Error getting user name for comment:', error);
              }
            }
            return {
              type: 'comment',
              lead_id: c.lead_id,
              lead_name: lead?.name || 'Unknown',
              status: null,
              timestamp: c?.created_at || Date.now(),
              user_name: userName,
            };
          } catch (error) {
            console.error('Error processing comment:', error);
            return null;
          }
        });
      const userComments = (await Promise.all(userCommentsPromises)).filter(c => c !== null);
      const allActivity = [...(recentLeads || []), ...(userComments || [])]
        .sort((a, b) => new Date(b?.timestamp || Date.now()) - new Date(a?.timestamp || Date.now()))
        .slice(0, 10);

      if (req.query.metricsOnly === 'true') {
        return res.json({ metrics });
      }

      // Compute "Assigned By Me" for this staff member too
      let staffAssignedByMe = [];
      try {
        const assignedByMeResult = await db.query(`
          SELECT u.id as staff_id, u.name as staff_name, COUNT(DISTINCT n.lead_id) as assigned_count
          FROM notifications n
          JOIN users u ON n.user_id = u.id
          WHERE n.type = 'lead_assigned' AND n.created_by = $1
          GROUP BY u.id, u.name
          ORDER BY assigned_count DESC
        `, [userId]);
        staffAssignedByMe = assignedByMeResult.rows;
      } catch (e) {
        console.error('Error fetching assignedByMe for restricted view:', e);
      }

      const response = {
        role: role,
        metrics,
        recentActivity: allActivity,
        isRestricted: true,
        assignedByMe: staffAssignedByMe,
      };
      res.json(response);
    } else {
      // ADMIN or SALES_TEAM_HEAD dashboard
      const accessibleIds = (role === 'SALES_TEAM_HEAD') ? await getAccessibleUserIds(req.user) : null;

      const metrics = await db.getLeadsMetrics({
        assigned_staff_ids: accessibleIds,
        include_unassigned: role === 'SALES_TEAM_HEAD' // Allows team leaders to see unassigned leads
      });

      // Get staff performance accurately across whole DB
      const staffPerformance = await db.getStaffPerformance(accessibleIds);

      // Get all clients
      let allClients = await db.getClients();
      if (role === 'SALES_TEAM_HEAD') {
        allClients = allClients.filter(c => !c.assigned_staff_id || accessibleIds.includes(c.assigned_staff_id));
      }

      // Add totalClients to metrics
      metrics.totalClients = allClients.length;

      const allAttendance = await db.getAttendance();

      // Attendance overview (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const recentAttendance = allAttendance.filter(a =>
        new Date(a.check_in) >= sevenDaysAgo
      );

      const attendanceByDate = {};
      recentAttendance.forEach(a => {
        if (!a.check_in) return;
        try {
          const date = new Date(a.check_in).toISOString().split('T')[0];
          if (!attendanceByDate[date]) {
            attendanceByDate[date] = new Set();
          }
          attendanceByDate[date].add(a.user_id);
        } catch (e) {
          console.error('Invalid check_in date:', a.check_in, e);
        }
      });

      const attendanceOverview = Object.entries(attendanceByDate)
        .map(([date, userIds]) => ({
          date,
          staff_count: userIds.size,
        }))
        .sort((a, b) => b.date.localeCompare(a.date));

      // Recent leads (last 20, sorted by most recent)
      // We fetch these separately to ensure we have actual data, but limited to 20
      const recentLeadsBatch = await db.getLeads({
        assigned_staff_ids: accessibleIds,
        limit: 20
      });

      const userMap = {};
      try {
        const allUsers = await db.getUsers();
        allUsers.forEach(u => userMap[u.id] = u.name);
      } catch (e) { }

      const recentLeads = recentLeadsBatch.map(lead => ({
        id: lead.id,
        name: lead.name,
        phone_number: lead.phone_number,
        phone_country_code: lead.phone_country_code,
        email: lead.email,
        status: lead.status,
        priority: lead.priority,
        assigned_staff_id: lead.assigned_staff_id,
        assigned_staff_name: lead.assigned_staff_id ? (userMap[lead.assigned_staff_id] || 'Unknown') : null,
        created_at: lead.created_at,
        updated_at: lead.updated_at,
      }));

      // Get leads assigned to each staff by THIS user specifically (via notification records)
      const assignedByMeResult = await db.query(`
        SELECT u.id as staff_id, u.name as staff_name, COUNT(DISTINCT l.id) as assigned_count
        FROM leads l
        JOIN users u ON l.assigned_staff_id = u.id
        WHERE l.deleted_at IS NULL 
        AND l.assigned_staff_id != $1
        AND (
          l.created_by = $1 
          OR l.id IN (
            SELECT lead_id FROM notifications 
            WHERE type = 'lead_assigned' AND created_by = $1
          )
        )
        GROUP BY u.id, u.name
        ORDER BY assigned_count DESC
      `, [userId]);
      const assignedByMe = assignedByMeResult.rows;

      // Recent clients (last 20, sorted by most recent)
      const recentClients = allClients
        .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
        .slice(0, 20)
        .map(client => {
          return {
            id: client.id,
            name: client.name,
            phone_number: client.phone_number,
            phone_country_code: client.phone_country_code,
            email: client.email,
            status: 'Client',
            fee_status: client.fee_status,
            assigned_staff_id: client.assigned_staff_id,
            assigned_staff_name: client.assigned_staff_id ? (userMap[client.assigned_staff_id] || 'Unknown') : null,
            processing_staff_id: client.processing_staff_id,
            processing_staff_name: client.processing_staff_id ? (userMap[client.processing_staff_id] || 'Unknown') : null,
            created_at: client.created_at,
            updated_at: client.updated_at,
          };
        });

      if (req.query.metricsOnly === 'true') {
        return res.json({ metrics });
      }

      res.json({
        role: role,
        metrics,
        staffPerformance: staffPerformance || [],
        assignedByMe: assignedByMe || [],
        attendanceOverview,
        recentLeads,
        recentClients,
      });
    }
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

module.exports = router;
