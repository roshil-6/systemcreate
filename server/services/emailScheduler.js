const cron = require('node-cron');
const db = require('../config/database');
const emailService = require('./emailService');

let schedulerRunning = false;

// Check and send follow-up emails
async function checkAndSendFollowUpEmails() {
  try {
    console.log('📧 Checking for leads that need follow-up emails...');
    
    // Get active email template
    const templates = db.getEmailTemplates({ active: true, type: 'follow_up' });
    if (templates.length === 0) {
      console.log('⚠️  No active follow-up email template found');
      return;
    }
    
    const template = templates[0]; // Use the first active template
    
    // Get today's date (YYYY-MM-DD)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    
    // Get all leads with follow_up_date matching today
    const allLeads = db.getLeads();
    const leadsToEmail = allLeads.filter(lead => {
      if (!lead.email || !lead.follow_up_date) return false;
      
      // Check if follow-up date is today
      const followUpDate = new Date(lead.follow_up_date);
      followUpDate.setHours(0, 0, 0, 0);
      const followUpDateStr = followUpDate.toISOString().split('T')[0];
      
      if (followUpDateStr !== todayStr) return false;
      
      // Check if email was already sent today for this lead
      const todayLogs = db.getEmailLogs({ lead_id: lead.id });
      const sentToday = todayLogs.some(log => {
        const logDate = new Date(log.sent_at);
        logDate.setHours(0, 0, 0, 0);
        return logDate.getTime() === today.getTime() && log.success;
      });
      
      return !sentToday;
    });
    
    console.log(`📧 Found ${leadsToEmail.length} leads that need follow-up emails today`);
    
    // Send emails
    let successCount = 0;
    let errorCount = 0;
    
    for (const lead of leadsToEmail) {
      try {
        await emailService.sendFollowUpEmail(lead, template);
        
        // Log successful email
        db.createEmailLog({
          lead_id: lead.id,
          template_id: template.id,
          recipient_email: lead.email,
          subject: template.subject,
          success: true,
          error: null,
        });
        
        successCount++;
        console.log(`✅ Sent follow-up email to ${lead.name} (${lead.email})`);
      } catch (error) {
        // Log failed email
        db.createEmailLog({
          lead_id: lead.id,
          template_id: template.id,
          recipient_email: lead.email,
          subject: template.subject,
          success: false,
          error: error.message,
        });
        
        errorCount++;
        console.error(`❌ Failed to send email to ${lead.name} (${lead.email}):`, error.message);
      }
    }
    
    console.log(`📧 Email sending complete: ${successCount} successful, ${errorCount} failed`);
  } catch (error) {
    console.error('❌ Error in email scheduler:', error);
  }
}

// Start the email scheduler
function startEmailScheduler() {
  if (schedulerRunning) {
    console.log('⚠️  Email scheduler is already running');
    return;
  }
  
  // Initialize email service
  emailService.initializeEmailTransporter();
  
  // Run every day at 9:00 AM
  cron.schedule('0 9 * * *', async () => {
    await checkAndSendFollowUpEmails();
  });
  
  // Also run immediately on startup (for testing)
  // Uncomment the line below if you want to test immediately
  // checkAndSendFollowUpEmails();
  
  schedulerRunning = true;
  console.log('✅ Email scheduler started (runs daily at 9:00 AM)');
}

// Stop the email scheduler
function stopEmailScheduler() {
  schedulerRunning = false;
  console.log('⏹️  Email scheduler stopped');
}

module.exports = {
  startEmailScheduler,
  stopEmailScheduler,
  checkAndSendFollowUpEmails,
};
