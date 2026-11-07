/**
 * File Download Log Model
 * Tracks who downloaded which file and when
 */

module.exports = (sequelize, DataTypes) => {
  const FileDownload = sequelize.define('FileDownload', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    fileId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    ipAddress: {
      type: DataTypes.STRING(45),
      allowNull: true,
    },
    userAgent: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  }, {
    tableName: 'file_downloads',
    indexes: [
      { fields: ['file_id'] },
      { fields: ['user_id'] },
    ],
  });

  FileDownload.associate = (models) => {
    FileDownload.belongsTo(models.File, {
      foreignKey: 'fileId',
      as: 'file',
      onDelete: 'CASCADE',
    });

    FileDownload.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user',
      onDelete: 'CASCADE',
    });
  };

  return FileDownload;
};
