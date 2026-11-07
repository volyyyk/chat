/**
 * Doctor registration: clinic code + email + password + name + specialty
 */
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const SPECIALTIES = [
  'Терапевт', 'Кардиолог', 'Невролог', 'Педиатр', 'Эндокринолог',
  'Гинеколог', 'Уролог', 'Хирург', 'Офтальмолог', 'Дерматолог', 'Другое',
];

const RegisterPage = () => {
  const { registerDoctor } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    clinicCode: '', email: '', password: '', confirmPassword: '',
    firstName: '', lastName: '', middleName: '', specialty: SPECIALTIES[0],
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 8) {
      setError('Пароль должен быть не короче 8 символов');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('Пароли не совпадают');
      return;
    }
    setIsLoading(true);
    try {
      await registerDoctor(form);
      alert('Регистрация отправлена. Аккаунт будет активирован после подтверждения администратором клиники.');
      navigate('/login');
    } catch (err) {
      setError(err.message || 'Не удалось зарегистрироваться');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>MedChat</h1>
        <p className="auth-subtitle">Регистрация врача</p>

        {error && <div className="alert alert-error">{error}</div>}

        <div className="alert alert-info">
          Аккаунт активируется после подтверждения администратором клиники.
          Если доступа нет, обратитесь к руководству клиники.
        </div>

        <label>Код клиники</label>
        <input value={form.clinicCode} onChange={set('clinicCode')} placeholder="CLN-8F2A1D" required />

        <label>Email</label>
        <input type="email" value={form.email} onChange={set('email')} required />

        <label>Пароль</label>
        <input type="password" value={form.password} onChange={set('password')} required />

        <label>Подтвердите пароль</label>
        <input type="password" value={form.confirmPassword} onChange={set('confirmPassword')} required />

        <label>Фамилия</label>
        <input value={form.lastName} onChange={set('lastName')} required />

        <label>Имя</label>
        <input value={form.firstName} onChange={set('firstName')} required />

        <label>Отчество</label>
        <input value={form.middleName} onChange={set('middleName')} />

        <label>Специальность</label>
        <select value={form.specialty} onChange={set('specialty')}>
          {SPECIALTIES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>

        <button className="btn btn-primary" type="submit" disabled={isLoading}>
          {isLoading ? 'Отправка...' : 'Зарегистрироваться'}
        </button>

        <p className="auth-switch">
          Уже есть аккаунт? <Link to="/login">Войти</Link>
        </p>
      </form>
    </div>
  );
};

export default RegisterPage;
