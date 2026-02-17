import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Login.css';

import API_BASE_URL from '../config/api';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(email, password);

    if (result.success) {
      if (result.user.role === 'HR') {
        navigate('/hr');
      } else {
        navigate('/');
      }
    } else {
      setError(result.error);
    }

    setLoading(false);
  };

  const [serverStatus, setServerStatus] = useState('checking'); // checking, online, offline

  // Wake up the server on load with polling
  React.useEffect(() => {
    let isMounted = true;
    const wakeUpServer = async () => {
      let attempts = 0;
      const maxAttempts = 30; // Try for ~1 minute (30 * 2s)

      while (attempts < maxAttempts && isMounted) {
        try {
          console.log(`⏰ Waking up server... (Attempt ${attempts + 1}/${maxAttempts})`);
          // Standard fetch to check status (NOT no-cors, so we can see 503)
          const response = await fetch(`${API_BASE_URL}/health`);

          if (response.ok) {
            console.log('✅ Server is awake and healthy!');
            if (isMounted) setServerStatus('online');
            return;
          } else if (response.status === 503) {
            console.log('💤 Server is starting up (503)... retrying in 2s');
          } else {
            // 4xx or 5xx other than 503 usually means server is reachable but maybe endpoint has issues
            console.log(`⚠️ Server reachable but returned ${response.status}`);
            if (isMounted) setServerStatus('online'); // Technically online
            return;
          }
        } catch (err) {
          console.log('❌ Network error (server might be down/sleeping)... retrying in 2s', err.message);
        }

        attempts++;
        // Wait 2 seconds before next try
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      if (isMounted) setServerStatus('offline');
    };

    wakeUpServer();

    return () => { isMounted = false; };
  }, []);

  return (
    <div className="login-container">
      <div className="login-card">
        {serverStatus === 'checking' && (
          <div style={{ padding: '10px', background: '#e3f2fd', color: '#0d47a1', borderRadius: '4px', marginBottom: '15px', fontSize: '14px', textAlign: 'center' }}>
            ⏳ Connecting to server... (might take 30s)
          </div>
        )}
        <div className="login-header">
          <h1>Tonio & Senora</h1>
          <p>CRM System</p>
        </div>
        <form onSubmit={handleSubmit} className="login-form">
          {error && <div className="error-message">{error}</div>}
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="Enter your email"
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Enter your password"
            />
          </div>
          <button type="submit" disabled={loading} className="login-button">
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
