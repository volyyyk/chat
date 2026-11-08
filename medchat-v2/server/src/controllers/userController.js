/**
 * User Controller
 * Handles user management, profiles, and preferences
 */

const models = require('../models');
const { AppError } = require('../middleware/errorHandler');
const AuthService = require('../services/authService');
const CryptoService = require('../services/cryptoService');
const { minioClient, bucketName } = require('../config/minio');
const fs = require('fs');
const path = require('path');

class UserController {
  /**
   * Check if username is available
   */
  static async checkUsername(req, res, next) {
    try {
      const { username } = req.body;

      if (!username) {
        throw new AppError('Username is required', 400, 'VALIDATION_ERROR');
      }

      const user = await models.User.findOne({ where: { username } });

      res.json({
        success: true,
        data: { available: !user },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Check if email is available
   */
  static async checkEmail(req, res, next) {
    try {
      const { email } = req.body;

      if (!email) {
        throw new AppError('Email is required', 400, 'VALIDATION_ERROR');
      }

      const user = await models.User.findOne({ where: { email } });

      res.json({
        success: true,
        data: { available: !user },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get current user profile
   */
  static async getMe(req, res, next) {
    try {
      const userId = req.user.id;

      const user = await models.User.findOne({
        where: { id: userId },
        include: [
          { model: models.Doctor, as: 'doctorProfile', attributes: { exclude: ['userId'] } },
          { model: models.Patient, as: 'patientProfile', attributes: { exclude: ['userId'] } },
          { model: models.Clinic, as: 'clinic', attributes: ['id', 'name', 'code'] },
        ],
      });

      if (!user) {
        throw new AppError('User not found', 404, 'NOT_FOUND');
      }

      // Remove sensitive data
      const userData = user.toJSON();
      delete userData.password;
      delete userData.passwordHash;
      delete userData.refreshToken;

      res.json({
        success: true,
        data: userData,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update current user profile
   */
  static async updateMe(req, res, next) {
    try {
      const userId = req.user.id;
      const {
        username,
        email,
        firstName,
        lastName,
        phone,
        timezone,
        language,
        currentPassword,
      } = req.body;

      const user = await models.User.findOne({ where: { id: userId } });

      if (!user) {
        throw new AppError('User not found', 404, 'NOT_FOUND');
      }

      // SECURITY: changing identity fields (email/username) requires proving
      // ownership of the account with the current password. Without this an
      // attacker with a stolen access token could silently take over the
      // login credentials.
      const wantsEmailChange = email && email !== user.email;
      const wantsUsernameChange = username && username !== user.username;
      if (wantsEmailChange || wantsUsernameChange) {
        if (!currentPassword) {
          throw new AppError(
            'Current password is required to change email or username',
            403,
            'FORBIDDEN'
          );
        }
        const passwordValid = await AuthService.verifyPassword(currentPassword, user.passwordHash);
        if (!passwordValid) {
          throw new AppError('Current password is incorrect', 401, 'UNAUTHORIZED');
        }
      }

      // Check if username is already taken
      if (wantsUsernameChange) {
        const existingUser = await models.User.findOne({ where: { username } });
        if (existingUser) {
          throw new AppError('Username already taken', 400, 'VALIDATION_ERROR');
        }
      }

      // Check if email is already taken
      if (wantsEmailChange) {
        const existingUser = await models.User.findOne({ where: { email } });
        if (existingUser) {
          throw new AppError('Email already taken', 400, 'VALIDATION_ERROR');
        }
      }

      await user.update({
        username: username !== undefined ? username : user.username,
        email: email !== undefined ? email : user.email,
        firstName: firstName !== undefined ? firstName : user.firstName,
        lastName: lastName !== undefined ? lastName : user.lastName,
        phone: phone !== undefined ? phone : user.phone,
        timezone: timezone || user.timezone,
        language: language || user.language,
      });

      // Remove sensitive data
      const userData = user.toJSON();
      delete userData.password;
      delete userData.passwordHash;
      delete userData.refreshToken;

      res.json({
        success: true,
        data: userData,
        message: 'Profile updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Change password
   */
  static async changePassword(req, res, next) {
    try {
      const userId = req.user.id;
      const { currentPassword, newPassword, confirmPassword } = req.body;

      if (!currentPassword || !newPassword || !confirmPassword) {
        throw new AppError('All password fields are required', 400, 'VALIDATION_ERROR');
      }

      if (newPassword !== confirmPassword) {
        throw new AppError('New passwords do not match', 400, 'VALIDATION_ERROR');
      }

      if (newPassword.length < 8) {
        throw new AppError('Password must be at least 8 characters long', 400, 'VALIDATION_ERROR');
      }

      const user = await models.User.findOne({ where: { id: userId } });

      if (!user) {
        throw new AppError('User not found', 404, 'NOT_FOUND');
      }

      // Verify current password
      const isValid = await AuthService.verifyPassword(currentPassword, user.passwordHash);

      if (!isValid) {
        throw new AppError('Current password is incorrect', 401, 'UNAUTHORIZED');
      }

      // Hash new password
      const passwordHash = await AuthService.hashPassword(newPassword);

      await user.update({ passwordHash });

      // Invalidate all sessions
      await models.Session.destroy({ where: { userId } });
      await models.RefreshToken.destroy({ where: { userId } });

      res.json({
        success: true,
        message: 'Password changed successfully. Please login again.',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update user profile (doctor/patient specific)
   */
  static async updateProfile(req, res, next) {
    try {
      const userId = req.user.id;
      const {
        // Common fields
        fullName,
        dateOfBirth,
        gender,
        phone,
        address,
        city,
        region,
        postalCode,
        country,
        // Doctor specific
        specialtyIds,
        licenseNumber,
        qualification,
        experienceYears,
        consultationPrice,
        availableSlots,
        // Patient specific
        bloodType,
        allergies,
        chronicDiseases,
        insuranceNumber,
        emergencyContact,
      } = req.body;

      const user = await models.User.findOne({
        where: { id: userId },
        include: [
          { model: models.Doctor, as: 'doctorProfile' },
          { model: models.Patient, as: 'patientProfile' },
        ],
      });

      if (!user) {
        throw new AppError('User not found', 404, 'NOT_FOUND');
      }

      // Update common user fields
      if (fullName) {
        const [firstName, ...lastNameParts] = fullName.split(' ');
        await user.update({
          firstName,
          lastName: lastNameParts.join(' '),
        });
      }

      const doctorProfile = user.doctorProfile;
      const patientProfile = user.patientProfile;

      // Update doctor profile
      if (doctorProfile) {
        const doctorUpdate = {};

        if (dateOfBirth) doctorUpdate.dateOfBirth = dateOfBirth;
        if (gender) doctorUpdate.gender = gender;
        if (phone) doctorUpdate.phone = phone;
        if (address) doctorUpdate.address = address;
        if (city) doctorUpdate.city = city;
        if (region) doctorUpdate.region = region;
        if (postalCode) doctorUpdate.postalCode = postalCode;
        if (country) doctorUpdate.country = country;
        if (licenseNumber) doctorUpdate.licenseNumber = licenseNumber;
        if (qualification) doctorUpdate.qualification = qualification;
        if (experienceYears) doctorUpdate.experienceYears = experienceYears;
        if (consultationPrice) doctorUpdate.consultationPrice = consultationPrice;
        if (availableSlots) doctorUpdate.availableSlots = availableSlots;

        if (Object.keys(doctorUpdate).length > 0) {
          await doctorProfile.update(doctorUpdate);
        }

        // Update specialties
        if (specialtyIds) {
          await models.DoctorSpecialty.destroy({ where: { doctorId: doctorProfile.id } });
          for (const specialtyId of specialtyIds) {
            await models.DoctorSpecialty.create({
              doctorId: doctorProfile.id,
              specialtyId,
            });
          }
        }
      }

      // Update patient profile
      if (patientProfile) {
        const patientUpdate = {};

        if (dateOfBirth) patientUpdate.dateOfBirth = dateOfBirth;
        if (gender) patientUpdate.gender = gender;
        if (phone) patientUpdate.phone = phone;
        if (address) patientUpdate.address = address;
        if (city) patientUpdate.city = city;
        if (region) patientUpdate.region = region;
        if (postalCode) patientUpdate.postalCode = postalCode;
        if (country) patientUpdate.country = country;
        if (bloodType) patientUpdate.bloodType = bloodType;
        if (allergies) patientUpdate.allergies = allergies;
        if (chronicDiseases) patientUpdate.chronicDiseases = chronicDiseases;
        if (insuranceNumber) patientUpdate.insuranceNumber = insuranceNumber;
        if (emergencyContact) patientUpdate.emergencyContact = emergencyContact;

        if (Object.keys(patientUpdate).length > 0) {
          await patientProfile.update(patientUpdate);
        }
      }

      // Reload user with updated data
      const updatedUser = await models.User.findOne({
        where: { id: userId },
        include: [
          { model: models.Doctor, as: 'doctorProfile', include: [{ model: models.Specialty, as: 'specialtyDetails' }] },
          { model: models.Patient, as: 'patientProfile' },
        ],
      });

      // Remove sensitive data
      const userData = updatedUser.toJSON();
      delete userData.password;
      delete userData.passwordHash;
      delete userData.refreshToken;

      res.json({
        success: true,
        data: userData,
        message: 'Profile updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get user preferences
   */
  static async getPreferences(req, res, next) {
    try {
      const userId = req.user.id;

      const user = await models.User.findOne({
        where: { id: userId },
        attributes: ['id', 'preferences'],
      });

      const defaultPreferences = {
        notifications: {
          email: true,
          push: true,
          sms: false,
        },
        messageNotifications: true,
        appointmentReminders: true,
        paymentNotifications: true,
        theme: 'light',
        fontSize: 'medium',
        language: 'ru',
        timezone: 'Europe/Moscow',
        convenientTime: {
          start: '09:00',
          end: '18:00',
          days: [1, 2, 3, 4, 5], // Monday to Friday
        },
        autoDownloadFiles: false,
        showFilePreviews: true,
        enableEncryption: true,
      };

      const preferences = user?.preferences || defaultPreferences;

      res.json({
        success: true,
        data: {
          ...defaultPreferences,
          ...preferences,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update user preferences
   */
  static async updatePreferences(req, res, next) {
    try {
      const userId = req.user.id;
      const preferences = req.body;

      const user = await models.User.findOne({ where: { id: userId } });

      if (!user) {
        throw new AppError('User not found', 404, 'NOT_FOUND');
      }

      await user.update({ preferences });

      res.json({
        success: true,
        data: user.preferences,
        message: 'Preferences updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Upload user avatar
   */
  static async uploadAvatar(req, res, next) {
    try {
      const userId = req.user.id;

      // multer's single-file middleware sets req.file; array middleware
      // sets req.files. Accept either so the route works with both.
      const file = req.file || (req.files && req.files[0]);

      if (!file) {
        throw new AppError('No avatar file provided', 400, 'VALIDATION_ERROR');
      }

      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(file.mimetype)) {
        throw new AppError('Only JPEG, PNG, and WebP images are allowed', 400, 'VALIDATION_ERROR');
      }

      // Validate file size (max 5MB)
      const maxSize = 5 * 1024 * 1024;
      if (file.size > maxSize) {
        throw new AppError('Avatar size exceeds maximum limit of 5MB', 400, 'VALIDATION_ERROR');
      }

      // Generate unique filename
      const ext = path.extname(file.originalname).toLowerCase();
      const filename = `avatars/${userId}_${Date.now()}${ext}`;

      // Upload to MinIO
      const uploadParams = {
        Bucket: bucketName,
        Key: filename,
        Body: fs.createReadStream(file.path),
        ContentType: file.mimetype,
        ContentLength: file.size,
      };

      await new Promise((resolve, reject) => {
        minioClient.putObject(uploadParams, (err, etag) => {
          if (err) reject(err);
          else resolve(etag);
        });
      });

      // Get file URL
      const avatarUrl = `${process.env.MINIO_PUBLIC_URL || `http://${process.env.MINIO_HOST}:${process.env.MINIO_PORT}`}/${bucketName}/${filename}`;

      // Update user
      const user = await models.User.findOne({ where: { id: userId } });
      await user.update({ avatar: avatarUrl });

      // Remove the temp file uploaded by multer
      try {
        fs.unlinkSync(file.path);
      } catch (e) {
        // non-fatal
      }

      res.json({
        success: true,
        data: { avatarUrl },
        message: 'Avatar uploaded successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete user avatar
   */
  static async deleteAvatar(req, res, next) {
    try {
      const userId = req.user.id;

      const user = await models.User.findOne({ where: { id: userId } });

      if (!user) {
        throw new AppError('User not found', 404, 'NOT_FOUND');
      }

      // Delete old avatar from MinIO if it exists
      if (user.avatar) {
        try {
          const filename = user.avatar.split('/').pop();
          await minioClient.removeObject(bucketName, `avatars/${filename}`);
        } catch (err) {
          console.error('Error deleting avatar from MinIO:', err);
        }
      }

      await user.update({ avatar: null });

      res.json({
        success: true,
        message: 'Avatar deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * List users (admin only)
   */
  static async list(req, res, next) {
    try {
      const {
        role,
        clinicId,
        status,
        search,
        page = 1,
        limit = 20,
      } = req.query;

      const where = {};

      if (role) where.role = role;
      if (clinicId) where.clinicId = clinicId;
      if (status) where.status = status;

      if (search) {
        where[models.Sequelize.Op.or] = [
          { username: { [models.Sequelize.Op.iLike]: `%${search}%` } },
          { email: { [models.Sequelize.Op.iLike]: `%${search}%` } },
          { firstName: { [models.Sequelize.Op.iLike]: `%${search}%` } },
          { lastName: { [models.Sequelize.Op.iLike]: `%${search}%` } },
        ];
      }

      const offset = (page - 1) * limit;

      const { count, rows } = await models.User.findAndCountAll({
        where,
        include: [
          { model: models.Doctor, as: 'doctorProfile', attributes: ['id', 'isOnline', 'averageRating', 'experienceYears', 'consultationPrice'] },
          { model: models.Patient, as: 'patientProfile', attributes: ['id'] },
          { model: models.Clinic, as: 'clinic', attributes: ['id', 'name'] },
        ],
        order: [['createdAt', 'DESC']],
        offset,
        limit: parseInt(limit),
        attributes: { exclude: ['passwordHash', 'refreshToken'] },
      });

      // Remove sensitive data
      const users = rows.map(user => {
        const userData = user.toJSON();
        delete userData.passwordHash;
        delete userData.refreshToken;
        return userData;
      });

      res.json({
        success: true,
        data: users,
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
   * Get user by ID (admin only)
   */
  static async getById(req, res, next) {
    try {
      const { id } = req.params;

      const user = await models.User.findOne({
        where: { id },
        include: [
          { model: models.Doctor, as: 'doctorProfile', include: [{ model: models.Specialty, as: 'specialtyDetails' }] },
          { model: models.Patient, as: 'patientProfile' },
          { model: models.Clinic, as: 'clinic', attributes: ['id', 'name', 'code'] },
        ],
        attributes: { exclude: ['passwordHash', 'refreshToken'] },
      });

      if (!user) {
        throw new AppError('User not found', 404, 'NOT_FOUND');
      }

      // Remove sensitive data
      const userData = user.toJSON();
      delete userData.passwordHash;
      delete userData.refreshToken;

      res.json({
        success: true,
        data: userData,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update user (admin only)
   */
  static async update(req, res, next) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      // Remove fields that shouldn't be updated this way
      delete updateData.password;
      delete updateData.passwordHash;
      delete updateData.role;
      delete updateData.status;
      delete updateData.currentPassword;

      const user = await models.User.findOne({ where: { id } });

      if (!user) {
        throw new AppError('User not found', 404, 'NOT_FOUND');
      }

      await user.update(updateData);

      // Remove sensitive data
      const userData = user.toJSON();
      delete userData.passwordHash;
      delete userData.refreshToken;

      res.json({
        success: true,
        data: userData,
        message: 'User updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete user (admin only)
   */
  static async delete(req, res, next) {
    try {
      const { id } = req.params;

      const user = await models.User.findOne({ where: { id } });

      if (!user) {
        throw new AppError('User not found', 404, 'NOT_FOUND');
      }

      // Soft delete
      await user.update({
        deleted: true,
        deletedAt: new Date(),
        status: 'deleted',
      });

      // Invalidate sessions
      await models.Session.destroy({ where: { userId: id } });
      await models.RefreshToken.destroy({ where: { userId: id } });

      res.json({
        success: true,
        message: 'User deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update user status (admin only)
   */
  static async updateStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status, reason } = req.body;

      // Must match the User.status ENUM ('banned', not 'blocked')
      const validStatuses = ['active', 'inactive', 'pending', 'banned', 'deleted'];

      if (!validStatuses.includes(status)) {
        throw new AppError('Invalid status', 400, 'VALIDATION_ERROR');
      }

      const user = await models.User.findOne({ where: { id } });

      if (!user) {
        throw new AppError('User not found', 404, 'NOT_FOUND');
      }

      await user.update({
        status,
        statusReason: reason,
        statusChangedAt: new Date(),
        statusChangedBy: req.user.id,
      });

      // Invalidate sessions if blocking or deleting
      if (status === 'banned' || status === 'deleted') {
        await models.Session.destroy({ where: { userId: id } });
        await models.RefreshToken.destroy({ where: { userId: id } });
      }

      // Remove sensitive data
      const userData = user.toJSON();
      delete userData.passwordHash;
      delete userData.refreshToken;

      res.json({
        success: true,
        data: userData,
        message: 'User status updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update user role (admin only)
   */
  static async updateRole(req, res, next) {
    try {
      const { id } = req.params;
      const { role } = req.body;

      // Must match the User.role ENUM ('system_admin', not 'admin')
      const validRoles = ['system_admin', 'clinic_admin', 'doctor', 'patient'];

      if (!validRoles.includes(role)) {
        throw new AppError('Invalid role', 400, 'VALIDATION_ERROR');
      }

      const user = await models.User.findOne({ where: { id } });

      if (!user) {
        throw new AppError('User not found', 404, 'NOT_FOUND');
      }

      await user.update({ role });

      // Remove sensitive data
      const userData = user.toJSON();
      delete userData.passwordHash;
      delete userData.refreshToken;

      res.json({
        success: true,
        data: userData,
        message: 'User role updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get user statistics (admin only)
   */
  static async getStatistics(req, res, next) {
    try {
      const { clinicId, role } = req.query;

      const where = {};

      if (clinicId) where.clinicId = clinicId;

      // Get counts by role
      const byRole = await models.User.findAll({
        where,
        attributes: ['role', [models.Sequelize.fn('COUNT', models.Sequelize.col('id')), 'count']],
        group: ['role'],
        raw: true,
      });

      // Get counts by status
      const byStatus = await models.User.findAll({
        where,
        attributes: ['status', [models.Sequelize.fn('COUNT', models.Sequelize.col('id')), 'count']],
        group: ['status'],
        raw: true,
      });

      // Get total
      const total = await models.User.count({ where });

      // Get active users
      const active = await models.User.count({
        where: {
          ...where,
          status: 'active',
        },
      });

      res.json({
        success: true,
        data: {
          total,
          active,
          byRole: byRole.reduce((acc, item) => {
            acc[item.role] = item.count;
            return acc;
          }, {}),
          byStatus: byStatus.reduce((acc, item) => {
            acc[item.status] = item.count;
            return acc;
          }, {}),
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = UserController;
