import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import API_BASE_URL from '../config/api';
import './SnehaDashboard.css';
import { FiUser, FiDollarSign, FiClock, FiCheck, FiSend, FiEdit2, FiSave } from 'react-icons/fi';

const SnehaDashboard = ({ viewingStaffId = null }) => {
  const { user } = useAuth();
  // If viewingStaffId is provided (admin viewing), use it; otherwise use logged-in user's ID
  const snehaStaffId = viewingStaffId || (user?.id ? Number(user.id) : null);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingClient, setEditingClient] = useState(null);
  const [editData, setEditData] = useState({});
  const [kripaUser, setKripaUser] = useState(null);

  // Define fetchKripaUser BEFORE useEffect hooks that use it
  const fetchKripaUser = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/users`);
      const kripa = response.data?.find(u =>
        u.name === 'Kripa' || u.name === 'KRIPA' || u.email === 'kripa@toniosenora.com'
      ) || null;
      setKripaUser(kripa);
    } catch (error) {
      console.error('Error fetching Kripa user:', error);
      setKripaUser(null);
    }
  }, []);

  // Define fetchClients BEFORE useEffect hooks that use it
  const fetchClients = useCallback(async () => {
    if (!snehaStaffId) {
      console.log('⚠️ Staff ID not available yet');
      return;
    }

    try {
      setLoading(true);
      console.log('🔍 Sneha fetching clients with assigned_staff_id:', snehaStaffId, viewingStaffId ? '(Admin viewing)' : '(Self view)');
      const response = await axios.get(`${API_BASE_URL}/api/clients`, {
        params: { assigned_staff_id: snehaStaffId }
      });
      setClients(response.data || []);
    } catch (error) {
      console.error('Error fetching clients:', error);
    } finally {
      setLoading(false);
    }
  }, [snehaStaffId, viewingStaffId]);

  // useEffect hooks that use fetchClients (must come after fetchClients definition)
  useEffect(() => {
    if (snehaStaffId) {
      console.log('👤 Sneha dashboard - Staff ID:', snehaStaffId, viewingStaffId ? '(Admin viewing)' : '(Self view)');
      fetchClients();
      fetchKripaUser();
    }
  }, [snehaStaffId, viewingStaffId, fetchClients, fetchKripaUser]);

  // Auto-refresh when page becomes visible (user switches tabs/windows)
  useEffect(() => {
    if (!snehaStaffId) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && snehaStaffId) {
        console.log('🔄 Sneha dashboard visible, refreshing...');
        fetchClients();
      }
    };

    const handleFocus = () => {
      if (snehaStaffId) {
        console.log('🔄 Window focused, refreshing Sneha dashboard...');
        fetchClients();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    /*
    const interval = setInterval(() => {
      if (snehaStaffId) {
        fetchClients();
      }
    }, 10000);
    */

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [snehaStaffId, fetchClients]);

  const handleEdit = (client) => {
    setEditingClient(client.id);
    setEditData({
      amount_paid: client.amount_paid || '',
      fee_status: client.fee_status || '',
      payment_due_date: client.payment_due_date ? client.payment_due_date.split('T')[0] : '',
    });
  };

  const handleSave = async (clientId) => {
    try {
      await axios.put(`${API_BASE_URL}/api/clients/${clientId}`, editData);
      setEditingClient(null);
      setEditData({});
      fetchClients();
      alert('Client updated successfully!');
    } catch (error) {
      console.error('Error updating client:', error);
      alert(error.response?.data?.error || 'Error updating client');
    }
  };

  const handleAssignToKripa = async (clientId) => {
    if (!kripaUser) {
      alert('Kripa user not found');
      return;
    }

    try {
      console.log('📤 Sneha assigning client', clientId, 'to Kripa (ID:', kripaUser.id, ')');
      // Assign to Kripa and mark as done in one call
      const response = await axios.put(`${API_BASE_URL}/api/clients/${clientId}`, {
        processing_staff_id: kripaUser.id,
        processing_status: 'assigned_to_kripa',
      });

      console.log('✅ Assignment response:', response.data);
      console.log('✅ Client processing_staff_id after update:', response.data.processing_staff_id);

      alert('Client assigned to Kripa successfully!');
      fetchClients();
    } catch (error) {
      console.error('❌ Error assigning to Kripa:', error);
      console.error('Error response:', error.response?.data);
      alert(error.response?.data?.error || 'Error assigning client');
    }
  };

  const getDaysUntilDue = (dueDate) => {
    if (!dueDate) return null;
    const today = new Date();
    const due = new Date(dueDate);
    const diffTime = due - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  if (loading) {
    return <div className="sneha-dashboard-loading">Loading clients...</div>;
  }

  return (
    <div className="sneha-dashboard">
      <div className="dashboard-header">
        <h1>Processing Stage 1</h1>
        <p className="dashboard-subtitle">Client Management - Clients assigned after Registration Completed</p>
      </div>

      {clients.length === 0 ? (
        <div className="no-clients">
          <p>No clients assigned yet</p>
        </div>
      ) : (
        <div className="clients-grid">
          {clients.map((client) => {
            const daysUntilDue = client.payment_due_date ? getDaysUntilDue(client.payment_due_date) : null;
            const isWarning = daysUntilDue !== null && daysUntilDue <= 2 && daysUntilDue >= 0;
            const isOverdue = daysUntilDue !== null && daysUntilDue < 0;
            const isEditing = editingClient === client.id;
            const isDone = client.processing_status === 'assigned_to_kripa';

            return (
              <div key={client.id} className={`client-cv-card ${isDone ? 'done' : ''}`}>
                <div className="cv-header">
                  <div className="cv-avatar">
                    {getInitials(client.name)}
                  </div>
                  <div className="cv-name-section">
                    <h2>{client.name}</h2>
                    <p className="cv-subtitle">Client Profile</p>
                  </div>
                  {isDone && (
                    <div className="done-badge">
                      <FiCheck /> Done
                    </div>
                  )}
                </div>

                <div className="cv-section">
                  <h3 className="cv-section-title">Contact Information</h3>
                  <div className="cv-detail-row">
                    <span className="cv-label">Phone:</span>
                    <span className="cv-value">{client.phone_number || '-'}</span>
                  </div>
                  <div className="cv-detail-row">
                    <span className="cv-label">Email:</span>
                    <span className="cv-value">{client.email || '-'}</span>
                  </div>
                  <div className="cv-detail-row">
                    <span className="cv-label">WhatsApp:</span>
                    <span className="cv-value">{client.whatsapp_number || '-'}</span>
                  </div>
                </div>

                <div className="cv-section">
                  <h3 className="cv-section-title">Registration Details</h3>
                  <div className="cv-detail-row">
                    <span className="cv-label">Assessment Authority:</span>
                    <span className="cv-value">{client.assessment_authority || '-'}</span>
                  </div>
                  <div className="cv-detail-row">
                    <span className="cv-label">Occupation Mapped:</span>
                    <span className="cv-value">{client.occupation_mapped || '-'}</span>
                  </div>
                  <div className="cv-detail-row">
                    <span className="cv-label">Registration Fee Paid:</span>
                    <span className="cv-value">{client.registration_fee_paid ? 'Yes' : 'No'}</span>
                  </div>
                </div>

                <div className="cv-section">
                  <h3 className="cv-section-title">Professional Details</h3>
                  <div className="cv-detail-row">
                    <span className="cv-label">Age:</span>
                    <span className="cv-value">{client.age || '-'}</span>
                  </div>
                  <div className="cv-detail-row">
                    <span className="cv-label">Occupation:</span>
                    <span className="cv-value">{client.occupation || '-'}</span>
                  </div>
                  <div className="cv-detail-row">
                    <span className="cv-label">Qualification:</span>
                    <span className="cv-value">{client.qualification || '-'}</span>
                  </div>
                  <div className="cv-detail-row">
                    <span className="cv-label">Experience:</span>
                    <span className="cv-value">{client.year_of_experience ? `${client.year_of_experience} years` : '-'}</span>
                  </div>
                  <div className="cv-detail-row">
                    <span className="cv-label">Target Country:</span>
                    <span className="cv-value">{client.target_country || client.country || '-'}</span>
                  </div>
                  <div className="cv-detail-row">
                    <span className="cv-label">Residing Country:</span>
                    <span className="cv-value">{client.residing_country || '-'}</span>
                  </div>
                  <div className="cv-detail-row">
                    <span className="cv-label">Program:</span>
                    <span className="cv-value">{client.program || '-'}</span>
                  </div>
                </div>

                <div className="cv-section payment-section">
                  <h3 className="cv-section-title">Payment Information</h3>
                  {isEditing ? (
                    <>
                      <div className="cv-detail-row">
                        <span className="cv-label">Amount Paid:</span>
                        <input
                          type="number"
                          value={editData.amount_paid}
                          onChange={(e) => setEditData({ ...editData, amount_paid: e.target.value })}
                          className="cv-input"
                          placeholder="Enter amount"
                        />
                      </div>
                      <div className="cv-detail-row">
                        <span className="cv-label">Fee Status:</span>
                        <select
                          value={editData.fee_status}
                          onChange={(e) => setEditData({ ...editData, fee_status: e.target.value })}
                          className="cv-select"
                        >
                          <option value="">Select Status</option>
                          <option value="1st Installment Completed">1st Installment Completed</option>
                          <option value="Payment Pending">Payment Pending</option>
                          <option value="PTE Fee Paid">PTE Fee Paid</option>
                        </select>
                      </div>
                      <div className="cv-detail-row">
                        <span className="cv-label">Payment Due Date:</span>
                        <input
                          type="date"
                          value={editData.payment_due_date}
                          onChange={(e) => setEditData({ ...editData, payment_due_date: e.target.value })}
                          className="cv-input"
                        />
                      </div>
                      <div className="cv-actions">
                        <button
                          className="btn-save-cv"
                          onClick={() => handleSave(client.id)}
                        >
                          <FiSave /> Save
                        </button>
                        <button
                          className="btn-cancel-cv"
                          onClick={() => {
                            setEditingClient(null);
                            setEditData({});
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="cv-detail-row">
                        <span className="cv-label">Amount Paid:</span>
                        <span className="cv-value">
                          {client.amount_paid !== null && client.amount_paid !== undefined
                            ? `د.إ ${client.amount_paid}`
                            : '-'}
                        </span>
                      </div>
                      <div className="cv-detail-row">
                        <span className="cv-label">Fee Status:</span>
                        <span className={`fee-status-badge ${client.fee_status?.toLowerCase().replace(/\s+/g, '-')}`}>
                          {client.fee_status || 'Not Set'}
                        </span>
                        {client.fee_status === 'Payment Pending' && client.payment_due_date && (
                          <span className={`payment-timer ${isOverdue ? 'overdue' : isWarning ? 'warning' : ''}`}>
                            <FiClock />
                            {isOverdue
                              ? `Overdue by ${Math.abs(daysUntilDue)} days`
                              : `${daysUntilDue} days remaining`}
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {!isDone && (
                  <div className="cv-actions-footer">
                    {!isEditing && (
                      <>
                        <button
                          className="btn-edit-cv"
                          onClick={() => handleEdit(client)}
                        >
                          <FiEdit2 /> Edit Payment Info
                        </button>
                        <button
                          className="btn-assign-kripa"
                          onClick={() => handleAssignToKripa(client.id)}
                          disabled={!kripaUser}
                        >
                          <FiSend /> Assign to Kripa
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SnehaDashboard;
