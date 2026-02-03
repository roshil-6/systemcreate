import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import API_BASE_URL from '../config/api';
import './Dashboard.css';
import { FiUsers, FiTrendingUp, FiClock, FiXCircle, FiActivity, FiArrowLeft, FiPhone, FiMail, FiEdit2, FiCheck } from 'react-icons/fi';
import SnehaDashboard from './SnehaDashboard';
import KripaDashboard from './KripaDashboard';

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { staffId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const isAutoRefreshRef = useRef(false);

  // Check if user is Sneha
  const isSneha = user?.name === 'Sneha' || user?.name === 'SNEHA' || user?.email === 'sneha@toniosenora.com';

  // Check if user is Kripa
  const isKripa = user?.name === 'Kripa' || user?.name === 'KRIPA' || user?.email === 'kripa@toniosenora.com';

  // Check if user is Emy
  const isEmy = user?.name === 'Emy' || user?.name === 'EMY' || user?.email === 'emy@toniosenora.com';

  // Define fetchDashboardData BEFORE useEffect hooks that use it
  const fetchDashboardData = useCallback(async () => {
    const currentStaffId = staffId; // Capture current staffId
    const isAutoRefresh = isAutoRefreshRef.current;

    try {
      const endpoint = currentStaffId ? `${API_BASE_URL}/api/dashboard/staff/${currentStaffId}` : `${API_BASE_URL}/api/dashboard`;
      console.log('🔍 Fetching dashboard data:', { currentStaffId, endpoint, isAutoRefresh });

      const response = await axios.get(endpoint, {
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
        params: {
          _t: new Date().getTime() // Add timestamp to prevent caching
        }
      });

      console.log('📥 Dashboard data received:', {
        staffId: currentStaffId || 'main',
        staffName: response.data.staff?.name,
        staffIdFromResponse: response.data.staff?.id,
        totalLeads: response.data.metrics?.totalLeads,
        totalClients: response.data.metrics?.totalClients,
        registrationCompleted: response.data.metrics?.leadsByStatus?.['Registration Completed'],
        isProcessingTeam: response.data.isProcessingTeam,
        role: response.data.role,
        staffPerformanceCount: response.data.staffPerformance?.length || 0,
        staffPerformance: response.data.staffPerformance,
        isAutoRefresh
      });
      // Detailed log for sales team head
      if (response.data.role === 'SALES_TEAM_HEAD') {
        console.log('🔍 SALES_TEAM_HEAD - Full staffPerformance data:', JSON.stringify(response.data.staffPerformance, null, 2));
        console.log('🔍 SALES_TEAM_HEAD - staffPerformance type:', typeof response.data.staffPerformance);
        console.log('🔍 SALES_TEAM_HEAD - staffPerformance isArray:', Array.isArray(response.data.staffPerformance));
        console.log('🔍 SALES_TEAM_HEAD - staffPerformance length:', response.data.staffPerformance?.length);
      }

      // Verify we got the correct staff data when viewing a specific staff
      if (currentStaffId && response.data.staff) {
        const receivedStaffId = Number(response.data.staff.id);
        const requestedStaffId = Number(currentStaffId);
        if (receivedStaffId !== requestedStaffId) {
          console.error('❌ CRITICAL: Staff ID mismatch!');
          console.error('  Requested staff ID:', requestedStaffId);
          console.error('  Received staff ID:', receivedStaffId);
          console.error('  Received staff name:', response.data.staff.name);
          // During auto-refresh, don't clear data - just log the error
          if (isAutoRefresh) {
            console.warn('⚠️ Auto-refresh: Staff ID mismatch - keeping current data');
            return;
          }
          // On initial load, clear data
          setData(null);
          setLoading(false);
          return;
        }
      }

      setData(response.data);
    } catch (error) {
      console.error('❌ Error fetching dashboard data:', error);

      // During auto-refresh, don't redirect or clear data on errors
      if (isAutoRefresh) {
        console.warn('⚠️ Auto-refresh error - keeping current data:', error.message);
        return;
      }

      // Only redirect/clear on initial load errors
      if (error.response?.status === 404) {
        console.error('Staff not found, redirecting to main dashboard...');
        navigate('/');
      } else if (error.response?.status === 403) {
        console.error('Access denied, redirecting...');
        navigate('/');
      }
      setData(null);
    } finally {
      if (!isAutoRefresh) {
        setLoading(false);
      }
    }
  }, [staffId, navigate]);

  // Function to fetch ONLY metrics for auto-update
  const fetchMetricsOnly = useCallback(async () => {
    const currentStaffId = staffId;
    try {
      const endpoint = currentStaffId ? `${API_BASE_URL}/api/dashboard/staff/${currentStaffId}` : `${API_BASE_URL}/api/dashboard`;
      const response = await axios.get(endpoint, {
        params: { metricsOnly: 'true', _t: new Date().getTime() },
        headers: { 'Cache-Control': 'no-cache' }
      });

      if (response.data.metrics) {
        setData(prevData => {
          if (!prevData) return prevData;
          return { ...prevData, metrics: response.data.metrics };
        });
        console.log('📈 Metrics auto-updated:', response.data.metrics);
      }
    } catch (error) {
      console.warn('⚠️ Metrics auto-update failed:', error.message);
    }
  }, [staffId]);

  useEffect(() => {
    if (staffId && user && user.role !== 'ADMIN' && user.role !== 'SALES_TEAM_HEAD' && !isEmy) {
      navigate('/');
      return;
    }
    // Only fetch dashboard data if not Sneha or Kripa (they have their own dashboards)
    if (!isSneha && !isKripa) {
      // Clear old data when staffId changes to prevent showing wrong staff data
      isAutoRefreshRef.current = false; // Mark as initial load
      setData(null);
      setLoading(true);
      fetchDashboardData();
    } else {
      setLoading(false);
    }
  }, [staffId, user, navigate, isEmy, isSneha, isKripa, fetchDashboardData]);

  // Auto-refresh when page becomes visible (user switches tabs/windows)
  useEffect(() => {
    if (isSneha || isKripa) return; // Skip for specialized dashboards

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && user) {
        console.log('🔄 Dashboard page visible, refreshing...', { staffId });
        isAutoRefreshRef.current = true;
        fetchDashboardData().finally(() => {
          isAutoRefreshRef.current = false;
        });
      }
    };

    const handleFocus = () => {
      if (user) {
        console.log('🔄 Window focused, refreshing dashboard...', { staffId });
        isAutoRefreshRef.current = true;
        fetchDashboardData().finally(() => {
          isAutoRefreshRef.current = false;
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    // ONLY auto-update metrics every 10 seconds
    const interval = setInterval(() => {
      if (user && !isSneha && !isKripa) {
        fetchMetricsOnly();
      }
    }, 10000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      clearInterval(interval);
    };
  }, [user, isSneha, isKripa, staffId, fetchDashboardData, fetchMetricsOnly]);

  // Debug: Log metrics when data changes (must be before conditional returns)
  useEffect(() => {
    if (data && data.metrics) {
      console.log('📊 Dashboard metrics updated:', {
        totalLeads: data.metrics.totalLeads,
        totalClients: data.metrics.totalClients,
        registrationCompleted: data.metrics.leadsByStatus?.['Registration Completed'],
        allStatuses: data.metrics.leadsByStatus
      });
    }
    if (data) {
      console.log('📊 Dashboard data check:', {
        role: data.role,
        hasStaffPerformance: !!data.staffPerformance,
        staffPerformanceType: typeof data.staffPerformance,
        staffPerformanceIsArray: Array.isArray(data.staffPerformance),
        staffPerformanceLength: data.staffPerformance?.length || 0,
        staffPerformance: data.staffPerformance
      });
      // Detailed log for sales team head
      if (data.role === 'SALES_TEAM_HEAD') {
        console.log('🔍 SALES_TEAM_HEAD - Full staffPerformance in state:', JSON.stringify(data.staffPerformance, null, 2));
        console.log('🔍 SALES_TEAM_HEAD - Will render?', data.staffPerformance && Array.isArray(data.staffPerformance) && data.staffPerformance.length > 0);
      }
    }
  }, [data]);

  // Route to specialized dashboards (after all hooks)
  // Show Sneha's dashboard if:
  // 1. User is Sneha viewing their own dashboard (no staffId)
  // 2. Admin is viewing Sneha's dashboard (staffId matches Sneha)
  const viewingSneha = isSneha && !staffId;

  // Check if admin is viewing Sneha - use multiple methods to detect
  // Method 1: Check if data is loaded and contains Sneha info
  // Method 2: If data not loaded yet but staffId exists, fetch staff info to check
  // Method 3: Check processingRole from data
  const adminViewingSneha = staffId && (user?.role === 'ADMIN' || user?.role === 'SALES_TEAM_HEAD') && (
    // If data is loaded, check staff name/email or processingRole
    (data && (
      (data.staff && (data.staff.name === 'Sneha' || data.staff.name === 'SNEHA' || data.staff.email === 'sneha@toniosenora.com')) ||
      (data.processingRole === 'sneha')
    )) ||
    // If data not loaded yet, we'll check in the isStaffDetailView section below
    (!data && loading)
  );

  // Show Kripa's dashboard if:
  // 1. User is Kripa viewing their own dashboard (no staffId)
  // 2. Admin is viewing Kripa's dashboard (staffId matches Kripa)
  const viewingKripa = isKripa && !staffId;
  // Check if admin is viewing Kripa
  const adminViewingKripa = staffId && (user?.role === 'ADMIN' || user?.role === 'SALES_TEAM_HEAD') && (
    (data && (
      (data.staff && (data.staff.name === 'Kripa' || data.staff.name === 'KRIPA' || data.staff.email === 'kripa@toniosenora.com')) ||
      (data.processingRole === 'kripa')
    )) ||
    (!data && loading)
  );

  // If Sneha is viewing her own dashboard, show it immediately
  if (viewingSneha) {
    return <SnehaDashboard viewingStaffId={null} />;
  }

  // If Kripa is viewing her own dashboard, show it immediately
  if (viewingKripa) {
    return <KripaDashboard viewingStaffId={null} />;
  }

  if (loading) {
    return <div className="dashboard-loading">Loading dashboard...</div>;
  }

  if (!data) {
    return <div className="dashboard-error">Error loading dashboard data</div>;
  }

  // After data is loaded, check again for admin viewing Sneha/Kripa
  // Sneha's ID is 12, Kripa's ID is 8 (from backend code)
  const snehaStaffId = 12;
  const kripaStaffId = 8;

  const adminViewingSnehaAfterLoad = staffId && (user?.role === 'ADMIN' || user?.role === 'SALES_TEAM_HEAD') && (
    Number(staffId) === snehaStaffId || // Direct ID check
    (data.staff && (data.staff.name === 'Sneha' || data.staff.name === 'SNEHA' || data.staff.email === 'sneha@toniosenora.com')) ||
    (data.processingRole === 'sneha')
  );

  const adminViewingKripaAfterLoad = staffId && (user?.role === 'ADMIN' || user?.role === 'SALES_TEAM_HEAD') && (
    Number(staffId) === kripaStaffId || // Direct ID check
    (data.staff && (data.staff.name === 'Kripa' || data.staff.name === 'KRIPA' || data.staff.email === 'kripa@toniosenora.com')) ||
    (data.processingRole === 'kripa')
  );

  if (adminViewingSnehaAfterLoad) {
    return (
      <div>
        <button className="dashboard-back" onClick={() => navigate('/')} style={{ marginBottom: '16px' }}>
          <FiArrowLeft /> Back to Dashboard
        </button>
        <SnehaDashboard viewingStaffId={Number(staffId)} />
      </div>
    );
  }

  if (adminViewingKripaAfterLoad) {
    return (
      <div>
        <button className="dashboard-back" onClick={() => navigate('/')} style={{ marginBottom: '16px' }}>
          <FiArrowLeft /> Back to Dashboard
        </button>
        <KripaDashboard viewingStaffId={Number(staffId)} />
      </div>
    );
  }

  const isStaffDetailView = Boolean(staffId);
  const isRestrictedRole = data.role === 'STAFF' || data.role === 'SALES_TEAM' || data.role === 'PROCESSING';
  const isAdminOrTeamHead = data.role === 'ADMIN' || data.role === 'SALES_TEAM_HEAD';
  const isReadOnly = data.isReadOnly || false; // Emy's read-only access

  const renderStaffMetrics = () => {
    // Don't show lead metrics for processing team (they don't deal with leads)
    if (isStaffDetailView && data.isProcessingTeam) {
      return null;
    }

    return (
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-icon" style={{ background: '#FFF4D6' }}>
            <FiUsers style={{ color: '#D4AF37' }} />
          </div>
          <div className="metric-content">
            <div className="metric-value">{data.metrics.totalLeads}</div>
            <div className="metric-label">Total Leads</div>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon" style={{ background: '#FFF4D6' }}>
            <FiTrendingUp style={{ color: '#D4AF37' }} />
          </div>
          <div className="metric-content">
            <div className="metric-value">{data.metrics.newLeads}</div>
            <div className="metric-label">New Leads</div>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon" style={{ background: '#FFF4D6' }}>
            <FiClock style={{ color: '#D4AF37' }} />
          </div>
          <div className="metric-content">
            <div className="metric-value">{data.metrics.todayFollowups}</div>
            <div className="metric-label">Today's Follow-ups</div>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon" style={{ background: '#FFF4D6' }}>
            <FiXCircle style={{ color: '#D4AF37' }} />
          </div>
          <div className="metric-content">
            <div className="metric-value">{data.metrics.dueFollowups}</div>
            <div className="metric-label">Due Follow-ups</div>
          </div>
        </div>
      </div>
    );
  };

  const getStatusBoxColor = (status) => {
    const colors = {
      'New': {
        backgroundColor: '#BFDBFE', // Light blue
        color: '#1e3a8a', // Dark blue text
        borderColor: '#3b82f6' // Blue border
      },
      'Follow-up': {
        backgroundColor: '#FBCFE8', // Light pink
        color: '#831843', // Dark pink text
        borderColor: '#ec4899' // Pink border
      },
      'Prospect': {
        backgroundColor: '#A7F3D0', // Light green
        color: '#065f46', // Dark green text
        borderColor: '#10b981' // Green border
      },
      'Pending Lead': {
        backgroundColor: '#FDE68A', // Light yellow
        color: '#92400e', // Dark yellow/brown text
        borderColor: '#f59e0b' // Yellow border
      },
      'Closed / Rejected': {
        backgroundColor: '#E5E7EB', // Light gray
        color: '#374151', // Dark gray text
        borderColor: '#6b7280' // Gray border
      },
    };
    return colors[status] || colors['New'];
  };

  const renderStatusBreakdown = () => {
    // Don't show status breakdown for processing team (they don't deal with leads)
    if (isStaffDetailView && data.isProcessingTeam) {
      return null;
    }

    const newColor = getStatusBoxColor('New');
    const followUpColor = getStatusBoxColor('Follow-up');
    const prospectColor = getStatusBoxColor('Prospect');
    const pendingColor = getStatusBoxColor('Pending Lead');
    const notEligibleColor = getStatusBoxColor('Not Eligible');
    const notInterestedColor = getStatusBoxColor('Not Interested');
    const registrationCompletedColor = getStatusBoxColor('Registration Completed');

    // Check if we have leadsByStatus (new format) or old metrics format
    const hasLeadsByStatus = data.metrics?.leadsByStatus;

    return (
      <div className="status-breakdown">
        <h2>Leads by Status</h2>
        <div className="status-grid">
          {hasLeadsByStatus ? (
            // New format with leadsByStatus
            <>
              {data.metrics.leadsByStatus['New'] !== undefined && (
                <div className="status-item" style={newColor}>
                  <span className="status-label" style={{ color: newColor.color }}>New</span>
                  <span className="status-count" style={{ color: newColor.color }}>{data.metrics.leadsByStatus['New']}</span>
                </div>
              )}
              {data.metrics.leadsByStatus['Follow-up'] !== undefined && (
                <div className="status-item" style={followUpColor}>
                  <span className="status-label" style={{ color: followUpColor.color }}>Follow-up</span>
                  <span className="status-count" style={{ color: followUpColor.color }}>{data.metrics.leadsByStatus['Follow-up']}</span>
                </div>
              )}
              {data.metrics.leadsByStatus['Prospect'] !== undefined && (
                <div className="status-item" style={prospectColor}>
                  <span className="status-label" style={{ color: prospectColor.color }}>Prospect</span>
                  <span className="status-count" style={{ color: prospectColor.color }}>{data.metrics.leadsByStatus['Prospect']}</span>
                </div>
              )}
              {data.metrics.leadsByStatus['Pending Lead'] !== undefined && (
                <div className="status-item" style={pendingColor}>
                  <span className="status-label" style={{ color: pendingColor.color }}>Pending Lead</span>
                  <span className="status-count" style={{ color: pendingColor.color }}>{data.metrics.leadsByStatus['Pending Lead']}</span>
                </div>
              )}
              {data.metrics.leadsByStatus['Not Eligible'] !== undefined && (
                <div className="status-item" style={notEligibleColor}>
                  <span className="status-label" style={{ color: notEligibleColor.color }}>Not Eligible</span>
                  <span className="status-count" style={{ color: notEligibleColor.color }}>{data.metrics.leadsByStatus['Not Eligible']}</span>
                </div>
              )}
              {data.metrics.leadsByStatus['Not Interested'] !== undefined && (
                <div className="status-item" style={notInterestedColor}>
                  <span className="status-label" style={{ color: notInterestedColor.color }}>Not Interested</span>
                  <span className="status-count" style={{ color: notInterestedColor.color }}>{data.metrics.leadsByStatus['Not Interested']}</span>
                </div>
              )}
              {data.metrics.leadsByStatus['Registration Completed'] !== undefined && (
                <div className="status-item" style={registrationCompletedColor}>
                  <span className="status-label" style={{ color: registrationCompletedColor.color }}>Registration Completed</span>
                  <span className="status-count" style={{ color: registrationCompletedColor.color }}>{data.metrics.leadsByStatus['Registration Completed']}</span>
                </div>
              )}
            </>
          ) : (
            // Old format with individual metrics
            <>
              <div className="status-item" style={newColor}>
                <span className="status-label" style={{ color: newColor.color }}>New</span>
                <span className="status-count" style={{ color: newColor.color }}>{data.metrics.newLeads}</span>
              </div>
              <div className="status-item" style={followUpColor}>
                <span className="status-label" style={{ color: followUpColor.color }}>Follow-up</span>
                <span className="status-count" style={{ color: followUpColor.color }}>{data.metrics.followupLeads}</span>
              </div>
              <div className="status-item" style={prospectColor}>
                <span className="status-label" style={{ color: prospectColor.color }}>Prospect</span>
                <span className="status-count" style={{ color: prospectColor.color }}>{data.metrics.processingLeads}</span>
              </div>
              <div className="status-item" style={pendingColor}>
                <span className="status-label" style={{ color: pendingColor.color }}>Pending Lead</span>
                <span className="status-count" style={{ color: pendingColor.color }}>{data.metrics.convertedLeads}</span>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  // Show restricted view for non-admin roles
  if (isRestrictedRole && !isStaffDetailView) {
    return (
      <div className="dashboard">
        <h1 className="dashboard-title">My Dashboard</h1>
        {renderStaffMetrics()}
        {renderStatusBreakdown()}
        <div className="recent-activity">
          <h2>Recent Activity</h2>
          {data.recentActivity && data.recentActivity.length > 0 ? (
            <div className="activity-list">
              {(data.recentActivity || []).map((activity, index) => (
                <div key={index} className="activity-item">
                  <div className="activity-icon">
                    {activity.type === 'comment' ? <FiActivity /> : <FiTrendingUp />}
                  </div>
                  <div className="activity-content">
                    <div className="activity-text">
                      {activity.type === 'comment' ? 'New comment' : 'Status updated'} on{' '}
                      <strong>{activity.lead_name}</strong>
                    </div>
                    <div className="activity-meta">
                      {new Date(activity.timestamp).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="no-activity">No recent activity</p>
          )}
        </div>
      </div>
    );
  }

  if (isStaffDetailView) {
    // Check if this is a processing team member (Sneha or Kripa)
    const isProcessingTeam = data.isProcessingTeam === true;
    const processingRole = data.processingRole; // 'sneha' or 'kripa'

    // If admin is viewing Sneha or Kripa, show their specialized dashboard instead of table view
    const isAdminViewingSneha = processingRole === 'sneha' && (user?.role === 'ADMIN' || user?.role === 'SALES_TEAM_HEAD');
    const isAdminViewingKripa = processingRole === 'kripa' && (user?.role === 'ADMIN' || user?.role === 'SALES_TEAM_HEAD');

    // For Sneha and Kripa, render their specialized dashboards for admins
    if (isAdminViewingSneha) {
      return (
        <div>
          <button className="dashboard-back" onClick={() => navigate('/')} style={{ marginBottom: '16px' }}>
            <FiArrowLeft /> Back to Dashboard
          </button>
          <SnehaDashboard viewingStaffId={Number(staffId)} />
        </div>
      );
    }

    if (isAdminViewingKripa) {
      return (
        <div>
          <button className="dashboard-back" onClick={() => navigate('/')} style={{ marginBottom: '16px' }}>
            <FiArrowLeft /> Back to Dashboard
          </button>
          <KripaDashboard viewingStaffId={Number(staffId)} />
        </div>
      );
    }

    return (
      <div className="dashboard">
        <button className="dashboard-back" onClick={() => navigate('/')}>
          <FiArrowLeft /> Back to Dashboard
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <h1 className="dashboard-title">
            {isProcessingTeam ? 'Processing Team Dashboard' : 'Staff Dashboard'} - {data.staff?.name || (staffId ? `Staff ID: ${staffId}` : 'Staff')}
          </h1>
          {isProcessingTeam && (
            <span style={{
              padding: '6px 16px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: '#FFFFFF',
              borderRadius: '20px',
              fontSize: '13px',
              fontWeight: 600,
              boxShadow: '0 2px 8px rgba(102, 126, 234, 0.3)'
            }}>
              🔧 Processing Team
            </span>
          )}
          {isReadOnly && (
            <span style={{
              padding: '4px 12px',
              background: '#FEF3C7',
              color: '#92400E',
              borderRadius: '12px',
              fontSize: '12px',
              fontWeight: 600
            }}>
              Read-Only Monitoring
            </span>
          )}
        </div>

        {isProcessingTeam ? (
          // Processing Team Dashboard View
          <>
            {/* Processing Metrics */}
            <div className="metrics-grid" style={{ marginBottom: '24px' }}>
              <div className="metric-card" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: '#fff' }}>
                <div className="metric-icon" style={{ background: 'rgba(255,255,255,0.2)' }}>
                  <FiUsers style={{ color: '#fff' }} />
                </div>
                <div className="metric-content">
                  <div className="metric-value" style={{ color: '#fff' }}>{data.metrics?.totalClients || 0}</div>
                  <div className="metric-label" style={{ color: 'rgba(255,255,255,0.9)' }}>
                    {processingRole === 'sneha' ? 'Clients Assigned' : 'Clients In Processing'}
                  </div>
                </div>
              </div>
              <div className="metric-card">
                <div className="metric-icon" style={{ background: '#FEE2E2' }}>
                  <FiClock style={{ color: '#DC2626' }} />
                </div>
                <div className="metric-content">
                  <div className="metric-value">{data.metrics?.paymentPending || 0}</div>
                  <div className="metric-label">Payment Pending</div>
                </div>
              </div>
              <div className="metric-card">
                <div className="metric-icon" style={{ background: '#D1FAE5' }}>
                  <FiCheck style={{ color: '#059669' }} />
                </div>
                <div className="metric-content">
                  <div className="metric-value">{data.metrics?.firstInstallmentCompleted || 0}</div>
                  <div className="metric-label">1st Installment Done</div>
                </div>
              </div>
              <div className="metric-card">
                <div className="metric-icon" style={{ background: '#DBEAFE' }}>
                  <FiActivity style={{ color: '#2563EB' }} />
                </div>
                <div className="metric-content">
                  <div className="metric-value">{data.metrics?.pteFeePaid || 0}</div>
                  <div className="metric-label">PTE Fee Paid</div>
                </div>
              </div>
            </div>

            {/* Processing Clients List */}
            <div className="recent-leads-section">
              <h2>{processingRole === 'sneha' ? 'Clients Assigned to Sneha' : 'Clients In Processing (Kripa)'}</h2>
              {data.clientsList && data.clientsList.length > 0 ? (
                <div className="leads-list-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Phone</th>
                        <th>Email</th>
                        <th>Fee Status</th>
                        <th>Amount Paid</th>
                        {processingRole === 'kripa' && <th>Processing Status</th>}
                        <th>Payment Due Date</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.clientsList || []).map((client) => (
                        <tr key={client.id}>
                          <td>{client.name}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <FiPhone style={{ fontSize: '14px', opacity: 0.6 }} />
                              {client.phone_country_code} {client.phone_number}
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <FiMail style={{ fontSize: '14px', opacity: 0.6 }} />
                              {client.email || '-'}
                            </div>
                          </td>
                          <td>
                            <span className="status-badge" style={{
                              backgroundColor: client.fee_status === 'Payment Pending' ? '#FEE2E2' :
                                client.fee_status === '1st Installment Completed' ? '#D1FAE5' :
                                  client.fee_status === 'PTE Fee Paid' ? '#DBEAFE' : '#F3F4F6',
                              color: client.fee_status === 'Payment Pending' ? '#DC2626' :
                                client.fee_status === '1st Installment Completed' ? '#059669' :
                                  client.fee_status === 'PTE Fee Paid' ? '#2563EB' : '#6B7280',
                              padding: '4px 12px',
                              borderRadius: '12px',
                              fontSize: '12px',
                              fontWeight: 500
                            }}>
                              {client.fee_status || 'Not Set'}
                            </span>
                          </td>
                          <td>{client.amount_paid ? `د.إ ${client.amount_paid}` : '-'}</td>
                          {processingRole === 'kripa' && (
                            <td>
                              <span className="status-badge" style={{
                                backgroundColor: '#E0E7FF',
                                color: '#4338CA',
                                padding: '4px 12px',
                                borderRadius: '12px',
                                fontSize: '12px',
                                fontWeight: 500
                              }}>
                                {client.processing_status || 'In Progress'}
                              </span>
                            </td>
                          )}
                          <td>
                            {client.payment_due_date ? new Date(client.payment_due_date).toLocaleDateString() : '-'}
                          </td>
                          <td>
                            <button
                              className="action-button"
                              onClick={() => navigate(`/clients/${client.id}`)}
                              style={{ padding: '6px 12px', fontSize: '12px' }}
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p style={{ textAlign: 'center', color: '#6B7280', padding: '40px' }}>
                  No clients {processingRole === 'sneha' ? 'assigned' : 'in processing'} yet
                </p>
              )}
            </div>
          </>
        ) : (
          // Regular Staff Dashboard View (NOT Processing Team)
          <>
            {renderStaffMetrics()}
            {renderStatusBreakdown()}
            <div className="recent-leads-section">
              <h2>Assigned Leads</h2>
              {data.leadsList && data.leadsList.length > 0 ? (
                <div className="leads-list-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Phone</th>
                        <th>Email</th>
                        <th>Status</th>
                        <th>Priority</th>
                        <th>Comment</th>
                        <th>Follow-up Date</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.leadsList || []).map((lead) => (
                        <tr key={lead.id}>
                          <td>{lead.name}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <FiPhone style={{ fontSize: '14px', opacity: 0.6 }} />
                              {lead.phone_number}
                            </div>
                          </td>
                          <td>
                            {lead.email ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <FiMail style={{ fontSize: '14px', opacity: 0.6 }} />
                                {lead.email}
                              </div>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td>
                            <span
                              className="status-badge"
                              style={{
                                backgroundColor: `${getStatusColor(lead.status)}20`,
                                color: getStatusColor(lead.status),
                                padding: '4px 12px',
                                borderRadius: '12px',
                                fontSize: '12px',
                                fontWeight: 500,
                              }}
                            >
                              {lead.status}
                            </span>
                          </td>
                          <td>
                            {lead.priority ? (
                              <span
                                className="priority-badge"
                                style={{
                                  backgroundColor: `${getPriorityColor(lead.priority)}20`,
                                  color: getPriorityColor(lead.priority),
                                  padding: '4px 12px',
                                  borderRadius: '12px',
                                  fontSize: '12px',
                                  fontWeight: 500,
                                }}
                              >
                                {formatPriority(lead.priority)}
                              </span>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td>
                            {lead.comment ? (
                              <div style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={lead.comment}>
                                {lead.comment.length > 30 ? `${lead.comment.substring(0, 30)}...` : lead.comment}
                              </div>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td>
                            {lead.follow_up_date ? (
                              new Date(lead.follow_up_date).toLocaleDateString()
                            ) : (
                              '-'
                            )}
                          </td>
                          <td>
                            <button
                              className="btn-view-lead"
                              onClick={() => navigate(`/leads/${lead.id}`)}
                            >
                              <FiEdit2 /> View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p>No leads assigned to this staff member</p>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  // ADMIN Dashboard
  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1 className="dashboard-title">
          {data.role === 'ADMIN' ? 'Company Dashboard' : 'Team Dashboard'}
        </h1>
        {data.role === 'SALES_TEAM_HEAD' && (
          <p style={{
            color: '#6b7280',
            fontSize: '14px',
            marginTop: '8px',
            fontStyle: 'italic'
          }}>
            Monitor and manage your team members' performance
          </p>
        )}
      </div>

      {/* Metrics Overview */}
      <div className="dashboard-section">
        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-icon" style={{ background: '#FFF4D6' }}>
              <FiUsers style={{ color: '#D4AF37' }} />
            </div>
            <div className="metric-content">
              <div className="metric-value">{data.metrics.totalLeads}</div>
              <div className="metric-label">Total Leads</div>
            </div>
          </div>
          {data.metrics.totalClients !== undefined && (
            <div className="metric-card">
              <div className="metric-icon" style={{ background: '#D1FAE5' }}>
                <FiCheck style={{ color: '#10B981' }} />
              </div>
              <div className="metric-content">
                <div className="metric-value">{data.metrics.totalClients}</div>
                <div className="metric-label">Total Clients</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Status Breakdown */}
      <div className="dashboard-section">
        <div className="status-breakdown">
          <h2>Leads by Status</h2>
          <div className="status-grid">
            {Object.entries(data.metrics?.leadsByStatus || {}).map(([status, count]) => (
              <div key={status} className="status-item">
                <span className="status-label">{status}</span>
                <span className="status-count">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Client Metrics */}
      {data.metrics.clientsByStatus && (
        <div className="dashboard-section">
          <div className="status-breakdown">
            <h2>Clients Overview</h2>
            <div className="status-grid">
              {Object.entries(data.metrics?.clientsByStatus || {}).map(([status, count]) => (
                <div key={status} className="status-item">
                  <span className="status-label">{status}</span>
                  <span className="status-count">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Recent Leads */}
      <div className="dashboard-section">
        <div className="recent-leads-section">
          <h2>Recent Leads</h2>
          {data.recentLeads && data.recentLeads.length > 0 ? (
            <div className="leads-list-table">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Priority</th>
                    <th>Assigned To</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.recentLeads || []).map((lead) => (
                    <tr key={lead.id}>
                      <td>{lead.name}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <FiPhone style={{ fontSize: '14px', opacity: 0.6 }} />
                          {lead.phone_country_code && lead.phone_number ? (
                            <span>{lead.phone_country_code} {lead.phone_number}</span>
                          ) : (
                            lead.phone_number || '-'
                          )}
                        </div>
                      </td>
                      <td>
                        {lead.email ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <FiMail style={{ fontSize: '14px', opacity: 0.6 }} />
                            {lead.email}
                          </div>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td>
                        <span
                          className="status-badge"
                          style={{
                            backgroundColor: `${getStatusColor(lead.status)}20`,
                            color: getStatusColor(lead.status),
                            padding: '4px 12px',
                            borderRadius: '12px',
                            fontSize: '12px',
                            fontWeight: 500,
                          }}
                        >
                          {lead.status}
                        </span>
                      </td>
                      <td>
                        {lead.priority ? (
                          <span
                            className="priority-badge"
                            style={{
                              backgroundColor: `${getPriorityColor(lead.priority)}20`,
                              color: getPriorityColor(lead.priority),
                              padding: '4px 12px',
                              borderRadius: '12px',
                              fontSize: '12px',
                              fontWeight: 500,
                            }}
                          >
                            {formatPriority(lead.priority)}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td>
                        <span
                          style={{
                            fontWeight: lead.assigned_staff_name ? 600 : 400,
                            color: lead.assigned_staff_name ? '#8B6914' : '#9ca3af',
                            fontSize: '14px',
                          }}
                        >
                          {lead.assigned_staff_name || 'Unassigned'}
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn-view-lead"
                          onClick={() => navigate(`/leads/${lead.id}`)}
                        >
                          <FiEdit2 /> View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>No leads found</p>
          )}
          <div style={{ marginTop: '16px' }}>
            <button
              className="btn-view-all-leads"
              onClick={() => navigate('/leads')}
            >
              View All Leads
            </button>
          </div>
        </div>
      </div>

      {/* Recent Clients */}
      {data.recentClients && data.recentClients.length > 0 && (
        <div className="dashboard-section">
          <div className="recent-leads-section">
            <h2>Recent Clients</h2>
            <div className="leads-list-table">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Email</th>
                    <th>Fee Status</th>
                    <th>Assigned To</th>
                    <th>Processing</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.recentClients || []).map((client) => (
                    <tr key={client.id}>
                      <td>{client.name}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <FiPhone style={{ fontSize: '14px', opacity: 0.6 }} />
                          {client.phone_country_code && client.phone_number ? (
                            <span>{client.phone_country_code} {client.phone_number}</span>
                          ) : (
                            client.phone_number || '-'
                          )}
                        </div>
                      </td>
                      <td>
                        {client.email ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <FiMail style={{ fontSize: '14px', opacity: 0.6 }} />
                            {client.email}
                          </div>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td>
                        {client.fee_status ? (
                          <span
                            className="status-badge"
                            style={{
                              backgroundColor: client.fee_status === 'Payment Pending' ? '#FEE2E220' : client.fee_status === '1st Installment Completed' ? '#D1FAE520' : '#DBEAFE20',
                              color: client.fee_status === 'Payment Pending' ? '#DC2626' : client.fee_status === '1st Installment Completed' ? '#10B981' : '#2563EB',
                              padding: '4px 12px',
                              borderRadius: '12px',
                              fontSize: '12px',
                              fontWeight: 500,
                            }}
                          >
                            {client.fee_status}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td>
                        <span
                          style={{
                            fontWeight: client.assigned_staff_name ? 600 : 400,
                            color: client.assigned_staff_name ? '#8B6914' : '#9ca3af',
                            fontSize: '14px',
                          }}
                        >
                          {client.assigned_staff_name || 'Unassigned'}
                        </span>
                      </td>
                      <td>
                        <span
                          style={{
                            fontWeight: client.processing_staff_name ? 600 : 400,
                            color: client.processing_staff_name ? '#059669' : '#9ca3af',
                            fontSize: '14px',
                          }}
                        >
                          {client.processing_staff_name || 'Not in Processing'}
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn-view-lead"
                          onClick={() => navigate(`/clients/${client.id}`)}
                        >
                          <FiEdit2 /> View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: '16px' }}>
              <button
                className="btn-view-all-leads"
                onClick={() => navigate('/clients')}
              >
                View All Clients
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Staff/Team Performance */}
      {(data.role === 'ADMIN' || data.role === 'SALES_TEAM_HEAD') && (
        <div className="dashboard-section">
          <div className="staff-performance">
            <h2>{data.role === 'ADMIN' ? 'Staff List' : 'My Team Members'}</h2>
            {data.role === 'SALES_TEAM_HEAD' && (
              <p style={{
                color: '#6b7280',
                fontSize: '13px',
                marginBottom: '16px'
              }}>
                Click on any team member to view their detailed dashboard and monitor their performance
              </p>
            )}
            {data && data.staffPerformance && Array.isArray(data.staffPerformance) && data.staffPerformance.length > 0 ? (
              <div className="performance-table">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Total Leads</th>
                      <th>Converted Clients</th>
                      <th>In Processing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.staffPerformance || []).map((staff) => {
                      // Check if staff is Sneha or Kripa (Processing Team)
                      const isSneha = staff.name === 'Sneha' || staff.name === 'SNEHA' || staff.email === 'sneha@toniosenora.com';
                      const isKripa = staff.name === 'Kripa' || staff.name === 'KRIPA' || staff.email === 'kripa@toniosenora.com';
                      const isProcessingTeam = isSneha || isKripa;
                      // Check if this is the sales team head themselves
                      const isTeamHead = staff.id === user?.id;

                      return (
                        <tr
                          key={staff.id}
                          className="staff-row"
                          role="button"
                          tabIndex={0}
                          onClick={() => navigate(`/dashboard/staff/${staff.id}`)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              navigate(`/dashboard/staff/${staff.id}`);
                            }
                          }}
                          style={{
                            ...(isProcessingTeam ? {
                              background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%)',
                              borderLeft: '4px solid #667eea'
                            } : {}),
                            ...(isTeamHead ? {
                              background: '#FFF4D6',
                              borderLeft: '4px solid #D4AF37',
                              fontWeight: 600
                            } : {}),
                            cursor: 'pointer',
                            transition: 'background-color 0.2s'
                          }}
                          onMouseEnter={(e) => {
                            if (!isProcessingTeam && !isTeamHead) {
                              e.currentTarget.style.backgroundColor = '#F5F1E8';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isProcessingTeam && !isTeamHead) {
                              e.currentTarget.style.backgroundColor = '';
                            }
                          }}
                        >
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span className="staff-link" style={{
                                color: isTeamHead ? '#8B6914' : 'inherit',
                                fontWeight: isTeamHead ? 600 : 'normal'
                              }}>
                                {staff.name}
                                {isTeamHead && ' (You)'}
                              </span>
                              {isProcessingTeam && (
                                <span style={{
                                  padding: '2px 8px',
                                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                  color: '#FFFFFF',
                                  borderRadius: '10px',
                                  fontSize: '10px',
                                  fontWeight: 600,
                                  boxShadow: '0 1px 3px rgba(102, 126, 234, 0.3)'
                                }}>
                                  🔧 Processing
                                </span>
                              )}
                              {data.role === 'SALES_TEAM_HEAD' && !isTeamHead && (
                                <span style={{
                                  padding: '2px 8px',
                                  background: '#E0E7FF',
                                  color: '#4338CA',
                                  borderRadius: '10px',
                                  fontSize: '10px',
                                  fontWeight: 500
                                }}>
                                  Team Member
                                </span>
                              )}
                            </div>
                          </td>
                          <td>{staff.total_leads}</td>
                          <td>{staff.converted_leads || 0}</td>
                          <td>{staff.clients_in_processing || 0}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280' }}>
                <p>No staff performance data available</p>
                {data && data.role === 'SALES_TEAM_HEAD' && (
                  <div style={{ fontSize: '12px', marginTop: '8px', fontStyle: 'italic', textAlign: 'left', background: '#f5f5f5', padding: '10px', borderRadius: '4px', maxWidth: '600px', margin: '10px auto' }}>
                    <p><strong>Debug Information:</strong></p>
                    <p>staffPerformance exists: {data.staffPerformance ? 'Yes' : 'No'}</p>
                    <p>staffPerformance type: {data.staffPerformance ? typeof data.staffPerformance : 'N/A'}</p>
                    <p>staffPerformance isArray: {data.staffPerformance ? Array.isArray(data.staffPerformance) ? 'Yes' : 'No' : 'N/A'}</p>
                    <p>staffPerformance length: {data.staffPerformance && Array.isArray(data.staffPerformance) ? data.staffPerformance.length : 'N/A'}</p>
                    {data.staffPerformance && Array.isArray(data.staffPerformance) && data.staffPerformance.length > 0 && (
                      <div style={{ marginTop: '10px' }}>
                        <p><strong>Staff Members Found ({data.staffPerformance.length}):</strong></p>
                        <ul style={{ marginLeft: '20px', textAlign: 'left' }}>
                          {data.staffPerformance.map((staff, idx) => (
                            <li key={idx}>{staff.name} (ID: {staff.id}, Leads: {staff.total_leads}, Clients: {staff.converted_leads || 0})</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const getStatusColor = (status) => {
  const colors = {
    'New': '#D4AF37',
    'Follow-up': '#C9A961',
    'Prospect': '#B8860B',
    'Pending Lead': '#8B6914',
    'Closed / Rejected': '#A0826D',
  };
  return colors[status] || '#8B6914';
};

const getPriorityColor = (priority) => {
  const colors = {
    'hot': '#ef4444',
    'warm': '#f59e0b',
    'cold': '#3b82f6',
    'not interested': '#6b7280',
    'not eligible': '#dc2626',
  };
  return colors[priority] || '#6b7280';
};

const formatPriority = (priority) => {
  if (!priority) return '-';
  return priority.split(' ').map(word =>
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
};

export default Dashboard;
