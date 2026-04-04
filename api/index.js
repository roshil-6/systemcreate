/**
 * Vercel Serverless Functions entry — must live under /api.
 * Express app is exported from server/index.js (no listen when VERCEL=1).
 */
const app = require('../server/index.js');

module.exports = app;
