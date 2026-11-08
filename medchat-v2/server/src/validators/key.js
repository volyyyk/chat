/**
 * E2E Key Validators
 */

const Joi = require('joi');

// Base64 string of exactly 32 bytes (X25519 public key)
const base64PublicKey = Joi.string()
  .base64({ paddingRequired: false })
  .min(43)
  .max(44)
  .required();

const registerKeySchema = Joi.object({
  keyId: Joi.string().min(8).max(64).required(),
  publicKey: base64PublicKey,
  algorithm: Joi.string().valid('x25519-box').default('x25519-box'),
  deviceName: Joi.string().max(100).optional().allow(null, ''),
});

module.exports = {
  registerKeySchema,
};
