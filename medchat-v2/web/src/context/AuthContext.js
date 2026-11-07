/**
 * Auth context for the web app
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, setToken, getToken } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem('userData');
    const storedToken = localStorage.getItem('authToken');
    if (storedUser && storedToken) {
      setUser(JSON.parse(storedUser));
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (loginData) => {
    const data = await api.post('/api/auth/login', loginData);
    const token = data.token || (data.data && data.data.token);
    const userData = data.user || (data.data && data.data.user);
    setToken(token);
    localStorage.setItem('userData', JSON.stringify(userData));
    setUser(userData);
    return userData;
  }, []);

  const registerDoctor = useCallback(async (registerData) => {
    return api.post('/api/auth/register/doctor', registerData);
  }, []);

  const logout = useCallback(async () => {
    try {
      if (getToken()) {
        await api.post('/api/auth/logout', {});
      }
    } catch (e) {
      // Ignore logout errors
    }
    setToken(null);
    localStorage.removeItem('userData');
    setUser(null);
  }, []);

  const value = { user, isLoading, login, registerDoctor, logout, isAuthenticated: !!user };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
