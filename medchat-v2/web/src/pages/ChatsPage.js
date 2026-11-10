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
  const [connectValue, setConnectValue] = useState('');
  const [connectError, setConnectError] = useState('');

  // Пациент/гость: добавить врача (в том числе второго) по ссылке-приглашению.
  const goConnect = () => {
    const v = connectValue.trim();
    const m = v.match(/token=([0-9a-fA-F]{64})/) || v.match(/^([0-9a-fA-F]{64})$/);
    if (!m) {
      setConnectError('Вставьте ссылку-приглашение целиком или токен (64 символа).');
      return;
    }
    // /connect публичный: там превью врача, согласие (152-ФЗ) и вход.
    window.location.href = '/connect?token=' + m[1];
  };

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


  // Распечатать QR-приглашение (например, повесить в регистратуре).
  const printInvite = (inv) => {
    const w = window.open('', '_blank', 'width=640,height=800');
    if (!w) return;
    w.document.write(
      '<html><head><title>QR-приглашение</title></head>' +
      '<body style="font-family: Arial, sans-serif; text-align: center; padding: 24px;">' +
      '<h2>Приглашение в чат</h2>' +
      (inv.doctor && inv.doctor.fullName ? '<p>' + inv.doctor.fullName + '</p>' : '') +
      '<img src="' + inv.qrImage + '" width="360" height="360" />' +
      '<p style="word-break: break-all; font-size: 12px;">' + inv.inviteUrl + '</p>' +
      '<p style="font-size: 12px;">Действует до: ' + new Date(inv.expiresAt).toLocaleString('ru-RU') + '</p>' +
      '</body></html>'
    );
    w.document.close();
    w.focus();
    w.print();
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
          <button className="btn btn-secondary" onClick={() => printInvite(invite)}>Распечатать QR</button>{' '}
          <button className="btn" onClick={() => setInvite(null)}>Закрыть</button>
        </div>
      )}

      {!isDoctor && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Добавить врача</h3>
          <p className="muted" style={{ fontSize: 14 }}>
            Вставьте ссылку-приглашение от врача (или отсканируйте QR-код камерой
            телефона). Врачей может быть несколько: каждый добавляется отдельно.
          </p>
          {connectError && <div className="alert alert-error">{connectError}</div>}
          <div className="file-toolbar">
            <input
              className="search-input"
              placeholder="Ссылка-приглашение или токен"
              value={connectValue}
              onChange={(e) => { setConnectValue(e.target.value); setConnectError(''); }}
            />
            <button className="btn btn-primary" onClick={goConnect}>Подключиться</button>
          </div>
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
