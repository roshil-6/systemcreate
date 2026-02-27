const fs = require('fs');
const path = 'c:/Users/Abhinand Antony/Desktop/CRM/client/src/pages/Leads.js';
let content = fs.readFileSync(path, 'utf8');

const brokenSection = `    {/* Excel Details Modal */ }
  {
    excelModal.open && (
      <div className="excel-modal-overlay" onClick={() => setExcelModal({ open: false, data: null, loading: false, leadName: '' })}>
        <div className="excel-modal" onClick={e => e.stopPropagation()}>
          <div className="excel-modal-header">
            <div>
              <h2><FiGrid /> Original Excel Data</h2>
              <p className="excel-modal-subtitle">{excelModal.leadName}</p>
            </div>
            <button className="excel-modal-close" onClick={() => setExcelModal({ open: false, data: null, loading: false, leadName: '' })}>
              <FiX />
            </button>
          </div>
          <div className="excel-modal-body">
            {excelModal.loading && (
              <div className="excel-modal-loading">Loading Excel data...</div>
            )}
            {!excelModal.loading && !excelModal.data && (
              <div className="excel-modal-empty">No Excel data found for this lead.</div>
            )}
            {!excelModal.loading && excelModal.data && (
              <table className="excel-data-table">
                <thead>
                  <tr>
                    <th>Column</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(excelModal.data)
                    .filter(([, val]) => val !== '' && val !== null && val !== undefined)
                    .map(([key, val]) => (
                      <tr key={key}>
                        <td className="excel-col-name">{key}</td>
                        <td className="excel-col-value">{String(val)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    )
  }
  </div >
  );
};`;

const fixedSection = `    {/* Excel Details Modal */}
    {excelModal.open && (
      <div className="excel-modal-overlay" onClick={() => setExcelModal({ open: false, data: null, loading: false, leadName: '' })}>
        <div className="excel-modal" onClick={e => e.stopPropagation()}>
          <div className="excel-modal-header">
            <div>
              <h2><FiGrid /> Original Excel Data</h2>
              <p className="excel-modal-subtitle">{excelModal.leadName}</p>
            </div>
            <button className="excel-modal-close" onClick={() => setExcelModal({ open: false, data: null, loading: false, leadName: '' })}>
              <FiX />
            </button>
          </div>
          <div className="excel-modal-body">
            {excelModal.loading && (
              <div className="excel-modal-loading">Loading Excel data...</div>
            )}
            {!excelModal.loading && !excelModal.data && (
              <div className="excel-modal-empty">No Excel data found for this lead.</div>
            )}
            {!excelModal.loading && excelModal.data && (
              <table className="excel-data-table">
                <thead>
                  <tr>
                    <th>Column</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(excelModal.data)
                    .filter(([, val]) => val !== '' && val !== null && val !== undefined)
                    .map(([key, val]) => (
                      <tr key={key}>
                        <td className="excel-col-name">{key}</td>
                        <td className="excel-col-value">{String(val)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    )}
  </div>
  );
};`;

if (content.includes(brokenSection)) {
    content = content.replace(brokenSection, fixedSection);
    fs.writeFileSync(path, content);
    console.log('✅ Fixed Leads.js JSX structure');
} else {
    console.log('❌ Target section not found — checking for variant...');
    // Try to find and show context around line 1117
    const lines = content.split('\n');
    console.log('Lines 1115-1120:', lines.slice(1114, 1120));
}
