/**
 * E2E Key Routes
 * Public key registry for end-to-end encrypted messages.
 */

const express = require('express');
const router = express.Router();
const KeyController = require('../controllers/keysController');
const { validate } = require('../middleware/validation');
const { authenticate } = require('../middleware/auth');
const { registerKeySchema } = require('../validators/key');

// All key routes require authentication
router.use(authenticate());

/**
 * @swagger
 * /api/keys:
 *   post:
 *     summary: Register or rotate the caller's E2E public key (device keyId)
 *     tags: [E2E Keys]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [keyId, publicKey]
 *             properties:
 *               keyId:
 *                 type: string
 *                 maxLength: 64
 *                 description: Stable device/installation label
 *               publicKey:
 *                 type: string
 *                 description: Base64-encoded 32-byte X25519 public key
 *               algorithm:
 *                 type: string
 *                 enum: [x25519-box]
 *               deviceName:
 *                 type: string
 *     responses:
 *       201:
 *         description: Key registered
 *       200:
 *         description: Existing key rotated
 */
router.post('/', validate(registerKeySchema), KeyController.registerKey);

/**
 * @swagger
 * /api/keys:
 *   get:
 *     summary: List the caller's own registered keys
 *     tags: [E2E Keys]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of keys
 */
router.get('/', KeyController.listMyKeys);

/**
 * @swagger
 * /api/keys/{keyId}:
 *   delete:
 *     summary: Deactivate one of the caller's keys (device lost/replaced)
 *     tags: [E2E Keys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: keyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Key deactivated
 */
router.delete('/:keyId', KeyController.deactivateKey);

module.exports = router;
