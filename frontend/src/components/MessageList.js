import React, { useState, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import {
  Bot, User, Paperclip, Copy, Check, Pencil, X,
  Download, FileText, FileCode, ChevronDown
} from 'lucide-react';

const RAW_API = process.env.REACT_APP_API_URL;
const API_BASE = RAW_API.endsWith('/api') ? RAW_API.slice(0, -4) : RAW_API;

const toFullUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  if (url.startsWith('/')) return `${API_BASE}${url}`;
  return `${API_BASE}/${url}`;
};

const detectExportableContent = (content = '') => {
  const codeBlocks = [];
  const regex = /```(\w+)?\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const lang = match[1]?.toLowerCase() || 'txt';
    const code = match[2].trim();
    if (code.length > 10) {
      codeBlocks.push({ lang, code, ext: langToExt(lang) });
    }
  }

  const hasLargeContent = content.length > 300;
  const hasStructure = /^#{1,3}\s/m.test(content) || codeBlocks.length > 0;

  return { codeBlocks, hasLargeContent, hasStructure, exportable: codeBlocks.length > 0 || (hasLargeContent && hasStructure) };
};

const langToExt = (lang) => {
  const map = {
    javascript: 'js', typescript: 'ts', python: 'py', java: 'java',
    cpp: 'cpp', c: 'c', csharp: 'cs', go: 'go', rust: 'rs',
    html: 'html', css: 'css', jsx: 'jsx', tsx: 'tsx',
    json: 'json', yaml: 'yml', bash: 'sh', shell: 'sh',
    sql: 'sql', markdown: 'md', txt: 'txt', php: 'php',
    kotlin: 'kt', swift: 'swift', ruby: 'rb',
  };
  return map[lang] || lang || 'txt';
};

const getMimeType = (ext) => {
  const map = {
    js: 'application/javascript', ts: 'application/typescript',
    py: 'text/x-python', html: 'text/html', css: 'text/css',
    json: 'application/json', md: 'text/markdown', sh: 'text/x-sh',
    sql: 'text/x-sql', txt: 'text/plain',
  };
  return map[ext] || 'text/plain';
};

const triggerDownload = (content, filename, mimeType = 'text/plain') => {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const downloadDocx = async (content, filename = 'document') => {
  const res = await fetch(`${RAW_API}/export/docx`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, filename }),
  });
  if (!res.ok) throw new Error('Export failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const CodeBlock = ({ lang, code, index }) => {
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const ext = langToExt(lang);
  const filename = `code_${index + 1}.${ext}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownload = () => {
    triggerDownload(code, filename, getMimeType(ext));
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 1800);
  };

  return (
    <div className="code-block">
      <div className="code-block__header">
        <span className="code-block__lang">{lang || 'code'}</span>
        <div className="code-block__actions">
          <button className={`code-btn ${downloaded ? 'code-btn--done' : ''}`} onClick={handleDownload} title={`Download as ${filename}`}>
            {downloaded ? <Check size={12} /> : <Download size={12} />}
            <span>{downloaded ? 'Saved' : filename}</span>
          </button>
          <button className={`code-btn ${copied ? 'code-btn--done' : ''}`} onClick={handleCopy} title="Copy code">
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
        </div>
      </div>
      <SyntaxHighlighter
        style={oneDark}
        language={lang || 'text'}
        PreTag="div"
        customStyle={{ margin: 0, borderRadius: '0 0 8px 8px', fontSize: '13px' }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
};

const MessageExportPanel = ({ content, codeBlocks }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(null);

  const handle = async (type, data) => {
    setLoading(type);
    try {
      if (type === 'md') {
        triggerDownload(data.content, data.filename + '.md', 'text/markdown');
      } else if (type === 'txt') {
        // Strip markdown
        const plain = data.content.replace(/#{1,6}\s/g, '').replace(/\*\*/g, '').replace(/`/g, '');
        triggerDownload(plain, data.filename + '.txt', 'text/plain');
      } else if (type === 'docx') {
        await downloadDocx(data.content, data.filename);
      } else if (type === 'code') {
        triggerDownload(data.code, data.filename, getMimeType(data.ext));
      }
    } catch (e) {
      alert('Export failed: ' + e.message);
    } finally {
      setLoading(null);
      setOpen(false);
    }
  };

  return (
    <div className="msg__export-wrap">
      <button className={`msg__action-btn ${open ? 'msg__action-btn--active' : ''}`} onClick={() => setOpen(v => !v)} title="Download / Export">
        <Download size={13} />
      </button>

      {open && (
        <>
          <div className="msg__export-backdrop" onClick={() => setOpen(false)} />
          <div className="msg__export-menu">
            <div className="msg__export-section-label">Full message</div>
            <button disabled={loading === 'md'} onClick={() => handle('md', { content, filename: 'response' })}>
              <FileText size={13} /> Markdown (.md)
            </button>
            <button disabled={loading === 'txt'} onClick={() => handle('txt', { content, filename: 'response' })}>
              <FileText size={13} /> Plain text (.txt)
            </button>
            <button disabled={loading === 'docx'} onClick={() => handle('docx', { content, filename: 'response' })}>
              {loading === 'docx' ? '...' : <><FileText size={13} /> Word (.docx)</>}
            </button>

            {codeBlocks.length > 0 && (
              <>
                <div className="msg__export-divider" />
                <div className="msg__export-section-label">Code files</div>
                {codeBlocks.map((cb, i) => {
                  const fname = `code_${i + 1}.${cb.ext}`;
                  return (
                    <button key={i} disabled={loading === `code_${i}`}
                      onClick={() => handle('code', { code: cb.code, filename: fname, ext: cb.ext })}>
                      <FileCode size={13} /> {fname}
                    </button>
                  );
                })}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};

const Attachment = ({ att }) => {
  const isImage = att.mimetype?.startsWith('image/');
  const url = toFullUrl(att.url);
  if (isImage) {
    return (
      <div className="msg__attachment">
        <img src={url} alt={att.originalName} className="msg__attachment-img"
          onError={(e) => { e.target.style.display = 'none'; }} />
      </div>
    );
  }
  return (
    <div className="msg__attachment">
      <a href={url} target="_blank" rel="noreferrer" className="msg__attachment-file" download={att.originalName}>
        <Paperclip size={13} /><span>{att.originalName}</span><Download size={11} style={{ opacity: 0.5 }} />
      </a>
    </div>
  );
};

const CopyButton = ({ text }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <button className={`msg__action-btn ${copied ? 'msg__action-btn--done' : ''}`} onClick={handleCopy} title="Copy">
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
};

const EditableMessage = ({ content, onSave, onCancel }) => {
  const [value, setValue] = useState(content);
  return (
    <div className="msg__edit">
      <textarea className="msg__edit-textarea" value={value}
        onChange={(e) => setValue(e.target.value)} autoFocus
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSave(value); } if (e.key === 'Escape') onCancel(); }}
      />
      <div className="msg__edit-actions">
        <button className="msg__edit-save" onClick={() => onSave(value)}>Save & resend</button>
        <button className="msg__edit-cancel" onClick={onCancel}><X size={13} /> Cancel</button>
      </div>
    </div>
  );
};

const Message = ({ message, onEdit }) => {
  const isUser = message.role === 'user';
  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);

  const { codeBlocks, exportable } = useMemo(
    () => detectExportableContent(message.content || ''),
    [message.content]
  );

  let codeBlockIndex = 0;

  const handleSaveEdit = (newContent) => {
    setEditing(false);
    if (onEdit) onEdit(message, newContent);
  };

  return (
    <div className={`msg msg--${message.role}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="msg__avatar">
        {isUser ? <User size={14} /> : <Bot size={14} />}
      </div>

      <div className="msg__body">
        {message.attachments?.length > 0 && (
          <div className="msg__attachments">
            {message.attachments.map((att, i) => <Attachment key={i} att={att} />)}
          </div>
        )}

        {editing ? (
          <EditableMessage content={message.content} onSave={handleSaveEdit} onCancel={() => setEditing(false)} />
        ) : message._streaming && !message.content ? (
          <div className="typing-indicator"><span /><span /><span /></div>
        ) : (
          <div className="msg__content">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                // ── Custom code renderer — shows CodeBlock with download ────
                code({ node, inline, className, children }) {
                  const lang = /language-(\w+)/.exec(className || '')?.[1] || '';
                  const code = String(children).replace(/\n$/, '');
                  if (inline) return <code className={className}>{children}</code>;
                  const idx = codeBlockIndex++;
                  return <CodeBlock lang={lang} code={code} index={idx} />;
                },
                img({ src, alt }) {
                  return <img src={toFullUrl(src)} alt={alt} className="msg__md-img" loading="lazy" />;
                },
                a({ href, children }) {
                  return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
                },
              }}
            >
              {message.content}
            </ReactMarkdown>
            {message._streaming && message.content && (
              <span className="msg__cursor" aria-hidden="true">▋</span>
            )}
          </div>
        )}

        <div className="msg__footer">
          <time className="msg__time">
            {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </time>

          {hovered && !message._streaming && !editing && (
            <div className="msg__actions">
              <CopyButton text={message.content} />
              {isUser && onEdit && (
                <button className="msg__action-btn" onClick={() => setEditing(true)} title="Edit">
                  <Pencil size={13} />
                </button>
              )}
              {!isUser && exportable && (
                <MessageExportPanel content={message.content} codeBlocks={codeBlocks} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const MessageList = ({ messages, onEditMessage }) => (
  <div className="message-list">
    {messages.map((msg) => (
      <Message key={msg._id} message={msg} onEdit={onEditMessage} />
    ))}
  </div>
);

export default MessageList;
