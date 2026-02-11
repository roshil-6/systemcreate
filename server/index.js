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

// Function for database initialization
async function initializeDatabase() {
  const maxRetries = 5;
  let retries = 0;

  while (retries < maxRetries) {
    try {
      console.log(`🔧 Database attempt ${retries + 1}/${maxRetries}: Initializing...`);
      // Run schema fix for completed_actions
      await fixCompletedActionsType();

      // Check connectivity using the resilient query function
      await db.getUsers({}, { retries: 3 });
      console.log('✅ PostgreSQL database connected and schema verified');
      return true;
    } catch (err) {
      retries++;
      console.error(`❌ Database attempt ${retries} failed:`, err.message);
      if (retries < maxRetries) {
        const delay = 10000;
        console.log(`🔄 Retrying in ${delay / 1000} seconds (allowing time for DB wakeup)...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error('❌ Max retries reached. Database initialization failed.');
        return false;
      }
    }
  }
}

// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'Tonio & Senora CRM API',
    version: '1.0.1',
    status: 'running',
    endpoints: {
      health: '/health',
      auth: '/api/auth',
      dashboard: '/api/dashboard',
      leads: '/api/leads',
      clients: '/api/clients',
      attendance: '/api/attendance',
      users: '/api/users',
      notifications: '/api/notifications',
      emailTemplates: '/api/email-templates'
    }
  });
});

// Primary Routes
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/email-templates', emailTemplatesRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(err.status || 500).json({
    error: 'Internal server error',
    message: err.message,
    details: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Start server if run directly (Render / Local)
if (require.main === module || process.env.RENDER || process.env.NODE_ENV === 'production') {
  console.log(`📡 Preparing to start server on port ${PORT}...`);

  initializeDatabase().then((success) => {
    if (!success && process.env.NODE_ENV === 'production') {
      console.error('🛑 CRITICAL: Database failed to initialize. Starting server in degraded mode.');
    }

    app.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`   Health Check: /health`);

      // Start scheduler only if not in a serverless-like environment
      try {
        startEmailScheduler();
      } catch (e) {
        console.error('❌ Failed to start scheduler:', e.message);
      }
    });
  }).catch(err => {
    console.error('🛑 FATAL: Unexpected error during startup:', err);
    process.exit(1);
  });
}

module.exports = app;
