/**
 * File Routes
 */

const express = require('express');
const router = express.Router();
const FileController = require('../controllers/fileController');
const { validate } = require('../middleware/validation');
const { authenticate, authorize, isDoctor } = require('../middleware/auth');
const {
  uploadFileSchema,
  listFileSchema,
  updateFileSchema,
  fileMetadataSchema,
} = require('../validators/file');
// NOTE: middleware/upload.js exports an ALREADY-CONFIGURED multer middleware for field 'file'
// (const single = upload.single('file')). Pass it as a reference; calling it as a function
// crashed the server at require time: multerMiddleware got 'file' as req ->
// TypeError: Cannot read properties of undefined (reading 'transfer-encoding') in type-is.
const { single: uploadSingle } = require('../middleware/upload');

// All routes require authentication
router.use(authenticate());

/**
 * @swagger
 * /api/files/upload:
 *   post:
 *     summary: Upload file
 *     tags: [Files]
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
 *               chatId:
 *                 type: string
 *                 format: uuid
 *               messageId:
 *                 type: string
 *                 format: uuid
 *               type:
 *                 type: string
 *                 enum: [doctor_upload, patient_upload]
 *               category:
 *                 type: string
 *                 enum: [medical_record, analysis, prescription, referral, certificate, photo, video, audio, document, other]
 *               description:
 *                 type: string
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *               visibility:
 *                 type: string
 *                 enum: [private, doctor_only, patient_only, shared, public]
 *               autoDelete:
 *                 type: boolean
 *               deleteAfterDays:
 *                 type: number
 *     responses:
 *       201:
 *         description: File uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/File'
 */
router.post('/upload', uploadSingle, validate(uploadFileSchema), FileController.upload);

/**
 * @swagger
 * /api/files:
 *   get:
 *     summary: List files
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: chatId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: messageId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: uploaderId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: ownerType
 *         schema:
 *           type: string
 *           enum: [doctor, patient, clinic, system]
 *       - in: query
 *         name: ownerId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [medical_record, analysis, prescription, referral, certificate, photo, video, audio, document, other]
 *       - in: query
 *         name: visibility
 *         schema:
 *           type: string
 *           enum: [private, doctor_only, patient_only, shared, public]
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
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of files
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/File'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 */
router.get('/', validate(listFileSchema, 'query'), FileController.list);

/**
 * @swagger
 * /api/files/{id}:
 *   get:
 *     summary: Get file by ID
 *     tags: [Files]
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
 *         description: File details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/File'
 */
router.get('/:id', FileController.getById);

/**
 * @swagger
 * /api/files/{id}/download:
 *   get:
 *     summary: Download file
 *     tags: [Files]
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
 *         description: File downloaded successfully
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 */
router.get('/:id/download', FileController.download);

/**
 * @swagger
 * /api/files/{id}:
 *   put:
 *     summary: Update file metadata
 *     tags: [Files]
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
 *             $ref: '#/components/schemas/UpdateFileRequest'
 *     responses:
 *       200:
 *         description: File updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/File'
 */
router.put('/:id', validate(updateFileSchema), FileController.update);

/**
 * @swagger
 * /api/files/{id}:
 *   delete:
 *     summary: Delete file
 *     tags: [Files]
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
 *         description: File deleted successfully
 */
router.delete('/:id', FileController.delete);

/**
 * @swagger
 * /api/files/{id}/metadata:
 *   get:
 *     summary: Get file metadata
 *     tags: [Files]
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
 *         description: File metadata
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FileMetadata'
 */
router.get('/:id/metadata', FileController.getMetadata);

/**
 * @swagger
 * /api/files/{id}/metadata:
 *   post:
 *     summary: Add/update file metadata
 *     tags: [Files]
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
 *             $ref: '#/components/schemas/FileMetadataRequest'
 *     responses:
 *       200:
 *         description: Metadata updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FileMetadata'
 */
router.post('/:id/metadata', validate(fileMetadataSchema), FileController.updateMetadata);

/**
 * @swagger
 * /api/files/{id}/preview:
 *   get:
 *     summary: Get file preview (for images, videos, documents)
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: width
 *         schema:
 *           type: integer
 *       - in: query
 *         name: height
 *         schema:
 *           type: integer
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *     responses:
 *       200:
 *         description: File preview
 *         content:
 *           image/jpeg:
 *             schema:
 *               type: string
 *               format: binary
 */
router.get('/:id/preview', FileController.getPreview);

/**
 * @swagger
 * /api/files/cleanup:
 *   post:
 *     summary: Cleanup expired files (admin only)
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
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
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: string
 */
router.post('/cleanup', authorize(['admin']), FileController.cleanupExpired);

/**
 * @swagger
 * /api/files/doctor/{doctorId}:
 *   get:
 *     summary: List files uploaded by doctor
 *     tags: [Files]
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
 *         name: chatId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: patientId
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
 *         description: List of files
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/File'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 */
router.get('/doctor/:doctorId', isDoctor(), FileController.listByDoctor);

/**
 * @swagger
 * /api/files/patient/{patientId}:
 *   get:
 *     summary: List files for patient
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: chatId
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
 *         description: List of files
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/File'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 */
router.get('/patient/:patientId', FileController.listByPatient);

module.exports = router;
