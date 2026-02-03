const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Test route to verify clients route is loaded (no auth for testing)
router.get('/test', (req, res) => {
  res.json({ message: 'Clients route is working!', timestamp: new Date().toISOString() });
});

// Debug route to check all clients (admin only)
router.get('/debug/all', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const allClients = await db.getClients({});
    const clientsInfo = allClients.map(c => ({
      id: c.id,
      name: c.name,
      assigned_staff_id: c.assigned_staff_id,
      processing_staff_id: c.processing_staff_id,
      processing_status: c.processing_status,
    }));

    res.json({
      total: allClients.length,
      clients: clientsInfo,
    });
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Get all clients (with role-based filtering)
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;
    const { fee_status, search, processing_staff_id } = req.query;

    console.log('📥 GET /api/clients - Query params:', { fee_status, search, processing_staff_id, userId, role });

    const filter = {};

    // All staff can see all clients (but payment data is restricted)
    // No filtering by assigned_staff_id - everyone sees all clients
    // Exception: If processing_staff_id query param is provided, filter by that (for Kripa dashboard)

    if (fee_status) {
      filter.fee_status = fee_status;
    }

    // Filter by processing_staff_id if provided (for Kripa dashboard)
    if (processing_staff_id !== undefined && processing_staff_id !== null && processing_staff_id !== '') {
      const pStaffId = Number(processing_staff_id);

      // Special logic for Kripa: She should see her own processing tasks AND Sneha's clients
      const userName = req.user.name || '';
      const userEmail = req.user.email || '';
      const isKripa = userName === 'Kripa' || userName === 'KRIPA' || userEmail === 'kripa@toniosenora.com';

      if (isKripa && pStaffId === userId) {
        console.log('🔍 Kripa accessing clients - including Sneha\'s clients');

        // Find Sneha's ID
        let snehaId = null;
        try {
          const snehaUsers = await db.getUsers({ email: 'sneha@toniosenora.com' });
          if (snehaUsers.length > 0) snehaId = snehaUsers[0].id;
          else {
            const snehaByName = await db.getUsers({ name: 'Sneha' });
            if (snehaByName.length > 0) snehaId = snehaByName[0].id;
          }
        } catch (e) { console.error('Error finding Sneha:', e); }

        if (snehaId) {
          // We need a custom filter that db.getClients might not support directly via simple object
          // So we will fetch all clients and filter in memory (SQLite is fast enough for this scale)
          // OR we pass a special flag if db.getClients supported it. 
          // Since db.getClients implementation is simplistic, we'll fetch broader and filter here.
          // BUT db.getClients uses dynamic query building.
          // Let's rely on fetching all and filtering here for Kripa specific case to be safe, 
          // or we can't easily express OR condition with the current db helper.

          // Fetch all clients (we will filter manually)
          // We don't set filter.processing_staff_id here
        } else {
          filter.processing_staff_id = pStaffId;
        }
      } else {
        filter.processing_staff_id = pStaffId;
      }
    }

    // Filter by assigned_staff_id if provided (for Sneha dashboard)
    // IMPORTANT: If this is Sneha or Kripa, we don't apply this filter strictly at the DB level
    // because they might be assigned via processing_staff_id instead. 
    // We will do the specific filtering in memory later.
    const userNameRaw = (req.user.name || '').toLowerCase();
    const userEmailRaw = (req.user.email || '').toLowerCase();
    const isProcessingStaff = userNameRaw === 'sneha' || userNameRaw === 'kripa' ||
      userEmailRaw === 'sneha@toniosenora.com' || userEmailRaw === 'kripa@toniosenora.com';

    if (req.query.assigned_staff_id && !isProcessingStaff) {
      filter.assigned_staff_id = Number(req.query.assigned_staff_id);
      console.log('🔍 Filtering clients by assigned_staff_id (Non-processing staff):', filter.assigned_staff_id);
    } else if (req.query.assigned_staff_id) {
      console.log('🔍 Filtering clients for processing staff - skipping strict DB filter for assigned_staff_id');
    }

    if (search) {
      filter.search = search;
    }

    // CRITICAL: Check database state first
    const allClientsRaw = await db.getClients({});
    console.log(`📊 Total clients in database (before filter): ${allClientsRaw.length}`);
    if (allClientsRaw.length > 0) {
      console.log('📋 Sample client from DB:', {
        id: allClientsRaw[0].id,
        name: allClientsRaw[0].name,
        processing_staff_id: allClientsRaw[0].processing_staff_id,
        processing_staff_id_type: typeof allClientsRaw[0].processing_staff_id
      });
    }

    let clients = await db.getClients(filter);
    console.log(`📊 Found ${clients.length} clients with filter:`, JSON.stringify(filter, null, 2));

    // Custom filtering for Processing Team (Kripa & Sneha)
    if (Number(processing_staff_id) === userId || req.query.assigned_staff_id) {
      const userName = req.user.name || '';
      const userEmail = req.user.email || '';
      const isKripa = userName.toLowerCase() === 'kripa' || userEmail.toLowerCase() === 'kripa@toniosenora.com';
      const isSneha = userName.toLowerCase() === 'sneha' || userEmail.toLowerCase() === 'sneha@toniosenora.com';

      if (isKripa || isSneha) {
        // Find Sneha's ID if we're Kripa, or use userId if we're Sneha
        let snehaId = isSneha ? userId : null;
        if (isKripa) {
          try {
            const snehaUsers = await db.getUsers({ email: 'sneha@toniosenora.com' });
            if (snehaUsers.length > 0) snehaId = snehaUsers[0].id;
            else {
              const snehaByName = await db.getUsers({ name: 'Sneha' });
              if (snehaByName.length > 0) snehaId = snehaByName[0].id;
            }
          } catch (e) { }
        }

        if (snehaId || isKripa) {
          const originalCount = clients.length;
          clients = clients.filter(c => {
            if (isKripa) {
              // Kripa sees: HER processing tasks OR Sneha's processing tasks OR Sneha's assigned clients
              return c.processing_staff_id === userId ||
                (snehaId && (c.processing_staff_id === snehaId || c.assigned_staff_id === snehaId));
            } else {
              // Sneha sees: HER processing tasks OR HER assigned clients
              return c.processing_staff_id === userId || c.assigned_staff_id === userId;
            }
          });
          console.log(`✅ ${isKripa ? 'Kripa' : 'Sneha'} Filter: Filtered ${originalCount} clients down to ${clients.length}`);
        }
      }
    }

    // Debug: Log filter details if processing_staff_id is provided
    if (filter.processing_staff_id !== undefined && filter.processing_staff_id !== null) {
      console.log(`🔍 Filtering by processing_staff_id = ${filter.processing_staff_id} (type: ${typeof filter.processing_staff_id})`);
    }

    // For non-admin roles, restrict payment data visibility - Only Admin, Sneha, Kripa, and Emy (monitoring) can see payment data
    const userName = req.user.name || '';
    const userEmail = req.user.email || '';
    const isEmy = userName === 'Emy' || userName === 'EMY' || userEmail === 'emy@toniosenora.com';
    const canViewPaymentData = role === 'ADMIN' ||
      userName === 'Sneha' || userName === 'SNEHA' || userEmail === 'sneha@toniosenora.com' ||
      userName === 'Kripa' || userName === 'KRIPA' || userEmail === 'kripa@toniosenora.com' ||
      isEmy; // Emy has monitoring access

    // Filter payment data for unauthorized users (but show all other client data)
    if (!canViewPaymentData) {
      clients = clients.map(client => {
        const { amount_paid, fee_status, registration_fee_paid, ...rest } = client;
        // Return all client data except payment fields
        // IMPORTANT: Keep processing_staff_id and all other fields
        return rest;
      });
    }

    console.log(`✅ Returning ${clients.length} clients to ${role} user ${userId} (${req.user.name || req.user.email})`);
    if (filter.processing_staff_id) {
      console.log(`✅ Filtered by processing_staff_id=${filter.processing_staff_id}, returning ${clients.length} clients`);
      clients.forEach(c => {
        console.log(`  - Client ${c.id}: ${c.name}, processing_staff_id: ${c.processing_staff_id}`);
      });
    }

    res.json(clients);
  } catch (error) {
    console.error('Get clients error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Get single client
router.get('/:id', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;
    const clientId = parseInt(req.params.id);

    const clients = await db.getClients({ id: clientId });
    const client = clients[0];

    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // All staff can view all clients (access control removed for viewing)
    // Payment data visibility is controlled below

    // Check payment data visibility - Only Admin, Sneha, Kripa, and Emy (monitoring) can see payment data
    const userName = req.user.name || '';
    const userEmail = req.user.email || '';
    const isEmy = userName === 'Emy' || userName === 'EMY' || userEmail === 'emy@toniosenora.com';
    const canViewPaymentData = role === 'ADMIN' ||
      userName === 'Sneha' || userName === 'SNEHA' || userEmail === 'sneha@toniosenora.com' ||
      userName === 'Kripa' || userName === 'KRIPA' || userEmail === 'kripa@toniosenora.com' ||
      isEmy; // Emy has monitoring access

    if (!canViewPaymentData) {
      // Remove payment fields and assigned_staff_id but keep all other client data
      const { amount_paid, fee_status, registration_fee_paid, assigned_staff_id, ...rest } = client;
      return res.json(rest);
    }

    res.json(client);
  } catch (error) {
    console.error('Get client error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Create client (from lead conversion)
router.post('/', authenticate, [
  body('name').notEmpty().withMessage('Name is required'),
  body('assessment_authority').notEmpty().withMessage('Assessment Authority is required'),
  body('occupation_mapped').notEmpty().withMessage('Occupation Mapped is required'),
  body('registration_fee_paid').notEmpty().withMessage('Registration Fee Paid is required'),
], async (req, res) => {
  try {
    console.log('📥 POST /api/clients - Request received');
    console.log('Request body:', JSON.stringify(req.body, null, 2));

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Validation errors:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user.id;
    const {
      // Lead data
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
      country, // Keep for backward compatibility
      target_country,
      residing_country,
      program,
      assigned_staff_id,
      // Registration data
      assessment_authority,
      occupation_mapped,
      registration_fee_paid,
      lead_id, // ID of the lead being converted
    } = req.body;

    // Create client from lead data
    const clientData = {
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
      country: country || null, // Keep for backward compatibility
      target_country: target_country || country || null,
      residing_country: residing_country || null,
      program: program || null,
      assigned_staff_id: assigned_staff_id || userId,
      // Registration fields
      assessment_authority,
      occupation_mapped,
      registration_fee_paid: registration_fee_paid === 'Yes' || registration_fee_paid === true,
      // Processing fields
      amount_paid: null,
      fee_status: null,
      processing_staff_id: null,
      processing_status: null,
      payment_due_date: null,
      completed_actions: [], // Track all completed processing actions
      lead_id, // Track which lead this came from
      created_by: userId,
    };

    console.log('📝 About to create client with data:', JSON.stringify(clientData, null, 2));
    const newClient = await db.createClient(clientData);
    console.log('✅ Client created:', newClient.id);

    // Verify client exists in database
    const verifyClients = await db.getClients({ id: newClient.id });
    const verifyClient = verifyClients[0];
    if (!verifyClient) {
      console.error('❌ CRITICAL: Client was created but not found in database!');
      console.error('❌ Client data:', newClient);
      const allClientsCheck = await db.getClients({});
      console.error('❌ All clients in DB:', allClientsCheck);
    } else {
      console.log('✅ Verification: Client found in database:', verifyClient.id, verifyClient.name);
    }

    // If lead_id provided, update the lead status to "Registration Completed" (don't delete)
    // Note: Lead status should already be "Registration Completed" before this point
    if (lead_id) {
      try {
        const existingLeads = await db.getLeads({ id: lead_id });
        if (existingLeads.length > 0) {
          const lead = existingLeads[0];
          if (lead.status === 'Registration Completed') {
            // Lead is already marked as completed, that's fine
            console.log(`✅ Lead ${lead_id} already marked as Registration Completed`);
          } else {
            // Update lead status to Registration Completed
            await db.updateLead(lead_id, { status: 'Registration Completed' });
            console.log(`✅ Lead ${lead_id} updated to Registration Completed after conversion to client ${newClient.id}`);
          }
        } else {
          console.log(`⚠️ Lead ${lead_id} not found in database. May have already been removed.`);
        }
      } catch (error) {
        console.error(`⚠️ Error updating lead ${lead_id}:`, error.message);
      }
    }

    // Find Sneha user to assign client to (check by email first, then name)
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
      // Auto-assign to Sneha
      const updatedClient = await db.updateClient(newClient.id, {
        assigned_staff_id: snehaUser.id,
      });

      // Create notification for Sneha
      await db.createNotification({
        user_id: snehaUser.id,
        client_id: newClient.id,
        type: 'client_assigned',
        message: `New client "${name}" has been assigned to you (Registration Completed)`,
        created_by: userId,
      });
    }

    console.log('✅ Sending response for client:', newClient.id);
    res.status(201).json(newClient);
  } catch (error) {
    console.error('❌ Create client error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Update client
router.put('/:id', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;
    const clientId = parseInt(req.params.id);

    const existingClients = await db.getClients({ id: clientId });
    const existingClient = existingClients[0];

    if (!existingClient) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // Check access - Sneha and Kripa have full edit access
    const assignedId = existingClient.assigned_staff_id ? Number(existingClient.assigned_staff_id) : null;
    const processingId = existingClient.processing_staff_id ? Number(existingClient.processing_staff_id) : null;
    const userName = (req.user.name || '').toLowerCase().trim();
    const userEmail = (req.user.email || '').toLowerCase().trim();
    const isSneha = userName === 'sneha' || userEmail === 'sneha@toniosenora.com';
    const isKripa = userName === 'kripa' || userEmail === 'kripa@toniosenora.com';

    if (role === 'STAFF' || role === 'SALES_TEAM' || role === 'PROCESSING') {
      if (!isSneha && !isKripa) {
        // Regular staff can only update their own clients
        if (assignedId !== userId && processingId !== userId) {
          return res.status(403).json({ error: 'You can only update clients assigned to you' });
        }
      }
      // Sneha and Kripa have full access regardless
    } else if (role === 'SALES_TEAM_HEAD') {
      const teamMembers = await db.getUsers({ managed_by: userId });
      const teamMemberIds = teamMembers.map(u => u.id);
      if (assignedId !== userId && !teamMemberIds.includes(assignedId)) {
        return res.status(403).json({ error: 'You can only update clients assigned to you or your team' });
      }
    }

    const updates = {};
    const allowedFields = [
      'name', 'phone_number', 'phone_country_code', 'whatsapp_number', 'whatsapp_country_code',
      'email', 'age', 'occupation', 'qualification', 'year_of_experience', 'country', 'target_country', 'residing_country', 'program',
      'assessment_authority', 'occupation_mapped', 'registration_fee_paid',
      'amount_paid', 'fee_status', 'processing_staff_id', 'processing_status', 'payment_due_date',
      'completed_actions' // Array of completed processing actions: ['Hand over to Australia', 'Confirming pending payment done', 'Service agreement submitted']
    ];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        // Convert processing_staff_id to number if it's provided
        if (field === 'processing_staff_id' && req.body[field] !== null && req.body[field] !== undefined) {
          updates[field] = Number(req.body[field]);
          console.log(`📝 Converting ${field} from ${req.body[field]} (${typeof req.body[field]}) to ${updates[field]} (${typeof updates[field]})`);
        } else {
          updates[field] = req.body[field];
        }
      }
    });

    console.log('📝 Final updates object:', JSON.stringify(updates, null, 2));

    // Handle fee_status changes
    if (updates.fee_status === 'Payment Pending' && !existingClient.payment_due_date) {
      // Set 10-day timer (shows due 2 days before)
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 10);
      updates.payment_due_date = dueDate.toISOString();
      console.log(`⏰ Payment due date set to: ${dueDate.toISOString()} (10 days from now)`);
    } else if (updates.fee_status !== 'Payment Pending') {
      // Clear due date if not pending
      updates.payment_due_date = null;
    }

    // Handle completed_actions (for Kripa's processing tasks)
    if (updates.completed_actions !== undefined) {
      // Ensure it's an array
      if (!Array.isArray(updates.completed_actions)) {
        updates.completed_actions = [];
      }
      // Valid processing actions
      const validActions = [
        'Hand over to Australia',
        'Confirming pending payment done',
        'Service agreement submitted'
      ];
      // Filter to only include valid actions
      updates.completed_actions = updates.completed_actions.filter(action => validActions.includes(action));
    }

    // Handle assignment to Kripa
    if (updates.processing_staff_id) {
      let kripaUsers = await db.getUsers({ email: 'kripa@toniosenora.com' });
      let kripaUser = kripaUsers[0];
      if (!kripaUser) {
        kripaUsers = await db.getUsers({ name: 'Kripa' });
        kripaUser = kripaUsers[0];
      }
      if (!kripaUser) {
        kripaUsers = await db.getUsers({ name: 'KRIPA' });
        kripaUser = kripaUsers[0];
      }

      const processingStaffId = Number(updates.processing_staff_id);
      console.log('🔔 Assigning client to processing staff:', processingStaffId);
      console.log('Kripa user ID:', kripaUser?.id);

      if (kripaUser && processingStaffId === kripaUser.id) {
        // Create notification for Kripa
        try {
          const notification = await db.createNotification({
            user_id: kripaUser.id,
            client_id: clientId,
            type: 'client_assigned_processing',
            message: `Client "${existingClient.name}" has been assigned to you for processing`,
            created_by: userId,
          });
          console.log('✅ Notification created for Kripa:', notification);
        } catch (error) {
          console.error('Error creating notification for Kripa:', error);
        }
      } else {
        console.log('⚠️ Kripa user not found or ID mismatch');
      }
    }

    console.log('📝 Updating client with:', JSON.stringify(updates, null, 2));
    console.log('📝 Processing staff ID in updates:', updates.processing_staff_id, '(type:', typeof updates.processing_staff_id, ')');

    const updatedClient = await db.updateClient(clientId, updates);

    if (!updatedClient) {
      return res.status(404).json({ error: 'Client not found' });
    }

    console.log('✅ Client updated. New processing_staff_id:', updatedClient.processing_staff_id, '(type:', typeof updatedClient.processing_staff_id, ')');
    console.log('✅ Client updated. New processing_status:', updatedClient.processing_status);

    // Verify the save worked by reading it back
    const verifyClients = await db.getClients({ id: clientId });
    const verifyClient = verifyClients[0];
    if (verifyClient) {
      console.log('🔍 Verification - Client from DB:', {
        id: verifyClient.id,
        name: verifyClient.name,
        processing_staff_id: verifyClient.processing_staff_id,
        processing_staff_id_type: typeof verifyClient.processing_staff_id
      });
    }

    res.json(updatedClient);
  } catch (error) {
    console.error('Update client error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Delete client
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const role = req.user.role;

    if (role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only admin can delete clients' });
    }

    const clientId = parseInt(req.params.id);
    const deleted = await db.deleteClient(clientId);

    if (!deleted) {
      return res.status(404).json({ error: 'Client not found' });
    }

    res.json({ success: true, message: 'Client deleted successfully' });
  } catch (error) {
    console.error('Delete client error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

module.exports = router;
