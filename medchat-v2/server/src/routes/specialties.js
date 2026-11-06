/**
 * Specialty Routes
 */

const express = require('express');
const router = express.Router();
const SpecialtyController = require('../controllers/specialtyController');
const { validate } = require('../middleware/validation');
const { authenticate, authorize } = require('../middleware/auth');
const {
  createSpecialtySchema,
  updateSpecialtySchema,
  listSpecialtySchema,
} = require('../validators/specialty');

/**
 * @swagger
 * /api/specialties:
 *   get:
 *     summary: List all specialties (public)
 *     tags: [Specialties]
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
 *           default: 100
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of specialties
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Specialty'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 */
router.get('/', validate(listSpecialtySchema, 'query'), SpecialtyController.list);

/**
 * @swagger
 * /api/specialties/{id}:
 *   get:
 *     summary: Get specialty by ID (public)
 *     tags: [Specialties]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Specialty details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Specialty'
 */
router.get('/:id', SpecialtyController.getById);

/**
 * @swagger
 * /api/specialties/by-name/{name}:
 *   get:
 *     summary: Get specialty by name (public)
 *     tags: [Specialties]
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Specialty details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Specialty'
 */
router.get('/by-name/:name', SpecialtyController.getByName);

// Admin routes
router.use(authenticate(), authorize(['admin']));

/**
 * @swagger
 * /api/specialties:
 *   post:
 *     summary: Create specialty (admin only)
 *     tags: [Specialties]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateSpecialtyRequest'
 *     responses:
 *       201:
 *         description: Specialty created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Specialty'
 */
router.post('/', validate(createSpecialtySchema), SpecialtyController.create);

/**
 * @swagger
 * /api/specialties/{id}:
 *   put:
 *     summary: Update specialty (admin only)
 *     tags: [Specialties]
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
 *             $ref: '#/components/schemas/UpdateSpecialtyRequest'
 *     responses:
 *       200:
 *         description: Specialty updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Specialty'
 */
router.put('/:id', validate(updateSpecialtySchema), SpecialtyController.update);

/**
 * @swagger
 * /api/specialties/{id}:
 *   delete:
 *     summary: Delete specialty (admin only)
 *     tags: [Specialties]
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
 *         description: Specialty deleted successfully
 */
router.delete('/:id', SpecialtyController.delete);

/**
 * @swagger
 * /api/specialties/categories:
 *   get:
 *     summary: Get specialty categories (public)
 *     tags: [Specialties]
 *     responses:
 *       200:
 *         description: List of categories
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: string
 */
router.get('/categories', SpecialtyController.getCategories);

/**
 * @swagger
 * /api/specialties/popular:
 *   get:
 *     summary: Get popular specialties (public)
 *     tags: [Specialties]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: List of popular specialties
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Specialty'
 */
router.get('/popular', SpecialtyController.getPopular);

/**
 * @swagger
 * /api/specialties/clinic/{clinicId}:
 *   get:
 *     summary: Get specialties by clinic
 *     tags: [Specialties]
 *     parameters:
 *       - in: path
 *         name: clinicId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: List of clinic specialties
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Specialty'
 */
router.get('/clinic/:clinicId', SpecialtyController.getByClinic);

/**
 * @swagger
 * /api/specialties/doctor/{doctorId}:
 *   get:
 *     summary: Get specialties by doctor
 *     tags: [Specialties]
 *     parameters:
 *       - in: path
 *         name: doctorId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: List of doctor specialties
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Specialty'
 */
router.get('/doctor/:doctorId', SpecialtyController.getByDoctor);

module.exports = router;
