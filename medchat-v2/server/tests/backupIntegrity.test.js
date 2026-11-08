/**
 * Чексуммы целостности бэкапов (этап 6): restoreBackup и verifyBackupPassword
 * сверяют SHA-256 шифротекста ДО расшифровки; createBackup фиксирует
 * metadata.checksum. Тест на моках моделей (без БД): реальный файл кладётся
 * в server/backups и удаляется после каждого кейса.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

jest.mock('../src/models', () => ({
  User: { findByPk: jest.fn() },
  Backup: { findByPk: jest.fn(), create: jest.fn(), findAll: jest.fn(), count: jest.fn() },
  sequelize: { query: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
}));

const BackupService = require('../src/services/backupService');
const { sha256Hex } = require('../src/utils/checksum');
const { gzipCompress } = require('../src/utils/compress');
const models = require('../src/models');

const PASSWORD = 'Backup!Integrity123';
const BACKUP_DIR = path.join(__dirname, '..', 'backups');
const createdFiles = [];

async function makeBackup(filename, options = {}) {
  const { withChecksum = true, corrupt = false, compressed = false } = options;
  const salt = crypto.randomBytes(32);
  const { key, iv } = await BackupService.generateKey(PASSWORD, salt);
  let payload = Buffer.from(JSON.stringify({ version: '1.0', dataTypes: [] }), 'utf8');
  if (compressed) payload = gzipCompress(payload);
  let encrypted = BackupService.encrypt(payload, key, iv);
  // чексумма фиксируется ДО порчи: metadata.checksum описывает эталонный
  // шифротекст, а битый файл обязан разойтись с ним (сценарий этапа 6)
  const checksum = withChecksum ? sha256Hex(encrypted) : null;
  if (corrupt) {
    encrypted = Buffer.from(encrypted);
    encrypted[encrypted.length - 1] ^= 0xff;
  }
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.writeFileSync(path.join(BACKUP_DIR, filename), encrypted);
  createdFiles.push(filename);
  const metadata = {
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
  };
  if (compressed) metadata.compressed = true;
  if (withChecksum) metadata.checksum = checksum;
  return {
    id: 'backup-integrity-test',
    userId: 'user-1',
    filename,
    metadata,
    user: { id: 'user-1' },
    restoreCount: 0,
    update: jest.fn(),
  };
}

afterEach(() => {
  for (const name of createdFiles) {
    try { fs.unlinkSync(path.join(BACKUP_DIR, name)); } catch (_e) { /* уже нет */ }
  }
  createdFiles.length = 0;
  jest.clearAllMocks();
});

describe('backup integrity (этап 6: SHA-256 чексуммы)', () => {
  test('positive: чексумма совпала — restore проходит до конца', async () => {
    const record = await makeBackup('int-ok.enc');
    models.Backup.findByPk.mockResolvedValue(record);
    models.User.findByPk.mockResolvedValue({ id: 'user-1' });
    const res = await BackupService.restoreBackup(record.id, PASSWORD);
    expect(res.success).toBe(true);
    expect(record.update).toHaveBeenCalled();
  });

  test('битый файл — 422 INTEGRITY_ERROR, до update дело не доходит', async () => {
    const record = await makeBackup('int-corrupt.enc', { corrupt: true });
    models.Backup.findByPk.mockResolvedValue(record);
    await expect(BackupService.restoreBackup(record.id, PASSWORD)).rejects.toMatchObject({
      statusCode: 422,
      code: 'INTEGRITY_ERROR',
    });
    expect(record.update).not.toHaveBeenCalled();
  });

  test('старый бэкап без чексуммы — проверка пропускается, restore работает', async () => {
    const record = await makeBackup('int-legacy.enc', { withChecksum: false });
    models.Backup.findByPk.mockResolvedValue(record);
    models.User.findByPk.mockResolvedValue({ id: 'user-1' });
    const res = await BackupService.restoreBackup(record.id, PASSWORD);
    expect(res.success).toBe(true);
  });

  test('сжатый бэкап (gzip до шифрования) — restore разжимает и проходит', async () => {
    const record = await makeBackup('int-gzip.enc', { compressed: true });
    models.Backup.findByPk.mockResolvedValue(record);
    models.User.findByPk.mockResolvedValue({ id: 'user-1' });
    const res = await BackupService.restoreBackup(record.id, PASSWORD);
    expect(res.success).toBe(true);
    expect(record.update).toHaveBeenCalled();
  });

  test('verifyBackupPassword: битый файл не валиден, целостный — валиден', async () => {
    const ok = await makeBackup('int-verify-ok.enc');
    const corrupted = await makeBackup('int-verify-bad.enc', { corrupt: true });
    expect((await BackupService.verifyBackupPassword(ok, PASSWORD)).valid).toBe(true);
    expect((await BackupService.verifyBackupPassword(corrupted, PASSWORD)).valid).toBe(false);
  });
});
