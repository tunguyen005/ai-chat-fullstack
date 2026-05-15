/**
 * @typedef {Object} FileIntent
 * @property {boolean} detected
 * @property {'code'|'doc'|'markdown'|'csv'|'txt'|null} fileType
 * @property {string|null} language     - for code: 'python', 'js', etc.
 * @property {string|null} extension    - '.py', '.md', '.csv', etc.
 * @property {string|null} suggestedName
 * @property {string}      cleanPrompt  - prompt stripped of file-creation keywords
 */

const LANG_MAP = {
  python: { ext: '.py', mime: 'text/x-python' },
  py: { ext: '.py', mime: 'text/x-python' },
  javascript: { ext: '.js', mime: 'application/javascript' },
  js: { ext: '.js', mime: 'application/javascript' },
  typescript: { ext: '.ts', mime: 'application/typescript' },
  ts: { ext: '.ts', mime: 'application/typescript' },
  java: { ext: '.java', mime: 'text/x-java' },
  'c++': { ext: '.cpp', mime: 'text/x-c' },
  cpp: { ext: '.cpp', mime: 'text/x-c' },
  c: { ext: '.c', mime: 'text/x-c' },
  'c#': { ext: '.cs', mime: 'text/x-csharp' },
  csharp: { ext: '.cs', mime: 'text/x-csharp' },
  go: { ext: '.go', mime: 'text/x-go' },
  rust: { ext: '.rs', mime: 'text/x-rust' },
  php: { ext: '.php', mime: 'text/x-php' },
  ruby: { ext: '.rb', mime: 'text/x-ruby' },
  rb: { ext: '.rb', mime: 'text/x-ruby' },
  bash: { ext: '.sh', mime: 'text/x-shellscript' },
  sh: { ext: '.sh', mime: 'text/x-shellscript' },
  shell: { ext: '.sh', mime: 'text/x-shellscript' },
  sql: { ext: '.sql', mime: 'text/x-sql' },
  html: { ext: '.html', mime: 'text/html' },
  css: { ext: '.css', mime: 'text/css' },
  json: { ext: '.json', mime: 'application/json' },
  yaml: { ext: '.yaml', mime: 'text/yaml' },
  yml: { ext: '.yaml', mime: 'text/yaml' },
  xml: { ext: '.xml', mime: 'text/xml' },
  dockerfile: { ext: 'Dockerfile', mime: 'text/plain' },
  swift: { ext: '.swift', mime: 'text/x-swift' },
  kotlin: { ext: '.kt', mime: 'text/x-kotlin' },
  dart: { ext: '.dart', mime: 'text/x-dart' },
  r: { ext: '.r', mime: 'text/x-r' },
  matlab: { ext: '.m', mime: 'text/x-matlab' },
};

const CODE_PATTERNS = [
  /(?:viết|tạo|gen(?:erate)?|write|create|make)\s+(?:(?:a|an|1|một)\s+)?(?:code|script|program|chương trình|đoạn code|file code)\s+(?:bằng\s+|in\s+|using\s+)?(?<lang>[a-z#+]+)?\s*/i,
  /^(?<lang>python|javascript|typescript|java|go|rust|php|ruby|bash|sh|sql|html|css)\s+(?:script|program|code|file)/i,
  /(?:viết|write|create|tạo)\s+(?:a\s+|một\s+)?(?<lang>[a-z#+]+)\s+(?:script|program|module|class|function|hàm)/i,
  /(?:viết|write|create|tạo)\s+(?:a\s+|1\s+|một\s+)?(?:function|class|module|component|hàm|lớp)\s+(?:bằng|in|using|với)\s+(?<lang>[a-z#+]+)/i,
  /(?:tạo|gen|create|write)\s+(?:a\s+)?(?<lang>dockerfile|docker-compose)/i,
];

const DOC_PATTERNS = [
  /(?:viết|tạo|write|create|make|gen(?:erate)?)\s+(?:(?:a|an|1|một|cho tôi)\s+)?(?:file\s+)?(?:ôn tập|tài liệu|document|doc|hướng dẫn|guide|tutorial|readme|báo cáo|report|summary|tóm tắt|note|ghi chú)/i,
  /(?:tạo|viết|write|create)\s+(?:a\s+)?readme/i,
  /(?:viết|write)\s+(?:(?:a|an|1|một)\s+)?(?:bài luận|essay|article|blog post|bài viết)/i,
];

const CSV_PATTERNS = [
  /(?:tạo|xuất|export|create|make|gen)\s+(?:(?:a|an|1|một)\s+)?(?:file\s+)?(?:csv|excel|xlsx|spreadsheet|bảng)/i,
  /(?:danh sách|list|table|bảng)\s+.+\s+(?:dạng|dưới dạng|as|in|format)?\s*(?:csv|excel|xlsx)/i,
];

const TXT_PATTERNS = [
  /(?:tạo|viết|write|create)\s+(?:(?:a|an|1|một)\s+)?(?:file\s+)?(?:txt|text file|plain text)/i,
];

const detectLanguage = (text) => {
  const lower = text.toLowerCase();

  for (const [lang, info] of Object.entries(LANG_MAP)) {
    const escapedLang = lang.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${escapedLang}\\b`, 'i');
    if (re.test(lower)) {
      return { language: lang, ...info };
    }
  }
  return null;
};

const suggestFilename = (text, ext) => {
  let name = text
    .replace(/^(?:viết|tạo|gen(?:erate)?|write|create|make|xuất|cho tôi)\s+/i, '')
    .replace(/(?:file|script|code|program|document|doc|readme|tài liệu)\s*/gi, '')
    .replace(/(?:bằng|in|using|với|cho|for|về|about|of)\s+\S+\s*/gi, ' ')
    .replace(/[^a-zA-Z0-9À-ỹ\s_-]/g, '')
    .trim()
    .slice(0, 40)
    .replace(/\s+/g, '_')
    .toLowerCase();

  return name || 'output';
};

const detectFileIntent = (userMessage) => {
  const text = (userMessage || '').trim();
  const NONE = { detected: false, fileType: null, language: null, extension: null, suggestedName: null, cleanPrompt: text };

  if (!text) return NONE;

  for (const pattern of CODE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const langKey = (match.groups?.lang || '').toLowerCase();
      const langInfo = LANG_MAP[langKey] || detectLanguage(text);
      if (!langInfo) continue; 

      return {
        detected: true,
        fileType: 'code',
        language: langInfo.language || langKey,
        extension: langInfo.ext,
        mime: langInfo.mime,
        suggestedName: suggestFilename(text, langInfo.ext),
        cleanPrompt: text,
      };
    }
  }

  const langInfo = detectLanguage(text);
  if (langInfo && /(?:viết|tạo|write|create|gen|make|cho tôi)/i.test(text)) {
    return {
      detected: true,
      fileType: 'code',
      language: langInfo.language,
      extension: langInfo.ext,
      mime: langInfo.mime,
      suggestedName: suggestFilename(text, langInfo.ext),
      cleanPrompt: text,
    };
  }

  for (const pattern of CSV_PATTERNS) {
    if (pattern.test(text)) {
      return {
        detected: true,
        fileType: 'csv',
        language: null,
        extension: '.csv',
        mime: 'text/csv',
        suggestedName: suggestFilename(text, '.csv'),
        cleanPrompt: text,
      };
    }
  }

  for (const pattern of DOC_PATTERNS) {
    if (pattern.test(text)) {
      return {
        detected: true,
        fileType: 'markdown',
        language: null,
        extension: '.md',
        mime: 'text/markdown',
        suggestedName: suggestFilename(text, '.md'),
        cleanPrompt: text,
      };
    }
  }

  for (const pattern of TXT_PATTERNS) {
    if (pattern.test(text)) {
      return {
        detected: true,
        fileType: 'txt',
        language: null,
        extension: '.txt',
        mime: 'text/plain',
        suggestedName: suggestFilename(text, '.txt'),
        cleanPrompt: text,
      };
    }
  }

  return NONE;
};

module.exports = { detectFileIntent, detectLanguage, LANG_MAP };
