/**
 * File Upload Middleware
 * Handles multipart form data uploads with Multer
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { AppError } = require('./errorHandler');

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Create uploads directory if it doesn't exist
    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

// File filter to validate file types
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    // Images
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    // Videos
    'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo',
    // Audio (m4a/mp4/aac cover voice messages recorded with expo-av)
    'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/x-m4a',
    'audio/m4a', 'audio/mp4', 'audio/aac', 'audio/webm',
    // Documents
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'application/json',
    'application/xml',
    // Archives
    'application/zip',
    'application/x-rar-compressed',
    'application/x-7z-compressed',
    'application/x-tar',
    'application/gzip',
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError('File type not allowed', 400, 'VALIDATION_ERROR'), false);
  }
};

// Configure multer
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
    files: 10, // Max 10 files per request
  },
});

// Single file upload
const single = upload.single('file');

// Multiple files upload
const array = upload.array('files', 10);

// Fields with files
const fields = upload.fields([
  { name: 'file', maxCount: 1 },
  { name: 'files', maxCount: 10 },
  { name: 'avatar', maxCount: 1 },
]);

// Custom middleware to handle upload and clean up temp files
const uploadMiddleware = (fieldName = 'file', maxCount = 1) => {
  return (req, res, next) => {
    if (maxCount === 1) {
      upload.single(fieldName)(req, res, (err) => {
        if (err) {
          // Clean up uploaded file if error
          if (req.file) {
            try { fs.unlinkSync(req.file.path); } catch (e) { /* non-fatal */ }
          }
          return next(err);
        }
        next();
      });
    } else {
      upload.array(fieldName, maxCount)(req, res, (err) => {
        if (err) {
          // Clean up uploaded files if error
          if (req.files) {
            req.files.forEach(file => {
              try { fs.unlinkSync(file.path); } catch (e) { /* non-fatal */ }
            });
          }
          return next(err);
        }
        next();
      });
    }
  };
};

module.exports = {
  upload,
  single,
  array,
  fields,
  uploadMiddleware,
};
