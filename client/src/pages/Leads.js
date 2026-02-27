import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import API_BASE_URL from '../config/api';
import './Leads.css';
import { FiSearch, FiFilter, FiEdit2, FiCalendar, FiMessageSquare, FiCheck, FiArrowLeft, FiDownload, FiUser, FiEdit, FiTrash2, FiClock } from 'react-icons/fi';

const Leads = () => {
  const { user, logout } = useAuth();
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
  const [phoneSearchInput, setPhoneSearchInput] = useState(searchParams.get('phone') || '');
  const [phoneSearch, setPhoneSearch] = useState(searchParams.get('phone') || '');
  const [assignedStaffFilter, setAssignedStaffFilter] = useState(searchParams.get('assigned_staff_id') || '');
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
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [importHistory, setImportHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    const urlSearch = searchParams.get('search') || '';
    const urlPhone = searchParams.get('phone') || '';
    const urlStatus = searchParams.get('status') || '';
    const showHistory = searchParams.get('showHistory') === 'true';

    setSearch(urlSearch);
    setSearchInput(urlSearch);
    setPhoneSearch(urlPhone);
    setPhoneSearchInput(urlPhone);
    setStatusFilter(urlStatus);

    if (showHistory) {
      setShowHistoryModal(true);
      fetchImportHistory();
    }
  }, [searchParams]);

  useEffect(() => {
    fetchLeads();
  }, [statusFilter, search, phoneSearch, assignedStaffFilter]);

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
      const token = localStorage.getItem('token');
      const search = searchParams.get('search');
      const phone = searchParams.get('phone');
      const status = searchParams.get('status');
      const assigned_staff_id = searchParams.get('assigned_staff_id');

      let url = `${API_BASE_URL}/api/leads?`;
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (phone) params.append('phone', phone);
      if (status) params.append('status', status);
      if (assigned_staff_id) params.append('assigned_staff_id', assigned_staff_id);

      const response = await axios.get(`${url}${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
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
      if (error.response?.status === 401) {
        logout();
      }
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
      // Only mark status as completed, do not auto-update date
      await axios.put(`${API_BASE_URL}/api/leads/${leadId}`, {
        follow_up_status: 'Completed',
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
    if (phoneSearchInput.trim()) params.set('phone', phoneSearchInput.trim());
    if (statusFilter) params.set('status', statusFilter);
    if (assignedStaffFilter) params.set('assigned_staff_id', assignedStaffFilter);
    setSearch(searchInput.trim());
    setPhoneSearch(phoneSearchInput.trim());
    navigate(`/leads?${params.toString()}`);
  };

  const handleSearchInputChange = (e) => {
    setSearchInput(e.target.value);
  };

  const handlePhoneSearchInputChange = (e) => {
    setPhoneSearchInput(e.target.value);
  };

  const handleStatusFilter = (status) => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (phoneSearch) params.set('phone', phoneSearch);
    if (status) params.set('status', status);
    if (assignedStaffFilter) params.set('assigned_staff_id', assignedStaffFilter);
    navigate(`/leads?${params.toString()}`);
  };

  const handleStaffFilter = (staffId) => {
    setAssignedStaffFilter(staffId);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (phoneSearch) params.set('phone', phoneSearch);
    if (statusFilter) params.set('status', statusFilter);
    if (staffId) params.set('assigned_staff_id', staffId);
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

  const handleLeadRowClick = (leadId, e) => {
    // Don't navigate if clicking on checkbox, button, or link
    if (e.target.closest('input[type="checkbox"]') ||
      e.target.closest('button') ||
      e.target.closest('a') ||
      e.target.closest('.quick-assign-dropdown')) {
      return;
    }
    navigate(`/leads/${leadId}`);
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

  const handleBulkDelete = async () => {
    if (selectedLeadIds.length === 0) return;

    if (window.confirm(`Are you sure you want to delete ${selectedLeadIds.length} selected lead(s)? This action cannot be undone.`)) {
      try {
        setBulkAssignLoading(true);
        const response = await axios.post(`${API_BASE_URL}/api/leads/bulk-delete`, {
          leadIds: selectedLeadIds
        });

        setSelectedLeadIds([]);
        fetchLeads();
        alert(`Successfully deleted ${selectedLeadIds.length} leads`);
      } catch (error) {
        console.error('Bulk delete error:', error);
        alert('Failed to delete some leads. You might not have permission.');
        fetchLeads();
      } finally {
        setBulkAssignLoading(false);
      }
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

  const handleViewLastImport = async () => {
    // Redirect to history modal instead of direct download
    setShowHistoryModal(true);
    fetchImportHistory();
  };

  const fetchImportHistory = async () => {
    try {
      setHistoryLoading(true);
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_BASE_URL}/api/leads/import-history`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setImportHistory(response.data || []);
    } catch (error) {
      console.error('Error fetching import history:', error);
    } finally {
      setHistoryLoading(false);
    }
  };

  const downloadHistoryFile = async (importId, originalName) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_BASE_URL}/api/leads/import-history/${importId}/download`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', originalName || 'imported_file.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert('Failed to download file');
    }
  };

  const statusOptions = ['Unassigned', 'Assigned', 'Follow-up', 'Prospect', 'Pending Lead', 'Not Eligible', 'Not Interested', 'Registration Completed'];

  const getStatusColor = (status) => {
    const colors = {
      'Unassigned': '#87CEEB', // Soft blue
      'Assigned': '#cbd5e1', // Slate 300 - Greyish blue for assigned
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
      'Unassigned': '#1e40af', // Dark blue
      'Assigned': '#334155', // Slate 700
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <h1>Clients (Leads)</h1>
            <button
              className="header-history-btn"
              onClick={() => { setShowHistoryModal(true); fetchImportHistory(); }}
              title="View full history of imported Excel files"
            >
              <FiClock /> Import History
            </button>
          </div>
        </div>
      </div>

      {/* Controls Section */}
      <div className="leads-controls-section">
        <div className="leads-controls">
          <form onSubmit={handleSearch} className="leads-search">
            <FiSearch className="search-icon" />
            <input
              type="text"
              placeholder="Search lead by name..."
              value={searchInput}
              onChange={handleSearchInputChange}
            />
            <FiSearch className="search-icon" style={{ marginLeft: '10px' }} />
            <input
              type="text"
              placeholder="Search lead by phone..."
              value={phoneSearchInput}
              onChange={handlePhoneSearchInputChange}
            />
            <button type="submit" style={{ display: 'none' }}></button>
          </form>

          {canManageLeads && (
            <select
              className="staff-filter-select"
              value={assignedStaffFilter}
              onChange={(e) => handleStaffFilter(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #e5e7eb',
                backgroundColor: 'white',
                color: '#374151',
                fontSize: '14px',
                marginRight: '10px'
              }}
            >
              <option value="">All Staff</option>
              {staffList.map(staff => (
                <option key={staff.id} value={staff.id}>
                  {staff.name}
                </option>
              ))}
            </select>
          )}
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
            <button
              className="bulk-delete-button"
              onClick={handleBulkDelete}
              style={{
                padding: '8px 16px',
                backgroundColor: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '14px',
                fontWeight: 500,
                marginLeft: '10px'
              }}
            >
              <FiTrash2 /> Delete
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

      {/* Import History Modal */}
      {showHistoryModal && (
        <div className="modal-overlay" onClick={() => setShowHistoryModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '900px', width: '95%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0 }}>Import History</h2>
              <button
                onClick={() => setShowHistoryModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer' }}
              >&times;</button>
            </div>

            {historyLoading ? (
              <div style={{ textAlign: 'center', padding: '40px' }}>Loading history...</div>
            ) : importHistory.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>No import history found.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #eee', textAlign: 'left' }}>
                      <th style={{ padding: '12px' }}>Date</th>
                      <th style={{ padding: '12px' }}>Filename</th>
                      <th style={{ padding: '12px' }}>Total</th>
                      <th style={{ padding: '12px' }}>Success</th>
                      <th style={{ padding: '12px' }}>Skipped</th>
                      <th style={{ padding: '12px' }}>Errors</th>
                      <th style={{ padding: '12px' }}>By</th>
                      <th style={{ padding: '12px' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importHistory.map((item) => (
                      <tr key={item.id} style={{ borderBottom: '1px solid #f9f9f9' }}>
                        <td style={{ padding: '12px' }}>{new Date(item.created_at).toLocaleString()}</td>
                        <td style={{ padding: '12px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.original_filename}>
                          {item.original_filename}
                        </td>
                        <td style={{ padding: '12px' }}><strong>{item.total_rows}</strong></td>
                        <td style={{ padding: '12px', color: 'green' }}>{item.successful_rows}</td>
                        <td style={{ padding: '12px', color: 'orange' }}>{item.skipped_rows}</td>
                        <td style={{ padding: '12px', color: 'red' }}>{item.error_rows}</td>
                        <td style={{ padding: '12px' }}>{item.creator_name || 'System'}</td>
                        <td style={{ padding: '12px' }}>
                          <button
                            onClick={() => downloadHistoryFile(item.id, item.original_filename)}
                            style={{
                              padding: '6px 10px',
                              backgroundColor: '#f3f4f6',
                              border: '1px solid #d1d5db',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <FiDownload size={14} /> Download
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ marginTop: '20px', textAlign: 'right' }}>
              <button
                className="btn-secondary"
                onClick={() => setShowHistoryModal(false)}
                style={{ padding: '8px 20px' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lead Details Modal */}


      {/* Leads Table */}
      <div className="leads-table-container">
        {leads.length === 0 ? (
          <div className="no-leads">No leads found</div>
        ) : (
          <table className="leads-table">
            <thead>
              <tr>
                {canManageLeads && (
                  <th className="checkbox-column" style={{ width: '40px' }}>
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
                <th className="sticky-name" style={{ minWidth: '150px' }}>Name</th>
                <th style={{ minWidth: '130px' }}>Phone</th>
                <th style={{ minWidth: '180px' }}>Email</th>
                <th style={{ width: '80px' }}>Priority</th>
                <th style={{ minWidth: '200px' }}>Source</th>
                <th style={{ width: '110px' }}>Follow-up Date</th>

                <th style={{ width: '110px' }}>Date Added</th>
                <th style={{ width: '100px' }}>Lead Status</th>
                <th style={{ width: '120px', fontWeight: 600, color: '#8B6914' }}>Assigned To</th>
                <th style={{ width: '110px' }}>Actions</th>
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
                  <td className="name-cell sticky-name" title={lead.name}>{lead.name}</td>
                  <td style={{ maxWidth: '130px' }} title={`${lead.phone_country_code || ''} ${lead.phone_number || ''}${lead.secondary_phone_number ? '\nSec: ' + lead.secondary_phone_number : ''}`}>
                    <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {(() => {
                        const rawPhone = `${lead.phone_country_code || ''} ${lead.phone_number || ''}`;
                        const cleanPhone = rawPhone.replace(/^(yes|no)([\s-:]+)?/i, '').trim();
                        return cleanPhone || '-';
                      })()}
                    </div>
                    {lead.secondary_phone_number && (
                      <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        Sec: {lead.secondary_phone_number}
                      </div>
                    )}
                  </td>
                  <td style={{ maxWidth: '180px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={lead.email || ''}>
                    {lead.email || '-'}
                  </td>
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
                    <div className="comment-cell" title={lead.source || ''}>
                      {(() => {
                        const rawSource = lead.source || '';
                        // Remove "Yes", "No", "Maybe" with separators like " - ", " : ", " ", etc.
                        const cleanSource = rawSource.replace(/^(yes|no|maybe)([\s-:]+)?/i, '').trim();
                        return cleanSource || '-';
                      })()}
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
                    <div className="date-cell" title={lead.created_at ? new Date(lead.created_at).toLocaleString() : ''}>
                      {lead.created_at ? new Date(lead.created_at).toLocaleDateString() : '-'}
                      <div style={{ fontSize: '11px', color: '#6b7280' }}>
                        {lead.created_at ? new Date(lead.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </div>
                    </div>
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
                      {canManageLeads && (
                        <button
                          className="btn-delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`Are you sure you want to delete lead: ${lead.name}?`)) {
                              axios.delete(`${API_BASE_URL}/api/leads/${lead.id}`, {
                                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
                              })
                                .then(() => {
                                  fetchLeads();
                                  alert('Lead deleted successfully');
                                })
                                .catch(error => {
                                  console.error('Delete error:', error);
                                  alert('Failed to delete lead');
                                });
                            }
                          }}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#fee2e2',
                            color: '#ef4444',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '13px',
                            fontWeight: 500,
                            marginLeft: '8px'
                          }}
                          title="Delete Lead"
                        >
                          <FiTrash2 /> Delete
                        </button>
                      )}
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
