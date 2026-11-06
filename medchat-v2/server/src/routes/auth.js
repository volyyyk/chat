/**
 * Authentication Routes
 * Handles user registration, login, logout, password reset, etc.
 */

const express = require('express');
const router = express.Router();
const AuthService = require('../services/authService');
const { validate } = require('../middleware/validation');
const { authSchema, registerSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema, changePasswordSchema, refreshTokenSchema } = require('../validators/auth');

/**
 * @swagger
 * tags:
 *   name: Authentication
 *   description: User authentication endpoints
 */

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register new user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Validation error
 *       409:
 *         description: User already exists
 */
router.post('/register', validate(registerSchema), async (req, res, next) => {
  try {
    const { email, password, phone, role, firstName, lastName, middleName, clinicCode } = req.body;

    // Check if clinic code is required for doctor registration
    if (role === 'doctor' && !clinicCode) {
      return res.status(400).json({
        error: 'Clinic code is required for doctor registration',
      });
    }

    // Validate password
    const passwordValidation = AuthService.validatePassword(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        error: 'Password validation failed',
        details: passwordValidation.errors,
      });
    }

    // Check if clinic exists (for doctor registration)
    if (role === 'doctor' && clinicCode) {
      const models = require('../models');
      const clinic = await models.Clinic.findOne({ where: { code: clinicCode } });
      if (!clinic) {
        return res.status(400).json({
          error: 'Invalid clinic code',
        });
      }
    }

    // Create user
    const userData = {
      email,
      password,
      phone,
      role,
      firstName,
      lastName,
      middleName,
    };

    // For doctor, set clinic code
    if (role === 'doctor' && clinicCode) {
      userData.clinicCode = clinicCode;
    }

    const user = await AuthService.register(userData);

    // For doctor, create doctor profile
    if (role === 'doctor') {
      const models = require('../models');
      await models.Doctor.create({
        userId: user.id,
        clinicId: clinicCode ? (await models.Clinic.findOne({ where: { code: clinicCode } })).id : null,
        invitationStatus: 'pending',
      });
    }

    // For patient, create patient profile
    if (role === 'patient') {
      const models = require('../models');
      await models.Patient.create({
        userId: user.id,
      });
    }

    // Generate tokens
    const tokenPayload = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = AuthService.generateToken(tokenPayload);
    const refreshToken = await AuthService.generateRefreshToken({
      id: user.id,
      email: user.email,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    res.status(201).json({
      user: AuthService.sanitizeUser(user),
      accessToken,
      refreshToken,
      expiresIn: process.env.JWT_EXPIRES_IN,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await AuthService.login(email, password, req);
    res.json(result);
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RefreshTokenRequest'
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RefreshTokenResponse'
 *       401:
 *         description: Invalid refresh token
 */
router.post('/refresh', validate(refreshTokenSchema), async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    const result = await AuthService.refreshToken(refreshToken, req);
    res.json(result);
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Logout user
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Logged out successfully
 */
router.post('/logout', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const token = req.headers.authorization?.split(' ')[1];
    const result = await AuthService.logout(userId, token);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Request password reset
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ForgotPasswordRequest'
 *     responses:
 *       200:
 *         description: Reset link sent (if user exists)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 */
router.post('/forgot-password', validate(forgotPasswordSchema), async (req, res, next) => {
  try {
    const { email } = req.body;
    const result = await AuthService.forgotPassword(email);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: Reset password with token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ResetPasswordRequest'
 *     responses:
 *       200:
 *         description: Password reset successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid or expired token
 */
router.post('/reset-password', validate(resetPasswordSchema), async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;
    const result = await AuthService.resetPassword(token, newPassword);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/auth/change-password:
 *   post:
 *     summary: Change password (authenticated)
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ChangePasswordRequest'
 *     responses:
 *       200:
 *         description: Password changed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       401:
 *         description: Current password is incorrect
 */
router.post('/change-password', validate(changePasswordSchema), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;
    const result = await AuthService.changePassword(userId, currentPassword, newPassword);
    res.json(result);
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get current user
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 */
router.get('/me', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const models = require('../models');
    
    const user = await models.User.findByPk(userId, {
      include: [
        { model: models.Doctor, as: 'doctorProfile' },
        { model: models.Patient, as: 'patientProfile' },
        { model: models.Clinic, as: 'clinic' },
      ],
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(AuthService.sanitizeUser(user));
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/auth/verify-email:
 *   post:
 *     summary: Verify email address
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Email verified successfully
 */
router.post('/verify-email', async (req, res, next) => {
  try {
    const { token } = req.body;
    const models = require('../models');
    
    const verificationToken = await models.VerificationToken.findOne({
      where: { token },
      include: [{ model: models.User, as: 'user' }],
    });

    if (!verificationToken) {
      return res.status(400).json({ error: 'Invalid verification token' });
    }

    if (verificationToken.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Verification token has expired' });
    }

    if (verificationToken.usedAt) {
      return res.status(400).json({ error: 'Verification token has already been used' });
    }

    await verificationToken.user.update({
      emailVerified: true,
      verificationDate: new Date(),
    });

    await verificationToken.update({ usedAt: new Date() });

    res.json({ message: 'Email verified successfully' });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/auth/resend-verification:
 *   post:
 *     summary: Resend verification email
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Verification email resent
 */
router.post('/resend-verification', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const models = require('../models');
    
    const user = await models.User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.emailVerified) {
      return res.json({ message: 'Email is already verified' });
    }

    // Generate new verification token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    await models.VerificationToken.create({
      token,
      userId: user.id,
      expiresAt,
      type: 'email_verification',
    });

    // In production, send email
    logger.info(`Verification token for ${user.email}: ${token}`);

    res.json({ message: 'Verification email resent' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
