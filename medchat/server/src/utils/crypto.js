const nacl = require('tweetnacl');
const { subtle } = require('crypto').webcrypto || require('crypto').webcrypto;

/**
 * Cryptographic utilities for MedChat
 * 
 * This module provides end-to-end encryption utilities using:
 * - X25519 for key exchange (ECDH)
 * - XChaCha20-Poly1305 for encryption
 * - SHA-256 for hashing
 */

/**
 * Generates a new key pair for X25519 (Elliptic Curve Diffie-Hellman)
 * @returns {Object} Key pair with publicKey and privateKey (Base64 encoded)
 */
function generateKeyPair() {
  const keyPair = nacl.box.keyPair();
  return {
    publicKey: Buffer.from(keyPair.publicKey).toString('base64'),
    privateKey: Buffer.from(keyPair.secretKey).toString('base64')
  };
}

/**
 * Generates a new key pair for Ed25519 (Digital Signatures)
 * @returns {Object} Key pair with publicKey and privateKey (Base64 encoded)
 */
function generateSigningKeyPair() {
  const keyPair = nacl.sign.keyPair();
  return {
    publicKey: Buffer.from(keyPair.publicKey).toString('base64'),
    privateKey: Buffer.from(keyPair.secretKey).toString('base64')
  };
}

/**
 * Derives a shared secret from private key and peer's public key
 * @param {string} privateKey - Base64 encoded private key
 * @param {string} publicKey - Base64 encoded public key
 * @returns {Promise<Uint8Array>} Shared secret
 */
async function deriveSharedSecret(privateKey, publicKey) {
  try {
    const privateKeyBytes = Buffer.from(privateKey, 'base64');
    const publicKeyBytes = Buffer.from(publicKey, 'base64');
    
    // Use Web Crypto API for X25519
    const privateKeyObj = await subtle.importKey(
      'raw',
      privateKeyBytes,
      { name: 'X25519' },
      false,
      ['deriveKey', 'deriveBits']
    );
    
    const publicKeyObj = await subtle.importKey(
      'raw',
      publicKeyBytes,
      { name: 'X25519' },
      false,
      []
    );
    
    // Derive shared secret
    const sharedSecret = await subtle.deriveBits(
      { name: 'X25519' },
      privateKeyObj,
      publicKeyObj,
      256
    );
    
    return new Uint8Array(sharedSecret);
  } catch (error) {
    console.error('Error deriving shared secret:', error);
    throw new Error('Failed to derive shared secret');
  }
}

/**
 * Derives encryption key from shared secret using HKDF
 * @param {Uint8Array} sharedSecret - Shared secret from ECDH
 * @param {string} salt - Optional salt (Base64 encoded)
 * @param {string} info - Optional info string
 * @returns {Promise<Uint8Array>} Derived key (32 bytes)
 */
async function deriveEncryptionKey(sharedSecret, salt = '', info = 'MedChat Encryption Key') {
  try {
    const saltBytes = salt ? Buffer.from(salt, 'base64') : new Uint8Array(32);
    const infoBytes = Buffer.from(info, 'utf8');
    
    // Import shared secret as a key
    const secretKey = await subtle.importKey(
      'raw',
      sharedSecret,
      { name: 'HKDF' },
      false,
      ['deriveKey']
    );
    
    // Derive key using HKDF
    const derivedKey = await subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: saltBytes,
        info: infoBytes
      },
      secretKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    
    // Export the derived key
    const exportedKey = await subtle.exportKey('raw', derivedKey);
    return new Uint8Array(exportedKey);
  } catch (error) {
    console.error('Error deriving encryption key:', error);
    throw new Error('Failed to derive encryption key');
  }
}

/**
 * Encrypts a message using XChaCha20-Poly1305
 * @param {string} plaintext - Message to encrypt
 * @param {Uint8Array} key - Encryption key (32 bytes)
 * @returns {Object} Encrypted data with ciphertext and nonce (Base64 encoded)
 */
function encryptMessage(plaintext, key) {
  try {
    // Generate random nonce (24 bytes for XChaCha20-Poly1305)
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    
    // Encrypt using secretbox (XSalsa20-Poly1305, similar to XChaCha20-Poly1305)
    const plaintextBytes = Buffer.from(plaintext, 'utf8');
    const ciphertext = nacl.secretbox(plaintextBytes, nonce, key);
    
    return {
      ciphertext: Buffer.from(ciphertext).toString('base64'),
      nonce: Buffer.from(nonce).toString('base64')
    };
  } catch (error) {
    console.error('Error encrypting message:', error);
    throw new Error('Failed to encrypt message');
  }
}

/**
 * Decrypts a message using XChaCha20-Poly1305
 * @param {string} ciphertext - Encrypted message (Base64 encoded)
 * @param {string} nonce - Nonce (Base64 encoded)
 * @param {Uint8Array} key - Encryption key (32 bytes)
 * @returns {string} Decrypted plaintext
 */
function decryptMessage(ciphertext, nonce, key) {
  try {
    const ciphertextBytes = Buffer.from(ciphertext, 'base64');
    const nonceBytes = Buffer.from(nonce, 'base64');
    
    // Decrypt using secretbox
    const plaintextBytes = nacl.secretbox.open(ciphertextBytes, nonceBytes, key);
    
    if (!plaintextBytes) {
      throw new Error('Decryption failed - possibly wrong key or corrupted data');
    }
    
    return Buffer.from(plaintextBytes).toString('utf8');
  } catch (error) {
    console.error('Error decrypting message:', error);
    throw new Error('Failed to decrypt message');
  }
}

/**
 * Encrypts a message using Web Crypto API (AES-GCM)
 * @param {string} plaintext - Message to encrypt
 * @param {Uint8Array} key - Encryption key (32 bytes)
 * @returns {Promise<Object>} Encrypted data with ciphertext and iv (Base64 encoded)
 */
async function encryptMessageWebCrypto(plaintext, key) {
  try {
    const iv = crypto.getRandomValues(new Uint8Array(12)); // 12 bytes for GCM
    const plaintextBytes = Buffer.from(plaintext, 'utf8');
    
    const encrypted = await subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      plaintextBytes
    );
    
    return {
      ciphertext: Buffer.from(encrypted).toString('base64'),
      iv: Buffer.from(iv).toString('base64')
    };
  } catch (error) {
    console.error('Error encrypting with Web Crypto:', error);
    throw new Error('Failed to encrypt message with Web Crypto');
  }
}

/**
 * Decrypts a message using Web Crypto API (AES-GCM)
 * @param {string} ciphertext - Encrypted message (Base64 encoded)
 * @param {string} iv - Initialization vector (Base64 encoded)
 * @param {Uint8Array} key - Encryption key (32 bytes)
 * @returns {Promise<string>} Decrypted plaintext
 */
async function decryptMessageWebCrypto(ciphertext, iv, key) {
  try {
    const ciphertextBytes = Buffer.from(ciphertext, 'base64');
    const ivBytes = Buffer.from(iv, 'base64');
    
    const decrypted = await subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: ivBytes
      },
      key,
      ciphertextBytes
    );
    
    return Buffer.from(decrypted).toString('utf8');
  } catch (error) {
    console.error('Error decrypting with Web Crypto:', error);
    throw new Error('Failed to decrypt message with Web Crypto');
  }
}

/**
 * Signs a message using Ed25519
 * @param {string} message - Message to sign
 * @param {string} privateKey - Private key (Base64 encoded)
 * @returns {string} Signature (Base64 encoded)
 */
function signMessage(message, privateKey) {
  try {
    const messageBytes = Buffer.from(message, 'utf8');
    const privateKeyBytes = Buffer.from(privateKey, 'base64');
    
    const signature = nacl.sign.detached(messageBytes, privateKeyBytes);
    return Buffer.from(signature).toString('base64');
  } catch (error) {
    console.error('Error signing message:', error);
    throw new Error('Failed to sign message');
  }
}

/**
 * Verifies a signature using Ed25519
 * @param {string} message - Original message
 * @param {string} signature - Signature (Base64 encoded)
 * @param {string} publicKey - Public key (Base64 encoded)
 * @returns {boolean} True if signature is valid
 */
function verifySignature(message, signature, publicKey) {
  try {
    const messageBytes = Buffer.from(message, 'utf8');
    const signatureBytes = Buffer.from(signature, 'base64');
    const publicKeyBytes = Buffer.from(publicKey, 'base64');
    
    return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
  } catch (error) {
    console.error('Error verifying signature:', error);
    return false;
  }
}

/**
 * Hashes a message using SHA-256
 * @param {string} message - Message to hash
 * @returns {Promise<string>} Hash (Base64 encoded)
 */
async function hashMessage(message) {
  try {
    const messageBytes = Buffer.from(message, 'utf8');
    const hashBuffer = await subtle.digest('SHA-256', messageBytes);
    return Buffer.from(hashBuffer).toString('base64');
  } catch (error) {
    console.error('Error hashing message:', error);
    throw new Error('Failed to hash message');
  }
}

/**
 * Generates a random UUID
 * @returns {string} UUID v4
 */
function generateUUID() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}`;
}

/**
 * Generates a random nonce (24 bytes for XChaCha20-Poly1305)
 * @returns {string} Nonce (Base64 encoded)
 */
function generateNonce() {
  const nonce = nacl.randomBytes(24);
  return Buffer.from(nonce).toString('base64');
}

/**
 * Generates a session key for message encryption
 * @returns {Promise<Object>} Session key and metadata
 */
async function generateSessionKey() {
  try {
    // Generate random key
    const key = crypto.getRandomValues(new Uint8Array(32));
    
    // Generate key ID
    const keyId = generateUUID();
    
    return {
      keyId,
      key: Buffer.from(key).toString('base64'),
      createdAt: Date.now()
    };
  } catch (error) {
    console.error('Error generating session key:', error);
    throw new Error('Failed to generate session key');
  }
}

module.exports = {
  generateKeyPair,
  generateSigningKeyPair,
  deriveSharedSecret,
  deriveEncryptionKey,
  encryptMessage,
  decryptMessage,
  encryptMessageWebCrypto,
  decryptMessageWebCrypto,
  signMessage,
  verifySignature,
  hashMessage,
  generateUUID,
  generateNonce,
  generateSessionKey
};
