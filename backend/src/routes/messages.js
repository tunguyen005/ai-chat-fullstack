const express = require('express');
const router = express.Router();
const {
  getMessages,
  sendMessage,
  streamMessage,
  deleteMessage,
  generateImage,
} = require('../controllers/messageController');

// GET /api/messages/:conversationId
router.get('/:conversationId', getMessages);

// POST /api/messages  (standard)
router.post('/', sendMessage);

// POST /api/messages/stream  (SSE streaming)
router.post('/stream', streamMessage);

// POST /api/messages/generate-image
router.post('/generate-image', generateImage);

// DELETE /api/messages/:id
router.delete('/:id', deleteMessage);

module.exports = router;
