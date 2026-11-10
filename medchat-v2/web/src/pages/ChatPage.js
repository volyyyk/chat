/**
 * Chat with a patient: real-time via Socket.IO, convenience time note.
 * E2E-конверты x25519-box (этап 7): шифрование и расшифровка на устройстве
 * (tweetnacl, services/e2eCrypto.js), honest plaintext-fallback при неполном
 * покрытии ключами — чат никогда не ломается. Ratchet/mc:2-payload — честные
 * плашки (веб ratchet-сессию не держит, как RN-мобилка).
 * Длинные чаты: обратная курсор-пагинация (?limit=50&before=<ISO createdAt>
 * самого старого загруженного; сервер отдаёт хронологию, total в pagination —
 * под выборкой курсора) + окно рендера RENDER_CAP: в DOM не больше окна
 * сообщений. «Показать более старые» сначала сдвигает окно по уже
 * загруженным, затем подгружает страницу с сервера (scroll-anchoring по
 * высоте контейнера — прокрутка не сбивается); «К последним» возвращается
 * вниз. Автоскролл на новое сообщение — только если пользователь был у
 * нижнего края.
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { io } from "socket.io-client";
import { WS_URL } from "../config";
import { api, getToken } from "../services/api";
import { useAuth } from "../context/AuthContext";
import {
  ensureRegisteredKey,
  encryptForRecipients,
  decryptEnvelope,
  getEnvelope,
  parseFileMessageContent,
  isRatchetPayload,
} from "../services/e2eCrypto";

const PAGE_SIZE = 50;
const RENDER_CAP = 300;

// Участники чата (зеркало desktop ui/index.html): doctor/patient -> userId.
function chatParticipants(chat) {
  const ids = [];
  if (chat && chat.doctor) ids.push(chat.doctor.userId || (chat.doctor.user && chat.doctor.user.id));
  if (chat && chat.patient) ids.push(chat.patient.userId || (chat.patient.user && chat.patient.user.id));
  return ids.filter(Boolean).map(String);
}

function uniqueIds(list) {
  return [...new Set((list || []).map(String))];
}

// Самый свежий активный ключ каждого участника (реестр отсортирован ASC).
function latestKeysPerUser(keys) {
  const latest = {};
  (keys || []).forEach((k) => {
    latest[String(k.userId)] = k;
  });
  return latest;
}

// Отображаемый текст: E2E-конверт расшифровывается на устройстве;
// ratchet/mc:2 — честные плашки; ошибка расшифровки — честная плашка.
async function decorateMessage(m, myUserId) {
  const env = getEnvelope(m);
  if (!env) {
    return { ...m, displayText: m.content || "", e2e: false };
  }
  let plain = null;
  try {
    plain = await decryptEnvelope(env, myUserId);
  } catch (e) {
    plain = null;
  }
  let displayText = "🔒 Зашифрованное сообщение";
  if (plain !== null && typeof plain === "string" && plain !== "") {
    if (isRatchetPayload(plain)) {
      displayText = "🔒 Double Ratchet-сообщение: расшифровка доступна в desktop, iOS или Android-клиенте";
    } else {
      const file = parseFileMessageContent(plain);
      if (file) {
        displayText = "📎 " + file.text + " (файл внутри E2E)";
      } else {
        displayText = plain;
      }
    }
  }
  return { ...m, displayText, e2e: true };
}

const ChatPage = () => {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [chat, setChat] = useState(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [chatKeys, setChatKeys] = useState([]);
  const [chatE2e, setChatE2e] = useState(false);
  // Длинные чаты: сколько ещё старых осталось на сервере и где окно рендера.
  const [remainingOlder, setRemainingOlder] = useState(0);
  const [viewStart, setViewStart] = useState(0);
  const [loadingOlder, setLoadingOlder] = useState(false);
  // Пометки врача о госте + слияние с предыдущим чатом пациента.
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeList, setMergeList] = useState([]);
  const [mergeBusy, setMergeBusy] = useState(false);
  const [mergeError, setMergeError] = useState("");
  const bottomRef = useRef(null);
  const containerRef = useRef(null);
  const socketRef = useRef(null);
  const anchorRef = useRef(null);
  const scrollBottomRef = useRef(true);

  const loadChat = useCallback(async () => {
    try {
      const data = await api.get("/api/chats/" + chatId);
      const chatData = data.data || data;
      setChat(chatData);

      // Ключи чата + решение, возможен ли E2E (зеркало desktop): у КАЖДОГО
      // участника (включая отправителя) должен быть активный ключ.
      let e2e = false;
      let keys = [];
      if (user && user.id) {
        try {
          const resp = await api.get("/api/chats/" + chatId + "/keys");
          keys = (resp && resp.data) || [];
        } catch (e) {
          keys = [];
        }
        const participants = uniqueIds(chatParticipants(chatData).concat([user.id]));
        const latest = latestKeysPerUser(keys);
        e2e = participants.every((uid) => latest[uid] && latest[uid].publicKey);
      }
      setChatKeys(keys);
      setChatE2e(e2e);

      // Последняя страница истории (сервер отдаёт хронологию). Раньше здесь
      // был лишний .reverse() — сообщения рисовались новыми сверху.
      const msgs = await api.get("/api/chats/" + chatId + "/messages?limit=" + PAGE_SIZE);
      let list = msgs.data || [];
      if (user && user.id) {
        list = await Promise.all(list.map((m) => decorateMessage(m, user.id)));
      }
      setMessages(list);
      setRemainingOlder(Math.max(0, ((msgs.pagination && msgs.pagination.total) || list.length) - list.length));
      setViewStart(Math.max(0, list.length - RENDER_CAP));
      scrollBottomRef.current = true;
    } catch (err) {
      setError(err.message);
    }
  }, [chatId, user]);

  // Подгрузить старшую страницу с сервера (курсор — createdAt самого
  // старого загруженного). Препенд + окно, позиция прокрутки — якорем.
  const loadOlder = useCallback(async () => {
    if (loadingOlder) return;
    const oldest = messages.length ? messages[0].createdAt : null;
    if (!oldest || remainingOlder <= 0) return;
    setLoadingOlder(true);
    try {
      const msgs = await api.get(
        "/api/chats/" + chatId + "/messages?limit=" + PAGE_SIZE + "&before=" + encodeURIComponent(oldest)
      );
      let older = msgs.data || [];
      if (older.length && user && user.id) {
        older = await Promise.all(older.map((m) => decorateMessage(m, user.id)));
      }
      if (older.length) {
        const el = containerRef.current;
        anchorRef.current = el ? { top: el.scrollTop, height: el.scrollHeight } : null;
        setMessages((prev) => [...older, ...prev]);
        setViewStart((vs) => Math.max(0, vs + older.length - RENDER_CAP));
      }
      setRemainingOlder(Math.max(0, ((msgs.pagination && msgs.pagination.total) || 0) - older.length));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingOlder(false);
    }
  }, [chatId, user, messages, remainingOlder, loadingOlder]);

  // «Показать более старые»: сначала окно по уже загруженным (без сети),
  // затем — страница с сервера.
  const showOlder = () => {
    if (viewStart > 0) {
      const el = containerRef.current;
      anchorRef.current = el ? { top: el.scrollTop, height: el.scrollHeight } : null;
      setViewStart((vs) => Math.max(0, vs - RENDER_CAP));
    } else {
      loadOlder();
    }
  };

  const toLatest = () => {
    setViewStart(Math.max(0, messages.length - RENDER_CAP));
    scrollBottomRef.current = true;
  };

  useEffect(() => {
    // Ключ устройства + регистрация публичного ключа (best-effort, upsert).
    if (user && user.id) {
      ensureRegisteredKey(user.id).catch(() => {});
    }

    loadChat();

    const socket = io(WS_URL, { auth: { token: getToken() } });
    socketRef.current = socket;
    socket.emit("joinChat", chatId);
    socket.on("newMessage", async (message) => {
      const m = user && user.id ? await decorateMessage(message, user.id) : message;
      // Автоскролл только если пользователь у нижнего края окна.
      const el = containerRef.current;
      if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 160) {
        scrollBottomRef.current = true;
      }
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
    });
    socket.on("messageRead", () => loadChat());

    return () => {
      socket.emit("leaveChat", chatId);
      socket.disconnect();
    };
  }, [chatId, loadChat, user]);

  // Якорь прокрутки после препенда старших/сдвига окна: контент вырос
  // сверху — компенсируем разницей высот, позиция чтения сохраняется.
  useEffect(() => {
    const el = containerRef.current;
    if (el && anchorRef.current) {
      el.scrollTop = anchorRef.current.top + (el.scrollHeight - anchorRef.current.height);
      anchorRef.current = null;
    }
  }, [messages, viewStart]);

  // Автоскролл вниз: только начальная загрузка, «К последним», отправка
  // или новое сообщение у нижнего края — не во время чтения истории.
  useEffect(() => {
    if (scrollBottomRef.current) {
      bottomRef.current && bottomRef.current.scrollIntoView({ behavior: "smooth" });
      scrollBottomRef.current = false;
    }
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    try {
      let body = { content: text.trim(), type: "text" };
      // E2E при полном покрытии ключами; иначе honest plaintext-fallback.
      if (chatE2e && user && user.id && chat) {
        const participants = uniqueIds(chatParticipants(chat).concat([user.id]));
        const latest = latestKeysPerUser(chatKeys);
        const recipients = participants
          .filter((uid) => latest[uid] && latest[uid].publicKey)
          .map((uid) => ({ userId: uid, publicKey: latest[uid].publicKey }));
        const envelope =
          recipients.length === participants.length
            ? encryptForRecipients(text.trim(), recipients)
            : null;
        if (envelope) {
          body = { content: "", type: "text", envelope };
        }
      }
      const data = await api.post("/api/chats/" + chatId + "/messages", body);
      const raw = data.data || data;
      const message = user && user.id ? await decorateMessage(raw, user.id) : raw;
      scrollBottomRef.current = true;
      setMessages((prev) => (prev.some((x) => x.id === message.id) ? prev : [...prev, message]));
      setText("");
      socketRef.current && socketRef.current.emit("typing", { chatId, isTyping: false });
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const handleTyping = () => {
    socketRef.current && socketRef.current.emit("typing", { chatId, isTyping: true });
  };

  const handleMarkRead = async () => {
    try {
      await api.post("/api/chats/" + chatId + "/read", {});
    } catch (err) {
      // ignore
    }
  };

  useEffect(() => { handleMarkRead(); }, [chatId]);

  const patientName = chat ? (chat.title || (chat.patient && chat.patient.fullName) || "Пациент") : "Пациент";
  const settings = (chat && chat.settings) || {};
  const convenience = settings.convenienceTime || (chat && chat.convenienceTime);
  const visible = messages.slice(viewStart, viewStart + RENDER_CAP);
  const hiddenNewer = Math.max(0, messages.length - (viewStart + RENDER_CAP));

  const isDoctor = !!(user && user.role === "doctor");

  // Пометить гостя как нового пациента (metadata.guestKind).
  const markNewPatient = async () => {
    try {
      const meta = { ...((chat && chat.metadata) || {}), guestKind: "new", markedAt: new Date().toISOString() };
      await api.put("/api/chats/" + chatId, { metadata: meta });
      setChat({ ...chat, metadata: meta });
    } catch (err) {
      setError(err.message);
    }
  };

  // «Старый пациент»: выбрать прошлый чат и слить текущий в него
  // (одна общая история вместо цепочки гостевых чатов).
  const openMerge = async () => {
    setMergeOpen(true);
    setMergeError("");
    try {
      const data = await api.get("/api/chats?limit=50&status=active");
      setMergeList((data.data || []).filter((c) => c.id !== chatId));
    } catch (err) {
      setMergeError(err.message);
    }
  };

  const doMerge = async (targetId) => {
    setMergeBusy(true);
    setMergeError("");
    try {
      await api.post("/api/chats/" + targetId + "/merge", { sourceChatId: chatId });
      setMergeOpen(false);
      navigate("/chats/" + targetId);
    } catch (err) {
      setMergeError(err.message);
    } finally {
      setMergeBusy(false);
    }
  };

  return (
    <div className="chat-layout" style={{ height: "calc(100vh - 120px)" }}>
      <div className="chat-window">
        <div className="chat-header">
          <div className="row">
            <button className="btn btn-secondary btn-small" onClick={() => navigate("/chats")}>&larr;</button>
            <div>
              <div style={{ fontWeight: 600 }}>{patientName}</div>
              <div className="muted">{convenience ? "Отвечает: " + convenience : "Чат с пациентом"}</div>
            </div>
          </div>
          <div className="row">
            {isDoctor && (
              <>
                <button
                  className="btn btn-secondary btn-small"
                  style={{ opacity: 0.8 }}
                  onClick={markNewPatient}
                  title="Пометить: новый пациент"
                >
                  Новый пациент
                </button>
                <button
                  className="btn btn-secondary btn-small"
                  style={{ opacity: 0.8 }}
                  onClick={openMerge}
                  title="Слить историю с предыдущим чатом пациента"
                >
                  Старый пациент
                </button>
              </>
            )}
            <Link to={"/files?chatId=" + chatId} className="btn btn-secondary btn-small">Файлы пациента</Link>
          </div>
        </div>

        {error && <div className="alert alert-error" style={{ margin: 12 }}>{error}</div>}

        {isDoctor && mergeOpen && (
          <div className="card" style={{ margin: 12 }}>
            <h4 style={{ marginTop: 0 }}>Слить с предыдущим чатом пациента</h4>
            <p className="muted" style={{ fontSize: 13 }}>
              Сообщения и файлы из текущего чата будут перенесены в выбранный
              чат, текущий чат закроется. Выберите прошлый чат этого пациента.
            </p>
            {mergeError && <div className="alert alert-error">{mergeError}</div>}
            <div style={{ maxHeight: 240, overflowY: "auto" }}>
              {mergeList.length === 0 && <div className="muted">Других активных чатов нет</div>}
              {mergeList.map((c) => (
                <button
                  key={c.id}
                  className="btn btn-secondary btn-small"
                  style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 6 }}
                  disabled={mergeBusy}
                  onClick={() => doMerge(c.id)}
                >
                  {(c.title || "Чат") + (c.lastMessageAt ? " · " + new Date(c.lastMessageAt).toLocaleString("ru-RU") : "")}
                </button>
              ))}
            </div>
            <button className="btn" onClick={() => setMergeOpen(false)}>Отмена</button>
          </div>
        )}

        {chat && (
          <div className="convenience-note" style={{ alignSelf: "center", margin: "10px 18px" }}>
            {chatE2e
              ? "🔒 E2E: сообщения этого чата шифруются на устройстве"
              : "E2E недоступен: не у всех участников есть активный ключ — отправка в plaintext"}
          </div>
        )}

        {convenience && (
          <div className="convenience-note" style={{ alignSelf: "center", margin: "10px 18px" }}>
            Удобное время для ответов врача: {convenience}
          </div>
        )}

        <div className="chat-messages" ref={containerRef}>
          {(viewStart > 0 || remainingOlder > 0) && (
            <div style={{ textAlign: "center", padding: "8px 0" }}>
              <button className="btn btn-secondary btn-small" onClick={showOlder} disabled={loadingOlder}>
                {loadingOlder ? "Загрузка..." : "Показать более старые" + (remainingOlder > 0 ? " (на сервере ещё " + remainingOlder + ")" : "")}
              </button>
            </div>
          )}
          {visible.map((m) => (
            <div key={m.id} className={"message " + (m.senderType === "doctor" || (m.sender && m.sender.role === "doctor") ? "message-own" : "message-other")}>
              <div>{m.displayText !== undefined ? m.displayText : m.content}</div>
              <div className="message-meta" style={{ color: m.senderType === "doctor" ? "rgba(255,255,255,0.7)" : undefined }}>
                {m.createdAt ? new Date(m.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}
                {(m.isPaid || m.paymentStatus === "paid") ? " · оплачено" : ""}
                {m.e2e ? " · 🔒" : ""}
              </div>
            </div>
          ))}
          {hiddenNewer > 0 && (
            <div style={{ textAlign: "center", padding: "8px 0" }}>
              <button className="btn btn-secondary btn-small" onClick={toLatest}>
                К последним сообщениям ({hiddenNewer})
              </button>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form className="chat-input" onSubmit={handleSend}>
          <textarea
            rows={2}
            placeholder="Введите сообщение..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleTyping}
          />
          <button className="btn btn-primary" type="submit" disabled={sending || !text.trim()}>
            {sending ? "..." : "Отправить"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatPage;