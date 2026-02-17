import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import API_BASE_URL from '../../config/api';
import { useAuth } from '../../context/AuthContext';
import './HR.css';

const StaffDocumentView = () => {
    const { id } = useParams();
    const [documents, setDocuments] = useState({});
    const [staffName, setStaffName] = useState('Staff Member'); // ideally fetch this
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [uploadingSlot, setUploadingSlot] = useState(null);

    // const { token } = useAuth(); // AuthContext doesn't expose token
    const token = localStorage.getItem('token');
    const navigate = useNavigate();

    // Create array of 10 slots
    const slots = Array.from({ length: 10 }, (_, i) => i + 1);

    useEffect(() => {
        fetchDocuments();
        fetchStaffDetails();
    }, [id]);

    const fetchStaffDetails = async () => {
        try {
            const response = await axios.get(`${API_BASE_URL}/api/hr/staff/${id}`);
            if (response.data) {
                setStaffName(response.data.name);
            }
        } catch (err) {
            console.error('Failed to fetch staff details', err);
        }
    };

    const fetchDocuments = async () => {
        try {
            const response = await axios.get(`${API_BASE_URL}/api/hr/staff/${id}/documents`);
            const data = response.data;
            // Convert list to object keyed by slot number
            const docsMap = {};
            data.forEach(doc => {
                docsMap[doc.slot_number] = doc;
            });
            setDocuments(docsMap);
        } catch (err) {
            setError(err.message || 'Failed to fetch documents');
        } finally {
            setLoading(false);
        }
    };

    const [viewingDoc, setViewingDoc] = useState(null);
    const [viewerUrl, setViewerUrl] = useState(null);

    // Clean up object URL when modal closes or doc changes
    useEffect(() => {
        if (!viewingDoc) {
            if (viewerUrl) URL.revokeObjectURL(viewerUrl);
            setViewerUrl(null);
            return;
        }

        const fetchDocBlob = async () => {
            try {
                // For binary data (blob), we need to set responseType
                const response = await axios.get(`${API_BASE_URL}/api/hr/documents/${viewingDoc.id}/view`, {
                    responseType: 'blob'
                });
                const blob = response.data;
                const url = URL.createObjectURL(blob);
                setViewerUrl(url);
            } catch (err) {
                console.error(err);
                alert('Failed to load document for viewing');
            }
        };
        fetchDocBlob();

        return () => {
            if (viewerUrl) URL.revokeObjectURL(viewerUrl);
        };
    }, [viewingDoc]);

    const handleFileUpload = async (slot, file) => {
        if (!file) return;

        setUploadingSlot(slot);
        const formData = new FormData();
        formData.append('document', file);

        try {
            const response = await axios.post(`${API_BASE_URL}/api/hr/staff/${id}/documents/${slot}`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });

            const newDoc = response.data;
            setDocuments(prev => ({
                ...prev,
                [slot]: newDoc
            }));
        } catch (err) {
            alert('Upload failed: ' + (err.response?.data?.error || err.message));
        } finally {
            setUploadingSlot(null);
        }
    };

    const handleDelete = async (slot) => {
        const doc = documents[slot];
        if (!doc) return;

        if (!window.confirm('Are you sure you want to delete this document?')) return;

        try {
            await axios.delete(`${API_BASE_URL}/api/hr/documents/${doc.id}`);

            setDocuments(prev => {
                const newState = { ...prev };
                delete newState[slot];
                return newState;
            });
        } catch (err) {
            alert('Delete failed: ' + (err.response?.data?.error || err.message));
        }
    };

    if (loading) return (
        <div className="flex items-center justify-center min-h-screen text-blue-400">
            <div className="text-xl animate-pulse">Loading documents...</div>
        </div>
    );

    return (
        <div className="staff-docs-container relative">
            {/* Document Viewer Modal */}
            {viewingDoc && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-6" onClick={() => setViewingDoc(null)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-300" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center p-6 border-b border-gray-100">
                            <div>
                                <h3 className="text-xl font-bold text-gray-800 truncate">{viewingDoc.file_name}</h3>
                                <p className="text-sm text-gray-400">Uploaded on {new Date(viewingDoc.created_at).toLocaleDateString()}</p>
                            </div>
                            <button onClick={() => setViewingDoc(null)} className="text-gray-400 hover:text-gray-800 p-2 rounded-full hover:bg-gray-100 transition-all">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="flex-1 bg-gray-50/50 overflow-auto flex items-center justify-center p-8 relative min-h-[300px]">
                            {!viewerUrl ? (
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#D4AF37]"></div>
                            ) : (
                                viewingDoc.file_name.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp)$/) ? (
                                    <img src={viewerUrl} alt="Document" className="max-w-full max-h-full object-contain shadow-lg rounded-lg" />
                                ) : (
                                    <iframe src={viewerUrl} title="Document Viewer" className="w-full h-full min-h-[600px] border-none shadow-lg rounded-lg bg-white"></iframe>
                                )
                            )}
                        </div>
                        <div className="p-6 border-t border-gray-100 bg-white flex justify-end gap-3">
                            <a
                                href={viewerUrl}
                                download={viewingDoc.file_name}
                                className="px-6 py-2.5 bg-[#D4AF37] text-white rounded-xl hover:bg-[#b4941f] text-sm font-semibold flex items-center gap-2 shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                Download File
                            </a>
                            <button onClick={() => setViewingDoc(null)} className="px-6 py-2.5 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 text-sm font-semibold transition-colors">
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="max-w-8xl mx-auto">
                {/* Header */}
                <div className="flex flex-col md:flex-row items-center mb-12 relative z-50 justify-between">
                    <div>
                        <button
                            onClick={() => navigate('/hr')}
                            className="btn-back mb-6 inline-flex"
                        >
                            <span>&larr;</span> Back to Directory
                        </button>
                        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 tracking-tight">
                            Documents for <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#D4AF37] to-[#b4941f]">{staffName}</span>
                        </h1>
                        <p className="text-gray-500 mt-2 text-lg">Secure document management & storage slots.</p>
                    </div>

                    <div className="mt-4 md:mt-0 text-right hidden md:block">
                        <div className="text-sm font-semibold text-gray-400 uppercase tracking-widest">Agent ID</div>
                        <div className="text-2xl font-mono text-gray-800">#{id.toString().padStart(4, '0')}</div>
                    </div>
                </div>

                {error && (
                    <div className="mb-8 p-6 bg-red-50 border border-red-100 text-red-600 rounded-2xl shadow-sm flex items-center gap-3">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {error}
                    </div>
                )}

                {/* Slots Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-8 relative z-0">
                    {slots.map(slot => {
                        const doc = documents[slot];
                        const isUploading = uploadingSlot === slot;

                        return (
                            <div key={slot} className="doc-card">
                                <div className="slot-badge">Slot {slot < 10 ? `0${slot}` : slot}</div>

                                {doc ? (
                                    <div className="file-present">
                                        <div className="file-icon-large text-[#D4AF37]">
                                            📄
                                        </div>

                                        <div className="text-center w-full my-4">
                                            <h4 className="font-bold text-gray-800 text-sm truncate w-full px-2" title={doc.file_name}>
                                                {doc.file_name}
                                            </h4>
                                            <p className="text-xs text-gray-400 mt-1">
                                                {new Date(doc.created_at).toLocaleDateString()}
                                            </p>
                                        </div>

                                        <div className="doc-actions">
                                            <button
                                                className="btn-view"
                                                onClick={() => setViewingDoc(doc)}
                                            >
                                                View
                                            </button>
                                            <button
                                                className="btn-delete"
                                                onClick={() => handleDelete(slot)}
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    isUploading ? (
                                        <div className="upload-zone">
                                            <div className="upload-icon-circle">
                                                <div className="w-6 h-6 border-2 border-gray-200 border-t-[#D4AF37] rounded-full animate-spin"></div>
                                            </div>
                                            <span className="text-sm font-semibold text-gray-400 animate-pulse">Uploading...</span>
                                        </div>
                                    ) : (
                                        <label className="upload-zone group">
                                            <div className="upload-icon-circle group-hover:scale-110">
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 text-gray-300 group-hover:text-white transition-colors">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                                </svg>
                                            </div>
                                            <h5 className="text-gray-500 font-medium text-sm group-hover:text-[#D4AF37] transition-colors">Add Document</h5>
                                            <span className="text-gray-300 text-xs mt-1">Tap to select</span>

                                            <input
                                                type="file"
                                                className="hidden"
                                                onChange={(e) => handleFileUpload(slot, e.target.files[0])}
                                            />
                                        </label>
                                    )
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default StaffDocumentView;
