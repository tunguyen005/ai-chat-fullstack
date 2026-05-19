require('dotenv').config();
const Groq = require('groq-sdk');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { buildFileContext } = require('../services/fileExtractor');
const { buildImageContext } = require('../services/visionService');
const { generateImage, extractImagePromptFromMessage } = require('../services/imageGenerator');
const { pushMessage, getMessages: getCachedMessages } = require('../services/cacheService');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const GROQ_MODEL = process.env.GROQ_MODEL;

const SYSTEM_PROMPT = `You are a helpful AI assistant. Be concise, accurate, and friendly.
When the user attaches files or images, their extracted content will be provided to you — use it to answer.
Format responses using markdown when appropriate.
IMPORTANT: When a user asks to "export", "save as file", "tạo file", "xuất file" — 
tell them to use the Export button (↓ icon) on any message. Do NOT fabricate download links or pastebin URLs.`;

const callGroq = async (messages) => {
  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    messages,
    temperature: 0.7,
    max_tokens: 4096,
    stream: false,
  });
  return completion.choices[0]?.message?.content || '';
};

const callGroqStream = async (messages, onDelta) => {
  const stream = await groq.chat.completions.create({
    model: GROQ_MODEL,
    messages,
    temperature: 0.7,
    max_tokens: 4096,
    stream: true,
  });

  let fullContent = '';
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content || '';
    if (delta) {
      fullContent += delta;
      onDelta(delta);
    }
  }
  return fullContent;
};

const buildAttachmentContext = async (attachments = []) => {
  if (!attachments.length) return '';

  const imageAtts = attachments.filter((a) => a.mimetype?.startsWith('image/'));
  const fileAtts  = attachments.filter((a) => !a.mimetype?.startsWith('image/'));

  const localise = (att) => ({ ...att, localPath: att.url });

  const [fileContext, imageContext] = await Promise.all([
    buildFileContext(fileAtts.map(localise)),
    buildImageContext(imageAtts.map(localise)),
  ]);

  return [fileContext, imageContext].filter(Boolean).join('\n\n');
};

const buildHistory = async (conversationId, excludeId) => {
  try {
    const cached = await getCachedMessages(conversationId, 40);
    if (cached?.length) {
      return cached
        .filter((m) => String(m._id) !== String(excludeId) && m.role !== 'system')
        .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));
    }
  } catch (e) {
    console.warn('[buildHistory] Redis miss:', e.message);
  }

  const history = await Message.find({
    conversationId,
    _id: { $ne: excludeId },
    isError: { $ne: true },
  })
    .sort({ createdAt: 1 })
    .limit(40)
    .lean();

  try {
    for (const m of history) {
      await pushMessage(conversationId, {
        _id: String(m._id), role: m.role, content: m.content, createdAt: m.createdAt,
      });
    }
  } catch { /* noop */ }

  return history
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));
};

const tryPush = async (convId, msg) => {
  try {
    await pushMessage(convId, {
      _id: String(msg._id), role: msg.role, content: msg.content, createdAt: msg.createdAt,
    });
  } catch { /* noop */ }
};

const detectFlow = (content, attachments) => {
  const hasImageAttachment = attachments.some((a) => a.mimetype?.startsWith('image/'));
  if (hasImageAttachment) return { flow: 'vision' };

  const imagePrompt = extractImagePromptFromMessage(content || '');
  if (imagePrompt) return { flow: 'imagegen', imagePrompt };

  return { flow: 'normal' };
};

const getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const conv = await Conversation.findById(conversationId);
    if (!conv) return res.status(404).json({ success: false, error: 'Conversation not found' });

    const [messages, total] = await Promise.all([
      Message.find({ conversationId }).sort({ createdAt: 1 }).skip(skip).limit(parseInt(limit)).lean(),
      Message.countDocuments({ conversationId }),
    ]);

    res.json({
      success: true,
      data: messages,
      pagination: { total, page: parseInt(page), limit: parseInt(limit) },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

const sendMessage = async (req, res) => {
  try {
    const { conversationId, content, attachments = [], userId = 'anonymous' } = req.body;

    if (!content?.trim() && !attachments.length) {
      return res.status(400).json({ success: false, error: 'Content or attachments required' });
    }

    const { flow, imagePrompt } = detectFlow(content, attachments);

    let conversation = conversationId ? await Conversation.findById(conversationId) : null;
    if (!conversation) {
      conversation = await Conversation.create({
        title: (content || 'Untitled').slice(0, 60),
        userId,
      });
    }

    const userMessage = await Message.create({
      conversationId: conversation._id,
      role: 'user',
      content: content || '',
      attachments,
    });
    await tryPush(conversation._id, userMessage);

    if (flow === 'imagegen') {
      try {
        const imageResult = await generateImage(imagePrompt);
        const aiContent =
          `Here's the generated image:\n\n![Generated image](${imageResult.url})\n\n` +
          `*Prompt: "${imagePrompt}" — Provider: ${imageResult.provider}*`;

        const aiMessage = await Message.create({
          conversationId: conversation._id,
          role: 'assistant',
          content: aiContent,
          metadata: { imageUrl: imageResult.url, imageProvider: imageResult.provider },
        });
        await tryPush(conversation._id, aiMessage);
        await Conversation.findByIdAndUpdate(conversation._id, {
          lastMessageAt: new Date(), $inc: { messageCount: 2 },
        });
        return res.json({ success: true, data: { userMessage, aiMessage, conversationId: conversation._id } });
      } catch (imgErr) {
        const aiMessage = await Message.create({
          conversationId: conversation._id, role: 'assistant',
          content: `Image generation failed: ${imgErr.message}`, isError: true,
        });
        return res.json({ success: true, data: { userMessage, aiMessage, conversationId: conversation._id } });
      }
    }

    const attachmentContext = await buildAttachmentContext(attachments);
    const history = await buildHistory(conversation._id, userMessage._id);
    const userContent = [attachmentContext, content].filter(Boolean).join('\n\n');

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history,
      { role: 'user', content: userContent },
    ];

    const aiContent = await callGroq(messages);

    const aiMessage = await Message.create({
      conversationId: conversation._id,
      role: 'assistant',
      content: aiContent,
      model: GROQ_MODEL,
    });
    await tryPush(conversation._id, aiMessage);

    await Conversation.findByIdAndUpdate(conversation._id, {
      lastMessageAt: new Date(),
      $inc: { messageCount: 2 },
      ...(conversation.messageCount === 0 ? { title: (content || 'File').slice(0, 60) } : {}),
    });

    res.json({ success: true, data: { userMessage, aiMessage, conversationId: conversation._id } });
  } catch (err) {
    console.error('[sendMessage]', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

const streamMessage = async (req, res) => {
  const { conversationId, content, attachments = [], userId = 'anonymous' } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_URL || '*');
  res.flushHeaders();

  const send = (event, data) => {
    try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch { /* client disconnected */ }
  };

  try {
    const { flow, imagePrompt } = detectFlow(content, attachments);

    let conversation = conversationId ? await Conversation.findById(conversationId) : null;
    if (!conversation) {
      conversation = await Conversation.create({ title: (content || 'Untitled').slice(0, 60), userId });
    }

    const userMessage = await Message.create({
      conversationId: conversation._id, role: 'user', content: content || '', attachments,
    });
    await tryPush(conversation._id, userMessage);
    send('message_created', { userMessage, conversationId: conversation._id.toString() });

    if (flow === 'imagegen') {
      send('delta', { text: 'Generating image...\n\n' });
      try {
        const imageResult = await generateImage(imagePrompt);
        const imgMd = `![Generated image](${imageResult.url})\n\n*Provider: ${imageResult.provider}*`;
        send('delta', { text: imgMd });

        const aiContent = `Here's the generated image:\n\n${imgMd}`;
        const aiMessage = await Message.create({
          conversationId: conversation._id, role: 'assistant', content: aiContent,
          metadata: { imageUrl: imageResult.url, imageProvider: imageResult.provider },
        });
        await tryPush(conversation._id, aiMessage);
        await Conversation.findByIdAndUpdate(conversation._id, {
          lastMessageAt: new Date(), $inc: { messageCount: 2 },
        });
        send('done', { aiMessage, conversationId: conversation._id.toString() });
      } catch (imgErr) {
        send('delta', { text: `Image generation failed: ${imgErr.message}` });
        const aiMessage = await Message.create({
          conversationId: conversation._id, role: 'assistant',
          content: `Image generation failed: ${imgErr.message}`, isError: true,
        });
        send('done', { aiMessage, conversationId: conversation._id.toString() });
      }
      return res.end();
    }

    if (attachments.length) {
      send('status', { text: 'Processing attachments...' });
    }

    const attachmentContext = await buildAttachmentContext(attachments);
    const history = await buildHistory(conversation._id, userMessage._id);
    const userContent = [attachmentContext, content].filter(Boolean).join('\n\n');

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history,
      { role: 'user', content: userContent },
    ];

    const fullContent = await callGroqStream(messages, (delta) => {
      send('delta', { text: delta });
    });

    const aiMessage = await Message.create({
      conversationId: conversation._id, role: 'assistant', content: fullContent, model: GROQ_MODEL,
    });
    await tryPush(conversation._id, aiMessage);

    await Conversation.findByIdAndUpdate(conversation._id, {
      lastMessageAt: new Date(),
      $inc: { messageCount: 2 },
      ...(conversation.messageCount === 0 ? { title: (content || 'File').slice(0, 60) } : {}),
    });

    send('done', { aiMessage, conversationId: conversation._id.toString() });
    res.end();
  } catch (err) {
    console.error('[streamMessage]', err);
    send('error', { message: err.message });
    res.end();
  }
};

const generateImageEndpoint = async (req, res) => {
  try {
    const { prompt, provider, width, height, model } = req.body;
    if (!prompt?.trim()) return res.status(400).json({ success: false, error: 'Prompt required' });
    const result = await generateImage(prompt, { provider, width, height, model });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

const deleteMessage = async (req, res) => {
  try {
    const message = await Message.findByIdAndDelete(req.params.id);
    if (!message) return res.status(404).json({ success: false, error: 'Message not found' });
    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = {
  getMessages,
  sendMessage,
  streamMessage,
  generateImage: generateImageEndpoint,
  deleteMessage,
};