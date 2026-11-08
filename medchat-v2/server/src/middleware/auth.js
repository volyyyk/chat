/**
 * Authentication Middleware
 * Verifies JWT tokens and checks user permissions
 */

const jwt = require('jsonwebtoken');
const { JWT_SECRET } = process.env;
const models = require('../models');

// Safe logger: never leave requests hanging if winston is not loadable
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

/**
 * Authenticate user using JWT token
 * @returns {Function} Express middleware
 */
function authenticate() {
  return async (req, res, next) => {
    try {
      // Get token from header
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication token is required',
        });
      }

      const token = authHeader.split(' ')[1];

      // Verify token
      // SECURITY: algorithm pinning - forged alg:none tokens are rejected
      const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });

      // Get user from database
      const user = await models.User.findByPk(decoded.id, {
        include: [
          { model: models.Doctor, as: 'doctorProfile' },
          { model: models.Patient, as: 'patientProfile' },
          { model: models.Clinic, as: 'clinic' },
        ],
      });

      if (!user) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'User not found',
        });
      }

      // Check if user is active
      if (user.status !== 'active') {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Account is inactive. Please contact support.',
        });
      }

      // Check if doctor is verified (if role is doctor)
      if (user.role === 'doctor' && user.doctorProfile && user.doctorProfile.invitationStatus !== 'accepted') {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Doctor account not verified. Please contact clinic administration.',
        });
      }

      // Attach user to request.
      // SECURITY: privateKey must NEVER be attached here — it is the user's
      // personal decryption key stored in the DB. Old code leaked it into
      // req.user (and thus into any error log that dumped the request user).
      req.user = {
        id: user.id,
        email: user.email,
        role: user.role,
        clinicId: user.clinicId,
        doctorId: user.doctorProfile?.id,
        patientId: user.patientProfile?.id,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        avatar: user.avatar,
        publicKey: user.publicKey,
      };

      // Update last activity (throttled: at most once per 60 seconds,
      // to avoid a DB write on every single request)
      try {
        const needsUpdate = !user.lastActivityAt ||
          (Date.now() - new Date(user.lastActivityAt).getTime() > 60000);
        if (needsUpdate) {
          await user.update({
            lastActivityAt: new Date(),
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
          });
        }
      } catch (e) {
        logger.warn('Failed to update lastActivityAt: ' + e.message);
      }

      next();
    } catch (error) {
      logger.error(`Authentication error: ${error.message}`);

      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid authentication token',
        });
      }

      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication token has expired',
        });
      }

      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication failed',
      });
    }
  };
}

/**
 * Check user role
 * @param {string|Array} roles - Required role(s)
 * @returns {Function} Express middleware
 */
function authorize(roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    const userRoles = Array.isArray(req.user.role) ? req.user.role : [req.user.role];
    const requiredRoles = Array.isArray(roles) ? roles : [roles];

    const hasPermission = requiredRoles.some((role) => userRoles.includes(role));

    if (!hasPermission) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Insufficient permissions',
        requiredRoles,
        userRole: req.user.role,
      });
    }

    next();
  };
}

/**
 * Check if user is the owner of a resource
 * @param {string} modelName - Model name
 * @param {string} idParam - ID parameter name
 * @param {string} ownerField - Owner field name
 * @returns {Function} Express middleware
 */
function checkOwnership(modelName, idParam = 'id', ownerField = 'userId') {
  return async (req, res, next) => {
    try {
      const model = models[modelName];
      if (!model) {
        return next();
      }

      const resourceId = req.params[idParam];
      const resource = await model.findByPk(resourceId);

      if (!resource) {
        return res.status(404).json({
          error: 'Not Found',
          message: `${modelName} not found`,
        });
      }

      if (resource[ownerField] !== req.user.id) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have permission to access this resource',
        });
      }

      req.resource = resource;
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Check if user is doctor
 * @returns {Function} Express middleware
 */
function isDoctor() {
  return authorize('doctor');
}

/**
 * Check if user is patient
 * @returns {Function} Express middleware
 */
function isPatient() {
  return authorize('patient');
}

/**
 * Check if user is clinic admin
 * @returns {Function} Express middleware
 */
function isClinicAdmin() {
  return authorize('clinic_admin');
}

/**
 * Check if user is system admin
 * @returns {Function} Express middleware
 */
function isSystemAdmin() {
  return authorize('system_admin');
}

/**
 * Check if user belongs to a specific clinic
 * @param {string} clinicIdParam - Clinic ID parameter name
 * @returns {Function} Express middleware
 */
function belongsToClinic(clinicIdParam = 'clinicId') {
  return async (req, res, next) => {
    try {
      const clinicId = req.params[clinicIdParam] || req.body[clinicIdParam];

      if (!clinicId) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Clinic ID is required',
        });
      }

      // Check if user belongs to the clinic
      const userClinicId = req.user.clinicId;

      if (userClinicId !== clinicId && req.user.role !== 'system_admin') {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have permission to access this clinic',
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = {
  authenticate,
  authorize,
  checkOwnership,
  isDoctor,
  isPatient,
  isClinicAdmin,
  isSystemAdmin,
  belongsToClinic,
};
