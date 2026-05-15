const Conversation = require('../models/Conversation');
const Message = require('../models/Message');

// GET /api/conversations
const getConversations = async (req, res) => {
  try {
    const { page = 1, limit = 20, userId = 'anonymous' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [conversations, total] = await Promise.all([
      Conversation.find({ userId, isArchived: false })
        .sort({ lastMessageAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Conversation.countDocuments({ userId, isArchived: false }),
    ]);

    res.json({
      success: true,
      data: conversations,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET /api/conversations/:id
const getConversation = async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.id).lean();
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const messages = await Message.find({ conversationId: req.params.id })
      .sort({ createdAt: 1 })
      .lean();

    res.json({
      success: true,
      data: { ...conversation, messages },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// POST /api/conversations
const createConversation = async (req, res) => {
  try {
    const { title = 'New Conversation', userId = 'anonymous' } = req.body;

    const conversation = await Conversation.create({ title, userId });

    res.status(201).json({ success: true, data: conversation });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// PATCH /api/conversations/:id
const updateConversation = async (req, res) => {
  try {
    const { title } = req.body;
    const conversation = await Conversation.findByIdAndUpdate(
      req.params.id,
      { title },
      { new: true, runValidators: true }
    );

    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    res.json({ success: true, data: conversation });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// DELETE /api/conversations/:id
const deleteConversation = async (req, res) => {
  try {
    const conversation = await Conversation.findByIdAndDelete(req.params.id);
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    await Message.deleteMany({ conversationId: req.params.id });

    res.json({ success: true, message: 'Conversation deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  getConversations,
  getConversation,
  createConversation,
  updateConversation,
  deleteConversation,
};
