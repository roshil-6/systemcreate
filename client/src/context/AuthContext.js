import React, { createContext, useState, useEffect } from 'react';
import axios from 'axios';
import API_BASE_URL from '../config/api';

const BASE_URL = API_BASE_URL;

const AuthContext = createContext();

// Global request interceptor — reads token fresh from localStorage on every request.
// Trims token (avoids JWT verify failures from stray whitespace/newlines).
// Sets Authorization in both forms for Axios v1 AxiosHeaders compatibility.
function attachAuthHeader(config) {
  const raw = localStorage.getItem('token');
  const token = raw ? String(raw).trim() : '';
  if (!token) return config;
  const value = `Bearer ${token}`;
  if (!config.headers) {
    config.headers = {};
  }
  if (typeof config.headers.set === 'function') {
    config.headers.set('Authorization', value);
  } else {
    config.headers.Authorization = value;
    config.headers['Authorization'] = value;
  }
  return config;
}

axios.interceptors.request.use(
  (config) => attachAuthHeader(config),
  (error) => Promise.reject(error)
);

// On 401, clear stale token so user can re-login (expired JWT, rotated secret, etc.)
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    if (status === 401) {
      const url = error.config?.url || '';
      const isLogin = url.includes('/api/auth/login');
      if (!isLogin) {
        localStorage.removeItem('token');
        if (!window.location.pathname.startsWith('/login')) {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      fetchUser();
    } else {
      setLoading(false);
    }
  }, []);

  const fetchUser = async () => {
    let retries = 0;
    const maxRetries = 5;

    while (retries < maxRetries) {
      try {
        const response = await axios.get(`${BASE_URL}/api/auth/me`);
        if (response.data) {
          setUser(response.data);
          setLoading(false);
          return;
        }
      } catch (error) {
        // If 503 or Network Error, retry
        const isRetryable = !error.response || error.response.status === 503 || error.response.status === 502;

        if (isRetryable && retries < maxRetries - 1) {
          console.log(`🔄 Server possibly waking up (${error.response ? error.response.status : 'Network Error'})... retrying auth check (${retries + 1}/${maxRetries})`);
          retries++;
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }

        // If generic error or 401/403, clear the stored token and log out
        console.error('Error fetching user:', error);
        localStorage.removeItem('token');
        setUser(null);
        setLoading(false);
        return;
      }
    }
  };

  const login = async (email, password) => {
    try {
      const loginUrl = `${BASE_URL}/api/auth/login`;
      console.log('🔍 Login attempt:', { email, url: loginUrl, apiBase: BASE_URL });

      const response = await axios.post(loginUrl, {
        email,
        password,
      });

      console.log('✅ Login successful:', response.data.user);
      const { token, user } = response.data;
      sessionStorage.clear();
      localStorage.setItem('token', String(token).trim());
      setUser(user);
      return { success: true, user };
    } catch (error) {
      console.error('❌ Login error:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        url: error.config?.url,
      });
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Login failed',
      };
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    sessionStorage.clear();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
