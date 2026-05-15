import React, { useState, useRef, useCallback } from 'react';
import { Plus, Send, X, Loader2, FileText, Image } from 'lucide-react';

const API_BASE = process.env.REACT_APP_API_URL?.replace('/api', '');

const AttachmentPreview = ({ att, onRemove }) => {
  const isImage = att.mimetype?.startsWith('image/');
  const url = att.url?.startsWith('http') ? att.url : `${API_BASE}${att.url}`;

  return (
    <div className="attachment-preview">
      {isImage ? (
        <img src={url} alt={att.originalName} className="attachment-preview__img" />
      ) : (
        <div className="attachment-preview__file">
          <FileText size={16} />
          <span className="attachment-preview__name">{att.originalName}</span>
        </div>
      )}
      <button
        className="attachment-preview__remove"
        onClick={() => onRemove(att.url)}
        title="Remove file"
      >
        <X size={11} />
      </button>
    </div>
  );
};

const ChatInput = ({
  onSend,
  onUpload,
  onRemoveAttachment,
  attachments,
  isUploading,
  isStreaming,
}) => {
  const [text, setText] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  const handleSend = useCallback(() => {
    if ((!text.trim() && !attachments.length) || isStreaming) return;
    onSend(text.trim());
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [text, attachments, isStreaming, onSend]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextChange = (e) => {
    setText(e.target.value);
    // Auto-resize textarea
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
    }
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length) onUpload(files);
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) onUpload(files);
  };

  const canSend = (text.trim() || attachments.length > 0) && !isStreaming && !isUploading;

  return (
    <div className="chat-input-area">
      {/* Attachment previews */}
      {attachments.length > 0 && (
        <div className="attachment-strip">
          {attachments.map((att, i) => (
            <AttachmentPreview
              key={att.url || i}
              att={att}
              onRemove={onRemoveAttachment}
            />
          ))}
        </div>
      )}

      {/* Main input box */}
      <div
        className={`chat-input-box ${dragOver ? 'chat-input-box--dragover' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {/* Plus / upload button */}
        <button
          className="chat-input__upload-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading || isStreaming}
          title="Attach files"
        >
          {isUploading ? <Loader2 size={18} className="spin" /> : <Plus size={18} />}
        </button>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.txt,.csv,.md,.json,.doc,.docx"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          className="chat-input__textarea"
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          placeholder={isStreaming ? 'AI is responding…' : 'Message AI… (Shift+Enter for newline)'}
          rows={1}
          disabled={isStreaming}
        />

        {/* Send button */}
        <button
          className={`chat-input__send-btn ${canSend ? 'chat-input__send-btn--active' : ''}`}
          onClick={handleSend}
          disabled={!canSend}
          title="Send message"
        >
          {isStreaming ? (
            <Loader2 size={16} className="spin" />
          ) : (
            <Send size={16} />
          )}
        </button>
      </div>

      <p className="chat-input__hint">
        AI can make mistakes. Verify important information.
      </p>
    </div>
  );
};

export default ChatInput;
