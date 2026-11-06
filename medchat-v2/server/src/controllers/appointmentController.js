/**
 * Appointment Controller
 * Handles appointment creation, management, and scheduling
 */

const models = require('../models');
const { AppError } = require('../middleware/errorHandler');
const { Op } = require('sequelize');

class AppointmentController {
  /**
   * Create appointment
   */
  static async create(req, res, next) {
    try {
      const {
        doctorId,
        clinicId,
        patientId,
        startTime,
        endTime,
        type = 'in_person',
        status = 'pending',
        reason,
        symptoms,
        notes,
        priority = 'normal',
        reminderMinutes = 30,
      } = req.body;

      const currentUserId = req.user.id;

      // Validate required fields
      if (!doctorId || !startTime) {
        throw new AppError('Doctor ID and start time are required', 400, 'VALIDATION_ERROR');
      }

      // Validate time format
      const startDate = new Date(startTime);
      const endDate = endTime ? new Date(endTime) : new Date(startDate.getTime() + 30 * 60000); // Default 30 minutes

      if (isNaN(startDate.getTime())) {
        throw new AppError('Invalid start time format', 400, 'VALIDATION_ERROR');
      }

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

      // Check if patient exists or create placeholder
      let patient;
      if (patientId) {
        patient = await models.Patient.findOne({ where: { id: patientId } });
        if (!patient) {
          throw new AppError('Patient not found', 404, 'NOT_FOUND');
        }
      } else {
        // Create patient from current user if they are a patient
        const currentUser = await models.User.findOne({
          where: { id: currentUserId },
          include: [models.Patient],
        });

        if (currentUser.Patient) {
          patientId = currentUser.Patient.id;
        } else {
          // Create new patient record
          patient = await models.Patient.create({
            userId: currentUserId,
            fullName: currentUser.firstName && currentUser.lastName
              ? `${currentUser.firstName} ${currentUser.lastName}`
              : currentUser.username,
          });
          patientId = patient.id;
        }
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
        endTime,
        type,
        status,
        reason,
        symptoms,
        notes,
        priority,
        reminderMinutes,
        createdBy: currentUserId,
      });

      // Create reminder
      if (reminderMinutes > 0) {
        const reminderTime = new Date(startDate.getTime() - reminderMinutes * 60000);
        await models.Reminder.create({
          userId: patientId,
          appointmentId: appointment.id,
          type: 'appointment',
          title: `Напоминание о приеме у врача`,
          message: `У вас запланирован прием у врача ${doctor.fullName || 'Unknown'} в ${startDate.toLocaleString('ru-RU')}`,
          scheduledFor: reminderTime,
          status: 'pending',
        });
      }

      // Load full appointment data
      const fullAppointment = await models.Appointment.findOne({
        where: { id: appointment.id },
        include: [
          { model: models.Doctor, attributes: ['id', 'fullName', 'specialtyIds'] },
          { model: models.Patient, attributes: ['id', 'fullName'] },
          { model: models.Clinic, attributes: ['id', 'name'] },
        ],
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

      // Access control for non-admin users
      if (!req.user.roles?.includes('admin')) {
        // Doctors can see their own appointments
        if (req.user.doctorId) {
          where[Op.or] = [
            { doctorId: req.user.doctorId },
            { patientId: req.user.patientId },
          ];
        }
        // Patients can see their own appointments
        if (req.user.patientId) {
          where[Op.or] = [
            { patientId: req.user.patientId },
            { doctorId: req.user.doctorId },
          ];
        }
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
        include: [
          { model: models.Doctor, attributes: ['id', 'fullName'] },
          { model: models.Patient, attributes: ['id', 'fullName'] },
          { model: models.Clinic, attributes: ['id', 'name'] },
        ],
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
        include: [
          { model: models.Doctor, include: [models.Specialty] },
          { model: models.Patient },
          { model: models.Clinic },
          { model: models.Reminder },
        ],
      });

      if (!appointment) {
        throw new AppError('Appointment not found', 404, 'NOT_FOUND');
      }

      // Access control
      if (!req.user.roles?.includes('admin') &&
          appointment.doctorId !== req.user.doctorId &&
          appointment.patientId !== req.user.patientId) {
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
        type,
        reason,
        symptoms,
        notes,
        priority,
        reminderMinutes,
      } = req.body;

      const appointment = await models.Appointment.findOne({ where: { id } });

      if (!appointment) {
        throw new AppError('Appointment not found', 404, 'NOT_FOUND');
      }

      // Access control - only doctor, patient, or admin can update
      if (!req.user.roles?.includes('admin') &&
          appointment.doctorId !== req.user.doctorId &&
          appointment.patientId !== req.user.patientId) {
        throw new AppError('Cannot update this appointment', 403, 'FORBIDDEN');
      }

      // Validate time format if provided
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

      // If both times provided, validate
      if (startDate && endDate && endDate <= startDate) {
        throw new AppError('End time must be after start time', 400, 'VALIDATION_ERROR');
      }

      // Check for scheduling conflicts if time is changed
      if (startDate || endDate) {
        const checkStart = startDate || appointment.startTime;
        const checkEnd = endDate || appointment.endTime;

        const conflictingAppointment = await models.Appointment.findOne({
          where: {
            doctorId: appointment.doctorId,
            id: { [Op.ne]: id },
            [Op.or]: [
              {
                startTime: { [Op.lt]: checkEnd },
                endTime: { [Op.gt]: checkStart },
              },
              {
                startTime: { [Op.gte]: checkStart, [Op.lt]: checkEnd },
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
        startTime: startDate || appointment.startTime,
        endTime: endDate || appointment.endTime,
        type: type || appointment.type,
        reason: reason !== undefined ? reason : appointment.reason,
        symptoms: symptoms !== undefined ? symptoms : appointment.symptoms,
        notes: notes !== undefined ? notes : appointment.notes,
        priority: priority || appointment.priority,
        reminderMinutes: reminderMinutes !== undefined ? reminderMinutes : appointment.reminderMinutes,
      });

      // Update reminder if reminderMinutes changed
      if (reminderMinutes !== undefined && reminderMinutes !== appointment.reminderMinutes) {
        const existingReminder = await models.Reminder.findOne({
          where: { appointmentId: id, type: 'appointment' },
        });

        if (existingReminder) {
          const newReminderTime = new Date(appointment.startTime.getTime() - reminderMinutes * 60000);
          await existingReminder.update({
            scheduledFor: newReminderTime,
          });
        }
      }

      // Load full appointment data
      const fullAppointment = await models.Appointment.findOne({
        where: { id },
        include: [
          { model: models.Doctor, attributes: ['id', 'fullName'] },
          { model: models.Patient, attributes: ['id', 'fullName'] },
          { model: models.Clinic, attributes: ['id', 'name'] },
        ],
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

      // Only doctor or admin can confirm
      if (!req.user.roles?.includes('admin') && appointment.doctorId !== req.user.doctorId) {
        throw new AppError('Only the doctor can confirm this appointment', 403, 'FORBIDDEN');
      }

      // Cannot confirm if not pending
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

      // Send confirmation notification to patient
      // (In production, this would trigger a push notification or email)

      // Load full appointment data
      const fullAppointment = await models.Appointment.findOne({
        where: { id },
        include: [
          { model: models.Doctor, attributes: ['id', 'fullName'] },
          { model: models.Patient, attributes: ['id', 'fullName'] },
          { model: models.Clinic, attributes: ['id', 'name'] },
        ],
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
      const { reason, notifyDoctor = true, notifyPatient = true } = req.body;

      const appointment = await models.Appointment.findOne({ where: { id } });

      if (!appointment) {
        throw new AppError('Appointment not found', 404, 'NOT_FOUND');
      }

      // Access control
      if (!req.user.roles?.includes('admin') &&
          appointment.doctorId !== req.user.doctorId &&
          appointment.patientId !== req.user.patientId) {
        throw new AppError('Cannot cancel this appointment', 403, 'FORBIDDEN');
      }

      // Cannot cancel completed or cancelled appointments
      if (appointment.status === 'completed' || appointment.status === 'cancelled') {
        throw new AppError('Cannot cancel a completed or already cancelled appointment', 400, 'VALIDATION_ERROR');
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

      // Load full appointment data
      const fullAppointment = await models.Appointment.findOne({
        where: { id },
        include: [
          { model: models.Doctor, attributes: ['id', 'fullName'] },
          { model: models.Patient, attributes: ['id', 'fullName'] },
          { model: models.Clinic, attributes: ['id', 'name'] },
        ],
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
      const {
        newStartTime,
        newEndTime,
        reason,
        notifyDoctor = true,
        notifyPatient = true,
      } = req.body;

      const appointment = await models.Appointment.findOne({ where: { id } });

      if (!appointment) {
        throw new AppError('Appointment not found', 404, 'NOT_FOUND');
      }

      // Access control
      if (!req.user.roles?.includes('admin') &&
          appointment.doctorId !== req.user.doctorId &&
          appointment.patientId !== req.user.patientId) {
        throw new AppError('Cannot reschedule this appointment', 403, 'FORBIDDEN');
      }

      // Validate time format
      const startDate = new Date(newStartTime);
      const endDate = newEndTime ? new Date(newEndTime) : new Date(startDate.getTime() + 30 * 60000);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw new AppError('Invalid time format', 400, 'VALIDATION_ERROR');
      }

      if (endDate <= startDate) {
        throw new AppError('End time must be after start time', 400, 'VALIDATION_ERROR');
      }

      // Check for scheduling conflicts
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

      // Update appointment
      await appointment.update({
        startTime: startDate,
        endTime,
        status: 'rescheduled',
        rescheduledAt: new Date(),
        rescheduledBy: req.user.id,
        rescheduleReason: reason,
      });

      // Update reminder
      const existingReminder = await models.Reminder.findOne({
        where: { appointmentId: id, type: 'appointment' },
      });

      if (existingReminder) {
        const newReminderTime = new Date(startDate.getTime() - (appointment.reminderMinutes || 30) * 60000);
        await existingReminder.update({
          scheduledFor: newReminderTime,
          status: 'pending',
        });
      }

      // Load full appointment data
      const fullAppointment = await models.Appointment.findOne({
        where: { id },
        include: [
          { model: models.Doctor, attributes: ['id', 'fullName'] },
          { model: models.Patient, attributes: ['id', 'fullName'] },
          { model: models.Clinic, attributes: ['id', 'name'] },
        ],
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

      // Only doctor or admin can mark as completed
      if (!req.user.roles?.includes('admin') && appointment.doctorId !== req.user.doctorId) {
        throw new AppError('Only the doctor can mark this appointment as completed', 403, 'FORBIDDEN');
      }

      // Cannot complete if not confirmed
      if (appointment.status !== 'confirmed') {
        throw new AppError('Only confirmed appointments can be marked as completed', 400, 'VALIDATION_ERROR');
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
        const followupReminderTime = new Date(followupDate);
        followupReminderTime.setDate(followupReminderTime.getDate() - 1); // Remind 1 day before

        await models.Reminder.create({
          userId: appointment.patientId,
          appointmentId: id,
          type: 'followup',
          title: 'Напоминание о повторном приеме',
          message: `Напоминание о повторном приеме к врачу ${appointment.Doctor?.fullName || 'Unknown'}`,
          scheduledFor: followupReminderTime,
          status: 'pending',
        });
      }

      // Load full appointment data
      const fullAppointment = await models.Appointment.findOne({
        where: { id },
        include: [
          { model: models.Doctor, attributes: ['id', 'fullName'] },
          { model: models.Patient, attributes: ['id', 'fullName'] },
          { model: models.Clinic, attributes: ['id', 'name'] },
        ],
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
   * Delete appointment
   */
  static async delete(req, res, next) {
    try {
      const { id } = req.params;

      const appointment = await models.Appointment.findOne({ where: { id } });

      if (!appointment) {
        throw new AppError('Appointment not found', 404, 'NOT_FOUND');
      }

      // Access control - only admin can permanently delete
      if (!req.user.roles?.includes('admin')) {
        throw new AppError('Only admin can delete appointments', 403, 'FORBIDDEN');
      }

      // Soft delete
      await appointment.update({
        deleted: true,
        deletedAt: new Date(),
        deletedBy: req.user.id,
      });

      // Delete associated reminders
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

      const where = {
        [Op.or]: [
          { doctorId: req.user.doctorId },
          { patientId: req.user.patientId },
        ],
      };

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
        include: [
          { model: models.Doctor, attributes: ['id', 'fullName'] },
          { model: models.Patient, attributes: ['id', 'fullName'] },
          { model: models.Clinic, attributes: ['id', 'name'] },
        ],
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

      // Access control
      if (doctorId !== req.user.doctorId && !req.user.roles?.includes('admin')) {
        throw new AppError('Cannot access other doctor appointments', 403, 'FORBIDDEN');
      }

      const where = { doctorId };

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
        include: [
          { model: models.Doctor, attributes: ['id', 'fullName'] },
          { model: models.Patient, attributes: ['id', 'fullName'] },
          { model: models.Clinic, attributes: ['id', 'name'] },
        ],
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

      // Access control
      if (patientId !== req.user.patientId && !req.user.roles?.includes('admin')) {
        throw new AppError('Cannot access other patient appointments', 403, 'FORBIDDEN');
      }

      const where = { patientId };

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
        include: [
          { model: models.Doctor, attributes: ['id', 'fullName'] },
          { model: models.Patient, attributes: ['id', 'fullName'] },
          { model: models.Clinic, attributes: ['id', 'name'] },
        ],
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

      // Access control
      if (doctorId) {
        if (doctorId !== req.user.doctorId && !req.user.roles?.includes('admin')) {
          throw new AppError('Cannot access other doctor calendar', 403, 'FORBIDDEN');
        }
        where.doctorId = doctorId;
      } else if (req.user.doctorId) {
        where.doctorId = req.user.doctorId;
      } else if (req.user.patientId) {
        where.patientId = req.user.patientId;
      }

      const appointments = await models.Appointment.findAll({
        where,
        include: [
          { model: models.Doctor, attributes: ['id', 'fullName'] },
          { model: models.Patient, attributes: ['id', 'fullName'] },
          { model: models.Clinic, attributes: ['id', 'name'] },
        ],
        order: [['startTime', 'ASC']],
      });

      // Format for calendar
      const calendarAppointments = appointments.map(appointment => ({
        id: appointment.id,
        title: `${appointment.Patient?.fullName || 'Unknown'} - ${appointment.type}`,
        start: appointment.startTime,
        end: appointment.endTime,
        type: appointment.type,
        status: appointment.status,
        doctor: appointment.Doctor?.fullName,
        patient: appointment.Patient?.fullName,
        clinic: appointment.Clinic?.name,
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
        if (doctorId !== req.user.doctorId && !req.user.roles?.includes('admin')) {
          throw new AppError('Cannot access other doctor statistics', 403, 'FORBIDDEN');
        }
        where.doctorId = doctorId;
      } else if (req.user.doctorId) {
        where.doctorId = req.user.doctorId;
      }

      if (clinicId) where.clinicId = clinicId;

      if (startDate || endDate) {
        where.startTime = {};
        if (startDate) where.startTime[Op.gte] = new Date(startDate);
        if (endDate) where.startTime[Op.lte] = new Date(endDate);
      }

      // Get counts by status
      const byStatus = await models.Appointment.findAll({
        where,
        attributes: ['status', [models.Sequelize.fn('COUNT', models.Sequelize.col('id')), 'count']],
        group: ['status'],
        raw: true,
      });

      // Get counts by type
      const byType = await models.Appointment.findAll({
        where,
        attributes: ['type', [models.Sequelize.fn('COUNT', models.Sequelize.col('id')), 'count']],
        group: ['type'],
        raw: true,
      });

      // Get total
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
