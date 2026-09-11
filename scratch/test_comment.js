const path = require('path');
module.paths.push('c:/Users/Abhinand Antony/Desktop/CRM/server/node_modules');

require('dotenv').config({ path: 'c:/Users/Abhinand Antony/Desktop/CRM/server/.env' });

const db = require('c:/Users/Abhinand Antony/Desktop/CRM/server/config/database');

async function testComment() {
  try {
    console.log('Testing createComment...');
    
    // Pick an existing user and lead
    const users = await db.getUsers({ role: 'ADMIN' });
    if (!users.length) throw new Error('No admin users found');
    const user = users[0];
    
    // Pick first lead
    const result = await db.getLeads({});
    if (!result.length) throw new Error('No leads found');
    const lead = result[0];
    
    const commentData = {
      lead_id: lead.id,
      user_id: user.id,
      comment: 'Test comment from debug script',
    };
    
    console.log('Inserting comment:', commentData);
    const comment = await db.createComment(commentData);
    console.log('Success:', comment);
    
    // Verify it was saved
    const comments = await db.getComments(lead.id);
    console.log(`Lead ${lead.id} now has ${comments.length} comments.`);
    
    process.exit(0);
  } catch (error) {
    console.error('Failed to create comment:', error);
    process.exit(1);
  }
}

testComment();
