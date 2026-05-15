import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

// ─── Conversations ────────────────────────────────────────────────────────────

export const conversationAPI = {
  getAll: (params = {}) =>
    api.get('/conversations', { params }).then((r) => r.data),

  getById: (id) =>
    api.get(`/conversations/${id}`).then((r) => r.data),

  create: (data = {}) =>
    api.post('/conversations', data).then((r) => r.data),

  update: (id, data) =>
    api.patch(`/conversations/${id}`, data).then((r) => r.data),

  delete: (id) =>
    api.delete(`/conversations/${id}`).then((r) => r.data),
};

// ─── Messages ─────────────────────────────────────────────────────────────────

export const messageAPI = {
  getByConversation: (conversationId, params = {}) =>
    api.get(`/messages/${conversationId}`, { params }).then((r) => r.data),

  send: (data) =>
    api.post('/messages', data).then((r) => r.data),

  delete: (id) =>
    api.delete(`/messages/${id}`).then((r) => r.data),
};

// ─── Upload ───────────────────────────────────────────────────────────────────

export const uploadAPI = {
  upload: (files) => {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    return api
      .post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data);
  },
};

// ─── Streaming SSE helper ─────────────────────────────────────────────────────

export const streamMessage = async (
  { conversationId, content, attachments = [], userId = 'anonymous' },
  { onDelta, onMessageCreated, onDone, onError }
) => {
  const response = await fetch(`${API_BASE}/messages/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId, content, attachments, userId }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'Stream request failed');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    let currentEvent = null;
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          if (currentEvent === 'delta') onDelta?.(data.text);
          else if (currentEvent === 'message_created') onMessageCreated?.(data);
          else if (currentEvent === 'done') onDone?.(data);
          else if (currentEvent === 'error') onError?.(new Error(data.message));
        } catch {
          // skip malformed
        }
      }
    }
  }
};

export default api;
