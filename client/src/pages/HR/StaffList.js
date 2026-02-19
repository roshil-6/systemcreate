import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import API_BASE_URL from '../../config/api';
import { useAuth } from '../../context/AuthContext';
import '../UserManagement.css';
import { FiUserPlus, FiEdit2, FiTrash2, FiSave, FiX, FiShield, FiUser, FiFolder } from 'react-icons/fi';

const StaffList = () => {
    const { user: currentUser } = useAuth();
    const [staff, setStaff] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const navigate = useNavigate();
    const location = useLocation();

    // Form state
    const [showForm, setShowForm] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        role: 'STAFF',
        phone_number: '',
        whatsapp_number: '',
    });
    const [formError, setFormError] = useState('');

    useEffect(() => {
        fetchStaff();
        const searchParams = new URLSearchParams(location.search);
        if (searchParams.get('create') === 'true') {
            openCreateForm();
            navigate('/hr', { replace: true });
        }
    }, [location.search]);

    const fetchStaff = async () => {
        try {
            setLoading(true);
            const response = await axios.get(`${API_BASE_URL}/api/hr/staff`);
            setStaff(response.data);
        } catch (err) {
            setError(err.response?.status === 401 ? 'Session expired. Please login again.' : (err.message || 'Failed to fetch staff list'));
        } finally {
            setLoading(false);
        }
    };

    const openCreateForm = () => {
        setEditingUser(null);
        setFormData({ name: '', email: '', password: '', role: 'STAFF', phone_number: '', whatsapp_number: '' });
        setFormError('');
        setShowForm(true);
    };

    const handleEdit = (u) => {
        setEditingUser(u);
        setFormData({
            name: u.name,
            email: u.email,
            password: '',
            role: u.role,
            phone_number: u.phone_number || '',
            whatsapp_number: u.whatsapp_number || '',
        });
        setFormError('');
        setShowForm(true);
    };

    const handleCancel = () => {
        setShowForm(false);
        setEditingUser(null);
        setFormData({ name: '', email: '', password: '', role: 'STAFF', phone_number: '', whatsapp_number: '' });
        setFormError('');
    };

    const handleInputChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
        setFormError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setFormError('');

        if (!formData.name || !formData.email) {
            setFormError('Name and email are required.');
            return;
        }
        if (!editingUser && !formData.password) {
            setFormError('Password is required for new staff.');
            return;
        }
        if (formData.password && formData.password.length < 6) {
            setFormError('Password must be at least 6 characters.');
            return;
        }

        try {
            if (editingUser) {
                await axios.put(`${API_BASE_URL}/api/users/${editingUser.id}`, formData);
            } else {
                await axios.post(`${API_BASE_URL}/api/users`, formData);
            }
            handleCancel();
            fetchStaff();
        } catch (err) {
            setFormError(err.response?.data?.error || 'Error saving staff member.');
        }
    };

    const handleDelete = async (userId, userName) => {
        if (userId === currentUser?.id) {
            alert('You cannot delete your own account.');
            return;
        }
        if (!window.confirm(`Delete ${userName}? This cannot be undone.`)) return;
        try {
            await axios.delete(`${API_BASE_URL}/api/users/${userId}`);
            fetchStaff();
        } catch (err) {
            alert(err.response?.data?.error || 'Error deleting staff member.');
        }
    };

    if (loading) return <div className="user-management-loading">Loading staff...</div>;
    if (error) return <div className="access-denied"><h2>Error</h2><p>{error}</p></div>;

    return (
        <div className="user-management">
            {/* Header */}
            <div className="user-management-header">
                <h1>Staff Directory</h1>
                <div className="header-actions">
                    <button className="btn-add-user" onClick={openCreateForm}>
                        <FiUserPlus /> Add New Staff
                    </button>
                </div>
            </div>

            {/* Inline Create / Edit Form */}
            {showForm && (
                <div className="user-form-container">
                    <div className="user-form">
                        <div className="form-header">
                            <h2>{editingUser ? `Edit — ${editingUser.name}` : 'Create New Staff'}</h2>
                            <button className="btn-close" onClick={handleCancel}><FiX /></button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            {formError && <div className="form-error">{formError}</div>}
                            <div className="form-group">
                                <label>Full Name *</label>
                                <input type="text" name="name" value={formData.name} onChange={handleInputChange} placeholder="John Doe" required />
                            </div>
                            <div className="form-group">
                                <label>Email / Login ID *</label>
                                <input type="email" name="email" value={formData.email} onChange={handleInputChange} placeholder="john@example.com" required />
                            </div>
                            <div className="form-group">
                                <label>Phone Number</label>
                                <input type="tel" name="phone_number" value={formData.phone_number} onChange={handleInputChange} placeholder="+91 9876543210" />
                            </div>
                            <div className="form-group">
                                <label>WhatsApp Number</label>
                                <input type="tel" name="whatsapp_number" value={formData.whatsapp_number} onChange={handleInputChange} placeholder="+91 9876543210" />
                            </div>
                            <div className="form-group">
                                <label>Password {editingUser ? '(leave blank to keep current)' : '*'}</label>
                                <input
                                    type="password"
                                    name="password"
                                    value={formData.password}
                                    onChange={handleInputChange}
                                    required={!editingUser}
                                    placeholder={editingUser ? 'Leave blank to keep current password' : 'Minimum 6 characters'}
                                    minLength={editingUser ? 0 : 6}
                                />
                            </div>

                            <div className="form-actions">
                                <button type="button" className="btn-cancel" onClick={handleCancel}>Cancel</button>
                                <button type="submit" className="btn-save">
                                    <FiSave /> {editingUser ? 'Update Staff' : 'Create Staff'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Staff Table */}
            <div className="users-table-container">
                <table className="users-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Phone</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {staff.length === 0 ? (
                            <tr>
                                <td colSpan="5" className="no-users">No staff found. Add your first staff member!</td>
                            </tr>
                        ) : (
                            staff.map((u) => (
                                <tr key={u.id}>
                                    <td>
                                        <div className="user-name-cell">
                                            {u.role === 'ADMIN' ? <FiShield /> : <FiUser />}
                                            <span>{u.name}</span>
                                            {u.id === currentUser?.id && <span className="current-user">(You)</span>}
                                        </div>
                                    </td>
                                    <td>{u.email}</td>
                                    <td>{u.phone_number || '-'}</td>
                                    <td>
                                        <div className="action-buttons">
                                            <button
                                                className="btn-edit-user"
                                                onClick={() => navigate(`/hr/staff/${u.id}`)}
                                                title="View Documents"
                                                style={{ background: '#fef3c7', color: '#d97706' }}
                                            >
                                                <FiFolder />
                                            </button>
                                            <button
                                                className="btn-edit-user"
                                                onClick={() => handleEdit(u)}
                                                title="Edit Staff"
                                            >
                                                <FiEdit2 />
                                            </button>
                                            <button
                                                className="btn-delete-user"
                                                onClick={() => handleDelete(u.id, u.name)}
                                                disabled={u.id === currentUser?.id}
                                                title={u.id === currentUser?.id ? 'Cannot delete your own account' : 'Delete Staff'}
                                            >
                                                <FiTrash2 />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default StaffList;
