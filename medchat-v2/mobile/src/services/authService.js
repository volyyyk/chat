/**
 * Auth Service
 * Handles authentication API calls.
 * Matches the MedChat v2 server API:
 *   POST /api/auth/login      { email, password } -> { user, accessToken, refreshToken, expiresIn }
 *   POST /api/auth/register   { email, password, role, firstName, lastName, clinicCode? }
 *   POST /api/auth/refresh    { refreshToken }
 *   GET  /api/auth/me         (Bearer token)
 *   POST /api/auth/logout     (Bearer token)
 */

import { API_BASE_URL } from '../config/config';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = `${API_BASE_URL}/api/auth`;

const safeJson = async (response) => {
  try {
    return await response.json();
  } catch (e) {
    return {};
  }
};

class AuthService {
  /**
   * Login user (email + password)
   */
  static async login(emailOrUsername, password) {
    try {
      const email = String(emailOrUsername || '').trim();

      const response = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const data = await safeJson(response);

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Login failed');
      }

      const token = data.accessToken || data.token || null;
      const refreshToken = data.refreshToken || null;

      // Persist refresh token for silent renewal
      if (refreshToken) {
        await AsyncStorage.setItem('refreshToken', refreshToken);
      }

      return {
        success: true,
        token,
        accessToken: token,
        refreshToken,
        user: data.user || null,
        expiresIn: data.expiresIn,
      };
    } catch (err) {
      return {
        success: false,
        message: err.message,
      };
    }
  }

  /**
   * Register user (patient by default, doctor if data.role === 'doctor')
   */
  static async register(data) {
    try {
      const role = data.role || 'patient';

      const body = {
        email: data.email,
        password: data.password,
        role,
        firstName: data.firstName,
        lastName: data.lastName,
      };

      if (data.middleName) body.middleName = data.middleName;
      if (data.phone) body.phone = data.phone;
      if (role === 'doctor' && data.clinicCode) body.clinicCode = data.clinicCode;
      if (data.consentGiven !== undefined) body.consentGiven = data.consentGiven;

      const response = await fetch(`${API_URL}/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const result = await safeJson(response);

      if (!response.ok) {
        throw new Error(result.error || result.message || 'Registration failed');
      }

      return {
        success: true,
        user: result.user || null,
        token: result.accessToken || null,
        refreshToken: result.refreshToken || null,
      };
    } catch (err) {
      return {
        success: false,
        message: err.message,
      };
    }
  }

  /**
   * Register doctor (requires clinicCode)
   */
  static async registerDoctor(data) {
    return AuthService.register({ ...data, role: 'doctor' });
  }

  /**
   * Forgot password
   */
  static async forgotPassword(email) {
    try {
      const response = await fetch(`${API_URL}/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await safeJson(response);

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Failed to send reset email');
      }

      return {
        success: true,
        message: data.message || 'Reset email sent',
      };
    } catch (err) {
      return {
        success: false,
        message: err.message,
      };
    }
  }

  /**
   * Reset password
   */
  static async resetPassword(token, newPassword) {
    try {
      const response = await fetch(`${API_URL}/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token, newPassword }),
      });

      const data = await safeJson(response);

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Password reset failed');
      }

      return {
        success: true,
        message: data.message || 'Password reset successful',
      };
    } catch (err) {
      return {
        success: false,
        message: err.message,
      };
    }
  }

  /**
   * Logout
   */
  static async logout(token) {
    try {
      const response = await fetch(`${API_URL}/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await safeJson(response);

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Logout failed');
      }

      return {
        success: true,
        message: data.message || 'Logged out successfully',
      };
    } catch (err) {
      return {
        success: false,
        message: err.message,
      };
    }
  }

  /**
   * Verify the access token is still valid (GET /api/auth/me)
   */
  static async verifyToken(token) {
    try {
      const response = await fetch(`${API_URL}/me`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      return response.ok;
    } catch (err) {
      return false;
    }
  }

  /**
   * Refresh the access token.
   * Uses the stored refresh token when no argument is passed.
   */
  static async refreshToken(refreshTokenArg) {
    try {
      const refreshToken = refreshTokenArg || (await AsyncStorage.getItem('refreshToken'));

      if (!refreshToken) {
        throw new Error('No refresh token available');
      }

      const response = await fetch(`${API_URL}/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      });

      const data = await safeJson(response);

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Token refresh failed');
      }

      const token = data.accessToken || data.token || null;
      const newRefresh = data.refreshToken || refreshToken;

      if (newRefresh) {
        await AsyncStorage.setItem('refreshToken', newRefresh);
      }

      return {
        success: true,
        token,
        accessToken: token,
        refreshToken: newRefresh,
      };
    } catch (err) {
      return {
        success: false,
        message: err.message,
      };
    }
  }

  /**
   * Update profile (PUT /api/users/me)
   */
  static async updateProfile(token, data) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/users/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });

      const result = await safeJson(response);

      if (!response.ok) {
        throw new Error(result.error || result.message || 'Profile update failed');
      }

      return {
        success: true,
        user: result.data || result,
      };
    } catch (err) {
      return {
        success: false,
        message: err.message,
      };
    }
  }

  /**
   * Change password (POST /api/auth/change-password)
   */
  static async changePassword(token, currentPassword, newPassword) {
    try {
      const response = await fetch(`${API_URL}/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await safeJson(response);

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Password change failed');
      }

      return {
        success: true,
        message: data.message || 'Password changed successfully',
      };
    } catch (err) {
      return {
        success: false,
        message: err.message,
      };
    }
  }

  /**
   * Check email availability (best-effort)
   */
  static async checkEmail(email) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/users/check-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await safeJson(response);
      return !!(data.data && data.data.available);
    } catch (err) {
      return false;
    }
  }
}

export const authService = AuthService;
