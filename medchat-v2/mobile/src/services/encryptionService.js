/**
 * Encryption Service
 * Handles end-to-end encryption for messages
 */

import nacl from 'tweetnacl';
import { encode, decode } from 'base64-arraybuffer';

class EncryptionService {
  /**
   * Generate X25519 key pair
   */
  generateKeyPair() {
    const keyPair = nacl.box.keyPair();
    return {
      publicKey: this.arrayBufferToBase64(keyPair.publicKey),
      privateKey: this.arrayBufferToBase64(keyPair.secretKey),
    };
  }

  /**
   * Generate shared secret from private key and peer's public key
   */
  generateSharedSecret(privateKey, peerPublicKey) {
    const decodedPrivateKey = this.base64ToArrayBuffer(privateKey);
    const decodedPeerPublicKey = this.base64ToArrayBuffer(peerPublicKey);
    
    return nacl.box.before(decodedPeerPublicKey, decodedPrivateKey);
  }

  /**
   * Encrypt message
   */
  encryptMessage(message, senderPrivateKey, recipientPublicKey) {
    try {
      const decodedPrivateKey = this.base64ToArrayBuffer(senderPrivateKey);
      const decodedPublicKey = this.base64ToArrayBuffer(recipientPublicKey);
      
      // Generate shared secret
      const sharedSecret = nacl.box.before(decodedPublicKey, decodedPrivateKey);
      
      // Generate nonce
      const nonce = nacl.randomBytes(nacl.box.nonceLength);
      
      // Encrypt message
      const messageBuffer = this.stringToArrayBuffer(JSON.stringify(message));
      const encrypted = nacl.box.after(messageBuffer, nonce, sharedSecret);
      
      return {
        ciphertext: this.arrayBufferToBase64(encrypted),
        nonce: this.arrayBufferToBase64(nonce),
        publicKey: senderPrivateKey ? this.getPublicKeyFromPrivate(senderPrivateKey) : recipientPublicKey,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      console.error('Error encrypting message:', err);
      throw err;
    }
  }

  /**
   * Decrypt message
   */
  decryptMessage(encryptedMessage, recipientPrivateKey) {
    try {
      const { ciphertext, nonce, publicKey } = encryptedMessage;
      
      const decodedCiphertext = this.base64ToArrayBuffer(ciphertext);
      const decodedNonce = this.base64ToArrayBuffer(nonce);
      const decodedPublicKey = this.base64ToArrayBuffer(publicKey);
      const decodedPrivateKey = this.base64ToArrayBuffer(recipientPrivateKey);
      
      // Generate shared secret
      const sharedSecret = nacl.box.before(decodedPublicKey, decodedPrivateKey);
      
      // Decrypt message
      const decrypted = nacl.box.open.after(decrypted, nonce, sharedSecret);
      
      if (!decrypted) {
        throw new Error('Failed to decrypt message - possibly wrong key');
      }
      
      return JSON.parse(this.arrayBufferToString(decrypted));
    } catch (err) {
      console.error('Error decrypting message:', err);
      throw err;
    }
  }

  /**
   * Encrypt file
   */
  async encryptFile(file, key) {
    try {
      // For large files, we would chunk them and encrypt each chunk
      // This is a simplified version
      
      const fileBuffer = await this.fileToArrayBuffer(file);
      const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
      const encrypted = nacl.secretbox(fileBuffer, nonce, key);
      
      return {
        ciphertext: this.arrayBufferToBase64(encrypted),
        nonce: this.arrayBufferToBase64(nonce),
      };
    } catch (err) {
      console.error('Error encrypting file:', err);
      throw err;
    }
  }

  /**
   * Decrypt file
   */
  async decryptFile(encryptedData, key) {
    try {
      const { ciphertext, nonce } = encryptedData;
      
      const decodedCiphertext = this.base64ToArrayBuffer(ciphertext);
      const decodedNonce = this.base64ToArrayBuffer(nonce);
      
      const decrypted = nacl.secretbox.open(decodedCiphertext, decodedNonce, key);
      
      if (!decrypted) {
        throw new Error('Failed to decrypt file');
      }
      
      return decrypted;
    } catch (err) {
      console.error('Error decrypting file:', err);
      throw err;
    }
  }

  /**
   * Generate symmetric key
   */
  generateSymmetricKey() {
    return nacl.secretbox.keygen();
  }

  /**
   * Derive key from password
   */
  async deriveKeyFromPassword(password, salt, iterations = 100000) {
    // In production, use a proper KDF like PBKDF2 or Argon2
    // This is a simplified version
    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);
    const saltBuffer = this.base64ToArrayBuffer(salt);
    
    // Simple hash (not secure for production!)
    // Use a proper KDF in production
    const hashBuffer = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      hashBuffer[i] = passwordBuffer[i % passwordBuffer.length] ^ saltBuffer[i % saltBuffer.length];
    }
    
    return hashBuffer;
  }

  /**
   * Get public key from private key
   */
  getPublicKeyFromPrivate(privateKey) {
    const decodedPrivateKey = this.base64ToArrayBuffer(privateKey);
    const keyPair = nacl.box.keyPair.fromSecretKey(decodedPrivateKey);
    return this.arrayBufferToBase64(keyPair.publicKey);
  }

  /**
   * Generate random bytes
   */
  generateRandomBytes(length) {
    return nacl.randomBytes(length);
  }

  /**
   * Helper: Convert ArrayBuffer to Base64
   */
  arrayBufferToBase64(buffer) {
    return encode(buffer);
  }

  /**
   * Helper: Convert Base64 to ArrayBuffer
   */
  base64ToArrayBuffer(base64) {
    return decode(base64);
  }

  /**
   * Helper: Convert string to ArrayBuffer
   */
  stringToArrayBuffer(str) {
    const encoder = new TextEncoder();
    return encoder.encode(str);
  }

  /**
   * Helper: Convert ArrayBuffer to string
   */
  arrayBufferToString(buffer) {
    const decoder = new TextDecoder();
    return decoder.decode(buffer);
  }

  /**
   * Helper: Convert file to ArrayBuffer
   */
  async fileToArrayBuffer(file) {
    if (file instanceof Blob || file instanceof File) {
      return await file.arrayBuffer();
    }
    return file;
  }

  /**
   * Generate key pair for a new chat
   */
  generateChatKeys() {
    return {
      ...this.generateKeyPair(),
      sharedSecret: null,
    };
  }
}

// Singleton instance
export const encryptionService = new EncryptionService();
