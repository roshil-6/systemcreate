import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import API_BASE_URL from '../config/api';
import './UserManagement.css';
import { FiUserPlus, FiEdit2, FiTrash2, FiSave, FiX, FiShield, FiUser, FiDownload } from 'react-icons/fi';

const UserManagement = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'STAFF',
  });
  const [error, setError] = useState('');

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      fetchUsers();
    }
  }, [user]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE_URL}/api/users`);
      setUsers(response.data);
    } catch (error) {
      console.error('Error fetching users:', error);
      alert('Error loading users');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.name || !formData.email) {
      setError('Name and email are required');
      return;
    }

    if (!editingUser && !formData.password) {
      setError('Password is required for new users');
      return;
    }

    if (formData.password && formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    try {
      if (editingUser) {
        // Update user
        await axios.put(`${API_BASE_URL}/api/users/${editingUser.id}`, formData);
      } else {
        // Create user
        await axios.post(`${API_BASE_URL}/api/users`, formData);
      }
      setShowForm(false);
      setEditingUser(null);
      setFormData({ name: '', email: '', password: '', role: 'STAFF' });
      fetchUsers();
    } catch (error) {
      setError(error.response?.data?.error || 'Error saving user');
    }
  };

  const handleEdit = (userToEdit) => {
    setEditingUser(userToEdit);
    setFormData({
      name: userToEdit.name,
      email: userToEdit.email,
      password: '', // Don't show password
      role: userToEdit.role,
    });
    setShowForm(true);
    setError('');
  };

  const handleDelete = async (userId, userName) => {
    if (userId === user.id) {
      alert('You cannot delete your own account');
      return;
    }

    if (!window.confirm(`Are you sure you want to delete ${userName}? This action cannot be undone.`)) {
      return;
    }

    try {
      await axios.delete(`${API_BASE_URL}/api/users/${userId}`);
      fetchUsers();
    } catch (error) {
      alert(error.response?.data?.error || 'Error deleting user');
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingUser(null);
    setFormData({ name: '', email: '', password: '', role: 'STAFF' });
    setError('');
  };

  const handleExportToGoogleSheets = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/users/export/csv`, {
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `users_export_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      alert('CSV file downloaded! You can import this file into Google Sheets by:\n1. Opening Google Sheets\n2. File > Import\n3. Upload the CSV file');
    } catch (error) {
      console.error('Export error:', error);
      alert('Error exporting users. Please try again.');
    }
  };

  if (user?.role !== 'ADMIN') {
    return (
      <div className="user-management">
        <div className="access-denied">
          <h2>Access Denied</h2>
          <p>Only administrators can access user management.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="user-management-loading">Loading users...</div>;
  }

  return (
    <div className="user-management">
      <div className="user-management-header">
        <h1>User Management</h1>
        <div className="header-actions">
          <button
            className="btn-export-users"
            onClick={handleExportToGoogleSheets}
            title="Export to CSV (can be imported to Google Sheets)"
          >
            <FiDownload /> Export to Google Sheets
          </button>
          <button className="btn-add-user" onClick={() => setShowForm(true)}>
            <FiUserPlus /> Add New User
          </button>
        </div>
      </div>

      {showForm && (
        <div className="user-form-container">
          <div className="user-form">
            <div className="form-header">
              <h2>{editingUser ? 'Edit User' : 'Create New User'}</h2>
              <button className="btn-close" onClick={handleCancel}>
                <FiX />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              {error && <div className="form-error">{error}</div>}
              <div className="form-group">
                <label>Name *</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  required
                  placeholder="Full Name"
                />
              </div>
              <div className="form-group">
                <label>Email *</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  required
                  placeholder="user@toniosenora.com"
                />
              </div>
              <div className="form-group">
                <label>Password {editingUser ? '(leave blank to keep current)' : '*'}</label>
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  required={!editingUser}
                  placeholder={editingUser ? 'Enter new password or leave blank' : 'Minimum 6 characters'}
                  minLength={editingUser ? 0 : 6}
                />
              </div>
              <div className="form-group">
                <label>Role *</label>
                <select name="role" value={formData.role} onChange={handleInputChange} required>
                  <option value="SALES_TEAM">Sales Team</option>
                  <option value="SALES_TEAM_HEAD">Sales Team Head</option>
                  <option value="PROCESSING">Processing</option>
                  <option value="ADMIN">Admin</option>
                  <option value="STAFF">Staff (Legacy)</option>
                </select>
              </div>
              <div className="form-actions">
                <button type="button" className="btn-cancel" onClick={handleCancel}>
                  Cancel
                </button>
                <button type="submit" className="btn-save">
                  <FiSave /> {editingUser ? 'Update User' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="users-table-container">
        <table className="users-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan="5" className="no-users">
                  No users found. Create your first user!
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="user-name-cell">
                      {u.role === 'ADMIN' ? <FiShield /> : <FiUser />}
                      <span>{u.name}</span>
                      {u.id === user.id && <span className="current-user">(You)</span>}
                    </div>
                  </td>
                  <td>{u.email}</td>
                  <td>
                    <span className={`role-badge ${u.role.toLowerCase()}`}>
                      {u.role}
                    </span>
                  </td>
                  <td>{new Date(u.created_at).toLocaleDateString()}</td>
                  <td>
                    <div className="action-buttons">
                      <button
                        className="btn-edit-user"
                        onClick={() => handleEdit(u)}
                        title="Edit User"
                      >
                        <FiEdit2 />
                      </button>
                      <button
                        className="btn-delete-user"
                        onClick={() => handleDelete(u.id, u.name)}
                        disabled={u.id === user.id}
                        title={u.id === user.id ? 'Cannot delete your own account' : 'Delete User'}
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

export default UserManagement;
