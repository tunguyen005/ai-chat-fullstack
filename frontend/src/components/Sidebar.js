import React, { useState } from 'react';
import { PlusCircle, MessageSquare, Trash2, ChevronLeft, ChevronRight, Bot, Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const diffH = Math.floor(diffMs / 3600000);
  const diffD = Math.floor(diffMs / 86400000);
  if (diffH < 1) return 'Just now';
  if (diffH < 24) return `${diffH}h ago`;
  if (diffD < 7) return `${diffD}d ago`;
  return d.toLocaleDateString();
};

const Sidebar = ({
  open,
  onToggle,
  conversations,
  activeConversation,
  onSelect,
  onNew,
  onDelete,
}) => {
  const [hoveredId, setHoveredId] = useState(null);
  const { theme, toggleTheme } = useTheme();

  return (
    <aside className={`sidebar ${open ? 'sidebar--open' : 'sidebar--closed'}`}>
      <div className="sidebar__header">
        {open && (
          <div className="sidebar__brand">
            <Bot size={20} className="sidebar__logo" />
            <span className="sidebar__title">AI Chat</span>
          </div>
        )}
        <div className="sidebar__header-actions">
          {open && (
            <button 
              className="sidebar__theme-btn" 
              onClick={toggleTheme} 
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          )}
          <button className="sidebar__toggle" onClick={onToggle} title={open ? 'Close sidebar' : 'Open sidebar'}>
            {open ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
          </button>
        </div>
      </div>

      {open && (
        <>
          <button className="sidebar__new-btn" onClick={onNew}>
            <PlusCircle size={16} />
            <span>New Chat</span>
          </button>

          <div className="sidebar__list">
            {conversations.length === 0 && (
              <p className="sidebar__empty">No conversations yet</p>
            )}
            {conversations.map((conv) => (
              <div
                key={conv._id}
                className={`sidebar__item ${activeConversation?._id === conv._id ? 'sidebar__item--active' : ''}`}
                onClick={() => onSelect(conv)}
                onMouseEnter={() => setHoveredId(conv._id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <MessageSquare size={14} className="sidebar__item-icon" />
                <div className="sidebar__item-content">
                  <span className="sidebar__item-title">
                    {conv.title || 'New Conversation'}
                  </span>
                  <span className="sidebar__item-date">
                    {formatDate(conv.lastMessageAt)}
                  </span>
                </div>
                {hoveredId === conv._id && (
                  <button
                    className="sidebar__delete"
                    onClick={(e) => { e.stopPropagation(); onDelete(conv._id); }}
                    title="Delete conversation"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </aside>
  );
};

export default Sidebar;
