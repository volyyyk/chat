/**
 * Unit tests for the global error handler middleware.
 * Verifies both the HTTP responses and the logging behaviour.
 */

jest.mock('../src/utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
}));

const logger = require('../src/utils/logger');
const { notFound, errorHandler, wrapAsync } = require('../src/middleware/errorHandler');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mockReq = (overrides = {}) => ({
  method: 'POST',
  originalUrl: '/api/chats/123/messages',
  headers: {},
  ...overrides,
});

describe('errorHandler middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = 'test';
  });

  describe('notFound', () => {
    it('returns 404 with structured JSON and endpoint info', () => {
      const req = mockReq({ method: 'GET', originalUrl: '/api/unknown' });
      const res = mockRes();

      notFound(req, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          code: 'NOT_FOUND',
          message: expect.stringContaining('/api/unknown'),
        })
      );
    });
  });

  describe('errorHandler', () => {
    it('uses the error status and code when provided', () => {
      const err = Object.assign(new Error('Chat not found'), { status: 404, code: 'CHAT_NOT_FOUND' });
      const res = mockRes();

      errorHandler(err, mockReq(), res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(404);
      const body = res.json.mock.calls[0][0];
      expect(body.code).toBe('CHAT_NOT_FOUND');
      expect(body.message).toBe('Chat not found');
      expect(body.success).toBe(false);
    });

    it('logs the error with request context (method, url, code, status)', () => {
      const err = Object.assign(new Error('DB connection lost'), { code: 'DB_ERROR' });
      const req = mockReq({ requestId: 'req-42', user: { id: 'user-1' } });
      const res = mockRes();

      errorHandler(err, req, res, jest.fn());

      expect(logger.error).toHaveBeenCalledTimes(1);
      const [message, context] = logger.error.mock.calls[0];
      expect(message).toContain('DB_ERROR');
      expect(message).toContain('DB connection lost');
      expect(context).toEqual(
        expect.objectContaining({
          code: 'DB_ERROR',
          status: 500,
          method: 'POST',
          url: '/api/chats/123/messages',
          requestId: 'req-42',
          userId: 'user-1',
        })
      );
    });

    it('includes the stack trace in the log for 500 errors', () => {
      const err = new Error('Unexpected failure');
      err.stack = 'Error: Unexpected failure\n    at somewhere.js:1:1';
      const res = mockRes();

      errorHandler(err, mockReq(), res, jest.fn());

      const context = logger.error.mock.calls[0][1];
      expect(context.stack).toContain('at somewhere.js');
    });

    it('defaults to 500 INTERNAL_ERROR for unknown errors', () => {
      const res = mockRes();

      errorHandler(new Error('Boom'), mockReq(), res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, code: 'INTERNAL_ERROR', message: 'Boom' })
      );
    });

    it('hides internal error messages from clients in production', () => {
      process.env.NODE_ENV = 'production';
      const res = mockRes();

      errorHandler(new Error('secret stack detail'), mockReq(), res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(500);
      const body = res.json.mock.calls[0][0];
      expect(body.message).toBe('Внутренняя ошибка сервера');
      expect(body.message).not.toContain('secret');
      // but the real message is still logged
      expect(logger.error.mock.calls[0][0]).toContain('secret stack detail');
    });

    it('never leaks error messages with status < 500 even in production', () => {
      process.env.NODE_ENV = 'production';
      const err = Object.assign(new Error('Validation failed'), { status: 400, code: 'VALIDATION_ERROR' });
      const res = mockRes();

      errorHandler(err, mockReq(), res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].message).toBe('Validation failed');
    });
  });

  describe('wrapAsync', () => {
    it('passes errors from rejected async handlers to next()', async () => {
      const failure = new Error('async failure');
      const handler = async () => {
        throw failure;
      };
      const next = jest.fn();

      await wrapAsync(handler)(mockReq(), mockRes(), next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith(failure);
    });

    it('does not call next for successful handlers', async () => {
      const res = mockRes();
      const handler = async (req, res) => {
        res.status(200).json({ ok: true });
      };
      const next = jest.fn();

      await wrapAsync(handler)(mockReq(), res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(next).not.toHaveBeenCalled();
    });
  });
});
