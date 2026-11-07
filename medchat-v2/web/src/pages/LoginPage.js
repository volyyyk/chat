/**
 * Doctor login page: login + password + clinic code
 */
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

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

        <p className="auth-switch">
          Нет аккаунта? <Link to="/register">Зарегистрироваться</Link>
        </p>
      </form>
    </div>
  );
};

export default LoginPage;
