/**
 * Crypto Service for MedChat
 * 
 * Provides end-to-end encryption using X25519 for key exchange
 * and XChaCha20-Poly1305 for message encryption
 */

import React, { createContext, useContext, useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import nacl from 'tweetnacl';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import config from '../config';

// Crypto Context
const CryptoContext = createContext(null);

// Key types
const KEY_TYPES = {
  X25519: 'X25519',
  ED25519: 'Ed25519',
  AES_GCM: 'AES-GCM'
};

// Key storage keys
const KEY_STORAGE = {
  DOCTOR_KEY_PAIR: '@medchat_doctor_keypair',
  PATIENT_KEY_PAIR: '@medchat_patient_keypair',
  SESSION_KEYS: '@medchat_session_keys',
  ENCRYPTION_KEY: '@medchat_encryption_key'
};

// Crypto Provider Component
export const CryptoProvider = ({ children }) => {
  const [doctorKeyPair, setDoctorKeyPair] = useState(null);
  const [patientKeyPair, setPatientKeyPair] = useState(null);
  const [sessionKeys, setSessionKeys] = useState(new Map());
  const [encryptionKey, setEncryptionKey] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Initialize crypto service
  useEffect(() => {
    const initialize = async () => {
      try {
        setIsLoading(true);
        
        // Load or generate encryption key
        await loadEncryptionKey();
        
        // Load or generate key pairs
        await loadDoctorKeyPair();
        await loadPatientKeyPair();
        
        // Load session keys
        await loadSessionKeys();
        
        setIsLoading(false);
      } catch (err) {
        console.error('Failed to initialize crypto service:', err);
        setError(err.message);
        setIsLoading(false);
      }
    };
    
    initialize();
  }, []);

  // Load encryption key
  const loadEncryptionKey = useCallback(async () => {
    try {
      const storedKey = await AsyncStorage.getItem(KEY_STORAGE.ENCRYPTION_KEY);
      
      if (storedKey) {
        setEncryptionKey(storedKey);
      } else {
        // Generate new encryption key
        const key = Crypto.getRandomBytes(32);
        const keyBase64 = Buffer.from(key).toString('base64');
        await AsyncStorage.setItem(KEY_STORAGE.ENCRYPTION_KEY, keyBase64);
        setEncryptionKey(keyBase64);
      }
    } catch (err) {
      console.error('Failed to load encryption key:', err);
      throw err;
    }
  }, []);

  // Load doctor key pair
  const loadDoctorKeyPair = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(KEY_STORAGE.DOCTOR_KEY_PAIR);
      
      if (stored) {
        const { publicKey, privateKey } = JSON.parse(stored);
        setDoctorKeyPair({ publicKey, privateKey });
      } else {
        // Generate new key pair
        const keyPair = generateX25519KeyPair();
        await AsyncStorage.setItem(
          KEY_STORAGE.DOCTOR_KEY_PAIR,
          JSON.stringify(keyPair)
        );
        setDoctorKeyPair(keyPair);
      }
    } catch (err) {
      console.error('Failed to load doctor key pair:', err);
      throw err;
    }
  }, []);

  // Load patient key pair
  const loadPatientKeyPair = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(KEY_STORAGE.PATIENT_KEY_PAIR);
      
      if (stored) {
        const { publicKey, privateKey } = JSON.parse(stored);
        setPatientKeyPair({ publicKey, privateKey });
      } else {
        // Generate new key pair
        const keyPair = generateX25519KeyPair();
        await AsyncStorage.setItem(
          KEY_STORAGE.PATIENT_KEY_PAIR,
          JSON.stringify(keyPair)
        );
        setPatientKeyPair(keyPair);
      }
    } catch (err) {
      console.error('Failed to load patient key pair:', err);
      throw err;
    }
  }, []);

  // Load session keys
  const loadSessionKeys = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(KEY_STORAGE.SESSION_KEYS);
      
      if (stored) {
        const keys = new Map(JSON.parse(stored));
        setSessionKeys(keys);
      }
    } catch (err) {
      console.error('Failed to load session keys:', err);
      throw err;
    }
  }, []);

  // Save session keys
  const saveSessionKeys = useCallback(async () => {
    try {
      const keysArray = Array.from(sessionKeys.entries());
      await AsyncStorage.setItem(
        KEY_STORAGE.SESSION_KEYS,
        JSON.stringify(keysArray)
      );
    } catch (err) {
      console.error('Failed to save session keys:', err);
      throw err;
    }
  }, [sessionKeys]);

  // Generate X25519 key pair
  const generateX25519KeyPair = useCallback(() => {
    const keyPair = nacl.box.keyPair();
    return {
      publicKey: Buffer.from(keyPair.publicKey).toString('base64'),
      privateKey: Buffer.from(keyPair.secretKey).toString('base64')
    };
  }, []);

  // Generate Ed25519 key pair (for signing)
  const generateEd25519KeyPair = useCallback(() => {
    const keyPair = nacl.sign.keyPair();
    return {
      publicKey: Buffer.from(keyPair.publicKey).toString('base64'),
      privateKey: Buffer.from(keyPair.secretKey).toString('base64')
    };
  }, []);

  // Derive shared secret using X25519
  const deriveSharedSecret = useCallback((privateKey, publicKey) => {
    try {
      const privateKeyBytes = Buffer.from(privateKey, 'base64');
      const publicKeyBytes = Buffer.from(publicKey, 'base64');
      
      // Use nacl's scalarMult to perform ECDH
      const sharedSecret = nacl.scalarMult(privateKeyBytes, publicKeyBytes);
      
      return Buffer.from(sharedSecret).toString('base64');
    } catch (err) {
      console.error('Failed to derive shared secret:', err);
      throw new Error('Failed to derive shared secret');
    }
  }, []);

  // Derive encryption key from shared secret
  const deriveEncryptionKey = useCallback(async (sharedSecret, salt = '') => {
    try {
      const sharedSecretBytes = Buffer.from(sharedSecret, 'base64');
      const saltBytes = salt ? Buffer.from(salt, 'base64') : Crypto.getRandomBytes(16);
      
      // Use HKDF to derive a 32-byte key
      const info = Buffer.from('MedChat Encryption Key', 'utf8');
      
      // Simple HKDF implementation using SHA-256
      const hkdf = async (ikm, salt, info, length) => {
        const prk = await Crypto.digest('SHA-256', Buffer.concat([salt, ikm]));
        
        let t = Buffer.alloc(0);
        let okm = Buffer.alloc(0);
        
        for (let i = 1; okm.length < length; i++) {
          t = await Crypto.digest('SHA-256', Buffer.concat([t, prk, info, Buffer.from([i])]));
          okm = Buffer.concat([okm, t]);
        }
        
        return okm.slice(0, length);
      };
      
      const key = await hkdf(sharedSecretBytes, saltBytes, info, 32);
      return Buffer.from(key).toString('base64');
    } catch (err) {
      console.error('Failed to derive encryption key:', err);
      throw new Error('Failed to derive encryption key');
    }
  }, []);

  // Encrypt message using XChaCha20-Poly1305 (simulated with XSalsa20-Poly1305)
  const encryptMessage = useCallback((plaintext, key) => {
    try {
      const keyBytes = Buffer.from(key, 'base64');
      const plaintextBytes = Buffer.from(plaintext, 'utf8');
      
      // Generate random nonce (24 bytes for XSalsa20-Poly1305)
      const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
      
      // Encrypt using secretbox (XSalsa20-Poly1305)
      const ciphertext = nacl.secretbox(plaintextBytes, nonce, keyBytes);
      
      return {
        ciphertext: Buffer.from(ciphertext).toString('base64'),
        nonce: Buffer.from(nonce).toString('base64')
      };
    } catch (err) {
      console.error('Failed to encrypt message:', err);
      throw new Error('Failed to encrypt message');
    }
  }, []);

  // Decrypt message using XChaCha20-Poly1305
  const decryptMessage = useCallback((ciphertext, nonce, key) => {
    try {
      const ciphertextBytes = Buffer.from(ciphertext, 'base64');
      const nonceBytes = Buffer.from(nonce, 'base64');
      const keyBytes = Buffer.from(key, 'base64');
      
      // Decrypt using secretbox
      const plaintextBytes = nacl.secretbox.open(ciphertextBytes, nonceBytes, keyBytes);
      
      if (!plaintextBytes) {
        throw new Error('Decryption failed - possibly wrong key or corrupted data');
      }
      
      return Buffer.from(plaintextBytes).toString('utf8');
    } catch (err) {
      console.error('Failed to decrypt message:', err);
      throw new Error('Failed to decrypt message');
    }
  }, []);

  // Encrypt file
  const encryptFile = useCallback(async (filePath, key) => {
    try {
      const fileData = await FileSystem.readAsStringAsync(filePath, {
        encoding: FileSystem.EncodingType.Base64
      });
      
      const encrypted = encryptMessage(fileData, key);
      
      return {
        encryptedData: encrypted.ciphertext,
        nonce: encrypted.nonce,
        originalSize: fileData.length
      };
    } catch (err) {
      console.error('Failed to encrypt file:', err);
      throw new Error('Failed to encrypt file');
    }
  }, [encryptMessage]);

  // Decrypt file
  const decryptFile = useCallback(async (encryptedData, nonce, key, outputPath) => {
    try {
      const decrypted = decryptMessage(encryptedData, nonce, key);
      
      await FileSystem.writeAsStringAsync(outputPath, decrypted, {
        encoding: FileSystem.EncodingType.Base64
      });
      
      return outputPath;
    } catch (err) {
      console.error('Failed to decrypt file:', err);
      throw new Error('Failed to decrypt file');
    }
  }, [decryptMessage]);

  // Sign message
  const signMessage = useCallback((message, privateKey) => {
    try {
      const messageBytes = Buffer.from(message, 'utf8');
      const privateKeyBytes = Buffer.from(privateKey, 'base64');
      
      const signature = nacl.sign.detached(messageBytes, privateKeyBytes);
      return Buffer.from(signature).toString('base64');
    } catch (err) {
      console.error('Failed to sign message:', err);
      throw new Error('Failed to sign message');
    }
  }, []);

  // Verify signature
  const verifySignature = useCallback((message, signature, publicKey) => {
    try {
      const messageBytes = Buffer.from(message, 'utf8');
      const signatureBytes = Buffer.from(signature, 'base64');
      const publicKeyBytes = Buffer.from(publicKey, 'base64');
      
      return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
    } catch (err) {
      console.error('Failed to verify signature:', err);
      return false;
    }
  }, []);

  // Hash message
  const hashMessage = useCallback(async (message) => {
    try {
      const messageBytes = Buffer.from(message, 'utf8');
      const hash = await Crypto.digest('SHA-256', messageBytes);
      return Buffer.from(hash).toString('base64');
    } catch (err) {
      console.error('Failed to hash message:', err);
      throw new Error('Failed to hash message');
    }
  }, []);

  // Generate session ID
  const generateSessionId = useCallback(() => {
    return uuidv4();
  }, []);

  // Generate nonce
  const generateNonce = useCallback(() => {
    const nonce = nacl.randomBytes(24);
    return Buffer.from(nonce).toString('base64');
  }, []);

  // Get key pair for role
  const getKeyPair = useCallback((role) => {
    if (role === 'doctor') {
      return doctorKeyPair;
    } else if (role === 'patient') {
      return patientKeyPair;
    }
    return null;
  }, [doctorKeyPair, patientKeyPair]);

  // Get or create session key
  const getSessionKey = useCallback((sessionId) => {
    return sessionKeys.get(sessionId) || null;
  }, [sessionKeys]);

  // Store session key
  const storeSessionKey = useCallback(async (sessionId, key) => {
    sessionKeys.set(sessionId, key);
    await saveSessionKeys();
  }, [sessionKeys, saveSessionKeys]);

  // Remove session key
  const removeSessionKey = useCallback(async (sessionId) => {
    sessionKeys.delete(sessionId);
    await saveSessionKeys();
  }, [sessionKeys, saveSessionKeys]);

  // Encrypt data for storage
  const encryptStorageData = useCallback(async (data) => {
    if (!encryptionKey) {
      throw new Error('Encryption key not available');
    }
    
    const dataString = JSON.stringify(data);
    return encryptMessage(dataString, encryptionKey);
  }, [encryptionKey, encryptMessage]);

  // Decrypt data from storage
  const decryptStorageData = useCallback(async (encryptedData, nonce) => {
    if (!encryptionKey) {
      throw new Error('Encryption key not available');
    }
    
    const dataString = decryptMessage(encryptedData, nonce, encryptionKey);
    return JSON.parse(dataString);
  }, [encryptionKey, decryptMessage]);

  // Clear all keys
  const clearAllKeys = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(KEY_STORAGE.DOCTOR_KEY_PAIR);
      await AsyncStorage.removeItem(KEY_STORAGE.PATIENT_KEY_PAIR);
      await AsyncStorage.removeItem(KEY_STORAGE.SESSION_KEYS);
      await AsyncStorage.removeItem(KEY_STORAGE.ENCRYPTION_KEY);
      
      setDoctorKeyPair(null);
      setPatientKeyPair(null);
      setSessionKeys(new Map());
      setEncryptionKey(null);
    } catch (err) {
      console.error('Failed to clear keys:', err);
      throw err;
    }
  }, []);

  // Context value
  const contextValue = {
    // State
    doctorKeyPair,
    patientKeyPair,
    sessionKeys,
    encryptionKey,
    isLoading,
    error,
    
    // Key generation
    generateX25519KeyPair,
    generateEd25519KeyPair,
    generateSessionId,
    generateNonce,
    
    // Key management
    getKeyPair,
    getSessionKey,
    storeSessionKey,
    removeSessionKey,
    loadDoctorKeyPair,
    loadPatientKeyPair,
    clearAllKeys,
    
    // Key exchange
    deriveSharedSecret,
    deriveEncryptionKey,
    
    // Encryption
    encryptMessage,
    decryptMessage,
    encryptFile,
    decryptFile,
    encryptStorageData,
    decryptStorageData,
    
    // Signing
    signMessage,
    verifySignature,
    
    // Hashing
    hashMessage,
    
    // Constants
    KEY_TYPES,
    KEY_STORAGE
  };

  return (
    <CryptoContext.Provider value={contextValue}>
      {children}
    </CryptoContext.Provider>
  );
};

// Custom hook to use Crypto context
export const useCrypto = () => {
  const context = useContext(CryptoContext);
  
  if (!context) {
    throw new Error('useCrypto must be used within a CryptoProvider');
  }
  
  return context;
};

// Export constants
export { KEY_TYPES, KEY_STORAGE };
