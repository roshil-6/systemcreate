// API Base URL - uses environment variable in production, localhost in development
// API Base URL - Configurable for DevOps/Hosting
// For Vercel Monorepo, use relative path '/api' to hit the serverless functions
const API_BASE_URL = process.env.REACT_APP_API_URL ||
  (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5002');

// Debug: Log API URL on load
console.log('🔍 API Configuration:', {
  API_BASE_URL,
  NODE_ENV: process.env.NODE_ENV,
  REACT_APP_API_URL: process.env.REACT_APP_API_URL,
});

export default API_BASE_URL;
