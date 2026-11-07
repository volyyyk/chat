/**
 * API client with JWT token handling
 */
import { API_URL } from '../config';

let accessToken = localStorage.getItem('authToken') || null;

export const setToken = (token) => {
  accessToken = token;
  if (token) {
    localStorage.setItem('authToken', token);
  } else {
    localStorage.removeItem('authToken');
  }
};

export const getToken = () => accessToken;

async function request(path, { method = 'GET', body, formData, auth = true } = {}) {
  const headers = {};
  if (auth && accessToken) headers['Authorization'] = 'Bearer ' + accessToken;
  if (body && !formData) headers['Content-Type'] = 'application/json';

  const response = await fetch(API_URL + path, {
    method,
    headers,
    body: formData || (body ? JSON.stringify(body) : undefined),
  });

  let data = null;
  try {
    data = await response.json();
  } catch (e) {
    data = null;
  }

  if (!response.ok) {
    const message = (data && (data.message || data.error)) || ('HTTP ' + response.status);
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return data;
}

export const api = {
  get: (path, opts) => request(path, { ...opts, method: 'GET' }),
  post: (path, body, opts) => request(path, { ...opts, method: 'POST', body }),
  put: (path, body, opts) => request(path, { ...opts, method: 'PUT', body }),
  delete: (path, body, opts) => request(path, { ...opts, method: 'DELETE', body }),
  upload: (path, formData) => request(path, { method: 'POST', formData, auth: true }),
  getDownloadUrl: (path) => API_URL + path + '?token=' + encodeURIComponent(accessToken || ''),
};
