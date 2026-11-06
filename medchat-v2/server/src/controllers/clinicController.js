/**
 * Clinic Controller
 * Handles clinic-related operations
 */

const models = require('../models');
const { AppError } = require('../middleware/errorHandler');
const { validate } = require('../middleware/validation');
const {
  createClinicSchema,
  updateClinicSchema,
  listClinicSchema,
  verifyDoctorSchema,
} = require('../validators/clinic');

class ClinicController {
  /**
   * Create new clinic
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async create(req, res, next) {
    try {
      const data = req.validatedData;
      const userId = req.user.id;

      // Check if user is system admin
      if (req.user.role !== 'system_admin') {
        throw new AppError(
          'Only system administrators can create clinics',
          403,
          'AUTHORIZATION_ERROR'
        );
      }

      // Check if clinic code already exists
      const existingClinic = await models.Clinic.findOne({ where: { code: data.code } });
      if (existingClinic) {
        throw new AppError('Clinic with this code already exists', 409, 'DUPLICATE_ERROR');
      }

      // Create clinic
      const clinic = await models.Clinic.create({
        ...data,
        adminId: userId,
      });

      res.status(201).json(clinic);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get clinic by ID
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async getById(req, res, next) {
    try {
      const { id } = req.params;

      const clinic = await models.Clinic.findByPk(id, {
        include: [
          { model: models.User, as: 'admin' },
          { model: models.Doctor, as: 'doctors', include: [{ model: models.User, as: 'user' }] },
          { model: models.ClinicSpecialty, as: 'specialties', include: [{ model: models.Specialty, as: 'specialty' }] },
        ],
      });

      if (!clinic) {
        throw new AppError('Clinic not found', 404, 'NOT_FOUND');
      }

      // Check access (admin, doctor, or system admin)
      if (req.user.role !== 'system_admin' && 
          req.user.clinicId !== clinic.id && 
          req.user.id !== clinic.adminId) {
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
      }

      res.json(clinic);
    } catch (error) {
      next(error);
    }
  }

  /**
   * List clinics
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async list(req, res, next) {
    try {
      const { page, limit, city, region, verified, search, status } = req.validatedData;
      const offset = (page - 1) * limit;

      // Build where clause
      const where = {};
      if (city) where.city = city;
      if (region) where.region = region;
      if (verified !== undefined) where.verified = verified;
      if (status) where.status = status;
      if (search) {
        where.name = { [models.Sequelize.Op.iLike]: `%${search}%` };
      }

      // For non-admin users, only show their clinic
      if (req.user.role !== 'system_admin' && req.user.role !== 'clinic_admin') {
        where.id = req.user.clinicId;
      }

      // For clinic admins, only show their clinic
      if (req.user.role === 'clinic_admin') {
        where.adminId = req.user.id;
      }

      const clinics = await models.Clinic.findAndCountAll({
        where,
        include: [
          { model: models.User, as: 'admin' },
          { model: models.Doctor, as: 'doctors', attributes: ['id', 'userId'] },
        ],
        order: [['name', 'ASC']],
        offset,
        limit,
      });

      res.json({
        data: clinics.rows,
        pagination: {
          page,
          limit,
          total: clinics.count,
          totalPages: Math.ceil(clinics.count / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update clinic
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async update(req, res, next) {
    try {
      const { id } = req.params;
      const data = req.validatedData;

      const clinic = await models.Clinic.findByPk(id);
      if (!clinic) {
        throw new AppError('Clinic not found', 404, 'NOT_FOUND');
      }

      // Check access (admin or system admin)
      if (req.user.role !== 'system_admin' && req.user.id !== clinic.adminId) {
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
      }

      await clinic.update(data);

      res.json(clinic);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete clinic
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async delete(req, res, next) {
    try {
      const { id } = req.params;

      const clinic = await models.Clinic.findByPk(id);
      if (!clinic) {
        throw new AppError('Clinic not found', 404, 'NOT_FOUND');
      }

      // Check access (only system admin can delete clinics)
      if (req.user.role !== 'system_admin') {
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
      }

      // Soft delete
      await clinic.update({ status: 'deleted' });

      res.json({ message: 'Clinic deleted successfully' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get clinic doctors
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async getDoctors(req, res, next) {
    try {
      const { id } = req.params;
      const { page = 1, limit = 20, verified, search } = req.query;
      const offset = (page - 1) * limit;

      const clinic = await models.Clinic.findByPk(id);
      if (!clinic) {
        throw new AppError('Clinic not found', 404, 'NOT_FOUND');
      }

      // Check access
      if (req.user.role !== 'system_admin' && 
          req.user.clinicId !== clinic.id && 
          req.user.id !== clinic.adminId) {
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
      }

      const where = { clinicId: id };
      if (verified !== undefined) where.verified = verified;
      if (search) {
        where['$user.firstName$'] = { [models.Sequelize.Op.iLike]: `%${search}%` };
      }

      const doctors = await models.Doctor.findAndCountAll({
        where,
        include: [
          { model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'avatar'] },
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
   * Invite doctor to clinic
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async inviteDoctor(req, res, next) {
    try {
      const { id } = req.params;
      const { email, firstName, lastName, specialties, message } = req.body;

      const clinic = await models.Clinic.findByPk(id);
      if (!clinic) {
        throw new AppError('Clinic not found', 404, 'NOT_FOUND');
      }

      // Check access (clinic admin or system admin)
      if (req.user.role !== 'system_admin' && req.user.id !== clinic.adminId) {
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
      }

      // Check if user already exists
      let user = await models.User.findOne({ where: { email } });
      
      if (!user) {
        // Create user
        user = await models.User.create({
          email,
          firstName,
          lastName,
          role: 'doctor',
          status: 'pending',
          clinicCode: clinic.code,
        });

        // Create doctor profile
        await models.Doctor.create({
          userId: user.id,
          clinicId: clinic.id,
          invitationStatus: 'pending',
          invitedAt: new Date(),
        });
      } else {
        // Check if user already has a doctor profile for this clinic
        const existingDoctor = await models.Doctor.findOne({
          where: { userId: user.id, clinicId: clinic.id },
        });

        if (existingDoctor) {
          throw new AppError('Doctor already invited to this clinic', 409, 'DUPLICATE_ERROR');
        }

        // Create doctor profile
        await models.Doctor.create({
          userId: user.id,
          clinicId: clinic.id,
          invitationStatus: 'pending',
          invitedAt: new Date(),
        });

        // Update user clinic code
        await user.update({ clinicCode: clinic.code });
      }

      // TODO: Send invitation email
      logger.info(`Doctor invitation sent to ${email} for clinic ${clinic.name}`);

      res.json({ message: 'Doctor invitation sent successfully' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Verify doctor in clinic
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async verifyDoctor(req, res, next) {
    try {
      const { id, doctorId } = req.params;
      const { verified, notes } = req.validatedData;

      const clinic = await models.Clinic.findByPk(id);
      if (!clinic) {
        throw new AppError('Clinic not found', 404, 'NOT_FOUND');
      }

      // Check access (clinic admin or system admin)
      if (req.user.role !== 'system_admin' && req.user.id !== clinic.adminId) {
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
      }

      const doctor = await models.Doctor.findOne({
        where: { id: doctorId, clinicId: clinic.id },
        include: [{ model: models.User, as: 'user' }],
      });

      if (!doctor) {
        throw new AppError('Doctor not found in this clinic', 404, 'NOT_FOUND');
      }

      await doctor.update({
        verified,
        verificationDate: verified ? new Date() : null,
        verifiedBy: verified ? req.user.id : null,
        verificationNotes: notes,
        invitationStatus: verified ? 'accepted' : 'rejected',
      });

      // Update user status
      if (verified) {
        await doctor.user.update({ status: 'active' });
      }

      res.json({ message: 'Doctor verification updated successfully', doctor });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get clinic statistics
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async getStatistics(req, res, next) {
    try {
      const { id } = req.params;

      const clinic = await models.Clinic.findByPk(id);
      if (!clinic) {
        throw new AppError('Clinic not found', 404, 'NOT_FOUND');
      }

      // Check access
      if (req.user.role !== 'system_admin' && 
          req.user.clinicId !== clinic.id && 
          req.user.id !== clinic.adminId) {
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
      }

      // Get statistics
      const doctorCount = await models.Doctor.count({ where: { clinicId: clinic.id } });
      const patientCount = await models.Patient.count({ where: { clinicId: clinic.id } });
      const chatCount = await models.Chat.count({ where: { clinicId: clinic.id } });
      const messageCount = await models.Message.count({ where: { clinicId: clinic.id } });
      const transactionCount = await models.Transaction.count({ where: { clinicId: clinic.id } });
      const totalRevenue = await models.Transaction.sum('clinicShare', { where: { clinicId: clinic.id, status: 'completed' } });

      res.json({
        clinic: clinic.name,
        statistics: {
          doctors: doctorCount,
          patients: patientCount,
          chats: chatCount,
          messages: messageCount,
          transactions: transactionCount,
          totalRevenue: totalRevenue || 0,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update clinic settings
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async updateSettings(req, res, next) {
    try {
      const { id } = req.params;
      const data = req.body;

      const clinic = await models.Clinic.findByPk(id);
      if (!clinic) {
        throw new AppError('Clinic not found', 404, 'NOT_FOUND');
      }

      // Check access (clinic admin or system admin)
      if (req.user.role !== 'system_admin' && req.user.id !== clinic.adminId) {
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
      }

      // Update only allowed fields
      const allowedFields = [
        'workingHours', 'logo', 'banner', 'subscriptionPlan',
        'doctorSharePercent', 'clinicSharePercent',
        'yooMoneyEnabled', 'tinkoffEnabled', 'stripeEnabled',
        'yooMoneyShopId', 'yooMoneySecretKey',
        'tinkoffTerminalKey', 'tinkoffPassword',
        'stripeSecretKey', 'stripePublishableKey',
      ];

      const updateData = {};
      for (const field of allowedFields) {
        if (data[field] !== undefined) {
          updateData[field] = data[field];
        }
      }

      await clinic.update(updateData);

      res.json(clinic);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = ClinicController;
