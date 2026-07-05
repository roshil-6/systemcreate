import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import GoldenLinesBackground from './GoldenLinesBackground';
import Notifications from './Notifications';
import './Layout.css';
import { FiHome, FiUsers, FiClock, FiPlus, FiLogOut, FiSettings, FiUpload, FiMail, FiFileText, FiBriefcase } from 'react-icons/fi';

const MY_WORK_DASHBOARD_EMAILS = ['sreelakshmi@toniosenora.com'];

const SALES_LIKE_ROLES = ['STAFF', 'SALES_TEAM', 'PROCESSING'];

const Layout = ({ children }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const roleUpper = (user?.role || '').toUpperCase();
  const isHrUser = roleUpper === 'HR';
  const myStaffDash =
    user?.id != null && user.id !== '' ? `/dashboard/staff/${String(user.id)}` : null;
  const isMyStaffDashActive =
    myStaffDash &&
    (location.pathname === myStaffDash || location.pathname.startsWith(`${myStaffDash}/`));
  const showStaffDashboardLink =
    myStaffDash && (isHrUser || SALES_LIKE_ROLES.includes(roleUpper));

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleCreateLead = () => {
    if (location.pathname.startsWith('/hr')) {
      navigate('/hr/staff?create=true');
    } else {
      navigate('/leads/new');
    }
  };

  const isActive = (path) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  const isLeadsListPage = location.pathname === '/leads';
  const leadsUrlParams = new URLSearchParams(location.search || '');
  const leadsAssignedFromUrl = isLeadsListPage ? leadsUrlParams.get('assigned_staff_id') : null;
  const isLeadDetailOrNew =
    /^\/leads\/(?:new|\d+)\/?$/.test(location.pathname);
  const isLeadsImportRoute = location.pathname.startsWith('/leads/import');

  const hrMyLeadsNavActive =
    isHrUser &&
    user?.id != null &&
    !isLeadsImportRoute &&
    ((isLeadsListPage &&
      leadsAssignedFromUrl != null &&
      String(leadsAssignedFromUrl) === String(user.id)) ||
      isLeadDetailOrNew);

  return (
    <div className="layout">
      <GoldenLinesBackground />
      <aside className="sidebar">
        <div className="sidebar-header">
          <img
            src="/logo.png"
            alt="Tonio & Senora"
            className="sidebar-logo"
          />
          <p className="sidebar-subtitle">CRM System</p>
        </div>
        <nav className="sidebar-nav">
          {isHrUser ? (
            <>
              <div className="sidebar-nav-section">
                <p className="sidebar-nav-section-title">Sales & CRM</p>
                {myStaffDash && (
                  <Link
                    to={myStaffDash}
                    className={`nav-item ${isMyStaffDashActive ? 'active' : ''}`}
                    aria-current={isMyStaffDashActive ? 'page' : undefined}
                    title="Your sales dashboard: metrics, follow-ups, and assigned leads"
                  >
                    <FiHome className="nav-icon" />
                    <span>Dashboard</span>
                  </Link>
                )}
                {user?.id != null && (
                  <Link
                    to={`/leads?assigned_staff_id=${String(user.id)}`}
                    className={`nav-item ${hrMyLeadsNavActive ? 'active' : ''}`}
                    aria-current={hrMyLeadsNavActive ? 'page' : undefined}
                    title="Leads assigned to you"
                  >
                    <FiBriefcase className="nav-icon" />
                    <span>My Leads</span>
                  </Link>
                )}
                <Link
                  to="/clients"
                  className={`nav-item ${isActive('/clients') ? 'active' : ''}`}
                  aria-current={isActive('/clients') ? 'page' : undefined}
                >
                  <FiUsers className="nav-icon" />
                  <span>Clients</span>
                </Link>
                <Link
                  to="/hr"
                  className={`nav-item ${location.pathname === '/hr' ? 'active' : ''}`}
                  aria-current={location.pathname === '/hr' ? 'page' : undefined}
                  title="Team stats and milestones"
                >
                  <FiFileText className="nav-icon" />
                  <span>Overview</span>
                </Link>
                <Link
                  to="/hr/staff"
                  className={`nav-item ${isActive('/hr/staff') ? 'active' : ''}`}
                  aria-current={isActive('/hr/staff') ? 'page' : undefined}
                >
                  <FiUsers className="nav-icon" />
                  <span>Staff Directory</span>
                </Link>
                <Link
                  to="/leads/import"
                  className={`nav-item ${isActive('/leads/import') ? 'active' : ''}`}
                  aria-current={isActive('/leads/import') ? 'page' : undefined}
                >
                  <FiUpload className="nav-icon" />
                  <span>Import & Export</span>
                </Link>
                <Link
                  to="/attendance"
                  className={`nav-item ${isActive('/attendance') ? 'active' : ''}`}
                  aria-current={isActive('/attendance') ? 'page' : undefined}
                >
                  <FiClock className="nav-icon" />
                  <span>Attendance</span>
                </Link>
                <Link
                  to="/users"
                  className={`nav-item ${isActive('/users') ? 'active' : ''}`}
                  aria-current={isActive('/users') ? 'page' : undefined}
                >
                  <FiSettings className="nav-icon" />
                  <span>User Management</span>
                </Link>
                <Link
                  to="/email-templates"
                  className={`nav-item ${isActive('/email-templates') ? 'active' : ''}`}
                  aria-current={isActive('/email-templates') ? 'page' : undefined}
                >
                  <FiMail className="nav-icon" />
                  <span>Email Templates</span>
                </Link>
              </div>
            </>
          ) : (
            <>
              <Link
                to="/"
                className={`nav-item ${isActive('/') && location.pathname === '/' ? 'active' : ''}`}
                aria-current={isActive('/') && location.pathname === '/' ? 'page' : undefined}
              >
                <FiHome className="nav-icon" />
                <span>Dashboard</span>
              </Link>

              {showStaffDashboardLink && (
                <Link
                  to={myStaffDash}
                  className={`nav-item ${isMyStaffDashActive ? 'active' : ''}`}
                  aria-current={isMyStaffDashActive ? 'page' : undefined}
                >
                  <FiHome className="nav-icon" />
                  <span>My Dashboard</span>
                </Link>
              )}

              {user?.id && MY_WORK_DASHBOARD_EMAILS.includes((user.email || '').toLowerCase()) && (
                <Link
                  to={`/dashboard/staff/${user.id}`}
                  className={`nav-item ${location.pathname.startsWith('/dashboard/staff') ? 'active' : ''}`}
                  aria-current={location.pathname.startsWith('/dashboard/staff') ? 'page' : undefined}
                >
                  <FiBriefcase className="nav-icon" />
                  <span>My work</span>
                </Link>
              )}

              <Link
                to="/leads"
                className={`nav-item ${isActive('/leads') ? 'active' : ''}`}
                aria-current={isActive('/leads') ? 'page' : undefined}
              >
                <FiUsers className="nav-icon" />
                <span>Leads</span>
              </Link>

              <Link
                to="/clients"
                className={`nav-item ${isActive('/clients') ? 'active' : ''}`}
                aria-current={isActive('/clients') ? 'page' : undefined}
              >
                <FiUsers className="nav-icon" />
                <span>Clients</span>
              </Link>

              {(user?.role === 'ADMIN' ||
                user?.role === 'SALES_TEAM_HEAD' ||
                user?.role === 'SALES_TEAM' ||
                user?.role === 'PROCESSING' ||
                user?.role === 'STAFF' ||
                user?.role === 'HR') && (
                <Link
                  to="/leads/import"
                  className={`nav-item ${isActive('/leads/import') ? 'active' : ''}`}
                  aria-current={isActive('/leads/import') ? 'page' : undefined}
                >
                  <FiUpload className="nav-icon" />
                  <span>Import & Export</span>
                </Link>
              )}
              {(user?.role === 'ADMIN' ||
                user?.role === 'HR' ||
                user?.role === 'SALES_TEAM_HEAD' ||
                user?.role === 'SALES_TEAM' ||
                user?.role === 'PROCESSING' ||
                user?.role === 'STAFF') && (
                <Link
                  to="/attendance"
                  className={`nav-item ${isActive('/attendance') ? 'active' : ''}`}
                  aria-current={isActive('/attendance') ? 'page' : undefined}
                >
                  <FiClock className="nav-icon" />
                  <span>Attendance</span>
                </Link>
              )}
              {user?.role === 'ADMIN' && (
                <Link
                  to="/users"
                  className={`nav-item ${isActive('/users') ? 'active' : ''}`}
                  aria-current={isActive('/users') ? 'page' : undefined}
                >
                  <FiSettings className="nav-icon" />
                  <span>User Management</span>
                </Link>
              )}
              {user?.role === 'ADMIN' && (
                <Link
                  to="/email-templates"
                  className={`nav-item ${isActive('/email-templates') ? 'active' : ''}`}
                  aria-current={isActive('/email-templates') ? 'page' : undefined}
                >
                  <FiMail className="nav-icon" />
                  <span>Email Templates</span>
                </Link>
              )}
            </>
          )}
        </nav>
      </aside>
      <div className="main-content">
        <header className="top-bar">
          <div className="top-bar-actions">
            <button onClick={handleCreateLead} className="btn-create-lead">
              <FiPlus /> {location.pathname.startsWith('/hr') ? 'Create New Staff' : 'Create New Lead'}
            </button>
            <Notifications />
            <div className="user-info">
              <span className="user-name">{user?.name}</span>
              <span className="user-role">{user?.role}</span>
            </div>
            <button onClick={handleLogout} className="btn-logout" title="Logout">
              <FiLogOut />
            </button>
          </div>
        </header>
        <main className="content-area">{children}</main>
      </div>
    </div>
  );
};

export default Layout;
