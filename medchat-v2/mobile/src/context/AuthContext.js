/**
 * Auth Context
 * Manages user authentication state
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authService } from '../services/authService';
import { chatService } from '../services/chatService';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load user data from storage on startup
  useEffect(() => {
    const loadUser = async () => {
      try {
        const storedToken = await AsyncStorage.getItem('authToken');
        const storedUser = await AsyncStorage.getItem('userData');

        if (storedToken && storedUser) {
          setToken(storedToken);
          setUser(JSON.parse(storedUser));
          
          // Verify token
          const isValid = await authService.verifyToken(storedToken);
          if (!isValid) {
            await logout();
          }
        }
      } catch (err) {
        console.error('Error loading user:', err);
        await logout();
      } finally {
        setIsLoading(false);
      }
    };

    loadUser();
  }, []);

  // Login
  const login = async (emailOrUsername, password, rememberMe = true) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await authService.login(emailOrUsername, password);
      
      if (response.success) {
        setUser(response.user);
        setToken(response.token);
        
        if (rememberMe) {
          await AsyncStorage.setItem('authToken', response.token);
          await AsyncStorage.setItem('userData', JSON.stringify(response.user));
        }
        
        // Initialize chat service
        await chatService.initialize(response.token, response.user);
        
        return response;
      } else {
        setError(response.message || 'Login failed');
        return response;
      }
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Register (for patients)
  const register = async (data) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await authService.register(data);
      
      if (response.success) {
        // Auto-login after registration
        await login(data.email, data.password);
        return response;
      } else {
        setError(response.message || 'Registration failed');
        return response;
      }
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Doctor registration
  const registerDoctor = async (data) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await authService.registerDoctor(data);
      
      if (response.success) {
        // Note: Doctor needs clinic approval before they can login
        return response;
      } else {
        setError(response.message || 'Registration failed');
        return response;
      }
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Logout
  const logout = async () => {
    try {
      await authService.logout(token);
      await chatService.disconnect();
      await AsyncStorage.removeItem('authToken');
      await AsyncStorage.removeItem('userData');
      await AsyncStorage.removeItem('chatData');
      
      setUser(null);
      setToken(null);
      setError(null);
    } catch (err) {
      console.error('Error logging out:', err);
    }
  };

  // Forgot password
  const forgotPassword = async (email) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await authService.forgotPassword(email);
      return response;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Reset password
  const resetPassword = async (token, newPassword) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await authService.resetPassword(token, newPassword);
      return response;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Update profile
  const updateProfile = async (data) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await authService.updateProfile(token, data);
      
      if (response.success) {
        setUser(response.user);
        await AsyncStorage.setItem('userData', JSON.stringify(response.user));
      }
      
      return response;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Change password
  const changePassword = async (currentPassword, newPassword) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await authService.changePassword(token, currentPassword, newPassword);
      
      if (response.success) {
        // Force re-login
        await logout();
      }
      
      return response;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Применить внешне полученную сессию (например, перенос данных
  // с другого устройства): сохранить токены и переключить приложение.
  const applySession = async (newToken, newUser) => {
    try {
      await AsyncStorage.setItem('authToken', newToken);
      await AsyncStorage.setItem('userData', JSON.stringify(newUser));
      setToken(newToken);
      setUser(newUser);
      setError(null);
      try {
        await chatService.initialize(newToken, newUser);
      } catch (initErr) {
        console.error('Error initializing chat service:', initErr);
      }
    } catch (err) {
      console.error('Error applying session:', err);
      throw err;
    }
  };

  // Refresh token
  const refreshToken = async () => {
    try {
      const response = await authService.refreshToken(token);
      
      if (response.success) {
        setToken(response.token);
        await AsyncStorage.setItem('authToken', response.token);
        return response.token;
      }
      
      return null;
    } catch (err) {
      await logout();
      return null;
    }
  };

  const value = {
    user,
    token,
    isLoading,
    error,
    isAuthenticated: !!user && !!token,
    login,
    register,
    registerDoctor,
    logout,
    forgotPassword,
    resetPassword,
    updateProfile,
    changePassword,
    refreshToken,
    applySession,
    clearError: () => setError(null),
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
