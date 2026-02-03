const jwt = require('jsonwebtoken');
const db = require('../config/database');

// Verify JWT token
const authenticate = async (req, res, next) => {
  try {
    // Handle case-insensitive header names
    const authHeader = req.headers.authorization || req.headers.Authorization;
    
    if (!authHeader) {
      console.error('❌ Auth: No authorization header found');
      console.error('   Available headers:', Object.keys(req.headers));
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Extract token from "Bearer <token>" format
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      console.error('❌ Auth: Invalid authorization header format');
      console.error('   Header:', authHeader.substring(0, 20) + '...');
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = parts[1];
    if (!token) {
      console.error('❌ Auth: Token is empty');
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Verify user still exists
    const users = await db.getUsers({ id: decoded.userId });
    const user = users[0];
    
    if (!user) {
      console.error('❌ Auth: User not found for userId:', decoded.userId);
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('❌ Auth error:', error.message);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// Check if user is ADMIN
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Check if user is STAFF
const requireStaff = (req, res, next) => {
  if (req.user.role !== 'STAFF') {
    return res.status(403).json({ error: 'Staff access required' });
  }
  next();
};

// Check if user is ADMIN or SALES_TEAM_ADMIN
const requireAdminOrSalesTeamAdmin = (req, res, next) => {
  if (req.user.role !== 'ADMIN' && req.user.role !== 'SALES_TEAM_ADMIN') {
    return res.status(403).json({ error: 'Admin or Sales Team Admin access required' });
  }
  next();
};

module.exports = {
  authenticate,
  requireAdmin,
  requireStaff,
  requireAdminOrSalesTeamAdmin,
};
