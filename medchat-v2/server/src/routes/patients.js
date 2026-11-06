/**
 * Patient Routes
 */

const express = require('express');
const router = express.Router();
const PatientController = require('../controllers/patientController');
const { validate } = require('../middleware/validation');
const { authenticate, authorize, isPatient } = require('../middleware/auth');
const {
  createPatientSchema,
  updatePatientSchema,
  updatePatientSettingsSchema,
  listPatientSchema,
  patientProfileSchema,
  addPatientToDoctorSchema,
} = require('../validators/patient');

// All routes require authentication
router.use(authenticate());

/**
 * @swagger
 * /api/patients:
 *   get:
 *     summary: List patients
 *     tags: [Patients]
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
 *         name: doctorId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: clinicId
 *         schema:
 *           type: string
 *           format: uuid
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
 *         description: List of patients
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
router.get('/', PatientController.list);

/**
 * @swagger
 * /api/patients/me:
 *   get:
 *     summary: Get current patient profile
 *     tags: [Patients]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Patient profile
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Patient'
 */
router.get('/me', isPatient(), PatientController.getProfile);

/**
 * @swagger
 * /api/patients/{id}:
 *   get:
 *     summary: Get patient by ID
 *     tags: [Patients]
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
 *         description: Patient details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Patient'
 */
router.get('/:id', PatientController.getById);

/**
 * @swagger
 * /api/patients/me/profile:
 *   put:
 *     summary: Update current patient profile
 *     tags: [Patients]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdatePatientProfileRequest'
 *     responses:
 *       200:
 *         description: Patient profile updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Patient'
 */
router.put('/me/profile', isPatient(), validate(patientProfileSchema), PatientController.updateProfile);

/**
 * @swagger
 * /api/patients/{id}/chats:
 *   get:
 *     summary: Get patient chats
 *     tags: [Patients]
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
 *         description: List of patient chats
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
router.get('/:id/chats', PatientController.getChats);

/**
 * @swagger
 * /api/patients/{id}/statistics:
 *   get:
 *     summary: Get patient statistics
 *     tags: [Patients]
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
 *         description: Patient statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 patient:
 *                   type: string
 *                 statistics:
 *                   type: object
 *                   properties:
 *                     chats:
 *                       type: integer
 *                     messages:
 *                       type: integer
 *                     files:
 *                       type: integer
 *                     appointments:
 *                       type: integer
 *                     transactions:
 *                       type: integer
 *                     totalSpent:
 *                       type: number
 */
router.get('/:id/statistics', PatientController.getStatistics);

/**
 * @swagger
 * /api/patients/{id}/medical-info:
 *   get:
 *     summary: Get patient medical info
 *     tags: [Patients]
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
 *         description: Patient medical info
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 medicalHistory:
 *                   type: string
 *                 allergies:
 *                   type: string
 *                 chronicConditions:
 *                   type: string
 *                 bloodType:
 *                   type: string
 *                 dateOfBirth:
 *                   type: string
 *                   format: date
 *                 gender:
 *                   type: string
 *                 age:
 *                   type: integer
 */
router.get('/:id/medical-info', PatientController.getMedicalInfo);

/**
 * @swagger
 * /api/patients/{id}/medical-info:
 *   put:
 *     summary: Update patient medical info
 *     tags: [Patients]
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
 *               medicalHistory:
 *                 type: string
 *               allergies:
 *                 type: string
 *               chronicConditions:
 *                 type: string
 *               bloodType:
 *                 type: string
 *                 enum: [A+, A-, B+, B-, AB+, AB-, O+, O-]
 *               dateOfBirth:
 *                 type: string
 *                 format: date
 *               gender:
 *                 type: string
 *                 enum: [male, female, other]
 *     responses:
 *       200:
 *         description: Medical info updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Patient'
 */
router.put('/:id/medical-info', PatientController.updateMedicalInfo);

/**
 * @swagger
 * /api/patients/{id}/files:
 *   get:
 *     summary: Get patient files
 *     tags: [Patients]
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
 *         name: category
 *         schema:
 *           type: string
 *           enum: [medical_record, analysis, prescription, referral, certificate, photo, video, audio, document, other]
 *       - in: query
 *         name: visibility
 *         schema:
 *           type: string
 *           enum: [private, doctor_only, patient_only, shared, public]
 *     responses:
 *       200:
 *         description: List of patient files
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/File'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 */
router.get('/:id/files', PatientController.getFiles);

/**
 * @swagger
 * /api/patients/{id}/public-key:
 *   get:
 *     summary: Get patient public key
 *     tags: [Patients]
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
 *         description: Patient public key
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 publicKey:
 *                   type: string
 */
router.get('/:id/public-key', PatientController.getPublicKey);

/**
 * @swagger
 * /api/patients/me/encryption-keys:
 *   post:
 *     summary: Generate new encryption keys
 *     tags: [Patients]
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
router.post('/me/encryption-keys', isPatient(), PatientController.generateEncryptionKeys);

module.exports = router;
