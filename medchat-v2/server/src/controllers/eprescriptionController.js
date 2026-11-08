/**
 * E-Prescription Controller
 * Handles electronic prescription creation, management, and sharing
 */

const models = require('../models');
const { AppError } = require('../middleware/errorHandler');
const CryptoService = require('../services/cryptoService');
const { Op } = require('sequelize');

class EPrescriptionController {
  /**
   * Create e-prescription
   */
  static async create(req, res, next) {
    try {
      const {
        patientId,
        appointmentId,
        type = 'medication',
        title,
        description,
        medications = [],
        dosage,
        duration,
        instructions,
        diagnosis,
        notes,
        validUntil,
        priority = 'normal',
      } = req.body;

      const doctorId = req.user.doctorId;
      if (!doctorId) {
        throw new AppError('Only doctors can manage e-prescriptions', 403, 'FORBIDDEN');
      }

      // Validate required fields
      if (!patientId) {
        throw new AppError('Patient ID is required', 400, 'VALIDATION_ERROR');
      }

      // Check if patient exists
      const patient = await models.Patient.findOne({ where: { id: patientId } });
      if (!patient) {
        throw new AppError('Patient not found', 404, 'NOT_FOUND');
      }

      // Check if appointment exists (optional)
      if (appointmentId) {
        const appointment = await models.Appointment.findOne({ where: { id: appointmentId } });
        if (!appointment) {
          throw new AppError('Appointment not found', 404, 'NOT_FOUND');
        }
      }

      // Validate medications format
      if (type === 'medication' && medications.length === 0) {
        throw new AppError('At least one medication is required for medication prescriptions', 400, 'VALIDATION_ERROR');
      }

      // Calculate valid until date (default: 30 days from now)
      const validUntilDate = validUntil ? new Date(validUntil) : new Date();
      validUntilDate.setDate(validUntilDate.getDate() + 30);

      // Generate unique prescription number
      const prescriptionNumber = `EP-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

      // Create e-prescription
      const eprescription = await models.EPrescription.create({
        prescriptionNumber,
        doctorId,
        patientId,
        appointmentId,
        type,
        title,
        description,
        medications,
        dosage,
        duration,
        instructions: instructions || req.body.recommendations || undefined,
        diagnosis,
        notes,
        validUntil: validUntilDate,
        priority,
        status: 'active',
        createdBy: req.user.id,
      });

      // Load full e-prescription data
      const fullEprescription = await models.EPrescription.findOne({
        where: { id: eprescription.id },
        include: [
          { model: models.Doctor, as: 'doctor', include: [{ model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'fullName'] }] },
          { model: models.Patient, as: 'patient' },
          { model: models.Appointment, as: 'appointment' },
        ],
      });

      res.status(201).json({
        success: true,
        data: fullEprescription,
        message: 'E-Prescription created successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * List e-prescriptions
   */
  static async list(req, res, next) {
    try {
      const {
        doctorId,
        patientId,
        appointmentId,
        type,
        status,
        page = 1,
        limit = 20,
      } = req.query;

      const where = {};

      // Access control for non-admin users
      if (req.user.role !== 'system_admin') {
        if (req.user.doctorId) {
          where.doctorId = req.user.doctorId;
        }
        if (req.user.patientId) {
          where.patientId = req.user.patientId;
        }
      }

      if (doctorId) where.doctorId = doctorId;
      if (patientId) where.patientId = patientId;
      if (appointmentId) where.appointmentId = appointmentId;
      if (type) where.type = type;
      if (status) where.status = status;

      const offset = (page - 1) * limit;

      const { count, rows } = await models.EPrescription.findAndCountAll({
        where,
        include: [
          { model: models.Doctor, as: 'doctor', attributes: ['id', 'userId'], include: [{ model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'fullName'] }] },
          { model: models.Patient, as: 'patient', attributes: ['id', 'userId'], include: [{ model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'fullName'] }] },
          { model: models.Appointment, attributes: ['id', 'startTime'] },
        ],
        order: [['createdAt', 'DESC']],
        offset,
        limit: parseInt(limit),
      });

      res.json({
        success: true,
        data: rows,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(count / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get e-prescription by ID
   */
  static async getById(req, res, next) {
    try {
      const { id } = req.params;

      const eprescription = await models.EPrescription.findOne({
        where: { id },
        include: [
          { model: models.Doctor, as: 'doctor', include: [{ model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'fullName'] }] },
          { model: models.Patient, as: 'patient' },
          { model: models.Appointment, as: 'appointment' },
        ],
      });

      if (!eprescription) {
        throw new AppError('E-Prescription not found', 404, 'NOT_FOUND');
      }

      // Access control
      if (req.user.role !== 'system_admin' &&
          eprescription.doctorId !== req.user.doctorId &&
          eprescription.patientId !== req.user.patientId) {
        throw new AppError('Cannot access this e-prescription', 403, 'FORBIDDEN');
      }

      // Parse medications
      const data = eprescription.toJSON();
      if (data.medications) {
        data.medications = Array.isArray(data.medications) ? data.medications : JSON.parse(data.medications);
      }

      res.json({
        success: true,
        data: data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update e-prescription
   */
  static async update(req, res, next) {
    try {
      const { id } = req.params;
      const {
        title,
        description,
        medications,
        dosage,
        duration,
        instructions,
        diagnosis,
        notes,
        validUntil,
        priority,
      } = req.body;

      const eprescription = await models.EPrescription.findOne({ where: { id } });

      if (!eprescription) {
        throw new AppError('E-Prescription not found', 404, 'NOT_FOUND');
      }

      // Access control - only doctor or admin can update
      if (req.user.role !== 'system_admin' && eprescription.doctorId !== req.user.doctorId) {
        throw new AppError('Cannot update this e-prescription', 403, 'FORBIDDEN');
      }

      // Cannot update fulfilled or cancelled prescriptions
      if (eprescription.status === 'fulfilled' || eprescription.status === 'cancelled') {
        throw new AppError('Cannot update a fulfilled or cancelled e-prescription', 400, 'VALIDATION_ERROR');
      }

      // Validate medications format
      if (medications && eprescription.type === 'medication' && medications.length === 0) {
        throw new AppError('At least one medication is required for medication prescriptions', 400, 'VALIDATION_ERROR');
      }

      await eprescription.update({
        title: title !== undefined ? title : eprescription.title,
        description: description !== undefined ? description : eprescription.description,
        medications: medications !== undefined ? medications : eprescription.medications,
        dosage: dosage !== undefined ? dosage : eprescription.dosage,
        duration: duration !== undefined ? duration : eprescription.duration,
        instructions: instructions !== undefined ? instructions : eprescription.instructions,
        diagnosis: diagnosis !== undefined ? diagnosis : eprescription.diagnosis,
        notes: notes !== undefined ? notes : eprescription.notes,
        validUntil: validUntil ? new Date(validUntil) : eprescription.validUntil,
        priority: priority || eprescription.priority,
      });

      // Load full e-prescription data
      const fullEprescription = await models.EPrescription.findOne({
        where: { id },
        include: [
          { model: models.Doctor, as: 'doctor', include: [{ model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'fullName'] }] },
          { model: models.Patient, as: 'patient' },
          { model: models.Appointment, as: 'appointment' },
        ],
      });

      // Parse medications
      const data = fullEprescription.toJSON();
      if (data.medications) {
        data.medications = Array.isArray(data.medications) ? data.medications : JSON.parse(data.medications);
      }

      res.json({
        success: true,
        data: data,
        message: 'E-Prescription updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Cancel e-prescription
   */
  static async cancel(req, res, next) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const eprescription = await models.EPrescription.findOne({ where: { id } });

      if (!eprescription) {
        throw new AppError('E-Prescription not found', 404, 'NOT_FOUND');
      }

      // Access control - only doctor or admin can cancel
      if (req.user.role !== 'system_admin' && eprescription.doctorId !== req.user.doctorId) {
        throw new AppError('Cannot cancel this e-prescription', 403, 'FORBIDDEN');
      }

      // Cannot cancel fulfilled or already cancelled prescriptions
      if (eprescription.status === 'fulfilled' || eprescription.status === 'cancelled') {
        throw new AppError('Cannot cancel a fulfilled or already cancelled e-prescription', 400, 'VALIDATION_ERROR');
      }

      await eprescription.update({
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelledBy: req.user.id,
        cancellationReason: reason,
      });

      // Load full e-prescription data
      const fullEprescription = await models.EPrescription.findOne({
        where: { id },
        include: [
          { model: models.Doctor, as: 'doctor', include: [{ model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'fullName'] }] },
          { model: models.Patient, as: 'patient' },
          { model: models.Appointment, as: 'appointment' },
        ],
      });

      // Parse medications
      const data = fullEprescription.toJSON();
      if (data.medications) {
        data.medications = Array.isArray(data.medications) ? data.medications : JSON.parse(data.medications);
      }

      res.json({
        success: true,
        data: data,
        message: 'E-Prescription cancelled successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Mark e-prescription as fulfilled
   */
  static async fulfill(req, res, next) {
    try {
      const { id } = req.params;
      const {
        fulfilledBy,
        fulfilledAt,
        notes,
        pharmacyId,
        pharmacyName,
      } = req.body;

      const eprescription = await models.EPrescription.findOne({ where: { id } });

      if (!eprescription) {
        throw new AppError('E-Prescription not found', 404, 'NOT_FOUND');
      }

      // Access control - only the doctor of this prescription or an admin can fulfill
      if (req.user.role !== 'system_admin' &&
          eprescription.doctorId !== req.user.doctorId) {
        throw new AppError('Cannot fulfill this e-prescription', 403, 'FORBIDDEN');
      }

      // Cannot fulfill cancelled prescriptions
      if (eprescription.status === 'cancelled') {
        throw new AppError('Cannot fulfill a cancelled e-prescription', 400, 'VALIDATION_ERROR');
      }

      // Cannot fulfill expired prescriptions
      if (eprescription.validUntil < new Date()) {
        throw new AppError('Cannot fulfill an expired e-prescription', 400, 'VALIDATION_ERROR');
      }

      await eprescription.update({
        status: 'fulfilled',
        fulfilledAt: fulfilledAt || new Date(),
        fulfilledBy: fulfilledBy || req.user.id,
        fulfillmentNotes: notes,
        pharmacyId,
        pharmacyName,
      });

      // Load full e-prescription data
      const fullEprescription = await models.EPrescription.findOne({
        where: { id },
        include: [
          { model: models.Doctor, as: 'doctor', include: [{ model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'fullName'] }] },
          { model: models.Patient, as: 'patient' },
          { model: models.Appointment, as: 'appointment' },
        ],
      });

      // Parse medications
      const data = fullEprescription.toJSON();
      if (data.medications) {
        data.medications = Array.isArray(data.medications) ? data.medications : JSON.parse(data.medications);
      }

      res.json({
        success: true,
        data: data,
        message: 'E-Prescription marked as fulfilled successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete e-prescription
   */
  static async delete(req, res, next) {
    try {
      const { id } = req.params;

      const eprescription = await models.EPrescription.findOne({ where: { id } });

      if (!eprescription) {
        throw new AppError('E-Prescription not found', 404, 'NOT_FOUND');
      }

      // Access control - only doctor or admin can delete
      if (req.user.role !== 'system_admin' && eprescription.doctorId !== req.user.doctorId) {
        throw new AppError('Cannot delete this e-prescription', 403, 'FORBIDDEN');
      }

      // Soft delete
      await eprescription.update({
        deleted: true,
        deletedAt: new Date(),
        deletedBy: req.user.id,
      });

      res.json({
        success: true,
        message: 'E-Prescription deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get e-prescription as PDF
   */
  static async getPDF(req, res, next) {
    try {
      const { id } = req.params;

      const eprescription = await models.EPrescription.findOne({
        where: { id },
        include: [
          { model: models.Doctor, as: 'doctor', include: [{ model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'fullName'] }] },
          { model: models.Patient, as: 'patient' },
          { model: models.Appointment, as: 'appointment' },
        ],
      });

      if (!eprescription) {
        throw new AppError('E-Prescription not found', 404, 'NOT_FOUND');
      }

      // Access control
      if (req.user.role !== 'system_admin' &&
          eprescription.doctorId !== req.user.doctorId &&
          eprescription.patientId !== req.user.patientId) {
        throw new AppError('Cannot access this e-prescription', 403, 'FORBIDDEN');
      }

      // Parse medications
      const data = eprescription.toJSON();
      if (data.medications) {
        data.medications = Array.isArray(data.medications) ? data.medications : JSON.parse(data.medications);
      }

      // Generate PDF (simplified - in production use a PDF library)
      const pdfContent = this.generatePDFContent(data);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="e-prescription_${eprescription.prescriptionNumber}.pdf"`);
      res.send(pdfContent);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get printable version
   */
  static async getPrintable(req, res, next) {
    try {
      const { id } = req.params;

      const eprescription = await models.EPrescription.findOne({
        where: { id },
        include: [
          { model: models.Doctor, as: 'doctor', include: [{ model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'fullName'] }] },
          { model: models.Patient, as: 'patient' },
          { model: models.Appointment, as: 'appointment' },
        ],
      });

      if (!eprescription) {
        throw new AppError('E-Prescription not found', 404, 'NOT_FOUND');
      }

      // Access control
      if (req.user.role !== 'system_admin' &&
          eprescription.doctorId !== req.user.doctorId &&
          eprescription.patientId !== req.user.patientId) {
        throw new AppError('Cannot access this e-prescription', 403, 'FORBIDDEN');
      }

      // Parse medications
      const data = eprescription.toJSON();
      if (data.medications) {
        data.medications = Array.isArray(data.medications) ? data.medications : JSON.parse(data.medications);
      }

      // Generate HTML for printing
      const htmlContent = this.generatePrintableContent(data);

      res.setHeader('Content-Type', 'text/html');
      res.send(htmlContent);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Send e-prescription to patient
   */
  static async send(req, res, next) {
    try {
      const { id } = req.params;
      const {
        sendVia = 'chat',
        message,
      } = req.body;

      const eprescription = await models.EPrescription.findOne({ where: { id } });

      if (!eprescription) {
        throw new AppError('E-Prescription not found', 404, 'NOT_FOUND');
      }

      // Access control - only doctor or admin can send
      if (req.user.role !== 'system_admin' && eprescription.doctorId !== req.user.doctorId) {
        throw new AppError('Cannot send this e-prescription', 403, 'FORBIDDEN');
      }

      // In production, this would send via the specified method
      // For now, just mark as sent
      await eprescription.update({
        sent: true,
        sentAt: new Date(),
        sentBy: req.user.id,
        sentVia: sendVia,
        sentMessage: message,
      });

      // Create a message in the chat if sending via chat
      if (sendVia === 'chat') {
        const chat = await models.Chat.findOne({
          where: {
            doctorId: eprescription.doctorId,
            patientId: eprescription.patientId,
          },
        });

        if (chat) {
          const patient = await models.Patient.findByPk(eprescription.patientId);
          await models.Message.create({
            chatId: chat.id,
            senderId: req.user.id,
            receiverId: patient ? patient.userId : null,
            type: 'prescription',
            content: message || `Электронный рецепт #${eprescription.prescriptionNumber}`,
            metadata: {
              prescriptionId: eprescription.id,
              prescriptionNumber: eprescription.prescriptionNumber,
            },
          });
        }
      }

      // Load full e-prescription data
      const fullEprescription = await models.EPrescription.findOne({
        where: { id },
        include: [
          { model: models.Doctor, as: 'doctor', include: [{ model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'fullName'] }] },
          { model: models.Patient, as: 'patient' },
          { model: models.Appointment, as: 'appointment' },
        ],
      });

      // Parse medications
      const data = fullEprescription.toJSON();
      if (data.medications) {
        data.medications = Array.isArray(data.medications) ? data.medications : JSON.parse(data.medications);
      }

      res.json({
        success: true,
        data: data,
        message: `E-Prescription sent via ${sendVia} successfully`,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get e-prescriptions by doctor
   */
  static async getByDoctor(req, res, next) {
    try {
      const { doctorId } = req.params;
      const {
        status,
        type,
        page = 1,
        limit = 20,
      } = req.query;

      // Access control
      if (doctorId !== req.user.doctorId && req.user.role !== 'system_admin') {
        throw new AppError('Cannot access other doctor e-prescriptions', 403, 'FORBIDDEN');
      }

      const where = { doctorId };

      if (status) where.status = status;
      if (type) where.type = type;

      const offset = (page - 1) * limit;

      const { count, rows } = await models.EPrescription.findAndCountAll({
        where,
        include: [
          { model: models.Doctor, as: 'doctor', attributes: ['id', 'userId'], include: [{ model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'fullName'] }] },
          { model: models.Patient, as: 'patient', attributes: ['id', 'userId'], include: [{ model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'fullName'] }] },
          { model: models.Appointment, attributes: ['id', 'startTime'] },
        ],
        order: [['createdAt', 'DESC']],
        offset,
        limit: parseInt(limit),
      });

      // Parse medications for each
      const data = rows.map(r => {
        const row = r.toJSON();
        if (row.medications) {
          row.medications = Array.isArray(row.medications) ? row.medications : JSON.parse(row.medications);
        }
        return row;
      });

      res.json({
        success: true,
        data,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(count / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get e-prescriptions by patient
   */
  static async getByPatient(req, res, next) {
    try {
      const { patientId } = req.params;
      const {
        status,
        type,
        page = 1,
        limit = 20,
      } = req.query;

      // Access control
      if (patientId !== req.user.patientId && req.user.role !== 'system_admin') {
        throw new AppError('Cannot access other patient e-prescriptions', 403, 'FORBIDDEN');
      }

      const where = { patientId };

      if (status) where.status = status;
      if (type) where.type = type;

      const offset = (page - 1) * limit;

      const { count, rows } = await models.EPrescription.findAndCountAll({
        where,
        include: [
          { model: models.Doctor, as: 'doctor', include: [{ model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'fullName'] }] },
          { model: models.Patient, as: 'patient', attributes: ['id', 'userId'], include: [{ model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'fullName'] }] },
          { model: models.Appointment, attributes: ['id', 'startTime'] },
        ],
        order: [['createdAt', 'DESC']],
        offset,
        limit: parseInt(limit),
      });

      // Parse medications for each
      const data = rows.map(r => {
        const row = r.toJSON();
        if (row.medications) {
          row.medications = Array.isArray(row.medications) ? row.medications : JSON.parse(row.medications);
        }
        return row;
      });

      res.json({
        success: true,
        data,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(count / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Sign e-prescription with the doctor's electronic signature.
   * Moves the prescription from draft to active (the mobile client treats
   * status === 'active' as "signed").
   */
  static async sign(req, res, next) {
    try {
      const { id } = req.params;
      const { signature } = req.body;

      const eprescription = await models.EPrescription.findOne({ where: { id } });

      if (!eprescription) {
        throw new AppError('E-Prescription not found', 404, 'NOT_FOUND');
      }

      // Access control - only the doctor of this prescription or an admin
      if (req.user.role !== 'system_admin' && eprescription.doctorId !== req.user.doctorId) {
        throw new AppError('Cannot sign this e-prescription', 403, 'FORBIDDEN');
      }

      if (eprescription.status === 'cancelled') {
        throw new AppError('Cannot sign a cancelled e-prescription', 400, 'VALIDATION_ERROR');
      }

      if (eprescription.status === 'active') {
        return res.json({
          success: true,
          data: eprescription,
          message: 'E-Prescription is already signed',
        });
      }

      await eprescription.update({
        status: 'active',
      });

      // Audit trail
      try {
        await models.AuditLog.create({
          userId: req.user.id,
          doctorId: eprescription.doctorId,
          patientId: eprescription.patientId,
          action: 'eprescription_signed',
          entityType: 'eprescription',
          entityId: eprescription.id,
          metadata: {
            eprescriptionId: eprescription.id,
            prescriptionNumber: eprescription.prescriptionNumber,
            signatureProvided: Boolean(signature),
          },
        });
      } catch (auditError) {
        const logger = require('../utils/logger');
        logger.warn('Failed to write audit log for e-prescription signing: ' + auditError.message);
      }

      const fullEprescription = await models.EPrescription.findOne({
        where: { id },
        include: [
          { model: models.Doctor, as: 'doctor', include: [{ model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'fullName'] }] },
          { model: models.Patient, as: 'patient', attributes: ['id', 'userId'], include: [{ model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'fullName'] }] },
          { model: models.Appointment, as: 'appointment' },
        ],
      });

      res.json({
        success: true,
        data: fullEprescription,
        message: 'E-Prescription signed successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get e-prescription statistics
   */
  static async getStatistics(req, res, next) {
    try {
      const {
        doctorId,
        clinicId,
        startDate,
        endDate,
      } = req.query;

      const where = {};

      if (doctorId) {
        if (doctorId !== req.user.doctorId && req.user.role !== 'system_admin') {
          throw new AppError('Cannot access other doctor statistics', 403, 'FORBIDDEN');
        }
        where.doctorId = doctorId;
      } else if (req.user.doctorId) {
        where.doctorId = req.user.doctorId;
      }

      if (clinicId) where.clinicId = clinicId;

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt[Op.gte] = new Date(startDate);
        if (endDate) where.createdAt[Op.lte] = new Date(endDate);
      }

      // Get counts by status
      const byStatus = await models.EPrescription.findAll({
        where,
        attributes: ['status', [models.Sequelize.fn('COUNT', models.Sequelize.col('id')), 'count']],
        group: ['status'],
        raw: true,
      });

      // Get counts by type
      const byType = await models.EPrescription.findAll({
        where,
        attributes: ['type', [models.Sequelize.fn('COUNT', models.Sequelize.col('id')), 'count']],
        group: ['type'],
        raw: true,
      });

      // Get total
      const total = await models.EPrescription.count({ where });

      // Get recent prescriptions
      const recent = await models.EPrescription.findAll({
        where,
        include: [
          { model: models.Doctor, as: 'doctor', attributes: ['id', 'userId'], include: [{ model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'fullName'] }] },
          { model: models.Patient, as: 'patient', attributes: ['id', 'userId'], include: [{ model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'fullName'] }] },
        ],
        order: [['createdAt', 'DESC']],
        limit: 5,
      });

      // Parse medications for recent
      const recentData = recent.map(r => {
        const row = r.toJSON();
        if (row.medications) {
          row.medications = Array.isArray(row.medications) ? row.medications : JSON.parse(row.medications);
        }
        return row;
      });

      res.json({
        success: true,
        data: {
          total,
          byStatus: byStatus.reduce((acc, item) => {
            acc[item.status] = item.count;
            return acc;
          }, {}),
          byType: byType.reduce((acc, item) => {
            acc[item.type] = item.count;
            return acc;
          }, {}),
          recent: recentData,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Generate PDF content (simplified)
   */
  static generatePDFContent(eprescription) {
    // In production, use a PDF library like pdfkit or puppeteer
    // This is a placeholder that returns a simple PDF
    const content = `
%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 44 >>
stream
BT /F1 12 Tf 100 700 Td (E-Prescription #${eprescription.prescriptionNumber}) Tj ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000010 00000 n 
0000000058 00000 n 
0000000106 00000 n 
0000000154 00000 n 
trailer
<< /Size 5 /Root 1 0 R >>
startxref
202
%%EOF
    `;
    return content;
  }

  /**
   * Generate printable HTML content
   */
  static generatePrintableContent(eprescription) {
    const medicationsHtml = eprescription.medications
      ? `<h3>Лекарственные препараты:</h3>
         <table style="width: 100%; border-collapse: collapse;">
           <tr style="background: #f5f5f5;">
             <th style="padding: 8px; border: 1px solid #ddd;">Название</th>
             <th style="padding: 8px; border: 1px solid #ddd;">Дозировка</th>
             <th style="padding: 8px; border: 1px solid #ddd;">Продолжительность</th>
             <th style="padding: 8px; border: 1px solid #ddd;">Инструкции</th>
           </tr>
           ${eprescription.medications.map(med => `
             <tr>
               <td style="padding: 8px; border: 1px solid #ddd;">${med.name || 'N/A'}</td>
               <td style="padding: 8px; border: 1px solid #ddd;">${med.dosage || 'N/A'}</td>
               <td style="padding: 8px; border: 1px solid #ddd;">${med.duration || 'N/A'}</td>
               <td style="padding: 8px; border: 1px solid #ddd;">${med.instructions || 'N/A'}</td>
             </tr>
           `).join('')}
         </table>`
      : '';

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Электронный рецепт #${eprescription.prescriptionNumber}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    .header { text-align: center; margin-bottom: 20px; }
    .content { margin-bottom: 20px; }
    .footer { text-align: center; margin-top: 40px; font-size: 12px; color: #666; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th, td { padding: 8px; border: 1px solid #ddd; }
    th { background: #f5f5f5; }
    .signature { margin-top: 40px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Электронный рецепт</h1>
    <p><strong>Номер рецепта:</strong> ${eprescription.prescriptionNumber}</p>
    <p><strong>Дата:</strong> ${new Date(eprescription.createdAt).toLocaleDateString('ru-RU')}</p>
  </div>

  <div class="content">
    <h2>Пациент:</h2>
    <p><strong>ФИО:</strong> ${(eprescription.patient && eprescription.patient.user && (eprescription.patient.user.fullName || [eprescription.patient.user.lastName, eprescription.patient.user.firstName].filter(Boolean).join(' '))) || 'N/A'}</p>
    <p><strong>Дата рождения:</strong> ${eprescription.patient?.dateOfBirth ? new Date(eprescription.patient.dateOfBirth).toLocaleDateString('ru-RU') : 'N/A'}</p>

    <h2>Врач:</h2>
    <p><strong>ФИО:</strong> ${(eprescription.doctor && eprescription.doctor.user && (eprescription.doctor.user.fullName || [eprescription.doctor.user.lastName, eprescription.doctor.user.firstName].filter(Boolean).join(' '))) || 'N/A'}</p>
    <p><strong>Специальность:</strong> ${eprescription.doctor?.Specialties?.map(s => s.name).join(', ') || 'N/A'}</p>

    <h2>Диагноз:</h2>
    <p>${eprescription.diagnosis || 'Не указан'}</p>

    ${medicationsHtml}

    <h3>Инструкции:</h3>
    <p>${eprescription.instructions || 'Нет дополнительных инструкций'}</p>

    <h3>Примечания:</h3>
    <p>${eprescription.notes || 'Нет примечаний'}</p>

    <p><strong>Срок действия:</strong> до ${new Date(eprescription.validUntil).toLocaleDateString('ru-RU')}</p>
  </div>

  <div class="signature">
    <p>Подпись врача: _______________________</p>
  </div>

  <div class="footer">
    <p>Этот документ является электронным рецептом и имеет юридическую силу в соответствии с законодательством РФ.</p>
  </div>
</body>
</html>
    `;
  }
}

module.exports = EPrescriptionController;
