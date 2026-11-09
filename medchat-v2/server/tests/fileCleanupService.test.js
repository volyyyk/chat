'use strict';

jest.mock('../src/models', () => ({
  File: { findAll: jest.fn() },
}));
jest.mock('../src/config/minio', () => ({
  minioClient: { removeObject: jest.fn() },
  bucketName: 'medchat-test',
}));

const { Op } = require('sequelize');
const models = require('../src/models');
const { minioClient } = require('../src/config/minio');
const FileCleanupService = require('../src/services/fileCleanupService');

describe('FileCleanupService.cleanupExpiredFiles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    minioClient.removeObject.mockResolvedValue();
  });

  test('uses deleteAt and a 3-day fallback only for autoDelete legacy rows', async () => {
    models.File.findAll.mockResolvedValue([]);

    await FileCleanupService.cleanupExpiredFiles();

    const query = models.File.findAll.mock.calls[0][0];
    const alternatives = query.where[Op.or];

    expect(alternatives).toHaveLength(2);
    expect(alternatives[0]).toHaveProperty('deleteAt');
    expect(alternatives[0].deleteAt[Op.lte]).toBeInstanceOf(Date);
    expect(alternatives[1]).toEqual(expect.objectContaining({
      autoDelete: true,
      deleteAt: null,
      createdAt: expect.objectContaining({ [Op.lte]: expect.any(Date) }),
    }));
    expect(alternatives.some((condition) => Object.hasOwn(condition, 'deleteAfterDays'))).toBe(false);
    expect(query.where.deleted).toBe(false);
  });

  test('deletes only rows returned as expired and marks them deleted after MinIO succeeds', async () => {
    const expired = {
      id: 'expired-1',
      filename: 'old.pdf',
      storagePath: 'user-1/old.pdf',
      update: jest.fn().mockResolvedValue(),
    };
    models.File.findAll.mockResolvedValue([expired]);

    const result = await FileCleanupService.cleanupExpiredFiles();

    expect(minioClient.removeObject).toHaveBeenCalledWith('medchat-test', 'user-1/old.pdf');
    expect(expired.update).toHaveBeenCalledWith(expect.objectContaining({
      deleted: true,
      deletionReason: 'Auto-delete after 3 days',
      deletedAt: expect.any(Date),
    }));
    expect(result).toEqual(expect.objectContaining({ success: true, deletedCount: 1, errors: [] }));
  });

  test('does not mark a row deleted if MinIO removal fails', async () => {
    const expired = {
      id: 'expired-2',
      filename: 'unavailable.pdf',
      storagePath: 'user-1/unavailable.pdf',
      update: jest.fn(),
    };
    minioClient.removeObject.mockRejectedValue(new Error('storage unavailable'));
    models.File.findAll.mockResolvedValue([expired]);

    const result = await FileCleanupService.cleanupExpiredFiles();

    expect(expired.update).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ success: true, deletedCount: 0 }));
    expect(result.errors).toHaveLength(1);
  });
});
