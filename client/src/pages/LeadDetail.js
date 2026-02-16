import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import API_BASE_URL from '../config/api';
import './LeadDetail.css';
import { FiSave, FiMessageSquare, FiUser, FiPhone, FiMail, FiCalendar, FiArrowLeft } from 'react-icons/fi';

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
      || user?.role === 'PROCESSING';

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
        status: 'Unassigned',
        assigned_staff_id: user?.role === 'STAFF' ? user.id : null,
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
      const response = await axios.get(`${API_BASE_URL}/api/leads/${id}`);
      setLead(response.data);
      setFormData(response.data);
    } catch (error) {
      if (error.response?.status === 404) {
        navigate('/leads');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchComments = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/leads/${id}/comments`);
      setComments(response.data);
    } catch (error) {
      console.error('Error fetching comments:', error);
    }
  };

  const fetchStaffList = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/leads/staff/list`);
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
        await axios.post(`${API_BASE_URL}/api/leads`, cleanedData);
        navigate('/leads');
      } else {
        await axios.put(`${API_BASE_URL}/api/leads/${id}`, cleanedData);
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
      });
      setNewComment('');
      fetchComments();
    } catch (error) {
      alert(error.response?.data?.error || 'Error adding comment');
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    // If status is being changed to "Registration Completed", show modal
    if (name === 'status' && value === 'Registration Completed' && formData.status !== 'Registration Completed') {
      setShowRegistrationModal(true);
      return; // Don't update status yet, wait for modal submission
    }

    setFormData({
      ...formData,
      [name]: name === 'assigned_staff_id' ? (value === '' ? null : Number(value)) : value,
    });
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
      });

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
        });
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

  if (loading) {
    return <div className="lead-detail-loading">Loading...</div>;
  }

  if (!isNew && !lead) {
    return (
      <div className="lead-detail-error">
        <h2>Lead Not Found</h2>
        <p>The requested lead could not be loaded. It may have been deleted or you do not have permission to view it.</p>
        <button onClick={() => navigate('/leads')} className="btn-back">
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
          <button className="btn-back" onClick={() => navigate('/leads')}>
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
          <label>Source</label>
          {isNew ? (
            <input
              type="text"
              name="source"
              value={formData.source || ''}
              onChange={handleChange}
              placeholder="e.g., Meta Ads, Website"
              className="header-field-input"
            />
          ) : (
            <input
              type="text"
              name="source"
              value={formData.source || ''}
              onChange={handleHeaderFieldChange}
              disabled={!canEditHeaderFields}
              placeholder="e.g., Meta Ads, Website"
              className="header-field-input"
            />
          )}
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
                  <select
                    name="phone_country_code"
                    value={formData.phone_country_code || '+91'}
                    onChange={handleChange}
                    disabled={!canEdit}
                    className="country-code-select"
                  >
                    <option value="+1">+1 (US/CA)</option>
                    <option value="+44">+44 (UK)</option>
                    <option value="+61">+61 (AU)</option>
                    <option value="+91">+91 (IN)</option>
                    <option value="+971">+971 (AE)</option>
                    <option value="+966">+966 (SA)</option>
                    <option value="+65">+65 (SG)</option>
                    <option value="+60">+60 (MY)</option>
                    <option value="+62">+62 (ID)</option>
                    <option value="+63">+63 (PH)</option>
                    <option value="+66">+66 (TH)</option>
                    <option value="+84">+84 (VN)</option>
                    <option value="+86">+86 (CN)</option>
                    <option value="+81">+81 (JP)</option>
                    <option value="+82">+82 (KR)</option>
                    <option value="+27">+27 (ZA)</option>
                    <option value="+20">+20 (EG)</option>
                    <option value="+234">+234 (NG)</option>
                    <option value="+254">+254 (KE)</option>
                    <option value="+33">+33 (FR)</option>
                    <option value="+49">+49 (DE)</option>
                    <option value="+39">+39 (IT)</option>
                    <option value="+34">+34 (ES)</option>
                    <option value="+31">+31 (NL)</option>
                    <option value="+32">+32 (BE)</option>
                    <option value="+41">+41 (CH)</option>
                    <option value="+46">+46 (SE)</option>
                    <option value="+47">+47 (NO)</option>
                    <option value="+45">+45 (DK)</option>
                    <option value="+358">+358 (FI)</option>
                    <option value="+7">+7 (RU)</option>
                    <option value="+55">+55 (BR)</option>
                    <option value="+52">+52 (MX)</option>
                    <option value="+54">+54 (AR)</option>
                    <option value="+64">+64 (NZ)</option>
                  </select>
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
                  <select
                    name="whatsapp_country_code"
                    value={formData.whatsapp_country_code || '+91'}
                    onChange={handleChange}
                    disabled={!canEdit}
                    className="country-code-select"
                  >
                    <option value="+1">+1 (US/CA)</option>
                    <option value="+44">+44 (UK)</option>
                    <option value="+61">+61 (AU)</option>
                    <option value="+91">+91 (IN)</option>
                    <option value="+971">+971 (AE)</option>
                    <option value="+966">+966 (SA)</option>
                    <option value="+65">+65 (SG)</option>
                    <option value="+60">+60 (MY)</option>
                    <option value="+62">+62 (ID)</option>
                    <option value="+63">+63 (PH)</option>
                    <option value="+66">+66 (TH)</option>
                    <option value="+84">+84 (VN)</option>
                    <option value="+86">+86 (CN)</option>
                    <option value="+81">+81 (JP)</option>
                    <option value="+82">+82 (KR)</option>
                    <option value="+27">+27 (ZA)</option>
                    <option value="+20">+20 (EG)</option>
                    <option value="+234">+234 (NG)</option>
                    <option value="+254">+254 (KE)</option>
                    <option value="+33">+33 (FR)</option>
                    <option value="+49">+49 (DE)</option>
                    <option value="+39">+39 (IT)</option>
                    <option value="+34">+34 (ES)</option>
                    <option value="+31">+31 (NL)</option>
                    <option value="+32">+32 (BE)</option>
                    <option value="+41">+41 (CH)</option>
                    <option value="+46">+46 (SE)</option>
                    <option value="+47">+47 (NO)</option>
                    <option value="+45">+45 (DK)</option>
                    <option value="+358">+358 (FI)</option>
                    <option value="+7">+7 (RU)</option>
                    <option value="+55">+55 (BR)</option>
                    <option value="+52">+52 (MX)</option>
                    <option value="+54">+54 (AR)</option>
                    <option value="+64">+64 (NZ)</option>
                  </select>
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
                  value={formData.status || 'Unassigned'}
                  onChange={handleChange}
                  disabled={!canEdit}
                >
                  <option value="Unassigned">Unassigned</option>
                  <option value="Assigned">Assigned</option>
                  <option value="Follow-up">Follow-up</option>
                  <option value="Prospect">Prospect</option>
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

            {/* Comments Section */}
            <div className="comments-section">
              <h2>
                <FiMessageSquare /> Activity Comments
              </h2>
              <div className="comment-input">
                <textarea
                  placeholder="Add a comment..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  rows="3"
                />
                <button onClick={handleAddComment} className="btn-add-comment">
                  Add Comment
                </button>
              </div>
              <div className="comments-list">
                {comments.length === 0 ? (
                  <p className="no-comments">No comments yet</p>
                ) : (
                  comments.map((comment) => (
                    <div key={comment.id} className="comment-item">
                      <div className="comment-header">
                        <span className="comment-author">{comment.author_name}</span>
                        <span className="comment-time">
                          {new Date(comment.created_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="comment-text">{comment.text}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>

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
