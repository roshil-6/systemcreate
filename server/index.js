const express = require('express');
console.log('🚀 CRM Server: Starting initialization...');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const leadsRoutes = require('./routes/leads');
const clientsRoutes = require('./routes/clients');
const attendanceRoutes = require('./routes/attendance');
const usersRoutes = require('./routes/users');
const notificationsRoutes = require('./routes/notifications');
const emailTemplatesRoutes = require('./routes/emailTemplates');
const db = require('./config/database');
const { startEmailScheduler } = require('./services/emailScheduler');
const fixCompletedActionsType = require('./scripts/fixCompletedActionsType');

const app = express();
const PORT = process.env.PORT || 5002;

// Middleware
const allowedOrigins = [
  'https://systemcreate.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || origin.includes('vercel.app')) {
      return callback(null, true);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'Pragma', 'Expires']
}));

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});
app.use(express.json());

// Test database connection and run migrations with retry
(async () => {
  const maxRetries = 5;
  let retries = 0;

  while (retries < maxRetries) {
    try {
      // Run schema fix for completed_actions
      await fixCompletedActionsType();

      await db.getUsers();
      console.log('✅ PostgreSQL database connected successfully');
      console.log(`📡 Database: ${process.env.DATABASE_URL ? 'Connected' : 'DATABASE_URL not set'}`);
      return; // Success, exit IIFE
    } catch (err) {
      retries++;
      console.error(`❌ Database attempt ${retries} failed:`, err.message);
      if (retries < maxRetries) {
        console.log(`🔄 Retrying in 10 seconds (allowing more time for DB wakeup)...`);
        await new Promise(resolve => setTimeout(resolve, 10000));
      } else {
        console.error('❌ Max retries reached. Database initialization failed.');
      }
    }
  }
})();

// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'Tonio & Senora CRM API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      dashboard: '/api/dashboard',
      leads: '/api/leads',
      clients: '/api/clients',
      attendance: '/api/attendance',
      users: '/api/users',
      notifications: '/api/notifications',
      emailTemplates: '/api/email-templates'
    },
    documentation: 'See README.md for API documentation'
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/email-templates', emailTemplatesRoutes);

// Health check
app.get('/api/health', async (req, res) => {
  try {
    await db.getUsers();
    res.json({ status: 'ok', database: 'connected', type: 'PostgreSQL' });
  } catch (error) {
    res.status(503).json({ status: 'error', database: 'disconnected', error: error.message });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// Output scheduler status
console.log('   Email scheduler initialized');

// Start server if run directly (Render / Local)
// Vercel imports this file, so this block won't run there
if (require.main === module || process.env.RENDER || process.env.NODE_ENV === 'production') {
  console.log(`📡 Attempting to listen on port ${PORT}...`);
  app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);

    // Start scheduler only if not in a serverless-like environment that might kill it
    try {
      startEmailScheduler();
    } catch (e) {
      console.error('❌ Failed to start scheduler:', e.message);
    }
  });
}

module.exports = app;
