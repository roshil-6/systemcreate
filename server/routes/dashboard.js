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
    newLeads: leads.filter(l => l.status === 'New').length,
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

  if (role === 'ADMIN') {
    // Admin sees everyone
    return null; // null means all users
  } else if (role === 'SALES_TEAM_HEAD') {
    // Sales team head sees themselves + only their team members (those managed by them)
    const teamMembers = await db.getUsers({ managed_by: userId });
    return [userId, ...teamMembers.map(u => u.id)];
  } else if (role === 'SALES_TEAM' || role === 'PROCESSING') {
    // Sales team and processing see only themselves
    return [userId];
  } else if (role === 'STAFF') {
    // Legacy STAFF role - see only themselves
    return [userId];
  }

  return [userId]; // Default: only self
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
        if (teamMembers.length === 0) {
          return res.status(403).json({ error: 'Access denied. You can only view your own dashboard or your team members\' dashboards' });
        }
      }
    }

    // isSneha, isKripa, and isProcessingTeam are already declared above (lines 89-91)

    if (isProcessingTeam) {
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
        // Kripa's clients (assigned for processing)
        processingClients = await db.getClients({ processing_staff_id: staffId });

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
      const staffLeads = await db.getLeads({ assigned_staff_id: staffId });
      const metrics = buildLeadMetrics(staffLeads);

      // Get clients converted by this staff member (assigned_staff_id = staffId)
      const staffClients = await db.getClients({ assigned_staff_id: staffId });

      // Add client count to metrics
      metrics.totalClients = staffClients.length;

      // Get all leads with details for this staff member
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

    // Determine if this is a restricted view (not admin and not sales team head)
    // Sales team head should see the full dashboard with staff performance
    const isRestrictedView = role !== 'ADMIN' && role !== 'SALES_TEAM_HEAD';

    if (isRestrictedView) {
      // Restricted view - only accessible leads
      let allLeads = [];
      if (accessibleUserIds) {
        for (const staffId of accessibleUserIds) {
          const staffLeads = await db.getLeads({ assigned_staff_id: staffId });
          allLeads = [...allLeads, ...staffLeads];
        }
      }

      // Get clients for restricted view
      const restrictedClients = await db.getClients();

      // Get Sneha and Kripa user IDs dynamically
      let snehaUserId = null;
      let kripaUserId = null;
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

      try {
        const kripaUsers = await db.getUsers({ email: 'kripa@toniosenora.com' });
        if (kripaUsers.length > 0) {
          kripaUserId = kripaUsers[0].id;
        } else {
          const kripaByName = await db.getUsers({ name: 'Kripa' });
          if (kripaByName.length > 0) kripaUserId = kripaByName[0].id;
        }
      } catch (error) {
        console.error('Error finding Kripa user:', error);
      }

      const metrics = {
        ...buildLeadMetrics(allLeads),
        totalClients: restrictedClients.length,
        leadsByStatus: {
          'New': allLeads.filter(l => l.status === 'New').length,
          'Follow-up': allLeads.filter(l => l.status === 'Follow-up').length,
          'Prospect': allLeads.filter(l => l.status === 'Prospect').length,
          'Pending Lead': allLeads.filter(l => l.status === 'Pending Lead').length,
          'Not Eligible': allLeads.filter(l => l.status === 'Not Eligible').length,
          'Not Interested': allLeads.filter(l => l.status === 'Not Interested').length,
          'Registration Completed': allLeads.filter(l => l.status === 'Registration Completed').length, // Count from actual leads
        },
        clientsByStatus: {
          'Total Clients': restrictedClients.length,
          'With Sneha': snehaUserId ? restrictedClients.filter(c => c.processing_staff_id === snehaUserId || c.assigned_staff_id === snehaUserId).length : 0,
          'With Kripa': kripaUserId ? restrictedClients.filter(c => c.processing_staff_id === kripaUserId).length : 0,
          'Payment Pending': restrictedClients.filter(c => c.fee_status === 'Payment Pending').length,
          '1st Installment Completed': restrictedClients.filter(c => c.fee_status === '1st Installment Completed').length,
          'PTE Fee Paid': restrictedClients.filter(c => c.fee_status === 'PTE Fee Paid').length,
        },
      };

      // Log for debugging
      console.log('📊 Restricted view dashboard metrics:');
      console.log('  Total leads:', allLeads.length);
      console.log('  Total clients:', restrictedClients.length);
      console.log('  Registration Completed count:', metrics.leadsByStatus['Registration Completed']);

      // Recent activity
      const recentLeadsPromises = allLeads.slice(0, 5).map(async l => {
        let userName = 'Unknown';
        if (l.assigned_staff_id) {
          try {
            userName = await db.getUserName(l.assigned_staff_id) || 'Unknown';
          } catch (error) {
            console.error('Error getting user name:', error);
          }
        }
        return {
          type: 'status_change',
          lead_id: l.id,
          lead_name: l.name,
          status: l.status,
          timestamp: l.updated_at || l.created_at,
          user_name: userName,
        };
      });
      const recentLeads = await Promise.all(recentLeadsPromises);

      const allComments = await db.getComments(null);
      const userCommentsPromises = allComments
        .filter(c => c.lead_id)
        .slice(0, 5)
        .map(async c => {
          try {
            const leads = await db.getLeads({ id: c.lead_id });
            const lead = leads[0];
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
              timestamp: c.created_at,
              user_name: userName,
            };
          } catch (error) {
            console.error('Error processing comment:', error);
            return null;
          }
        });
      const userComments = (await Promise.all(userCommentsPromises)).filter(c => c !== null);
      const allActivity = [...recentLeads, ...userComments]
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 10);

      if (req.query.metricsOnly === 'true') {
        return res.json({ metrics });
      }

      const response = {
        role: role,
        metrics,
        recentActivity: allActivity,
        isRestricted: true
      };
      res.json(response);
    } else {
      // ADMIN or SALES_TEAM_HEAD dashboard
      let allLeads = [];
      let allUsers = [];

      if (role === 'ADMIN') {
        // Admin sees all leads and all users
        allLeads = await db.getLeads();
        allUsers = await db.getUsers();
        console.log('📊 After reload - Leads count:', allLeads.length);
        const allClientsCount = await db.getClients();
        console.log('📊 After reload - Clients count:', allClientsCount.length);
        console.log('📊 After reload - All users count:', allUsers.length);
        console.log('📊 All users:', allUsers.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role })));
        // Check if Sneha exists in allUsers
        const snehaUser = allUsers.find(u =>
          u.name === 'Sneha' || u.name === 'SNEHA' || u.email === 'sneha@toniosenora.com'
        );
        console.log('📊 Sneha user found?', snehaUser ? `Yes - ID: ${snehaUser.id}, Name: ${snehaUser.name}, Role: ${snehaUser.role}` : 'No - Sneha not found in database!');
      } else if (role === 'SALES_TEAM_HEAD') {
        // Sales team head sees leads assigned to themselves and ONLY their team members (managed by them)
        const teamMembers = await db.getUsers({ managed_by: userId });
        console.log('📊 Sales Team Head Dashboard:');
        console.log('  Team Head ID:', userId);
        console.log('  Team Head Name:', req.user.name);
        console.log('  Team Members Found:', teamMembers.length);

        const accessibleIds = [userId, ...teamMembers.map(u => u.id)];
        const allLeadsRaw = await db.getLeads();
        allLeads = allLeadsRaw.filter(l => !l.assigned_staff_id || accessibleIds.includes(l.assigned_staff_id));

        // Include team head + team members for staff performance
        allUsers = [req.user, ...teamMembers];
        console.log('  All Users (including team head):', allUsers.length);
      }

      const allAttendance = await db.getAttendance();
      // Get all clients for metrics - filter for sales team head
      let allClients = await db.getClients();
      if (role === 'SALES_TEAM_HEAD') {
        // Sales team head sees clients assigned to themselves and their team members
        const teamMembers = await db.getUsers({ managed_by: userId });
        const accessibleIds = [userId, ...teamMembers.map(u => u.id)];
        allClients = allClients.filter(c =>
          !c.assigned_staff_id || accessibleIds.includes(c.assigned_staff_id)
        );
      }

      // Get Sneha and Kripa user IDs dynamically
      let snehaUserId = null;
      let kripaUserId = null;
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

      try {
        const kripaUsers = await db.getUsers({ email: 'kripa@toniosenora.com' });
        if (kripaUsers.length > 0) {
          kripaUserId = kripaUsers[0].id;
        } else {
          const kripaByName = await db.getUsers({ name: 'Kripa' });
          if (kripaByName.length > 0) kripaUserId = kripaByName[0].id;
        }
      } catch (error) {
        console.error('Error finding Kripa user:', error);
      }

      // Log for debugging
      console.log('📊 Dashboard metrics calculation:');
      console.log('  Total leads:', allLeads.length);
      console.log('  Total clients:', allClients.length);
      console.log('  Registration Completed (from leads):', allLeads.filter(l => l.status === 'Registration Completed').length);
      console.log('  Registration Completed (from clients):', allClients.length);
      console.log('  Sneha User ID:', snehaUserId);
      console.log('  Kripa User ID:', kripaUserId);
      console.log('  All status counts from leads:');
      const statusCounts = {
        'New': allLeads.filter(l => l.status === 'New').length,
        'Follow-up': allLeads.filter(l => l.status === 'Follow-up').length,
        'Prospect': allLeads.filter(l => l.status === 'Prospect').length,
        'Pending Lead': allLeads.filter(l => l.status === 'Pending Lead').length,
        'Not Eligible': allLeads.filter(l => l.status === 'Not Eligible').length,
        'Not Interested': allLeads.filter(l => l.status === 'Not Interested').length,
        'Registration Completed': allLeads.filter(l => l.status === 'Registration Completed').length,
      };
      console.log('  ', JSON.stringify(statusCounts, null, 2));
      console.log('  All client status counts:');
      const clientStatusCounts = {
        'Total Clients': allClients.length,
        'With Sneha': snehaUserId ? allClients.filter(c => c.processing_staff_id === snehaUserId || c.assigned_staff_id === snehaUserId).length : 0,
        'With Kripa': kripaUserId ? allClients.filter(c => c.processing_staff_id === kripaUserId).length : 0,
        'Payment Pending': allClients.filter(c => c.fee_status === 'Payment Pending').length,
        '1st Installment Completed': allClients.filter(c => c.fee_status === '1st Installment Completed').length,
        'PTE Fee Paid': allClients.filter(c => c.fee_status === 'PTE Fee Paid').length,
      };
      console.log('  ', JSON.stringify(clientStatusCounts, null, 2));
      if (allLeads.length > 0) {
        console.log('  Sample lead statuses:', allLeads.slice(0, 5).map(l => ({ id: l.id, name: l.name, status: l.status })));
      }
      if (allClients.length > 0) {
        console.log('  Sample client fee statuses:', allClients.slice(0, 5).map(c => ({ id: c.id, name: c.name, fee_status: c.fee_status })));
      }

      const metrics = {
        totalLeads: allLeads.length,
        totalClients: allClients.length, // Add total clients count
        leadsByStatus: {
          'New': allLeads.filter(l => l.status === 'New').length,
          'Follow-up': allLeads.filter(l => l.status === 'Follow-up').length,
          'Prospect': allLeads.filter(l => l.status === 'Prospect').length,
          'Pending Lead': allLeads.filter(l => l.status === 'Pending Lead').length,
          'Not Eligible': allLeads.filter(l => l.status === 'Not Eligible').length,
          'Not Interested': allLeads.filter(l => l.status === 'Not Interested').length,
          'Registration Completed': allLeads.filter(l => l.status === 'Registration Completed').length, // Count from actual leads
        },
        clientsByStatus: {
          'Total Clients': allClients.length,
          'With Sneha': snehaUserId ? allClients.filter(c => c.processing_staff_id === snehaUserId || c.assigned_staff_id === snehaUserId).length : 0,
          'With Kripa': kripaUserId ? allClients.filter(c => c.processing_staff_id === kripaUserId).length : 0,
          'Payment Pending': allClients.filter(c => c.fee_status === 'Payment Pending').length,
          '1st Installment Completed': allClients.filter(c => c.fee_status === '1st Installment Completed').length,
          'PTE Fee Paid': allClients.filter(c => c.fee_status === 'PTE Fee Paid').length,
        },
      };

      // Staff performance - show all non-admin users (or team members for sales team head)
      // Exception: Include Sneha and Kripa even if they're ADMIN (they're in processing team)
      let staffUsers = [];
      let staffPerformance = []; // Initialize to empty array to ensure it's always defined
      if (role === 'ADMIN') {
        staffUsers = allUsers.filter(u => {
          // Include if not ADMIN, OR if it's Sneha or Kripa (processing team members)
          const isSneha = u.name === 'Sneha' || u.name === 'SNEHA' || u.email === 'sneha@toniosenora.com';
          const isKripa = u.name === 'Kripa' || u.name === 'KRIPA' || u.email === 'kripa@toniosenora.com';
          return u.role !== 'ADMIN' || isSneha || isKripa;
        });
        console.log('📊 Staff Performance - All users:', allUsers.length);
        console.log('📊 Staff Performance - After filtering (including Sneha/Kripa if ADMIN):', staffUsers.length);
        console.log('📊 Staff Performance - User names:', staffUsers.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role })));
        // Check if Sneha is in the list
        const snehaInList = staffUsers.find(u =>
          u.name === 'Sneha' || u.name === 'SNEHA' || u.email === 'sneha@toniosenora.com'
        );
        console.log('📊 Sneha in staff list?', snehaInList ? `Yes - ID: ${snehaInList.id}, Role: ${snehaInList.role}` : 'No');
      } else if (role === 'SALES_TEAM_HEAD') {
        // Sales team head sees themselves and their team members
        // CRITICAL: Use allUsers which already includes team head + team members
        staffUsers = allUsers;
        console.log('📊 Sales Team Head - Staff Users for Performance:');
        console.log('  All Users Count:', allUsers.length);
        console.log('  All Users:', allUsers.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role })));
        console.log('  Staff Users Count:', staffUsers.length);
        console.log('  Staff Users:', staffUsers.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role })));

        // Ensure at least the team head is included (safety check)
        if (staffUsers.length === 0) {
          console.error('❌ CRITICAL ERROR: No staff users found for sales team head!');
          console.error('  This should never happen. Adding team head themselves as fallback.');
          staffUsers = [req.user];
        }
      }

      // CRITICAL: Always create staffPerformance for ALL staffUsers, even if they have 0 leads/clients
      staffPerformance = staffUsers.map(staff => {
        const staffLeads = allLeads.filter(l => l.assigned_staff_id === staff.id);
        const staffClients = allClients.filter(c => c.assigned_staff_id === staff.id);
        const performance = {
          id: staff.id,
          name: staff.name,
          email: staff.email, // Include email for processing team detection
          total_leads: staffLeads.length,
          converted_leads: staffClients.length, // Show actual converted clients, not "Pending Lead" status
          clients_in_processing: staffClients.filter(c => c.processing_staff_id !== null).length,
        };
        console.log(`  Staff Performance for ${staff.name}:`, {
          total_leads: performance.total_leads,
          converted_leads: performance.converted_leads,
          clients_in_processing: performance.clients_in_processing
        });
        return performance;
      }).sort((a, b) => {
        // Sort by total_leads descending, but if equal, sort by name
        if (b.total_leads !== a.total_leads) {
          return b.total_leads - a.total_leads;
        }
        return a.name.localeCompare(b.name);
      });

      // Log staff performance for sales team head
      if (role === 'SALES_TEAM_HEAD') {
        console.log('📊 Sales Team Head - Final Staff Performance:');
        console.log('  Staff Performance Count:', staffPerformance.length);
        console.log('  Staff Performance:', JSON.stringify(staffPerformance.map(s => ({
          id: s.id,
          name: s.name,
          email: s.email,
          total_leads: s.total_leads,
          converted_leads: s.converted_leads
        })), null, 2));

        // Additional check
        if (staffPerformance.length === 0) {
          console.error('❌ WARNING: Sales Team Head has empty staffPerformance array!');
          console.error('  staffUsers length:', staffUsers.length);
          console.error('  allUsers length:', allUsers.length);
        }
      }

      // Attendance overview (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const recentAttendance = allAttendance.filter(a =>
        new Date(a.check_in) >= sevenDaysAgo
      );

      const attendanceByDate = {};
      recentAttendance.forEach(a => {
        const date = a.check_in.split('T')[0];
        if (!attendanceByDate[date]) {
          attendanceByDate[date] = new Set();
        }
        attendanceByDate[date].add(a.user_id);
      });

      const attendanceOverview = Object.entries(attendanceByDate)
        .map(([date, userIds]) => ({
          date,
          staff_count: userIds.size,
        }))
        .sort((a, b) => b.date.localeCompare(a.date));

      // Recent leads (last 20, sorted by most recent)
      const recentLeadsPromises = allLeads
        .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
        .slice(0, 20)
        .map(async lead => {
          let assignedStaffName = null;
          if (lead.assigned_staff_id) {
            try {
              assignedStaffName = await db.getUserName(lead.assigned_staff_id);
            } catch (error) {
              console.error('Error getting assigned staff name:', error);
            }
          }
          return {
            id: lead.id,
            name: lead.name,
            phone_number: lead.phone_number,
            phone_country_code: lead.phone_country_code,
            email: lead.email,
            status: lead.status,
            priority: lead.priority,
            assigned_staff_id: lead.assigned_staff_id,
            assigned_staff_name: assignedStaffName,
            created_at: lead.created_at,
            updated_at: lead.updated_at,
          };
        });
      const recentLeads = await Promise.all(recentLeadsPromises);

      // Recent clients (last 20, sorted by most recent)
      const recentClientsPromises = allClients
        .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
        .slice(0, 20)
        .map(async client => {
          let assignedStaffName = null;
          let processingStaffName = null;

          if (client.assigned_staff_id) {
            try {
              assignedStaffName = await db.getUserName(client.assigned_staff_id);
            } catch (error) {
              console.error('Error getting assigned staff name:', error);
            }
          }

          if (client.processing_staff_id) {
            try {
              processingStaffName = await db.getUserName(client.processing_staff_id);
            } catch (error) {
              console.error('Error getting processing staff name:', error);
            }
          }

          return {
            id: client.id,
            name: client.name,
            phone_number: client.phone_number,
            phone_country_code: client.phone_country_code,
            email: client.email,
            status: 'Client',
            fee_status: client.fee_status,
            assigned_staff_id: client.assigned_staff_id,
            assigned_staff_name: assignedStaffName,
            processing_staff_id: client.processing_staff_id,
            processing_staff_name: processingStaffName,
            created_at: client.created_at,
            updated_at: client.updated_at,
          };
        });
      const recentClients = await Promise.all(recentClientsPromises);

      // Set cache-control header to prevent caching
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');

      // Log response for debugging
      console.log('📤 Sending dashboard response:');
      console.log('  Role:', role);
      console.log('  Registration Completed:', metrics.leadsByStatus['Registration Completed']);
      console.log('  Total Clients:', metrics.totalClients);
      console.log('  Staff Performance Count:', staffPerformance ? staffPerformance.length : 'NULL/UNDEFINED');
      console.log('  Staff Performance Type:', typeof staffPerformance);
      console.log('  Staff Performance Is Array:', Array.isArray(staffPerformance));
      if (role === 'SALES_TEAM_HEAD') {
        console.log('  Staff Performance Details:', JSON.stringify(staffPerformance, null, 2));
        console.log('  Staff Performance First Item:', staffPerformance && staffPerformance.length > 0 ? staffPerformance[0] : 'NONE');
      }
      console.log('  All status counts:', JSON.stringify(metrics.leadsByStatus, null, 2));

      // Final check before sending response
      if (role === 'SALES_TEAM_HEAD') {
        console.log('🔍 FINAL CHECK before sending response:');
        console.log('  staffPerformance variable exists?', typeof staffPerformance !== 'undefined');
        console.log('  staffPerformance value:', staffPerformance);
        console.log('  staffPerformance type:', typeof staffPerformance);
        console.log('  staffPerformance isArray:', Array.isArray(staffPerformance));
        console.log('  staffPerformance length:', staffPerformance ? staffPerformance.length : 'N/A');
      }

      if (req.query.metricsOnly === 'true') {
        return res.json({ metrics });
      }

      const responseData = {
        role: role, // Use actual role (ADMIN or SALES_TEAM_HEAD)
        metrics,
        staffPerformance: staffPerformance || [], // Ensure it's always an array
        attendanceOverview,
        recentLeads,
        recentClients, // Add recent clients to dashboard
      };

      res.json(responseData);
    }
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

module.exports = router;
