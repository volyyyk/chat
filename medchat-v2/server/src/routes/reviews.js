/**
 * Review Routes
 */

const express = require('express');
const router = express.Router();
const ReviewController = require('../controllers/reviewController');
const { validate } = require('../middleware/validation');
const { authenticate, authorize, isDoctor } = require('../middleware/auth');
const {
  createReviewSchema,
  updateReviewSchema,
  listReviewSchema,
  respondReviewSchema,
} = require('../validators/review');

/**
 * @swagger
 * /api/reviews:
 *   get:
 *     summary: List reviews (public)
 *     tags: [Reviews]
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
 *         name: rating
 *         schema:
 *           type: number
 *           minimum: 1
 *           maximum: 5
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, approved, rejected, published]
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
 *         description: List of reviews
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Review'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 */
router.get('/', validate(listReviewSchema, 'query'), ReviewController.list);

/**
 * @swagger
 * /api/reviews/{id}:
 *   get:
 *     summary: Get review by ID (public)
 *     tags: [Reviews]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Review details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Review'
 */
router.get('/:id', ReviewController.getById);

// Authenticated routes
router.use(authenticate());

/**
 * @swagger
 * /api/reviews:
 *   post:
 *     summary: Create review
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateReviewRequest'
 *     responses:
 *       201:
 *         description: Review created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Review'
 */
router.post('/', validate(createReviewSchema), ReviewController.create);

/**
 * @swagger
 * /api/reviews/my:
 *   get:
 *     summary: Get my reviews
 *     tags: [Reviews]
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
 *     responses:
 *       200:
 *         description: List of user's reviews
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Review'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 */
router.get('/my', ReviewController.getMyReviews);

/**
 * @swagger
 * /api/reviews/{id}:
 *   put:
 *     summary: Update review
 *     tags: [Reviews]
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
 *             $ref: '#/components/schemas/UpdateReviewRequest'
 *     responses:
 *       200:
 *         description: Review updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Review'
 */
router.put('/:id', validate(updateReviewSchema), ReviewController.update);

/**
 * @swagger
 * /api/reviews/{id}/respond:
 *   post:
 *     summary: Respond to review (doctor/clinic only)
 *     tags: [Reviews]
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
 *             $ref: '#/components/schemas/RespondReviewRequest'
 *     responses:
 *       200:
 *         description: Response added successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Review'
 */
router.post('/:id/respond', validate(respondReviewSchema), isDoctor(), ReviewController.respond);

/**
 * @swagger
 * /api/reviews/{id}/like:
 *   post:
 *     summary: Like review
 *     tags: [Reviews]
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
 *         description: Review liked successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 likes:
 *                   type: number
 */
router.post('/:id/like', ReviewController.like);

/**
 * @swagger
 * /api/reviews/{id}/dislike:
 *   post:
 *     summary: Dislike review
 *     tags: [Reviews]
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
 *         description: Review disliked successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 dislikes:
 *                   type: number
 */
router.post('/:id/dislike', ReviewController.dislike);

/**
 * @swagger
 * /api/reviews/{id}:
 *   delete:
 *     summary: Delete review
 *     tags: [Reviews]
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
 *         description: Review deleted successfully
 */
router.delete('/:id', ReviewController.delete);

/**
 * @swagger
 * /api/reviews/doctor/{doctorId}:
 *   get:
 *     summary: Get reviews by doctor
 *     tags: [Reviews]
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
 *         description: List of reviews
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Review'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 */
router.get('/doctor/:doctorId', ReviewController.getByDoctor);

/**
 * @swagger
 * /api/reviews/clinic/{clinicId}:
 *   get:
 *     summary: Get reviews by clinic
 *     tags: [Reviews]
 *     parameters:
 *       - in: path
 *         name: clinicId
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
 *     responses:
 *       200:
 *         description: List of reviews
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Review'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 */
router.get('/clinic/:clinicId', ReviewController.getByClinic);

/**
 * @swagger
 * /api/reviews/statistics:
 *   get:
 *     summary: Get review statistics
 *     tags: [Reviews]
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
 *     responses:
 *       200:
 *         description: Review statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalReviews:
 *                   type: number
 *                 averageRating:
 *                   type: number
 *                 byRating:
 *                   type: object
 *                 recentReviews:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Review'
 */
router.get('/statistics', ReviewController.getStatistics);

// Admin routes
router.use(authorize(['admin', 'clinic_admin']));

/**
 * @swagger
 * /api/reviews/{id}/approve:
 *   post:
 *     summary: Approve review (admin only)
 *     tags: [Reviews]
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
 *         description: Review approved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Review'
 */
router.post('/:id/approve', ReviewController.approve);

/**
 * @swagger
 * /api/reviews/{id}/reject:
 *   post:
 *     summary: Reject review (admin only)
 *     tags: [Reviews]
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
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Review rejected successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Review'
 */
router.post('/:id/reject', ReviewController.reject);

/**
 * @swagger
 * /api/reviews/{id}/publish:
 *   post:
 *     summary: Publish review (admin only)
 *     tags: [Reviews]
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
 *         description: Review published successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Review'
 */
router.post('/:id/publish', ReviewController.publish);

module.exports = router;
