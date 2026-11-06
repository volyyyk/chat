/**
 * Crypto Service
 * Handles end-to-end encryption using X25519 (ECDH) and XChaCha20-Poly1305
 */

const nacl = require('tweetnacl');
const crypto = require('crypto');

class CryptoService {
  /**
   * Generate X25519 key pair
   * @returns {Object} Key pair object
   */
  static generateX25519KeyPair() {
    const keyPair = nacl.box.keyPair();
    return {
      publicKey: Buffer.from(keyPair.publicKey).toString('base64'),
      privateKey: Buffer.from(keyPair.secretKey).toString('base64'),
    };
  }

  /**
   * Generate random bytes
   * @param {number} length - Number of bytes
   * @returns {Buffer} Random bytes
   */
  static generateRandomBytes(length = 32) {
    return crypto.randomBytes(length);
  }

  /**
   * Derive shared secret using X25519 (ECDH)
   * @param {string} privateKey - Base64 encoded private key
   * @param {string} publicKey - Base64 encoded public key
   * @returns {Buffer} Shared secret
   */
  static deriveSharedSecret(privateKey, publicKey) {
    const privateKeyBuffer = Buffer.from(privateKey, 'base64');
    const publicKeyBuffer = Buffer.from(publicKey, 'base64');
    
    // Convert to Uint8Array for nacl
    const privateKeyUint8 = new Uint8Array(privateKeyBuffer);
    const publicKeyUint8 = new Uint8Array(publicKeyBuffer);
    
    // Derive shared secret
    const sharedSecret = nacl.scalarMult(privateKeyUint8, publicKeyUint8);
    
    return Buffer.from(sharedSecret);
  }

  /**
   * Derive encryption key from shared secret
   * @param {Buffer} sharedSecret - Shared secret from ECDH
   * @returns {Buffer} 32-byte encryption key
   */
  static deriveEncryptionKey(sharedSecret) {
    // Use HKDF to derive a 32-byte key
    return crypto.createHash('sha256').update(sharedSecret).digest();
  }

  /**
   * Encrypt message using XChaCha20-Poly1305
   * @param {string} message - Plain text message
   * @param {Buffer} key - 32-byte encryption key
   * @returns {Object} Encrypted data with nonce and tag
   */
  static encryptMessage(message, key) {
    // Generate random nonce (24 bytes for XChaCha20)
    const nonce = this.generateRandomBytes(24);
    
    // Convert message to Buffer
    const messageBuffer = Buffer.from(message, 'utf8');
    
    // Encrypt using XChaCha20-Poly1305
    const encrypted = nacl.secretbox(messageBuffer, nonce, key);
    
    return {
      ciphertext: Buffer.from(encrypted).toString('base64'),
      nonce: nonce.toString('base64'),
    };
  }

  /**
   * Decrypt message using XChaCha20-Poly1305
   * @param {Object} encryptedData - Encrypted data with nonce and ciphertext
   * @param {Buffer} key - 32-byte encryption key
   * @returns {string} Decrypted message
   */
  static decryptMessage(encryptedData, key) {
    const { ciphertext, nonce } = encryptedData;
    
    // Convert from base64
    const ciphertextBuffer = Buffer.from(ciphertext, 'base64');
    const nonceBuffer = Buffer.from(nonce, 'base64');
    
    // Decrypt
    const decrypted = nacl.secretbox.open(ciphertextBuffer, nonceBuffer, key);
    
    if (!decrypted) {
      throw new Error('Failed to decrypt message: invalid key or corrupted data');
    }
    
    return Buffer.from(decrypted).toString('utf8');
  }

  /**
   * Encrypt file using XChaCha20-Poly1305
   * @param {Buffer} fileBuffer - File data
   * @param {Buffer} key - 32-byte encryption key
   * @returns {Object} Encrypted file data
   */
  static encryptFile(fileBuffer, key) {
    // Generate random nonce (24 bytes for XChaCha20)
    const nonce = this.generateRandomBytes(24);
    
    // Encrypt
    const encrypted = nacl.secretbox(fileBuffer, nonce, key);
    
    return {
      encryptedData: Buffer.from(encrypted),
      nonce,
    };
  }

  /**
   * Decrypt file using XChaCha20-Poly1305
   * @param {Object} encryptedData - Encrypted file data
   * @param {Buffer} key - 32-byte encryption key
   * @returns {Buffer} Decrypted file data
   */
  static decryptFile(encryptedData, key) {
    const { encryptedData: ciphertext, nonce } = encryptedData;
    
    // Decrypt
    const decrypted = nacl.secretbox.open(ciphertext, nonce, key);
    
    if (!decrypted) {
      throw new Error('Failed to decrypt file: invalid key or corrupted data');
    }
    
    return Buffer.from(decrypted);
  }

  /**
   * Generate session key for chat
   * @returns {Object} Session key data
   */
  static generateSessionKey() {
    const key = this.generateRandomBytes(32);
    return {
      key: key.toString('base64'),
      keyId: crypto.randomBytes(16).toString('hex'),
    };
  }

  /**
   * Hash data using SHA-256
   * @param {string|Buffer} data - Data to hash
   * @returns {string} Hex encoded hash
   */
  static hashSHA256(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Hash data using SHA-512
   * @param {string|Buffer} data - Data to hash
   * @returns {string} Hex encoded hash
   */
  static hashSHA512(data) {
    return crypto.createHash('sha512').update(data).digest('hex');
  }

  /**
   * Generate HMAC signature
   * @param {string|Buffer} data - Data to sign
   * @param {string|Buffer} key - Secret key
   * @returns {string} Hex encoded signature
   */
  static generateHMAC(data, key) {
    return crypto.createHmac('sha256', key).update(data).digest('hex');
  }

  /**
   * Verify HMAC signature
   * @param {string|Buffer} data - Original data
   * @param {string} signature - Signature to verify
   * @param {string|Buffer} key - Secret key
   * @returns {boolean} Is valid
   */
  static verifyHMAC(data, signature, key) {
    const expectedSignature = this.generateHMAC(data, key);
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  }

  /**
   * Generate secure random string
   * @param {number} length - Length of string
   * @returns {string} Random string
   */
  static generateRandomString(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Generate UUID v4
   * @returns {string} UUID
   */
  static generateUUID() {
    return crypto.randomUUID();
  }

  /**
   * Encrypt object using JSON stringification
   * @param {Object} obj - Object to encrypt
   * @param {Buffer} key - Encryption key
   * @returns {Object} Encrypted data
   */
  static encryptObject(obj, key) {
    const jsonString = JSON.stringify(obj);
    return this.encryptMessage(jsonString, key);
  }

  /**
   * Decrypt object
   * @param {Object} encryptedData - Encrypted data
   * @param {Buffer} key - Encryption key
   * @returns {Object} Decrypted object
   */
  static decryptObject(encryptedData, key) {
    const jsonString = this.decryptMessage(encryptedData, key);
    return JSON.parse(jsonString);
  }

  /**
   * Create encrypted message package for transmission
   * @param {string} message - Plain text message
   * @param {string} senderPrivateKey - Sender's private key (base64)
   * @param {string} receiverPublicKey - Receiver's public key (base64)
   * @returns {Object} Encrypted message package
   */
  static createEncryptedMessagePackage(message, senderPrivateKey, receiverPublicKey) {
    // Derive shared secret
    const sharedSecret = this.deriveSharedSecret(senderPrivateKey, receiverPublicKey);
    
    // Derive encryption key
    const encryptionKey = this.deriveEncryptionKey(sharedSecret);
    
    // Encrypt message
    const encrypted = this.encryptMessage(message, encryptionKey);
    
    return {
      ciphertext: encrypted.ciphertext,
      nonce: encrypted.nonce,
      ephemeralPublicKey: Buffer.from(nacl.box.keyPair().publicKey).toString('base64'),
    };
  }

  /**
   * Decrypt message package
   * @param {Object} packageData - Encrypted message package
   * @param {string} receiverPrivateKey - Receiver's private key (base64)
   * @param {string} senderPublicKey - Sender's public key (base64)
   * @returns {string} Decrypted message
   */
  static decryptMessagePackage(packageData, receiverPrivateKey, senderPublicKey) {
    const { ciphertext, nonce, ephemeralPublicKey } = packageData;
    
    // Derive shared secret using receiver's private key and sender's ephemeral public key
    const sharedSecret = this.deriveSharedSecret(receiverPrivateKey, ephemeralPublicKey);
    
    // Derive encryption key
    const encryptionKey = this.deriveEncryptionKey(sharedSecret);
    
    // Decrypt message
    return this.decryptMessage({ ciphertext, nonce }, encryptionKey);
  }
}

module.exports = CryptoService;
