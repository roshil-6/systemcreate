import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import API_BASE_URL from '../config/api';
import './Attendance.css';
import { FiClock, FiCheckCircle, FiXCircle, FiCalendar, FiUser, FiAlertCircle } from 'react-icons/fi';

const Attendance = () => {
  const { user } = useAuth();
  const [todayStatus, setTodayStatus] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    staffId: '',
  });
  const [staffList, setStaffList] = useState([]);
  const [missingAttendance, setMissingAttendance] = useState(null);

  useEffect(() => {
    fetchTodayStatus();
    fetchHistory();
    if (user?.role === 'ADMIN' || user?.role === 'SALES_TEAM_HEAD') {
      fetchStaffList();
      fetchMissingAttendance();
    }
  }, [user, filters]);

  const fetchTodayStatus = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/attendance/today`);
      setTodayStatus(response.data);
    } catch (error) {
      console.error('Error fetching today status:', error);
    }
  };

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const params = {};
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;
      if (filters.staffId && (user?.role === 'ADMIN' || user?.role === 'SALES_TEAM_HEAD')) params.staffId = filters.staffId;

      const response = await axios.get(`${API_BASE_URL}/api/attendance/history`, { params });
      setHistory(response.data);
    } catch (error) {
      console.error('Error fetching history:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStaffList = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/attendance/staff`);
      setStaffList(response.data);
    } catch (error) {
      console.error('Error fetching staff list:', error);
    }
  };

  const fetchMissingAttendance = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/attendance/missing`);
      setMissingAttendance(response.data);
    } catch (error) {
      console.error('Error fetching missing attendance:', error);
    }
  };

  const handleCheckIn = async () => {
    try {
      await axios.post(`${API_BASE_URL}/api/attendance/checkin`);
      fetchTodayStatus();
      fetchHistory();
      if (user?.role === 'ADMIN' || user?.role === 'SALES_TEAM_HEAD') {
        fetchMissingAttendance();
      }
    } catch (error) {
      alert(error.response?.data?.error || 'Error checking in');
    }
  };

  const handleCheckOut = async () => {
    try {
      await axios.post(`${API_BASE_URL}/api/attendance/checkout`);
      fetchTodayStatus();
      fetchHistory();
    } catch (error) {
      alert(error.response?.data?.error || 'Error checking out');
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters({ ...filters, [key]: value });
  };

  return (
    <div className="attendance-page">
      <div className="attendance-header">
        <h1 className="attendance-title">Attendance</h1>
      </div>
      
      {/* Today's Check-in Section */}
      {(user?.role === 'STAFF' || user?.role === 'SALES_TEAM' || user?.role === 'SALES_TEAM_HEAD' || user?.role === 'PROCESSING') && (
        <div className="attendance-section">
          <div className="attendance-actions">
            <div className="today-status-card">
              <div className="status-header">
                <FiCalendar className="status-icon" />
                <h2>Today's Attendance</h2>
              </div>
              {todayStatus && (
                <div className="status-content">
                  {todayStatus.checkedIn ? (
                    <>
                      <div className="status-info">
                        <span className="status-label">Check-in:</span>
                        <span className="status-value">
                          {new Date(todayStatus.checkIn).toLocaleTimeString()}
                        </span>
                      </div>
                      {todayStatus.checkedOut ? (
                        <div className="status-info">
                          <span className="status-label">Check-out:</span>
                          <span className="status-value">
                            {new Date(todayStatus.checkOut).toLocaleTimeString()}
                          </span>
                        </div>
                      ) : (
                        <button className="btn-checkout" onClick={handleCheckOut}>
                          <FiXCircle /> Check Out
                        </button>
                      )}
                    </>
                  ) : (
                    <button className="btn-checkin" onClick={handleCheckIn}>
                      <FiCheckCircle /> Check In
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Missing Attendance Section */}
      {(user?.role === 'ADMIN' || user?.role === 'SALES_TEAM_HEAD') && missingAttendance && (
        <div className="attendance-section">
          <div className="missing-attendance-section">
          <div className="missing-attendance-header">
            <FiAlertCircle className="alert-icon" />
            <h2>Missing Attendance - Today</h2>
          </div>
          <div className="missing-stats">
            <div className="stat-item">
              <span className="stat-label">Total Staff:</span>
              <span className="stat-value">{missingAttendance.totalStaff}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Checked In:</span>
              <span className="stat-value checked-in">{missingAttendance.checkedInCount}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Not Checked In:</span>
              <span className="stat-value missing">{missingAttendance.missingCount}</span>
            </div>
          </div>
          {missingAttendance.missingCount > 0 ? (
            <div className="missing-staff-list">
              <h3>Staff Who Didn't Check In:</h3>
              <div className="missing-staff-table-container">
                <table className="missing-staff-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                    </tr>
                  </thead>
                  <tbody>
                    {missingAttendance.missingStaff.map((staff) => (
                      <tr key={staff.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <FiUser style={{ opacity: 0.6 }} />
                            {staff.name}
                          </div>
                        </td>
                        <td>{staff.email}</td>
                        <td>
                          <span className="role-badge">{staff.role}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="all-checked-in">
              <FiCheckCircle className="success-icon" />
              <p>All staff members have checked in today!</p>
            </div>
          )}
        </div>
        </div>
      )}
      
      {/* Attendance History */}
      <div className="attendance-section">
        <div className="attendance-history">
        <div className="history-header">
          <h2>Attendance History</h2>
          {(user?.role === 'ADMIN' || user?.role === 'SALES_TEAM_HEAD') && (
            <div className="history-filters">
              <select
                value={filters.staffId}
                onChange={(e) => handleFilterChange('staffId', e.target.value)}
                className="filter-select"
              >
                <option value="">All Staff</option>
                {staffList.map((staff) => (
                  <option key={staff.id} value={staff.id}>
                    {staff.name}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => handleFilterChange('startDate', e.target.value)}
                className="filter-input"
                placeholder="Start Date"
              />
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => handleFilterChange('endDate', e.target.value)}
                className="filter-input"
                placeholder="End Date"
              />
            </div>
          )}
        </div>
        {loading ? (
          <div className="loading">Loading attendance history...</div>
        ) : history.length === 0 ? (
          <div className="no-history">No attendance records found</div>
        ) : (
          <div className="history-table-container">
            <table className="history-table">
              <thead>
                <tr>
                  {(user?.role === 'ADMIN' || user?.role === 'SALES_TEAM_HEAD') && <th>Staff Member</th>}
                  <th>Date</th>
                  <th>Check-in</th>
                  <th>Check-out</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody>
                {history.map((record) => {
                  const checkIn = new Date(record.check_in);
                  const checkOut = record.check_out ? new Date(record.check_out) : null;
                  const duration = checkOut
                    ? Math.round((checkOut - checkIn) / (1000 * 60 * 60) * 10) / 10
                    : null;

                  return (
                    <tr key={record.id}>
                      {(user?.role === 'ADMIN' || user?.role === 'SALES_TEAM_HEAD') && <td>{record.user_name}</td>}
                      <td>{new Date(record.date).toLocaleDateString()}</td>
                      <td>{checkIn.toLocaleTimeString()}</td>
                      <td>{checkOut ? checkOut.toLocaleTimeString() : '-'}</td>
                      <td>{duration ? `${duration} hours` : '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        </div>
      </div>
    </div>
  );
};

export default Attendance;
