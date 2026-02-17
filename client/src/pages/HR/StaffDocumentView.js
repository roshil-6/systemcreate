import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
            const response = await fetch(`http://localhost:5002/api/hr/staff/${id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setStaffName(data.name);
            }
        } catch (err) {
            console.error('Failed to fetch staff details', err);
        }
    };

    const fetchDocuments = async () => {
        try {
            const response = await fetch(`http://localhost:5002/api/hr/staff/${id}/documents`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch documents');
            }

            const data = await response.json();
            // Convert list to object keyed by slot number
            const docsMap = {};
            data.forEach(doc => {
                docsMap[doc.slot_number] = doc;
            });
            setDocuments(docsMap);
        } catch (err) {
            setError(err.message);
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
                const response = await fetch(`http://localhost:5002/api/hr/documents/${viewingDoc.id}/view`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!response.ok) throw new Error('Failed to load document');
                const blob = await response.blob();
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
            const response = await fetch(`http://localhost:5002/api/hr/staff/${id}/documents/${slot}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            if (!response.ok) {
                throw new Error('Upload failed');
            }

            const newDoc = await response.json();
            setDocuments(prev => ({
                ...prev,
                [slot]: newDoc
            }));
        } catch (err) {
            alert('Upload failed: ' + err.message);
        } finally {
            setUploadingSlot(null);
        }
    };

    const handleDelete = async (slot) => {
        const doc = documents[slot];
        if (!doc) return;

        if (!window.confirm('Are you sure you want to delete this document?')) return;

        try {
            const response = await fetch(`http://localhost:5002/api/hr/documents/${doc.id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Delete failed');

            setDocuments(prev => {
                const newState = { ...prev };
                delete newState[slot];
                return newState;
            });
        } catch (err) {
            alert('Delete failed: ' + err.message);
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
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setViewingDoc(null)}>
                    <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center p-4 border-b">
                            <h3 className="text-lg font-semibold text-gray-800 truncate">{viewingDoc.file_name}</h3>
                            <button onClick={() => setViewingDoc(null)} className="text-gray-500 hover:text-red-500 p-1">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="flex-1 bg-gray-100 overflow-auto flex items-center justify-center p-4 relative min-h-[300px]">
                            {!viewerUrl ? (
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
                            ) : (
                                viewingDoc.file_name.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp)$/) ? (
                                    <img src={viewerUrl} alt="Document" className="max-w-full max-h-full object-contain shadow-md" />
                                ) : (
                                    <iframe src={viewerUrl} title="Document Viewer" className="w-full h-full min-h-[600px] border-none shadow-md bg-white"></iframe>
                                )
                            )}
                        </div>
                        <div className="p-4 border-t bg-gray-50 flex justify-end gap-2">
                            <a
                                href={viewerUrl}
                                download={viewingDoc.file_name}
                                className="px-4 py-2 bg-[#D4AF37] text-white rounded hover:bg-[#aa8c2c] text-sm font-medium flex items-center gap-2 shadow-sm transition-colors"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                Download
                            </a>
                            <button onClick={() => setViewingDoc(null)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 text-sm font-medium transition-colors">
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex items-center mb-8 relative z-50">
                    <button
                        onClick={() => navigate('/hr')}
                        className="btn-back mr-6 relative z-50 hover:scale-105 transition-transform"
                    >
                        <span>&larr;</span> Back
                    </button>
                    <div>
                        <h1 className="text-3xl font-bold text-white tracking-tight">
                            Documents for <span className="text-[#D4AF37]">{staffName}</span>
                        </h1>
                        <p className="text-gray-400 mt-1 text-sm">Managing upload slots for Agent ID #{id}</p>
                    </div>
                </div>

                {error && (
                    <div className="mb-8 p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg">
                        {error}
                    </div>
                )}

                {/* Explicit Sub-Header for Upload Section */}
                <div className="mb-6 relative z-10">
                    <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
                        <span className="w-2 h-8 bg-[#D4AF37] rounded-full"></span>
                        Upload Area for <span className="text-[#aa8c2c]">{staffName || 'Staff Member'}</span>
                    </h2>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6 relative z-0">
                    {slots.map(slot => {
                        const doc = documents[slot];
                        const isUploading = uploadingSlot === slot;

                        return (
                            <div key={slot} className="doc-card relative group h-52">
                                <div className="slot-badge">Slot {slot}</div>

                                <div className="h-full w-full flex flex-col items-center justify-center">
                                    {doc ? (
                                        <>
                                            <div className="w-16 h-16 mb-4 flex items-center justify-center bg-[#f9f4e0] rounded-xl text-[#D4AF37] border border-[#e6dcb8]">
                                                <span className="text-3xl">📄</span>
                                            </div>

                                            <div className="w-full text-center px-4 flex-grow flex flex-col justify-center">
                                                <h4 className="text-gray-900 text-sm font-bold truncate w-full" title={doc.file_name}>
                                                    {doc.file_name}
                                                </h4>
                                                <p className="text-gray-500 text-xs mt-1">
                                                    {new Date(doc.created_at).toLocaleDateString()}
                                                </p>
                                            </div>

                                            <div className="flex gap-2 w-full mt-auto pt-4 border-t border-gray-100 px-4 pb-4">
                                                <button
                                                    className="flex-1 btn-view py-1.5 rounded text-xs font-medium transition-colors"
                                                    onClick={() => setViewingDoc(doc)}
                                                >
                                                    View
                                                </button>
                                                <button
                                                    className="flex-1 btn-delete py-1.5 rounded text-xs font-medium transition-colors"
                                                    onClick={() => handleDelete(slot)}
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </>
                                    ) : (
                                        isUploading ? (
                                            <div className="upload-zone w-full h-full relative bg-[#f9f4e0] rounded-lg overflow-hidden border-2 border-dashed border-[#e6dcb8] flex items-center justify-center">
                                                <div className="flex flex-col items-center justify-center text-[#D4AF37]">
                                                    <div className="w-10 h-10 border-4 border-[#e6dcb8] border-t-[#D4AF37] rounded-full animate-spin mb-3"></div>
                                                    <span className="text-sm font-semibold animate-pulse text-[#8a6d3b]">Uploading...</span>
                                                </div>
                                            </div>
                                        ) : (
                                            <label className="upload-zone w-full h-full relative group flex flex-col items-center justify-center cursor-pointer">
                                                {/* Visual Layer - Clean & Modern */}
                                                <div className="flex flex-col items-center justify-center p-4 transition-transform duration-300 group-hover:scale-105">
                                                    <div className="mb-2 p-2 rounded-full bg-gray-50 text-gray-400 group-hover:bg-[#f9f4e0] group-hover:text-[#D4AF37] transition-colors duration-300 ring-1 ring-gray-100 group-hover:ring-[#D4AF37]/30">
                                                        <svg
                                                            xmlns="http://www.w3.org/2000/svg"
                                                            fill="none"
                                                            viewBox="0 0 24 24"
                                                            strokeWidth={1.5}
                                                            stroke="currentColor"
                                                            className="w-5 h-5"
                                                            width="20"
                                                            height="20"
                                                            style={{ minWidth: '20px', maxWidth: '20px' }}
                                                        >
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                                        </svg>
                                                    </div>
                                                    <h5 className="text-gray-600 font-medium text-xs mb-1 group-hover:text-[#8a6d3b] transition-colors">Add Document</h5>
                                                    <span className="text-gray-300 text-[10px] uppercase tracking-wider group-hover:text-[#D4AF37]/70 transition-colors">Select File</span>
                                                </div>

                                                {/* Hidden Input controlled by Label */}
                                                <input
                                                    type="file"
                                                    className="hidden"
                                                    onChange={(e) => handleFileUpload(slot, e.target.files[0])}
                                                />
                                            </label>
                                        )
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default StaffDocumentView;
