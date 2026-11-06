/**
 * MedChat Mobile App - useAuth Hook
 * Authentication state and actions
 */

import { useState, useEffect, useCallback, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { authService } from '../services/authService';
import { database } from '../services/database';
import { encryptionService } from '../services/encryptionService';
import config from '../config/config';
import { validateEmail, validatePhone, validatePassword } from '../utils/validators';
import { debounce } from '../utils/helpers';

/**
 * Custom hook for authentication
 * @returns {Object} - Auth state and actions
 */
export const useAuth = () => {
  const { state, dispatch } = useContext(AuthContext);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize auth from local storage
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        setIsLoading(true);
        
        // Load saved auth state from database
        const savedAuth = await database.getAuthState();
        
        if (savedAuth && savedAuth.isAuthenticated) {
          // Verify token is still valid
          const isTokenValid = await authService.verifyToken(savedAuth.token);
          
          if (isTokenValid) {
            dispatch({
              type: 'RESTORE_SESSION',
              payload: {
                user: savedAuth.user,
                token: savedAuth.token,
                refreshToken: savedAuth.refreshToken,
                isAuthenticated: true,
              },
            });
          } else {
            // Token expired, try to refresh
            const refreshed = await authService.refreshToken(savedAuth.refreshToken);
            if (refreshed.success) {
              dispatch({
                type: 'RESTORE_SESSION',
                payload: {
                  user: savedAuth.user,
                  token: refreshed.token,
                  refreshToken: refreshed.refreshToken,
                  isAuthenticated: true,
                },
              });
              await database.saveAuthState({
                user: savedAuth.user,
                token: refreshed.token,
                refreshToken: refreshed.refreshToken,
                isAuthenticated: true,
              });
            }
          }
        }
      } catch (err) {
        console.error('Auth initialization error:', err);
      } finally {
        setIsLoading(false);
        setIsInitialized(true);
      }
    };

    initializeAuth();
  }, [dispatch]);

  // Login function
  const login = useCallback(async (identifier, password, isDoctor = false) => {
    try {
      setIsLoading(true);
      setError(null);

      // Validate inputs
      if (!identifier || !password) {
        throw new Error('Пожалуйста, заполните все поля');
      }

      // Call auth service
      const result = await authService.login(identifier, password, isDoctor);

      if (result.success) {
        // Save auth state
        await database.saveAuthState({
          user: result.user,
          token: result.token,
          refreshToken: result.refreshToken,
          isAuthenticated: true,
        });

        // Update context
        dispatch({
          type: 'LOGIN',
          payload: {
            user: result.user,
            token: result.token,
            refreshToken: result.refreshToken,
            isAuthenticated: true,
          },
        });

        return { success: true, user: result.user };
      } else {
        throw new Error(result.message || 'Ошибка авторизации');
      }
    } catch (err) {
      setError(err.message);
      return { success: false, message: err.message };
    } finally {
      setIsLoading(false);
    }
  }, [dispatch]);

  // Register function (for doctors)
  const register = useCallback(async (data) => {
    try {
      setIsLoading(true);
      setError(null);

      // Validate required fields
      if (!data.email || !data.password || !data.firstName || !data.lastName || !data.clinicCode) {
        throw new Error('Пожалуйста, заполните все обязательные поля');
      }

      // Validate email
      if (!validateEmail(data.email)) {
        throw new Error('Неверный формат email');
      }

      // Validate password
      const passwordValidation = validatePassword(data.password);
      if (!passwordValidation.valid) {
        throw new Error(passwordValidation.message);
      }

      // Call auth service
      const result = await authService.register(data);

      if (result.success) {
        // Auto-login after registration
        await login(data.email, data.password, true);
        return { success: true, user: result.user };
      } else {
        throw new Error(result.message || 'Ошибка регистрации');
      }
    } catch (err) {
      setError(err.message);
      return { success: false, message: err.message };
    } finally {
      setIsLoading(false);
    }
  }, [login]);

  // Logout function
  const logout = useCallback(async () => {
    try {
      setIsLoading(true);
      
      // Call auth service to invalidate token on server
      await authService.logout(state.token);

      // Clear local auth state
      await database.clearAuthState();

      // Clear encryption keys
      await encryptionService.clearKeys();

      // Update context
      dispatch({ type: 'LOGOUT' });

      return { success: true };
    } catch (err) {
      console.error('Logout error:', err);
      // Still clear local state even if server call fails
      await database.clearAuthState();
      await encryptionService.clearKeys();
      dispatch({ type: 'LOGOUT' });
      return { success: true };
    } finally {
      setIsLoading(false);
    }
  }, [dispatch, state.token]);

  // Forgot password function
  const forgotPassword = useCallback(async (identifier) => {
    try {
      setIsLoading(true);
      setError(null);

      if (!identifier) {
        throw new Error('Пожалуйста, введите email или телефон');
      }

      const result = await authService.forgotPassword(identifier);

      if (result.success) {
        return { success: true, message: result.message };
      } else {
        throw new Error(result.message || 'Ошибка при сбросе пароля');
      }
    } catch (err) {
      setError(err.message);
      return { success: false, message: err.message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Reset password function
  const resetPassword = useCallback(async (token, newPassword) => {
    try {
      setIsLoading(true);
      setError(null);

      if (!token || !newPassword) {
        throw new Error('Пожалуйста, заполните все поля');
      }

      const passwordValidation = validatePassword(newPassword);
      if (!passwordValidation.valid) {
        throw new Error(passwordValidation.message);
      }

      const result = await authService.resetPassword(token, newPassword);

      if (result.success) {
        return { success: true, message: result.message };
      } else {
        throw new Error(result.message || 'Ошибка при смене пароля');
      }
    } catch (err) {
      setError(err.message);
      return { success: false, message: err.message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Verify clinic code function
  const verifyClinicCode = useCallback(async (code) => {
    try {
      setIsLoading(true);
      setError(null);

      const result = await authService.verifyClinicCode(code);

      if (result.success) {
        return { success: true, clinic: result.clinic };
      } else {
        throw new Error(result.message || 'Неверный код клиники');
      }
    } catch (err) {
      setError(err.message);
      return { success: false, message: err.message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Check if doctor is verified by clinic
  const checkDoctorVerification = useCallback(async () => {
    try {
      if (!state.isAuthenticated || !state.user?.id) {
        return { success: false, verified: false, message: 'Не авторизован' };
      }

      const result = await authService.checkDoctorVerification(state.user.id);

      if (result.success) {
        return { success: true, verified: result.verified };
      } else {
        throw new Error(result.message || 'Ошибка проверки верификации');
      }
    } catch (err) {
      return { success: false, verified: false, message: err.message };
    }
  }, [state.isAuthenticated, state.user?.id]);

  // Refresh token function
  const refreshToken = useCallback(async () => {
    try {
      if (!state.refreshToken) {
        throw new Error('No refresh token available');
      }

      const result = await authService.refreshToken(state.refreshToken);

      if (result.success) {
        // Save new tokens
        await database.saveAuthState({
          user: state.user,
          token: result.token,
          refreshToken: result.refreshToken,
          isAuthenticated: true,
        });

        dispatch({
          type: 'UPDATE_TOKENS',
          payload: {
            token: result.token,
            refreshToken: result.refreshToken,
          },
        });

        return { success: true, token: result.token };
      } else {
        throw new Error(result.message || 'Ошибка обновления токена');
      }
    } catch (err) {
      // If refresh fails, logout
      await logout();
      return { success: false, message: err.message };
    }
  }, [state.refreshToken, state.user, dispatch, logout]);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    // State
    user: state.user,
    token: state.token,
    isAuthenticated: state.isAuthenticated,
    isLoading,
    error,
    isInitialized,
    
    // Actions
    login,
    register,
    logout,
    forgotPassword,
    resetPassword,
    verifyClinicCode,
    checkDoctorVerification,
    refreshToken,
    clearError,
  };
};

export default useAuth;
