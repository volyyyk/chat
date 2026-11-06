/**
 * Backup Routes
 */

const express = require('express');
const router = express.Router();
const BackupController = require('../controllers/backupController');
const { validate } = require('../middleware/validation');
const { authenticate, authorize, isDoctor } = require('../middleware/auth');
const {
  createBackupSchema,
  restoreBackupSchema,
  listBackupSchema,
  deleteBackupSchema,
  exportBackupSchema,
  importBackupSchema,
} = require('../validators/backup');

// All routes require authentication
router.use(authenticate());

/**
 * @swagger
 * /api/backups:
 *   post:
 *     summary: Create cloud backup
 *     tags: [Backups]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateBackupRequest'
 *     responses:
 *       201:
 *         description: Backup created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Backup'
 */
router.post('/', validate(createBackupSchema), BackupController.create);

/**
 * @swagger
 * /api/backups:
 *   get:
 *     summary: List backups
 *     tags: [Backups]
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
 *         name: type
 *         schema:
 *           type: string
 *           enum: [manual, auto, export]
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, completed, failed, restoring]
 *     responses:
 *       200:
 *         description: List of backups
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Backup'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 */
router.get('/', validate(listBackupSchema, 'query'), BackupController.list);

/**
 * @swagger
 * /api/backups/{id}:
 *   get:
 *     summary: Get backup details
 *     tags: [Backups]
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
 *         description: Backup details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Backup'
 */
router.get('/:id', BackupController.getById);

/**
 * @swagger
 * /api/backups/{id}/download:
 *   get:
 *     summary: Download backup file
 *     tags: [Backups]
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
 *         description: Backup file
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 */
router.get('/:id/download', BackupController.download);

/**
 * @swagger
 * /api/backups/{id}/restore:
 *   post:
 *     summary: Restore from backup
 *     tags: [Backups]
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
 *             $ref: '#/components/schemas/RestoreBackupRequest'
 *     responses:
 *       200:
 *         description: Restore initiated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 restoreId:
 *                   type: string
 */
router.post('/:id/restore', validate(restoreBackupSchema), BackupController.restore);

/**
 * @swagger
 * /api/backups/{id}:
 *   delete:
 *     summary: Delete backup
 *     tags: [Backups]
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
 *             $ref: '#/components/schemas/DeleteBackupRequest'
 *     responses:
 *       200:
 *         description: Backup deleted successfully
 */
router.delete('/:id', validate(deleteBackupSchema), BackupController.delete);

/**
 * @swagger
 * /api/backups/export:
 *   post:
 *     summary: Export data to local backup
 *     tags: [Backups]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ExportBackupRequest'
 *     responses:
 *       201:
 *         description: Export successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 backup:
 *                   $ref: '#/components/schemas/Backup'
 *                 downloadUrl:
 *                   type: string
 */
router.post('/export', validate(exportBackupSchema), BackupController.export);

/**
 * @swagger
 * /api/backups/import:
 *   post:
 *     summary: Import data from backup
 *     tags: [Backups]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               password:
 *                 type: string
 *               importOptions:
 *                 type: object
 *     responses:
 *       201:
 *         description: Import successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 imported:
 *                   type: object
 *                 backup:
 *                   $ref: '#/components/schemas/Backup'
 */
router.post('/import', validate(importBackupSchema), BackupController.import);

/**
 * @swagger
 * /api/backups/settings:
 *   get:
 *     summary: Get backup settings
 *     tags: [Backups]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Backup settings
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 autoBackup:
 *                   type: boolean
 *                 backupInterval:
 *                   type: string
 *                 dataTypes:
 *                   type: array
 *                   items:
 *                     type: string
 *                 maxBackups:
 *                   type: number
 */
router.get('/settings', BackupController.getSettings);

/**
 * @swagger
 * /api/backups/settings:
 *   put:
 *     summary: Update backup settings
 *     tags: [Backups]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               autoBackup:
 *                 type: boolean
 *               backupInterval:
 *                 type: string
 *                 enum: [daily, weekly, monthly]
 *               dataTypes:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [chats, files, contacts, settings, all]
 *               maxBackups:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 50
 *     responses:
 *       200:
 *         description: Settings updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
router.put('/settings', BackupController.updateSettings);

/**
 * @swagger
 * /api/backups/auto:
 *   post:
 *     summary: Create automatic backup (system use)
 *     tags: [Backups]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Auto backup created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Backup'
 */
router.post('/auto', BackupController.createAutoBackup);

/**
 * @swagger
 * /api/backups/cleanup:
 *   post:
 *     summary: Cleanup old backups
 *     tags: [Backups]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               olderThanDays:
 *                 type: number
 *                 default: 30
 *     responses:
 *       200:
 *         description: Cleanup completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 deletedCount:
 *                   type: number
 *                 freedSpace:
 *                   type: number
 */
router.post('/cleanup', BackupController.cleanup);

/**
 * @swagger
 * /api/backups/verify-password:
 *   post:
 *     summary: Verify backup password
 *     tags: [Backups]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               backupId:
 *                 type: string
 *                 format: uuid
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password verification result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 valid:
 *                   type: boolean
 */
router.post('/verify-password', BackupController.verifyPassword);

module.exports = router;
