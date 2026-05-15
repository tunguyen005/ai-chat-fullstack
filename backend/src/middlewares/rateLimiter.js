const rateLimit = require('express-rate-limit');

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100, // 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { 
    success: false, 
    error: 'Too many requests, please try again later.' 
  },
  skip: (req) => {
    // Skip rate limiting for health check and static files
    return req.path === '/health' || req.path.startsWith('/uploads');
  }
});

// Strict rate limiter for sensitive endpoints
const strictLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { 
    success: false, 
    error: 'Rate limit exceeded for this action. Please try again later.' 
  }
});

// Upload rate limiter (more restrictive)
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 uploads per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { 
    success: false, 
    error: 'Too many file uploads. Please wait before uploading again.' 
  }
});

// Message rate limiter (for chat endpoints)
const messageLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 messages per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { 
    success: false, 
    error: 'Too many messages. Please slow down your requests.' 
  }
});

module.exports = {
  apiLimiter,
  strictLimiter,
  uploadLimiter,
  messageLimiter
};
