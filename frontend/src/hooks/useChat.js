import { useState, useCallback, useRef } from 'react';
import { conversationAPI, uploadAPI, streamMessage } from '../services/api';
import { v4 as uuidv4 } from 'uuid';

const USER_ID = 'user_' + (localStorage.getItem('chatUserId') || (() => {
  const id = uuidv4();
  localStorage.setItem('chatUserId', id);
  return id;
})());

export const useChat = () => {
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const abortRef = useRef(false);

  // ── Load conversations ──────────────────────────────────────────────────────
  const loadConversations = useCallback(async () => {
    try {
      const res = await conversationAPI.getAll({ userId: USER_ID });
      setConversations(res.data || []);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  // ── Select conversation ─────────────────────────────────────────────────────
  const selectConversation = useCallback(async (conv) => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await conversationAPI.getById(conv._id);
      setActiveConversation(res.data);
      setMessages(res.data.messages || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── New conversation ────────────────────────────────────────────────────────
  const newConversation = useCallback(() => {
    setActiveConversation(null);
    setMessages([]);
    setAttachments([]);
    setError(null);
  }, []);

  // ── Delete conversation ─────────────────────────────────────────────────────
  const deleteConversation = useCallback(async (id) => {
    try {
      await conversationAPI.delete(id);
      setConversations((prev) => prev.filter((c) => c._id !== id));
      if (activeConversation?._id === id) {
        setActiveConversation(null);
        setMessages([]);
      }
    } catch (err) {
      setError(err.message);
    }
  }, [activeConversation]);

  // ── Upload files ────────────────────────────────────────────────────────────
  const uploadFiles = useCallback(async (files) => {
    if (!files.length) return;
    setIsUploading(true);
    try {
      const res = await uploadAPI.upload(Array.from(files));
      setAttachments((prev) => [...prev, ...(res.data || [])]);
    } catch (err) {
      setError('Upload failed: ' + err.message);
    } finally {
      setIsUploading(false);
    }
  }, []);

  const removeAttachment = useCallback((url) => {
    setAttachments((prev) => prev.filter((a) => a.url !== url));
  }, []);

  // ── Send message ────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (content) => {
    if (!content.trim() && !attachments.length) return;
    setError(null);
    abortRef.current = false;

    // Optimistic user message
    const tempUserMsg = {
      _id: 'temp_u_' + Date.now(),
      role: 'user',
      content,
      attachments: [...attachments],
      createdAt: new Date().toISOString(),
    };

    // Optimistic AI placeholder
    const tempAiMsg = {
      _id: 'temp_ai_' + Date.now(),
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
      _streaming: true,
    };

    setMessages((prev) => [...prev, tempUserMsg, tempAiMsg]);
    setAttachments([]);
    setIsStreaming(true);

    try {
      let convId = activeConversation?._id || null;
      let streamingContent = '';

      await streamMessage(
        {
          conversationId: convId,
          content,
          attachments,
          userId: USER_ID,
        },
        {
          onMessageCreated: ({ conversationId, userMessage }) => {
            convId = conversationId;
            // Replace temp user message with real one
            setMessages((prev) =>
              prev.map((m) =>
                m._id === tempUserMsg._id ? { ...userMessage, _id: userMessage._id || userMessage.id } : m
              )
            );
          },
          onDelta: (text) => {
            if (abortRef.current) return;
            streamingContent += text;
            setMessages((prev) =>
              prev.map((m) =>
                m._id === tempAiMsg._id ? { ...m, content: streamingContent } : m
              )
            );
          },
          onDone: ({ aiMessage, conversationId }) => {
            // Replace temp AI message with real saved one
            setMessages((prev) =>
              prev.map((m) =>
                m._id === tempAiMsg._id
                  ? { ...aiMessage, _id: aiMessage._id || aiMessage.id, _streaming: false }
                  : m
              )
            );

            // Update or set active conversation
            const newConv = {
              _id: conversationId,
              title: content.slice(0, 60) || 'New Conversation',
              lastMessageAt: new Date().toISOString(),
            };
            setActiveConversation((prev) => prev || newConv);
            setConversations((prev) => {
              const exists = prev.find((c) => c._id === conversationId);
              if (exists) {
                return prev
                  .map((c) => (c._id === conversationId ? { ...c, lastMessageAt: new Date().toISOString() } : c))
                  .sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));
              }
              return [newConv, ...prev];
            });
          },
          onError: (err) => {
            setError(err.message);
            setMessages((prev) => prev.filter((m) => m._id !== tempAiMsg._id));
          },
        }
      );
    } catch (err) {
      setError(err.message);
      setMessages((prev) =>
        prev.filter((m) => m._id !== tempAiMsg._id && m._id !== tempUserMsg._id)
      );
    } finally {
      setIsStreaming(false);
    }
  }, [activeConversation, attachments]);

  return {
    conversations,
    activeConversation,
    messages,
    isLoading,
    isStreaming,
    error,
    attachments,
    isUploading,
    loadConversations,
    selectConversation,
    newConversation,
    deleteConversation,
    sendMessage,
    uploadFiles,
    removeAttachment,
    setError,
  };
};
