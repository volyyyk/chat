/**
 * Backup Routes
 *
 * Specific paths (/settings, /export, /import, /auto, /cleanup,
 * /verify-password) are registered BEFORE /:id.
 */

const express = require('express');
const router = express.Router();
const BackupController = require('../controllers/backupController');
const { validate } = require('../middleware/validation');
const { authenticate } = require('../middleware/auth');
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

// Specific paths first
router.post('/export', validate(exportBackupSchema), BackupController.export);
router.post('/import', validate(importBackupSchema), BackupController.import);
router.post('/auto', BackupController.createAutoBackup);
router.post('/cleanup', BackupController.cleanup);
router.post('/verify-password', BackupController.verifyPassword);
router.get('/settings', BackupController.getSettings);
router.put('/settings', BackupController.updateSettings);

// CRUD
router.post('/', validate(createBackupSchema), BackupController.create);
router.get('/', validate(listBackupSchema, 'query'), BackupController.list);
router.get('/:id', BackupController.getById);
router.get('/:id/download', BackupController.download);
router.post('/:id/restore', validate(restoreBackupSchema), BackupController.restore);
router.delete('/:id', validate(deleteBackupSchema), BackupController.delete);

module.exports = router;
