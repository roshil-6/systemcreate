const nodemailer = require('nodemailer');

// Email transporter configuration
let transporter = null;

// Initialize email transporter
function initializeEmailTransporter() {
  const emailConfig = {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      password: process.env.SMTP_PASSWORD,
    },
  };

  // Only create transporter if credentials are provided
  if (emailConfig.auth.user && emailConfig.auth.password) {
    transporter = nodemailer.createTransport(emailConfig);
    console.log('✅ Email service initialized');
    return true;
  } else {
    console.log('⚠️  Email service not configured (SMTP credentials missing)');
    return false;
  }
}

// Send email
async function sendEmail(to, subject, html, text = null) {
  if (!transporter) {
    if (!initializeEmailTransporter()) {
      throw new Error('Email service not configured. Please set SMTP credentials in .env file.');
    }
  }

  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: to,
    subject: subject,
    html: html,
    text: text || html.replace(/<[^>]*>/g, ''), // Strip HTML for text version
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email sent successfully:', info.messageId);
    return {
      success: true,
      messageId: info.messageId,
      response: info.response,
    };
  } catch (error) {
    console.error('❌ Error sending email:', error);
    throw error;
  }
}

// Replace template variables in email content
function replaceTemplateVariables(template, variables) {
  let content = template;
  Object.keys(variables).forEach(key => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    content = content.replace(regex, variables[key] || '');
  });
  return content;
}

// Send follow-up email to lead
async function sendFollowUpEmail(lead, template) {
  if (!lead.email) {
    throw new Error('Lead does not have an email address');
  }

  const variables = {
    name: lead.name || 'Valued Client',
    email: lead.email || '',
    phone: lead.phone_number || '',
    program: lead.program || '',
    // Add more variables as needed
  };

  const subject = replaceTemplateVariables(template.subject || 'Follow-up from Tonio & Senora', variables);
  const html = replaceTemplateVariables(template.body, variables);

  return await sendEmail(lead.email, subject, html);
}

module.exports = {
  initializeEmailTransporter,
  sendEmail,
  sendFollowUpEmail,
  replaceTemplateVariables,
};
