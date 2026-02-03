import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import API_BASE_URL from '../config/api';
import './KripaDashboard.css';
import { FiUser, FiCheck, FiSend, FiFileText, FiDollarSign, FiEdit2, FiSave, FiClock } from 'react-icons/fi';

const KripaDashboard = ({ viewingStaffId = null }) => {
  const { user } = useAuth();
  // If viewingStaffId is provided (admin viewing), use it; otherwise use logged-in user's ID
  const kripaStaffId = viewingStaffId || (user?.id ? Number(user.id) : null);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingClient, setEditingClient] = useState(null);
  const [editData, setEditData] = useState({});

  // Define fetchClients BEFORE useEffect hooks that use it
  const fetchClients = useCallback(async () => {
    if (!kripaStaffId) {
      console.log('⚠️ Staff ID not available yet');
      return;
    }

    try {
      setLoading(true);
      const processingStaffId = kripaStaffId;
      console.log('🔍 Kripa fetching clients with processing_staff_id:', processingStaffId, viewingStaffId ? '(Admin viewing)' : '(Self view)');

      const response = await axios.get(`${API_BASE_URL}/api/clients`, {
        params: {
          processing_staff_id: processingStaffId
        },
        // Force fresh data
        headers: {
          'Cache-Control': 'no-cache'
        }
      });

      console.log('📊 Kripa received', response.data.length, 'clients');
      if (response.data.length > 0) {
        console.log('📋 Client details:', response.data.map(c => ({ id: c.id, name: c.name, processing_staff_id: c.processing_staff_id })));
      } else {
        console.log('⚠️ No clients found with processing_staff_id =', processingStaffId);
        // Debug: Check all clients
        try {
          const allClientsResponse = await axios.get(`${API_BASE_URL}/api/clients`);
          console.log('📋 All clients in system:', allClientsResponse.data.map(c => ({
            id: c.id,
            name: c.name,
            processing_staff_id: c.processing_staff_id,
            assigned_staff_id: c.assigned_staff_id
          })));
        } catch (debugError) {
          console.error('Debug fetch error:', debugError);
        }
      }

      setClients(response.data || []);
    } catch (error) {
      console.error('❌ Error fetching clients:', error);
      console.error('Error details:', error.response?.data);
      alert('Error fetching clients: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  }, [kripaStaffId, viewingStaffId]);

  // useEffect hooks that use fetchClients (must come after fetchClients definition)
  useEffect(() => {
    if (kripaStaffId) {
      console.log('👤 Kripa dashboard - Staff ID:', kripaStaffId, viewingStaffId ? '(Admin viewing)' : '(Self view)');
      fetchClients();
    }
  }, [kripaStaffId, viewingStaffId, fetchClients]);

  // Auto-refresh when page becomes visible (user switches tabs/windows)
  useEffect(() => {
    if (!kripaStaffId) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && kripaStaffId) {
        console.log('🔄 Page visible, refreshing clients...');
        fetchClients();
      }
    };

    const handleFocus = () => {
      if (kripaStaffId) {
        console.log('🔄 Window focused, refreshing clients...');
        fetchClients();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    /*
    const interval = setInterval(() => {
      if (kripaStaffId) {
        fetchClients();
      }
    }, 10000);
    */

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [kripaStaffId, fetchClients]);

  const handleEdit = (client) => {
    setEditingClient(client.id);
    setEditData({
      amount_paid: client.amount_paid || '',
      fee_status: client.fee_status || '',
      assessment_authority: client.assessment_authority || '',
      occupation_mapped: client.occupation_mapped || '',
      registration_fee_paid: client.registration_fee_paid || false,
      name: client.name || '',
      phone_number: client.phone_number || '',
      email: client.email || '',
      age: client.age || '',
      occupation: client.occupation || '',
      qualification: client.qualification || '',
      year_of_experience: client.year_of_experience || '',
      country: client.country || '', // Keep for backward compatibility
      target_country: client.target_country || client.country || '',
      residing_country: client.residing_country || '',
      program: client.program || '',
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

  const handleProcessingAction = async (clientId, action) => {
    try {
      const client = clients.find(c => c.id === clientId);
      const existingHistory = client.completed_actions || [];

      // Check if action already completed - if yes, do nothing (silent)
      const actionAlreadyCompleted = existingHistory.some(a => a.action === action);
      if (actionAlreadyCompleted) {
        return; // Already done, no need to do anything
      }

      const updates = {};

      // Add to completed actions history
      const actionLabel = {
        'hand_over_to_australia': 'Hand Over to Australia',
        'pending_payment_done': 'Confirm Pending Payment Done',
        'service_agreement_submitted': 'Service Agreement Submitted'
      }[action] || action.replace(/_/g, ' ');

      // Add new action to history
      updates.completed_actions = [
        ...existingHistory,
        {
          action: action,
          label: actionLabel,
          completed_at: new Date().toISOString(),
          completed_by: user.id,
          completed_by_name: user.name || user.email
        }
      ];

      // Update processing_status to the latest action (for backward compatibility)
      updates.processing_status = action;

      // Handle specific action updates
      if (action === 'pending_payment_done') {
        updates.fee_status = '1st Installment Completed';
      }

      await axios.put(`${API_BASE_URL}/api/clients/${clientId}`, updates);
      // No alert - silent save
      fetchClients();
    } catch (error) {
      console.error('Error processing action:', error);
      // No alert on error either - silent fail
    }
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
    return <div className="kripa-dashboard-loading">Loading processing tasks...</div>;
  }

  return (
    <div className="kripa-dashboard">
      <div className="dashboard-header">
        <div>
          <h1>Processing Stage 2 - Processing Tasks</h1>
          <p className="dashboard-subtitle">Clients assigned for processing and review</p>
        </div>
      </div>

      {clients.length === 0 ? (
        <div className="no-tasks">
          <p>No processing tasks assigned yet</p>
          <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '8px' }}>
            User ID: {user?.id} | Name: {user?.name} | Email: {user?.email}
          </p>
          <button
            onClick={async () => {
              try {
                const allClients = await axios.get(`${API_BASE_URL}/api/clients`);
                console.log('All clients:', allClients.data);
                alert(`Total clients: ${allClients.data.length}\nCheck console for details`);
              } catch (e) {
                console.error('Error:', e);
              }
            }}
            style={{
              marginTop: '12px',
              padding: '8px 16px',
              background: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            Debug: Check All Clients
          </button>
        </div>
      ) : (
        <div className="tasks-grid">
          {clients.map((client) => {
            const isEditing = editingClient === client.id;

            return (
              <div key={client.id} className="client-profile-wrapper">
                <div className={`processing-task-card ${client.processing_status ? 'has-status' : ''}`}>
                  <div className="task-header">
                    <div className="task-avatar">
                      {getInitials(client.name)}
                    </div>
                    <div className="task-info">
                      <h2>{client.name}</h2>
                      <p className="task-meta">Client Profile</p>
                    </div>
                    {client.processing_status && (
                      <div className="processing-status-badge">
                        <FiCheck className="badge-check-icon" />
                        <span>{client.processing_status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
                      </div>
                    )}
                  </div>

                  <div className="task-section">
                    <h3 className="task-section-title">Contact Information</h3>
                    <div className="task-detail-row">
                      <span className="task-label">Phone:</span>
                      <span className="task-value">{client.phone_number ? `${client.phone_country_code || ''} ${client.phone_number}` : '-'}</span>
                    </div>
                    <div className="task-detail-row">
                      <span className="task-label">Email:</span>
                      <span className="task-value">{client.email || '-'}</span>
                    </div>
                    <div className="task-detail-row">
                      <span className="task-label">WhatsApp:</span>
                      <span className="task-value">{client.whatsapp_number ? `${client.whatsapp_country_code || ''} ${client.whatsapp_number}` : '-'}</span>
                    </div>
                  </div>

                  <div className="task-section">
                    <h3 className="task-section-title">Professional Details</h3>
                    <div className="task-detail-row">
                      <span className="task-label">Age:</span>
                      <span className="task-value">{client.age || '-'}</span>
                    </div>
                    <div className="task-detail-row">
                      <span className="task-label">Occupation:</span>
                      <span className="task-value">{client.occupation || '-'}</span>
                    </div>
                    <div className="task-detail-row">
                      <span className="task-label">Qualification:</span>
                      <span className="task-value">{client.qualification || '-'}</span>
                    </div>
                    <div className="task-detail-row">
                      <span className="task-label">Experience:</span>
                      <span className="task-value">{client.year_of_experience ? `${client.year_of_experience} years` : '-'}</span>
                    </div>
                    <div className="task-detail-row">
                      <span className="task-label">Target Country:</span>
                      <span className="task-value">{client.target_country || client.country || '-'}</span>
                    </div>
                    <div className="task-detail-row">
                      <span className="task-label">Residing Country:</span>
                      <span className="task-value">{client.residing_country || '-'}</span>
                    </div>
                    <div className="task-detail-row">
                      <span className="task-label">Program:</span>
                      <span className="task-value">{client.program || '-'}</span>
                    </div>
                  </div>

                  <div className="task-section registration-section">
                    <h3 className="task-section-title">Registration Details</h3>
                    {isEditing ? (
                      <>
                        <div className="task-detail-row">
                          <label>Assessment Authority:</label>
                          <input
                            type="text"
                            value={editData.assessment_authority}
                            onChange={(e) => setEditData({ ...editData, assessment_authority: e.target.value })}
                            className="task-input"
                            placeholder="Enter assessment authority"
                          />
                        </div>
                        <div className="task-detail-row">
                          <label>Occupation Mapped:</label>
                          <input
                            type="text"
                            value={editData.occupation_mapped}
                            onChange={(e) => setEditData({ ...editData, occupation_mapped: e.target.value })}
                            className="task-input"
                            placeholder="Enter occupation mapped"
                          />
                        </div>
                        <div className="task-detail-row">
                          <label>Registration Fee Paid:</label>
                          <select
                            value={editData.registration_fee_paid}
                            onChange={(e) => setEditData({ ...editData, registration_fee_paid: e.target.value === 'true' })}
                            className="task-select"
                          >
                            <option value="false">No</option>
                            <option value="true">Yes</option>
                          </select>
                        </div>
                        <div className="task-actions">
                          <button
                            className="btn-save-task"
                            onClick={() => handleSave(client.id)}
                          >
                            <FiSave /> Save Changes
                          </button>
                          <button
                            className="btn-cancel-task"
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
                        <div className="task-detail-row">
                          <span className="task-label">Assessment Authority:</span>
                          <span className="task-value">{client.assessment_authority || '-'}</span>
                        </div>
                        <div className="task-detail-row">
                          <span className="task-label">Occupation Mapped:</span>
                          <span className="task-value">{client.occupation_mapped || '-'}</span>
                        </div>
                        <div className="task-detail-row">
                          <span className="task-label">Registration Fee Paid:</span>
                          <span className="task-value">{client.registration_fee_paid ? 'Yes' : 'No'}</span>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="task-section payment-section">
                    <h3 className="task-section-title">Payment Information</h3>
                    {isEditing ? (
                      <>
                        <div className="task-detail-row">
                          <label>Amount Paid:</label>
                          <input
                            type="number"
                            value={editData.amount_paid}
                            onChange={(e) => setEditData({ ...editData, amount_paid: e.target.value })}
                            className="task-input"
                            placeholder="Enter amount"
                          />
                        </div>
                        <div className="task-detail-row">
                          <label>Fee Status:</label>
                          <select
                            value={editData.fee_status}
                            onChange={(e) => setEditData({ ...editData, fee_status: e.target.value })}
                            className="task-select"
                          >
                            <option value="">Select Status</option>
                            <option value="1st Installment Completed">1st Installment Completed</option>
                            <option value="Payment Pending">Payment Pending</option>
                            <option value="PTE Fee Paid">PTE Fee Paid</option>
                          </select>
                        </div>
                        <div className="task-actions">
                          <button
                            className="btn-save-task"
                            onClick={() => handleSave(client.id)}
                          >
                            <FiSave /> Save Changes
                          </button>
                          <button
                            className="btn-cancel-task"
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
                        <div className="task-detail-row">
                          <span className="task-label">Amount Paid:</span>
                          <span className="task-value">
                            {client.amount_paid !== null && client.amount_paid !== undefined
                              ? `د.إ ${client.amount_paid}`
                              : '-'}
                          </span>
                        </div>
                        <div className="task-detail-row">
                          <span className="task-label">Fee Status:</span>
                          <span className={`fee-status-badge ${client.fee_status?.toLowerCase().replace(/\s+/g, '-')}`}>
                            {client.fee_status || 'Not Set'}
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  {!isEditing && (
                    <div className="task-actions-footer">
                      <button
                        className="btn-edit-task"
                        onClick={() => handleEdit(client)}
                      >
                        <FiEdit2 /> Edit Client Information
                      </button>
                    </div>
                  )}
                </div>

                {/* Processing Actions - Outside Profile Card */}
                {!isEditing && (
                  <div className="processing-actions-container">
                    <div className="processing-buttons">
                      {(() => {
                        const isHandOverCompleted = client.completed_actions?.some(a => a.action === 'hand_over_to_australia');
                        return (
                          <button
                            className={`btn-processing-action ${isHandOverCompleted ? 'completed' : ''}`}
                            onClick={() => handleProcessingAction(client.id, 'hand_over_to_australia')}
                          >
                            {isHandOverCompleted ? (
                              <>
                                <FiCheck /> Hand Over to Australia - Done
                              </>
                            ) : (
                              <>
                                <FiSend /> Hand Over to Australia
                              </>
                            )}
                          </button>
                        );
                      })()}
                      {(() => {
                        const isPaymentDone = client.completed_actions?.some(a => a.action === 'pending_payment_done');
                        return (
                          <button
                            className={`btn-processing-action ${isPaymentDone ? 'completed' : ''}`}
                            onClick={() => handleProcessingAction(client.id, 'pending_payment_done')}
                          >
                            {isPaymentDone ? (
                              <>
                                <FiCheck /> Confirm Pending Payment Done - Done
                              </>
                            ) : (
                              <>
                                <FiDollarSign /> Confirm Pending Payment Done
                              </>
                            )}
                          </button>
                        );
                      })()}
                      {(() => {
                        const isAgreementSubmitted = client.completed_actions?.some(a => a.action === 'service_agreement_submitted');
                        return (
                          <button
                            className={`btn-processing-action ${isAgreementSubmitted ? 'completed' : ''}`}
                            onClick={() => handleProcessingAction(client.id, 'service_agreement_submitted')}
                          >
                            {isAgreementSubmitted ? (
                              <>
                                <FiCheck /> Service Agreement Submitted - Done
                              </>
                            ) : (
                              <>
                                <FiFileText /> Service Agreement Submitted
                              </>
                            )}
                          </button>
                        );
                      })()}
                    </div>
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

export default KripaDashboard;
