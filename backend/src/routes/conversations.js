const express = require('express');
const router = express.Router();
const {
  getConversations,
  getConversation,
  createConversation,
  updateConversation,
  deleteConversation,
} = require('../controllers/conversationController');

// GET /api/conversations?userId=&page=&limit=
router.get('/', getConversations);

// GET /api/conversations/:id  (includes messages)
router.get('/:id', getConversation);

// POST /api/conversations
router.post('/', createConversation);

// PATCH /api/conversations/:id
router.patch('/:id', updateConversation);

// DELETE /api/conversations/:id
router.delete('/:id', deleteConversation);

module.exports = router;
