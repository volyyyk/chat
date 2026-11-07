/**
 * Chat access helpers
 * Shared authorization logic for chats, used by chat and message controllers.
 */

const { Op } = require('sequelize');
const models = require('../models');

/**
 * Check whether a user may access a chat.
 * Allowed: system admin, explicit participant (ChatParticipant),
 * the chat's doctor (by Doctor profile), the chat's patient (by Patient profile),
 * or the clinic admin of the chat's clinic.
 *
 * @param {Object} user - req.user (id, role, doctorId, patientId, clinicId)
 * @param {Object} chat - Chat instance (needs id, doctorId, patientId, clinicId)
 * @returns {Promise<boolean>}
 */
async function canAccessChat(user, chat) {
  if (!user || !chat) return false;
  if (user.role === 'system_admin') return true;

  const participant = await models.ChatParticipant.findOne({
    where: { chatId: chat.id, userId: user.id },
  });
  if (participant) return true;

  if (user.role === 'doctor' && user.doctorId && chat.doctorId === user.doctorId) return true;
  if (user.role === 'patient' && user.patientId && chat.patientId === user.patientId) return true;
  if (user.role === 'clinic_admin' && user.clinicId && chat.clinicId === user.clinicId) return true;

  return false;
}

/**
 * Get all chat ids the user can access (participants + doctor/patient/clinic chats).
 * @param {Object} user - req.user
 * @returns {Promise<string[]>}
 */
async function getAccessibleChatIds(user) {
  if (!user) return [];

  const participantChats = await models.ChatParticipant.findAll({
    where: { userId: user.id },
    attributes: ['chatId'],
  });
  const ids = new Set(participantChats.map((p) => p.chatId));

  const or = [];
  if (user.doctorId) or.push({ doctorId: user.doctorId });
  if (user.patientId) or.push({ patientId: user.patientId });
  if (user.role === 'clinic_admin' && user.clinicId) or.push({ clinicId: user.clinicId });

  if (or.length > 0) {
    const chats = await models.Chat.findAll({
      where: { [Op.or]: or },
      attributes: ['id'],
    });
    chats.forEach((c) => ids.add(c.id));
  }

  return Array.from(ids);
}

module.exports = { canAccessChat, getAccessibleChatIds };
