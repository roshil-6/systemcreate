/**
 * API origin:
 * - Local dev → Express on :5005
 * - *.vercel.app (or REACT_APP_USE_RELATIVE_API) → empty string = same-origin; Vercel rewrites proxy to Render (no CORS)
 * - Else (e.g. GitHub Pages) → direct Render URL (server must allow CORS for that origin)
 */
const hostname =
  typeof window !== 'undefined' && window.location?.hostname ? window.location.hostname : '';

const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
const isVercel =
  hostname === 'vercel.app' ||
  hostname.endsWith('.vercel.app') ||
  process.env.REACT_APP_USE_RELATIVE_API === 'true';

let API_BASE_URL = 'https://crm-2b00.onrender.com';
if (isLocal) {
  API_BASE_URL = 'http://localhost:5005';
} else if (isVercel) {
  API_BASE_URL = '';
} else if (process.env.REACT_APP_API_URL) {
  API_BASE_URL = process.env.REACT_APP_API_URL;
}

// Runtime safety: stale builds or mis-env can leave Render URL while on *.vercel.app → forces same-origin proxy.
if (typeof window !== 'undefined') {
  const h = window.location.hostname || '';
  const onVercelHost = h === 'vercel.app' || h.endsWith('.vercel.app');
  if (onVercelHost && API_BASE_URL.includes('onrender.com')) {
    API_BASE_URL = '';
  }
}

console.log('📡 CRM API: Using base URL:', API_BASE_URL || '(same-origin / proxied)', '| host:', typeof window !== 'undefined' ? window.location.hostname : '(ssr)');

export default API_BASE_URL;
