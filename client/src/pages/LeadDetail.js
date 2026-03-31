import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import API_BASE_URL from '../config/api';
import './LeadDetail.css';
import { FiSave, FiMessageSquare, FiUser, FiPhone, FiMail, FiCalendar, FiArrowLeft } from 'react-icons/fi';

/** Explicit Bearer header on every request (belt-and-suspenders with global axios interceptor). */
function authConfig(extra = {}) {
  const raw = localStorage.getItem('token');
  const token = raw ? String(raw).trim() : '';
  const headers = { ...extra.headers };
  if (token) headers.Authorization = `Bearer ${token}`;
  return { ...extra, headers };
}

const LeadDetail = () => {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const { user } = useAuth();
  const [lead, setLead] = useState(null);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(true);
  const [formData, setFormData] = useState({});
  const [newComment, setNewComment] = useState('');
  const [staffList, setStaffList] = useState([]);
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const duplicateCheckTimer = useRef(null);
  const [showChatComments, setShowChatComments] = useState(false);
  const chatEndRef = useRef(null);
  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  const [registrationData, setRegistrationData] = useState({
    assessment_authority: '',
    occupation_mapped: '',
    registration_fee_paid: '',
  });

  useEffect(() => {
    const canManageAssignment = user?.role === 'ADMIN'
      || user?.role === 'SALES_TEAM_HEAD'
      || user?.role === 'STAFF'
      || user?.role === 'SALES_TEAM'
      || user?.role === 'PROCESSING'
      || user?.role === 'HR';

    if (id === 'new') {
      setEditing(true);
      setLead({});
      setFormData({
        name: '',
        phone_number: '',
        phone_country_code: '+91',
        whatsapp_number: '',
        whatsapp_country_code: '+91',
        email: '',
        age: '',
        occupation: '',
        qualification: '',
        year_of_experience: '',
        country: '', // Keep for backward compatibility
        target_country: '',
        residing_country: '',
        program: '',
        status: 'New',
        assigned_staff_id: (user?.role === 'STAFF' || user?.role === 'HR') ? user.id : null,
        priority: '',
        comment: '',
        follow_up_date: '',
        follow_up_status: 'Pending',
        source: '',
        ielts_score: '',
      });
      if (canManageAssignment) {
        fetchStaffList();
      }
      setLoading(false);
    } else {
      fetchLead();
      fetchComments();
      if (canManageAssignment) {
        fetchStaffList();
      }
    }
  }, [id, user]);

  const fetchLead = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/leads/${id}`, authConfig());
      const data = response.data;
      setLead(data);
      setFormData(data);

      // Keep leads list cache in sync so the table shows the same assignee as detail after back navigation
      try {
        const leadIdNum = parseInt(id, 10);
        if (!Number.isNaN(leadIdNum)) {
          const cached = sessionStorage.getItem('leadsPageState');
          if (cached) {
            const state = JSON.parse(cached);
            const idx = state.leads?.findIndex((l) => l.id === leadIdNum);
            if (idx !== -1 && state.leads[idx]) {
              state.leads[idx] = {
                ...state.leads[idx],
                ...data,
                assigned_staff_id: data.assigned_staff_id,
                assigned_staff_name: data.assigned_staff_name ?? state.leads[idx].assigned_staff_name,
                status: data.status,
                updated_at: data.updated_at,
              };
              sessionStorage.setItem('leadsPageState', JSON.stringify(state));
            }
          }
        }
      } catch (e) {
        /* ignore cache errors */
      }
    } catch (error) {
      if (error.response?.status === 404) {
        handleBack();
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchComments = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/leads/${id}/comments`, authConfig());
      setComments(response.data);
    } catch (error) {
      console.error('Error fetching comments:', error);
    }
  };

  const fetchStaffList = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/leads/staff/list`, authConfig());
      setStaffList(response.data);
    } catch (error) {
      console.error('Error fetching staff list:', error);
    }
  };

  const handleSave = async () => {
    try {
      // Clean up form data: convert empty strings to null for optional fields
      const cleanedData = { ...formData };
      const optionalFields = ['email', 'whatsapp_number', 'age', 'occupation', 'qualification', 'year_of_experience', 'country', 'target_country', 'residing_country', 'program', 'priority', 'comment', 'follow_up_date', 'follow_up_status', 'assigned_staff_id', 'source', 'ielts_score'];
      optionalFields.forEach(field => {
        if (cleanedData[field] === '') {
          cleanedData[field] = null;
        }
      });

      if (id === 'new') {
        // Only clear the cache if a completely new Lead is created, to force it onto page 1
        sessionStorage.removeItem('leadsPageState');
        await axios.post(`${API_BASE_URL}/api/leads`, cleanedData, authConfig());
        handleBack();
      } else {
        await axios.put(`${API_BASE_URL}/api/leads/${id}`, cleanedData, authConfig());

        await fetchLead();
        setEditing(false);
      }
    } catch (error) {
      alert(error.response?.data?.error || 'Error saving lead');
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;

    try {
      await axios.post(`${API_BASE_URL}/api/leads/${id}/comments`, {
        text: newComment,
      }, authConfig());
      setNewComment('');
      await fetchComments();
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);

      // Soft update the specific lead's comment count/status in cache instead of nuking the entire cache
      try {
        const cachedState = sessionStorage.getItem('leadsPageState');
        if (cachedState) {
          const state = JSON.parse(cachedState);
          const leadIndex = state.leads.findIndex(l => l.id === parseInt(id));
          if (leadIndex !== -1) {
            // Forcing a fresh updated timestamp so it bubbles to top if backend sorts it
            state.leads[leadIndex] = { ...state.leads[leadIndex], updated_at: new Date().toISOString() };
            sessionStorage.setItem('leadsPageState', JSON.stringify(state));
          }
        }
      } catch (e) { }
    } catch (error) {
      alert(error.response?.data?.error || 'Error adding comment');
    }
  };

  // Real-time duplicate check — debounced 600ms, only on new lead form
  const duplicateCheckGen = useRef(0);

  const checkDuplicate = (snapshot) => {
    if (!isNew) return;
    if (duplicateCheckTimer.current) clearTimeout(duplicateCheckTimer.current);
    setDuplicateWarning(null);

    const phoneDigits = String(snapshot.phone_number || '').replace(/\D/g, '');
    const ccDigits = String(snapshot.phone_country_code || '').replace(/\D/g, '');
    const waDigits = String(snapshot.whatsapp_number || '').replace(/\D/g, '');
    const waCcDigits = String(snapshot.whatsapp_country_code || '').replace(/\D/g, '');
    const combinedPhone = ccDigits + phoneDigits;
    const combinedWa = waCcDigits + waDigits;

    let phoneForApi = '';
    if (phoneDigits.length >= 7) phoneForApi = phoneDigits;
    else if (combinedPhone.length >= 7) phoneForApi = combinedPhone;
    else if (waDigits.length >= 7) phoneForApi = waDigits;
    else if (combinedWa.length >= 7) phoneForApi = combinedWa;

    const cleanedEmail = String(snapshot.email || '').trim();
    const trimmedName = String(snapshot.name || '').trim();

    if (phoneForApi.length < 7 && cleanedEmail.length < 3 && trimmedName.length < 3) {
      setCheckingDuplicate(false);
      return;
    }

    const gen = ++duplicateCheckGen.current;
    setCheckingDuplicate(true);
    duplicateCheckTimer.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (phoneForApi.length >= 7) params.set('phone', phoneForApi);
        if (cleanedEmail.length >= 3) params.set('email', cleanedEmail);
        if (trimmedName.length >= 3) params.set('name', trimmedName);
        const response = await axios.get(
          `${API_BASE_URL}/api/leads/check-duplicate?${params.toString()}`,
          authConfig()
        );
        if (gen !== duplicateCheckGen.current) return;
        if (response.data.exists && response.data.lead) {
          setDuplicateWarning({
            ...response.data.lead,
            field: response.data.field || 'phone',
          });
        } else {
          setDuplicateWarning(null);
        }
      } catch (err) {
        console.error('Duplicate check error:', err);
      } finally {
        if (gen === duplicateCheckGen.current) {
          setCheckingDuplicate(false);
        }
      }
    }, 600);
  };

  const DUPLICATE_CHECK_FIELDS = new Set([
    'name',
    'phone_number',
    'phone_country_code',
    'whatsapp_number',
    'whatsapp_country_code',
    'email',
  ]);

  const handleChange = (e) => {
    const { name, value } = e.target;

    // If status is being changed to "Registration Completed", show modal
    if (name === 'status' && value === 'Registration Completed' && formData.status !== 'Registration Completed') {
      setShowRegistrationModal(true);
      return; // Don't update status yet, wait for modal submission
    }

    const normalizedValue = name === 'assigned_staff_id' ? (value === '' ? null : Number(value)) : value;
    const nextForm = {
      ...formData,
      [name]: normalizedValue,
    };

    setFormData(nextForm);

    if (isNew && DUPLICATE_CHECK_FIELDS.has(name)) {
      checkDuplicate(nextForm);
    }
  };

  const handleRegistrationSubmit = async () => {
    // Validate required fields
    if (!registrationData.assessment_authority || !registrationData.occupation_mapped || !registrationData.registration_fee_paid) {
      alert('Please fill all required fields');
      return;
    }

    try {
      // Use the new complete-registration endpoint
      const response = await axios.post(`${API_BASE_URL}/api/leads/${id}/complete-registration`, {
        assessment_authority: registrationData.assessment_authority,
        occupation_mapped: registrationData.occupation_mapped,
        registration_fee_paid: registrationData.registration_fee_paid,
      }, authConfig());

      console.log('✅ Registration completed:', response.data);
      alert('Lead converted to client successfully! The client is now accessible to the processing team (Sneha and Kripa).');

      // Close modal and navigate to clients page
      setShowRegistrationModal(false);
      navigate('/clients');
    } catch (error) {
      console.error('Error completing registration:', error);
      const errorMessage = error.response?.data?.error ||
        error.response?.data?.message ||
        (error.response?.status === 404 ? 'Lead not found' : 'Error completing registration. Please try again.');
      alert(errorMessage);
    }
  };

  const handleHeaderFieldChange = async (e) => {
    const { name, value } = e.target;

    // Normalize assigned_staff_id value
    let normalizedValue = value;
    if (name === 'assigned_staff_id') {
      normalizedValue = value === '' || value === null ? null : Number(value);
    }

    const updatedData = {
      ...formData,
      [name]: normalizedValue,
    };

    setFormData(updatedData);

    // Auto-save header fields if not a new lead
    if (id !== 'new' && lead) {
      try {
        await axios.put(`${API_BASE_URL}/api/leads/${id}`, {
          [name]: normalizedValue,
        }, authConfig());
        // Update lead state to reflect changes
        const updatedLead = { ...lead, [name]: normalizedValue };
        setLead(updatedLead);

        // If assignment changed, refresh to get updated data
        if (name === 'assigned_staff_id') {
          await fetchLead();
        }
      } catch (error) {
        console.error('Error auto-saving field:', error);
        alert('Error saving field. Please try again.');
        // Revert on error
        setFormData(formData);
      }
    }
  };

  const handleBack = () => {
    try {
      const cachedState = sessionStorage.getItem('leadsPageState');
      if (cachedState) {
        const state = JSON.parse(cachedState);
        const params = new URLSearchParams();
        if (state.search) params.append('search', state.search);
        if (state.phoneSearch) params.append('phone', state.phoneSearch);
        if (state.statusFilter) params.append('status', state.statusFilter);
        if (state.assignedStaffFilter) params.append('assigned_staff_id', state.assignedStaffFilter);
        if (state.viewType && state.viewType !== 'all') params.append('viewType', state.viewType);

        const queryString = params.toString();
        navigate(`/leads${queryString ? `?${queryString}` : ''}`);
        return;
      }
    } catch (e) {
      console.error('Error parsing leads page state for back navigation', e);
    }
    navigate('/leads');
  };

  if (loading) {
    return <div className="lead-detail-loading">Loading...</div>;
  }

  if (!isNew && !lead) {
    return (
      <div className="lead-detail-error">
        <h2>Lead Not Found</h2>
        <p>The requested lead could not be loaded. It may have been deleted or you do not have permission to view it.</p>
        <button onClick={handleBack} className="btn-back">
          Back to Leads
        </button>
      </div>
    );
  }

  const canEdit = editing || id === 'new';

  // Helper to check if user owns the lead or is a manager
  const isOwner = Number(lead?.assigned_staff_id) === Number(user?.id);
  const isUnassigned = lead?.assigned_staff_id === null;
  const isManager = user?.role === 'ADMIN' || user?.role === 'SALES_TEAM_HEAD';

  // Detailed permission logic
  // Allow editing header fields (Priority, Comment, Follow-up) if:
  // 1. New lead
  // 2. Admin/Manager
  // 3. User owns the lead
  // 4. Lead is unassigned (so they can work on it)
  // NOTE: We do NOT allow random staff to edit each other's leads.
  const canEditHeaderFields = !isNew && (isManager || isOwner || isUnassigned);

  const canEditNextFollowUp = !isNew && (isManager || isOwner || isUnassigned);

  const canEditFollowUpStatus = !isNew && (isManager || isOwner || isUnassigned);

  const canManageAssignment = isManager || isOwner || isUnassigned;

  return (
    <div className="lead-detail">
      <div className="lead-detail-header">
        <div className="header-left">
          <button className="btn-back" onClick={handleBack}>
            <FiArrowLeft /> Back
          </button>
          <div>
            <h1>{isNew ? 'Create New Lead' : lead?.name || 'Lead Details'}</h1>
            {!isNew && lead?.created_at && (
              <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                Added on {new Date(lead.created_at).toLocaleString()}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="lead-header-fields">
        <div className="header-field-group">
          <label>Priority</label>
          {isNew ? (
            <select
              name="priority"
              value={formData.priority || ''}
              onChange={handleChange}
              className="header-field-select"
            >
              <option value="">Select Priority</option>
              <option value="cold">Cold</option>
              <option value="hot">Hot</option>
              <option value="warm">Warm</option>
              <option value="not interested">Not Interested</option>
              <option value="not eligible">Not Eligible</option>
            </select>
          ) : (
            <select
              name="priority"
              value={formData.priority || ''}
              onChange={handleHeaderFieldChange}
              disabled={!canEditHeaderFields}
              className="header-field-select"
            >
              <option value="">Select Priority</option>
              <option value="cold">Cold</option>
              <option value="hot">Hot</option>
              <option value="warm">Warm</option>
              <option value="not interested">Not Interested</option>
              <option value="not eligible">Not Eligible</option>
            </select>
          )}
        </div>
        <div className="header-field-group">
          <label>Reference / Source</label>
          {(() => {
            const presetSources = ['WhatsApp', 'Direct', 'Meta Ads', 'Website', 'Referral', 'Bulk Import'];
            const currentVal = formData.source || '';
            const isPreset = presetSources.some(s => s.toLowerCase() === currentVal.toLowerCase());
            const showManual = !isPreset && currentVal !== '';
            const changeHandler = isNew ? handleChange : handleHeaderFieldChange;
            const isDisabled = !isNew && !canEditHeaderFields;
            return (
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <select
                  name="source"
                  value={isPreset ? currentVal : (showManual ? '__custom__' : '')}
                  onChange={(e) => {
                    if (e.target.value === '__custom__') {
                      const custom = prompt('Enter custom source / reference:');
                      if (custom && custom.trim()) {
                        changeHandler({ target: { name: 'source', value: custom.trim() } });
                      }
                    } else {
                      changeHandler(e);
                    }
                  }}
                  disabled={isDisabled}
                  className="header-field-select"
                  style={{ minWidth: '130px' }}
                >
                  <option value="">Select Source</option>
                  {presetSources.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                  <option value="__custom__">{showManual ? `✎ ${currentVal}` : '✎ Enter Manually...'}</option>
                </select>
              </div>
            );
          })()}
        </div>
        <div className="header-field-group">
          <label>Follow-up Date</label>
          {isNew ? (
            <input
              type="date"
              name="follow_up_date"
              value={formData.follow_up_date ? formData.follow_up_date.split('T')[0] : ''}
              onChange={handleChange}
              className="header-field-input"
            />
          ) : (
            <input
              type="date"
              name="follow_up_date"
              value={formData.follow_up_date ? formData.follow_up_date.split('T')[0] : ''}
              onChange={handleHeaderFieldChange}
              disabled={!canEditHeaderFields}
              className="header-field-input"
            />
          )}
        </div>
        {!isNew && formData.follow_up_date && (
          <div className="header-field-group">
            <label>Follow-up Status</label>
            <select
              name="follow_up_status"
              value={formData.follow_up_status || 'Pending'}
              onChange={handleHeaderFieldChange}
              disabled={!canEditFollowUpStatus}
              className="header-field-input"
              style={{
                background: formData.follow_up_status === 'Completed' ? '#d4edda' :
                  formData.follow_up_status === 'Skipped' ? '#f8d7da' : '#fff3cd'
              }}
            >
              <option value="Pending">Pending</option>
              <option value="Completed">Completed</option>
              <option value="Skipped">Skipped</option>
            </select>
          </div>
        )}
      </div>
      <div className="lead-detail-content">
        <div className="lead-detail-left">
          <div className="detail-section">
            <h2>Lead Information</h2>
            <div className="form-grid">
              {!isNew && lead?.created_at && (
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label style={{ color: '#666', fontSize: '0.9em' }}>
                    <FiCalendar /> Date Added
                  </label>
                  <div style={{
                    padding: '10px',
                    background: '#f9fafb',
                    borderRadius: '6px',
                    border: '1px solid #e5e7eb',
                    color: '#374151',
                    fontSize: '14px'
                  }}>
                    {new Date(lead.created_at).toLocaleString()}
                  </div>
                </div>
              )}
              <div className="form-group">
                <label>
                  <FiUser /> Name *
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name || ''}
                  onChange={handleChange}
                  disabled={!canEdit}
                  required
                />
              </div>
              <div className="form-group">
                <label>
                  <FiPhone /> Phone Number *
                </label>
                <div className="phone-input-group">
                  <input
                    type="text"
                    name="phone_country_code"
                    value={formData.phone_country_code || '+91'}
                    onChange={handleChange}
                    disabled={!canEdit}
                    className="country-code-input"
                    placeholder="+91"
                  />
                  <input
                    type="text"
                    name="phone_number"
                    value={formData.phone_number || ''}
                    onChange={handleChange}
                    disabled={!canEdit}
                    required
                    className="phone-number-input"
                    placeholder="Enter phone number"
                  />
                </div>
              </div>
              {(canEdit || formData.secondary_phone_number) && (
                <div className="form-group">
                  <label>
                    <FiPhone /> Secondary Number
                  </label>
                  <input
                    type="text"
                    name="secondary_phone_number"
                    value={formData.secondary_phone_number || ''}
                    onChange={handleChange}
                    disabled={!canEdit}
                    placeholder="Secondary Phone Number"
                  />
                </div>
              )}
              <div className="form-group">
                <label>
                  <FiPhone /> WhatsApp Number
                </label>
                <div className="phone-input-group">
                  <input
                    type="text"
                    name="whatsapp_country_code"
                    value={formData.whatsapp_country_code || '+91'}
                    onChange={handleChange}
                    disabled={!canEdit}
                    className="country-code-input"
                    placeholder="+91"
                  />
                  <input
                    type="text"
                    name="whatsapp_number"
                    value={formData.whatsapp_number || ''}
                    onChange={handleChange}
                    disabled={!canEdit}
                    className="phone-number-input"
                    placeholder="Enter WhatsApp number"
                  />
                </div>
              </div>
              {/* Duplicate warning — shown after typing phone/WhatsApp/email */}
              {isNew && (checkingDuplicate || duplicateWarning) && (
                <div
                  className={`duplicate-warning ${duplicateWarning ? 'duplicate-warning--visible' : 'duplicate-warning--checking'}`}
                  style={{ gridColumn: '1 / -1' }}
                >
                  {checkingDuplicate && !duplicateWarning ? (
                    <div className="duplicate-warning__checking">
                      <span className="duplicate-warning__spinner"></span>
                      Checking for duplicates…
                    </div>
                  ) : duplicateWarning ? (
                    <>
                      <div className="duplicate-warning__icon">⚠️</div>
                      <div className="duplicate-warning__body">
                        <div className="duplicate-warning__title">Lead Already Exists in the System!</div>
                        <div className="duplicate-warning__detail">
                          {duplicateWarning.field === 'name' ? (
                            <>
                              A lead with this name already exists:{' '}
                              <strong>{duplicateWarning.name}</strong>
                              <span className="duplicate-warning__status-badge">{duplicateWarning.status}</span>
                            </>
                          ) : (
                            <>
                              This{' '}
                              {duplicateWarning.field === 'email' ? 'email' : 'phone number'} is already registered under{' '}
                              <strong>{duplicateWarning.name}</strong>
                              <span className="duplicate-warning__status-badge">{duplicateWarning.status}</span>
                            </>
                          )}
                        </div>
                        <div className="duplicate-warning__message">
                          Please check the existing lead before creating a new one to avoid duplicates.
                        </div>
                        <div className="duplicate-warning__actions">
                          <button
                            type="button"
                            className="duplicate-warning__btn-view"
                            onClick={() => navigate(`/leads/${duplicateWarning.id}`)}
                          >
                            👁️ View Existing Lead
                          </button>
                          <button
                            type="button"
                            className="duplicate-warning__btn-dismiss"
                            onClick={() => setDuplicateWarning(null)}
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
              )}
              <div className="form-group">
                <label>
                  <FiMail /> Email
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email || ''}
                  onChange={handleChange}
                  disabled={!canEdit}
                />
              </div>
              <div className="form-group">
                <label>Age</label>
                <input
                  type="number"
                  name="age"
                  value={formData.age || ''}
                  onChange={handleChange}
                  disabled={!canEdit}
                />
              </div>
              <div className="form-group">
                <label>Occupation</label>
                <input
                  type="text"
                  name="occupation"
                  value={formData.occupation || ''}
                  onChange={handleChange}
                  disabled={!canEdit}
                />
              </div>
              <div className="form-group">
                <label>Qualification</label>
                <select
                  name="qualification"
                  value={formData.qualification || ''}
                  onChange={handleChange}
                  disabled={!canEdit}
                >
                  <option value="">Select Qualification</option>
                  <option value="bachelors">Bachelors</option>
                  <option value="bsc nursing">BSc Nursing</option>
                  <option value="gnm">GNM</option>
                  <option value="post bsc">Post BSC</option>
                  <option value="gcan">GCAN</option>
                  <option value="diploma">Diploma</option>
                  <option value="masters">Masters</option>
                  <option value="phd">PhD</option>
                </select>
              </div>
              <div className="form-group">
                <label>Year of Experience</label>
                <input
                  type="number"
                  name="year_of_experience"
                  value={formData.year_of_experience || ''}
                  onChange={handleChange}
                  disabled={!canEdit}
                  min="0"
                />
              </div>
              <div className="form-group">
                <label>Target Country</label>
                <select
                  name="target_country"
                  value={formData.target_country || ''}
                  onChange={handleChange}
                  disabled={!canEdit}
                >
                  <option value="">Select Target Country</option>
                  <option value="australia">Australia</option>
                  <option value="canada">Canada</option>
                  <option value="uk">United Kingdom</option>
                  <option value="usa">United States</option>
                  <option value="new zealand">New Zealand</option>
                  <option value="others">Others</option>
                </select>
              </div>
              <div className="form-group">
                <label>Residing Country</label>
                <select
                  name="residing_country"
                  value={formData.residing_country || ''}
                  onChange={handleChange}
                  disabled={!canEdit}
                >
                  <option value="">Select Residing Country</option>
                  <option value="india">India</option>
                  <option value="australia">Australia</option>
                  <option value="canada">Canada</option>
                  <option value="uk">United Kingdom</option>
                  <option value="usa">United States</option>
                  <option value="uae">United Arab Emirates</option>
                  <option value="saudi arabia">Saudi Arabia</option>
                  <option value="singapore">Singapore</option>
                  <option value="malaysia">Malaysia</option>
                  <option value="others">Others</option>
                </select>
              </div>
              <div className="form-group">
                <label>Program</label>
                <select
                  name="program"
                  value={formData.program || ''}
                  onChange={handleChange}
                  disabled={!canEdit}
                >
                  <option value="">Select Program</option>
                  <option value="gsm">GSM</option>
                  <option value="fsw">FSW</option>
                  <option value="visit">Visit</option>
                  <option value="work">Work</option>
                  <option value="ahpra">AHPRA</option>
                  <option value="nz registration">NZ - Registration</option>
                  <option value="nmbi registration">NMBI Registration</option>
                  <option value="uk registration">UK Registration</option>
                  <option value="osce visit visa">OSCE- Visit visa</option>
                  <option value="rn transition">RN Transition</option>
                </select>
              </div>


              <div className="form-group">
                <label>IELTS Score</label>
                <input
                  type="text"
                  name="ielts_score"
                  value={formData.ielts_score || ''}
                  onChange={handleChange}
                  disabled={!canEdit}
                  placeholder="e.g., 7.5, 8.0"
                />
              </div>

              <div className="form-group">
                <label>Status</label>
                <select
                  name="status"
                  value={formData.status || 'New'}
                  onChange={handleChange}
                  disabled={!canEdit}
                >
                  <option value="New">New</option>
                  <option value="Unassigned">Unassigned</option>
                  <option value="Direct Lead">Direct Lead</option>
                  <option value="Assigned">Assigned</option>
                  <option value="Follow-up">Follow-up</option>
                  <option value="Prospect">Prospect</option>
                  <option value="Not Responding">Not Responding</option>
                  <option value="Pending Lead">Pending Lead</option>
                  <option value="Not Eligible">Not Eligible</option>
                  <option value="Not Interested">Not Interested</option>
                  <option value="Registration Completed">Registration Completed</option>
                </select>
              </div>
              {canManageAssignment && (user?.role === 'ADMIN' || !isNew) && (
                <div className="form-group">
                  <label>{user?.role === 'ADMIN' ? 'Assign To' : 'Transfer To'}</label>
                  <select
                    name="assigned_staff_id"
                    value={formData.assigned_staff_id || ''}
                    onChange={user?.role === 'ADMIN' ? handleHeaderFieldChange : handleChange}
                    disabled={user?.role === 'ADMIN' ? false : !canEdit}
                  >
                    {(user?.role === 'ADMIN' || user?.role === 'SALES_TEAM_HEAD') && (
                      <option value="">Unassigned</option>
                    )}
                    {staffList.map((staff) => (
                      <option key={staff.id} value={staff.id}>
                        {staff.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            {canEdit && (
              <button className="btn-save" onClick={handleSave}>
                <FiSave /> {isNew ? 'Create Lead' : 'Save Changes'}
              </button>
            )}
          </div>
        </div>
        {!isNew && (
          <div className="lead-detail-right">
            {/* Lead Comment Field - Display prominently */}
            {/* Lead Source Field - Display prominently */}
            {(() => {
              const rawSource = formData.source || '';
              // Remove "Yes", "Yes -", "Yes ", case insensitive at start
              const cleanSource = rawSource.replace(/^(yes|Yes)( -|-| )?/, '').trim();

              if (cleanSource) {
                return (
                  <div className="comments-section" style={{ marginBottom: '20px' }}>
                    <h2>
                      Lead Source
                    </h2>
                    <div style={{
                      padding: '15px',
                      background: '#eff6ff',
                      borderRadius: '8px',
                      border: '1px solid #bfdbfe',
                      fontSize: '15px',
                      fontWeight: '500',
                      color: '#1e40af'
                    }}>
                      {cleanSource}
                    </div>
                  </div>
                );
              }
              return null;
            })()}

            {/* Chat toggle button */}
            <button
              onClick={() => setShowChatComments(true)}
              className="btn-open-chat"
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '12px 20px', background: '#D4AF37', color: '#fff',
                border: 'none', borderRadius: '25px', cursor: 'pointer',
                fontSize: '15px', fontWeight: 600, boxShadow: '0 4px 15px rgba(212,175,55,0.35)',
                transition: 'all 0.2s'
              }}
            >
              <FiMessageSquare size={18} />
              Activity Chat ({comments.length})
            </button>
          </div>
        )}
      </div>

      {/* Floating Chat Dialog */}
      {showChatComments && !isNew && (
        <div className="chat-overlay" onClick={() => setShowChatComments(false)}>
          <div className="chat-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="chat-dialog-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FiMessageSquare size={18} />
                <span>Activity Chat</span>
                <span className="chat-badge">{comments.length}</span>
              </div>
              <button className="chat-close-btn" onClick={() => setShowChatComments(false)}>&times;</button>
            </div>
            <div className="chat-messages">
              {comments.length === 0 ? (
                <div className="chat-empty">
                  <FiMessageSquare size={40} style={{ opacity: 0.2, marginBottom: '10px' }} />
                  <p>No messages yet</p>
                  <p style={{ fontSize: '12px', color: '#9ca3af' }}>Start the conversation below</p>
                </div>
              ) : (
                [...comments].reverse().map((comment) => {
                  const isMe = comment.author_name === user?.name;
                  return (
                    <div key={comment.id} className={`chat-bubble ${isMe ? 'chat-bubble-me' : 'chat-bubble-other'}`}>
                      {!isMe && <div className="chat-bubble-author">{comment.author_name}</div>}
                      <div className="chat-bubble-text">{comment.text}</div>
                      <div className="chat-bubble-time">
                        {new Date(comment.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="chat-input-area">
              <textarea
                placeholder="Type a message..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                rows="2"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleAddComment();
                  }
                }}
              />
              <button
                onClick={handleAddComment}
                className="chat-send-btn"
                disabled={!newComment.trim()}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Registration Completed Modal */}
      {showRegistrationModal && (
        <div className="modal-overlay" onClick={() => setShowRegistrationModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Registration Completed - Complete Client Information</h2>
            <p style={{ marginBottom: '20px', color: '#666' }}>
              Please provide the following mandatory information to convert this lead to a client:
            </p>
            <div className="form-group">
              <label>Assessment Authority *</label>
              <input
                type="text"
                value={registrationData.assessment_authority}
                onChange={(e) => setRegistrationData({ ...registrationData, assessment_authority: e.target.value })}
                placeholder="Enter assessment authority"
                required
              />
            </div>
            <div className="form-group">
              <label>Occupation Mapped *</label>
              <input
                type="text"
                value={registrationData.occupation_mapped}
                onChange={(e) => setRegistrationData({ ...registrationData, occupation_mapped: e.target.value })}
                placeholder="Enter occupation mapped"
                required
              />
            </div>
            <div className="form-group">
              <label>Registration Fee Paid *</label>
              <select
                value={registrationData.registration_fee_paid}
                onChange={(e) => setRegistrationData({ ...registrationData, registration_fee_paid: e.target.value })}
                required
              >
                <option value="">Select</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowRegistrationModal(false)}>
                Cancel
              </button>
              <button className="btn-save" onClick={handleRegistrationSubmit}>
                Create Client
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeadDetail;
