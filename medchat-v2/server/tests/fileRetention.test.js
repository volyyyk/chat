'use strict';

const { parseFileRetention, DEFAULT_RETENTION_DAYS, MAX_RETENTION_DAYS } = require('../src/utils/fileRetention');

describe('parseFileRetention', () => {
  const now = new Date('2026-11-09T12:00:00.000Z');

  test('does not treat multipart string "false" as enabled', () => {
    expect(parseFileRetention('false', undefined, now)).toEqual({
      autoDelete: false,
      deleteAfterDays: DEFAULT_RETENTION_DAYS,
      deleteAt: null,
    });
  });

  test('creates deleteAt only for explicit true and uses requested days', () => {
    expect(parseFileRetention('true', '7', now)).toEqual({
      autoDelete: true,
      deleteAfterDays: 7,
      deleteAt: new Date('2026-11-16T12:00:00.000Z'),
    });
  });

  test('defaults invalid retention values and caps excessive values', () => {
    expect(parseFileRetention(false, 'not-a-number', now)).toEqual({
      autoDelete: false,
      deleteAfterDays: DEFAULT_RETENTION_DAYS,
      deleteAt: null,
    });
    expect(parseFileRetention(true, String(MAX_RETENTION_DAYS + 1), now)).toEqual({
      autoDelete: true,
      deleteAfterDays: MAX_RETENTION_DAYS,
      deleteAt: new Date(now.getTime() + MAX_RETENTION_DAYS * 24 * 60 * 60 * 1000),
    });
  });

  test('defaults missing retention to three days when auto-delete is enabled', () => {
    expect(parseFileRetention(true, undefined, now)).toEqual({
      autoDelete: true,
      deleteAfterDays: 3,
      deleteAt: new Date('2026-11-12T12:00:00.000Z'),
    });
  });
});
