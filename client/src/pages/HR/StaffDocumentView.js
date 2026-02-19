import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import API_BASE_URL from '../../config/api';
import './HR.css';
import { FiEdit2, FiSave, FiX, FiFile, FiUpload } from 'react-icons/fi';

const StaffDocumentView = () => {
    const { id } = useParams();
    const [documents, setDocuments] = useState({});
    const [staffName, setStaffName] = useState('Staff Member');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [uploadingSlot, setUploadingSlot] = useState(null);
    const [staffDetails, setStaffDetails] = useState(null);
    const [isEditingDetails, setIsEditingDetails] = useState(false);
    const [editFormData, setEditFormData] = useState({});
    const [savingDetails, setSavingDetails] = useState(false);
    const [viewingDoc, setViewingDoc] = useState(null);
    const [viewerUrl, setViewerUrl] = useState(null);

    const navigate = useNavigate();
    const slots = Array.from({ length: 10 }, (_, i) => i + 1);

    useEffect(() => {
        fetchDocuments();
        fetchStaffDetails();
    }, [id]);

    useEffect(() => {
        if (!viewingDoc) {
            if (viewerUrl) URL.revokeObjectURL(viewerUrl);
            setViewerUrl(null);
            return;
        }
        const fetchDocBlob = async () => {
            try {
                const response = await axios.get(`${API_BASE_URL}/api/hr/documents/${viewingDoc.id}/view`, {
                    responseType: 'blob'
                });
                setViewerUrl(URL.createObjectURL(response.data));
            } catch (err) {
                alert('Failed to load document for viewing');
            }
        };
        fetchDocBlob();
        return () => { if (viewerUrl) URL.revokeObjectURL(viewerUrl); };
    }, [viewingDoc]);

    const fetchStaffDetails = async () => {
        try {
            const response = await axios.get(`${API_BASE_URL}/api/hr/staff/${id}`);
            if (response.data) {
                setStaffName(response.data.name);
                setStaffDetails(response.data);
                setEditFormData({
                    name: response.data.name,
                    email: response.data.email,
                    phone_number: response.data.phone_number || '',
                    whatsapp_number: response.data.whatsapp_number || ''
                });
            }
        } catch (err) {
            console.error('Failed to fetch staff details', err);
        }
    };

    const fetchDocuments = async () => {
        try {
            const response = await axios.get(`${API_BASE_URL}/api/hr/staff/${id}/documents`);
            const docsMap = {};
            response.data.forEach(doc => { docsMap[doc.slot_number] = doc; });
            setDocuments(docsMap);
        } catch (err) {
            setError(err.message || 'Failed to fetch documents');
        } finally {
            setLoading(false);
        }
    };

    const handleDetailChange = (e) => {
        setEditFormData({ ...editFormData, [e.target.name]: e.target.value });
    };

    const handleSaveDetails = async () => {
        try {
            setSavingDetails(true);
            await axios.put(`${API_BASE_URL}/api/users/${id}`, editFormData);
            setIsEditingDetails(false);
            fetchStaffDetails();
        } catch (err) {
            alert('Failed to update: ' + (err.response?.data?.error || err.message));
        } finally {
            setSavingDetails(false);
        }
    };

    const handleFileUpload = async (slot, file) => {
        if (!file) return;
        setUploadingSlot(slot);
        const formData = new FormData();
        formData.append('document', file);
        try {
            const response = await axios.post(`${API_BASE_URL}/api/hr/staff/${id}/documents/${slot}`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setDocuments(prev => ({ ...prev, [slot]: response.data }));
        } catch (err) {
            alert('Upload failed: ' + (err.response?.data?.error || err.message));
        } finally {
            setUploadingSlot(null);
        }
    };

    const handleDelete = async (slot) => {
        const doc = documents[slot];
        if (!doc || !window.confirm('Delete this document?')) return;
        try {
            await axios.delete(`${API_BASE_URL}/api/hr/documents/${doc.id}`);
            setDocuments(prev => {
                const next = { ...prev };
                delete next[slot];
                return next;
            });
        } catch (err) {
            alert('Delete failed: ' + (err.response?.data?.error || err.message));
        }
    };

    if (loading) return (
        <div style={{ textAlign: 'center', padding: '60px', color: '#9ca3af', fontSize: '16px' }}>
            Loading documents...
        </div>
    );

    return (
        <div className="staff-docs-container">

            {/* Document Viewer Modal */}
            {viewingDoc && (
                <div
                    style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
                    onClick={() => setViewingDoc(null)}
                >
                    <div style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '900px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 60px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #f3f4f6' }}>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: '16px', color: '#111827' }}>{viewingDoc.file_name}</div>
                                <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>Uploaded {new Date(viewingDoc.created_at).toLocaleDateString()}</div>
                            </div>
                            <button onClick={() => setViewingDoc(null)} style={{ background: '#f3f4f6', border: 'none', borderRadius: '50%', width: '36px', height: '36px', cursor: 'pointer', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <FiX />
                            </button>
                        </div>
                        <div style={{ flex: 1, background: '#f9fafb', overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px', padding: '24px' }}>
                            {!viewerUrl ? (
                                <div style={{ width: '40px', height: '40px', border: '3px solid #e5e7eb', borderTopColor: '#D4AF37', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}></div>
                            ) : viewingDoc.file_name.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp)$/) ? (
                                <img src={viewerUrl} alt="Document" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '8px' }} />
                            ) : (
                                <iframe src={viewerUrl} title="Document Viewer" style={{ width: '100%', minHeight: '500px', border: 'none', borderRadius: '8px', background: 'white' }} />
                            )}
                        </div>
                        <div style={{ padding: '16px 24px', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <a href={viewerUrl} download={viewingDoc.file_name} style={{ background: '#D4AF37', color: 'white', padding: '10px 20px', borderRadius: '10px', textDecoration: 'none', fontWeight: 600, fontSize: '14px' }}>
                                Download
                            </a>
                            <button onClick={() => setViewingDoc(null)} style={{ background: '#f3f4f6', border: 'none', borderRadius: '10px', padding: '10px 20px', cursor: 'pointer', fontWeight: 600, fontSize: '14px', color: '#374151' }}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Page Header */}
            <div style={{ marginBottom: '40px' }}>
                <button className="btn-back" onClick={() => navigate('/hr')} style={{ marginBottom: '20px' }}>
                    ← Back to Directory
                </button>
                <h1 style={{ fontSize: '36px', marginBottom: '4px' }}>
                    Documents — <span style={{ color: '#D4AF37', WebkitTextFillColor: '#D4AF37' }}>{staffName}</span>
                </h1>
                <p style={{ color: '#9ca3af', fontSize: '15px' }}>Staff ID: #{id.toString().padStart(4, '0')}</p>
            </div>

            {error && (
                <div style={{ marginBottom: '24px', padding: '14px 18px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', color: '#dc2626', fontSize: '14px' }}>
                    {error}
                </div>
            )}

            {/* Staff Details Card */}
            <div style={{ background: 'white', borderRadius: '20px', padding: '32px', marginBottom: '40px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', border: '1px solid #f3f4f6', position: 'relative', overflow: 'hidden' }}>
                {/* Gold accent */}
                <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '4px', background: 'linear-gradient(90deg, #D4AF37, #b4941f)' }}></div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                        <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#111827', marginBottom: '4px' }}>Staff Profile</h2>
                        <p style={{ color: '#D4AF37', fontSize: '13px', fontWeight: 500 }}>Personal Information & Contact Details</p>
                    </div>
                    {!isEditingDetails ? (
                        <button
                            onClick={() => setIsEditingDetails(true)}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 20px', background: 'white', border: '1px solid #e5d8a0', borderRadius: '10px', color: '#D4AF37', fontWeight: 600, cursor: 'pointer', fontSize: '14px', transition: 'all 0.2s' }}
                        >
                            <FiEdit2 size={14} /> Edit Profile
                        </button>
                    ) : (
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button onClick={() => setIsEditingDetails(false)} style={{ padding: '10px', background: '#f3f4f6', border: 'none', borderRadius: '10px', cursor: 'pointer', color: '#6b7280', display: 'flex', alignItems: 'center' }}>
                                <FiX size={18} />
                            </button>
                            <button onClick={handleSaveDetails} disabled={savingDetails} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 20px', background: '#D4AF37', border: 'none', borderRadius: '10px', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: '14px', opacity: savingDetails ? 0.6 : 1 }}>
                                <FiSave size={14} /> {savingDetails ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    )}
                </div>

                {!isEditingDetails ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '20px' }}>
                        {[
                            { label: 'Full Name', value: staffDetails?.name },
                            { label: 'Login ID / Email', value: staffDetails?.email },
                            { label: 'Phone', value: staffDetails?.phone_number || '—' },
                            { label: 'WhatsApp', value: staffDetails?.whatsapp_number || '—' },
                        ].map(field => (
                            <div key={field.label} style={{ padding: '16px', background: '#fafafa', borderRadius: '12px', border: '1px solid #f3f4f6' }}>
                                <div style={{ fontSize: '11px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>{field.label}</div>
                                <div style={{ fontSize: '15px', fontWeight: 600, color: '#111827', wordBreak: 'break-word' }}>{field.value || '—'}</div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                        {[
                            { label: 'Full Name', name: 'name', type: 'text' },
                            { label: 'Login ID / Email', name: 'email', type: 'email' },
                            { label: 'Phone Number', name: 'phone_number', type: 'tel' },
                            { label: 'WhatsApp', name: 'whatsapp_number', type: 'tel' },
                        ].map(field => (
                            <div key={field.name}>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#6b7280', marginBottom: '6px' }}>{field.label}</label>
                                <input
                                    type={field.type}
                                    name={field.name}
                                    value={editFormData[field.name] || ''}
                                    onChange={handleDetailChange}
                                    style={{ width: '100%', padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: '10px', fontSize: '14px', outline: 'none', color: '#111827', boxSizing: 'border-box', transition: 'border-color 0.2s' }}
                                    onFocus={e => e.target.style.borderColor = '#D4AF37'}
                                    onBlur={e => e.target.style.borderColor = '#e5e7eb'}
                                />
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Document Slots */}
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#111827', marginBottom: '20px' }}>Document Storage</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '20px' }}>
                {slots.map(slot => {
                    const doc = documents[slot];
                    const isUploading = uploadingSlot === slot;

                    return (
                        <div key={slot} className="doc-card">
                            <div className="slot-badge">Slot {slot < 10 ? `0${slot}` : slot}</div>

                            {doc ? (
                                <div className="file-present">
                                    <div className="file-icon-large">
                                        <FiFile color="#D4AF37" />
                                    </div>
                                    <div style={{ textAlign: 'center', width: '100%', padding: '0 8px' }}>
                                        <div style={{ fontWeight: 600, fontSize: '12px', color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={doc.file_name}>
                                            {doc.file_name}
                                        </div>
                                        <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '3px' }}>
                                            {new Date(doc.created_at).toLocaleDateString()}
                                        </div>
                                    </div>
                                    <div className="doc-actions">
                                        <button className="btn-view" onClick={() => setViewingDoc(doc)}>View</button>
                                        <button className="btn-delete" onClick={() => handleDelete(slot)}>Delete</button>
                                    </div>
                                </div>
                            ) : isUploading ? (
                                <div className="upload-zone" style={{ cursor: 'default' }}>
                                    <div style={{ width: '32px', height: '32px', border: '3px solid #e5e7eb', borderTopColor: '#D4AF37', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}></div>
                                    <span style={{ fontSize: '12px', color: '#9ca3af', marginTop: '10px', fontWeight: 600 }}>Uploading...</span>
                                </div>
                            ) : (
                                <label className="upload-zone" style={{ cursor: 'pointer' }}>
                                    <div className="upload-icon-circle">
                                        <FiUpload size={18} color="#9ca3af" />
                                    </div>
                                    <span style={{ fontSize: '12px', color: '#9ca3af', fontWeight: 600, textAlign: 'center' }}>Add Document</span>
                                    <span style={{ fontSize: '11px', color: '#d1d5db', marginTop: '4px' }}>Click to upload</span>
                                    <input type="file" style={{ display: 'none' }} onChange={(e) => handleFileUpload(slot, e.target.files[0])} />
                                </label>
                            )}
                        </div>
                    );
                })}
            </div>

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
};

export default StaffDocumentView;
