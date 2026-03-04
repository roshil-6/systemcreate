const axios = require('axios');

async function testTabs() {
    try {
        const loginRes = await axios.post('http://localhost:5005/api/auth/login', {
            email: 'admin@systemcreate.in', // Usually the admin email based on previous context
            password: 'admin' // typical local password
        }).catch(e => {
            console.log("Login failed directly, trying alternate admin pattern");
            return null;
        });

        if (!loginRes) {
            console.log("Could not login to localhost to test.");
            return;
        }

        const token = loginRes.data.token;
        console.log("Logged in successfully. Testing New tab...");

        const newRes = await axios.get('http://localhost:5005/api/leads?viewType=new&limit=5', {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log(`New Tab: Found ${newRes.data.totalCount} leads. First lead status: ${newRes.data.leads[0]?.status}`);

        console.log("Testing Follow Up tab...");
        const followRes = await axios.get('http://localhost:5005/api/leads?viewType=follow_up&limit=5', {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log(`Follow Up Tab: Found ${followRes.data.totalCount} leads. First lead status: ${followRes.data.leads[0]?.status}`);

    } catch (e) {
        console.error("Test failed:", e.response ? e.response.data : e.message);
    }
}

testTabs();
