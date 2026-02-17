import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
            const response = await fetch('http://localhost:5002/api/hr/staff', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch staff list');
            }

            const data = await response.json();
            setStaff(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // const filteredStaff = staff.filter(...) // Removed search logic
    const displayedStaff = staff.filter(user => user.role !== 'ADMIN');

    if (loading) return (
        <div className="flex items-center justify-center min-h-screen text-blue-400">
            <div className="text-xl animate-pulse">Loading staff directory...</div>
        </div>
    );

    if (error) return <div className="p-8 text-red-500 bg-red-900/10 border border-red-500/20 rounded-lg m-6">Error: {error}</div>;

    return (
        <div className="staff-list-container">
            <div className="flex flex-col md:flex-row justify-between items-center mb-10">
                <div>
                    <h1 className="text-4xl font-bold mb-2 tracking-tight">Staff Directory</h1>
                    <p>Centralized documentation management for all employees.</p>
                </div>
            </div>

            {displayedStaff.length === 0 ? (
                <div className="text-center py-20">
                    <p className="text-xl">No staff found.</p>
                </div>
            ) : (
                <div className="staff-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {displayedStaff.map(user => (
                        <div
                            key={user.id}
                            onClick={() => navigate(`/hr/staff/${user.id}`)}
                            className="staff-card group cursor-pointer"
                        >
                            <div className="flex items-start space-x-4">
                                <div className="avatar-circle w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold shrink-0">
                                    {user.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-lg font-semibold text-white truncate group-hover:text-blue-400 transition-colors">
                                        {user.name}
                                    </h3>
                                    <span className="inline-block bg-blue-500/10 text-blue-400 text-xs px-2 py-0.5 rounded mt-1 mb-1 border border-blue-500/20">
                                        {user.role}
                                    </span>
                                    <p className="text-gray-500 text-sm truncate">{user.email}</p>
                                </div>
                            </div>

                            <div className="mt-4 pt-4 border-t border-gray-700/50 flex justify-between items-center text-xs text-gray-400">
                                <span>ID: #{user.id}</span>
                                <span className="flex items-center text-gray-500 group-hover:text-blue-400 transition-colors">
                                    Manage Documents &rarr;
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
