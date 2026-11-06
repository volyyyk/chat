/**
 * Doctor Routes
 */

const express = require('express');
const router = express.Router();
const DoctorController = require('../controllers/doctorController');
const { validate } = require('../middleware/validation');
const { authenticate, authorize, isDoctor } = require('../middleware/auth');
const {
  createDoctorSchema,
  updateDoctorSchema,
  updateDoctorSettingsSchema,
  listDoctorSchema,
  doctorProfileSchema,
  inviteDoctorSchema,
} = require('../validators/doctor');

// All routes require authentication
router.use(authenticate());

/**
 * @swagger
 * /api/doctors:
 *   get:
 *     summary: List doctors
 *     tags: [Doctors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *       - in: query
 *         name: clinicId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: specialty
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: verified
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: isOnline
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of doctors
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Doctor'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 */
router.get('/', DoctorController.list);

/**
 * @swagger
 * /api/doctors/me:
 *   get:
 *     summary: Get current doctor profile
 *     tags: [Doctors]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Doctor profile
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Doctor'
 */
router.get('/me', isDoctor(), DoctorController.getProfile);

/**
 * @swagger
 * /api/doctors/{id}:
 *   get:
 *     summary: Get doctor by ID
 *     tags: [Doctors]
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
 *         description: Doctor details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Doctor'
 */
router.get('/:id', DoctorController.getById);

/**
 * @swagger
 * /api/doctors/me/profile:
 *   put:
 *     summary: Update current doctor profile
 *     tags: [Doctors]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateDoctorProfileRequest'
 *     responses:
 *       200:
 *         description: Doctor profile updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Doctor'
 */
router.put('/me/profile', isDoctor(), validate(doctorProfileSchema), DoctorController.updateProfile);

/**
 * @swagger
 * /api/doctors/me/settings:
 *   put:
 *     summary: Update current doctor settings
 *     tags: [Doctors]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateDoctorSettingsRequest'
 *     responses:
 *       200:
 *         description: Doctor settings updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Doctor'
 */
router.put('/me/settings', isDoctor(), validate(updateDoctorSettingsSchema), DoctorController.updateSettings);

/**
 * @swagger
 * /api/doctors/{id}/patients:
 *   get:
 *     summary: Get doctor patients
 *     tags: [Doctors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
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
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive, archived, blocked, deleted]
 *     responses:
 *       200:
 *         description: List of doctor patients
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Patient'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 */
router.get('/:id/patients', DoctorController.getPatients);

/**
 * @swagger
 * /api/doctors/{id}/patients:
 *   post:
 *     summary: Add patient to doctor
 *     tags: [Doctors]
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
 *             type: object
 *             required:
 *               - patientId
 *             properties:
 *               patientId:
 *                 type: string
 *                 format: uuid
 *               patientNumber:
 *                 type: string
 *     responses:
 *       200:
 *         description: Patient added successfully
 */
router.post('/:id/patients', isDoctor(), DoctorController.addPatient);

/**
 * @swagger
 * /api/doctors/{id}/patients/{patientId}:
 *   delete:
 *     summary: Remove patient from doctor
 *     tags: [Doctors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Patient removed successfully
 */
router.delete('/:id/patients/:patientId', isDoctor(), DoctorController.removePatient);

/**
 * @swagger
 * /api/doctors/{id}/chats:
 *   get:
 *     summary: Get doctor chats
 *     tags: [Doctors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
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
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, archived, closed, blocked, deleted]
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [individual, group, consultation, followup]
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of doctor chats
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Chat'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 */
router.get('/:id/chats', DoctorController.getChats);

/**
 * @swagger
 * /api/doctors/{id}/statistics:
 *   get:
 *     summary: Get doctor statistics
 *     tags: [Doctors]
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
 *         description: Doctor statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 doctor:
 *                   type: string
 *                 statistics:
 *                   type: object
 *                   properties:
 *                     patients:
 *                       type: integer
 *                     chats:
 *                       type: integer
 *                     messages:
 *                       type: integer
 *                     transactions:
 *                       type: integer
 *                     totalRevenue:
 *                       type: number
 *                     averageRating:
 *                       type: number
 *                     totalReviews:
 *                       type: integer
 */
router.get('/:id/statistics', DoctorController.getStatistics);

/**
 * @swagger
 * /api/doctors/me/online:
 *   post:
 *     summary: Set doctor online status
 *     tags: [Doctors]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - isOnline
 *             properties:
 *               isOnline:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Online status updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Doctor'
 */
router.post('/me/online', isDoctor(), DoctorController.setOnlineStatus);

/**
 * @swagger
 * /api/doctors/{id}/working-hours:
 *   get:
 *     summary: Get doctor working hours
 *     tags: [Doctors]
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
 *         description: Doctor working hours
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 workingHours:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       day:
 *                         type: integer
 *                       start:
 *                         type: string
 *                       end:
 *                         type: string
 *                 convenientResponseTime:
 *                   type: string
 */
router.get('/:id/working-hours', DoctorController.getWorkingHours);

/**
 * @swagger
 * /api/doctors/{id}/working-hours:
 *   put:
 *     summary: Update doctor working hours
 *     tags: [Doctors]
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
 *             type: object
 *             properties:
 *               workingHours:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     day:
 *                       type: integer
 *                       minimum: 0
 *                       maximum: 6
 *                     start:
 *                       type: string
 *                       pattern: ^[0-9]{2}:[0-9]{2}$
 *                     end:
 *                       type: string
 *                       pattern: ^[0-9]{[0-9]{2}$
 *               convenientResponseTime:
 *                 type: string
 *     responses:
 *       200:
 *         description: Working hours updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Doctor'
 */
router.put('/:id/working-hours', DoctorController.updateWorkingHours);

/**
 * @swagger
 * /api/doctors/{id}/public-key:
 *   get:
 *     summary: Get doctor public key
 *     tags: [Doctors]
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
 *         description: Doctor public key
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 publicKey:
 *                   type: string
 */
router.get('/:id/public-key', DoctorController.getPublicKey);

/**
 * @swagger
 * /api/doctors/me/encryption-keys:
 *   post:
 *     summary: Generate new encryption keys
 *     tags: [Doctors]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Encryption keys generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 publicKey:
 *                   type: string
 */
router.post('/me/encryption-keys', isDoctor(), DoctorController.generateEncryptionKeys);

module.exports = router;
