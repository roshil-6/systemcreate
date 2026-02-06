
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function fixPhoneNumbers() {
    const client = await pool.connect();
    try {
        console.log('🔄 Connected to database. Fetching leads...');

        // Fetch specific lead for debugging
        const res = await client.query(`
          SELECT id, name, phone_number, secondary_phone_number 
          FROM leads 
          WHERE name ILIKE '%digiya%'
        `);

        const leads = res.rows;
        console.log(`Found ${leads.length} leads matching criteria.`);

        let updatedCount = 0;

        await client.query('BEGIN');

        for (const lead of leads) {
            if (lead.name && lead.name.toLowerCase().includes('digiya')) {
                console.log('🎯 DEBUG TARGET FOUND:', lead.name);
                console.log('   Raw Phone:', JSON.stringify(lead.phone_number));
            }
            let originalPhone = lead.phone_number || '';
            let originalSecondary = lead.secondary_phone_number;

            if (!originalPhone || typeof originalPhone !== 'string') continue;

            let newPrimary = originalPhone;
            let newSecondary = originalSecondary; // Start with existing secondary
            let changed = false;

            const cleanVal = originalPhone.trim();

            // Method 1: Check concatenated duplication (e.g. "123123")
            // Only if NO separators
            if (!cleanVal.match(/[\s,;/]/) && cleanVal.length > 15 && cleanVal.length % 2 === 0) {
                const half = cleanVal.length / 2;
                const p1 = cleanVal.substring(0, half);
                const p2 = cleanVal.substring(half);

                if (p1 === p2) {
                    newPrimary = p1;
                    // User requested "nil" if duplicate
                    if (!newSecondary) newSecondary = null;
                    changed = true;
                }
            }

            // Method 2: Separators
            const parts = cleanVal.split(/[\s,;/]+/).filter(p => p.trim().length > 0);

            if (lead.name && lead.name.toLowerCase().includes('digiya')) {
                console.log('   Split Parts:', parts);
                if (parts.length >= 2) {
                    console.log('   P1 === P2?', parts[0] === parts[1]);
                    console.log('   P1 Length:', parts[0].length, 'P2 Length:', parts[1].length);
                }
            }

            if (parts.length >= 2) {
                // Case: "44735... 44735..."
                newPrimary = parts[0];

                // Check the second part
                const secondPart = parts[1];

                if (secondPart === newPrimary) {
                    // Exact duplicate in string
                    // Do NOT set secondary if it's just a repeat
                    // Unless secondary was already null?
                    // User said: "keeping the secondary no: section nil"
                    if (!newSecondary) newSecondary = null;
                } else {
                    // It's a different number (e.g. "123 456")
                    // Move 456 to Secondary if Separate Field is empty
                    if (!newSecondary) {
                        newSecondary = secondPart;
                    }
                }
                changed = true;
            }

            if (changed) {
                console.log(`🛠️ Fixing Lead ${lead.id} (${lead.name}):`);
                console.log(`   Before: [${originalPhone}] | [${originalSecondary || 'null'}]`);
                console.log(`   After:  [${newPrimary}] | [${newSecondary || 'null'}]`);

                await client.query(`
          UPDATE leads 
          SET phone_number = $1, secondary_phone_number = $2 
          WHERE id = $3
        `, [newPrimary, newSecondary, lead.id]);

                updatedCount++;
            }
        }

        await client.query('COMMIT');
        console.log(`✅ Successfully fixed ${updatedCount} leads.`);

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error executing script:', error);
    } finally {
        client.release();
        pool.end();
    }
}

fixPhoneNumbers();
