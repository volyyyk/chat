/**
 * Review Model
 * Represents a review left by a patient for a doctor or clinic
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Review = sequelize.define('Review', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    doctorId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'Doctors', key: 'id' },
      onDelete: 'CASCADE',
    },
    clinicId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'Clinics', key: 'id' },
      onDelete: 'CASCADE',
    },
    patientId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'Patients', key: 'id' },
      onDelete: 'CASCADE',
    },
    rating: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1,
        max: 5,
      },
    },
    title: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
    comment: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    anonymous: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    tags: {
      type: DataTypes.TEXT,
      allowNull: true,
      get() {
        const rawValue = this.getDataValue('tags');
        return rawValue ? JSON.parse(rawValue) : [];
      },
      set(value) {
        this.setDataValue('tags', JSON.stringify(value));
      },
    },
    response: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    respondedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    respondedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'Users', key: 'id' },
    },
    likes: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    dislikes: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    status: {
      type: DataTypes.ENUM('pending', 'approved', 'rejected', 'published', 'hidden'),
      defaultValue: 'pending',
    },
    publishedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    publishedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'Users', key: 'id' },
    },
    rejectedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    rejectedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'Users', key: 'id' },
    },
    rejectionReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    deleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    deletedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'Users', key: 'id' },
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'Users', key: 'id' },
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      allowNull: false,
    },
  }, {
    tableName: 'Reviews',
    timestamps: true,
    paranoid: true,
    indexes: [
      { fields: ['doctorId'] },
      { fields: ['clinicId'] },
      { fields: ['patientId'] },
      { fields: ['rating'] },
      { fields: ['status'] },
      { fields: ['createdAt'] },
      { fields: ['deleted'] },
    ],
  });

  Review.associate = (models) => {
    Review.belongsTo(models.Doctor, { foreignKey: 'doctorId', as: 'doctor' });
    Review.belongsTo(models.Clinic, { foreignKey: 'clinicId', as: 'clinic' });
    Review.belongsTo(models.Patient, { foreignKey: 'patientId', as: 'patient' });
    Review.belongsTo(models.User, { foreignKey: 'createdBy', as: 'creator' });
    Review.belongsTo(models.User, { foreignKey: 'publishedBy', as: 'publisher' });
    Review.belongsTo(models.User, { foreignKey: 'respondedBy', as: 'responder' });
    Review.hasMany(models.ReviewLike, { foreignKey: 'reviewId', as: 'likes' });
  };

  return Review;
};
