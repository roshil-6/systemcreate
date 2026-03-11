import React, { createContext, useState, useEffect } from 'react';
import axios from 'axios';
import API_BASE_URL from '../config/api';

const BASE_URL = API_BASE_URL;

const AuthContext = createContext();

// Global request interceptor — reads token fresh from localStorage on every request.
// This is the single source of truth for auth headers and avoids any timing issues
// with axios.defaults being set/cleared at different points in the component lifecycle.
axios.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers = config.headers || {};
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
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
      localStorage.setItem('token', token);
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
