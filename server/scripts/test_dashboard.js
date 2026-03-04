async function testDashboard() {
    try {
        const loginRes = await fetch('http://localhost:3001/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'shilpa@toniosenora.com',
                password: 'shilpasenora432'
            })
        }).catch(e => null);

        if (!loginRes || !loginRes.ok) {
            console.log("Could not login to localhost to test.");
            return;
        }

        const loginData = await loginRes.json();
        const token = loginData.token;
        console.log("Logged in successfully as Shilpa. Testing Dashboard...");

        const dashRes = await fetch('http://localhost:3001/api/dashboard', {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!dashRes.ok) {
            const text = await dashRes.text();
            console.error(`Status: ${dashRes.status}`);
            console.error(`Body: ${text}`);
        } else {
            console.log("Dashboard fetch succeeded!");
        }

    } catch (e) {
        console.error("Test failed:", e.message);
    }
}

testDashboard();
