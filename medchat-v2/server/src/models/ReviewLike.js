/**
 * ReviewLike Model
 * Represents a like or dislike on a review
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ReviewLike = sequelize.define('ReviewLike', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    reviewId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'Reviews', key: 'id' },
      onDelete: 'CASCADE',
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
    },
    type: {
      type: DataTypes.ENUM('like', 'dislike'),
      allowNull: false,
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
    tableName: 'ReviewLikes',
    timestamps: true,
    indexes: [
      { fields: ['review_id'] },
      { fields: ['user_id'] },
      { fields: ['type'] },
      { fields: ['review_id', 'user_id'], unique: true },
    ],
  });

  ReviewLike.associate = (models) => {
    ReviewLike.belongsTo(models.Review, { foreignKey: 'reviewId', as: 'review' });
    ReviewLike.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
  };

  return ReviewLike;
};
