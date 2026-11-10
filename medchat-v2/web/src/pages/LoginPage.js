/**
 * Doctor login page: login + password + clinic code
 */
import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { setToken } from '../services/api';

const LoginPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [clinicCode, setClinicCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setIsLoading(true);
    try {
      await login({ email, password, clinicCode });
      navigate('/');
    } catch (err) {
      if (err.message && (err.message.includes('подтвержд') || err.message.includes('verif'))) {
        setNotice('Ваш аккаунт не подтвержден. Обратитесь к руководству клиники.');
      } else {
        setError(err.message || 'Не удалось войти');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgot = async () => {
    if (!email) {
      setError('Введите email для сброса пароля');
      return;
    }
    try {
      const response = await fetch((process.env.REACT_APP_API_URL || 'http://localhost:3000') + '/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (response.ok) {
        setError('');
        setNotice('Инструкция по сбросу пароля отправлена на email');
      } else {
        setError('Не удалось запросить сброс пароля');
      }
    } catch (err) {
      setError('Сервер недоступен');
    }
  };

  // ----- Вход через внешние провайдеры (бесплатные: Telegram, VK ID) -----
  const [oauth, setOauth] = useState(null);
  const telegramRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    fetch((process.env.REACT_APP_API_URL || 'http://localhost:3000') + '/api/auth/oauth/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => { if (!cancelled && cfg) setOauth(cfg); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const finishOauth = (data) => {
    const token = data.accessToken || data.token;
    if (!token || !data.user) {
      setError('Провайдер не вернул сессию');
      return;
    }
    setToken(token);
    localStorage.setItem('userData', JSON.stringify(data.user));
    // Полная перезагрузка: AuthContext читает localStorage при монтировании.
    window.location.href = '/';
  };

  // Глобальный колбэк Telegram Login Widget (data-onauth вызывает его как
  // onMedchatTelegramAuth(user) с подписанными сервером полями).
  useEffect(() => {
    window.onMedchatTelegramAuth = async (tgUser) => {
      setError('');
      setIsLoading(true);
      try {
        const base = process.env.REACT_APP_API_URL || 'http://localhost:3000';
        const res = await fetch(base + '/api/auth/oauth/telegram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tgUser),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Вход через Telegram не удался');
        finishOauth(data);
      } catch (err) {
        setError(err.message);
        setIsLoading(false);
      }
    };
    return () => { delete window.onMedchatTelegramAuth; };
  }, []);

  // Виджет Telegram вставляется скриптом, только если провайдер включён
  // (бот настраивает оператор: TELEGRAM_BOT_TOKEN + TELEGRAM_BOT_USERNAME,
  // домен сайта вписывается в настройки бота).
  useEffect(() => {
    if (!oauth || !oauth.telegram || !oauth.telegram.enabled || !oauth.telegram.botUsername) return;
    const el = telegramRef.current;
    if (!el || el.querySelector('script')) return;
    const s = document.createElement('script');
    s.src = 'https://telegram.org/js/telegram-widget.js?22';
    s.async = true;
    s.setAttribute('data-telegram-login', oauth.telegram.botUsername);
    s.setAttribute('data-size', 'large');
    s.setAttribute('data-onauth', 'onMedchatTelegramAuth(user)');
    s.setAttribute('data-request-access', 'write');
    el.appendChild(s);
  }, [oauth]);

  const base64url = (bytes) => {
    let bin = '';
    bytes.forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };

  // VK ID: OAuth 2.1 + PKCE. Verifier держим в sessionStorage, обмен кода
  // делает сервер (POST /api/auth/oauth/vk), страница /vk-callback.
  const startVk = async () => {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const verifier = base64url(bytes);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    const challenge = base64url(new Uint8Array(digest));
    sessionStorage.setItem('vk.code_verifier', verifier);
    const redirectUri = window.location.origin + '/vk-callback';
    const clientId = oauth && oauth.vk && oauth.vk.clientId;
    window.location.href =
      'https://id.vk.ru/authorize?response_type=code&client_id=' + encodeURIComponent(clientId) +
      '&redirect_uri=' + encodeURIComponent(redirectUri) +
      '&code_challenge=' + challenge + '&code_challenge_method=S256' +
      '&scope=email';
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>MedChat</h1>
        <p className="auth-subtitle">Вход для врачей</p>

        {error && <div className="alert alert-error">{error}</div>}
        {notice && <div className="alert alert-warning">{notice}</div>}

        <label>Код клиники</label>
        <input
          value={clinicCode}
          onChange={(e) => setClinicCode(e.target.value)}
          placeholder="Например: CLN-8F2A1D"
          required
        />

        <label>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="doctor@clinic.ru"
          required
        />

        <label>Пароль</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="********"
          required
        />

        <button className="btn btn-primary" type="submit" disabled={isLoading}>
          {isLoading ? 'Вход...' : 'Войти'}
        </button>

        <button type="button" className="btn btn-link" onClick={handleForgot}>
          Забыли пароль?
        </button>

        {oauth && ((oauth.telegram && oauth.telegram.enabled) || (oauth.vk && oauth.vk.enabled)) && (
          <div style={{ marginTop: 16 }}>
            <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>Или войдите через:</div>
            <div ref={telegramRef} style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }} />
            {oauth.vk && oauth.vk.enabled && (
              <button type="button" className="btn btn-secondary" style={{ width: '100%' }} onClick={startVk}>
                Войти через VK ID
              </button>
            )}
          </div>
        )}

        <p className="auth-switch">
          Нет аккаунта? <Link to="/register">Зарегистрироваться</Link>
        </p>
      </form>
    </div>
  );
};

export default LoginPage;
