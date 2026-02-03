import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import API_BASE_URL from '../config/api';
import './Clients.css';
import { FiSearch, FiEdit2, FiUser, FiDollarSign, FiClock, FiCheck, FiSend, FiFileText, FiArrowLeft } from 'react-icons/fi';

const Clients = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [feeStatusFilter, setFeeStatusFilter] = useState('');

  // Check if user can view payment data - Only Admin, Sneha, and Kripa
  const userName = user?.name || '';
  const userEmail = user?.email || '';
  const canViewPaymentData = user?.role === 'ADMIN' ||
    userName === 'Sneha' || userName === 'SNEHA' || userEmail === 'sneha@toniosenora.com' ||
    userName === 'Kripa' || userName === 'KRIPA' || userEmail === 'kripa@toniosenora.com';

  useEffect(() => {
    if (id) {
      // If ID is in URL, fetch that specific client
      fetchClientDetail(id);
    } else {
      fetchClients();
    }
  }, [id, feeStatusFilter, search]);

  // Auto-refresh when page becomes visible (user switches tabs/windows)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('🔄 Clients page visible, refreshing...');
        fetchClients();
      }
    };

    const handleFocus = () => {
      console.log('🔄 Window focused, refreshing clients...');
      fetchClients();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    /*
    const interval = setInterval(() => {
      fetchClients();
    }, 10000);
    */

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const fetchClients = async () => {
    try {
      setLoading(true);
      const params = {};
      if (feeStatusFilter) params.fee_status = feeStatusFilter;
      if (search) params.search = search;

      const response = await axios.get(`${API_BASE_URL}/api/clients`, {
        params,
        // Force fresh data
        headers: {
          'Cache-Control': 'no-cache'
        }
      });
      setClients(response.data);
    } catch (error) {
      console.error('Error fetching clients:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchClientDetail = async (clientId) => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE_URL}/api/clients/${clientId}`, {
        headers: {
          'Cache-Control': 'no-cache'
        }
      });
      setSelectedClient(response.data);
    } catch (error) {
      console.error('Error fetching client detail:', error);
      navigate('/clients');
    } finally {
      setLoading(false);
    }
  };

  const handleClientClick = (clientId) => {
    navigate(`/clients/${clientId}`);
  };

  const getFeeStatusColor = (status) => {
    const colors = {
      '1st Installment Completed': '#86EFAC',
      'Payment Pending': '#FCA5A5',
      'PTE Fee Paid': '#93C5FD',
    };
    return colors[status] || '#E5E7EB';
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
    return <div className="clients-loading">Loading...</div>;
  }

  // Show client detail view if ID is in URL
  if (id && selectedClient) {
    return (
      <div className="clients">
        <div className="clients-header">
          <button
            className="btn-back"
            onClick={() => navigate('/clients')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '20px',
              padding: '8px 16px',
              background: '#F3F4F6',
              border: '1px solid #D1D5DB',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            <FiArrowLeft /> Back to Clients
          </button>
          <h1>Client Profile</h1>
          <p className="clients-subtitle">{selectedClient.name}</p>
        </div>

        <div className="client-profile-detail">
          <div className="client-profile-card">
            <div className="profile-header">
              <div className="profile-avatar">
                {getInitials(selectedClient.name)}
              </div>
              <div className="profile-info">
                <h2>{selectedClient.name}</h2>
                <p className="profile-subtitle">Client Profile</p>
              </div>
            </div>

            <div className="profile-section">
              <h3 className="profile-section-title">Contact Information</h3>
              <div className="profile-detail-row">
                <span className="profile-label">Phone:</span>
                <span className="profile-value">{selectedClient.phone_number ? `${selectedClient.phone_country_code || ''} ${selectedClient.phone_number}` : '-'}</span>
              </div>
              <div className="profile-detail-row">
                <span className="profile-label">Email:</span>
                <span className="profile-value">{selectedClient.email || '-'}</span>
              </div>
              <div className="profile-detail-row">
                <span className="profile-label">WhatsApp:</span>
                <span className="profile-value">{selectedClient.whatsapp_number ? `${selectedClient.whatsapp_country_code || ''} ${selectedClient.whatsapp_number}` : '-'}</span>
              </div>
            </div>

            <div className="profile-section">
              <h3 className="profile-section-title">Professional Details</h3>
              <div className="profile-detail-row">
                <span className="profile-label">Age:</span>
                <span className="profile-value">{selectedClient.age || '-'}</span>
              </div>
              <div className="profile-detail-row">
                <span className="profile-label">Occupation:</span>
                <span className="profile-value">{selectedClient.occupation || '-'}</span>
              </div>
              <div className="profile-detail-row">
                <span className="profile-label">Qualification:</span>
                <span className="profile-value">{selectedClient.qualification || '-'}</span>
              </div>
              <div className="profile-detail-row">
                <span className="profile-label">Experience:</span>
                <span className="profile-value">{selectedClient.year_of_experience ? `${selectedClient.year_of_experience} years` : '-'}</span>
              </div>
              <div className="profile-detail-row">
                <span className="profile-label">Target Country:</span>
                <span className="profile-value">{selectedClient.target_country || selectedClient.country || '-'}</span>
              </div>
              <div className="profile-detail-row">
                <span className="profile-label">Residing Country:</span>
                <span className="profile-value">{selectedClient.residing_country || '-'}</span>
              </div>
              <div className="profile-detail-row">
                <span className="profile-label">Program:</span>
                <span className="profile-value">{selectedClient.program || '-'}</span>
              </div>
            </div>

            <div className="profile-section">
              <h3 className="profile-section-title">Registration Details</h3>
              <div className="profile-detail-row">
                <span className="profile-label">Assessment Authority:</span>
                <span className="profile-value">{selectedClient.assessment_authority || '-'}</span>
              </div>
              <div className="profile-detail-row">
                <span className="profile-label">Occupation Mapped:</span>
                <span className="profile-value">{selectedClient.occupation_mapped || '-'}</span>
              </div>
              <div className="profile-detail-row">
                <span className="profile-label">Registration Fee Paid:</span>
                <span className="profile-value">{selectedClient.registration_fee_paid ? 'Yes' : 'No'}</span>
              </div>
            </div>

            {selectedClient.processing_status && (
              <div className="profile-section">
                <h3 className="profile-section-title">Processing Status</h3>
                <div className="profile-detail-row">
                  <span className="profile-label">Status:</span>
                  <span className="processing-status-badge-client">
                    <FiCheck className="status-icon" />
                    {selectedClient.processing_status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Show client list view
  return (
    <div className="clients">
      <div className="clients-header">
        <h1>Clients</h1>
        <p className="clients-subtitle">All registered clients in the system</p>
      </div>

      <div className="clients-filters">
        <form onSubmit={(e) => { e.preventDefault(); fetchClients(); }} className="search-form">
          <div className="search-input-wrapper">
            <FiSearch className="search-icon" />
            <input
              type="text"
              placeholder="Search clients..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="search-input"
            />
          </div>
        </form>
        {canViewPaymentData && (
          <div className="filter-group">
            <label>Fee Status:</label>
            <select
              value={feeStatusFilter}
              onChange={(e) => setFeeStatusFilter(e.target.value)}
              className="filter-select"
            >
              <option value="">All</option>
              <option value="1st Installment Completed">1st Installment Completed</option>
              <option value="Payment Pending">Payment Pending</option>
              <option value="PTE Fee Paid">PTE Fee Paid</option>
            </select>
          </div>
        )}
      </div>

      <div className="clients-list">
        {clients.length === 0 ? (
          <div className="no-clients">
            <p>No clients found</p>
          </div>
        ) : (
          clients.map((client) => {
            const daysUntilDue = client.payment_due_date ? getDaysUntilDue(client.payment_due_date) : null;
            const isWarning = daysUntilDue !== null && daysUntilDue <= 2 && daysUntilDue >= 0;
            const isOverdue = daysUntilDue !== null && daysUntilDue < 0;

            return (
              <div
                key={client.id}
                className="client-card-simple"
                onClick={() => handleClientClick(client.id)}
                style={{ cursor: 'pointer' }}
              >
                <div className="client-name-row">
                  <div className="client-avatar-simple">
                    {getInitials(client.name)}
                  </div>
                  <h3 className="client-name">{client.name}</h3>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default Clients;
