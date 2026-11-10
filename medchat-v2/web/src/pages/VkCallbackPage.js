/**
 * Callback VK ID: обмен authorization_code на сессию MedChat.
 * Публичный маршрут /vk-callback?code=... (PKCE verifier берём из
 * sessionStorage, куда его положила LoginPage перед редиректом).
 */
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { setToken } from '../services/api';

const VkCallbackPage = () => {
  const [searchParams] = useSearchParams();
  const [error, setError] = useState('');

  useEffect(() => {
    const code = searchParams.get('code');
    const verifier = sessionStorage.getItem('vk.code_verifier');
    if (!code || !verifier) {
      setError('Не хватает кода авторизации или PKCE-верификатора. Начните вход заново.');
      return;
    }
    sessionStorage.removeItem('vk.code_verifier');
    const base = process.env.REACT_APP_API_URL || 'http://localhost:3000';
    fetch(base + '/api/auth/oauth/vk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, codeVerifier: verifier }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Вход через VK ID не удался');
        setToken(data.accessToken || data.token);
        localStorage.setItem('userData', JSON.stringify(data.user));
        // Полная перезагрузка: AuthContext читает localStorage при монтировании.
        window.location.href = '/';
      })
      .catch((err) => setError(err.message));
  }, [searchParams]);

  return (
    <div className="card" style={{ maxWidth: 480, margin: '60px auto', padding: 24 }}>
      <h2 style={{ marginTop: 0 }}>Вход через VK ID</h2>
      {error ? <div className="alert alert-error">{error}</div> : <div className="muted">Завершаем вход...</div>}
    </div>
  );
};

export default VkCallbackPage;
