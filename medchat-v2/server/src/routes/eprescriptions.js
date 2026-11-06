/**
 * E-Prescription Routes
 */

const express = require('express');
const router = express.Router();
const EPrescriptionController = require('../controllers/eprescriptionController');
const { validate } = require('../middleware/validation');
const { authenticate, authorize, isDoctor } = require('../middleware/auth');
const {
  createEPrescriptionSchema,
  updateEPrescriptionSchema,
  listEPrescriptionSchema,
  cancelEPrescriptionSchema,
} = require('../validators/eprescription');

// All routes require authentication
router.use(authenticate());

/**
 * @swagger
 * /api/eprescriptions:
 *   post:
 *     summary: Create e-prescription
 *     tags: [E-Prescriptions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateEPrescriptionRequest'
 *     responses:
 *       201:
 *         description: E-Prescription created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EPrescription'
 */
router.post('/', validate(createEPrescriptionSchema), isDoctor(), EPrescriptionController.create);

/**
 * @swagger
 * /api/eprescriptions:
 *   get:
 *     summary: List e-prescriptions
 *     tags: [E-Prescriptions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, active, cancelled, fulfilled, expired]
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [medication, procedure, test, referral, other]
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
 *         description: List of e-prescriptions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/EPrescription'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 */
router.get('/', validate(listEPrescriptionSchema, 'query'), EPrescriptionController.list);

/**
 * @swagger
 * /api/eprescriptions/{id}:
 *   get:
 *     summary: Get e-prescription by ID
 *     tags: [E-Prescriptions]
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
 *         description: E-Prescription details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EPrescription'
 */
router.get('/:id', EPrescriptionController.getById);

/**
 * @swagger
 * /api/eprescriptions/{id}:
 *   put:
 *     summary: Update e-prescription
 *     tags: [E-Prescriptions]
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
 *             $ref: '#/components/schemas/UpdateEPrescriptionRequest'
 *     responses:
 *       200:
 *         description: E-Prescription updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EPrescription'
 */
router.put('/:id', validate(updateEPrescriptionSchema), isDoctor(), EPrescriptionController.update);

/**
 * @swagger
 * /api/eprescriptions/{id}/cancel:
 *   post:
 *     summary: Cancel e-prescription
 *     tags: [E-Prescriptions]
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
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CancelEPrescriptionRequest'
 *     responses:
 *       200:
 *         description: E-Prescription cancelled successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EPrescription'
 */
router.post('/:id/cancel', validate(cancelEPrescriptionSchema), isDoctor(), EPrescriptionController.cancel);

/**
 * @swagger
 * /api/eprescriptions/{id}/fulfill:
 *   post:
 *     summary: Mark e-prescription as fulfilled
 *     tags: [E-Prescriptions]
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
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fulfilledBy:
 *                 type: string
 *               fulfilledAt:
 *                 type: string
 *                 format: date-time
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: E-Prescription fulfilled
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EPrescription'
 */
router.post('/:id/fulfill', isDoctor(), EPrescriptionController.fulfill);

/**
 * @swagger
 * /api/eprescriptions/{id}:
 *   delete:
 *     summary: Delete e-prescription
 *     tags: [E-Prescriptions]
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
 *         description: E-Prescription deleted successfully
 */
router.delete('/:id', isDoctor(), EPrescriptionController.delete);

/**
 * @swagger
 * /api/eprescriptions/{id}/pdf:
 *   get:
 *     summary: Get e-prescription as PDF
 *     tags: [E-Prescriptions]
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
 *         description: PDF document
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 */
router.get('/:id/pdf', EPrescriptionController.getPDF);

/**
 * @swagger
 * /api/eprescriptions/{id}/print:
 *   get:
 *     summary: Get printable version
 *     tags: [E-Prescriptions]
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
 *         description: Printable version
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 */
router.get('/:id/print', EPrescriptionController.getPrintable);

/**
 * @swagger
 * /api/eprescriptions/{id}/send:
 *   post:
 *     summary: Send e-prescription to patient
 *     tags: [E-Prescriptions]
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
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               sendVia:
 *                 type: string
 *                 enum: [chat, email, sms]
 *               message:
 *                 type: string
 *     responses:
 *       200:
 *         description: E-Prescription sent successfully
 */
router.post('/:id/send', isDoctor(), EPrescriptionController.send);

/**
 * @swagger
 * /api/eprescriptions/doctor/{doctorId}:
 *   get:
 *     summary: Get e-prescriptions by doctor
 *     tags: [E-Prescriptions]
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
 *           enum: [draft, active, cancelled, fulfilled, expired]
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
 *         description: List of e-prescriptions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/EPrescription'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 */
router.get('/doctor/:doctorId', isDoctor(), EPrescriptionController.getByDoctor);

/**
 * @swagger
 * /api/eprescriptions/patient/{patientId}:
 *   get:
 *     summary: Get e-prescriptions by patient
 *     tags: [E-Prescriptions]
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
 *           enum: [draft, active, cancelled, fulfilled, expired]
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
 *         description: List of e-prescriptions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/EPrescription'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 */
router.get('/patient/:patientId', EPrescriptionController.getByPatient);

/**
 * @swagger
 * /api/eprescriptions/statistics:
 *   get:
 *     summary: Get e-prescription statistics
 *     tags: [E-Prescriptions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *         description: E-Prescription statistics
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
router.get('/statistics', EPrescriptionController.getStatistics);

module.exports = router;
