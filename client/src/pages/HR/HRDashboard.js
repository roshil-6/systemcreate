import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import API_BASE_URL from '../../config/api';
import { FiUsers, FiClock, FiCalendar, FiGift, FiArrowRight, FiUser, FiFileText } from 'react-icons/fi';
import './HR.css';

const HRDashboard = () => {
    const navigate = useNavigate();
    const [stats, setStats] = useState({
        totalStaff: 0,
        presentToday: 0,
        missingAttendance: 0
    });
    const [leadStats, setLeadStats] = useState({
        total: 0,
        new: 0,
        assigned: 0,
        contacted: 0,
        converted: 0,
        closed: 0,
        other: 0
    });
    const [recentLeads, setRecentLeads] = useState([]);
    const [upcomingBirthdays, setUpcomingBirthdays] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchDashboardData();
    }, []);

    /**
     * Same buckets as server getLeads statusGroups (database.js). Counts must match what ?status=… returns.
     */
    const STATUS_TO_API_GROUP = (() => {
        const m = {};
        const add = (statuses, apiGroup) => {
            statuses.forEach((s) => {
                m[String(s).trim().toLowerCase()] = apiGroup;
            });
        };
        add(['New', 'Unassigned', 'Direct Lead'], 'New');
        add(['Assigned', 'Prospect', 'Pending Lead'], 'Assigned');
        add(['Contacted', 'Follow-up', 'Follow Up', 'Responded', 'Not Available', 'Not Attended', 'Not Responding'], 'Contacted');
        add(['Registration Completed', 'Converted', 'Won'], 'Converted');
        add(['Closed', 'Closed / Rejected', 'Lost', 'Rejected', 'Not Interested', 'Not Eligible'], 'Closed');
        return m;
    })();

    const apiGroupForLeadStatus = (statusName) => {
        const k = String(statusName || '').trim().toLowerCase();
        return STATUS_TO_API_GROUP[k] || 'Other';
    };

    const fetchDashboardData = async () => {
        try {
            setLoading(true);
            const [staffRes, birthdaysRes, attendanceRes, leadsRes, dashboardRes] = await Promise.all([
                axios.get(`${API_BASE_URL}/api/hr/staff`),
                axios.get(`${API_BASE_URL}/api/hr/birthdays/upcoming`),
                axios.get(`${API_BASE_URL}/api/attendance/missing`),
                axios.get(`${API_BASE_URL}/api/leads`, { params: { limit: 10, offset: 0 } }),
                axios.get(`${API_BASE_URL}/api/dashboard`, { params: { metricsOnly: true, view: 'personal' } })
            ]);

            setStats({
                totalStaff: staffRes.data.length,
                presentToday: staffRes.data.length - (attendanceRes.data.missingStaff?.length || 0),
                missingAttendance: attendanceRes.data.missingStaff?.length || 0
            });
            setUpcomingBirthdays(birthdaysRes.data || []);

            const metrics = dashboardRes.data?.metrics || {};
            const leadsByStatusRaw = metrics.leadsByStatus || {};

            const tallies = { new: 0, assigned: 0, contacted: 0, converted: 0, closed: 0, other: 0 };
            Object.entries(leadsByStatusRaw).forEach(([status, count]) => {
                const g = apiGroupForLeadStatus(status);
                const n = Number(count) || 0;
                if (g === 'Other') tallies.other += n;
                else tallies[g.toLowerCase()] += n;
            });

            const metricsTotal = Number(metrics.totalLeads || 0);
            const sumBuckets = tallies.new + tallies.assigned + tallies.contacted + tallies.converted + tallies.closed + tallies.other;
            if (metricsTotal > sumBuckets) {
                tallies.other += metricsTotal - sumBuckets;
            }

            setLeadStats({
                total: metricsTotal,
                new: tallies.new,
                assigned: tallies.assigned,
                contacted: tallies.contacted,
                converted: tallies.converted,
                closed: tallies.closed,
                other: tallies.other
            });

            const leads = leadsRes.data?.leads || leadsRes.data || [];
            const sorted = [...leads].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            setRecentLeads(sorted.slice(0, 5));
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

    /** Use API group keys: New, Assigned, Contacted, Converted, Closed (matches server statusGroups). */
    const openMyLeads = (statusGroup = '') => {
        if (!statusGroup) {
            navigate('/leads?from=hr-my-leads');
            return;
        }
        navigate(`/leads?from=hr-my-leads&status=${encodeURIComponent(statusGroup)}`);
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

            {/* My Leads Overview */}
            <div className="hr-leads-overview">
                <div className="section-header">
                    <h2><FiFileText style={{ marginRight: '10px', color: '#4f46e5' }} /> My Assigned Leads</h2>
                    <button className="view-all-btn" onClick={() => openMyLeads()}>
                        Open My Leads <FiArrowRight />
                    </button>
                </div>
                <div className="hr-leads-stats-grid">
                    <button type="button" className="lead-stat-card" style={{ borderLeft: '4px solid #3b82f6' }} onClick={() => openMyLeads()} title="All leads assigned to you (every status). Same list as Open My Leads.">
                        <div className="lead-stat-value">{leadStats.total}</div>
                        <div className="lead-stat-label">Assigned</div>
                    </button>
                    <button type="button" className="lead-stat-card" style={{ borderLeft: '4px solid #f59e0b' }} onClick={() => openMyLeads('New')} title="New, Unassigned, Direct Lead (same filter as server)">
                        <div className="lead-stat-value">{leadStats.new}</div>
                        <div className="lead-stat-label">New / Unassigned</div>
                    </button>
                    <button type="button" className="lead-stat-card" style={{ borderLeft: '4px solid #8b5cf6' }} onClick={() => openMyLeads('Contacted')} title="Follow-up, Contacted, Not Responding, etc.">
                        <div className="lead-stat-value">{leadStats.contacted}</div>
                        <div className="lead-stat-label">Contacted</div>
                    </button>
                    <button type="button" className="lead-stat-card" style={{ borderLeft: '4px solid #10b981' }} onClick={() => openMyLeads('Converted')}>
                        <div className="lead-stat-value">{leadStats.converted}</div>
                        <div className="lead-stat-label">Converted</div>
                    </button>
                    <button type="button" className="lead-stat-card" style={{ borderLeft: '4px solid #ef4444' }} onClick={() => openMyLeads('Closed')}>
                        <div className="lead-stat-value">{leadStats.closed}</div>
                        <div className="lead-stat-label">Closed / Lost</div>
                    </button>
                    {leadStats.other > 0 && (
                        <button type="button" className="lead-stat-card" style={{ borderLeft: '4px solid #64748b' }} onClick={() => openMyLeads()} title="All your leads (includes statuses outside the groups above)">
                            <div className="lead-stat-value">{leadStats.other}</div>
                            <div className="lead-stat-label">Other statuses</div>
                        </button>
                    )}
                </div>

                {recentLeads.length > 0 && (
                    <div className="recent-leads-table">
                        <h3>Recent Leads</h3>
                        <table>
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Status</th>
                                    <th>Priority</th>
                                    <th>Date</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {recentLeads.map(lead => (
                                    <tr key={lead.id} className="recent-lead-row" onClick={() => navigate(`/leads/${lead.id}`)}>
                                        <td className="lead-name-cell">
                                            <span>{lead.name || 'Unnamed'}</span>
                                            {lead.email && <small>{lead.email}</small>}
                                        </td>
                                        <td>
                                            <span className={`lead-status-badge status-${(lead.status || '').toLowerCase().replace(/\s+/g, '-')}`}>
                                                {lead.status || 'N/A'}
                                            </span>
                                        </td>
                                        <td>
                                            <span className={`lead-priority-badge priority-${(lead.priority || '').toLowerCase()}`}>
                                                {lead.priority || '-'}
                                            </span>
                                        </td>
                                        <td>{new Date(lead.created_at).toLocaleDateString('en-IN')}</td>
                                        <td>
                                            <button className="view-lead-btn" onClick={(e) => { e.stopPropagation(); navigate(`/leads/${lead.id}`); }}>
                                                View
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
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
                        <button onClick={() => navigate('/leads?from=hr-my-leads')} className="quick-link-card">
                            <FiFileText />
                            <span>My Leads</span>
                            <FiArrowRight className="arrow" />
                        </button>
                        <button onClick={() => navigate('/hr/staff')} className="quick-link-card">
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
