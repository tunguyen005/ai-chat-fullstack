const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const CONV_KEY = (id) => `chat:conv:${id}`;
const TTL_SECONDS = 7200; // 2 hours

const pushMessage = async (conversationId, message) => {
  const key = CONV_KEY(String(conversationId));
  await redis.rpush(key, JSON.stringify(message));
  await redis.expire(key, TTL_SECONDS);
};

const getMessages = async (conversationId, limit = 40) => {
  const key = CONV_KEY(String(conversationId));
  try {
    const raw = await redis.lrange(key, -limit, -1);
    if (!raw?.length) return null;
    return raw.map((item) =>
      typeof item === 'string' ? JSON.parse(item) : item
    ).filter(Boolean);
  } catch {
    return null;
  }
};

const invalidateConversation = async (conversationId) => {
  await redis.del(CONV_KEY(String(conversationId)));
};

const isRedisAvailable = () => true;

module.exports = { pushMessage, getMessages, invalidateConversation, isRedisAvailable };