'use strict';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RETENTION_DAYS = 3;
const MAX_RETENTION_DAYS = 3650;

/**
 * Parse multipart/form-data retention values without treating the string
 * "false" as truthy. A deleteAt timestamp is created only when auto-delete
 * was explicitly enabled.
 */
function parseFileRetention(autoDeleteInput, retentionInput, now = new Date()) {
  const autoDelete = autoDeleteInput === true || autoDeleteInput === 'true';
  const requestedDays = Number(retentionInput);
  const deleteAfterDays = Number.isSafeInteger(requestedDays) && requestedDays > 0
    ? Math.min(requestedDays, MAX_RETENTION_DAYS)
    : DEFAULT_RETENTION_DAYS;

  return {
    autoDelete,
    deleteAfterDays,
    deleteAt: autoDelete ? new Date(now.getTime() + deleteAfterDays * DAY_MS) : null,
  };
}

module.exports = { parseFileRetention, DEFAULT_RETENTION_DAYS, MAX_RETENTION_DAYS };
