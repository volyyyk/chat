/**
 * Reminder Routes
 */

const express = require('express');
const router = express.Router();
const ReminderController = require('../controllers/reminderController');
const { validate } = require('../middleware/validation');
const { authenticate, authorize, isDoctor } = require('../middleware/auth');
const {
  createReminderSchema,
  updateReminderSchema,
  listReminderSchema,
} = require('../validators/reminder');

// All routes require authentication
router.use(authenticate());

/**
 * @swagger
 * /api/reminders:
 *   post:
 *     summary: Create reminder
 *     tags: [Reminders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateReminderRequest'
 *     responses:
 *       201:
 *         description: Reminder created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Reminder'
 */
router.post('/', validate(createReminderSchema), ReminderController.create);

/**
 * @swagger
 * /api/reminders:
 *   get:
 *     summary: List reminders
 *     tags: [Reminders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: doctorId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: patientId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: appointmentId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [appointment, medication, test, followup, payment, custom]
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, sent, delivered, read, completed, cancelled]
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: List of reminders
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Reminder'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 */
router.get('/', validate(listReminderSchema, 'query'), ReminderController.list);

/**
 * @swagger
 * /api/reminders/{id}:
 *   get:
 *     summary: Get reminder by ID
 *     tags: [Reminders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Reminder details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Reminder'
 */
router.get('/:id', ReminderController.getById);

/**
 * @swagger
 * /api/reminders/{id}:
 *   put:
 *     summary: Update reminder
 *     tags: [Reminders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateReminderRequest'
 *     responses:
 *       200:
 *         description: Reminder updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Reminder'
 */
router.put('/:id', validate(updateReminderSchema), ReminderController.update);

/**
 * @swagger
 * /api/reminders/{id}/complete:
 *   post:
 *     summary: Mark reminder as completed
 *     tags: [Reminders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Reminder marked as completed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Reminder'
 */
router.post('/:id/complete', ReminderController.complete);

/**
 * @swagger
 * /api/reminders/{id}/cancel:
 *   post:
 *     summary: Cancel reminder
 *     tags: [Reminders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Reminder cancelled successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Reminder'
 */
router.post('/:id/cancel', ReminderController.cancel);

/**
 * @swagger
 * /api/reminders/{id}:
 *   delete:
 *     summary: Delete reminder
 *     tags: [Reminders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Reminder deleted successfully
 */
router.delete('/:id', ReminderController.delete);

/**
 * @swagger
 * /api/reminders/my:
 *   get:
 *     summary: Get my reminders
 *     tags: [Reminders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, sent, delivered, read, completed, cancelled]
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [appointment, medication, test, followup, payment, custom]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: List of user's reminders
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Reminder'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 */
router.get('/my', ReminderController.getMyReminders);

/**
 * @swagger
 * /api/reminders/doctor/{doctorId}:
 *   get:
 *     summary: Get reminders by doctor
 *     tags: [Reminders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: doctorId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, sent, delivered, read, completed, cancelled]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: List of reminders
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Reminder'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 */
router.get('/doctor/:doctorId', isDoctor(), ReminderController.getByDoctor);

/**
 * @swagger
 * /api/reminders/patient/{patientId}:
 *   get:
 *     summary: Get reminders by patient
 *     tags: [Reminders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, sent, delivered, read, completed, cancelled]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: List of reminders
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Reminder'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 */
router.get('/patient/:patientId', ReminderController.getByPatient);

/**
 * @swagger
 * /api/reminders/send-test:
 *   post:
 *     summary: Send test reminder
 *     tags: [Reminders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               message:
 *                 type: string
 *     responses:
 *       200:
 *         description: Test reminder sent
 */
router.post('/send-test', ReminderController.sendTest);

/**
 * @swagger
 * /api/reminders/statistics:
 *   get:
 *     summary: Get reminder statistics
 *     tags: [Reminders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: doctorId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Reminder statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: number
 *                 byStatus:
 *                   type: object
 *                 byType:
 *                   type: object
 */
router.get('/statistics', ReminderController.getStatistics);

module.exports = router;
