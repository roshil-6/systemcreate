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
      navigate('/');
    } else {
      setError(result.error);
    }

    setLoading(false);
  };

  const [serverStatus, setServerStatus] = useState('checking'); // checking, online, offline

  // Wake up the server on load
  React.useEffect(() => {
    const wakeUpServer = async () => {
      try {
        console.log('⏰ Waking up server...');
        // Simple ping to wake up Render
        await fetch(`${API_BASE_URL}/api/auth/me`, { mode: 'no-cors' });
        setServerStatus('online');
        console.log('✅ Server is awake!');
      } catch (err) {
        console.log('💤 Server might be sleeping...', err);
        setServerStatus('offline');
      }
    };
    wakeUpServer();
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
          <button type="submit" className="btn-login" disabled={loading}>
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
