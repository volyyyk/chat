/**
 * Settings: profile, convenience time, prices, backups with password, export/import
 */
import React, { useState, useEffect, useCallback } from 'react';
import { api, getDownloadUrl } from '../services/api';

const SettingsPage = () => {
  const [profile, setProfile] = useState({ firstName: '', lastName: '', middleName: '', specialty: '', qualification: '' });
  const [workingHours, setWorkingHours] = useState('09:00 - 18:00');
  const [convenienceTime, setConvenienceTime] = useState('10:00 - 18:00 (пн-пт)');
  const [freeDays, setFreeDays] = useState(30);
  const [messagePrice, setMessagePrice] = useState(50);
  const [commission, setCommission] = useState(20);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const [backupPassword, setBackupPassword] = useState('');
  const [backupConfirm, setBackupConfirm] = useState('');
  const [restorePassword, setRestorePassword] = useState('');
  const [backups, setBackups] = useState([]);
  const [isWorking, setIsWorking] = useState(false);

  const load = useCallback(async () => {
    try {
      const me = await api.get('/api/users/me');
      const userData = me.data || me;
      setProfile({
        firstName: userData.firstName || '',
        lastName: userData.lastName || '',
        middleName: userData.middleName || '',
        specialty: (userData.specialty && (userData.specialty.name || userData.specialty)) || '',
        qualification: userData.qualification || '',
      });
      if (userData.workingHours) setWorkingHours(userData.workingHours);
      if (userData.settings) {
        if (userData.settings.convenienceTime) setConvenienceTime(userData.settings.convenienceTime);
        if (userData.settings.freeMessagesPeriod) setFreeDays(userData.settings.freeMessagesPeriod);
        if (userData.settings.messagePrice) setMessagePrice(userData.settings.messagePrice);
        if (userData.settings.commissionRate != null) setCommission(userData.settings.commissionRate);
      }
    } catch (err) {
      setError(err.message);
    }
    try {
      const list = await api.get('/api/backups');
      setBackups(list.data || []);
    } catch (err) {
      // ignore
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const flash = (msg) => { setNotice(msg); setError(''); setTimeout(() => setNotice(''), 3000); };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    try {
      await api.put('/api/users/me', profile);
      flash('Профиль сохранен');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSaveChatSettings = async (e) => {
    e.preventDefault();
    try {
      await api.put('/api/chats/settings', {
        workingHours,
        convenienceTime,
        freeMessagesPeriod: Number(freeDays),
        messagePrice: Number(messagePrice),
        commissionRate: Number(commission),
      });
      flash('Настройки чатов сохранены');
    } catch (err) {
      try {
        await api.put('/api/users/me', {
          workingHours,
          convenienceTime,
          freeMessagesPeriod: Number(freeDays),
          messagePrice: Number(messagePrice),
          commissionRate: Number(commission),
        });
        flash('Настройки сохранены');
      } catch (err2) {
        setError(err2.message);
      }
    }
  };

  const handleSavePassword = async (e) => {
    e.preventDefault();
    const form = e.target;
    const currentPassword = form.current.value;
    const newPassword = form.next.value;
    const confirmPassword = form.confirm.value;
    if (newPassword !== confirmPassword) {
      setError('Новые пароли не совпадают');
      return;
    }
    try {
      await api.put('/api/users/me/password', { currentPassword, newPassword, confirmPassword });
      flash('Пароль изменен');
      form.reset();
    } catch (err) {
      setError(err.message);
    }
  };

  const validateBackupPassword = () => {
    if (backupPassword.length < 8) {
      setError('Пароль копии должен быть не короче 8 символов');
      return false;
    }
    if (backupPassword !== backupConfirm) {
      setError('Пароли копии не совпадают');
      return false;
    }
    return true;
  };

  const handleCreateBackup = async () => {
    if (!validateBackupPassword()) return;
    setIsWorking(true);
    try {
      await api.post('/api/backups', { password: backupPassword, dataTypes: ['all'], type: 'manual' });
      flash('Облачная копия создана');
      setBackupConfirm('');
      const list = await api.get('/api/backups');
      setBackups(list.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsWorking(false);
    }
  };

  const handleExport = async () => {
    if (!validateBackupPassword()) return;
    setIsWorking(true);
    try {
      const data = await api.post('/api/backups/export', { password: backupPassword, dataTypes: ['all'] });
      const url = data.downloadUrl || (data.data && data.data.downloadUrl);
      if (url) {
        window.open(getDownloadUrl(url.replace(/^\/?api\//, '/api/')), '_blank');
      } else {
        flash('Экспорт выполнен');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsWorking(false);
    }
  };

  const handleRestore = async (backupId) => {
    if (!restorePassword) {
      setError('Введите пароль от копии в поле ниже');
      return;
    }
    if (!window.confirm('Восстановить данные из копии? Текущие данные будут заменены.')) return;
    setIsWorking(true);
    try {
      const verify = await api.post('/api/backups/verify-password', { backupId, password: restorePassword });
      const valid = verify.data ? verify.data.valid : verify.valid;
      if (!valid) {
        setError('Неверный пароль копии');
        return;
      }
      await api.post('/api/backups/' + backupId + '/restore', { password: restorePassword });
      flash('Данные восстановлены');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsWorking(false);
    }
  };

  const handleDeleteBackup = async (backupId) => {
    if (!window.confirm('Удалить копию?')) return;
    try {
      await api.delete('/api/backups/' + backupId, { password: restorePassword });
      const list = await api.get('/api/backups');
      setBackups(list.data || []);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!restorePassword) {
      setError('Введите пароль от файла копии');
      return;
    }
    setIsWorking(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('password', restorePassword);
      await api.upload('/api/backups/import', formData);
      flash('Данные импортированы');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsWorking(false);
      e.target.value = '';
    }
  };

  return (
    <div>
      <h2>Настройки</h2>
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      <div className="grid">
        <form className="card" onSubmit={handleSaveProfile}>
          <h3>Профиль</h3>
          <label className="muted">Фамилия</label>
          <input className="search-input" value={profile.lastName} onChange={(e) => setProfile({ ...profile, lastName: e.target.value })} />
          <label className="muted">Имя</label>
          <input className="search-input" value={profile.firstName} onChange={(e) => setProfile({ ...profile, firstName: e.target.value })} />
          <label className="muted">Отчество</label>
          <input className="search-input" value={profile.middleName} onChange={(e) => setProfile({ ...profile, middleName: e.target.value })} />
          <label className="muted">Квалификация</label>
          <input className="search-input" value={profile.qualification} onChange={(e) => setProfile({ ...profile, qualification: e.target.value })} />
          <button className="btn btn-primary" type="submit" style={{ marginTop: 12 }}>Сохранить профиль</button>
        </form>

        <form className="card" onSubmit={handleSaveChatSettings}>
          <h3>Чаты и тарифы</h3>
          <label className="muted">Часы работы</label>
          <input className="search-input" value={workingHours} onChange={(e) => setWorkingHours(e.target.value)} />
          <label className="muted">Удобное время для ответов (видят пациенты)</label>
          <input className="search-input" value={convenienceTime} onChange={(e) => setConvenienceTime(e.target.value)} />
          <label className="muted">Бесплатные сообщения, дней после приема</label>
          <input className="search-input" type="number" min="0" value={freeDays} onChange={(e) => setFreeDays(e.target.value)} />
          <label className="muted">Цена сообщения, ₽</label>
          <input className="search-input" type="number" min="0" value={messagePrice} onChange={(e) => setMessagePrice(e.target.value)} />
          <label className="muted">Комиссия клиники, %</label>
          <input className="search-input" type="number" min="0" max="100" value={commission} onChange={(e) => setCommission(e.target.value)} />
          <button className="btn btn-primary" type="submit" style={{ marginTop: 12 }}>Сохранить</button>
        </form>

        <form className="card" onSubmit={handleSavePassword}>
          <h3>Безопасность</h3>
          <label className="muted">Текущий пароль</label>
          <input className="search-input" name="current" type="password" required />
          <label className="muted">Новый пароль</label>
          <input className="search-input" name="next" type="password" minLength="8" required />
          <label className="muted">Подтвердите новый пароль</label>
          <input className="search-input" name="confirm" type="password" minLength="8" required />
          <button className="btn btn-primary" type="submit" style={{ marginTop: 12 }}>Сменить пароль</button>
        </form>
      </div>

      <div className="card">
        <h3>Резервные копии (облачные, с шифрованием паролем)</h3>
        <p className="muted">
          Копия шифруется вашим паролем (XChaCha20-Poly1305). Без пароля
          восстановление невозможно; пароль не хранится на сервере в открытом виде.
        </p>
        <label className="muted">Пароль для новой копии</label>
        <input className="search-input" type="password" value={backupPassword} onChange={(e) => setBackupPassword(e.target.value)} placeholder="Минимум 8 символов" />
        <label className="muted">Подтвердите пароль</label>
        <input className="search-input" type="password" value={backupConfirm} onChange={(e) => setBackupConfirm(e.target.value)} />
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn btn-primary" onClick={handleCreateBackup} disabled={isWorking}>Создать облачную копию</button>
          <button className="btn btn-secondary" onClick={handleExport} disabled={isWorking}>Экспорт локально</button>
          <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
            Импорт из файла
            <input type="file" style={{ display: 'none' }} onChange={handleImport} />
          </label>
        </div>

        <h3 className="section-title">Пароль существующей копии</h3>
        <input className="search-input" type="password" value={restorePassword} onChange={(e) => setRestorePassword(e.target.value)} placeholder="Пароль от копии" />

        <h3 className="section-title">Мои копии</h3>
        <table className="table">
          <thead>
            <tr><th>Дата</th><th>Тип</th><th>Статус</th><th></th></tr>
          </thead>
          <tbody>
            {backups.map((b) => (
              <tr key={b.id}>
                <td>{b.createdAt ? new Date(b.createdAt).toLocaleString('ru-RU') : ''}</td>
                <td>{b.type === 'auto' ? 'Авто' : 'Ручная'}</td>
                <td>{b.status || 'completed'}</td>
                <td>
                  <button className="btn btn-secondary btn-small" onClick={() => handleRestore(b.id)}>Восстановить</button>{' '}
                  <button className="btn btn-secondary btn-small" style={{ color: 'var(--error)' }} onClick={() => handleDeleteBackup(b.id)}>Удалить</button>
                </td>
              </tr>
            ))}
            {backups.length === 0 && <tr><td colSpan="4" className="muted">Копий нет</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SettingsPage;
