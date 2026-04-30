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
  /** Optimistic UI: no blocking banner; wake Render in background */
  const [serverUnreachable, setServerUnreachable] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    let cancelled = false;
    const wakeUpServer = async () => {
      const maxAttempts = 12;
      const delayMs = 2500;

      for (let attempt = 0; attempt < maxAttempts && !cancelled; attempt++) {
        try {
          try {
            await fetch(`${API_BASE_URL}/health`, { method: 'GET', mode: 'no-cors', cache: 'no-store' });
          } catch (_) {
            /* ignore */
          }
          await new Promise((r) => setTimeout(r, 400));

          const response = await fetch(`${API_BASE_URL}/health`, {
            method: 'GET',
            cache: 'no-store',
            credentials: 'omit',
          });

          if (response.ok || response.status !== 503) {
            return;
          }
        } catch (_) {
          /* still waking */
        }
        await new Promise((r) => setTimeout(r, delayMs));
      }
      if (!cancelled) setServerUnreachable(true);
    };

    void wakeUpServer();
    return () => {
      cancelled = true;
    };
  }, []);

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

  return (
    <div className="login-container">
      <div className="login-card">
        {serverUnreachable && (
          <div
            style={{
              padding: '10px 12px',
              background: '#fffbeb',
              color: '#92400e',
              borderRadius: '8px',
              marginBottom: '14px',
              fontSize: '13px',
              textAlign: 'center',
              border: '1px solid #fcd34d',
            }}
          >
            Could not reach the API yet (host may be waking). You can still try logging in—wait a few seconds and submit again if it fails.
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
