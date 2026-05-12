import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const RoleRoute = ({ children, allowedRoles }) => {
    const { user, loading } = useAuth();

    if (loading) {
        return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    // Normalize roles for comparison
    const userRole = user.role ? user.role.toUpperCase() : '';
    const validRoles = allowedRoles.map(role => role.toUpperCase());

    if (validRoles.includes(userRole)) {
        return children;
    }

    // Redirect logic if role is not allowed
    if (userRole === 'HR') {
        // HR users should go to their staff dashboard
        return <Navigate to={`/dashboard/staff/${user.id}`} replace />;
    } else {
        // Non-HR users trying to access unauthorized pages go to /
        return <Navigate to="/" replace />;
    }
};

export default RoleRoute;
