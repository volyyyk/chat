/**
 * Clinic Routes
 */

const express = require('express');
const router = express.Router();
const ClinicController = require('../controllers/clinicController');
const { validate } = require('../middleware/validation');
const { authenticate, authorize, isClinicAdmin, isSystemAdmin } = require('../middleware/auth');
const {
  createClinicSchema,
  updateClinicSchema,
  listClinicSchema,
  verifyDoctorSchema,
} = require('../validators/clinic');

// All routes require authentication
router.use(authenticate());

/**
 * @swagger
 * /api/clinics:
 *   post:
 *     summary: Create new clinic (admin only)
 *     tags: [Clinics]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateClinicRequest'
 *     responses:
 *       201:
 *         description: Clinic created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Clinic'
 *       403:
 *         description: Access denied
 */
router.post('/', authorize('system_admin'), validate(createClinicSchema), ClinicController.create);

/**
 * @swagger
 * /api/clinics:
 *   get:
 *     summary: List clinics
 *     tags: [Clinics]
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
 *         name: city
 *         schema:
 *           type: string
 *       - in: query
 *         name: region
 *         schema:
 *           type: string
 *       - in: query
 *         name: verified
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of clinics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Clinic'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 */
router.get('/', validate(listClinicSchema, 'query'), ClinicController.list);

/**
 * @swagger
 * /api/clinics/{id}:
 *   get:
 *     summary: Get clinic by ID
 *     tags: [Clinics]
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
 *         description: Clinic details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Clinic'
 *       404:
 *         description: Clinic not found
 */
router.get('/:id', ClinicController.getById);

/**
 * @swagger
 * /api/clinics/{id}:
 *   put:
 *     summary: Update clinic (admin only)
 *     tags: [Clinics]
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
 *             $ref: '#/components/schemas/UpdateClinicRequest'
 *     responses:
 *       200:
 *         description: Clinic updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Clinic'
 *       403:
 *         description: Access denied
 */
router.put('/:id', authorize('system_admin'), validate(updateClinicSchema), ClinicController.update);

/**
 * @swagger
 * /api/clinics/{id}:
 *   delete:
 *     summary: Delete clinic (admin only)
 *     tags: [Clinics]
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
 *         description: Clinic deleted successfully
 *       403:
 *         description: Access denied
 */
router.delete('/:id', authorize('system_admin'), ClinicController.delete);

/**
 * @swagger
 * /api/clinics/{id}/doctors:
 *   get:
 *     summary: Get clinic doctors
 *     tags: [Clinics]
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
 *         name: verified
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of clinic doctors
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
router.get('/:id/doctors', ClinicController.getDoctors);

/**
 * @swagger
 * /api/clinics/{id}/invite-doctor:
 *   post:
 *     summary: Invite doctor to clinic
 *     tags: [Clinics]
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
 *               - email
 *               - firstName
 *               - lastName
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               specialties:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *               message:
 *                 type: string
 *     responses:
 *       200:
 *         description: Invitation sent successfully
 *       403:
 *         description: Access denied
 */
router.post('/:id/invite-doctor', isClinicAdmin(), ClinicController.inviteDoctor);

/**
 * @swagger
 * /api/clinics/{id}/doctors/{doctorId}/verify:
 *   post:
 *     summary: Verify doctor in clinic
 *     tags: [Clinics]
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
 *         name: doctorId
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
 *               - verified
 *             properties:
 *               verified:
 *                 type: boolean
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Doctor verification updated successfully
 *       403:
 *         description: Access denied
 */
router.post('/:id/doctors/:doctorId/verify', isClinicAdmin(), validate(verifyDoctorSchema), ClinicController.verifyDoctor);

/**
 * @swagger
 * /api/clinics/{id}/statistics:
 *   get:
 *     summary: Get clinic statistics
 *     tags: [Clinics]
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
 *         description: Clinic statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 clinic:
 *                   type: string
 *                 statistics:
 *                   type: object
 *                   properties:
 *                     doctors:
 *                       type: integer
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
 */
router.get('/:id/statistics', ClinicController.getStatistics);

/**
 * @swagger
 * /api/clinics/{id}/settings:
 *   put:
 *     summary: Update clinic settings
 *     tags: [Clinics]
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
 *                       pattern: ^[0-9]{2}:[0-9]{2}$
 *               logo:
 *                 type: string
 *                 format: uri
 *               banner:
 *                 type: string
 *                 format: uri
 *               subscriptionPlan:
 *                 type: string
 *                 enum: [free, basic, pro, enterprise]
 *               doctorSharePercent:
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 100
 *               clinicSharePercent:
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 100
 *               yooMoneyEnabled:
 *                 type: boolean
 *               tinkoffEnabled:
 *                 type: boolean
 *               stripeEnabled:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Clinic settings updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Clinic'
 */
router.put('/:id/settings', ClinicController.updateSettings);

module.exports = router;
