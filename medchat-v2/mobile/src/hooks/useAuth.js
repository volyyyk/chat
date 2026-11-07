/**
 * MedChat Mobile App - useAuth Hook
 * Thin pass-through over AuthContext.
 *
 * AuthContext provides its value directly (user, token, login, ...),
 * not a reducer state/dispatch pair. This hook simply re-exposes that
 * value with the field names screens expect, plus a `state` alias for
 * backwards compatibility with code that reads state.user / state.token.
 */

import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext';

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  // Backwards-compatible alias: some legacy code reads state.user / state.token
  const state = {
    user: context.user,
    token: context.token,
    isAuthenticated: context.isAuthenticated,
    refreshToken: null,
  };

  return {
    // State
    user: context.user,
    token: context.token,
    isAuthenticated: context.isAuthenticated,
    isLoading: context.isLoading,
    isInitialized: true,
    error: context.error,
    state,

    // Actions (delegated to AuthContext)
    login: context.login,
    register: context.register,
    registerDoctor: context.registerDoctor,
    logout: context.logout,
    forgotPassword: context.forgotPassword,
    resetPassword: context.resetPassword,
    updateProfile: context.updateProfile,
    changePassword: context.changePassword,
    refreshToken: context.refreshToken,
    clearError: context.clearError,

    // Clinic / doctor verification are handled by the server during
    // login and registration; kept as soft no-op stubs for old callers.
    verifyClinicCode: async () => ({
      success: false,
      message: 'Проверка кода клиники выполняется при регистрации',
    }),
    checkDoctorVerification: async () => ({
      success: false,
      verified: false,
      message: 'Верификация врача выполняется клиникой',
    }),
  };
};

export default useAuth;
