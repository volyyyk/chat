/**
 * E2E envelope validation utilities.
 *
 * The E2E envelope contains ONLY ciphertext (see docs/readme_for_AI.md,
 * "E2E contract"): { v: 1, alg: 'x25519-box', epk, nonce, boxes: { userId: base64 } }.
 * The server acts as a dumb relay for these blobs and must never see plaintext.
 */

// E2E envelope sanity limits (defensive; clients send far less)
const E2E_MAX_BOXES = 10;
const E2E_MAX_BOX_CHARS = 32 * 1024; // per-recipient ciphertext
const E2E_MAX_ENVELOPE_CHARS = 256 * 1024;

/**
 * Validate an E2E envelope.
 * @param {*} envelope
 * @returns {string|null} error message, or null when the envelope is valid
 */
function validateE2EEnvelope(envelope) {
  if (typeof envelope !== 'object' || envelope === null) return 'envelope must be an object';
  if (envelope.v !== 1) return 'envelope.v must be 1';
  if (envelope.alg !== 'x25519-box') return 'envelope.alg must be "x25519-box"';
  if (typeof envelope.epk !== 'string' || envelope.epk.length < 43 || envelope.epk.length > 44) {
    return 'envelope.epk must be a base64 X25519 ephemeral public key';
  }
  if (typeof envelope.nonce !== 'string' || envelope.nonce.length !== 32) {
    return 'envelope.nonce must be a base64 24-byte nonce';
  }
  if (typeof envelope.boxes !== 'object' || envelope.boxes === null) {
    return 'envelope.boxes must be an object { userId: base64 ciphertext }';
  }
  const userIds = Object.keys(envelope.boxes);
  if (userIds.length === 0) return 'envelope.boxes must not be empty';
  if (userIds.length > E2E_MAX_BOXES) return 'envelope.boxes exceeds ' + E2E_MAX_BOXES + ' recipients';
  for (const uid of userIds) {
    const ct = envelope.boxes[uid];
    if (typeof ct !== 'string' || ct.length === 0 || ct.length > E2E_MAX_BOX_CHARS) {
      return 'envelope.boxes[' + uid + '] must be a non-empty base64 string up to 32KB';
    }
  }
  if (JSON.stringify(envelope).length > E2E_MAX_ENVELOPE_CHARS) {
    return 'envelope exceeds 256KB';
  }
  return null;
}

module.exports = {
  validateE2EEnvelope,
  E2E_MAX_BOXES,
  E2E_MAX_BOX_CHARS,
  E2E_MAX_ENVELOPE_CHARS,
};
