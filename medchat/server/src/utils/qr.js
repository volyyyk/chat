/**
 * QR Code generation utilities for MedChat
 * 
 * Generates QR codes for doctor connections
 */

const { createCanvas } = require('canvas');
const qrcode = require('qrcode');

/**
 * Generates a QR code as a data URL
 * @param {string} text - Text to encode in QR code
 * @param {Object} options - QR code options
 * @returns {Promise<string>} Data URL of the QR code image
 */
async function generateQRCodeDataURL(text, options = {}) {
  try {
    const defaults = {
      type: 'image/png',
      width: 200,
      height: 200,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      },
      quality: 0.92,
      errorCorrectionLevel: 'H'
    };
    
    const qrOptions = { ...defaults, ...options };
    
    // Generate QR code as data URL
    const dataURL = await qrcode.toDataURL(text, qrOptions);
    return dataURL;
  } catch (error) {
    console.error('Error generating QR code:', error);
    throw new Error('Failed to generate QR code');
  }
}

/**
 * Generates a QR code as a buffer
 * @param {string} text - Text to encode in QR code
 * @param {Object} options - QR code options
 * @returns {Promise<Buffer>} Buffer containing QR code image
 */
async function generateQRCodeBuffer(text, options = {}) {
  try {
    const defaults = {
      type: 'png',
      width: 200,
      height: 200,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      },
      errorCorrectionLevel: 'H'
    };
    
    const qrOptions = { ...defaults, ...options };
    
    // Generate QR code as buffer
    const buffer = await qrcode.toBuffer(text, qrOptions);
    return buffer;
  } catch (error) {
    console.error('Error generating QR code buffer:', error);
    throw new Error('Failed to generate QR code buffer');
  }
}

/**
 * Generates a QR code as a canvas
 * @param {string} text - Text to encode in QR code
 * @param {Object} options - QR code options
 * @returns {Promise<Canvas>} Canvas object with QR code
 */
async function generateQRCodeCanvas(text, options = {}) {
  try {
    const defaults = {
      width: 200,
      height: 200,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      },
      errorCorrectionLevel: 'H'
    };
    
    const qrOptions = { ...defaults, ...options };
    
    // Create canvas
    const canvas = createCanvas(qrOptions.width, qrOptions.height);
    const ctx = canvas.getContext('2d');
    
    // Fill background
    ctx.fillStyle = qrOptions.color.light;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Generate QR code
    const qrData = await qrcode.create(text, { errorCorrectionLevel: qrOptions.errorCorrectionLevel });
    
    // Calculate cell size
    const cellSize = Math.floor((qrOptions.width - qrOptions.margin * 2) / qrData.modules.size);
    const offset = qrOptions.margin + (qrOptions.width - qrOptions.margin * 2 - cellSize * qrData.modules.size) / 2;
    
    // Draw QR code
    ctx.fillStyle = qrOptions.color.dark;
    for (let row = 0; row < qrData.modules.size; row++) {
      for (let col = 0; col < qrData.modules.size; col++) {
        if (qrData.modules.data[row * qrData.modules.size + col]) {
          ctx.fillRect(
            offset + col * cellSize,
            offset + row * cellSize,
            cellSize,
            cellSize
          );
        }
      }
    }
    
    return canvas;
  } catch (error) {
    console.error('Error generating QR code canvas:', error);
    throw new Error('Failed to generate QR code canvas');
  }
}

/**
 * Generates a deep link for doctor connection
 * @param {string} doctorId - Doctor's unique ID
 * @param {Object} params - Additional parameters
 * @returns {string} Deep link URL
 */
function generateDeepLink(doctorId, params = {}) {
  const baseUrl = 'medchat://connect';
  const queryParams = new URLSearchParams({
    doctorId,
    ...params
  });
  
  return `${baseUrl}?${queryParams.toString()}`;
}

/**
 * Generates a web URL for doctor connection
 * @param {string} doctorId - Doctor's unique ID
 * @param {string} baseUrl - Base URL of the web application
 * @param {Object} params - Additional parameters
 * @returns {string} Web URL
 */
function generateWebURL(doctorId, baseUrl = 'https://medchat.app', params = {}) {
  const queryParams = new URLSearchParams({
    doctorId,
    ...params
  });
  
  return `${baseUrl}/connect?${queryParams.toString()}`;
}

/**
 * Generates QR code data for doctor
 * @param {string} doctorId - Doctor's unique ID
 * @param {Object} options - Options for QR code
 * @returns {Promise<Object>} QR code data and deep link
 */
async function generateDoctorQRCode(doctorId, options = {}) {
  try {
    // Generate deep link
    const deepLink = generateDeepLink(doctorId);
    
    // Generate web URL
    const webURL = generateWebURL(doctorId, options.baseUrl);
    
    // Generate QR code
    const qrDataURL = await generateQRCodeDataURL(deepLink, options);
    
    // Generate QR code data object
    const qrData = {
      type: 'medchat_doctor',
      doctorId,
      version: '1.0.0',
      timestamp: Date.now(),
      deepLink,
      webURL
    };
    
    return {
      qrDataURL,
      deepLink,
      webURL,
      qrData
    };
  } catch (error) {
    console.error('Error generating doctor QR code:', error);
    throw new Error('Failed to generate doctor QR code');
  }
}

/**
 * Parses deep link URL
 * @param {string} url - Deep link URL
 * @returns {Object|null} Parsed data or null if invalid
 */
function parseDeepLink(url) {
  try {
    if (!url || typeof url !== 'string') {
      return null;
    }
    
    // Check if it's a medchat deep link
    if (!url.startsWith('medchat://')) {
      return null;
    }
    
    // Parse URL
    const urlObj = new URL(url);
    const params = Object.fromEntries(urlObj.searchParams.entries());
    
    // Validate required parameters
    if (!params.doctorId) {
      return null;
    }
    
    return {
      type: 'medchat_doctor',
      doctorId: params.doctorId,
      ...params
    };
  } catch (error) {
    console.error('Error parsing deep link:', error);
    return null;
  }
}

/**
 * Parses web URL
 * @param {string} url - Web URL
 * @returns {Object|null} Parsed data or null if invalid
 */
function parseWebURL(url) {
  try {
    if (!url || typeof url !== 'string') {
      return null;
    }
    
    // Parse URL
    const urlObj = new URL(url);
    const params = Object.fromEntries(urlObj.searchParams.entries());
    
    // Check if it's a medchat web URL
    if (!params.doctorId) {
      return null;
    }
    
    return {
      type: 'medchat_web',
      doctorId: params.doctorId,
      baseUrl: `${urlObj.protocol}//${urlObj.host}`,
      ...params
    };
  } catch (error) {
    console.error('Error parsing web URL:', error);
    return null;
  }
}

/**
 * Validates QR code data
 * @param {Object} qrData - QR code data to validate
 * @returns {boolean} True if valid
 */
function validateQRCodeData(qrData) {
  if (!qrData || typeof qrData !== 'object') {
    return false;
  }
  
  if (qrData.type !== 'medchat_doctor') {
    return false;
  }
  
  if (!qrData.doctorId || typeof qrData.doctorId !== 'string') {
    return false;
  }
  
  if (!qrData.version || typeof qrData.version !== 'string') {
    return false;
  }
  
  return true;
}

module.exports = {
  generateQRCodeDataURL,
  generateQRCodeBuffer,
  generateQRCodeCanvas,
  generateDeepLink,
  generateWebURL,
  generateDoctorQRCode,
  parseDeepLink,
  parseWebURL,
  validateQRCodeData
};
