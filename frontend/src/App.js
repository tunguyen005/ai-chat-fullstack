import React, { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import { useChat } from './hooks/useChat';
import './App.css';

function App() {
  const chat = useChat();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    chat.loadConversations();
  }, [chat]);

  return (
    <div className="app">
      <Sidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        conversations={chat.conversations}
        activeConversation={chat.activeConversation}
        onSelect={chat.selectConversation}
        onNew={chat.newConversation}
        onDelete={chat.deleteConversation}
      />
      <ChatArea
        sidebarOpen={sidebarOpen}
        messages={chat.messages}
        isLoading={chat.isLoading}
        isStreaming={chat.isStreaming}
        error={chat.error}
        attachments={chat.attachments}
        isUploading={chat.isUploading}
        activeConversation={chat.activeConversation}
        onSend={chat.sendMessage}
        onUpload={chat.uploadFiles}
        onRemoveAttachment={chat.removeAttachment}
        onClearError={() => chat.setError(null)}
        onNewChat={chat.newConversation}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
      />
    </div>
  );
}

export default App;
