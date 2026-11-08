/**
 * Unit tests for the E2E envelope validator (src/utils/e2eEnvelope.js).
 * Pure function: no database and no mocks required.
 */

const {
  validateE2EEnvelope,
  E2E_MAX_BOXES,
  E2E_MAX_BOX_CHARS,
} = require('../src/utils/e2eEnvelope');

const SENDER = 'user-1';

function validEnvelope(overrides = {}) {
  return {
    v: 1,
    alg: 'x25519-box',
    epk: 'A'.repeat(43),
    nonce: 'B'.repeat(32),
    boxes: { [SENDER]: 'C'.repeat(88) },
    ...overrides,
  };
}

describe('validateE2EEnvelope', () => {
  test('accepts a well-formed envelope', () => {
    expect(validateE2EEnvelope(validEnvelope())).toBeNull();
  });

  test('accepts multiple recipients up to the limit', () => {
    const boxes = {};
    for (let i = 0; i < E2E_MAX_BOXES; i++) boxes['user-' + i] = 'C'.repeat(88);
    expect(validateE2EEnvelope(validEnvelope({ boxes }))).toBeNull();
  });

  test('rejects non-object, null and undefined envelopes', () => {
    expect(validateE2EEnvelope('nope')).toBe('envelope must be an object');
    expect(validateE2EEnvelope(null)).toBe('envelope must be an object');
    expect(validateE2EEnvelope(undefined)).toBe('envelope must be an object');
  });

  test('rejects wrong version or algorithm', () => {
    expect(validateE2EEnvelope(validEnvelope({ v: 2 }))).toBe('envelope.v must be 1');
    expect(validateE2EEnvelope(validEnvelope({ alg: 'rsa' }))).toBe('envelope.alg must be "x25519-box"');
  });

  test('rejects malformed ephemeral public key', () => {
    expect(validateE2EEnvelope(validEnvelope({ epk: 'A'.repeat(42) }))).toMatch(/epk/);
    expect(validateE2EEnvelope(validEnvelope({ epk: 'A'.repeat(45) }))).toMatch(/epk/);
    expect(validateE2EEnvelope(validEnvelope({ epk: 123 }))).toMatch(/epk/);
  });

  test('rejects malformed nonce', () => {
    expect(validateE2EEnvelope(validEnvelope({ nonce: 'B'.repeat(31) }))).toMatch(/nonce/);
    expect(validateE2EEnvelope(validEnvelope({ nonce: 'B'.repeat(33) }))).toMatch(/nonce/);
    expect(validateE2EEnvelope(validEnvelope({ nonce: null }))).toMatch(/nonce/);
  });

  test('rejects missing, empty or oversized boxes', () => {
    expect(validateE2EEnvelope(validEnvelope({ boxes: null }))).toMatch(/boxes/);
    expect(validateE2EEnvelope(validEnvelope({ boxes: 'str' }))).toMatch(/boxes/);
    expect(validateE2EEnvelope(validEnvelope({ boxes: {} }))).toBe('envelope.boxes must not be empty');

    const tooMany = {};
    for (let i = 0; i < E2E_MAX_BOXES + 1; i++) tooMany['user-' + i] = 'C'.repeat(88);
    expect(validateE2EEnvelope(validEnvelope({ boxes: tooMany }))).toMatch(/exceeds/);

    expect(validateE2EEnvelope(validEnvelope({ boxes: { [SENDER]: '' } }))).toMatch(/32KB/);
    expect(
      validateE2EEnvelope(validEnvelope({ boxes: { [SENDER]: 'C'.repeat(E2E_MAX_BOX_CHARS + 1) } }))
    ).toMatch(/32KB/);
    expect(validateE2EEnvelope(validEnvelope({ boxes: { [SENDER]: 42 } }))).toMatch(/32KB/);
  });

  test('rejects an envelope larger than the total limit', () => {
    // 10 boxes x 32KB stays within per-box limits but exceeds the 256KB total
    const boxes = {};
    for (let i = 0; i < E2E_MAX_BOXES; i++) boxes['user-' + i] = 'C'.repeat(E2E_MAX_BOX_CHARS);
    expect(validateE2EEnvelope(validEnvelope({ boxes }))).toBe('envelope exceeds 256KB');
  });
});
