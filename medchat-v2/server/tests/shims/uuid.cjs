// CJS-шим uuid для jest: uuid 14 ESM-only, а jest на Node 22 не умеет
// require(esm) (нативно это умеет только Node 24.9+). Рантайм сервера не
// затронут: Node >= 22.13 (engines) грузит uuid 14 через require(esm) сам.
// v4 -> crypto.randomUUID(): тот же UUIDv4 из стандартной библиотеки.
const crypto = require('crypto');

module.exports = {
  v4: () => crypto.randomUUID(),
  v1: () => { throw new Error('uuid v1 не используется в medchat-server'); },
  v5: () => { throw new Error('uuid v5 не используется в medchat-server'); },
  validate: (u) => typeof u === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(u),
};
