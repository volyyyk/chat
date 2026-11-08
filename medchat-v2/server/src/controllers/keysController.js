/**
 * E2E Key Controller
 * Manages the PUBLIC key registry for end-to-end encrypted messages.
 *
 * Security model:
 * - Clients generate an X25519 key pair ON DEVICE. Only the public key is
 *   uploaded here; the private key stays in the device secure storage.
 * - Senders encrypt message content to each recipient's public key
 *   (ephemeral sender key + nacl.box), so the server only ever sees
 *   ciphertext for E2E messages.
 * - Chat participant keys are only served to users who can access that chat
 *   (canAccessChat), which prevents key harvesting by arbitrary users.
 */

const models = require('../models');
const { AppError } = require('../middleware/errorHandler');
const { canAccessChat } = require('../utils/chatAccess');

class KeyController {
  /**
   * Register (or rotate) the caller's public key for a logical device keyId.
   * POST /api/keys
   */
  static async registerKey(req, res, next) {
    try {
      const { keyId, publicKey, algorithm = 'x25519-box', deviceName } = req.body;

      // Sanity: the value must decode to a 32-byte X25519 public key
      const raw = Buffer.from(publicKey, 'base64');
      if (raw.length !== 32) {
        throw new AppError(
          'publicKey must be a base64-encoded 32-byte X25519 key',
          400,
          'VALIDATION_ERROR'
        );
      }

      // Upsert by (userId, keyId): re-registering the same device rotates the key
      const [key, created] = await models.UserKey.findOrCreate({
        where: { userId: req.user.id, keyId },
        defaults: {
          userId: req.user.id,
          keyId,
          publicKey,
          algorithm,
          deviceName: deviceName || null,
          isActive: true,
          lastSeenAt: new Date(),
        },
      });

      if (!created) {
        await key.update({
          publicKey,
          algorithm,
          deviceName: deviceName || key.deviceName,
          isActive: true,
          lastSeenAt: new Date(),
        });
      }

      res.status(created ? 201 : 200).json({
        data: {
          id: key.id,
          userId: key.userId,
          keyId: key.keyId,
          publicKey: key.publicKey,
          algorithm: key.algorithm,
          createdAt: key.createdAt,
          rotated: !created,
        },
        message: created
          ? 'Public key registered'
          : 'Public key rotated',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * List the caller's own registered keys.
   * GET /api/keys
   */
  static async listMyKeys(req, res, next) {
    try {
      const keys = await models.UserKey.findAll({
        where: { userId: req.user.id },
        order: [['createdAt', 'ASC']],
      });
      res.json({ data: keys });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Deactivate one of the caller's keys (device lost / replaced).
   * DELETE /api/keys/:keyId
   */
  static async deactivateKey(req, res, next) {
    try {
      const { keyId } = req.params;
      const key = await models.UserKey.findOne({
        where: { userId: req.user.id, keyId },
      });
      if (!key) {
        throw new AppError('Key not found', 404, 'NOT_FOUND');
      }
      await key.update({ isActive: false });
      res.json({ message: 'Key deactivated' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Public keys of all participants of a chat (active devices only).
   * GET /api/chats/:id/keys
   *
   * Access is restricted to users who can access the chat; without this check
   * the registry would let any authenticated user harvest everyone's keys
   * (public keys are not secret per se, but the directory should not leak
   * who talks to whom).
   */
  static async getChatKeys(req, res, next) {
    try {
      const { id } = req.params;

      const chat = await models.Chat.findByPk(id);
      if (!chat) {
        throw new AppError('Chat not found', 404, 'NOT_FOUND');
      }

      const allowed = await canAccessChat(req.user, chat);
      if (!allowed) {
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
      }

      // Collect participant user ids: explicit participants first,
      // plus doctor/patient profile owners as a fallback.
      const userIds = new Set([req.user.id]);
      const participants = await models.ChatParticipant.findAll({
        where: { chatId: id },
        attributes: ['userId'],
      });
      participants.forEach((p) => userIds.add(p.userId));

      if (chat.doctorId) {
        const doctor = await models.Doctor.findByPk(chat.doctorId, { attributes: ['userId'] });
        if (doctor) userIds.add(doctor.userId);
      }
      if (chat.patientId) {
        const patient = await models.Patient.findByPk(chat.patientId, { attributes: ['userId'] });
        if (patient) userIds.add(patient.userId);
      }

      const keys = await models.UserKey.findAll({
        where: {
          userId: Array.from(userIds),
          isActive: true,
        },
        attributes: ['userId', 'keyId', 'publicKey', 'algorithm', 'deviceName', 'lastSeenAt'],
        order: [['createdAt', 'ASC']],
      });

      res.json({ data: keys });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = KeyController;
