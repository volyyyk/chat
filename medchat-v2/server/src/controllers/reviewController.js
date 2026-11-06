/**
 * Review Controller
 * Handles review creation, management, and moderation
 */

const models = require('../models');
const { AppError } = require('../middleware/errorHandler');
const { Op } = require('sequelize');

class ReviewController {
  /**
   * Create review
   */
  static async create(req, res, next) {
    try {
      const {
        doctorId,
        clinicId,
        rating,
        title,
        comment,
        anonymous = false,
        tags = [],
      } = req.body;

      const patientId = req.user.patientId || req.user.id;

      // Validate required fields
      if (!doctorId && !clinicId) {
        throw new AppError('Doctor ID or Clinic ID is required', 400, 'VALIDATION_ERROR');
      }

      if (!rating || rating < 1 || rating > 5) {
        throw new AppError('Rating must be between 1 and 5', 400, 'VALIDATION_ERROR');
      }

      // Check if doctor exists
      if (doctorId) {
        const doctor = await models.Doctor.findOne({ where: { id: doctorId } });
        if (!doctor) {
          throw new AppError('Doctor not found', 404, 'NOT_FOUND');
        }
      }

      // Check if clinic exists
      if (clinicId) {
        const clinic = await models.Clinic.findOne({ where: { id: clinicId } });
        if (!clinic) {
          throw new AppError('Clinic not found', 404, 'NOT_FOUND');
        }
      }

      // Check if patient has had an appointment with this doctor (for doctor reviews)
      if (doctorId) {
        const hasAppointment = await models.Appointment.findOne({
          where: {
            doctorId,
            patientId,
            status: { [Op.in]: ['completed', 'confirmed'] },
          },
        });

        if (!hasAppointment) {
          throw new AppError('You can only review doctors you have had appointments with', 400, 'VALIDATION_ERROR');
        }
      }

      // Create review
      const review = await models.Review.create({
        doctorId,
        clinicId,
        patientId,
        rating,
        title,
        comment,
        anonymous,
        tags: JSON.stringify(tags),
        status: 'pending', // Reviews need to be approved by admin
        createdBy: req.user.id,
      });

      // Load full review data
      const fullReview = await models.Review.findOne({
        where: { id: review.id },
        include: [
          { model: models.Doctor, attributes: ['id', 'fullName'] },
          { model: models.Clinic, attributes: ['id', 'name'] },
          { model: models.Patient, attributes: ['id', 'fullName'] },
        ],
      });

      res.status(201).json({
        success: true,
        data: fullReview,
        message: 'Review submitted successfully. It will be published after approval.',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * List reviews
   */
  static async list(req, res, next) {
    try {
      const {
        doctorId,
        clinicId,
        patientId,
        rating,
        status,
        page = 1,
        limit = 20,
      } = req.query;

      const where = { status: 'published' }; // Only show published reviews by default

      // Admin can see all reviews
      if (req.user.roles?.includes('admin')) {
        delete where.status;
        if (status) where.status = status;
      }

      if (doctorId) where.doctorId = doctorId;
      if (clinicId) where.clinicId = clinicId;
      if (patientId) where.patientId = patientId;
      if (rating) where.rating = rating;

      const offset = (page - 1) * limit;

      const { count, rows } = await models.Review.findAndCountAll({
        where,
        include: [
          { model: models.Doctor, attributes: ['id', 'fullName'] },
          { model: models.Clinic, attributes: ['id', 'name'] },
          { model: models.Patient, attributes: ['id', 'fullName'] },
        ],
        order: [['createdAt', 'DESC']],
        offset,
        limit: parseInt(limit),
      });

      // Parse tags for each review
      const data = rows.map(r => {
        const row = r.toJSON();
        if (row.tags) {
          row.tags = JSON.parse(row.tags);
        }
        return row;
      });

      res.json({
        success: true,
        data,
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
   * Get review by ID
   */
  static async getById(req, res, next) {
    try {
      const { id } = req.params;

      const review = await models.Review.findOne({
        where: { id },
        include: [
          { model: models.Doctor, include: [models.Specialty] },
          { model: models.Clinic },
          { model: models.Patient, attributes: ['id', 'fullName'] },
        ],
      });

      if (!review) {
        throw new AppError('Review not found', 404, 'NOT_FOUND');
      }

      // Access control - only published reviews are public
      if (review.status !== 'published' && !req.user.roles?.includes('admin')) {
        // Check if this is the user's own review
        if (review.patientId !== req.user.patientId && review.createdBy !== req.user.id) {
          throw new AppError('Review not found or not accessible', 404, 'NOT_FOUND');
        }
      }

      // Parse tags
      const data = review.toJSON();
      if (data.tags) {
        data.tags = JSON.parse(data.tags);
      }

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update review
   */
  static async update(req, res, next) {
    try {
      const { id } = req.params;
      const {
        rating,
        title,
        comment,
        tags,
      } = req.body;

      const review = await models.Review.findOne({ where: { id } });

      if (!review) {
        throw new AppError('Review not found', 404, 'NOT_FOUND');
      }

      // Access control - only the author or admin can update
      if (!req.user.roles?.includes('admin') && review.createdBy !== req.user.id) {
        throw new AppError('Cannot update this review', 403, 'FORBIDDEN');
      }

      // Cannot update published reviews
      if (review.status === 'published') {
        throw new AppError('Cannot update a published review', 400, 'VALIDATION_ERROR');
      }

      // Validate rating if provided
      if (rating && (rating < 1 || rating > 5)) {
        throw new AppError('Rating must be between 1 and 5', 400, 'VALIDATION_ERROR');
      }

      await review.update({
        rating: rating !== undefined ? rating : review.rating,
        title: title !== undefined ? title : review.title,
        comment: comment !== undefined ? comment : review.comment,
        tags: tags !== undefined ? JSON.stringify(tags) : review.tags,
      });

      // Load full review data
      const fullReview = await models.Review.findOne({
        where: { id },
        include: [
          { model: models.Doctor, attributes: ['id', 'fullName'] },
          { model: models.Clinic, attributes: ['id', 'name'] },
          { model: models.Patient, attributes: ['id', 'fullName'] },
        ],
      });

      // Parse tags
      const data = fullReview.toJSON();
      if (data.tags) {
        data.tags = JSON.parse(data.tags);
      }

      res.json({
        success: true,
        data,
        message: 'Review updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Respond to review
   */
  static async respond(req, res, next) {
    try {
      const { id } = req.params;
      const { response } = req.body;

      const review = await models.Review.findOne({ where: { id } });

      if (!review) {
        throw new AppError('Review not found', 404, 'NOT_FOUND');
      }

      // Access control - only doctor or admin can respond
      if (!req.user.roles?.includes('admin') && review.doctorId !== req.user.doctorId) {
        throw new AppError('Cannot respond to this review', 403, 'FORBIDDEN');
      }

      await review.update({
        response,
        respondedAt: new Date(),
        respondedBy: req.user.id,
      });

      // Load full review data
      const fullReview = await models.Review.findOne({
        where: { id },
        include: [
          { model: models.Doctor, attributes: ['id', 'fullName'] },
          { model: models.Clinic, attributes: ['id', 'name'] },
          { model: models.Patient, attributes: ['id', 'fullName'] },
        ],
      });

      // Parse tags
      const data = fullReview.toJSON();
      if (data.tags) {
        data.tags = JSON.parse(data.tags);
      }

      res.json({
        success: true,
        data,
        message: 'Response added successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Like review
   */
  static async like(req, res, next) {
    try {
      const { id } = req.params;

      const review = await models.Review.findOne({ where: { id } });

      if (!review) {
        throw new AppError('Review not found', 404, 'NOT_FOUND');
      }

      // Check if user already liked
      const existingLike = await models.ReviewLike.findOne({
        where: { reviewId: id, userId: req.user.id },
      });

      if (existingLike) {
        throw new AppError('You have already liked this review', 400, 'VALIDATION_ERROR');
      }

      // Add like
      await models.ReviewLike.create({
        reviewId: id,
        userId: req.user.id,
        type: 'like',
      });

      // Update like count
      const likeCount = await models.ReviewLike.count({
        where: { reviewId: id, type: 'like' },
      });

      res.json({
        success: true,
        data: { likes: likeCount },
        message: 'Review liked successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Dislike review
   */
  static async dislike(req, res, next) {
    try {
      const { id } = req.params;

      const review = await models.Review.findOne({ where: { id } });

      if (!review) {
        throw new AppError('Review not found', 404, 'NOT_FOUND');
      }

      // Check if user already disliked
      const existingDislike = await models.ReviewLike.findOne({
        where: { reviewId: id, userId: req.user.id, type: 'dislike' },
      });

      if (existingDislike) {
        throw new AppError('You have already disliked this review', 400, 'VALIDATION_ERROR');
      }

      // Remove like if exists
      await models.ReviewLike.destroy({
        where: { reviewId: id, userId: req.user.id, type: 'like' },
      });

      // Add dislike
      await models.ReviewLike.create({
        reviewId: id,
        userId: req.user.id,
        type: 'dislike',
      });

      // Update counts
      const likeCount = await models.ReviewLike.count({
        where: { reviewId: id, type: 'like' },
      });

      const dislikeCount = await models.ReviewLike.count({
        where: { reviewId: id, type: 'dislike' },
      });

      res.json({
        success: true,
        data: { likes: likeCount, dislikes: dislikeCount },
        message: 'Review disliked successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete review
   */
  static async delete(req, res, next) {
    try {
      const { id } = req.params;

      const review = await models.Review.findOne({ where: { id } });

      if (!review) {
        throw new AppError('Review not found', 404, 'NOT_FOUND');
      }

      // Access control - only author or admin can delete
      if (!req.user.roles?.includes('admin') && review.createdBy !== req.user.id) {
        throw new AppError('Cannot delete this review', 403, 'FORBIDDEN');
      }

      // Soft delete
      await review.update({
        deleted: true,
        deletedAt: new Date(),
        deletedBy: req.user.id,
      });

      res.json({
        success: true,
        message: 'Review deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get my reviews
   */
  static async getMyReviews(req, res, next) {
    try {
      const {
        status,
        page = 1,
        limit = 20,
      } = req.query;

      const where = { createdBy: req.user.id };

      // Non-admin users can only see their own reviews
      if (!req.user.roles?.includes('admin')) {
        where.createdBy = req.user.id;
      }

      if (status) where.status = status;

      const offset = (page - 1) * limit;

      const { count, rows } = await models.Review.findAndCountAll({
        where,
        include: [
          { model: models.Doctor, attributes: ['id', 'fullName'] },
          { model: models.Clinic, attributes: ['id', 'name'] },
        ],
        order: [['createdAt', 'DESC']],
        offset,
        limit: parseInt(limit),
      });

      // Parse tags for each
      const data = rows.map(r => {
        const row = r.toJSON();
        if (row.tags) {
          row.tags = JSON.parse(row.tags);
        }
        return row;
      });

      res.json({
        success: true,
        data,
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
   * Get reviews by doctor
   */
  static async getByDoctor(req, res, next) {
    try {
      const { doctorId } = req.params;
      const {
        status = 'published',
        page = 1,
        limit = 20,
      } = req.query;

      const where = { doctorId };

      // Admin can see all reviews
      if (req.user.roles?.includes('admin')) {
        if (status) where.status = status;
      } else {
        where.status = 'published';
      }

      const offset = (page - 1) * limit;

      const { count, rows } = await models.Review.findAndCountAll({
        where,
        include: [
          { model: models.Doctor, attributes: ['id', 'fullName'] },
          { model: models.Patient, attributes: ['id', 'fullName'] },
        ],
        order: [['createdAt', 'DESC']],
        offset,
        limit: parseInt(limit),
      });

      // Parse tags for each
      const data = rows.map(r => {
        const row = r.toJSON();
        if (row.tags) {
          row.tags = JSON.parse(row.tags);
        }
        return row;
      });

      res.json({
        success: true,
        data,
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
   * Get reviews by clinic
   */
  static async getByClinic(req, res, next) {
    try {
      const { clinicId } = req.params;
      const {
        status = 'published',
        page = 1,
        limit = 20,
      } = req.query;

      const where = { clinicId };

      // Admin can see all reviews
      if (req.user.roles?.includes('admin')) {
        if (status) where.status = status;
      } else {
        where.status = 'published';
      }

      const offset = (page - 1) * limit;

      const { count, rows } = await models.Review.findAndCountAll({
        where,
        include: [
          { model: models.Doctor, attributes: ['id', 'fullName'] },
          { model: models.Patient, attributes: ['id', 'fullName'] },
        ],
        order: [['createdAt', 'DESC']],
        offset,
        limit: parseInt(limit),
      });

      // Parse tags for each
      const data = rows.map(r => {
        const row = r.toJSON();
        if (row.tags) {
          row.tags = JSON.parse(row.tags);
        }
        return row;
      });

      res.json({
        success: true,
        data,
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
   * Get review statistics
   */
  static async getStatistics(req, res, next) {
    try {
      const {
        doctorId,
        clinicId,
      } = req.query;

      const where = { status: 'published' };

      if (doctorId) where.doctorId = doctorId;
      if (clinicId) where.clinicId = clinicId;

      // Get counts by rating
      const byRating = await models.Review.findAll({
        where,
        attributes: ['rating', [models.Sequelize.fn('COUNT', models.Sequelize.col('id')), 'count']],
        group: ['rating'],
        raw: true,
      });

      // Get total
      const total = await models.Review.count({ where });

      // Calculate average rating
      const sum = await models.Review.sum('rating', { where });
      const averageRating = total > 0 ? sum / total : 0;

      // Get recent reviews
      const recent = await models.Review.findAll({
        where,
        include: [
          { model: models.Doctor, attributes: ['id', 'fullName'] },
          { model: models.Patient, attributes: ['id', 'fullName'] },
        ],
        order: [['createdAt', 'DESC']],
        limit: 5,
      });

      // Parse tags for recent
      const recentData = recent.map(r => {
        const row = r.toJSON();
        if (row.tags) {
          row.tags = JSON.parse(row.tags);
        }
        return row;
      });

      res.json({
        success: true,
        data: {
          totalReviews: total,
          averageRating: Math.round(averageRating * 10) / 10,
          byRating: byRating.reduce((acc, item) => {
            acc[item.rating] = item.count;
            return acc;
          }, {}),
          recentReviews: recentData,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Approve review (admin only)
   */
  static async approve(req, res, next) {
    try {
      const { id } = req.params;

      const review = await models.Review.findOne({ where: { id } });

      if (!review) {
        throw new AppError('Review not found', 404, 'NOT_FOUND');
      }

      // Only admin can approve
      if (!req.user.roles?.includes('admin')) {
        throw new AppError('Only admin can approve reviews', 403, 'FORBIDDEN');
      }

      // Cannot approve deleted reviews
      if (review.deleted) {
        throw new AppError('Cannot approve a deleted review', 400, 'VALIDATION_ERROR');
      }

      await review.update({
        status: 'published',
        publishedAt: new Date(),
        publishedBy: req.user.id,
      });

      // Load full review data
      const fullReview = await models.Review.findOne({
        where: { id },
        include: [
          { model: models.Doctor, attributes: ['id', 'fullName'] },
          { model: models.Clinic, attributes: ['id', 'name'] },
          { model: models.Patient, attributes: ['id', 'fullName'] },
        ],
      });

      // Parse tags
      const data = fullReview.toJSON();
      if (data.tags) {
        data.tags = JSON.parse(data.tags);
      }

      res.json({
        success: true,
        data,
        message: 'Review approved and published successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Reject review (admin only)
   */
  static async reject(req, res, next) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const review = await models.Review.findOne({ where: { id } });

      if (!review) {
        throw new AppError('Review not found', 404, 'NOT_FOUND');
      }

      // Only admin can reject
      if (!req.user.roles?.includes('admin')) {
        throw new AppError('Only admin can reject reviews', 403, 'FORBIDDEN');
      }

      await review.update({
        status: 'rejected',
        rejectedAt: new Date(),
        rejectedBy: req.user.id,
        rejectionReason: reason,
      });

      // Load full review data
      const fullReview = await models.Review.findOne({
        where: { id },
        include: [
          { model: models.Doctor, attributes: ['id', 'fullName'] },
          { model: models.Clinic, attributes: ['id', 'name'] },
          { model: models.Patient, attributes: ['id', 'fullName'] },
        ],
      });

      // Parse tags
      const data = fullReview.toJSON();
      if (data.tags) {
        data.tags = JSON.parse(data.tags);
      }

      res.json({
        success: true,
        data,
        message: 'Review rejected successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Publish review (admin only)
   */
  static async publish(req, res, next) {
    try {
      const { id } = req.params;

      const review = await models.Review.findOne({ where: { id } });

      if (!review) {
        throw new AppError('Review not found', 404, 'NOT_FOUND');
      }

      // Only admin can publish
      if (!req.user.roles?.includes('admin')) {
        throw new AppError('Only admin can publish reviews', 403, 'FORBIDDEN');
      }

      await review.update({
        status: 'published',
        publishedAt: new Date(),
        publishedBy: req.user.id,
      });

      // Load full review data
      const fullReview = await models.Review.findOne({
        where: { id },
        include: [
          { model: models.Doctor, attributes: ['id', 'fullName'] },
          { model: models.Clinic, attributes: ['id', 'name'] },
          { model: models.Patient, attributes: ['id', 'fullName'] },
        ],
      });

      // Parse tags
      const data = fullReview.toJSON();
      if (data.tags) {
        data.tags = JSON.parse(data.tags);
      }

      res.json({
        success: true,
        data,
        message: 'Review published successfully',
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = ReviewController;
