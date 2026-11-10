/**
 * Guest Connect Page: вход пациента по QR-приглашению БЕЗ регистрации.
 * Публичный маршрут /connect?token=... (вне Protected).
 *
 * Сценарий: врач показывает QR (POST /api/chats/invites), пациент сканирует
 * его камерой, попадает сюда, видит врача и клинику, даёт согласие на
 * обработку персональных данных (152-ФЗ) и сразу попадает в чат с врачом.
 */
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, setToken } from '../services/api';

const GuestConnectPage = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [preview, setPreview] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [consent, setConsent] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await api.get('/api/guest/invites/' + encodeURIComponent(token), { auth: false });
        if (!cancelled) setPreview(data);
      } catch (err) {
        if (!cancelled) setLoadError(err.message);
      }
    };
    if (token) {
      load();
    } else if (!cancelled) {
      setLoadError('Ссылка не содержит токен приглашения. Отсканируйте QR-код ещё раз.');
    }
    return () => { cancelled = true; };
  }, [token]);

  const join = async (e) => {
    e.preventDefault();
    if (!consent || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const data = await api.post(
        '/api/guest/join',
        {
          token,
          consent,
          firstName: firstName.trim() || undefined,
          lastName: lastName.trim() || undefined,
        },
        { auth: false }
      );
      setToken(data.token);
      localStorage.setItem('userData', JSON.stringify(data.user));
      // Полная перезагрузка обязательна: AuthContext читает localStorage
      // только при монтировании, иначе Protected перенаправит на /login.
      window.location.href = '/chats/' + data.chat.id;
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  const cardStyle = { maxWidth: 480, margin: '60px auto', padding: 24 };
  const inputStyle = { width: '100%', padding: '10px 12px', marginBottom: 12, boxSizing: 'border-box' };

  return (
    <div className="card" style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>Приглашение в чат</h2>

      {loadError && <div className="alert alert-error">{loadError}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      {!token && !loadError && <div className="muted">Отсканируйте QR-код врача, чтобы открыть эту страницу.</div>}

      {token && !preview && !loadError && <div className="muted">Загрузка приглашения...</div>}

      {preview && !preview.valid && (
        <div className="alert alert-error">
          {preview.expired
            ? 'Срок действия приглашения истёк или оно отозвано. Попросите врача показать QR-код заново.'
            : 'Приглашение недействительно. Попросите врача показать QR-код заново.'}
        </div>
      )}

      {preview && preview.valid && (
        <form onSubmit={join}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{preview.doctor.fullName}</div>
            {preview.doctor.clinic && preview.doctor.clinic.name && (
              <div className="muted">{preview.doctor.clinic.name}</div>
            )}
            {preview.doctor.specialties && preview.doctor.specialties.length > 0 && (
              <div className="muted">{preview.doctor.specialties.join(', ')}</div>
            )}
          </div>

          <p className="muted" style={{ fontSize: 14 }}>
            Вход без регистрации: вы сразу попадёте в защищённый чат с врачом.
            Имя и фамилию указывать не обязательно.
          </p>

          <input
            style={inputStyle}
            placeholder="Имя (необязательно)"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            maxLength={100}
          />
          <input
            style={inputStyle}
            placeholder="Фамилия (необязательно)"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            maxLength={100}
          />

          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 16, fontSize: 14 }}>
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              style={{ marginTop: 3 }}
            />
            <span>
              Я даю согласие на обработку персональных данных и ознакомлен(а)
              с условиями обработки (152-ФЗ). Без согласия вход невозможен.
            </span>
          </label>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={!consent || submitting}
            style={{ width: '100%', padding: '12px 16px' }}
          >
            {submitting ? 'Входим...' : 'Войти в чат с врачом'}
          </button>
        </form>
      )}
    </div>
  );
};

export default GuestConnectPage;
