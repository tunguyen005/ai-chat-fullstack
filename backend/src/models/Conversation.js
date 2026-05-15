const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      default: 'New Conversation',
      maxlength: 200,
    },
    userId: {
      type: String,
      default: 'anonymous',
      index: true,
    },
    messageCount: {
      type: Number,
      default: 0,
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
    metadata: {
      type: Map,
      of: String,
      default: {},
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

conversationSchema.index({ userId: 1, createdAt: -1 });
conversationSchema.index({ lastMessageAt: -1 });

module.exports = mongoose.model('Conversation', conversationSchema);
