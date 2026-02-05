
const db = require('./server/config/database');

async function checkSchema() {
    try {
        console.log('🔍 Checking `clients` table schema...');

        const res = await db.query(`
      SELECT column_name, data_type, udt_name 
      FROM information_schema.columns 
      WHERE table_name = 'clients'
      ORDER BY ordinal_position;
    `);

        console.log('📋 Columns in `clients` table:');
        res.rows.forEach(col => {
            console.log(`- ${col.column_name} (${col.data_type} / ${col.udt_name})`);
        });

        const completedActionsCol = res.rows.find(c => c.column_name === 'completed_actions');
        if (completedActionsCol) {
            console.log('\n✅ `completed_actions` column EXISTS.');
        } else {
            console.log('\n❌ `completed_actions` column is MISSING!');
        }

    } catch (error) {
        console.error('❌ Error checking schema:', error);
    }
}

checkSchema();
