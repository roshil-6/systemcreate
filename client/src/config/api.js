// API Base URL - uses environment-based logic to switch between local and production
const API_BASE_URL = (process.env.NODE_ENV === 'production' || window.location.hostname !== 'localhost')
    ? 'https://crm-2b00.onrender.com'
    : 'http://localhost:5005';

console.log('📡 CRM API: Using base URL:', API_BASE_URL);

export default API_BASE_URL;
