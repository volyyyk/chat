/**
 * Chats list with search
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

const ChatsPage = () => {
  const [chats, setChats] = useState([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const { user } = useAuth();
  const isDoctor = !!(user && user.role === 'doctor');
  const [invite, setInvite] = useState(null);
  const [inviteError, setInviteError] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);

  const createInvite = async () => {
    setInviteBusy(true);
    setInviteError('');
    try {
      const data = await api.post('/api/chats/invites', { expiresInDays: 7 });
      setInvite(data);
    } catch (err) {
      setInviteError(err.message);
    } finally {
      setInviteBusy(false);
    }
  };


  const load = useCallback(async () => {
    try {
      const data = await api.get('/api/chats?limit=50' + (search ? '&search=' + encodeURIComponent(search) : ''));
      setChats(data.data || []);
    } catch (err) {
      setError(err.message);
    }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div>
      <h2>Чаты</h2>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="file-toolbar">
        <input
          className="search-input"
          placeholder="Поиск по пациентам..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {isDoctor && (
          <button className="btn btn-primary" onClick={createInvite} disabled={inviteBusy}>
            {inviteBusy ? 'Создаём...' : 'Пригласить пациента по QR'}
          </button>
        )}
      </div>

      {isDoctor && inviteError && <div className="alert alert-error">{inviteError}</div>}

      {isDoctor && invite && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Приглашение создано</h3>
          <p className="muted" style={{ fontSize: 14 }}>
            Покажите этот QR-код пациенту: он сканирует его камерой, даёт согласие
            на обработку персональных данных и сразу попадает в чат с вами, без регистрации.
          </p>
          <img src={invite.qrImage} alt="QR-код приглашения" width={220} height={220} style={{ display: 'block' }} />
          <p style={{ wordBreak: 'break-all', fontSize: 13 }}>{invite.inviteUrl}</p>
          <p className="muted" style={{ fontSize: 13 }}>
            Действует до: {new Date(invite.expiresAt).toLocaleString('ru-RU')}
          </p>
          <button className="btn" onClick={() => setInvite(null)}>Закрыть</button>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        {chats.length === 0 && <div style={{ padding: 20 }} className="muted">Ничего не найдено</div>}
        {chats.map((chat) => (
          <Link key={chat.id} to={'/chats/' + chat.id} className="chat-list-item" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="info">
              <div className="name">{chat.title || (chat.patient && chat.patient.fullName) || 'Пациент'}</div>
              <div className="last">{chat.lastMessage ? (chat.lastMessage.content || (chat.lastMessage.metadata && chat.lastMessage.metadata.e2e ? '🔒 Сообщение зашифровано' : '')) : 'Нет сообщений'}</div>
            </div>
            {(chat.unreadCount || 0) > 0 && <span className="unread-badge">{chat.unreadCount}</span>}
          </Link>
        ))}
      </div>
    </div>
  );
};

export default ChatsPage;
