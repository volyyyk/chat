const redis = require('redis');
const dotenv = require('dotenv');

dotenv.config();

const { REDIS_HOST, REDIS_PORT, REDIS_PASSWORD, NODE_ENV } = process.env;

let client;

if (NODE_ENV === 'production') {
  client = redis.createClient({
    url: `redis://${REDIS_HOST}:${REDIS_PORT}`,
    password: REDIS_PASSWORD,
    socket: {
      tls: true,
      rejectUnauthorized: false,
    },
  });
} else {
  client = redis.createClient({
    socket: {
      host: REDIS_HOST || 'localhost',
      port: REDIS_PORT || 6379,
    },
    password: REDIS_PASSWORD,
  });
}

// Error handling
client.on('error', (err) => {
  console.error('❌ Redis Client Error:', err);
});

// Connect
(async () => {
  try {
    await client.connect();
    console.log('✅ Redis client connected.');
  } catch (err) {
    console.error('❌ Unable to connect to Redis:', err);
  }
})();

// Graceful shutdown
process.on('SIGINT', async () => {
  await client.quit();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await client.quit();
  process.exit(0);
});

module.exports = client;
