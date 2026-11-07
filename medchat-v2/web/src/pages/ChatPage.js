/**
 * Chat with a patient: real-time via Socket.IO, convenience time note
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import { WS_URL } from '../config';
import { api, getToken } from '../services/api';

const ChatPage = () => {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [chat, setChat] = useState(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);
  const socketRef = useRef(null);

  const loadChat = useCallback(async () => {
    try {
      const data = await api.get('/api/chats/' + chatId);
      const chatData = data.data || data;
      setChat(chatData);
      const msgs = await api.get('/api/chats/' + chatId + '/messages?limit=50');
      const list = (msgs.data || []).reverse();
      setMessages(list);
    } catch (err) {
      setError(err.message);
    }
  }, [chatId]);

  useEffect(() => {
    loadChat();

    const socket = io(WS_URL, { auth: { token: getToken() } });
    socketRef.current = socket;
    socket.emit('joinChat', chatId);
    socket.on('newMessage', (message) => {
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
    });
    socket.on('messageRead', () => loadChat());

    return () => {
      socket.emit('leaveChat', chatId);
      socket.disconnect();
    };
  }, [chatId, loadChat]);

  useEffect(() => {
    bottomRef.current && bottomRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    try {
      const data = await api.post('/api/chats/' + chatId + '/messages', {
        content: text.trim(),
        type: 'text',
      });
      const message = data.data || data;
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
      setText('');
      socketRef.current && socketRef.current.emit('typing', { chatId, isTyping: false });
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const handleTyping = () => {
    socketRef.current && socketRef.current.emit('typing', { chatId, isTyping: true });
  };

  const handleMarkRead = async () => {
    try {
      await api.post('/api/chats/' + chatId + '/read', {});
    } catch (err) {
      // ignore
    }
  };

  useEffect(() => { handleMarkRead(); }, [chatId]);

  const patientName = chat ? (chat.title || (chat.patient && chat.patient.fullName) || 'Пациент') : 'Пациент';
  const settings = (chat && chat.settings) || {};
  const convenience = settings.convenienceTime || (chat && chat.convenienceTime);

  return (
    <div className="chat-layout" style={{ height: 'calc(100vh - 120px)' }}>
      <div className="chat-window">
        <div className="chat-header">
          <div className="row">
            <button className="btn btn-secondary btn-small" onClick={() => navigate('/chats')}>&larr;</button>
            <div>
              <div style={{ fontWeight: 600 }}>{patientName}</div>
              <div className="muted">{convenience ? 'Отвечает: ' + convenience : 'Чат с пациентом'}</div>
            </div>
          </div>
          <div className="row">
            <Link to={'/files?chatId=' + chatId} className="btn btn-secondary btn-small">Файлы пациента</Link>
          </div>
        </div>

        {error && <div className="alert alert-error" style={{ margin: 12 }}>{error}</div>}

        {convenience && (
          <div className="convenience-note" style={{ alignSelf: 'center', margin: '10px 18px' }}>
            Удобное время для ответов врача: {convenience}
          </div>
        )}

        <div className="chat-messages">
          {messages.map((m) => (
            <div key={m.id} className={'message ' + (m.senderType === 'doctor' || (m.sender && m.sender.role === 'doctor') ? 'message-own' : 'message-other')}>
              <div>{m.content}</div>
              <div className="message-meta" style={{ color: m.senderType === 'doctor' ? 'rgba(255,255,255,0.7)' : undefined }}>
                {m.createdAt ? new Date(m.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                {(m.isPaid || m.paymentStatus === 'paid') ? ' · оплачено' : ''}
              </div>
            </div>
          ))}
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
            {sending ? '...' : 'Отправить'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatPage;
