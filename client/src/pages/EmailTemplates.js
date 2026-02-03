import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import API_BASE_URL from '../config/api';
import './EmailTemplates.css';
import { FiMail, FiEdit, FiTrash2, FiCheck, FiX, FiSend } from 'react-icons/fi';

const EmailTemplates = () => {
  const { user } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [testing, setTesting] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    subject: '',
    body: '',
    active: true,
  });

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      fetchTemplates();
    }
  }, [user]);

  const fetchTemplates = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_BASE_URL}/api/email-templates`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setTemplates(response.data);
    } catch (error) {
      console.error('Error fetching templates:', error);
      alert('Error loading email templates');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      
      if (editingTemplate) {
        await axios.put(
          `${API_BASE_URL}/api/email-templates/${editingTemplate.id}`,
          formData,
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } else {
        await axios.post(
          `${API_BASE_URL}/api/email-templates`,
          formData,
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }
      
      setShowForm(false);
      setEditingTemplate(null);
      setFormData({ name: '', subject: '', body: '', active: true });
      fetchTemplates();
      alert(editingTemplate ? 'Template updated successfully!' : 'Template created successfully!');
    } catch (error) {
      console.error('Error saving template:', error);
      alert(error.response?.data?.error || 'Error saving template');
    }
  };

  const handleEdit = (template) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      subject: template.subject,
      body: template.body,
      active: template.active,
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this template?')) return;
    
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_BASE_URL}/api/email-templates/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchTemplates();
      alert('Template deleted successfully!');
    } catch (error) {
      console.error('Error deleting template:', error);
      alert(error.response?.data?.error || 'Error deleting template');
    }
  };

  const handleTest = async (templateId) => {
    if (!testEmail) {
      alert('Please enter a test email address');
      return;
    }
    
    setTesting(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${API_BASE_URL}/api/email-templates/${templateId}/test`,
        { testEmail },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      alert('Test email sent successfully!');
      setTestEmail('');
    } catch (error) {
      console.error('Error sending test email:', error);
      alert(error.response?.data?.error || 'Error sending test email');
    } finally {
      setTesting(false);
    }
  };

  if (user?.role !== 'ADMIN') {
    return (
      <div className="email-templates-container">
        <div className="error-message">Access denied. Admin only.</div>
      </div>
    );
  }

  if (loading) {
    return <div className="email-templates-container">Loading...</div>;
  }

  return (
    <div className="email-templates-container">
      <div className="email-templates-header">
        <h1>
          <FiMail /> Email Templates
        </h1>
        <button className="btn-primary" onClick={() => {
          setShowForm(true);
          setEditingTemplate(null);
          setFormData({ name: '', subject: '', body: '', active: true });
        }}>
          + Create Template
        </button>
      </div>

      {showForm && (
        <div className="email-template-form">
          <h2>{editingTemplate ? 'Edit Template' : 'Create New Template'}</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Template Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Follow-up Email Template"
                required
              />
            </div>

            <div className="form-group">
              <label>Email Subject</label>
              <input
                type="text"
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                placeholder="e.g., Follow-up from Tonio & Senora - {{name}}"
                required
              />
              <small>Use {'{{name}}'} to insert the client's name</small>
            </div>

            <div className="form-group">
              <label>Email Body (HTML)</label>
              <textarea
                value={formData.body}
                onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                placeholder={`Dear {{name}},\n\nThank you for your interest in our programs...`}
                rows="10"
                required
              />
              <small>
                Available variables: {'{{name}}'}, {'{{email}}'}, {'{{phone}}'}, {'{{program}}'}
              </small>
            </div>

            <div className="form-group checkbox-group">
              <label>
                <input
                  type="checkbox"
                  checked={formData.active}
                  onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                />
                Active (only one active template will be used for follow-ups)
              </label>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn-primary">
                {editingTemplate ? 'Update Template' : 'Create Template'}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setShowForm(false);
                  setEditingTemplate(null);
                  setFormData({ name: '', subject: '', body: '', active: true });
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="templates-list">
        {templates.length === 0 ? (
          <div className="empty-state">
            <FiMail size={48} />
            <p>No email templates found. Create your first template to get started.</p>
          </div>
        ) : (
          templates.map((template) => (
            <div key={template.id} className={`template-card ${template.active ? 'active' : ''}`}>
              <div className="template-header">
                <h3>{template.name}</h3>
                <div className="template-actions">
                  {template.active && (
                    <span className="active-badge">Active</span>
                  )}
                  <button
                    className="icon-btn"
                    onClick={() => handleEdit(template)}
                    title="Edit"
                  >
                    <FiEdit />
                  </button>
                  <button
                    className="icon-btn danger"
                    onClick={() => handleDelete(template.id)}
                    title="Delete"
                  >
                    <FiTrash2 />
                  </button>
                </div>
              </div>
              
              <div className="template-content">
                <div className="template-field">
                  <strong>Subject:</strong> {template.subject}
                </div>
                <div className="template-field">
                  <strong>Body Preview:</strong>
                  <div className="body-preview" dangerouslySetInnerHTML={{ __html: template.body.substring(0, 200) + '...' }} />
                </div>
              </div>

              <div className="template-test">
                <input
                  type="email"
                  placeholder="Enter test email address"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                />
                <button
                  className="btn-test"
                  onClick={() => handleTest(template.id)}
                  disabled={testing || !testEmail}
                >
                  <FiSend /> {testing ? 'Sending...' : 'Send Test Email'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="email-info">
        <h3>How It Works</h3>
        <ul>
          <li>✅ Set the <strong>next_follow_up_date</strong> on any lead</li>
          <li>✅ The system automatically sends emails on the scheduled date at 9:00 AM</li>
          <li>✅ Only one active template will be used for follow-up emails</li>
          <li>✅ Use variables like {'{{name}}'}, {'{{email}}'}, {'{{phone}}'}, {'{{program}}'} in your template</li>
          <li>✅ Emails are logged and tracked in the system</li>
          <li>⚠️ Make sure to configure SMTP settings in server/.env file</li>
        </ul>
      </div>
    </div>
  );
};

export default EmailTemplates;
