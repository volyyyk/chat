/**
 * File Service
 * Handles file upload/download/list operations
 */

import { API_BASE_URL } from '../config/config';

class FileService {
  /**
   * Upload file to a chat
   */
  static async upload(token, fileUri, fileName, fileType, options = {}) {
    try {
      const formData = new FormData();
      formData.append('file', {
        uri: fileUri,
        name: fileName || 'file',
        type: fileType || 'application/octet-stream',
      });
      formData.append('chatId', options.chatId || '');
      formData.append('type', options.type || 'patient_upload');
      formData.append('category', options.category || 'other');
      if (options.description) formData.append('description', options.description);
      if (options.visibility) formData.append('visibility', options.visibility);
      if (options.autoDelete !== undefined) formData.append('autoDelete', String(options.autoDelete));
      if (options.deleteAfterDays) formData.append('deleteAfterDays', String(options.deleteAfterDays));

      const response = await fetch(API_BASE_URL + '/api/files/upload', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'multipart/form-data',
        },
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Upload failed');
      }
      return { success: true, file: data.data || data };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  /**
   * List files for a chat
   */
  static async list(token, params = {}) {
    try {
      const query = Object.keys(params)
        .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
        .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(params[k]))
        .join('&');

      const response = await fetch(API_BASE_URL + '/api/files' + (query ? '?' + query : ''), {
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + token },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to list files');
      }
      return { success: true, files: data.data || [], pagination: data.pagination };
    } catch (err) {
      return { success: false, message: err.message, files: [] };
    }
  }

  /**
   * Get download URL for a file
   */
  static getDownloadUrl(token, fileId) {
    return API_BASE_URL + '/api/files/' + fileId + '/download?token=' + encodeURIComponent(token);
  }

  /**
   * Delete a file
   */
  static async remove(token, fileId) {
    try {
      const response = await fetch(API_BASE_URL + '/api/files/' + fileId, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to delete file');
      }
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }
}

export const fileService = FileService;
