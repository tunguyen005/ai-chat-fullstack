const https = require('https');
const http  = require('http');

const fetchBuffer = (url) =>
  new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchBuffer(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} fetching: ${url}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });

const loadPdfParse = async () => {
  try { const m = await import('pdf-parse'); return m.default || m; } catch { return null; }
};
const loadMammoth = async () => {
  try { const m = await import('mammoth'); return m.default || m; } catch { return null; }
};
const loadTurndown = async () => {
  try { const m = await import('turndown'); return m.default || m; } catch { return null; }
};
const loadXLSX = async () => {
  try { const m = await import('xlsx'); return m.default || m; } catch { return null; }
};

const extractPDF = async (buffer) => {
  const parse = await loadPdfParse();
  if (!parse) return { text: '' };
  const result = await parse(buffer);
  return { text: result.text?.trim() || '', pages: result.numpages, type: 'pdf' };
};

const extractDOCX = async (buffer) => {
  const m = await loadMammoth();
  if (!m) return { text: '' };

  if (typeof m.convertToMarkdown === 'function') {
    try {
      const result = await m.convertToMarkdown({ buffer });
      return { text: (result.value || '').trim(), type: 'docx' };
    } catch { /* fall through */ }
  }

  if (typeof m.convertToHtml === 'function') {
    try {
      const result = await m.convertToHtml({ buffer });
      const html = result.value || '';
      const td = await loadTurndown();
      let text = '';
      if (td) {
        const TurndownService = typeof td === 'function' ? td : td.default;
        text = new TurndownService().turndown(html);
      } else {
        text = html.replace(/<[^>]+>/g, '');
      }
      return { text: text.trim(), type: 'docx' };
    } catch { /* fall through */ }
  }

  if (typeof m.extractRawText === 'function') {
    const result = await m.extractRawText({ buffer });
    return { text: (result.value || '').trim(), type: 'docx' };
  }

  return { text: '' };
};

const extractXLSX = async (buffer) => {
  const lib = await loadXLSX();
  if (!lib) return { text: '' };

  const workbook = lib.read(buffer, { type: 'buffer' });
  const parts = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows  = lib.utils.sheet_to_json(sheet, { header: 1 });
    if (!rows.length) continue;

    const maxCols = Math.max(...rows.map((r) => r?.length || 0));
    const header  = (rows[0] || []).map((c) => (c ?? '').toString()).slice(0, maxCols);
    const lines   = [
      `### Sheet: ${sheetName}`,
      `| ${header.join(' | ')} |`,
      `| ${header.map(() => '---').join(' | ')} |`,
    ];
    for (const row of rows.slice(1)) {
      const cells = Array.from({ length: maxCols }, (_, i) =>
        (row?.[i] ?? '').toString().replace(/\r?\n/g, ' ')
      );
      lines.push(`| ${cells.join(' | ')} |`);
    }
    parts.push(lines.join('\n'));
  }

  return { text: parts.join('\n\n'), type: 'xlsx' };
};

const extractCSV = (buffer) => {
  const raw  = buffer.toString('utf-8');
  const rows = raw.split('\n').slice(0, 500).map((r) => r.replace(/\r$/, ''));
  if (!rows.length) return { text: '' };
  const header = rows[0].split(',');
  const lines  = [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
  ];
  for (const r of rows.slice(1)) {
    if (r.trim()) lines.push(`| ${r.split(',').join(' | ')} |`);
  }
  return { text: lines.join('\n'), type: 'csv' };
};

const extractPlainText = (buffer) => ({
  text: buffer.toString('utf-8'),
  type: 'text',
});

const truncate = (text, max = 12000) => {
  if (!text || text.length <= max) return text;
  return text.slice(0, max) + `\n\n[... truncated — original length: ${text.length} chars]`;
};

const getExtractor = (mimetype = '', filename = '') => {
  const mime = mimetype.toLowerCase();
  const ext  = (filename.split('.').pop() || '').toLowerCase();

  if (mime === 'application/pdf' || ext === 'pdf')                        return extractPDF;
  if (['application/vnd.openxmlformats-officedocument.wordprocessingml.document',
       'application/msword'].includes(mime) || ['docx','doc'].includes(ext))
                                                                           return extractDOCX;
  if (['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
       'application/vnd.ms-excel'].includes(mime) || ['xlsx','xls'].includes(ext))
                                                                           return extractXLSX;
  if (mime === 'text/csv' || ext === 'csv')                               return extractCSV;
  if (mime.startsWith('text/') || ['txt','md','json','yaml','yml','xml','html','log'].includes(ext))
                                                                           return extractPlainText;
  return null;
};

const buildFileContext = async (attachments = []) => {
  if (!attachments.length) return '';

  const sections = [];

  for (const att of attachments) {
    const url  = att.url || att.localPath;           // Cloudinary HTTPS URL
    const name = att.originalName || url?.split('/').pop() || 'file';

    if (!url) {
      sections.push(`<file name="${name}">[No URL available]</file>`);
      continue;
    }

    const extractor = getExtractor(att.mimetype || '', name);
    if (!extractor) {
      sections.push(`<file name="${name}">[Unsupported file type: ${att.mimetype}]</file>`);
      continue;
    }

    try {
      const buffer  = await fetchBuffer(url);
      const result  = await extractor(buffer);
      const content = truncate(result.text || '');

      if (!content?.trim()) {
        sections.push(`<file name="${name}">[File is empty or could not be parsed]</file>`);
      } else {
        sections.push(`<file name="${name}">\n${content}\n</file>`);
      }
    } catch (err) {
      console.error(`[fileExtractor] "${name}":`, err.message);
      sections.push(`<file name="${name}">[Extraction error: ${err.message}]</file>`);
    }
  }

  if (!sections.length) return '';
  return 'The user has attached the following file(s). Use their content to answer:\n\n' + sections.join('\n\n');
};

module.exports = { buildFileContext };