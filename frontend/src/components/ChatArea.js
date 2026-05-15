import React, { useEffect, useRef } from 'react';
import { PanelLeftOpen, Plus } from 'lucide-react';
import MessageList from './MessageList';
import ChatInput from './ChatInput';

const ChatArea = ({
  sidebarOpen,
  messages,
  isLoading,
  isStreaming,
  error,
  attachments,
  isUploading,
  activeConversation,
  onSend,
  onUpload,
  onRemoveAttachment,
  onClearError,
  onNewChat,
  onToggleSidebar,
}) => {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <main className={`chat-area ${sidebarOpen ? 'chat-area--sidebar-open' : ''}`}>
      {/* Header */}
      <header className="chat-header">
        {!sidebarOpen && (
          <button className="chat-header__icon-btn" onClick={onToggleSidebar} title="Open sidebar">
            <PanelLeftOpen size={18} />
          </button>
        )}
        <h1 className="chat-header__title">
          {activeConversation?.title || 'New Conversation'}
        </h1>
        {!sidebarOpen && (
          <button className="chat-header__icon-btn" onClick={onNewChat} title="New chat">
            <Plus size={18} />
          </button>
        )}
      </header>

      {/* Messages */}
      <div className="chat-messages">
        {messages.length === 0 && !isLoading && (
          <div className="chat-welcome">
            <div className="chat-welcome__icon">✦</div>
            <h2 className="chat-welcome__title">How can I help you today?</h2>
            <p className="chat-welcome__subtitle">
              Ask me anything — I can help with writing, analysis, coding, and more.
            </p>
          </div>
        )}

        {isLoading && (
          <div className="chat-loading">
            <div className="dot-pulse" />
            <span>Loading conversation…</span>
          </div>
        )}

        <MessageList messages={messages} />

        {error && (
          <div className="chat-error">
            <span>⚠ {error}</span>
            <button onClick={onClearError}>✕</button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <ChatInput
        onSend={onSend}
        onUpload={onUpload}
        onRemoveAttachment={onRemoveAttachment}
        attachments={attachments}
        isUploading={isUploading}
        isStreaming={isStreaming}
      />
    </main>
  );
};

export default ChatArea;
