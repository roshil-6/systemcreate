import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import API_BASE_URL from '../config/api';
import './Leads.css';
import { FiSearch, FiFilter, FiEdit2, FiCalendar, FiMessageSquare, FiCheck, FiArrowLeft, FiDownload, FiUser, FiEdit } from 'react-icons/fi';

const Leads = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [staffList, setStaffList] = useState([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState([]);
  const [bulkAssignStaffId, setBulkAssignStaffId] = useState('');
  const [bulkAssignLoading, setBulkAssignLoading] = useState(false);
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '');
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [assigningLeadId, setAssigningLeadId] = useState(null);
  const [assignStaffId, setAssignStaffId] = useState('');
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [bulkEditData, setBulkEditData] = useState({
    status: '',
    priority: '',
    comment: '',
    follow_up_date: '',
    follow_up_status: '',
  });
  const [bulkEditLoading, setBulkEditLoading] = useState(false);
  const [selectedLeadDetails, setSelectedLeadDetails] = useState(null);
  const [showLeadDetailsModal, setShowLeadDetailsModal] = useState(false);
  const [loadingLeadDetails, setLoadingLeadDetails] = useState(false);

  useEffect(() => {
    const urlSearch = searchParams.get('search') || '';
    const urlStatus = searchParams.get('status') || '';
    setSearch(urlSearch);
    setSearchInput(urlSearch);
    setStatusFilter(urlStatus);
  }, [searchParams]);

  useEffect(() => {
    fetchLeads();
  }, [statusFilter, search]);

  useEffect(() => {
    if (user?.role === 'ADMIN' || user?.role === 'SALES_TEAM_HEAD' || user?.role === 'SALES_TEAM' || user?.role === 'PROCESSING' || user?.role === 'STAFF') {
      fetchStaffList();
    }
  }, [user]);

  useEffect(() => {
    setSelectedLeadIds((prev) => prev.filter((id) => leads.some((lead) => lead.id === id)));
  }, [leads]);

  useEffect(() => {
    // Close assign dropdown when clicking outside
    const handleClickOutside = (event) => {
      if (assigningLeadId && !event.target.closest('.quick-assign-dropdown') && !event.target.closest('.btn-assign')) {
        setAssigningLeadId(null);
        setAssignStaffId('');
      }
    };

    if (assigningLeadId) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [assigningLeadId]);

  const fetchLeads = async () => {
    try {
      setLoading(true);
      const params = {};
      if (statusFilter) params.status = statusFilter;
      if (search) params.search = search;

      const response = await axios.get(`${API_BASE_URL}/api/leads`, { params });
      // Sort leads alphabetically by name
      const leadsData = response.data || [];
      const sortedLeads = leadsData.sort((a, b) => {
        const nameA = (a.name || '').toLowerCase();
        const nameB = (b.name || '').toLowerCase();
        return nameA.localeCompare(nameB);
      });
      setLeads(sortedLeads);
    } catch (error) {
      console.error('Error fetching leads:', error);
    } finally {
      setLoading(false);
    }
  };

  const isDueFollowUp = (lead) => {
    if (!lead.follow_up_date) return false;
    const today = new Date().toISOString().split('T')[0];
    const followDate = new Date(lead.follow_up_date).toISOString().split('T')[0];
    const isActiveStatus = lead.status !== 'Pending Lead' && lead.status !== 'Closed / Rejected';
    return followDate < today && isActiveStatus;
  };

  const handleMarkFollowUpCompleted = async (leadId) => {
    try {
      // Update follow_up_date to today to mark as completed
      const today = new Date().toISOString().split('T')[0];
      await axios.put(`${API_BASE_URL}/api/leads/${leadId}`, {
        follow_up_date: today,
      });
      await fetchLeads();
    } catch (error) {
      alert(error.response?.data?.error || 'Error marking follow-up as completed');
    }
  };

  const fetchStaffList = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/leads/staff/list`);
      setStaffList(response.data || []);
    } catch (error) {
      console.error('Error fetching staff list:', error);
      setStaffList([]);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (searchInput.trim()) params.set('search', searchInput.trim());
    if (statusFilter) params.set('status', statusFilter);
    setSearch(searchInput.trim());
    navigate(`/leads?${params.toString()}`);
  };

  const handleSearchInputChange = (e) => {
    setSearchInput(e.target.value);
  };

  const handleStatusFilter = (status) => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    navigate(`/leads?${params.toString()}`);
  };

  const toggleLeadSelection = (leadId) => {
    setSelectedLeadIds((prev) => (
      prev.includes(leadId) ? prev.filter((id) => id !== leadId) : [...prev, leadId]
    ));
  };

  const toggleSelectAll = () => {
    if (selectedLeadIds.length === leads.length) {
      setSelectedLeadIds([]);
    } else {
      setSelectedLeadIds(leads.map((lead) => lead.id));
    }
  };

  const handleBulkAssign = async () => {
    if (!bulkAssignStaffId || selectedLeadIds.length === 0) return;
    try {
      setBulkAssignLoading(true);
      await axios.post(`${API_BASE_URL}/api/leads/bulk-assign`, {
        leadIds: selectedLeadIds,
        assigned_staff_id: Number(bulkAssignStaffId),
      });
      setSelectedLeadIds([]);
      setBulkAssignStaffId('');
      fetchLeads();
    } catch (error) {
      alert(error.response?.data?.error || 'Error assigning leads');
    } finally {
      setBulkAssignLoading(false);
    }
  };

  const handleLeadRowClick = async (leadId, e) => {
    // Don't open modal if clicking on checkbox, button, or link
    if (e.target.closest('input[type="checkbox"]') || 
        e.target.closest('button') || 
        e.target.closest('a') ||
        e.target.closest('.quick-assign-dropdown')) {
      return;
    }

    try {
      setLoadingLeadDetails(true);
      const response = await axios.get(`${API_BASE_URL}/api/leads/${leadId}`);
      setSelectedLeadDetails(response.data);
      setShowLeadDetailsModal(true);
    } catch (error) {
      console.error('Error fetching lead details:', error);
      alert('Error loading lead details');
    } finally {
      setLoadingLeadDetails(false);
    }
  };

  const handleBulkEdit = async () => {
    if (selectedLeadIds.length === 0) return;
    
    try {
      setBulkEditLoading(true);
      
      // Prepare update data - only include fields that have values
      const updateData = {};
      if (bulkEditData.status) updateData.status = bulkEditData.status;
      if (bulkEditData.priority) updateData.priority = bulkEditData.priority;
      if (bulkEditData.follow_up_date) updateData.follow_up_date = bulkEditData.follow_up_date;
      if (bulkEditData.follow_up_status) updateData.follow_up_status = bulkEditData.follow_up_status;

      if (Object.keys(updateData).length === 0 && (!bulkEditData.comment || bulkEditData.comment.trim() === '')) {
        alert('Please fill at least one field to update');
        setBulkEditLoading(false);
        return;
      }

      // For comments, we need to fetch each lead first to append to existing comment
      const updatePromises = selectedLeadIds.map(async (leadId) => {
        const leadUpdateData = { ...updateData };
        
        // If comment is provided, fetch the lead first to append comment
        if (bulkEditData.comment && bulkEditData.comment.trim() !== '') {
          try {
            const leadResponse = await axios.get(`${API_BASE_URL}/api/leads/${leadId}`);
            const existingComment = leadResponse.data.comment || '';
            // Append new comment to existing comment
            leadUpdateData.comment = existingComment 
              ? `${existingComment} | ${bulkEditData.comment.trim()}`
              : bulkEditData.comment.trim();
          } catch (error) {
            console.error(`Error fetching lead ${leadId} for comment append:`, error);
            // If we can't fetch, just use the new comment
            leadUpdateData.comment = bulkEditData.comment.trim();
          }
        }
        
        return axios.put(`${API_BASE_URL}/api/leads/${leadId}`, leadUpdateData);
      });

      await Promise.all(updatePromises);
      
      const updatedCount = selectedLeadIds.length;
      setSelectedLeadIds([]);
      setBulkEditData({
        status: '',
        priority: '',
        comment: '',
        follow_up_date: '',
        follow_up_status: '',
      });
      setShowBulkEditModal(false);
      fetchLeads();
      alert(`Successfully updated ${updatedCount} lead(s)`);
    } catch (error) {
      console.error('Bulk edit error:', error);
      alert(error.response?.data?.error || 'Error updating leads. Some leads may not have been updated.');
    } finally {
      setBulkEditLoading(false);
    }
  };

  const handleQuickAssign = async (leadId) => {
    if (!assignStaffId) return;
    try {
      await axios.put(`${API_BASE_URL}/api/leads/${leadId}`, {
        assigned_staff_id: Number(assignStaffId),
      });
      setAssigningLeadId(null);
      setAssignStaffId('');
      fetchLeads();
      alert('Lead transferred successfully!');
    } catch (error) {
      const errorMessage = error.response?.data?.error || error.message || 'Error transferring lead';
      console.error('Transfer error:', error);
      alert(errorMessage);
    }
  };

  const handleExportToGoogleSheets = async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (search) params.set('search', search);

      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_BASE_URL}/api/leads/export/csv?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `leads_export_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      alert('CSV file downloaded! You can import this file into Google Sheets by:\n1. Opening Google Sheets\n2. File > Import\n3. Upload the CSV file');
    } catch (error) {
      console.error('Export error:', error);
      alert('Error exporting leads. Please try again.');
    }
  };

  const statusOptions = ['New', 'Follow-up', 'Prospect', 'Pending Lead', 'Not Eligible', 'Not Interested', 'Registration Completed'];

  const getStatusColor = (status) => {
    const colors = {
      'New': '#87CEEB', // Soft blue
      'Follow-up': '#E6E6FA', // Lavender
      'Prospect': '#B0E0E6', // Powder blue
      'Pending Lead': '#DDA0DD', // Plum
      'Not Eligible': '#FCA5A5', // Light red
      'Not Interested': '#D3D3D3', // Light gray
      'Registration Completed': '#86EFAC', // Light green
    };
    return colors[status] || '#87CEEB';
  };

  const getStatusTextColor = (status) => {
    const colors = {
      'New': '#1e40af', // Dark blue
      'Follow-up': '#6b21a8', // Dark purple
      'Prospect': '#0e7490', // Dark cyan
      'Pending Lead': '#7c2d12', // Dark brown
      'Not Eligible': '#991B1B', // Dark red
      'Not Interested': '#374151', // Dark gray
      'Registration Completed': '#166534', // Dark green
    };
    return colors[status] || '#1e40af';
  };

  const getPriorityColor = (priority) => {
    const colors = {
      'hot': '#ef4444',
      'warm': '#f59e0b',
      'cold': '#3b82f6',
      'not interested': '#6b7280',
      'not eligible': '#dc2626',
    };
    return colors[priority] || '#6b7280';
  };

  const formatPriority = (priority) => {
    if (!priority) return '-';
    return priority.split(' ').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  if (loading) {
    return <div className="leads-loading">Loading leads...</div>;
  }

  const isAdmin = user?.role === 'ADMIN';
  const canManageLeads = user?.role === 'ADMIN' || user?.role === 'SALES_TEAM_HEAD' || user?.role === 'SALES_TEAM' || user?.role === 'PROCESSING' || user?.role === 'STAFF';
  const allSelected = leads.length > 0 && selectedLeadIds.length === leads.length;

  return (
    <div className="leads-page">
      <div className="leads-header">
        <button className="leads-back-btn" onClick={() => navigate('/')}>
          <FiArrowLeft /> Back to Dashboard
        </button>
        <h1>Clients (Leads)</h1>
      </div>
      
      {/* Controls Section */}
      <div className="leads-controls-section">
        <div className="leads-controls">
          <form onSubmit={handleSearch} className="leads-search">
            <FiSearch className="search-icon" />
            <input
              type="text"
              placeholder="Search lead by name to see assigned staff..."
              value={searchInput}
              onChange={handleSearchInputChange}
            />
          </form>
          <button
            className="export-btn"
            onClick={handleExportToGoogleSheets}
            title="Export to CSV (can be imported to Google Sheets)"
          >
            <FiDownload /> Export to Google Sheets
          </button>
          <div className="status-filters">
            <button
              className={`filter-btn ${statusFilter === '' ? 'active' : ''}`}
              onClick={() => handleStatusFilter('')}
            >
              All
            </button>
            {statusOptions.map((status) => (
              <button
                key={status}
                className={`filter-btn ${statusFilter === status ? 'active' : ''}`}
                onClick={() => handleStatusFilter(status)}
                style={{
                  borderColor: statusFilter === status ? getStatusColor(status) : '#e5e7eb',
                  backgroundColor: statusFilter === status ? getStatusColor(status) : '#FFF8E7',
                  color: statusFilter === status ? (status === 'Closed / Rejected' ? '#666' : '#333') : '#6b7280',
                }}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bulk Assign Bar */}
      {canManageLeads && selectedLeadIds.length > 0 && (
        <div className="bulk-assign-bar">
          <div className="bulk-assign-info">
            {selectedLeadIds.length} lead{selectedLeadIds.length !== 1 ? 's' : ''} selected
          </div>
          <div className="bulk-assign-controls" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              className="bulk-edit-button"
              onClick={() => setShowBulkEditModal(true)}
              style={{
                padding: '8px 16px',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '14px',
                fontWeight: 500,
              }}
            >
              <FiEdit /> Edit Details
            </button>
            <select
              className="bulk-assign-select"
              value={bulkAssignStaffId}
              onChange={(e) => setBulkAssignStaffId(e.target.value)}
            >
              <option value="">{isAdmin ? 'Select staff to assign...' : 'Select staff to transfer to...'}</option>
              {staffList.map((staff) => (
                <option key={staff.id} value={staff.id}>
                  {staff.name}
                </option>
              ))}
            </select>
            <button
              className="bulk-assign-button"
              onClick={handleBulkAssign}
              disabled={!bulkAssignStaffId || bulkAssignLoading}
            >
              {bulkAssignLoading ? (isAdmin ? 'Assigning...' : 'Transferring...') : (isAdmin ? 'Assign Selected' : 'Transfer Selected')}
            </button>
          </div>
        </div>
      )}

      {/* Bulk Edit Modal */}
      {showBulkEditModal && (
        <div className="modal-overlay" onClick={() => !bulkEditLoading && setShowBulkEditModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px', width: '90%' }}>
            <h2 style={{ marginTop: 0 }}>Edit {selectedLeadIds.length} Lead{selectedLeadIds.length !== 1 ? 's' : ''}</h2>
            <p style={{ color: '#666', marginBottom: '20px' }}>
              Update the fields below. Only filled fields will be updated for all selected leads.
            </p>
            
            <div className="form-group" style={{ marginBottom: '15px' }}>
              <label>Status</label>
              <select
                value={bulkEditData.status}
                onChange={(e) => setBulkEditData({ ...bulkEditData, status: e.target.value })}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd' }}
              >
                <option value="">-- Keep Current --</option>
                {statusOptions.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: '15px' }}>
              <label>Priority</label>
              <select
                value={bulkEditData.priority}
                onChange={(e) => setBulkEditData({ ...bulkEditData, priority: e.target.value })}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd' }}
              >
                <option value="">-- Keep Current --</option>
                <option value="hot">Hot</option>
                <option value="warm">Warm</option>
                <option value="cold">Cold</option>
                <option value="not interested">Not Interested</option>
                <option value="not eligible">Not Eligible</option>
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: '15px' }}>
              <label>Comment (will be appended to existing comments)</label>
              <textarea
                value={bulkEditData.comment}
                onChange={(e) => setBulkEditData({ ...bulkEditData, comment: e.target.value })}
                placeholder="Add a comment to all selected leads..."
                rows="3"
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd', resize: 'vertical' }}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '15px' }}>
              <label>Follow-up Date</label>
              <input
                type="date"
                value={bulkEditData.follow_up_date}
                onChange={(e) => setBulkEditData({ ...bulkEditData, follow_up_date: e.target.value })}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd' }}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label>Follow-up Status</label>
              <select
                value={bulkEditData.follow_up_status}
                onChange={(e) => setBulkEditData({ ...bulkEditData, follow_up_status: e.target.value })}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd' }}
              >
                <option value="">-- Keep Current --</option>
                <option value="Pending">Pending</option>
                <option value="Completed">Completed</option>
                <option value="Skipped">Skipped</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                className="btn-cancel"
                onClick={() => {
                  setShowBulkEditModal(false);
                  setBulkEditData({
                    status: '',
                    priority: '',
                    comment: '',
                    follow_up_date: '',
                    follow_up_status: '',
                  });
                }}
                disabled={bulkEditLoading}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#e5e7eb',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                className="btn-save"
                onClick={handleBulkEdit}
                disabled={bulkEditLoading}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                {bulkEditLoading ? 'Updating...' : 'Update Selected Leads'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lead Details Modal */}
      {showLeadDetailsModal && selectedLeadDetails && (
        <div className="modal-overlay" onClick={() => setShowLeadDetailsModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px', width: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0 }}>Lead Details</h2>
              <button
                onClick={() => setShowLeadDetailsModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#666',
                  padding: '0',
                  width: '30px',
                  height: '30px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                ×
              </button>
            </div>

            {loadingLeadDetails ? (
              <div style={{ textAlign: 'center', padding: '40px' }}>Loading...</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
                <div className="detail-field">
                  <label>Name</label>
                  <div>{selectedLeadDetails.name || '-'}</div>
                </div>

                <div className="detail-field">
                  <label>Phone Number</label>
                  <div>
                    {selectedLeadDetails.phone_country_code && selectedLeadDetails.phone_number ? (
                      <span>{selectedLeadDetails.phone_country_code} {selectedLeadDetails.phone_number}</span>
                    ) : (
                      selectedLeadDetails.phone_number || '-'
                    )}
                  </div>
                </div>

                <div className="detail-field">
                  <label>WhatsApp Number</label>
                  <div>
                    {selectedLeadDetails.whatsapp_country_code && selectedLeadDetails.whatsapp_number ? (
                      <span>{selectedLeadDetails.whatsapp_country_code} {selectedLeadDetails.whatsapp_number}</span>
                    ) : (
                      selectedLeadDetails.whatsapp_number || '-'
                    )}
                  </div>
                </div>

                <div className="detail-field">
                  <label>Email</label>
                  <div>{selectedLeadDetails.email || '-'}</div>
                </div>

                <div className="detail-field">
                  <label>Age</label>
                  <div>{selectedLeadDetails.age || '-'}</div>
                </div>

                <div className="detail-field">
                  <label>Occupation</label>
                  <div>{selectedLeadDetails.occupation || '-'}</div>
                </div>

                <div className="detail-field">
                  <label>Qualification</label>
                  <div>{selectedLeadDetails.qualification ? selectedLeadDetails.qualification.charAt(0).toUpperCase() + selectedLeadDetails.qualification.slice(1) : '-'}</div>
                </div>

                <div className="detail-field">
                  <label>Year of Experience</label>
                  <div>{selectedLeadDetails.year_of_experience || '-'}</div>
                </div>

                <div className="detail-field">
                  <label>Target Country</label>
                  <div>{selectedLeadDetails.target_country ? selectedLeadDetails.target_country.charAt(0).toUpperCase() + selectedLeadDetails.target_country.slice(1) : (selectedLeadDetails.country ? selectedLeadDetails.country.charAt(0).toUpperCase() + selectedLeadDetails.country.slice(1) : '-')}</div>
                </div>

                <div className="detail-field">
                  <label>Residing Country</label>
                  <div>{selectedLeadDetails.residing_country ? selectedLeadDetails.residing_country.charAt(0).toUpperCase() + selectedLeadDetails.residing_country.slice(1) : '-'}</div>
                </div>

                <div className="detail-field">
                  <label>Program</label>
                  <div>{selectedLeadDetails.program ? selectedLeadDetails.program.toUpperCase() : '-'}</div>
                </div>

                <div className="detail-field">
                  <label>Status</label>
                  <div>
                    <span
                      className="status-badge"
                      style={{
                        backgroundColor: getStatusColor(selectedLeadDetails.status),
                        color: getStatusTextColor(selectedLeadDetails.status),
                        border: `1px solid ${getStatusTextColor(selectedLeadDetails.status)}`,
                        fontWeight: 500,
                        padding: '4px 12px',
                        borderRadius: '12px',
                        fontSize: '12px',
                      }}
                    >
                      {selectedLeadDetails.status}
                    </span>
                  </div>
                </div>

                <div className="detail-field">
                  <label>Priority</label>
                  <div>
                    {selectedLeadDetails.priority ? (
                      <span
                        className="priority-badge"
                        style={{
                          backgroundColor: `${getPriorityColor(selectedLeadDetails.priority)}20`,
                          color: getPriorityColor(selectedLeadDetails.priority),
                          padding: '4px 12px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: 500,
                        }}
                      >
                        {formatPriority(selectedLeadDetails.priority)}
                      </span>
                    ) : (
                      '-'
                    )}
                  </div>
                </div>

                <div className="detail-field">
                  <label>Assigned To</label>
                  <div style={{
                    fontWeight: selectedLeadDetails.assigned_staff_name ? 600 : 400,
                    color: selectedLeadDetails.assigned_staff_name ? '#8B6914' : '#9ca3af',
                  }}>
                    {selectedLeadDetails.assigned_staff_name || 'Unassigned'}
                  </div>
                </div>

                <div className="detail-field">
                  <label>Follow-up Date</label>
                  <div>
                    {selectedLeadDetails.follow_up_date ? (
                      new Date(selectedLeadDetails.follow_up_date).toLocaleDateString()
                    ) : (
                      '-'
                    )}
                  </div>
                </div>

                <div className="detail-field">
                  <label>Follow-up Status</label>
                  <div>
                    <span style={{ 
                      color: selectedLeadDetails.follow_up_status === 'Completed' ? '#28a745' : 
                             selectedLeadDetails.follow_up_status === 'Skipped' ? '#dc3545' : '#ffc107',
                      fontWeight: '500'
                    }}>
                      {selectedLeadDetails.follow_up_status || 'Pending'}
                    </span>
                  </div>
                </div>

                {selectedLeadDetails.comment && (
                  <div className="detail-field" style={{ gridColumn: '1 / -1' }}>
                    <label>Comment</label>
                    <div style={{ 
                      padding: '12px', 
                      background: '#f9fafb', 
                      borderRadius: '6px',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}>
                      {selectedLeadDetails.comment}
                    </div>
                  </div>
                )}

                <div className="detail-field" style={{ gridColumn: '1 / -1', marginTop: '10px' }}>
                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => {
                        setShowLeadDetailsModal(false);
                        navigate(`/leads/${selectedLeadDetails.id}`);
                      }}
                      style={{
                        padding: '10px 20px',
                        backgroundColor: '#D4AF37',
                        color: '#FFF8E7',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: 500,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <FiEdit2 /> Edit Lead
                    </button>
                    <button
                      onClick={() => setShowLeadDetailsModal(false)}
                      style={{
                        padding: '10px 20px',
                        backgroundColor: '#F5F1E8',
                        color: '#8B6914',
                        border: '1px solid #E5D4A0',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: 500,
                      }}
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Leads Table */}
      <div className="leads-table-container">
        {leads.length === 0 ? (
          <div className="no-leads">No leads found</div>
        ) : (
          <table className="leads-table">
            <thead>
              <tr>
                {canManageLeads && (
                  <th className="checkbox-column">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleSelectAll();
                      }}
                    />
                  </th>
                )}
                <th>Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Priority</th>
                <th>Comment</th>
                <th>Follow-up Date</th>
                <th>Follow-up Status</th>
                <th>Status</th>
                <th style={{ fontWeight: 600, color: '#8B6914' }}>Assigned To</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr 
                  key={lead.id}
                  onClick={(e) => handleLeadRowClick(lead.id, e)}
                  style={{ cursor: 'pointer' }}
                >
                  {canManageLeads && (
                    <td className="checkbox-column">
                      <input
                        type="checkbox"
                        checked={selectedLeadIds.includes(lead.id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleLeadSelection(lead.id);
                        }}
                      />
                    </td>
                  )}
                  <td>{lead.name}</td>
                  <td>
                    {lead.phone_country_code && lead.phone_number ? (
                      <span>{lead.phone_country_code} {lead.phone_number}</span>
                    ) : (
                      lead.phone_number || '-'
                    )}
                  </td>
                  <td>{lead.email || '-'}</td>
                  <td>
                    {lead.priority ? (
                      <span
                        className="priority-badge"
                        style={{
                          backgroundColor: `${getPriorityColor(lead.priority)}20`,
                          color: getPriorityColor(lead.priority),
                        }}
                      >
                        {formatPriority(lead.priority)}
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td>
                    <div className="comment-cell" title={lead.comment || ''}>
                      {lead.comment ? (
                        <>
                          <FiMessageSquare style={{ marginRight: '4px', opacity: 0.6 }} />
                          {lead.comment.length > 30 ? `${lead.comment.substring(0, 30)}...` : lead.comment}
                        </>
                      ) : (
                        '-'
                      )}
                    </div>
                  </td>
                  <td>
                    {lead.follow_up_date ? (
                      <div className="date-cell" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <FiCalendar style={{ opacity: 0.6 }} />
                          {new Date(lead.follow_up_date).toLocaleDateString()}
                        </div>
                        {isDueFollowUp(lead) && (user?.role === 'STAFF' || user?.role === 'SALES_TEAM' || user?.role === 'PROCESSING') && (
                          <button
                            className="btn-mark-complete"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMarkFollowUpCompleted(lead.id);
                            }}
                            title="Mark follow-up as completed"
                          >
                            <FiCheck /> Complete
                          </button>
                        )}
                      </div>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td>
                    <span style={{ 
                      color: lead.follow_up_status === 'Completed' ? '#28a745' : 
                             lead.follow_up_status === 'Skipped' ? '#dc3545' : '#ffc107',
                      fontWeight: '500'
                    }}>
                      {lead.follow_up_status || 'Pending'}
                    </span>
                  </td>
                  <td>
                    <span
                      className="status-badge"
                      style={{
                        backgroundColor: getStatusColor(lead.status),
                        color: getStatusTextColor(lead.status),
                        border: `1px solid ${getStatusTextColor(lead.status)}`,
                        fontWeight: 500,
                      }}
                    >
                      {lead.status}
                    </span>
                  </td>
                  <td>
                    <span className="assigned-staff-cell" style={{
                      fontWeight: lead.assigned_staff_name ? 600 : 400,
                      color: lead.assigned_staff_name ? '#8B6914' : '#9ca3af',
                      fontSize: '14px',
                      padding: '4px 8px',
                      backgroundColor: lead.assigned_staff_name ? '#FFF4D6' : 'transparent',
                      borderRadius: '4px',
                      display: 'inline-block',
                    }}>
                      {lead.assigned_staff_name || 'Unassigned'}
                    </span>
                  </td>
                  <td style={{ position: 'relative' }}>
                    <div className="action-buttons-row">
                      {canManageLeads && (
                        <button
                          className="btn-assign"
                          onClick={(e) => {
                            e.stopPropagation();
                            setAssigningLeadId(lead.id);
                            setAssignStaffId(lead.assigned_staff_id || '');
                          }}
                          title={isAdmin ? 'Assign Lead' : 'Transfer Lead'}
                        >
                          <FiUser /> {isAdmin ? 'Assign' : 'Transfer'}
                        </button>
                      )}
                      <button
                        className="btn-view"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/leads/${lead.id}`);
                        }}
                      >
                        <FiEdit2 /> View
                      </button>
                    </div>
                    {canManageLeads && assigningLeadId === lead.id && (
                      <div className="quick-assign-dropdown">
                        <select
                          className="quick-assign-select"
                          value={assignStaffId}
                          onChange={(e) => setAssignStaffId(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <option value="">{isAdmin ? 'Select staff...' : 'Select staff to transfer to...'}</option>
                          {staffList.map((staff) => (
                            <option key={staff.id} value={staff.id}>
                              {staff.name}
                            </option>
                          ))}
                        </select>
                        <div className="quick-assign-actions">
                          <button
                            className="btn-assign-confirm"
                            onClick={() => handleQuickAssign(lead.id)}
                            disabled={!assignStaffId}
                          >
                            {isAdmin ? 'Assign' : 'Transfer'}
                          </button>
                          <button
                            className="btn-assign-cancel"
                            onClick={() => {
                              setAssigningLeadId(null);
                              setAssignStaffId('');
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default Leads;
