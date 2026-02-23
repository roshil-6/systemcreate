const axios = require('axios');

async function testHistory() {
    try {
        console.log('🔍 Testing /api/leads/import-history...');
        // We don't have a valid token easily, but the server should still log the attempt 
        // or return 401/403. If it returns 500, we found the issue.
        const response = await axios.get('http://localhost:5002/api/leads/import-history');
        console.log('✅ Status:', response.status);
    } catch (error) {
        if (error.response) {
            console.log('❌ Status:', error.response.status);
            console.log('📝 Response Data:', error.response.data);
        } else {
            console.error('❌ Error:', error.message);
        }
    }
}

testHistory();
