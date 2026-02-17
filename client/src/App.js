import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Leads from './pages/Leads';
import LeadDetail from './pages/LeadDetail';
import Clients from './pages/Clients';
import Attendance from './pages/Attendance';
import UserManagement from './pages/UserManagement';
import BulkImport from './pages/BulkImport';
import EmailTemplates from './pages/EmailTemplates';
import PrivateRoute from './components/PrivateRoute';
import Layout from './components/Layout';
import StaffList from './pages/HR/StaffList';
import StaffDocumentView from './pages/HR/StaffDocumentView';
import RoleRoute from './components/RoleRoute';

// Layout wrapper for convenience
const AppLayout = ({ children }) => (
  <Layout>{children}</Layout>
);

// Roles who can access the main dashboard and operational pages
const DASHBOARD_ROLES = ['ADMIN', 'SALES_TEAM_HEAD', 'SALES_TEAM', 'PROCESSING', 'STAFF'];
// Roles who can access HR section
const HR_ROLES = ['HR', 'ADMIN'];

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />

          {/* Dashboard - Protected from HR */}
          <Route
            path="/"
            element={
              <PrivateRoute>
                <RoleRoute allowedRoles={DASHBOARD_ROLES}>
                  <AppLayout>
                    <Dashboard />
                  </AppLayout>
                </RoleRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/dashboard/staff/:staffId"
            element={
              <PrivateRoute>
                <RoleRoute allowedRoles={DASHBOARD_ROLES}>
                  <AppLayout>
                    <Dashboard />
                  </AppLayout>
                </RoleRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/leads"
            element={
              <PrivateRoute>
                <RoleRoute allowedRoles={DASHBOARD_ROLES}>
                  <AppLayout>
                    <Leads />
                  </AppLayout>
                </RoleRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/leads/:id"
            element={
              <PrivateRoute>
                <RoleRoute allowedRoles={DASHBOARD_ROLES}>
                  <AppLayout>
                    <LeadDetail />
                  </AppLayout>
                </RoleRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/clients"
            element={
              <PrivateRoute>
                <RoleRoute allowedRoles={DASHBOARD_ROLES}>
                  <AppLayout>
                    <Clients />
                  </AppLayout>
                </RoleRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/clients/:id"
            element={
              <PrivateRoute>
                <RoleRoute allowedRoles={DASHBOARD_ROLES}>
                  <AppLayout>
                    <Clients />
                  </AppLayout>
                </RoleRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/attendance"
            element={
              <PrivateRoute>
                <RoleRoute allowedRoles={DASHBOARD_ROLES}>
                  <AppLayout>
                    <Attendance />
                  </AppLayout>
                </RoleRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/users"
            element={
              <PrivateRoute>
                <RoleRoute allowedRoles={['ADMIN']}>
                  <AppLayout>
                    <UserManagement />
                  </AppLayout>
                </RoleRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/leads/import"
            element={
              <PrivateRoute>
                <RoleRoute allowedRoles={DASHBOARD_ROLES}>
                  <AppLayout>
                    <BulkImport />
                  </AppLayout>
                </RoleRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/email-templates"
            element={
              <PrivateRoute>
                <RoleRoute allowedRoles={['ADMIN']}>
                  <AppLayout>
                    <EmailTemplates />
                  </AppLayout>
                </RoleRoute>
              </PrivateRoute>
            }
          />

          {/* HR Section - Protected from regular Staff */}
          <Route
            path="/hr"
            element={
              <PrivateRoute>
                <RoleRoute allowedRoles={HR_ROLES}>
                  <AppLayout>
                    <StaffList />
                  </AppLayout>
                </RoleRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/hr/staff/:id"
            element={
              <PrivateRoute>
                <RoleRoute allowedRoles={HR_ROLES}>
                  <AppLayout>
                    <StaffDocumentView />
                  </AppLayout>
                </RoleRoute>
              </PrivateRoute>
            }
          />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
