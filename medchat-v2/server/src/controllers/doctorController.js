/**
 * Doctor Controller
 * Handles doctor-related operations
 */

const models = require('../models');
const { AppError } = require('../middleware/errorHandler');
const { validate } = require('../middleware/validation');
const CryptoService = require('../services/cryptoService');

class DoctorController {
  /**
   * Get doctor by ID
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async getById(req, res, next) {
    try {
      const { id } = req.params;

      const doctor = await models.Doctor.findByPk(id, {
        include: [
          { model: models.User, as: 'user' },
          { model: models.Clinic, as: 'clinic' },
          { model: models.Specialty, as: 'specialties' },
        ],
      });

      if (!doctor) {
        throw new AppError('Doctor not found', 404, 'NOT_FOUND');
      }

      // Check access (doctor himself, clinic admin, or system admin)
      if (req.user.role !== 'system_admin' && 
          req.user.id !== doctor.userId && 
          req.user.clinicId !== doctor.clinicId) {
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
      }

      res.json(doctor);
    } catch (error) {
      next(error);
    }
  }

  /**
   * List doctors
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async list(req, res, next) {
    try {
      const { page = 1, limit = 20, clinicId, specialty, verified, search, isOnline, category } = req.query;
      const offset = (page - 1) * limit;

      const where = {};
      
      if (clinicId) where.clinicId = clinicId;
      if (verified !== undefined) where.verified = verified;
      if (isOnline !== undefined) where.isOnline = isOnline;
      if (category) where.category = category;

      // For non-admin users, only show doctors from their clinic
      if (req.user.role !== 'system_admin' && req.user.role !== 'clinic_admin') {
        where.clinicId = req.user.clinicId;
      }

      // For clinic admins, only show doctors from their clinic
      if (req.user.role === 'clinic_admin') {
        const clinic = await models.Clinic.findOne({ where: { adminId: req.user.id } });
        if (clinic) where.clinicId = clinic.id;
      }

      const doctors = await models.Doctor.findAndCountAll({
        where,
        include: [
          { model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'avatar'] },
          { model: models.Clinic, as: 'clinic', attributes: ['id', 'name', 'code'] },
          { model: models.Specialty, as: 'specialties' },
        ],
        order: [['user', 'lastName', 'ASC']],
        offset,
        limit,
      });

      res.json({
        data: doctors.rows,
        pagination: {
          page,
          limit,
          total: doctors.count,
          totalPages: Math.ceil(doctors.count / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get current doctor profile
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async getProfile(req, res, next) {
    try {
      const doctor = await models.Doctor.findOne({
        where: { userId: req.user.id },
        include: [
          { model: models.User, as: 'user' },
          { model: models.Clinic, as: 'clinic' },
          { model: models.Specialty, as: 'specialties' },
        ],
      });

      if (!doctor) {
        throw new AppError('Doctor profile not found', 404, 'NOT_FOUND');
      }

      res.json(doctor);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update doctor profile
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async updateProfile(req, res, next) {
    try {
      const doctor = await models.Doctor.findOne({ where: { userId: req.user.id } });
      if (!doctor) {
        throw new AppError('Doctor profile not found', 404, 'NOT_FOUND');
      }

      const data = req.body;
      await doctor.update(data);

      res.json(doctor);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update doctor settings
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async updateSettings(req, res, next) {
    try {
      const doctor = await models.Doctor.findOne({ where: { userId: req.user.id } });
      if (!doctor) {
        throw new AppError('Doctor profile not found', 404, 'NOT_FOUND');
      }

      const data = req.body;
      await doctor.update(data);

      res.json(doctor);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get doctor patients
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async getPatients(req, res, next) {
    try {
      const { id } = req.params;
      const { page = 1, limit = 20, search, status } = req.query;
      const offset = (page - 1) * limit;

      const doctor = await models.Doctor.findByPk(id);
      if (!doctor) {
        throw new AppError('Doctor not found', 404, 'NOT_FOUND');
      }

      // Check access (doctor himself or system admin)
      if (req.user.role !== 'system_admin' && req.user.id !== doctor.userId) {
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
      }

      const where = { doctorId: id };
      if (status) where.status = status;
      if (search) {
        where['$user.firstName$'] = { [models.Sequelize.Op.iLike]: `%${search}%` };
      }

      const patients = await models.Patient.findAndCountAll({
        where,
        include: [
          { model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'avatar'] },
        ],
        order: [['user', 'lastName', 'ASC']],
        offset,
        limit,
      });

      res.json({
        data: patients.rows,
        pagination: {
          page,
          limit,
          total: patients.count,
          totalPages: Math.ceil(patients.count / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Add patient to doctor
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async addPatient(req, res, next) {
    try {
      const { id } = req.params;
      const { patientId, patientNumber } = req.body;

      const doctor = await models.Doctor.findByPk(id);
      if (!doctor) {
        throw new AppError('Doctor not found', 404, 'NOT_FOUND');
      }

      // Check access (doctor himself or system admin)
      if (req.user.role !== 'system_admin' && req.user.id !== doctor.userId) {
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
      }

      // Check if patient exists
      const patient = await models.Patient.findByPk(patientId);
      if (!patient) {
        throw new AppError('Patient not found', 404, 'NOT_FOUND');
      }

      // Check if patient already assigned to this doctor
      const existingPatient = await models.Patient.findOne({
        where: { id: patientId, doctorId: id },
      });
      if (existingPatient) {
        throw new AppError('Patient already assigned to this doctor', 409, 'DUPLICATE_ERROR');
      }

      // Update patient
      await patient.update({
        doctorId: id,
        clinicId: doctor.clinicId,
        patientNumber: patientNumber || patient.patientNumber,
        addedBy: 'doctor',
      });

      res.json({ message: 'Patient added to doctor successfully', patient });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Remove patient from doctor
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async removePatient(req, res, next) {
    try {
      const { id, patientId } = req.params;

      const doctor = await models.Doctor.findByPk(id);
      if (!doctor) {
        throw new AppError('Doctor not found', 404, 'NOT_FOUND');
      }

      // Check access (doctor himself or system admin)
      if (req.user.role !== 'system_admin' && req.user.id !== doctor.userId) {
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
      }

      const patient = await models.Patient.findOne({
        where: { id: patientId, doctorId: id },
      });
      if (!patient) {
        throw new AppError('Patient not found', 404, 'NOT_FOUND');
      }

      // Remove doctor assignment (but keep patient record)
      await patient.update({
        doctorId: null,
        clinicId: null,
      });

      res.json({ message: 'Patient removed from doctor successfully' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get doctor chats
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async getChats(req, res, next) {
    try {
      const { id } = req.params;
      const { page = 1, limit = 20, status, type, search } = req.query;
      const offset = (page - 1) * limit;

      const doctor = await models.Doctor.findByPk(id);
      if (!doctor) {
        throw new AppError('Doctor not found', 404, 'NOT_FOUND');
      }

      // Check access (doctor himself or system admin)
      if (req.user.role !== 'system_admin' && req.user.id !== doctor.userId) {
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
      }

      const where = { doctorId: id };
      if (status) where.status = status;
      if (type) where.type = type;
      if (search) {
        where.title = { [models.Sequelize.Op.iLike]: `%${search}%` };
      }

      const chats = await models.Chat.findAndCountAll({
        where,
        include: [
          { model: models.Patient, as: 'patient', include: [{ model: models.User, as: 'user' }] },
          { model: models.Clinic, as: 'clinic' },
        ],
        order: [['lastMessageAt', 'DESC']],
        offset,
        limit,
      });

      res.json({
        data: chats.rows,
        pagination: {
          page,
          limit,
          total: chats.count,
          totalPages: Math.ceil(chats.count / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get doctor statistics
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async getStatistics(req, res, next) {
    try {
      const { id } = req.params;

      const doctor = await models.Doctor.findByPk(id);
      if (!doctor) {
        throw new AppError('Doctor not found', 404, 'NOT_FOUND');
      }

      // Check access (doctor himself or system admin)
      if (req.user.role !== 'system_admin' && req.user.id !== doctor.userId) {
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
      }

      const patientCount = await models.Patient.count({ where: { doctorId: id } });
      const chatCount = await models.Chat.count({ where: { doctorId: id } });
      const messageCount = await models.Message.count({ where: { senderId: doctor.userId } });
      const transactionCount = await models.Transaction.count({ where: { doctorId: id } });
      const totalRevenue = await models.Transaction.sum('doctorShare', { where: { doctorId: id, status: 'completed' } });
      const averageRating = doctor.averageRating || 0;
      const totalReviews = doctor.totalReviews || 0;

      res.json({
        doctor: doctor.user.fullName,
        statistics: {
          patients: patientCount,
          chats: chatCount,
          messages: messageCount,
          transactions: transactionCount,
          totalRevenue: totalRevenue || 0,
          averageRating,
          totalReviews,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Set doctor online status
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async setOnlineStatus(req, res, next) {
    try {
      const { isOnline } = req.body;

      const doctor = await models.Doctor.findOne({ where: { userId: req.user.id } });
      if (!doctor) {
        throw new AppError('Doctor profile not found', 404, 'NOT_FOUND');
      }

      await doctor.update({
        isOnline,
        lastOnlineAt: isOnline ? new Date() : doctor.lastOnlineAt,
      });

      res.json(doctor);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get doctor working hours
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async getWorkingHours(req, res, next) {
    try {
      const { id } = req.params;

      const doctor = await models.Doctor.findByPk(id);
      if (!doctor) {
        throw new AppError('Doctor not found', 404, 'NOT_FOUND');
      }

      res.json({
        workingHours: doctor.workingHours || [],
        convenientResponseTime: doctor.convenientResponseTime || '',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update doctor working hours
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async updateWorkingHours(req, res, next) {
    try {
      const { id } = req.params;
      const { workingHours, convenientResponseTime } = req.body;

      const doctor = await models.Doctor.findByPk(id);
      if (!doctor) {
        throw new AppError('Doctor not found', 404, 'NOT_FOUND');
      }

      // Check access (doctor himself or system admin)
      if (req.user.role !== 'system_admin' && req.user.id !== doctor.userId) {
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
      }

      await doctor.update({ workingHours, convenientResponseTime });

      res.json(doctor);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get doctor public key for encryption
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async getPublicKey(req, res, next) {
    try {
      const { id } = req.params;

      const doctor = await models.Doctor.findByPk(id, {
        include: [{ model: models.User, as: 'user' }],
      });

      if (!doctor) {
        throw new AppError('Doctor not found', 404, 'NOT_FOUND');
      }

      res.json({
        publicKey: doctor.user.publicKey,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Generate new encryption keys for doctor
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async generateEncryptionKeys(req, res, next) {
    try {
      const doctor = await models.Doctor.findOne({ where: { userId: req.user.id } });
      if (!doctor) {
        throw new AppError('Doctor profile not found', 404, 'NOT_FOUND');
      }

      // Generate new key pair
      const keyPair = CryptoService.generateX25519KeyPair();

      // Update user with new keys
      await models.User.update({
        publicKey: keyPair.publicKey,
        privateKey: keyPair.privateKey,
      }, { where: { id: req.user.id } });

      res.json({
        message: 'Encryption keys generated successfully',
        publicKey: keyPair.publicKey,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = DoctorController;
