/**
 * MedChat Mobile App - useChat Hook
 * Server-first chat state and actions for patient and doctor.
 *
 * All data comes from the MedChat v2 REST API; Socket.IO is used only for
 * real-time updates (newMessage, userTyping) and degrades gracefully to
 * REST-only mode when the socket is unavailable.
 *
 * E2E ENCRYPTION
 * When every participant of the chat (including us) has a registered public
 * key, outgoing text is encrypted on-device into an 'envelope' (see
 * e2eCryptoService) and the server receives only ciphertext. Incoming
 * envelopes are decrypted locally. File and voice payloads are E2E-encrypted
 * with a random symmetric key (secretbox); the key rides inside the same
 * envelope as the message text, and only ciphertext is uploaded.
 * If ANY participant has no key yet, we
 * gracefully fall back to the legacy plaintext path so the chat never breaks.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { chatService } from '../services/chatService';
import config, { API_BASE_URL } from '../config/config';
import {
  ensureRegisteredKey,
  getChatKeys,
  encryptForRecipients,
  decryptEnvelope,
  getEnvelope,
  allParticipantsHaveKeys,
  base64ToBytes,
  bytesToBase64,
  encryptFilePayload,
  buildFileMessageContent,
  parseFileMessageContent,
} from '../services/e2eCryptoService';
import * as FileSystem from 'expo-file-system';

const getToken = async () => (await AsyncStorage.getItem('authToken')) || null;

const getUser = async () => {
  try {
    const raw = await AsyncStorage.getItem('userData');
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
};

const fullName = (u) => (u ? [u.firstName, u.lastName].filter(Boolean).join(' ') : '');

const fileUrl = (f) => (f && f.id ? `${API_BASE_URL}/api/files/${f.id}/download` : null);

const mapFile = (f) => ({
  id: f.id,
  name: f.originalFilename || f.filename || 'Файл',
  size: f.size || 0,
  type: f.mimeType || f.fileType || '',
  mimeType: f.mimeType || '',
  url: fileUrl(f),
  createdAt: f.createdAt,
});

/**
 * Map a server message to the shape ChatScreen renders:
 * { id, content, sender: 'patient'|'doctor'|'system', createdAt, status, file }
 */
const mapMessage = (msg, myUser) => {
  if (!msg) return null;

  const myId = myUser && myUser.id;
  const myRole = (myUser && myUser.role) || 'patient';

  let sender;
  if (msg.type === 'system') {
    sender = 'system';
  } else if (myId && msg.senderId === myId) {
    sender = myRole === 'doctor' ? 'doctor' : 'patient';
  } else {
    sender = myRole === 'doctor' ? 'patient' : 'doctor';
  }

  let file = null;
  if (Array.isArray(msg.files) && msg.files.length > 0) {
    file = mapFile(msg.files[0]);
  } else if (Array.isArray(msg.attachments) && msg.attachments.length > 0 && typeof msg.attachments[0] === 'object') {
    file = mapFile(msg.attachments[0]);
  }

  return {
    id: msg.id,
    chatId: msg.chatId,
    content: msg.content || '',
    sender,
    createdAt: msg.createdAt || new Date().toISOString(),
    status: msg.status || 'delivered',
    isPaid: !!msg.isPaid,
    isFree: msg.isFree !== false,
    isEncrypted: !!(msg.metadata && msg.metadata.e2e),
    file,
  };
};

/**
 * Async wrapper around mapMessage that also decrypts E2E envelopes with the
 * local private key. Messages we cannot decrypt (sent from a device whose
 * key we do not own) render as a placeholder instead of breaking the list.
 */
const mapMessageWithE2E = async (msg, myUser) => {
  const mapped = mapMessage(msg, myUser);
  if (!mapped) return null;

  const envelope = getEnvelope(msg);
  if (!envelope) return mapped;

  const myId = myUser && myUser.id;
  const plain = myId ? await decryptEnvelope(envelope, myId) : null;
  if (plain) {
    // E2E file messages carry a JSON payload { mc: 2, t: <name>, k: <key> }
    // inside the box instead of plain text (hybrid encryption) - unwrap it.
    const fileMsg = parseFileMessageContent(plain);
    if (fileMsg) {
      mapped.content = fileMsg.text || 'Файл';
      mapped.fileKey = fileMsg.fileKey; // for on-demand payload decryption
    } else {
      mapped.content = plain;
    }
  } else {
    mapped.content = '🔒 Зашифрованное сообщение';
  }
  return mapped;
};

/**
 * Map a server chat row to the shape ChatListScreen renders
 */
const mapChatListItem = (c, myUser) => {
  const isDoctor = myUser && myUser.role === 'doctor';
  // E2E messages keep no plaintext preview on the server (lastMessageText is
  // empty by design). If a chat HAS a last message but no preview text, it is
  // almost certainly an encrypted message - show a lock instead.
  const lastText = c.lastMessageText || (c.lastMessageId ? '🔒 Зашифрованное сообщение' : '');
  return {
    id: c.id,
    chatId: c.chatId,
    title: c.title || '',
    doctorName: c.doctor && c.doctor.user ? fullName(c.doctor.user) : '',
    doctorId: c.doctorId,
    clinicName: (c.clinic && c.clinic.name) || '',
    specialtyName: (c.doctor && (c.doctor.category || c.doctor.specialtyName)) || '',
    patientLogin: (c.patient && (c.patient.patientNumber || (c.patient.user && fullName(c.patient.user)))) || '',
    patientId: c.patientId,
    lastMessage: { content: lastText },
    unreadCount: isDoctor ? (c.unreadCountDoctor || 0) : (c.unreadCountPatient || 0),
    updatedAt: c.lastMessageAt || c.updatedAt,
  };
};

/**
 * Custom hook for chat functionality
 * @param {string} chatId - Current chat ID (UUID)
 */
export const useChat = (chatId) => {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [convenientTime, setConvenientTime] = useState(config.DEFAULT_CONVENIENT_TIME);
  const [doctorInfo, setDoctorInfo] = useState(null);
  const [patientInfo, setPatientInfo] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [files, setFiles] = useState([]);
  const [isTyping, setIsTyping] = useState(false);

  const messagesEndRef = useRef(null);
  const pageRef = useRef(1);
  const typingTimeoutRef = useRef(null);
  const myUserRef = useRef(null);
  const e2eRegisteredRef = useRef(false);

  // Resolve the current user from storage once
  useEffect(() => {
    let cancelled = false;
    getUser().then((u) => {
      if (!cancelled) myUserRef.current = u;
    });
    return () => { cancelled = true; };
  }, []);

  // ---- E2E: register this device's PUBLIC key once per session (idempotent) ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const u = await getUser();
        const token = await getToken();
        if (cancelled || !u || !u.id || !token) return;
        await ensureRegisteredKey(token, u.id, 'mobile');
        if (!cancelled) e2eRegisteredRef.current = true;
      } catch (e) {
        // Best-effort: without a registered key the chat falls back to
        // plaintext sending, it never breaks.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ---- REST helper ----
  const apiFetch = useCallback(async (path, options = {}) => {
    const token = await getToken();
    const headers = { ...(options.headers || {}) };
    if (token) headers.Authorization = 'Bearer ' + token;
    if (options.body && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }
    const response = await fetch(API_BASE_URL + path, { ...options, headers });
    let data = null;
    try {
      data = await response.json();
    } catch (e) {
      data = null;
    }
    return { ok: response.ok, status: response.status, data };
  }, []);

  const errText = (result, fallback) =>
    (result.data && (result.data.error || result.data.message)) || fallback;

  // ---- E2E: participant user ids of the current chat (null on failure) ----
  const getParticipantUserIds = useCallback(async () => {
    try {
      const result = await apiFetch('/api/chats/' + chatId + '/participants');
      if (!result.ok || !Array.isArray(result.data)) return null;
      return result.data.map((p) => p && p.userId).filter(Boolean);
    } catch (e) {
      return null;
    }
  }, [chatId, apiFetch]);

  /**
   * Try to build an E2E envelope for 'text':
   * - fetch participant ids and their active public keys,
   * - require EVERY participant (including us) to have a key,
   * - encrypt to all keys (so recipients + our own devices can read).
   * Returns the envelope, or null when E2E is not possible (graceful
   * fallback to the plaintext path happens in sendMessage).
   */
  const getE2ERecipientKeys = useCallback(async (myUserId) => {
    try {
      if (!myUserId || !chatId) return null;
      const token = await getToken();
      if (!token) return null;

      const participantIds = await getParticipantUserIds();
      if (!participantIds || participantIds.length === 0) return null;
      if (participantIds.indexOf(myUserId) === -1) return null; // we are not a participant (e.g. admin)

      const keys = await getChatKeys(token, chatId);
      if (!allParticipantsHaveKeys(participantIds, keys)) return null;
      if (!keys.some((k) => String(k.userId) === String(myUserId))) return null;

      return keys;
    } catch (e) {
      return null;
    }
  }, [chatId, getParticipantUserIds]);

  const buildE2EEnvelope = useCallback(async (text, myUserId) => {
    if (!text) return null;
    const keys = await getE2ERecipientKeys(myUserId);
    return keys ? encryptForRecipients(text, keys) : null;
  }, [getE2ERecipientKeys]);

  // ---- Load messages (server-first, newest first for the inverted FlatList) ----
  const loadMessages = useCallback(async (reset = true) => {
    if (!chatId) return;

    try {
      setIsLoading(true);
      setError(null);

      const page = reset ? 1 : pageRef.current;
      const result = await apiFetch(`/api/chats/${chatId}/messages?page=${page}&limit=50`);

      if (!result.ok) {
        throw new Error(errText(result, 'Не удалось загрузить сообщения'));
      }

      const myUser = myUserRef.current || (await getUser());
      const rows = (result.data && result.data.data) || [];
      const mapped = (await Promise.all(rows.map((m) => mapMessageWithE2E(m, myUser)))).filter(Boolean);

      // Server returns chronological order; the FlatList is inverted,
      // so the display array must be newest-first.
      mapped.reverse();

      setMessages((prev) => (reset ? mapped : [...prev, ...mapped]));

      const pagination = result.data && result.data.pagination;
      setHasMore(!!(pagination && Number(pagination.page) < Number(pagination.totalPages)));
      pageRef.current = reset ? 2 : page + 1;
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [chatId, apiFetch]);

  // Load more messages (pagination)
  const loadMoreMessages = useCallback(() => {
    if (!isLoading && hasMore) {
      loadMessages(false);
    }
  }, [isLoading, hasMore, loadMessages]);

  // Refresh messages
  const refreshMessages = useCallback(() => {
    pageRef.current = 1;
    loadMessages(true);
  }, [loadMessages]);

  // ---- Send a text message ----
  const sendMessage = useCallback(async (content, options = {}) => {
    if (!chatId || !content) return null;

    const myUser = myUserRef.current || (await getUser());
    const tempId = 'tmp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    const optimistic = {
      id: tempId,
      chatId,
      // For E2E file messages 'content' is a JSON payload - show the human
      // name optimistically instead.
      content: options.optimisticContent || content,
      sender: (myUser && myUser.role) === 'doctor' ? 'doctor' : 'patient',
      createdAt: new Date().toISOString(),
      status: 'sending',
      file: options.file || null,
    };

    setMessages((prev) => [optimistic, ...prev]);
    setIsSending(true);

    try {
      const body = {
        type: options.type || 'text',
        clientType: 'mobile',
        clientVersion: config.APP_VERSION,
      };
      if (options.attachments) body.attachments = options.attachments;
      if (options.paymentTransactionId) body.paymentTransactionId = options.paymentTransactionId;

      // E2E: when every participant has a key, encrypt on-device and send
      // only the ciphertext envelope (content stays empty for the server).
      // If any participant has no key yet, fall back to plaintext so the
      // chat keeps working - security degrades, availability does not.
      const envelope = await buildE2EEnvelope(content, myUser && myUser.id);
      if (envelope) {
        body.envelope = envelope;
        body.content = '';
      } else {
        body.content = content;
      }

      const result = await apiFetch(`/api/chats/${chatId}/messages`, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      if (!result.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        if (result.status === 402) {
          throw new Error('Недостаточно средств на тестовом балансе для платного сообщения');
        }
        throw new Error(errText(result, 'Ошибка отправки сообщения'));
      }

      const mapped = await mapMessageWithE2E(result.data, myUser);
      // The server stores no plaintext for E2E messages; for our own message
      // we already know the text, so restore it locally after mapping.
      const finalMessage = mapped || { ...optimistic, status: 'delivered' };
      if (envelope) finalMessage.content = options.optimisticContent || content;
      finalMessage.status = 'delivered';
      setMessages((prev) => prev.map((m) => (m.id === tempId ? finalMessage : m)));
      return finalMessage;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setIsSending(false);
    }
  }, [chatId, apiFetch, buildE2EEnvelope]);

  // ---- Chat info ----
  const loadChatInfo = useCallback(async () => {
    if (!chatId) return;

    try {
      const result = await apiFetch(`/api/chats/${chatId}`);
      if (!result.ok) return;

      const chat = result.data || {};
      const doctor = chat.doctor || {};
      const doctorUser = doctor.user || {};
      const patient = chat.patient || {};
      const patientUser = patient.user || {};

      setDoctorInfo({
        id: doctor.id,
        firstName: doctorUser.firstName || '',
        lastName: doctorUser.lastName || '',
        fullName: fullName(doctorUser),
        specialtyName: doctor.category || doctor.specialtyName || '',
        category: doctor.category || '',
        clinicName: (chat.clinic && chat.clinic.name) || '',
        convenientResponseTime: doctor.convenientResponseTime || '',
      });

      setPatientInfo({
        id: patient.id,
        login: patient.patientNumber || fullName(patientUser),
        fullName: fullName(patientUser),
      });

      setConvenientTime(doctor.convenientResponseTime || config.DEFAULT_CONVENIENT_TIME);
    } catch (err) {
      console.warn('loadChatInfo:', err.message);
    }
  }, [chatId, apiFetch]);

  // ---- Files of the chat ----
  const loadFiles = useCallback(async () => {
    if (!chatId) return;

    try {
      const result = await apiFetch(`/api/files?chatId=${chatId}&limit=100`);
      if (result.ok && result.data && Array.isArray(result.data.data)) {
        setFiles(result.data.data.map(mapFile));
      } else {
        setFiles([]);
      }
    } catch (err) {
      console.warn('loadFiles:', err.message);
    }
  }, [chatId, apiFetch]);

  // ---- Send a file / voice message (upload then message) ----
  // E2E: when every participant has a key, the payload is encrypted
  // on-device with a random secretbox key; only ciphertext is uploaded
  // (wire = nonce || ciphertext), and the key rides inside the message
  // envelope via buildFileMessageContent. If any participant has no key,
  // fall back to the legacy plaintext upload so the chat never breaks.
  const sendFile = useCallback(async (file) => {
    if (!chatId || !file) return null;

    setIsSending(true);
    let wireUri = null;
    try {
      const token = await getToken();
      const myUser = myUserRef.current || (await getUser());
      const myId = myUser && myUser.id;

      let uploadArg = file;
      let contentOverride = null;

      if (myId && file.uri) {
        const keys = await getE2ERecipientKeys(myId);
        if (keys) {
          // Read the payload fully in memory (fine for voice notes and
          // documents), encrypt, then stage the ciphertext as a temp file
          // for the multipart upload (FormData needs a file URI).
          const payloadB64 = await FileSystem.readAsStringAsync(file.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          const enc = encryptFilePayload(base64ToBytes(payloadB64));
          if (enc && enc.wire && enc.fileKey) {
            wireUri = `${FileSystem.cacheDirectory}e2e-${Date.now()}.bin`;
            await FileSystem.writeAsStringAsync(wireUri, bytesToBase64(enc.wire), {
              encoding: FileSystem.EncodingType.Base64,
            });
            uploadArg = {
              uri: wireUri,
              name: 'payload.bin',
              type: 'application/octet-stream',
            };
            contentOverride = buildFileMessageContent(file.name || 'Файл', enc.fileKey);
          }
        }
      }

      const upload = await chatService.uploadFile(token, chatId, uploadArg);

      if (!upload || upload.success === false) {
        throw new Error((upload && upload.message) || 'Ошибка загрузки файла');
      }

      const record = upload.id ? upload : (upload.data || upload.file);
      if (!record || !record.id) {
        throw new Error('Ошибка загрузки файла');
      }

      const isAudio = String(file.type || '').indexOf('audio') === 0;

      // The message content (for E2E: the JSON with the file name + key) is
      // encrypted by sendMessage into the envelope; the optimistic bubble
      // shows the human-readable file name instead.
      const message = await sendMessage(contentOverride || file.name || 'Файл', {
        type: isAudio ? 'audio' : 'file',
        attachments: [record.id],
        optimisticContent: file.name || 'Файл',
        file: {
          id: record.id,
          name: file.name || 'Файл',
          size: file.size || 0,
          type: file.type || '',
          url: `${API_BASE_URL}/api/files/${record.id}/download`,
        },
      });

      // Refresh the files panel
      loadFiles();
      return message;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      if (wireUri) {
        FileSystem.deleteAsync(wireUri, { idempotent: true }).catch(() => {});
      }
      setIsSending(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, sendMessage, loadFiles, getE2ERecipientKeys]);

  // ---- Mark messages as read ----
  const markMessagesAsRead = useCallback(async () => {
    if (!chatId) return;

    try {
      await apiFetch(`/api/chats/${chatId}/read`, { method: 'POST', body: JSON.stringify({}) });
      setUnreadCount(0);
    } catch (err) {
      console.warn('markMessagesAsRead:', err.message);
    }
  }, [chatId, apiFetch]);

  // ---- Typing indicator ----
  const setTypingStatus = useCallback(async (typing) => {
    if (!chatId) return;
    try {
      const socket = await chatService.connectWebSocket(await getToken());
      socket.emit('typing', { chatId, isTyping: !!typing });
    } catch (err) {
      // Socket unavailable: typing indicators are best-effort only
    }
  }, [chatId]);

  // ---- Chat list ----
  const getChatList = useCallback(async () => {
    try {
      const myUser = myUserRef.current || (await getUser());
      const result = await apiFetch('/api/chats?page=1&limit=100');
      if (!result.ok) {
        throw new Error(errText(result, 'Не удалось загрузить чаты'));
      }
      const rows = (result.data && result.data.data) || [];
      return rows.map((c) => mapChatListItem(c, myUser));
    } catch (err) {
      setError(err.message);
      return [];
    }
  }, [apiFetch]);

  // ---- Search (client-side filter over the server chat list) ----
  const searchChats = useCallback(async (query) => {
    const chats = await getChatList();
    if (!query || !query.trim()) return chats;

    const q = query.trim().toLowerCase();
    return chats.filter((chat) =>
      (chat.title && chat.title.toLowerCase().includes(q)) ||
      (chat.doctorName && chat.doctorName.toLowerCase().includes(q)) ||
      (chat.clinicName && chat.clinicName.toLowerCase().includes(q)) ||
      (chat.specialtyName && chat.specialtyName.toLowerCase().includes(q)) ||
      (chat.patientLogin && chat.patientLogin.toLowerCase().includes(q))
    );
  }, [getChatList]);

  // ---- Unread count for a chat ----
  const getUnreadCount = useCallback(async (targetId) => {
    try {
      const list = await getChatList();
      const chat = list.find((c) => c.id === targetId || c.chatId === targetId);
      return chat ? chat.unreadCount || 0 : 0;
    } catch (err) {
      return 0;
    }
  }, [getChatList]);

  // ---- Create chat (patient side, after scanning a doctor QR) ----
  const createChat = useCallback(async (doctorId, clinicId, patientLogin) => {
    try {
      const myUser = myUserRef.current || (await getUser());
      const patientId = (myUser && myUser.patientProfile && myUser.patientProfile.id) || null;

      const body = {
        doctorId,
        patientId,
        createdBy: 'patient',
      };
      if (clinicId) body.clinicId = clinicId;

      const result = await apiFetch('/api/chats', { method: 'POST', body: JSON.stringify(body) });
      if (!result.ok) {
        throw new Error(errText(result, 'Не удалось создать чат'));
      }
      const myUser2 = myUserRef.current || myUser;
      return mapChatListItem(result.data, myUser2);
    } catch (err) {
      setError(err.message);
      return null;
    }
  }, [apiFetch]);

  // ---- Join chat via QR code ----
  const joinChatViaQR = useCallback(async (qrData) => {
    try {
      let payload = null;
      try {
        payload = typeof qrData === 'string' ? JSON.parse(qrData) : qrData;
      } catch (e) {
        payload = null;
      }

      // Case 1: QR contains the human-readable chatId
      if (typeof qrData === 'string' && !payload) {
        const token = await getToken();
        const result = await chatService.joinChatViaQR(token, qrData);
        if (result && result.id) {
          return { success: true, chatId: result.id, chat: result };
        }
      }

      // Case 2: QR contains doctor info (patient starts a new chat)
      if (payload && (payload.type === 'medchat_doctor' || payload.doctorId)) {
        const chat = await createChat(payload.doctorId, payload.clinicId, '');
        if (chat) {
          return { success: true, chatId: chat.id, chat };
        }
        throw new Error('Ошибка создания чата');
      }

      throw new Error('Неверный QR код');
    } catch (err) {
      setError(err.message);
      return { success: false, message: err.message };
    }
  }, [createChat]);

  // ---- Clear error ----
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // ---- Initialize when chatId changes ----
  useEffect(() => {
    if (chatId) {
      pageRef.current = 1;
      loadMessages(true);
      loadChatInfo();
      loadFiles();
      markMessagesAsRead();
    } else {
      setMessages([]);
      setDoctorInfo(null);
      setPatientInfo(null);
      setFiles([]);
    }
  }, [chatId, loadMessages, loadChatInfo, loadFiles, markMessagesAsRead]);

  // ---- Real-time updates over Socket.IO ----
  useEffect(() => {
    if (!chatId) return undefined;

    let disposed = false;
    let socket = null;
    let joinHandler = null;

    const handleNewMessage = async (msg) => {
      if (!msg) return;
      if (msg.chatId && msg.chatId !== chatId) return;

      const myUser = myUserRef.current;
      // Own messages are already added optimistically by sendMessage
      if (myUser && msg.senderId === myUser.id) return;

      const mapped = await mapMessageWithE2E(msg, myUser);
      if (!mapped || disposed) return;

      setMessages((prev) => (prev.some((m) => m.id === mapped.id) ? prev : [mapped, ...prev]));
      markMessagesAsRead();
    };

    const handleUserTyping = (data) => {
      if (!data) return;
      if (data.chatId && data.chatId !== chatId) return;

      const myUser = myUserRef.current;
      if (myUser && data.userId === myUser.id) return;

      setIsTyping(!!data.isTyping);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (data.isTyping) {
        typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 4000);
      }
    };

    (async () => {
      try {
        socket = await chatService.connectWebSocket(await getToken());
        if (disposed) return;

        socket.on('newMessage', handleNewMessage);
        socket.on('userTyping', handleUserTyping);

        // (Re)join the chat room; server verifies membership in the DB
        joinHandler = () => {
          socket.emit('joinChat', chatId, (resp) => {
            if (resp && resp.error) {
              console.warn('joinChat:', resp.error);
            }
          });
        };
        joinHandler();
        socket.on('connect', joinHandler);
      } catch (err) {
        // REST-only mode: messages still work, just without live updates
        console.warn('WebSocket unavailable, REST-only mode:', err.message);
      }
    })();

    return () => {
      disposed = true;
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (socket) {
        if (joinHandler) {
          socket.off('connect', joinHandler);
        }
        socket.off('newMessage', handleNewMessage);
        socket.off('userTyping', handleUserTyping);
        try {
          socket.emit('leaveChat', chatId);
        } catch (e) {
          // ignore
        }
      }
    };
  }, [chatId, markMessagesAsRead]);

  return {
    // State
    messages,
    isLoading,
    error,
    hasMore,
    isSending,
    convenientTime,
    doctorInfo,
    patientInfo,
    unreadCount,
    files,
    isTyping,
    messagesEndRef,

    // Actions
    loadMessages,
    loadMoreMessages,
    refreshMessages,
    sendMessage,
    sendFile,
    loadChatInfo,
    loadFiles,
    markMessagesAsRead,
    setTypingStatus,
    getChatList,
    createChat,
    joinChatViaQR,
    searchChats,
    getUnreadCount,
    clearError,
  };
};

export default useChat;
