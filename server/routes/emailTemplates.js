const express = require('express');
const db = require('../config/database');
const { authenticate, requireAdmin } = require('../middleware/auth');
const emailService = require('../services/emailService');

const router = express.Router();

// Get all email templates (ADMIN only)
router.get('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const templates = await db.getEmailTemplates();
    res.json(templates);
  } catch (error) {
    console.error('Get email templates error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Get single email template (ADMIN only)
router.get('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const templateId = parseInt(req.params.id);
    const templates = db.getEmailTemplates({ id: templateId });
    if (templates.length === 0) {
      return res.status(404).json({ error: 'Email template not found' });
    }
    res.json(templates[0]);
  } catch (error) {
    console.error('Get email template error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Create email template (ADMIN only)
router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, subject, body, type, active } = req.body;
    
    if (!name || !subject || !body) {
      return res.status(400).json({ error: 'Name, subject, and body are required' });
    }
    
    // Deactivate other templates of the same type if this one is active
    if (active) {
      const existingTemplates = await db.getEmailTemplates({ type: type || 'follow_up' });
      for (const t of existingTemplates) {
        if (t.active) {
          await db.updateEmailTemplate(t.id, { active: false });
        }
      }
    }
    
    const template = await db.createEmailTemplate({
      name,
      subject,
      body,
      type: type || 'follow_up',
      active: active !== undefined ? active : true,
    });
    
    res.status(201).json(template);
  } catch (error) {
    console.error('Create email template error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Update email template (ADMIN only)
router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const templateId = parseInt(req.params.id);
    const { name, subject, body, type, active } = req.body;
    
    const existingTemplates = db.getEmailTemplates({ id: templateId });
    if (existingTemplates.length === 0) {
      return res.status(404).json({ error: 'Email template not found' });
    }
    
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (subject !== undefined) updates.subject = subject;
    if (body !== undefined) updates.body = body;
    if (type !== undefined) updates.type = type;
    if (active !== undefined) {
      updates.active = active;
      // Deactivate other templates of the same type if this one is being activated
      if (active) {
        const existingTemplates = db.getEmailTemplates({ type: type || existingTemplates[0].type });
        for (const t of existingTemplates) {
          if (t.id !== templateId && t.active) {
            await db.updateEmailTemplate(t.id, { active: false });
          }
        }
      }
    }
    
    const updatedTemplate = await db.updateEmailTemplate(templateId, updates);
    res.json(updatedTemplate);
  } catch (error) {
    console.error('Update email template error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Delete email template (ADMIN only)
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const templateId = parseInt(req.params.id);
    const deleted = await db.deleteEmailTemplate(templateId);
    if (!deleted) {
      return res.status(404).json({ error: 'Email template not found' });
    }
    res.json({ message: 'Email template deleted successfully' });
  } catch (error) {
    console.error('Delete email template error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Test email template (ADMIN only)
router.post('/:id/test', authenticate, requireAdmin, async (req, res) => {
  try {
    const templateId = parseInt(req.params.id);
    const { testEmail } = req.body;
    
    if (!testEmail) {
      return res.status(400).json({ error: 'Test email address is required' });
    }
    
    const templates = db.getEmailTemplates({ id: templateId });
    if (templates.length === 0) {
      return res.status(404).json({ error: 'Email template not found' });
    }
    
    const template = templates[0];
    const testLead = {
      name: 'Test Client',
      email: testEmail,
      phone_number: '1234567890',
      program: 'Test Program',
    };
    
    const result = await emailService.sendFollowUpEmail(testLead, template);
    res.json({ 
      message: 'Test email sent successfully', 
      messageId: result.messageId 
    });
  } catch (error) {
    console.error('Test email error:', error);
    res.status(500).json({ error: 'Failed to send test email', details: error.message });
  }
});

// Get email logs (ADMIN only)
router.get('/logs/all', authenticate, requireAdmin, async (req, res) => {
  try {
    const { lead_id, template_id, limit = 100 } = req.query;
    const filter = {};
    if (lead_id) filter.lead_id = parseInt(lead_id);
    if (template_id) filter.template_id = parseInt(template_id);
    
    const logs = await db.getEmailLogs(filter);
    res.json(logs.slice(0, parseInt(limit)));
  } catch (error) {
    console.error('Get email logs error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

module.exports = router;
