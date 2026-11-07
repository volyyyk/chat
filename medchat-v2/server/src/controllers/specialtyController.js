/**
 * Specialty Controller
 * Handles specialty management and lookups
 */

const models = require('../models');
const { AppError } = require('../middleware/errorHandler');
const { Op } = require('sequelize');

class SpecialtyController {
  /**
   * List all specialties
   */
  static async list(req, res, next) {
    try {
      const {
        page = 1,
        limit = 100,
        search,
        category,
      } = req.query;

      const where = {};

      if (search) {
        where[Op.or] = [
          { name: { [Op.iLike]: `%${search}%` } },
          { description: { [Op.iLike]: `%${search}%` } },
        ];
      }

      if (category) {
        where.category = category;
      }

      const offset = (page - 1) * limit;

      const { count, rows } = await models.Specialty.findAndCountAll({
        where,
        order: [['name', 'ASC']],
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
   * Get specialty by ID
   */
  static async getById(req, res, next) {
    try {
      const { id } = req.params;

      const specialty = await models.Specialty.findOne({
        where: { id },
        include: [
          { model: models.Doctor, attributes: ['id', 'fullName'] },
          { model: models.Clinic, attributes: ['id', 'name'] },
        ],
      });

      if (!specialty) {
        throw new AppError('Specialty not found', 404, 'NOT_FOUND');
      }

      res.json({
        success: true,
        data: specialty,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get specialty by name
   */
  static async getByName(req, res, next) {
    try {
      const { name } = req.params;

      const specialty = await models.Specialty.findOne({
        where: { name: { [Op.iLike]: name } },
        include: [
          { model: models.Doctor, attributes: ['id', 'fullName'] },
          { model: models.Clinic, attributes: ['id', 'name'] },
        ],
      });

      if (!specialty) {
        throw new AppError('Specialty not found', 404, 'NOT_FOUND');
      }

      res.json({
        success: true,
        data: specialty,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create specialty (admin only)
   */
  static async create(req, res, next) {
    try {
      const {
        name,
        description,
        category,
        code,
        isActive = true,
      } = req.body;

      // Validate required fields
      if (!name) {
        throw new AppError('Name is required', 400, 'VALIDATION_ERROR');
      }

      // Check if specialty already exists
      const existingSpecialty = await models.Specialty.findOne({
        where: { name: { [Op.iLike]: name } },
      });

      if (existingSpecialty) {
        throw new AppError('Specialty with this name already exists', 400, 'VALIDATION_ERROR');
      }

      const specialty = await models.Specialty.create({
        name,
        description,
        category,
        code,
        isActive,
        createdBy: req.user.id,
      });

      res.status(201).json({
        success: true,
        data: specialty,
        message: 'Specialty created successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update specialty (admin only)
   */
  static async update(req, res, next) {
    try {
      const { id } = req.params;
      const {
        name,
        description,
        category,
        code,
        isActive,
      } = req.body;

      const specialty = await models.Specialty.findOne({ where: { id } });

      if (!specialty) {
        throw new AppError('Specialty not found', 404, 'NOT_FOUND');
      }

      // Check if name is already taken by another specialty
      if (name && name !== specialty.name) {
        const existingSpecialty = await models.Specialty.findOne({
          where: { name: { [Op.iLike]: name }, id: { [Op.ne]: id } },
        });

        if (existingSpecialty) {
          throw new AppError('Specialty with this name already exists', 400, 'VALIDATION_ERROR');
        }
      }

      await specialty.update({
        name: name || specialty.name,
        description: description !== undefined ? description : specialty.description,
        category: category || specialty.category,
        code: code || specialty.code,
        isActive: isActive !== undefined ? isActive : specialty.isActive,
      });

      res.json({
        success: true,
        data: specialty,
        message: 'Specialty updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete specialty (admin only)
   */
  static async delete(req, res, next) {
    try {
      const { id } = req.params;

      const specialty = await models.Specialty.findOne({ where: { id } });

      if (!specialty) {
        throw new AppError('Specialty not found', 404, 'NOT_FOUND');
      }

      // Check if specialty is used by any doctors
      const doctorCount = await models.DoctorSpecialty.count({
        where: { specialtyId: id },
      });

      if (doctorCount > 0) {
        throw new AppError('Cannot delete specialty that is assigned to doctors', 400, 'VALIDATION_ERROR');
      }

      // Check if specialty is used by any clinics
      const clinicCount = await models.ClinicSpecialty.count({
        where: { specialtyId: id },
      });

      if (clinicCount > 0) {
        throw new AppError('Cannot delete specialty that is assigned to clinics', 400, 'VALIDATION_ERROR');
      }

      await specialty.destroy();

      res.json({
        success: true,
        message: 'Specialty deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get specialty categories
   */
  static async getCategories(req, res, next) {
    try {
      const specialties = await models.Specialty.findAll({
        attributes: ['category'],
        group: ['category'],
        raw: true,
      });

      const categories = specialties.map(s => s.category).filter(c => c);

      res.json({
        success: true,
        data: categories,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get popular specialties
   */
  static async getPopular(req, res, next) {
    try {
      const { limit = 10 } = req.query;

      // Get specialties with most doctors
      const popularSpecialties = await models.Specialty.findAll({
        include: [{
          model: models.Doctor,
          attributes: [],
          through: { attributes: [] },
        }],
        order: [[models.Sequelize.literal('COUNT("Doctors->DoctorSpecialty"."specialty_id")'), 'DESC']],
        limit: parseInt(limit),
        group: ['Specialty.id'],
      });

      res.json({
        success: true,
        data: popularSpecialties,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get specialties by clinic
   */
  static async getByClinic(req, res, next) {
    try {
      const { clinicId } = req.params;

      const clinic = await models.Clinic.findOne({
        where: { id: clinicId },
        include: [{
          model: models.Specialty,
          through: { attributes: [] },
        }],
      });

      if (!clinic) {
        throw new AppError('Clinic not found', 404, 'NOT_FOUND');
      }

      res.json({
        success: true,
        data: clinic.Specialties || [],
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get specialties by doctor
   */
  static async getByDoctor(req, res, next) {
    try {
      const { doctorId } = req.params;

      const doctor = await models.Doctor.findOne({
        where: { id: doctorId },
        include: [{
          model: models.Specialty,
          through: { attributes: [] },
        }],
      });

      if (!doctor) {
        throw new AppError('Doctor not found', 404, 'NOT_FOUND');
      }

      res.json({
        success: true,
        data: doctor.Specialties || [],
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = SpecialtyController;
