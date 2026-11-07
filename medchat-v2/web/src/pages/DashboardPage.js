/**
 * Doctor dashboard: stats, recent chats, balance
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';

const DashboardPage = () => {
  const [chats, setChats] = useState([]);
  const [balance, setBalance] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await api.get('/api/chats?limit=5');
      setChats((data.data || []).filter((c) => c.status !== 'deleted'));
    } catch (err) {
      setError(err.message);
    }
    try {
      const bal = await api.get('/api/payments/doctor/balance');
      setBalance(bal.data || bal);
    } catch (err) {
      setBalance(null);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <h2>Кабинет врача</h2>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="grid">
        <div className="card">
          <div className="muted">Активных чатов</div>
          <div className="stat-value">{chats.length}</div>
        </div>
        <div className="card">
          <div className="muted">Баланс (тестовый)</div>
          <div className="stat-value">
            {balance ? (balance.available != null ? balance.available + ' ₽' : '—') : '—'}
          </div>
        </div>
      </div>

      <h3 className="section-title">Последние чаты</h3>
      <div className="card" style={{ padding: 0 }}>
        {chats.length === 0 && <div style={{ padding: 20 }} className="muted">Пока нет чатов</div>}
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

      <div className="alert alert-info">
        Чат не заменяет очную консультацию. При экстренных случаях пациенту
        следует обращаться по телефону 103 или 112.
      </div>
    </div>
  );
};

export default DashboardPage;
