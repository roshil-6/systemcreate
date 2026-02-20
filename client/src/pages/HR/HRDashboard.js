import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import API_BASE_URL from '../../config/api';
import { FiUsers, FiClock, FiCalendar, FiGift, FiArrowRight, FiUser } from 'react-icons/fi';
import './HR.css';

const HRDashboard = () => {
    const navigate = useNavigate();
    const [stats, setStats] = useState({
        totalStaff: 0,
        presentToday: 0,
        missingAttendance: 0
    });
    const [upcomingBirthdays, setUpcomingBirthdays] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchDashboardData();
    }, []);

    const fetchDashboardData = async () => {
        try {
            setLoading(true);
            const [staffRes, birthdaysRes, attendanceRes] = await Promise.all([
                axios.get(`${API_BASE_URL}/api/hr/staff`),
                axios.get(`${API_BASE_URL}/api/hr/birthdays/upcoming`),
                axios.get(`${API_BASE_URL}/api/attendance/missing`)
            ]);

            setStats({
                totalStaff: staffRes.data.length,
                presentToday: staffRes.data.length - (attendanceRes.data.missing_staff?.length || 0),
                missingAttendance: attendanceRes.data.missing_staff?.length || 0
            });
            setUpcomingBirthdays(birthdaysRes.data || []);
        } catch (error) {
            console.error('Error fetching HR dashboard data:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (dateStr) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'long' });
    };

    if (loading) return <div className="hr-dashboard-loading">Loading Dashboard...</div>;

    return (
        <div className="hr-dashboard">
            <div className="hr-dashboard-header">
                <h1>HR Overview</h1>
                <p>Monitor your team's performance and milestones</p>
            </div>

            <div className="hr-stats-grid">
                <div className="hr-stat-card">
                    <div className="stat-icon" style={{ background: '#e0e7ff', color: '#4f46e5' }}>
                        <FiUsers />
                    </div>
                    <div className="stat-info">
                        <h3>Total Staff</h3>
                        <div className="stat-value">{stats.totalStaff}</div>
                    </div>
                </div>
                <div className="hr-stat-card">
                    <div className="stat-icon" style={{ background: '#dcfce7', color: '#15803d' }}>
                        <FiClock />
                    </div>
                    <div className="stat-info">
                        <h3>Present Today</h3>
                        <div className="stat-value">{stats.presentToday}</div>
                    </div>
                </div>
                <div className="hr-stat-card">
                    <div className="stat-icon" style={{ background: '#fee2e2', color: '#dc2626' }}>
                        <FiCalendar />
                    </div>
                    <div className="stat-info">
                        <h3>Missing Attendance</h3>
                        <div className="stat-value">{stats.missingAttendance}</div>
                    </div>
                </div>
            </div>

            <div className="hr-dashboard-content">
                {/* Birthday Reminders */}
                <div className="birthday-reminders-section">
                    <div className="section-header">
                        <h2><FiGift style={{ marginRight: '10px', color: '#db2777' }} /> Upcoming Birthdays</h2>
                        <span className="badge">Next 30 Days</span>
                    </div>

                    <div className="birthdays-list">
                        {upcomingBirthdays.length === 0 ? (
                            <div className="no-birthdays">No birthdays in the next 30 days.</div>
                        ) : (
                            upcomingBirthdays.map((b) => (
                                <div key={b.id} className="birthday-card">
                                    <div className="birthday-user-info">
                                        {b.profile_photo ? (
                                            <img
                                                src={`${API_BASE_URL}/api/hr/staff/${b.id}/photo`}
                                                alt={b.name}
                                                className="birthday-avatar"
                                            />
                                        ) : (
                                            <div className="birthday-avatar-fallback">
                                                {b.name.charAt(0).toUpperCase()}
                                            </div>
                                        )}
                                        <div className="user-details">
                                            <h4>{b.name}</h4>
                                            <p>{b.role}</p>
                                        </div>
                                    </div>
                                    <div className="birthday-date">
                                        <div className="date-badge">
                                            {formatDate(b.dob)}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Quick Actions / Navigation */}
                <div className="quick-access-section">
                    <div className="section-header">
                        <h2>Quick Access</h2>
                    </div>
                    <div className="quick-links">
                        <button onClick={() => navigate('/hr/staff-list')} className="quick-link-card">
                            <FiUser />
                            <span>Manage Staff</span>
                            <FiArrowRight className="arrow" />
                        </button>
                        <button onClick={() => navigate('/attendance')} className="quick-link-card">
                            <FiClock />
                            <span>Attendance History</span>
                            <FiArrowRight className="arrow" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default HRDashboard;
