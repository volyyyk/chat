/**
 * Authentication Routes
 * Handles user registration, login, logout, password reset, etc.
 */

const express = require('express');
const router = express.Router();
const AuthService = require('../services/authService');
const { validate } = require('../middleware/validation');
const { authenticate } = require('../middleware/auth');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { authSchema, registerSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema, changePasswordSchema, refreshTokenSchema, phoneRequestSchema, phoneVerifySchema } = require('../validators/auth');

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
router.post('/logout', authenticate(), async (req, res, next) => {
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
router.post('/change-password', authenticate(), validate(changePasswordSchema), async (req, res, next) => {
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
router.get('/me', authenticate(), async (req, res, next) => {
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
router.post('/resend-verification', authenticate(), async (req, res, next) => {
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

/**
 * @swagger
 * /api/auth/phone/request-code:
 *   post:
 *     summary: Request SMS verification code (phone identification, 149-FZ st. 10.1)
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: SMS code sent (devCode is returned outside production)
 *       400:
 *         description: No phone number provided
 */
router.post('/phone/request-code', authenticate(), validate(phoneRequestSchema), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const models = require('../models');

    const user = await models.User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // 149-ФЗ ст. 10.1: идентификация по абонентскому номеру. Номер берётся
    // из тела (смена) или уже сохранённый на пользователе.
    const phone = req.body.phone || user.phone;
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    // Смена номера сбрасывает верификацию: подтверждённым должен быть
    // именно текущий номер.
    if (phone !== user.phone) {
      await user.update({ phone, phoneVerified: false });
    }

    // Прошлые неиспользованные коды инвалидируются (активен один код).
    await models.VerificationToken.update(
      { usedAt: new Date() },
      { where: { userId: user.id, type: 'phone', usedAt: null } }
    );

    // Одноразовый код: 6 цифр, срок жизни 10 минут. Токен = hex-соль:код,
    // чтобы код не хранился в БД в открытом виде как отдельное поле.
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const token = `${crypto.randomBytes(16).toString("hex")}:${code}`;
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await models.VerificationToken.create({
      token,
      userId: user.id,
      expiresAt,
      type: 'phone',
    });

    // Доставка: заглушка (реальный SMS-гейт или Госуслуги — оператор, LEGAL.md §5).
    logger.info(`SMS verification code for ${user.email}: ${code}`);

    const response = { message: 'SMS verification code sent', phone };
    // Тестовый режим: код возвращается в ответе (только вне production).
    if (process.env.NODE_ENV !== 'production') {
      response.devCode = code;
    }
    res.json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/auth/phone/verify:
 *   post:
 *     summary: Verify phone with SMS code (identification, 149-FZ st. 10.1)
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Phone verified (user.phoneVerified = true)
 *       400:
 *         description: Invalid, expired or already used code
 */
router.post('/phone/verify', authenticate(), validate(phoneVerifySchema), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const models = require('../models');

    const { code } = req.body;

    const verificationToken = await models.VerificationToken.findOne({
      where: { userId, type: 'phone', usedAt: null },
    });

    if (!verificationToken) {
      return res.status(400).json({ error: 'Verification code not found or already used' });
    }

    const expected = verificationToken.token.split(':').pop();
    if (expected !== String(code)) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    if (verificationToken.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Verification code has expired' });
    }

    await verificationToken.update({ usedAt: new Date() });

    const user = await models.User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    await user.update({ phoneVerified: true });

    res.json({ message: 'Phone verified successfully', phoneVerified: true });
  } catch (error) {
    next(error);
  }
});
module.exports = router;

