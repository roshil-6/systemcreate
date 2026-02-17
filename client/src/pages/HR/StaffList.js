import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import API_BASE_URL from '../../config/api';
import { useAuth } from '../../context/AuthContext';
import './HR.css'; // We'll create this CSS file

const StaffList = () => {
    const [staff, setStaff] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const token = localStorage.getItem('token');
    const navigate = useNavigate();
    // const [searchTerm, setSearchTerm] = useState(''); // Search removed as per request

    useEffect(() => {
        fetchStaff();
    }, []);

    const fetchStaff = async () => {
        try {
            // Use axios to leverage global auth headers and base URL
            const response = await axios.get(`${API_BASE_URL}/api/hr/staff`);
            setStaff(response.data);
            setLoading(false);
        } catch (err) {
            console.error('Error fetching staff:', err);
            // Check for 401 explicitly
            if (err.response && err.response.status === 401) {
                setError('Session expired. Please login again.');
            } else {
                setError(err.message || 'Failed to fetch staff list');
            }
            setLoading(false);
        }
    };

    // const filteredStaff = staff.filter(...) // Removed search logic
    // const filteredStaff = staff.filter(...) // Removed search logic
    const displayedStaff = staff; // Show all users including ADMIN

    if (loading) return (
        <div className="flex items-center justify-center min-h-screen text-blue-400">
            <div className="text-xl animate-pulse">Loading staff directory...</div>
        </div>
    );

    if (error) return <div className="p-8 text-red-500 bg-red-900/10 border border-red-500/20 rounded-lg m-6">Error: {error}</div>;

    return (
        <div className="staff-list-container">
            <div className="flex flex-col md:flex-row justify-between items-center mb-12">
                <div>
                    <h1 className="text-5xl font-bold mb-3 tracking-tighter">Staff Directory</h1>
                    <p className="text-gray-500 text-lg">Centralized documentation & profile management.</p>
                </div>
            </div>

            {displayedStaff.length === 0 ? (
                <div className="text-center py-20 bg-white/50 backdrop-blur-sm rounded-3xl border border-white/60">
                    <p className="text-xl text-gray-400">No staff found.</p>
                </div>
            ) : (
                <div className="staff-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                    {displayedStaff.map((user, index) => (
                        <div
                            key={user.id}
                            onClick={() => navigate(`/hr/staff/${user.id}`)}
                            className="staff-card group"
                            style={{ animationDelay: `${index * 50}ms` }}
                        >
                            <div className="flex items-start space-x-5">
                                <div className="avatar-circle rounded-full flex items-center justify-center font-bold shrink-0">
                                    {user.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0 pt-1">
                                    <h3 className="truncate group-hover:text-[#D4AF37] transition-colors">
                                        {user.name}
                                    </h3>
                                    <span className="inline-block bg-gray-100 text-gray-600 text-[10px] font-bold px-2 py-1 rounded-full mt-2 mb-1 tracking-wider uppercase">
                                        {user.role}
                                    </span>
                                    <p className="text-sm truncate mt-1 opacity-70">{user.email}</p>
                                </div>
                            </div>

                            <div className="mt-6 pt-5 border-t border-gray-100 flex justify-between items-center">
                                <span className="text-xs font-mono text-gray-400">#{user.id.toString().padStart(4, '0')}</span>
                                <span className="flex items-center text-xs font-semibold text-[#D4AF37] group-hover:translate-x-1 transition-transform">
                                    Manage Docs &rarr;
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default StaffList;
