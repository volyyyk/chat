/**
 * Patient Controller
 * Handles patient-related operations
 */

const models = require('../models');
const { AppError } = require('../middleware/errorHandler');

class PatientController {
  /**
   * Get patient by ID
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async getById(req, res, next) {
    try {
      const { id } = req.params;

      const patient = await models.Patient.findByPk(id, {
        include: [
          { model: models.User, as: 'user' },
          { model: models.Doctor, as: 'doctor', include: [{ model: models.User, as: 'user' }] },
          { model: models.Clinic, as: 'clinic' },
        ],
      });

      if (!patient) {
        throw new AppError('Patient not found', 404, 'NOT_FOUND');
      }

      // Check access (patient himself, doctor, clinic admin, or system admin)
      if (req.user.role !== 'system_admin' && 
          req.user.id !== patient.userId && 
          req.user.doctorId !== patient.doctorId &&
          req.user.clinicId !== patient.clinicId) {
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
      }

      res.json(patient);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get current patient profile
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async getProfile(req, res, next) {
    try {
      const patient = await models.Patient.findOne({
        where: { userId: req.user.id },
        include: [
          { model: models.User, as: 'user' },
          { model: models.Doctor, as: 'doctor', include: [{ model: models.User, as: 'user' }] },
          { model: models.Clinic, as: 'clinic' },
        ],
      });

      if (!patient) {
        throw new AppError('Patient profile not found', 404, 'NOT_FOUND');
      }

      res.json(patient);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update patient profile
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async updateProfile(req, res, next) {
    try {
      const patient = await models.Patient.findOne({ where: { userId: req.user.id } });
      if (!patient) {
        throw new AppError('Patient profile not found', 404, 'NOT_FOUND');
      }

      const data = req.body;
      await patient.update(data);

      res.json(patient);
    } catch (error) {
      next(error);
    }
  }

  /**
   * List patients (for doctor or clinic admin)
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async list(req, res, next) {
    try {
      const { page = 1, limit = 20, doctorId, clinicId, search, status } = req.query;
      const offset = (page - 1) * limit;

      const where = {};
      
      if (doctorId) where.doctorId = doctorId;
      if (clinicId) where.clinicId = clinicId;
      if (status) where.status = status;
      if (search) {
        where['$user.firstName$'] = { [models.Sequelize.Op.iLike]: `%${search}%` };
      }

      // For non-admin users, only show patients from their clinic or doctor
      if (req.user.role !== 'system_admin' && req.user.role !== 'clinic_admin') {
        where.doctorId = req.user.doctorId;
      }

      // For clinic admins, only show patients from their clinic
      if (req.user.role === 'clinic_admin') {
        const clinic = await models.Clinic.findOne({ where: { adminId: req.user.id } });
        if (clinic) where.clinicId = clinic.id;
      }

      const patients = await models.Patient.findAndCountAll({
        where,
        include: [
          { model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'avatar'] },
          { model: models.Doctor, as: 'doctor', include: [{ model: models.User, as: 'user' }] },
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
   * Get patient chats
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async getChats(req, res, next) {
    try {
      const { id } = req.params;
      const { page = 1, limit = 20, status, type, search } = req.query;
      const offset = (page - 1) * limit;

      const patient = await models.Patient.findByPk(id);
      if (!patient) {
        throw new AppError('Patient not found', 404, 'NOT_FOUND');
      }

      // Check access (patient himself, doctor, clinic admin, or system admin)
      if (req.user.role !== 'system_admin' && 
          req.user.id !== patient.userId && 
          req.user.doctorId !== patient.doctorId &&
          req.user.clinicId !== patient.clinicId) {
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
      }

      const where = { patientId: id };
      if (status) where.status = status;
      if (type) where.type = type;
      if (search) {
        where.title = { [models.Sequelize.Op.iLike]: `%${search}%` };
      }

      const chats = await models.Chat.findAndCountAll({
        where,
        include: [
          { model: models.Doctor, as: 'doctor', include: [{ model: models.User, as: 'user' }] },
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
   * Get patient statistics
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async getStatistics(req, res, next) {
    try {
      const { id } = req.params;

      const patient = await models.Patient.findByPk(id);
      if (!patient) {
        throw new AppError('Patient not found', 404, 'NOT_FOUND');
      }

      // Check access (patient himself, doctor, clinic admin, or system admin)
      if (req.user.role !== 'system_admin' && 
          req.user.id !== patient.userId && 
          req.user.doctorId !== patient.doctorId &&
          req.user.clinicId !== patient.clinicId) {
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
      }

      const chatCount = await models.Chat.count({ where: { patientId: id } });
      const messageCount = await models.Message.count({ where: { senderId: patient.userId } });
      const fileCount = await models.File.count({ where: { uploaderId: patient.userId } });
      const appointmentCount = await models.Appointment.count({ where: { patientId: id } });
      const transactionCount = await models.Transaction.count({ where: { patientId: id } });
      const totalSpent = await models.Transaction.sum('amount', { where: { patientId: id, status: 'completed' } });

      res.json({
        patient: patient.user.fullName,
        statistics: {
          chats: chatCount,
          messages: messageCount,
          files: fileCount,
          appointments: appointmentCount,
          transactions: transactionCount,
          totalSpent: totalSpent || 0,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get patient medical info
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async getMedicalInfo(req, res, next) {
    try {
      const { id } = req.params;

      const patient = await models.Patient.findByPk(id, {
        include: [{ model: models.User, as: 'user' }],
      });

      if (!patient) {
        throw new AppError('Patient not found', 404, 'NOT_FOUND');
      }

      // Check access (patient himself or doctor)
      if (req.user.role !== 'system_admin' && 
          req.user.id !== patient.userId && 
          req.user.doctorId !== patient.doctorId) {
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
      }

      res.json({
        medicalHistory: patient.medicalHistory,
        allergies: patient.allergies,
        chronicConditions: patient.chronicConditions,
        bloodType: patient.bloodType,
        dateOfBirth: patient.dateOfBirth,
        gender: patient.gender,
        age: patient.age,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update patient medical info
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async updateMedicalInfo(req, res, next) {
    try {
      const { id } = req.params;

      const patient = await models.Patient.findByPk(id);
      if (!patient) {
        throw new AppError('Patient not found', 404, 'NOT_FOUND');
      }

      // Check access (patient himself or doctor)
      if (req.user.role !== 'system_admin' && 
          req.user.id !== patient.userId && 
          req.user.doctorId !== patient.doctorId) {
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
      }

      const data = req.body;
      await patient.update(data);

      res.json(patient);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get patient files
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async getFiles(req, res, next) {
    try {
      const { id } = req.params;
      const { page = 1, limit = 20, category, visibility } = req.query;
      const offset = (page - 1) * limit;

      const patient = await models.Patient.findByPk(id);
      if (!patient) {
        throw new AppError('Patient not found', 404, 'NOT_FOUND');
      }

      // Check access (patient himself, doctor, clinic admin, or system admin)
      if (req.user.role !== 'system_admin' && 
          req.user.id !== patient.userId && 
          req.user.doctorId !== patient.doctorId &&
          req.user.clinicId !== patient.clinicId) {
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
      }

      const where = { patientId: id };
      if (category) where.category = category;
      if (visibility) where.visibility = visibility;

      const files = await models.File.findAndCountAll({
        where,
        include: [
          { model: models.Chat, as: 'chat' },
          { model: models.Message, as: 'message' },
          { model: models.User, as: 'uploader' },
        ],
        order: [['createdAt', 'DESC']],
        offset,
        limit,
      });

      res.json({
        data: files.rows,
        pagination: {
          page,
          limit,
          total: files.count,
          totalPages: Math.ceil(files.count / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get patient public key for encryption
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async getPublicKey(req, res, next) {
    try {
      const { id } = req.params;

      const patient = await models.Patient.findByPk(id, {
        include: [{ model: models.User, as: 'user' }],
      });

      if (!patient) {
        throw new AppError('Patient not found', 404, 'NOT_FOUND');
      }

      res.json({
        publicKey: patient.user.publicKey,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Generate new encryption keys for patient
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async generateEncryptionKeys(req, res, next) {
    try {
      const patient = await models.Patient.findOne({ where: { userId: req.user.id } });
      if (!patient) {
        throw new AppError('Patient profile not found', 404, 'NOT_FOUND');
      }

      const CryptoService = require('../services/cryptoService');
      const keyPair = CryptoService.generateX25519KeyPair();

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

module.exports = PatientController;
