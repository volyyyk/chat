/**
 * Chats list with search
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';

const ChatsPage = () => {
  const [chats, setChats] = useState([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

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
      </div>

      <div className="card" style={{ padding: 0 }}>
        {chats.length === 0 && <div style={{ padding: 20 }} className="muted">Ничего не найдено</div>}
        {chats.map((chat) => (
          <Link key={chat.id} to={'/chats/' + chat.id} className="chat-list-item" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="info">
              <div className="name">{chat.title || (chat.patient && chat.patient.fullName) || 'Пациент'}</div>
              <div className="last">{chat.lastMessage ? (chat.lastMessage.content || '') : 'Нет сообщений'}</div>
            </div>
            {(chat.unreadCount || 0) > 0 && <span className="unread-badge">{chat.unreadCount}</span>}
          </Link>
        ))}
      </div>
    </div>
  );
};

export default ChatsPage;
