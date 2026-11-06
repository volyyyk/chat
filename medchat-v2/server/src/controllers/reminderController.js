/**
 * Reminder Controller
 * Handles reminder creation, management, and delivery
 */

const models = require('../models');
const { AppError } = require('../middleware/errorHandler');
const { Op } = require('sequelize');

class ReminderController {
  /**
   * Create reminder
   */
  static async create(req, res, next) {
    try {
      const {
        userId,
        doctorId,
        patientId,
        appointmentId,
        type,
        title,
        message,
        scheduledFor,
        repeatInterval,
        repeatCount,
        priority = 'normal',
        metadata,
      } = req.body;

      const currentUserId = req.user.id;

      // Validate required fields
      if (!type || !scheduledFor) {
        throw new AppError('Type and scheduled time are required', 400, 'VALIDATION_ERROR');
      }

      // Validate scheduled time
      const scheduledDate = new Date(scheduledFor);
      if (isNaN(scheduledDate.getTime())) {
        throw new AppError('Invalid scheduled time format', 400, 'VALIDATION_ERROR');
      }

      // Set userId based on who is creating the reminder
      const targetUserId = userId || currentUserId;

      // Determine recipient
      let recipientId = targetUserId;
      if (patientId) recipientId = patientId;
      if (doctorId) recipientId = doctorId;

      // Create reminder
      const reminder = await models.Reminder.create({
        userId: targetUserId,
        recipientId,
        doctorId,
        patientId,
        appointmentId,
        type,
        title,
        message,
        scheduledFor: scheduledDate,
        repeatInterval,
        repeatCount,
        priority,
        status: 'pending',
        metadata,
        createdBy: currentUserId,
      });

      // Load full reminder data
      const fullReminder = await models.Reminder.findOne({
        where: { id: reminder.id },
        include: [
          { model: models.User, as: 'user', attributes: ['id', 'username'] },
          { model: models.User, as: 'recipient', attributes: ['id', 'username'] },
          { model: models.Doctor, attributes: ['id', 'fullName'] },
          { model: models.Patient, attributes: ['id', 'fullName'] },
          { model: models.Appointment, attributes: ['id', 'startTime'] },
        ],
      });

      res.status(201).json({
        success: true,
        data: fullReminder,
        message: 'Reminder created successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * List reminders
   */
  static async list(req, res, next) {
    try {
      const {
        userId,
        doctorId,
        patientId,
        appointmentId,
        type,
        status,
        startDate,
        endDate,
        page = 1,
        limit = 20,
      } = req.query;

      const where = {};

      // Access control for non-admin users
      if (!req.user.roles?.includes('admin')) {
        where[Op.or] = [
          { userId: req.user.id },
          { recipientId: req.user.id },
        ];
      }

      if (userId) where.userId = userId;
      if (doctorId) where.doctorId = doctorId;
      if (patientId) where.patientId = patientId;
      if (appointmentId) where.appointmentId = appointmentId;
      if (type) where.type = type;
      if (status) where.status = status;

      if (startDate || endDate) {
        where.scheduledFor = {};
        if (startDate) where.scheduledFor[Op.gte] = new Date(startDate);
        if (endDate) where.scheduledFor[Op.lte] = new Date(endDate);
      }

      const offset = (page - 1) * limit;

      const { count, rows } = await models.Reminder.findAndCountAll({
        where,
        include: [
          { model: models.User, as: 'user', attributes: ['id', 'username'] },
          { model: models.User, as: 'recipient', attributes: ['id', 'username'] },
          { model: models.Doctor, attributes: ['id', 'fullName'] },
          { model: models.Patient, attributes: ['id', 'fullName'] },
          { model: models.Appointment, attributes: ['id', 'startTime'] },
        ],
        order: [['scheduledFor', 'ASC']],
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
   * Get reminder by ID
   */
  static async getById(req, res, next) {
    try {
      const { id } = req.params;

      const reminder = await models.Reminder.findOne({
        where: { id },
        include: [
          { model: models.User, as: 'user', attributes: ['id', 'username'] },
          { model: models.User, as: 'recipient', attributes: ['id', 'username'] },
          { model: models.Doctor, attributes: ['id', 'fullName'] },
          { model: models.Patient, attributes: ['id', 'fullName'] },
          { model: models.Appointment, attributes: ['id', 'startTime'] },
        ],
      });

      if (!reminder) {
        throw new AppError('Reminder not found', 404, 'NOT_FOUND');
      }

      // Access control
      if (!req.user.roles?.includes('admin') &&
          reminder.userId !== req.user.id &&
          reminder.recipientId !== req.user.id) {
        throw new AppError('Cannot access this reminder', 403, 'FORBIDDEN');
      }

      res.json({
        success: true,
        data: reminder,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update reminder
   */
  static async update(req, res, next) {
    try {
      const { id } = req.params;
      const {
        title,
        message,
        scheduledFor,
        repeatInterval,
        repeatCount,
        priority,
        metadata,
      } = req.body;

      const reminder = await models.Reminder.findOne({ where: { id } });

      if (!reminder) {
        throw new AppError('Reminder not found', 404, 'NOT_FOUND');
      }

      // Access control
      if (!req.user.roles?.includes('admin') && reminder.userId !== req.user.id) {
        throw new AppError('Cannot update this reminder', 403, 'FORBIDDEN');
      }

      // Validate scheduled time if provided
      let scheduledDate;
      if (scheduledFor) {
        scheduledDate = new Date(scheduledFor);
        if (isNaN(scheduledDate.getTime())) {
          throw new AppError('Invalid scheduled time format', 400, 'VALIDATION_ERROR');
        }
      }

      await reminder.update({
        title: title !== undefined ? title : reminder.title,
        message: message !== undefined ? message : reminder.message,
        scheduledFor: scheduledDate || reminder.scheduledFor,
        repeatInterval: repeatInterval !== undefined ? repeatInterval : reminder.repeatInterval,
        repeatCount: repeatCount !== undefined ? repeatCount : reminder.repeatCount,
        priority: priority || reminder.priority,
        metadata: metadata !== undefined ? metadata : reminder.metadata,
      });

      // Load full reminder data
      const fullReminder = await models.Reminder.findOne({
        where: { id },
        include: [
          { model: models.User, as: 'user', attributes: ['id', 'username'] },
          { model: models.User, as: 'recipient', attributes: ['id', 'username'] },
          { model: models.Doctor, attributes: ['id', 'fullName'] },
          { model: models.Patient, attributes: ['id', 'fullName'] },
          { model: models.Appointment, attributes: ['id', 'startTime'] },
        ],
      });

      res.json({
        success: true,
        data: fullReminder,
        message: 'Reminder updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Mark reminder as completed
   */
  static async complete(req, res, next) {
    try {
      const { id } = req.params;

      const reminder = await models.Reminder.findOne({ where: { id } });

      if (!reminder) {
        throw new AppError('Reminder not found', 404, 'NOT_FOUND');
      }

      // Access control
      if (!req.user.roles?.includes('admin') &&
          reminder.recipientId !== req.user.id &&
          reminder.userId !== req.user.id) {
        throw new AppError('Cannot complete this reminder', 403, 'FORBIDDEN');
      }

      await reminder.update({
        status: 'completed',
        completedAt: new Date(),
        completedBy: req.user.id,
      });

      // Load full reminder data
      const fullReminder = await models.Reminder.findOne({
        where: { id },
        include: [
          { model: models.User, as: 'user', attributes: ['id', 'username'] },
          { model: models.User, as: 'recipient', attributes: ['id', 'username'] },
          { model: models.Doctor, attributes: ['id', 'fullName'] },
          { model: models.Patient, attributes: ['id', 'fullName'] },
          { model: models.Appointment, attributes: ['id', 'startTime'] },
        ],
      });

      res.json({
        success: true,
        data: fullReminder,
        message: 'Reminder marked as completed',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Cancel reminder
   */
  static async cancel(req, res, next) {
    try {
      const { id } = req.params;

      const reminder = await models.Reminder.findOne({ where: { id } });

      if (!reminder) {
        throw new AppError('Reminder not found', 404, 'NOT_FOUND');
      }

      // Access control
      if (!req.user.roles?.includes('admin') && reminder.userId !== req.user.id) {
        throw new AppError('Cannot cancel this reminder', 403, 'FORBIDDEN');
      }

      await reminder.update({
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelledBy: req.user.id,
      });

      // Load full reminder data
      const fullReminder = await models.Reminder.findOne({
        where: { id },
        include: [
          { model: models.User, as: 'user', attributes: ['id', 'username'] },
          { model: models.User, as: 'recipient', attributes: ['id', 'username'] },
          { model: models.Doctor, attributes: ['id', 'fullName'] },
          { model: models.Patient, attributes: ['id', 'fullName'] },
          { model: models.Appointment, attributes: ['id', 'startTime'] },
        ],
      });

      res.json({
        success: true,
        data: fullReminder,
        message: 'Reminder cancelled successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete reminder
   */
  static async delete(req, res, next) {
    try {
      const { id } = req.params;

      const reminder = await models.Reminder.findOne({ where: { id } });

      if (!reminder) {
        throw new AppError('Reminder not found', 404, 'NOT_FOUND');
      }

      // Access control
      if (!req.user.roles?.includes('admin') && reminder.userId !== req.user.id) {
        throw new AppError('Cannot delete this reminder', 403, 'FORBIDDEN');
      }

      await reminder.destroy();

      res.json({
        success: true,
        message: 'Reminder deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get my reminders
   */
  static async getMyReminders(req, res, next) {
    try {
      const {
        status,
        type,
        page = 1,
        limit = 20,
      } = req.query;

      const where = {
        [Op.or]: [
          { userId: req.user.id },
          { recipientId: req.user.id },
        ],
      };

      if (status) where.status = status;
      if (type) where.type = type;

      const offset = (page - 1) * limit;

      const { count, rows } = await models.Reminder.findAndCountAll({
        where,
        include: [
          { model: models.User, as: 'user', attributes: ['id', 'username'] },
          { model: models.User, as: 'recipient', attributes: ['id', 'username'] },
          { model: models.Doctor, attributes: ['id', 'fullName'] },
          { model: models.Patient, attributes: ['id', 'fullName'] },
          { model: models.Appointment, attributes: ['id', 'startTime'] },
        ],
        order: [['scheduledFor', 'ASC']],
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
   * Get reminders by doctor
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
      if (doctorId !== req.user.doctorId && !req.user.roles?.includes('admin')) {
        throw new AppError('Cannot access other doctor reminders', 403, 'FORBIDDEN');
      }

      const where = { doctorId };

      if (status) where.status = status;
      if (type) where.type = type;

      const offset = (page - 1) * limit;

      const { count, rows } = await models.Reminder.findAndCountAll({
        where,
        include: [
          { model: models.User, as: 'user', attributes: ['id', 'username'] },
          { model: models.User, as: 'recipient', attributes: ['id', 'username'] },
          { model: models.Patient, attributes: ['id', 'fullName'] },
          { model: models.Appointment, attributes: ['id', 'startTime'] },
        ],
        order: [['scheduledFor', 'ASC']],
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
   * Get reminders by patient
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
      if (patientId !== req.user.patientId && !req.user.roles?.includes('admin')) {
        throw new AppError('Cannot access other patient reminders', 403, 'FORBIDDEN');
      }

      const where = { patientId };

      if (status) where.status = status;
      if (type) where.type = type;

      const offset = (page - 1) * limit;

      const { count, rows } = await models.Reminder.findAndCountAll({
        where,
        include: [
          { model: models.User, as: 'user', attributes: ['id', 'username'] },
          { model: models.User, as: 'recipient', attributes: ['id', 'username'] },
          { model: models.Doctor, attributes: ['id', 'fullName'] },
          { model: models.Appointment, attributes: ['id', 'startTime'] },
        ],
        order: [['scheduledFor', 'ASC']],
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
   * Send test reminder
   */
  static async sendTest(req, res, next) {
    try {
      const { message = 'Это тестовое напоминание' } = req.body;

      // Create a test reminder that should be delivered immediately
      const reminder = await models.Reminder.create({
        userId: req.user.id,
        recipientId: req.user.id,
        type: 'custom',
        title: 'Тестовое напоминание',
        message,
        scheduledFor: new Date(),
        status: 'pending',
        createdBy: req.user.id,
      });

      res.json({
        success: true,
        data: reminder,
        message: 'Test reminder created. It should be delivered shortly.',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get reminder statistics
   */
  static async getStatistics(req, res, next) {
    try {
      const {
        doctorId,
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

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt[Op.gte] = new Date(startDate);
        if (endDate) where.createdAt[Op.lte] = new Date(endDate);
      }

      // Get counts by status
      const byStatus = await models.Reminder.findAll({
        where,
        attributes: ['status', [models.Sequelize.fn('COUNT', models.Sequelize.col('id')), 'count']],
        group: ['status'],
        raw: true,
      });

      // Get counts by type
      const byType = await models.Reminder.findAll({
        where,
        attributes: ['type', [models.Sequelize.fn('COUNT', models.Sequelize.col('id')), 'count']],
        group: ['type'],
        raw: true,
      });

      // Get total
      const total = await models.Reminder.count({ where });

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

module.exports = ReminderController;
