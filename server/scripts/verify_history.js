async function run() {
    try {
        console.log('--- Verifying Production Import History API ---');
        const loginRes = await fetch('https://crm-2b00.onrender.com/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'rojishahead@toniosenora.com',
                password: 'rojishasenoramain000'
            })
        });

        const loginData = await loginRes.json();
        if (!loginRes.ok) throw new Error('Login failed: ' + JSON.stringify(loginData));

        const token = loginData.token;
        console.log('✅ Logged in successfully');

        const historyRes = await fetch('https://crm-2b00.onrender.com/api/leads/import-history', {
            headers: { Authorization: 'Bearer ' + token }
        });

        const historyData = await historyRes.json();
        console.log('✅ History API response received');
        console.log('DATA_SIZE:', historyData.length);
        if (historyData.length > 0) {
            console.log('LATEST_ENTRY:', JSON.stringify(historyData[0], null, 2));
        } else {
            console.log('⚠️ No records returned by API');
        }
    } catch (e) {
        console.error('❌ Error:', e.message);
    }
}
run();
