const Minio = require('minio');
const dotenv = require('dotenv');

dotenv.config();

const {
  MINIO_ENDPOINT,
  MINIO_PORT,
  MINIO_ACCESS_KEY,
  MINIO_SECRET_KEY,
  MINIO_BUCKET,
  NODE_ENV,
} = process.env;

const minioClient = new Minio.Client({
  endPoint: MINIO_ENDPOINT || 'localhost',
  port: parseInt(MINIO_PORT) || 9000,
  useSSL: NODE_ENV === 'production',
  accessKey: MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: MINIO_SECRET_KEY || 'minioadmin',
});

const bucketName = MINIO_BUCKET || 'medchat-files';

// Initialize bucket
async function initializeBucket() {
  try {
    const bucketExists = await minioClient.bucketExists(bucketName);
    if (!bucketExists) {
      await minioClient.makeBucket(bucketName);
      console.log(`✅ Created bucket: ${bucketName}`);
    } else {
      console.log(`✅ Bucket ${bucketName} already exists`);
    }
  } catch (err) {
    console.error('❌ Error initializing MinIO bucket:', err);
  }
}

// Set bucket policy for public read (for patient files only)
async function setBucketPolicy() {
  try {
    const policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: '*',
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${bucketName}/*`],
        },
      ],
    };
    await minioClient.setBucketPolicy(bucketName, JSON.stringify(policy));
    console.log(`✅ Bucket policy set for ${bucketName}`);
  } catch (err) {
    console.error('❌ Error setting bucket policy:', err);
  }
}

// Initialize on startup
initializeBucket();
setBucketPolicy();

module.exports = {
  minioClient,
  bucketName,
  // File types
  FILE_TYPES: {
    DOCTOR_UPLOAD: 'doctor-upload',
    PATIENT_UPLOAD: 'patient-upload',
    AVATAR: 'avatar',
    DOCUMENT: 'document',
    IMAGE: 'image',
    AUDIO: 'audio',
    VIDEO: 'video',
  },
  // Get file URL
  getFileUrl: (filename) => {
    return `${NODE_ENV === 'production' ? 'https' : 'http'}://${MINIO_ENDPOINT || 'localhost'}:${MINIO_PORT || 9000}/${bucketName}/${filename}`;
  },
};
