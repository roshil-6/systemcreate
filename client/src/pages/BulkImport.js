import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import API_BASE_URL from '../config/api';
import './BulkImport.css';
import { FiUpload, FiDownload, FiCheckCircle, FiXCircle, FiArrowLeft } from 'react-icons/fi';

const BulkImport = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [preview, setPreview] = useState(null);

  // Allow admin and all staff roles
  const canAccess = user?.role === 'ADMIN' || 
                    user?.role === 'SALES_TEAM_HEAD' || 
                    user?.role === 'SALES_TEAM' || 
                    user?.role === 'PROCESSING' || 
                    user?.role === 'STAFF';
  
  if (!canAccess) {
    return (
      <div className="bulk-import">
        <div className="bulk-import-error">
          <FiXCircle /> Access denied
        </div>
      </div>
    );
  }

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setResult(null);
      
      // Preview CSV or Excel
      if (selectedFile.name.toLowerCase().endsWith('.csv')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const text = event.target.result;
          const lines = text.split('\n').slice(0, 6); // First 5 rows + header
          setPreview(lines.join('\n'));
        };
        reader.readAsText(selectedFile);
      } else {
        // For Excel files, show a message
        setPreview('Excel file selected. Preview not available for Excel files.');
      }
    }
  };

  const handleImport = async () => {
    if (!file) {
      alert('Please select a CSV file');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const token = localStorage.getItem('token');
      if (!token) {
        alert('You are not logged in. Please log in again.');
        navigate('/login');
        return;
      }

      const response = await axios.post(`${API_BASE_URL}/api/leads/bulk-import`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          // DO NOT set Content-Type - axios will set it automatically with correct boundary for FormData
        },
      });

      setResult(response.data);
      setFile(null);
      setPreview(null);
      
      // Reset file input
      const fileInput = document.getElementById('csv-file-input');
      if (fileInput) {
        fileInput.value = '';
      }
    } catch (error) {
      console.error('Import error:', error);
      console.error('Error response:', error.response?.data);
      console.error('Error status:', error.response?.status);
      
      const errorMessage = error.response?.data?.error || error.message || 'Error importing leads';
      const errorDetails = error.response?.data?.details || error.response?.data?.message || '';
      const availableColumns = error.response?.data?.availableColumns || [];
      
      // Show full error details in console for debugging
      if (error.response?.data) {
        console.error('Full error response:', JSON.stringify(error.response.data, null, 2));
      }
      
      setResult({
        success: false,
        error: errorMessage,
        details: errorDetails,
        availableColumns: availableColumns,
        status: error.response?.status,
        fullError: error.response?.data,
      });
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = () => {
    const headers = [
      'name',
      'phone_country_code',
      'phone_number',
      'whatsapp_country_code',
      'whatsapp_number',
      'email',
      'age',
      'occupation',
      'qualification',
      'year_of_experience',
      'country',
      'program',
      'status',
      'priority',
      'comment',
      'follow_up_date',
    ];
    
    const sampleRow = [
      'John Doe',
      '+91',
      '1234567890',
      '+91',
      '1234567890',
      'john@example.com',
      '30',
      'Engineer',
      'bachelors',
      '5',
      'australia',
      'gsm',
      'New',
      'warm',
      'Interested in product',
      '2026-02-01',
    ];

    const csvContent = [
      headers.join(','),
      sampleRow.join(','),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'lead_import_template.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportLeads = async (format = 'csv') => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_BASE_URL}/api/leads/export/csv?format=${format}`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      const extension = format === 'xlsx' ? 'xlsx' : 'csv';
      link.setAttribute('download', `leads_export_${new Date().toISOString().split('T')[0]}.${extension}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      alert(`${format.toUpperCase()} file downloaded successfully!`);
    } catch (error) {
      console.error('Export error:', error);
      alert('Error exporting leads. Please try again.');
    }
  };

  return (
    <div className="bulk-import">
      <div className="bulk-import-header">
        <button className="btn-back" onClick={() => navigate('/leads')}>
          <FiArrowLeft /> Back to Leads
        </button>
        <h1>Import & Export Leads</h1>
        <button className="btn-export-all" onClick={handleExportLeads}>
          <FiDownload /> Export Leads
        </button>
      </div>

      <div className="bulk-import-content">
        <div className="import-export-tabs">
          <div className="tab-section export-tab">
            <h2>📤 Export Leads</h2>
            <p>Export leads to CSV format for backup or use in Google Sheets</p>
            {user?.role !== 'ADMIN' && (
              <div className="staff-notice">
                <strong>Note:</strong> Staff members will only export leads assigned to them.
              </div>
            )}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button className="btn-export" onClick={() => handleExportLeads('csv')}>
                <FiDownload /> Export to CSV
              </button>
              <button className="btn-export" onClick={() => handleExportLeads('xlsx')}>
                <FiDownload /> Export to Excel
              </button>
            </div>
            <div className="export-info">
              <p><strong>Export includes:</strong></p>
              <ul>
                <li>All lead information (name, contact, program, status, etc.)</li>
                <li>{user?.role === 'ADMIN' ? 'All leads in the system' : 'Leads assigned to you'}</li>
                <li>Formatted for easy import into Google Sheets</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="import-instructions">
          <h2>📥 Import Leads</h2>
          {user?.role !== 'ADMIN' && (
            <div className="staff-notice">
              <strong>Note:</strong> Leads imported by staff members will be automatically assigned to you.
            </div>
          )}
          <h3>How to Import Leads</h3>
          <ol>
            <li>Prepare your data in Excel, Google Sheets, or CSV format</li>
            <li>Make sure your file has a header row with column names</li>
            <li>Required columns: <strong>name</strong> (or <strong>first_name</strong> + <strong>last_name</strong>) and <strong>phone</strong> (or <strong>phone_number</strong>)</li>
            <li>Download the template below to see the recommended format</li>
            <li>Upload your file (CSV or Excel) using the form below</li>
            <li>Review the import results</li>
          </ol>
          <p><strong>Supported formats:</strong> CSV (.csv), Excel (.xlsx, .xls)</p>
          <div style={{ marginTop: '15px', padding: '15px', background: '#e3f2fd', borderRadius: '8px', borderLeft: '4px solid #2196f3' }}>
            <h4 style={{ marginTop: 0, color: '#1976d2' }}>📱 Meta Ads (Facebook Ads) Support</h4>
            <p style={{ marginBottom: '10px' }}>This system automatically recognizes Meta Ads export format! Common Meta Ads columns are supported:</p>
            <ul style={{ marginBottom: '10px', paddingLeft: '20px' }}>
              <li><strong>First Name</strong> / <strong>Last Name</strong> → Automatically combined into name</li>
              <li><strong>Phone Number</strong> → Automatically recognized</li>
              <li><strong>Email</strong> → Automatically recognized</li>
              <li><strong>Ad Name</strong>, <strong>Campaign Name</strong>, <strong>Form Name</strong> → Stored in lead source/comment</li>
              <li><strong>Created Time</strong> / <strong>Created Date</strong> → Used for follow-up date</li>
              <li><strong>Lead ID</strong> → Stored in comments for reference</li>
            </ul>
            <p style={{ margin: 0, fontSize: '14px', color: '#555' }}>
              <strong>Tip:</strong> You can directly export leads from Meta Ads Manager and upload the Excel/CSV file - no manual formatting needed!
            </p>
          </div>
          <div className="template-download">
            <button className="btn-download-template" onClick={downloadTemplate}>
              <FiDownload /> Download CSV Template
            </button>
          </div>
        </div>

        <div className="import-form">
          <h2>Upload CSV File</h2>
          <div className="file-upload-area">
            <input
              id="csv-file-input"
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileChange}
              className="file-input"
            />
              <label htmlFor="csv-file-input" className="file-label">
              <FiUpload /> {file ? file.name : 'Choose CSV or Excel File'}
            </label>
          </div>

          {preview && (
            <div className="preview-section">
              <h3>Preview (First 5 rows)</h3>
              <pre className="csv-preview">{preview}</pre>
            </div>
          )}

          <div className="import-actions">
            <button
              className="btn-import"
              onClick={handleImport}
              disabled={!file || loading}
            >
              {loading ? 'Importing...' : 'Import Leads'}
            </button>
          </div>
        </div>

        {result && (
          <div className={`import-result ${result.success ? 'success' : 'error'}`}>
            {result.success ? (
              <>
                <FiCheckCircle className="result-icon" />
                <h3>Import Successful!</h3>
                <div className="result-stats">
                  <div className="stat-item">
                    <span className="stat-label">Total Processed:</span>
                    <span className="stat-value">{result.total}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Successfully Created:</span>
                    <span className="stat-value success">{result.created}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Skipped (Duplicates):</span>
                    <span className="stat-value warning">{result.skipped}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Errors:</span>
                    <span className="stat-value error">{result.errors}</span>
                  </div>
                </div>
                {result.errorRows && result.errorRows.length > 0 && (
                  <div className="error-details">
                    <h4>Rows with Errors:</h4>
                    <ul>
                      {result.errorRows.map((error, index) => (
                        <li key={index}>
                          Row {error.row}: {error.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <button
                  className="btn-view-leads"
                  onClick={() => navigate('/leads')}
                >
                  View All Leads
                </button>
              </>
            ) : (
              <>
                <FiXCircle className="result-icon" />
                <h3>Import Failed</h3>
                <p className="error-message"><strong>Error:</strong> {result.error}</p>
                {result.status && (
                  <p className="error-status"><strong>Status Code:</strong> {result.status}</p>
                )}
                {result.details && (
                  <div className="error-details">
                    <p><strong>Details:</strong></p>
                    <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {typeof result.details === 'string' ? result.details : JSON.stringify(result.details, null, 2)}
                    </pre>
                  </div>
                )}
                {result.availableColumns && result.availableColumns.length > 0 && (
                  <div className="error-details">
                    <p><strong>Available columns in your CSV:</strong></p>
                    <p style={{ fontFamily: 'monospace', background: '#f5f5f5', padding: '10px', borderRadius: '4px' }}>
                      {Array.isArray(result.availableColumns) ? result.availableColumns.join(', ') : result.availableColumns}
                    </p>
                    <p><strong>Required columns:</strong> name (or first_name + last_name), phone_number (or phone, mobile)</p>
                  </div>
                )}
                {result.fullError && (
                  <div className="error-details" style={{ marginTop: '10px' }}>
                    <p><strong>Full Error Response:</strong></p>
                    <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '12px', background: '#f5f5f5', padding: '10px', borderRadius: '4px' }}>
                      {JSON.stringify(result.fullError, null, 2)}
                    </pre>
                  </div>
                )}
                <div style={{ marginTop: '15px', padding: '10px', background: '#fff3cd', borderRadius: '4px' }}>
                  <p><strong>💡 Troubleshooting Tips:</strong></p>
                  <ul style={{ textAlign: 'left', marginLeft: '20px' }}>
                    <li>Check the browser console (F12) for detailed error logs</li>
                    <li>Make sure your CSV has a header row with column names</li>
                    <li>Required columns: <code>name</code> (or <code>first_name</code> + <code>last_name</code>) and <code>phone</code> (or <code>phone_number</code>)</li>
                    <li>Download the template above to see the correct format</li>
                    <li>Make sure the file is saved as CSV (not Excel .xlsx)</li>
                  </ul>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default BulkImport;
