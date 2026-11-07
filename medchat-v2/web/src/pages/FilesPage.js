/**
 * Files: list, sort by time/name, search, upload (3-day retention warning)
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, getDownloadUrl } from '../services/api';

const formatSize = (bytes) => {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return bytes + ' Б';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' КБ';
  return (bytes / 1024 / 1024).toFixed(1) + ' МБ';
};

const FilesPage = () => {
  const [searchParams] = useSearchParams();
  const chatId = searchParams.get('chatId');
  const [files, setFiles] = useState([]);
  const [sortBy, setSortBy] = useState('time');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const load = useCallback(async () => {
    try {
      const query = [];
      if (chatId) query.push('chatId=' + chatId);
      if (search) query.push('search=' + encodeURIComponent(search));
      const data = await api.get('/api/files' + (query.length ? '?' + query.join('&') : ''));
      setFiles(data.data || []);
    } catch (err) {
      setError(err.message);
    }
  }, [chatId, search]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  const sorted = () => {
    const copy = [...files];
    if (sortBy === 'name') {
      copy.sort((a, b) => (a.originalName || a.name || '').localeCompare(b.originalName || b.name || '', 'ru'));
    } else {
      copy.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    return copy;
  };

  const handleUpload = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!window.confirm(
      'Файлы, загруженные врачом, хранятся на сервере 3 дня, затем автоматически удаляются. Продолжить?'
    )) {
      e.target.value = '';
      return;
    }
    setIsUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (chatId) formData.append('chatId', chatId);
      formData.append('type', 'doctor_upload');
      formData.append('autoDelete', 'true');
      formData.append('deleteAfterDays', '3');
      await api.upload('/api/files/upload', formData);
      setNotice('Файл загружен');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleDelete = async (file) => {
    if (!window.confirm('Удалить файл ' + (file.originalName || file.name) + '?')) return;
    try {
      await api.delete('/api/files/' + file.id);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <h2>Файлы {chatId ? 'пациента' : ''}</h2>
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      <div className="alert alert-warning">
        Внимание: загруженные врачом файлы автоматически удаляются через 3 дня.
      </div>

      <div className="file-toolbar">
        <input
          className="search-input"
          placeholder="Поиск по названию..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn btn-secondary" onClick={() => setSortBy(sortBy === 'time' ? 'name' : 'time')}>
          Сортировка: {sortBy === 'time' ? 'по времени' : 'по названию'}
        </button>
        <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
          {isUploading ? 'Загрузка...' : 'Загрузить файл'}
          <input type="file" style={{ display: 'none' }} onChange={handleUpload} />
        </label>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Название</th>
              <th>Размер</th>
              <th>Категория</th>
              <th>Загружен</th>
              <th>Удалится</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sorted().map((file) => (
              <tr key={file.id}>
                <td>{file.originalName || file.name}</td>
                <td>{formatSize(file.size)}</td>
                <td>{file.category || '—'}</td>
                <td>{file.createdAt ? new Date(file.createdAt).toLocaleString('ru-RU') : ''}</td>
                <td>{file.expiresAt ? new Date(file.expiresAt).toLocaleDateString('ru-RU') : '—'}</td>
                <td>
                  <a className="btn btn-secondary btn-small" style={{ display: 'inline-block' }}
                     href={getDownloadUrl('/api/files/' + file.id + '/download')} target="_blank" rel="noreferrer">
                    Скачать
                  </a>{' '}
                  <button className="btn btn-secondary btn-small" style={{ color: 'var(--error)' }} onClick={() => handleDelete(file)}>
                    Удалить
                  </button>
                </td>
              </tr>
            ))}
            {files.length === 0 && (
              <tr><td colSpan="6" className="muted" style={{ textAlign: 'center', padding: 24 }}>Файлов нет</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default FilesPage;
