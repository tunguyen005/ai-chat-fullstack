let redis = null;
let redisConnected = false;

const CONV_KEY = (id) => `chat:conv:${id}`;
const TTL_SECONDS = 7200; // 2 hours

const initRedis = () => {
  if (redis) return redis;

  const redisUrl = process.env.REDIS_URL;

  try {
    const { default: Redis } = require('ioredis');
    redis = new Redis(redisUrl, {
      lazyConnect: true,
      retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 2000)),
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 3000,
    });

    redis.on('connect', () => {
      redisConnected = true;
      console.log('✅ Redis connected:', redisUrl);
    });

    redis.on('error', (err) => {
      if (redisConnected) console.warn('⚠️  Redis error (will use DB fallback):', err.message);
      redisConnected = false;
    });

    redis.on('close', () => { redisConnected = false; });

    redis.connect().catch(() => { redisConnected = false; });
  } catch (err) {
    console.warn('⚠️  ioredis not available, using DB-only mode:', err.message);
  }

  return redis;
};

initRedis();

const pushMessage = async (conversationId, message) => {
  if (!redis || !redisConnected) return;

  const key = CONV_KEY(String(conversationId));
  const value = JSON.stringify(message);

  // RPUSH to list, then expire
  await redis.rpush(key, value);
  await redis.expire(key, TTL_SECONDS);
};

const getMessages = async (conversationId, limit = 40) => {
  if (!redis || !redisConnected) return null;

  const key = CONV_KEY(String(conversationId));
  const raw = await redis.lrange(key, -limit, -1);

  if (!raw || !raw.length) return null;

  return raw.map((s) => {
    try { return JSON.parse(s); }
    catch { return null; }
  }).filter(Boolean);
};

const invalidateConversation = async (conversationId) => {
  if (!redis || !redisConnected) return;
  await redis.del(CONV_KEY(String(conversationId)));
};

const isRedisAvailable = () => redisConnected;

module.exports = { pushMessage, getMessages, invalidateConversation, isRedisAvailable };
