const express = require('express');
console.log('🚀 CRM Server: Starting initialization...');
const cors = require('cors');
require('dotenv').config();

const dns = require('dns');
// Force IPv4 first to avoid Railway/Render connection timeouts (fixes "timeout exceeded")
console.log('📡 Network: Forcing IPv4 preference...');
dns.setDefaultResultOrder('ipv4first');

const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const leadsRoutes = require('./routes/leads');
const clientsRoutes = require('./routes/clients');
const attendanceRoutes = require('./routes/attendance');
const usersRoutes = require('./routes/users');
const notificationsRoutes = require('./routes/notifications');
const emailTemplatesRoutes = require('./routes/emailTemplates');
const hrRoutes = require('./routes/hr');
const db = require('./config/database');
const { startEmailScheduler } = require('./services/emailScheduler');
const fixCompletedActionsType = require('./scripts/fixCompletedActionsType');

const app = express();
const PORT = process.env.PORT || 5005;

// --- READINESS STATE ---
let isDatabaseReady = false;

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

// --- READINESS GATEKEEPER ---
// Prevent DB queries from being fired before the pool is stabilized
app.use((req, res, next) => {
  if (req.path.startsWith('/api/') && !isDatabaseReady) {
    console.warn(`🛡️ Gatekeeper: Blocked ${req.method} ${req.path} (Database still warming up)`);
    return res.status(503).json({
      error: 'Backend is starting up',
      message: 'The database is still connecting. Please wait 10-20 seconds and refresh.'
    });
  }
  next();
});

// Essential health check (Database-less)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'CRM API',
    timestamp: new Date().toISOString()
  });
});

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
      emailTemplates: '/api/email-templates',
      hr: '/api/hr'
    }
  });
});

app.use(express.json());

// Primary Routes
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/email-templates', emailTemplatesRoutes);
app.use('/api/hr', hrRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(err.status || 500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// Function for database initialization (Background)
async function initializeDatabase() {
  const maxRetries = 10;
  let retries = 0;

  console.log('🔄 Background Database initialization started...');

  while (retries < maxRetries) {
    try {
      // Run schema fix for completed_actions
      await fixCompletedActionsType();

      // Check connectivity using the resilient query function
      // Force a query to ensure the pool can actually talk to the DB
      await db.getUsers({}, { retries: 5 });

      console.log('✅ PostgreSQL database connected and schema verified');
      isDatabaseReady = true; // <--- UNLOCK THE GATEKEEPER
      return;
    } catch (err) {
      retries++;
      console.error(`❌ Background DB initialization attempt ${retries} failed:`, err.message);
      if (retries < maxRetries) {
        // Progressive backoff: 5s, 10s, 15s...
        const delay = Math.min(5000 * retries, 30000);
        console.log(`🔄 Retrying DB connection in ${Math.round(delay / 1000)} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error('🛑 CRITICAL: Database failed to initialize after 10 attempts.');
      }
    }
  }
}

// Start server if run directly (Render / Local)
if (require.main === module || process.env.RENDER || process.env.NODE_ENV === 'production') {
  console.log(`📡 Attempting to listen on port ${PORT}...`);

  // Bind to port IMMEDIATELY. Render requires this to consider the app "Live".
  const server = app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`   Health Check: /health`);

    // Run connection logic in the background so it doesn't block Port Binding
    initializeDatabase();

    // Start scheduler
    try {
      startEmailScheduler();
    } catch (e) {
      console.error('❌ Failed to start scheduler:', e.message);
    }
  });

  server.on('error', (err) => {
    console.error('🛑 Server failed to start:', err.message);
    process.exit(1);
  });
}

// --- GLOBAL ERROR HANDLERS ---
process.on('uncaughtException', (err) => {
  console.error('❌ UNCAUGHT EXCEPTION! Shutting down...', err);
  console.error(err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('❌ UNHANDLED REJECTION! Shutting down...', err);
  console.error(err.stack);
  process.exit(1);
});

// --- GRACEFUL SHUTDOWN ---
const gracefulShutdown = async () => {
  console.log('🛑 SIGTERM/SIGINT received. Shutting down gracefully...');
  try {
    if (db.end) {
      await db.end();
      console.log('✅ Database pool closed.');
    }
    process.exit(0);
  } catch (err) {
    console.error('❌ Error during shutdown:', err);
    process.exit(1);
  }
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

module.exports = app;
