/**
 * Appointment Controller
 * Handles appointment creation, management, and scheduling.
 *
 * Fixes vs previous version:
 * - Doctor/Patient models have no `fullName` column (it is a User virtual),
 *   so includes now select real columns and nest the user.
 * - Reminder.create used patientId as userId (FK violation) and missed the
 *   NOT NULL createdBy column.
 * - `req.user.roles` never existed; access control now uses req.user.role.
 */

const models = require('../models');
const { AppError } = require('../middleware/errorHandler');
const { Op } = require('sequelize');

const USER_ATTRS = ['id', 'firstName', 'lastName', 'fullName'];
const DOCTOR_INCLUDE = {
  model: models.Doctor,
  as: 'doctor',
  attributes: ['id', 'userId'],
  include: [{ model: models.User, as: 'user', attributes: USER_ATTRS }],
};
const PATIENT_INCLUDE = {
  model: models.Patient,
  as: 'patient',
  attributes: ['id', 'userId'],
  include: [{ model: models.User, as: 'user', attributes: USER_ATTRS }],
};
const CLINIC_INCLUDE = { model: models.Clinic, as: 'clinic', attributes: ['id', 'name'] };

const isSystemAdmin = (req) => req.user.role === 'system_admin';

const canAccessAppointment = (req, appointment) =>
  isSystemAdmin(req) ||
  (req.user.doctorId && appointment.doctorId === req.user.doctorId) ||
  (req.user.patientId && appointment.patientId === req.user.patientId) ||
  (req.user.role === 'clinic_admin' &&
    req.user.clinicId &&
    appointment.clinicId === req.user.clinicId);

class AppointmentController {
  /**
   * Create appointment
   */
  static async create(req, res, next) {
    try {
      const {
        doctorId,
        clinicId,
        patientId: bodyPatientId,
        startTime,
        endTime,
        duration,
        type = 'consultation',
        status = 'pending',
        reason,
        symptoms,
        notes,
        priority = 'normal',
      } = req.body;

      const currentUserId = req.user.id;

      // Direct reminder control (reminderBefore is a legacy alias)
      const reminderMinutes =
        req.body.reminderMinutes !== undefined
          ? req.body.reminderMinutes
          : req.body.reminderBefore !== undefined
            ? req.body.reminderBefore
            : 30;

      if (!doctorId || !startTime) {
        throw new AppError('Doctor ID and start time are required', 400, 'VALIDATION_ERROR');
      }

      const startDate = new Date(startTime);
      if (isNaN(startDate.getTime())) {
        throw new AppError('Invalid start time format', 400, 'VALIDATION_ERROR');
      }

      const endDate = endTime
        ? new Date(endTime)
        : new Date(startDate.getTime() + ((duration || 30) * 60000));

      if (isNaN(endDate.getTime())) {
        throw new AppError('Invalid end time format', 400, 'VALIDATION_ERROR');
      }

      if (endDate <= startDate) {
        throw new AppError('End time must be after start time', 400, 'VALIDATION_ERROR');
      }

      // Check if doctor exists
      const doctor = await models.Doctor.findOne({ where: { id: doctorId } });
      if (!doctor) {
        throw new AppError('Doctor not found', 404, 'NOT_FOUND');
      }

      // Check if clinic exists
      if (clinicId) {
        const clinic = await models.Clinic.findOne({ where: { id: clinicId } });
        if (!clinic) {
          throw new AppError('Clinic not found', 404, 'NOT_FOUND');
        }
      }

      // Resolve patient: by ID, or from the current user's patient profile
      let patientId = bodyPatientId;
      let patient;
      if (patientId) {
        patient = await models.Patient.findOne({ where: { id: patientId } });
        if (!patient) {
          throw new AppError('Patient not found', 404, 'NOT_FOUND');
        }
      } else {
        patient = await models.Patient.findOne({ where: { userId: currentUserId } });
        if (!patient) {
          patient = await models.Patient.create({ userId: currentUserId });
        }
        patientId = patient.id;
      }

      // Check for scheduling conflicts
      const conflictingAppointment = await models.Appointment.findOne({
        where: {
          doctorId,
          [Op.or]: [
            {
              startTime: { [Op.lt]: endDate },
              endTime: { [Op.gt]: startDate },
            },
            {
              startTime: { [Op.gte]: startDate, [Op.lt]: endDate },
            },
          ],
          status: { [Op.in]: ['pending', 'confirmed', 'completed'] },
        },
      });

      if (conflictingAppointment) {
        throw new AppError('Doctor has a conflicting appointment at this time', 400, 'CONFLICT');
      }

      // Create appointment
      const appointment = await models.Appointment.create({
        doctorId,
        clinicId,
        patientId,
        startTime: startDate,
        endTime: endDate,
        type,
        status,
        reason,
        symptoms,
        notes,
        priority,
        reminderMinutes,
        createdBy: currentUserId,
      });

      // Create reminder (only when enabled)
      if (reminderMinutes > 0 && patient) {
        const reminderTime = new Date(startDate.getTime() - reminderMinutes * 60000);
        const doctorUser = doctor.userId
          ? await models.User.findByPk(doctor.userId, { attributes: USER_ATTRS })
          : null;
        try {
          await models.Reminder.create({
            userId: patient.userId,
            recipientId: patient.userId,
            appointmentId: appointment.id,
            type: 'appointment',
            title: 'Напоминание о приеме у врача',
            message:
              'У вас запланирован прием у врача ' +
              (doctorUser ? doctorUser.fullName || ' ' : '') +
              ' в ' + startDate.toLocaleString('ru-RU'),
            scheduledFor: reminderTime,
            status: 'pending',
            createdBy: currentUserId,
          });
        } catch (reminderError) {
          // A failing reminder must not fail the appointment itself
          const logger = require('../utils/logger');
          logger.warn('Failed to create appointment reminder: ' + reminderError.message);
        }
      }

      // Load full appointment data
      const fullAppointment = await models.Appointment.findOne({
        where: { id: appointment.id },
        include: [DOCTOR_INCLUDE, PATIENT_INCLUDE, CLINIC_INCLUDE],
      });

      res.status(201).json({
        success: true,
        data: fullAppointment,
        message: 'Appointment created successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * List appointments
   */
  static async list(req, res, next) {
    try {
      const {
        doctorId,
        patientId,
        clinicId,
        status,
        type,
        startDate,
        endDate,
        page = 1,
        limit = 20,
      } = req.query;

      const where = {};

      // Access control
      if (isSystemAdmin(req)) {
        // Sees everything
      } else if (req.user.role === 'clinic_admin' && req.user.clinicId) {
        where.clinicId = req.user.clinicId;
      } else {
        const or = [];
        if (req.user.doctorId) or.push({ doctorId: req.user.doctorId });
        if (req.user.patientId) or.push({ patientId: req.user.patientId });
        if (or.length === 0) {
          throw new AppError('No access to appointments', 403, 'FORBIDDEN');
        }
        where[Op.or] = or;
      }

      if (doctorId) where.doctorId = doctorId;
      if (patientId) where.patientId = patientId;
      if (clinicId) where.clinicId = clinicId;
      if (status) where.status = status;
      if (type) where.type = type;

      if (startDate || endDate) {
        where.startTime = {};
        if (startDate) where.startTime[Op.gte] = new Date(startDate);
        if (endDate) where.startTime[Op.lte] = new Date(endDate);
      }

      const offset = (page - 1) * limit;

      const { count, rows } = await models.Appointment.findAndCountAll({
        where,
        include: [DOCTOR_INCLUDE, PATIENT_INCLUDE, CLINIC_INCLUDE],
        order: [['startTime', 'ASC']],
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
   * Get appointment by ID
   */
  static async getById(req, res, next) {
    try {
      const { id } = req.params;

      const appointment = await models.Appointment.findOne({
        where: { id },
        include: [DOCTOR_INCLUDE, PATIENT_INCLUDE, CLINIC_INCLUDE],
      });

      if (!appointment) {
        throw new AppError('Appointment not found', 404, 'NOT_FOUND');
      }

      if (!canAccessAppointment(req, appointment)) {
        throw new AppError('Cannot access this appointment', 403, 'FORBIDDEN');
      }

      res.json({
        success: true,
        data: appointment,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update appointment
   */
  static async update(req, res, next) {
    try {
      const { id } = req.params;
      const {
        startTime,
        endTime,
        duration,
        type,
        reason,
        symptoms,
        notes,
        priority,
      } = req.body;

      const reminderMinutes =
        req.body.reminderMinutes !== undefined
          ? req.body.reminderMinutes
          : req.body.reminderBefore;

      const appointment = await models.Appointment.findOne({ where: { id } });

      if (!appointment) {
        throw new AppError('Appointment not found', 404, 'NOT_FOUND');
      }

      if (!canAccessAppointment(req, appointment)) {
        throw new AppError('Cannot update this appointment', 403, 'FORBIDDEN');
      }

      let startDate, endDate;
      if (startTime) {
        startDate = new Date(startTime);
        if (isNaN(startDate.getTime())) {
          throw new AppError('Invalid start time format', 400, 'VALIDATION_ERROR');
        }
      }

      if (endTime) {
        endDate = new Date(endTime);
        if (isNaN(endDate.getTime())) {
          throw new AppError('Invalid end time format', 400, 'VALIDATION_ERROR');
        }
      }

      const finalStart = startDate || appointment.startTime;
      const finalEnd =
        endDate || new Date(finalStart.getTime() + ((duration || 30) * 60000));

      if (finalEnd <= finalStart) {
        throw new AppError('End time must be after start time', 400, 'VALIDATION_ERROR');
      }

      // Check for scheduling conflicts if time is changed
      if (startDate || endDate || duration) {
        const conflictingAppointment = await models.Appointment.findOne({
          where: {
            doctorId: appointment.doctorId,
            id: { [Op.ne]: id },
            [Op.or]: [
              {
                startTime: { [Op.lt]: finalEnd },
                endTime: { [Op.gt]: finalStart },
              },
              {
                startTime: { [Op.gte]: finalStart, [Op.lt]: finalEnd },
              },
            ],
            status: { [Op.in]: ['pending', 'confirmed', 'completed'] },
          },
        });

        if (conflictingAppointment) {
          throw new AppError('Doctor has a conflicting appointment at this time', 400, 'CONFLICT');
        }
      }

      await appointment.update({
        startTime: finalStart,
        endTime: finalEnd,
        type: type || appointment.type,
        reason: reason !== undefined ? reason : appointment.reason,
        symptoms: symptoms !== undefined ? symptoms : appointment.symptoms,
        notes: notes !== undefined ? notes : appointment.notes,
        priority: priority || appointment.priority,
        reminderMinutes:
          reminderMinutes !== undefined ? reminderMinutes : appointment.reminderMinutes,
      });

      // Update reminder if reminderMinutes changed
      if (reminderMinutes !== undefined && reminderMinutes !== appointment.reminderMinutes) {
        const existingReminder = await models.Reminder.findOne({
          where: { appointmentId: id, type: 'appointment' },
        });

        if (existingReminder) {
          if (reminderMinutes > 0) {
            const newReminderTime = new Date(
              appointment.startTime.getTime() - reminderMinutes * 60000
            );
            await existingReminder.update({ scheduledFor: newReminderTime });
          } else {
            await existingReminder.update({ status: 'cancelled' });
          }
        }
      }

      // Load full appointment data
      const fullAppointment = await models.Appointment.findOne({
        where: { id },
        include: [DOCTOR_INCLUDE, PATIENT_INCLUDE, CLINIC_INCLUDE],
      });

      res.json({
        success: true,
        data: fullAppointment,
        message: 'Appointment updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Confirm appointment
   */
  static async confirm(req, res, next) {
    try {
      const { id } = req.params;
      const { notes, preparationInstructions } = req.body;

      const appointment = await models.Appointment.findOne({ where: { id } });

      if (!appointment) {
        throw new AppError('Appointment not found', 404, 'NOT_FOUND');
      }

      if (!isSystemAdmin(req) && appointment.doctorId !== req.user.doctorId) {
        throw new AppError('Only the doctor can confirm this appointment', 403, 'FORBIDDEN');
      }

      if (appointment.status !== 'pending') {
        throw new AppError('Only pending appointments can be confirmed', 400, 'VALIDATION_ERROR');
      }

      await appointment.update({
        status: 'confirmed',
        confirmedAt: new Date(),
        confirmedBy: req.user.id,
        confirmationNotes: notes,
        preparationInstructions,
      });

      const fullAppointment = await models.Appointment.findOne({
        where: { id },
        include: [DOCTOR_INCLUDE, PATIENT_INCLUDE, CLINIC_INCLUDE],
      });

      res.json({
        success: true,
        data: fullAppointment,
        message: 'Appointment confirmed successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Cancel appointment
   */
  static async cancel(req, res, next) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const appointment = await models.Appointment.findOne({ where: { id } });

      if (!appointment) {
        throw new AppError('Appointment not found', 404, 'NOT_FOUND');
      }

      if (!canAccessAppointment(req, appointment)) {
        throw new AppError('Cannot cancel this appointment', 403, 'FORBIDDEN');
      }

      if (appointment.status === 'completed' || appointment.status === 'cancelled') {
        throw new AppError(
          'Cannot cancel a completed or already cancelled appointment',
          400,
          'VALIDATION_ERROR'
        );
      }

      await appointment.update({
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelledBy: req.user.id,
        cancellationReason: reason,
      });

      // Cancel associated reminders
      await models.Reminder.update(
        { status: 'cancelled' },
        { where: { appointmentId: id } }
      );

      const fullAppointment = await models.Appointment.findOne({
        where: { id },
        include: [DOCTOR_INCLUDE, PATIENT_INCLUDE, CLINIC_INCLUDE],
      });

      res.json({
        success: true,
        data: fullAppointment,
        message: 'Appointment cancelled successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Reschedule appointment
   */
  static async reschedule(req, res, next) {
    try {
      const { id } = req.params;
      const { startTime, endTime, duration, reason } = req.body;

      const appointment = await models.Appointment.findOne({ where: { id } });

      if (!appointment) {
        throw new AppError('Appointment not found', 404, 'NOT_FOUND');
      }

      if (!canAccessAppointment(req, appointment)) {
        throw new AppError('Cannot reschedule this appointment', 403, 'FORBIDDEN');
      }

      const startDate = new Date(startTime);
      const endDate = endTime
        ? new Date(endTime)
        : new Date(startDate.getTime() + ((duration || 30) * 60000));

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw new AppError('Invalid time format', 400, 'VALIDATION_ERROR');
      }

      if (endDate <= startDate) {
        throw new AppError('End time must be after start time', 400, 'VALIDATION_ERROR');
      }

      const conflictingAppointment = await models.Appointment.findOne({
        where: {
          doctorId: appointment.doctorId,
          id: { [Op.ne]: id },
          [Op.or]: [
            {
              startTime: { [Op.lt]: endDate },
              endTime: { [Op.gt]: startDate },
            },
            {
              startTime: { [Op.gte]: startDate, [Op.lt]: endDate },
            },
          ],
          status: { [Op.in]: ['pending', 'confirmed', 'completed'] },
        },
      });

      if (conflictingAppointment) {
        throw new AppError('Doctor has a conflicting appointment at this time', 400, 'CONFLICT');
      }

      await appointment.update({
        startTime: startDate,
        endTime: endDate,
        status: 'rescheduled',
        rescheduledAt: new Date(),
        rescheduledBy: req.user.id,
        rescheduleReason: reason,
      });

      // Update reminder
      const existingReminder = await models.Reminder.findOne({
        where: { appointmentId: id, type: 'appointment' },
      });

      if (existingReminder && (appointment.reminderMinutes || 0) > 0) {
        const newReminderTime = new Date(
          startDate.getTime() - (appointment.reminderMinutes || 30) * 60000
        );
        await existingReminder.update({
          scheduledFor: newReminderTime,
          status: 'pending',
        });
      }

      const fullAppointment = await models.Appointment.findOne({
        where: { id },
        include: [DOCTOR_INCLUDE, PATIENT_INCLUDE, CLINIC_INCLUDE],
      });

      res.json({
        success: true,
        data: fullAppointment,
        message: 'Appointment rescheduled successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Mark appointment as completed
   */
  static async complete(req, res, next) {
    try {
      const { id } = req.params;
      const { notes, diagnosis, treatment, followupRecommended, followupDate } = req.body;

      const appointment = await models.Appointment.findOne({ where: { id } });

      if (!appointment) {
        throw new AppError('Appointment not found', 404, 'NOT_FOUND');
      }

      if (!isSystemAdmin(req) && appointment.doctorId !== req.user.doctorId) {
        throw new AppError('Only the doctor can mark this appointment as completed', 403, 'FORBIDDEN');
      }

      if (appointment.status !== 'confirmed') {
        throw new AppError(
          'Only confirmed appointments can be marked as completed',
          400,
          'VALIDATION_ERROR'
        );
      }

      await appointment.update({
        status: 'completed',
        completedAt: new Date(),
        completedBy: req.user.id,
        completionNotes: notes,
        diagnosis,
        treatment,
        followupRecommended,
        followupDate: followupDate ? new Date(followupDate) : null,
      });

      // Mark associated reminders as completed
      await models.Reminder.update(
        { status: 'completed' },
        { where: { appointmentId: id, type: 'appointment' } }
      );

      // If followup is recommended, create a followup reminder
      if (followupRecommended && followupDate) {
        const patient = await models.Patient.findByPk(appointment.patientId);
        if (patient) {
          const followupReminderTime = new Date(new Date(followupDate).getTime() - 24 * 3600 * 1000);
          try {
            await models.Reminder.create({
              userId: patient.userId,
              recipientId: patient.userId,
              appointmentId: id,
              type: 'followup',
              title: 'Напоминание о повторном приеме',
              message: 'Напоминание о повторном приеме к врачу',
              scheduledFor: followupReminderTime,
              status: 'pending',
              createdBy: req.user.id,
            });
          } catch (reminderError) {
            const logger = require('../utils/logger');
            logger.warn('Failed to create followup reminder: ' + reminderError.message);
          }
        }
      }

      const fullAppointment = await models.Appointment.findOne({
        where: { id },
        include: [DOCTOR_INCLUDE, PATIENT_INCLUDE, CLINIC_INCLUDE],
      });

      res.json({
        success: true,
        data: fullAppointment,
        message: 'Appointment marked as completed successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete appointment (soft)
   */
  static async delete(req, res, next) {
    try {
      const { id } = req.params;

      const appointment = await models.Appointment.findOne({ where: { id } });

      if (!appointment) {
        throw new AppError('Appointment not found', 404, 'NOT_FOUND');
      }

      if (!canAccessAppointment(req, appointment)) {
        throw new AppError('Cannot delete this appointment', 403, 'FORBIDDEN');
      }

      await appointment.update({
        deleted: true,
        deletedAt: new Date(),
        deletedBy: req.user.id,
        status: 'cancelled',
      });

      await models.Reminder.destroy({ where: { appointmentId: id } });

      res.json({
        success: true,
        message: 'Appointment deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get my appointments
   */
  static async getMyAppointments(req, res, next) {
    try {
      const {
        status,
        type,
        startDate,
        endDate,
        page = 1,
        limit = 20,
      } = req.query;

      const where = {};

      if (req.user.doctorId || req.user.patientId) {
        const or = [];
        if (req.user.doctorId) or.push({ doctorId: req.user.doctorId });
        if (req.user.patientId) or.push({ patientId: req.user.patientId });
        where[Op.or] = or;
      } else if (req.user.role === 'clinic_admin' && req.user.clinicId) {
        where.clinicId = req.user.clinicId;
      } else if (isSystemAdmin(req)) {
        // All appointments
      } else {
        throw new AppError('No access to appointments', 403, 'FORBIDDEN');
      }

      if (status) where.status = status;
      if (type) where.type = type;

      if (startDate || endDate) {
        where.startTime = {};
        if (startDate) where.startTime[Op.gte] = new Date(startDate);
        if (endDate) where.startTime[Op.lte] = new Date(endDate);
      }

      const offset = (page - 1) * limit;

      const { count, rows } = await models.Appointment.findAndCountAll({
        where,
        include: [DOCTOR_INCLUDE, PATIENT_INCLUDE, CLINIC_INCLUDE],
        order: [['startTime', 'ASC']],
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
   * Get appointments by doctor
   */
  static async getByDoctor(req, res, next) {
    try {
      const { doctorId } = req.params;
      const {
        status,
        type,
        startDate,
        endDate,
        page = 1,
        limit = 20,
      } = req.query;

      const allowed =
        isSystemAdmin(req) ||
        doctorId === req.user.doctorId ||
        (req.user.role === 'clinic_admin' && req.user.clinicId);
      if (!allowed) {
        throw new AppError('Cannot access other doctor appointments', 403, 'FORBIDDEN');
      }

      const where = { doctorId };
      if (req.user.role === 'clinic_admin' && req.user.clinicId && doctorId !== req.user.doctorId) {
        where.clinicId = req.user.clinicId;
      }

      if (status) where.status = status;
      if (type) where.type = type;

      if (startDate || endDate) {
        where.startTime = {};
        if (startDate) where.startTime[Op.gte] = new Date(startDate);
        if (endDate) where.startTime[Op.lte] = new Date(endDate);
      }

      const offset = (page - 1) * limit;

      const { count, rows } = await models.Appointment.findAndCountAll({
        where,
        include: [DOCTOR_INCLUDE, PATIENT_INCLUDE, CLINIC_INCLUDE],
        order: [['startTime', 'ASC']],
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
   * Get appointments by patient
   */
  static async getByPatient(req, res, next) {
    try {
      const { patientId } = req.params;
      const {
        status,
        type,
        startDate,
        endDate,
        page = 1,
        limit = 20,
      } = req.query;

      const allowed =
        isSystemAdmin(req) ||
        patientId === req.user.patientId ||
        (req.user.doctorId !== undefined && req.user.doctorId) ||
        (req.user.role === 'clinic_admin' && req.user.clinicId);
      if (!allowed) {
        throw new AppError('Cannot access other patient appointments', 403, 'FORBIDDEN');
      }

      const where = { patientId };
      if (req.user.role === 'clinic_admin' && req.user.clinicId) {
        where.clinicId = req.user.clinicId;
      }

      if (status) where.status = status;
      if (type) where.type = type;

      if (startDate || endDate) {
        where.startTime = {};
        if (startDate) where.startTime[Op.gte] = new Date(startDate);
        if (endDate) where.startTime[Op.lte] = new Date(endDate);
      }

      const offset = (page - 1) * limit;

      const { count, rows } = await models.Appointment.findAndCountAll({
        where,
        include: [DOCTOR_INCLUDE, PATIENT_INCLUDE, CLINIC_INCLUDE],
        order: [['startTime', 'ASC']],
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
   * Get appointments for calendar view
   */
  static async getCalendar(req, res, next) {
    try {
      const { doctorId, startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        throw new AppError('startDate and endDate are required', 400, 'VALIDATION_ERROR');
      }

      const where = {
        startTime: {
          [Op.gte]: new Date(startDate),
          [Op.lte]: new Date(endDate),
        },
      };

      if (doctorId) {
        if (
          doctorId !== req.user.doctorId &&
          !isSystemAdmin(req) &&
          !(req.user.role === 'clinic_admin' && req.user.clinicId)
        ) {
          throw new AppError('Cannot access other doctor calendar', 403, 'FORBIDDEN');
        }
        where.doctorId = doctorId;
      } else if (req.user.doctorId) {
        where.doctorId = req.user.doctorId;
      } else if (req.user.patientId) {
        where.patientId = req.user.patientId;
      } else if (req.user.role === 'clinic_admin' && req.user.clinicId) {
        where.clinicId = req.user.clinicId;
      }

      const appointments = await models.Appointment.findAll({
        where,
        include: [DOCTOR_INCLUDE, PATIENT_INCLUDE, CLINIC_INCLUDE],
        order: [['startTime', 'ASC']],
      });

      const calendarAppointments = appointments.map((appointment) => ({
        id: appointment.id,
        title:
          (appointment.patient && appointment.patient.user
            ? appointment.patient.user.fullName || 'Пациент'
            : 'Пациент') + ' - ' + appointment.type,
        start: appointment.startTime,
        end: appointment.endTime,
        type: appointment.type,
        status: appointment.status,
        doctor:
          appointment.doctor && appointment.doctor.user
            ? appointment.doctor.user.fullName
            : undefined,
        patient:
          appointment.patient && appointment.patient.user
            ? appointment.patient.user.fullName
            : undefined,
        clinic: appointment.clinic ? appointment.clinic.name : undefined,
      }));

      res.json({
        success: true,
        data: calendarAppointments,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get appointment statistics
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
        if (
          doctorId !== req.user.doctorId &&
          !isSystemAdmin(req) &&
          !(req.user.role === 'clinic_admin' && req.user.clinicId)
        ) {
          throw new AppError('Cannot access other doctor statistics', 403, 'FORBIDDEN');
        }
        where.doctorId = doctorId;
      } else if (req.user.doctorId) {
        where.doctorId = req.user.doctorId;
      } else if (req.user.role === 'clinic_admin' && req.user.clinicId) {
        where.clinicId = req.user.clinicId;
      }

      if (clinicId) where.clinicId = clinicId;

      if (startDate || endDate) {
        where.startTime = {};
        if (startDate) where.startTime[Op.gte] = new Date(startDate);
        if (endDate) where.startTime[Op.lte] = new Date(endDate);
      }

      const byStatus = await models.Appointment.findAll({
        where,
        attributes: ['status', [models.Sequelize.fn('COUNT', models.Sequelize.col('id')), 'count']],
        group: ['status'],
        raw: true,
      });

      const byType = await models.Appointment.findAll({
        where,
        attributes: ['type', [models.Sequelize.fn('COUNT', models.Sequelize.col('id')), 'count']],
        group: ['type'],
        raw: true,
      });

      const total = await models.Appointment.count({ where });

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
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = AppointmentController;
