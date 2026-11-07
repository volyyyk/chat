/**
 * Backup Service
 * Encrypted cloud backup protected with a user password
 */

import { API_BASE_URL } from '../config/config';

class BackupService {
  /**
   * Create encrypted cloud backup
   * @param {string} password - User password used to encrypt the backup
   */
  static async create(token, password, dataTypes = ['all'], type = 'manual') {
    try {
      const response = await fetch(API_BASE_URL + '/api/backups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token,
        },
        body: JSON.stringify({ password, dataTypes, type }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Backup failed');
      return { success: true, backup: data.data || data };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  /**
   * List backups
   */
  static async list(token, params = {}) {
    try {
      const query = Object.keys(params)
        .filter((k) => params[k])
        .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(params[k]))
        .join('&');
      const response = await fetch(API_BASE_URL + '/api/backups' + (query ? '?' + query : ''), {
        headers: { 'Authorization': 'Bearer ' + token },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to list backups');
      return { success: true, backups: data.data || [], pagination: data.pagination };
    } catch (err) {
      return { success: false, message: err.message, backups: [] };
    }
  }

  /**
   * Verify backup password before restore
   */
  static async verifyPassword(token, backupId, password) {
    try {
      const response = await fetch(API_BASE_URL + '/api/backups/verify-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token,
        },
        body: JSON.stringify({ backupId, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Verification failed');
      return { success: true, valid: !!(data.data ? data.data.valid : data.valid) };
    } catch (err) {
      return { success: false, message: err.message, valid: false };
    }
  }

  /**
   * Restore from backup
   */
  static async restore(token, backupId, password) {
    try {
      const response = await fetch(API_BASE_URL + '/api/backups/' + backupId + '/restore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token,
        },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Restore failed');
      return { success: true, restoreId: data.restoreId || (data.data ? data.data.restoreId : null) };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  /**
   * Delete backup
   */
  static async remove(token, backupId, password) {
    try {
      const response = await fetch(API_BASE_URL + '/api/backups/' + backupId, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token,
        },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to delete backup');
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  /**
   * Download backup file
   */
  static getDownloadUrl(token, backupId) {
    return API_BASE_URL + '/api/backups/' + backupId + '/download?token=' + encodeURIComponent(token);
  }

  /**
   * Export data to local encrypted file
   */
  static async exportLocal(token, password, dataTypes = ['all']) {
    try {
      const response = await fetch(API_BASE_URL + '/api/backups/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token,
        },
        body: JSON.stringify({ password, dataTypes }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Export failed');
      return { success: true, downloadUrl: data.downloadUrl || (data.data ? data.data.downloadUrl : null) };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  /**
   * Import data from local encrypted file
   */
  static async importLocal(token, fileUri, fileName, password) {
    try {
      const formData = new FormData();
      formData.append('file', { uri: fileUri, name: fileName || 'backup.medchat', type: 'application/octet-stream' });
      formData.append('password', password);

      const response = await fetch(API_BASE_URL + '/api/backups/import', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'multipart/form-data',
        },
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Import failed');
      return { success: true, imported: data.imported || (data.data ? data.data.imported : null) };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  /**
   * Get backup settings
   */
  static async getSettings(token) {
    try {
      const response = await fetch(API_BASE_URL + '/api/backups/settings', {
        headers: { 'Authorization': 'Bearer ' + token },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to load settings');
      return { success: true, settings: data.data || data };
    } catch (err) {
      return { success: false, message: err.message, settings: null };
    }
  }

  /**
   * Update backup settings
   */
  static async updateSettings(token, settings) {
    try {
      const response = await fetch(API_BASE_URL + '/api/backups/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token,
        },
        body: JSON.stringify(settings),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to update settings');
      return { success: true, settings: data.data || data };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }
}

export const backupService = backupServiceExport();
function backupServiceExport() { return BackupService; }
