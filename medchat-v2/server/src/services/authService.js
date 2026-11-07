/**
 * Authentication Service
 * Handles JWT token generation, verification, and user authentication
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const models = require('../models');

// Safe logger: never crash auth flows if winston is not loadable
let logger;
try {
  logger = require('../utils/logger');
} catch (e) {
  logger = global.logger || {
    error: (...args) => console.error('[error]', ...args),
    warn: (...args) => console.warn('[warn]', ...args),
    info: (...args) => console.info('[info]', ...args),
  };
}

const {
  JWT_SECRET,
  JWT_EXPIRES_IN,
  JWT_REFRESH_EXPIRES_IN,
  NODE_ENV,
} = process.env;

class AuthService {
  /**
   * Generate JWT token
   * @param {Object} payload - Token payload
   * @param {string} expiresIn - Expiration time
   * @returns {string} JWT token
   */
  static generateToken(payload, expiresIn = JWT_EXPIRES_IN) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn });
  }

  /**
   * Verify JWT token
   * @param {string} token - JWT token
   * @returns {Object} Decoded payload
   */
  static verifyToken(token) {
    return jwt.verify(token, JWT_SECRET);
  }

  /**
   * Generate refresh token
   * @param {Object} user - User object
   * @returns {Promise<string>} Refresh token
   */
  static async generateRefreshToken(user) {
    const token = crypto.randomBytes(64).toString('hex');
    const expiresAt = new Date();

    // Set expiration based on environment
    const expiresIn = NODE_ENV === 'production' ? JWT_REFRESH_EXPIRES_IN : '30d';
    expiresAt.setDate(expiresAt.getDate() + parseInt(expiresIn));

    await models.RefreshToken.create({
      token,
      userId: user.id,
      expiresAt,
      ipAddress: user.ipAddress,
      userAgent: user.userAgent,
    });

    return token;
  }

  /**
   * Find refresh token
   * @param {string} token - Refresh token
   * @returns {Promise<Object>} Refresh token record
   */
  static async findRefreshToken(token) {
    return models.RefreshToken.findOne({
      where: { token },
      include: [{ model: models.User, as: 'user' }],
    });
  }

  /**
   * Revoke refresh token
   * @param {string} token - Refresh token
   * @param {string} reason - Revocation reason
   * @param {Object} revokedBy - User who revoked
   * @returns {Promise<Object>} Updated token
   */
  static async revokeRefreshToken(token, reason = 'user_request', revokedBy = null) {
    const refreshToken = await models.RefreshToken.findOne({ where: { token } });
    if (refreshToken) {
      return refreshToken.update({
        isRevoked: true,
        revokedAt: new Date(),
        revokedBy,
        revocationReason: reason,
      });
    }
    return null;
  }

  /**
   * Revoke all refresh tokens for user
   * @param {string} userId - User ID
   * @param {string} reason - Revocation reason
   * @returns {Promise<number>} Number of revoked tokens
   */
  static async revokeAllRefreshTokens(userId, reason = 'security') {
    return models.RefreshToken.update(
      {
        isRevoked: true,
        revokedAt: new Date(),
        revocationReason: reason,
      },
      { where: { userId, isRevoked: false } }
    );
  }

  /**
   * Hash password
   * @param {string} password - Plain text password
   * @returns {Promise<string>} Hashed password
   */
  static async hashPassword(password) {
    return bcrypt.hash(password, 12);
  }

  /**
   * Compare password
   * @param {string} password - Plain text password
   * @param {string} hash - Hashed password
   * @returns {Promise<boolean>} Password match
   */
  static async comparePassword(password, hash) {
    return bcrypt.compare(password, hash);
  }

  /**
   * Register new user
   * @param {Object} userData - User registration data
   * @returns {Promise<Object>} Created user
   */
  static async register(userData) {
    const { email, password, phone, role, ...rest } = userData;

    // Check if user already exists
    const existingUser = await models.User.findOne({ where: { email } });
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    if (phone) {
      const existingPhoneUser = await models.User.findOne({ where: { phone } });
      if (existingPhoneUser) {
        throw new Error('User with this phone already exists');
      }
    }

    // Hash password
    const passwordHash = await this.hashPassword(password);

    // Create user
    // NOTE: status defaults to 'pending' in the model; a freshly registered
    // user must be able to log in right away (email verification is a
    // separate optional flow), so we activate the account here.
    const user = await models.User.create({
      email,
      phone,
      passwordHash,
      role,
      status: 'active',
      ...rest,
    });

    // Generate keys for end-to-end encryption
    const cryptoService = require('./cryptoService');
    const keyPair = cryptoService.generateX25519KeyPair();
    await user.update({
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
    });

    return user;
  }

  /**
   * Login user
   * @param {string} email - User email
   * @param {string} password - User password
   * @param {Object} req - Request object
   * @returns {Promise<Object>} Login result with tokens
   */
  static async login(email, password, req) {
    const user = await models.User.findOne({
      where: { email },
      include: [
        { model: models.Doctor, as: 'doctorProfile' },
        { model: models.Patient, as: 'patientProfile' },
        { model: models.Clinic, as: 'clinic' },
      ],
    });

    if (!user) {
      throw new Error('Invalid email or password');
    }

    // Check if user is active
    if (user.status !== 'active') {
      throw new Error('Account is inactive. Please contact support.');
    }

    // Check password
    const isValidPassword = await this.comparePassword(password, user.passwordHash);
    if (!isValidPassword) {
      throw new Error('Invalid email or password');
    }

    // Check if doctor needs verification
    if (user.role === 'doctor' && user.doctorProfile && user.doctorProfile.invitationStatus !== 'accepted') {
      throw new Error('Doctor account not verified. Please contact clinic administration.');
    }

    // Generate tokens
    const tokenPayload = {
      id: user.id,
      email: user.email,
      role: user.role,
      clinicId: user.clinicId,
      doctorId: user.doctorProfile?.id,
      patientId: user.patientProfile?.id,
    };

    const accessToken = this.generateToken(tokenPayload);
    const refreshToken = await this.generateRefreshToken({
      id: user.id,
      email: user.email,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    // Update last login
    await user.update({
      lastLoginAt: new Date(),
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    // Create session
    await models.Session.create({
      userId: user.id,
      sessionId: uuidv4(),
      token: accessToken,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      deviceType: this.getDeviceType(req.get('User-Agent')),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    });

    return {
      user: this.sanitizeUser(user),
      accessToken,
      refreshToken,
      expiresIn: JWT_EXPIRES_IN,
    };
  }

  /**
   * Refresh access token
   * @param {string} refreshToken - Refresh token
   * @param {Object} req - Request object
   * @returns {Promise<Object>} New tokens
   */
  static async refreshToken(refreshToken, req) {
    const tokenRecord = await this.findRefreshToken(refreshToken);

    if (!tokenRecord) {
      throw new Error('Invalid refresh token');
    }

    if (tokenRecord.isRevoked) {
      throw new Error('Refresh token has been revoked');
    }

    if (tokenRecord.expiresAt < new Date()) {
      throw new Error('Refresh token has expired');
    }

    const user = tokenRecord.user;

    // Check if user is still active
    if (user.status !== 'active') {
      throw new Error('Account is inactive');
    }

    // Generate new tokens
    const tokenPayload = {
      id: user.id,
      email: user.email,
      role: user.role,
      clinicId: user.clinicId,
    };

    const newAccessToken = this.generateToken(tokenPayload);
    const newRefreshToken = await this.generateRefreshToken({
      id: user.id,
      email: user.email,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    // Revoke old refresh token
    await this.revokeRefreshToken(refreshToken, 'token_refreshed', user.id);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: JWT_EXPIRES_IN,
    };
  }

  /**
   * Logout user
   * @param {string} userId - User ID
   * @param {string} token - Access token to invalidate
   * @returns {Promise<Object>} Logout result
   */
  static async logout(userId, token) {
    // Revoke all refresh tokens
    await this.revokeAllRefreshTokens(userId, 'user_logout');

    // Delete sessions
    await models.Session.destroy({ where: { userId } });

    return { message: 'Logged out successfully' };
  }

  /**
   * Forgot password
   * @param {string} email - User email
   * @returns {Promise<Object>} Reset token
   */
  static async forgotPassword(email) {
    const user = await models.User.findOne({ where: { email } });

    if (!user) {
      // Don't reveal that user doesn't exist
      return { message: 'If an account exists with this email, a reset link has been sent.' };
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours

    // Save reset token
    await models.PasswordResetToken.create({
      token: resetToken,
      userId: user.id,
      expiresAt,
      ipAddress: null,
      userAgent: null,
    });

    // In production, send email with reset link
    // For now, return the token (in real implementation, send email)
    const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;

    logger.info(`Password reset link for ${email}: ${resetLink}`);

    return {
      message: 'If an account exists with this email, a reset link has been sent.',
      resetLink: NODE_ENV === 'development' ? resetLink : undefined,
    };
  }

  /**
   * Reset password
   * @param {string} token - Reset token
   * @param {string} newPassword - New password
   * @returns {Promise<Object>} Reset result
   */
  static async resetPassword(token, newPassword) {
    const resetToken = await models.PasswordResetToken.findOne({
      where: { token },
      include: [{ model: models.User, as: 'user' }],
    });

    if (!resetToken) {
      throw new Error('Invalid or expired reset token');
    }

    if (resetToken.expiresAt < new Date()) {
      throw new Error('Reset token has expired');
    }

    if (resetToken.usedAt) {
      throw new Error('Reset token has already been used');
    }

    // Hash new password
    const passwordHash = await this.hashPassword(newPassword);

    // Update user password
    await resetToken.user.update({ passwordHash });

    // Mark token as used
    await resetToken.update({ usedAt: new Date() });

    // Revoke all refresh tokens
    await this.revokeAllRefreshTokens(resetToken.user.id, 'password_reset');

    return { message: 'Password has been reset successfully' };
  }

  /**
   * Change password
   * @param {string} userId - User ID
   * @param {string} currentPassword - Current password
   * @param {string} newPassword - New password
   * @returns {Promise<Object>} Change result
   */
  static async changePassword(userId, currentPassword, newPassword) {
    const user = await models.User.findByPk(userId);

    if (!user) {
      throw new Error('User not found');
    }

    // Check current password
    const isValidPassword = await this.comparePassword(currentPassword, user.passwordHash);
    if (!isValidPassword) {
      throw new Error('Current password is incorrect');
    }

    // Check if new password is different
    if (currentPassword === newPassword) {
      throw new Error('New password must be different from current password');
    }

    // Hash new password
    const passwordHash = await this.hashPassword(newPassword);

    // Update user password
    await user.update({ passwordHash });

    // Revoke all refresh tokens
    await this.revokeAllRefreshTokens(userId, 'password_change');

    return { message: 'Password has been changed successfully' };
  }

  /**
   * Sanitize user object (remove sensitive data)
   * @param {Object} user - User object
   * @returns {Object} Sanitized user
   */
  static sanitizeUser(user) {
    if (!user) return null;

    const sanitized = { ...user.toJSON() };
    delete sanitized.passwordHash;
    delete sanitized.privateKey;
    delete sanitized.twoFactorSecret;

    return sanitized;
  }

  /**
   * Get device type from user agent
   * @param {string} userAgent - User agent string
   * @returns {string} Device type
   */
  static getDeviceType(userAgent) {
    if (!userAgent) return 'unknown';

    const lowerAgent = userAgent.toLowerCase();

    if (lowerAgent.includes('mobile')) return 'mobile';
    if (lowerAgent.includes('tablet')) return 'tablet';
    if (lowerAgent.includes('ipad')) return 'tablet';
    if (lowerAgent.includes('android')) return 'mobile';
    if (lowerAgent.includes('iphone')) return 'mobile';

    return 'desktop';
  }

  /**
   * Validate email
   * @param {string} email - Email address
   * @returns {boolean} Is valid
   */
  static validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  }

  /**
   * Validate phone
   * @param {string} phone - Phone number
   * @returns {boolean} Is valid
   */
  static validatePhone(phone) {
    const re = /^\+?[0-9\s-()]{10,20}$/;
    return re.test(phone);
  }

  /**
   * Validate password strength
   * @param {string} password - Password
   * @returns {Object} Validation result
   */
  static validatePassword(password) {
    const errors = [];

    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }

    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (!/[^A-Za-z0-9]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}

module.exports = AuthService;
