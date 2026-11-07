/**
 * Unit tests for server crypto service (X25519 + XChaCha20-Poly1305)
 */
const CryptoService = require('../src/services/cryptoService');

describe('CryptoService', () => {
  test('generates a valid X25519 key pair', () => {
    const pair = CryptoService.generateX25519KeyPair();
    expect(pair.publicKey).toBeDefined();
    expect(pair.privateKey).toBeDefined();
    // X25519 keys are 32 bytes -> 44 base64 chars
    expect(Buffer.from(pair.publicKey, 'base64')).toHaveLength(32);
    expect(Buffer.from(pair.privateKey, 'base64')).toHaveLength(32);
  });

  test('both sides derive the same shared secret (ECDH)', () => {
    const alice = CryptoService.generateX25519KeyPair();
    const bob = CryptoService.generateX25519KeyPair();

    const secretAB = CryptoService.deriveSharedSecret(alice.privateKey, bob.publicKey);
    const secretBA = CryptoService.deriveSharedSecret(bob.privateKey, alice.publicKey);

    expect(secretAB.equals(secretBA)).toBe(true);
    expect(secretAB).toHaveLength(32);
  });

  test('encrypts and decrypts a message', () => {
    const key = CryptoService.generateRandomBytes(32);
    const message = 'Примите лекарство в 14:00';
    const encrypted = CryptoService.encryptMessage(message, key);

    expect(encrypted.ciphertext).toBeDefined();
    expect(encrypted.nonce).toBeDefined();
    expect(Buffer.from(encrypted.nonce, 'base64')).toHaveLength(24);

    const decrypted = CryptoService.decryptMessage(encrypted, key);
    expect(decrypted).toBe(message);
  });

  test('rejects decryption with a wrong key', () => {
    const key = CryptoService.generateRandomBytes(32);
    const wrongKey = CryptoService.generateRandomBytes(32);
    const encrypted = CryptoService.encryptMessage('secret', key);

    expect(() => CryptoService.decryptMessage(encrypted, wrongKey)).toThrow();
  });

  test('encrypts and decrypts objects (JSON)', () => {
    const key = CryptoService.generateRandomBytes(32);
    const obj = { chatId: 'abc', content: 'анализы готовы', paid: true };
    const encrypted = CryptoService.encryptObject(obj, key);
    const decrypted = CryptoService.decryptObject(encrypted, key);
    expect(decrypted).toEqual(obj);
  });

  test('encrypts and decrypts file buffers', () => {
    const key = CryptoService.generateRandomBytes(32);
    const data = Buffer.from('binary-file-content');
    const encrypted = CryptoService.encryptFile(data, key);
    const decrypted = CryptoService.decryptFile(encrypted, key);
    expect(decrypted.equals(data)).toBe(true);
  });

  test('hash functions are deterministic', () => {
    expect(CryptoService.hashSHA256('medchat')).toBe(CryptoService.hashSHA256('medchat'));
    expect(CryptoService.hashSHA256('medchat')).toHaveLength(64);
    expect(CryptoService.hashSHA256('a')).not.toBe(CryptoService.hashSHA256('b'));
  });

  test('HMAC verify works and rejects tampering', () => {
    const key = 'super-secret-key';
    const signature = CryptoService.generateHMAC('payload', key);
    expect(CryptoService.verifyHMAC('payload', signature, key)).toBe(true);
    expect(CryptoService.verifyHMAC('payload2', signature, key)).toBe(false);
  });
});
