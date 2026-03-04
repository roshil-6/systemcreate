async function testTabs() {
    try {
        const loginRes = await fetch('https://crm-2b00.onrender.com/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'admin@systemcreate.in',
                password: 'admin'
            })
        }).catch(e => null);

        if (!loginRes || !loginRes.ok) {
            console.log("Could not login to PROD to test.");
            return;
        }

        const loginData = await loginRes.json();
        const token = loginData.token;
        console.log("Logged in to PROD successfully. Testing New tab...");

        const newRes = await fetch('https://crm-2b00.onrender.com/api/leads?viewType=new&limit=5', {
            headers: { Authorization: `Bearer ${token}` }
        });
        const newData = await newRes.json();
        console.log(`New Tab: Found ${newData.totalCount} leads. First lead status: ${newData.leads?.[0]?.status}`);

        console.log("Testing Follow Up tab...");
        const followRes = await fetch('https://crm-2b00.onrender.com/api/leads?viewType=follow_up&limit=5', {
            headers: { Authorization: `Bearer ${token}` }
        });
        const followData = await followRes.json();
        console.log(`Follow Up Tab: Found ${followData.totalCount} leads. First lead status: ${followData.leads?.[0]?.status}`);

        console.log("Testing All tab...");
        const allRes = await fetch('https://crm-2b00.onrender.com/api/leads?limit=5', {
            headers: { Authorization: `Bearer ${token}` }
        });
        const allData = await allRes.json();
        console.log(`All Tab: Found ${allData.totalCount} leads. First lead status: ${allData.leads?.[0]?.status}`);

    } catch (e) {
        console.error("Test failed:", e.message);
    }
}

testTabs();
