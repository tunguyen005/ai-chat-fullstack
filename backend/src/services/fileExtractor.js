import fs from 'fs';
import path from 'path';

const loadPdfParse = async () => {
  try {
    const m = await import('pdf-parse');
    const fn = m.default || m;
    if (typeof fn === 'function') return fn;
    return null;
  } catch (e) {
    try {
      const m = await import('pdf-parse');
      const fn = m.default || m;
      if (typeof fn === 'function') return fn;
      return null;
    } catch (e2) {
      return null;
    }
  }
};

const loadMammoth = async () => {
  try {
    const m = await import('mammoth');
    return m.default || m;
  } catch (e) {
    return null;
  }
};

const loadTurndown = async () => {
  try {
    const m = await import('turndown');
    return m.default || m;
  } catch (e) {
    return null;
  }
};

const loadXLSX = async () => {
  try {
    const m = await import('xlsx');
    return m.default || m;
  } catch (e) {
    return null;
  }
};

const loadTesseract = async () => {
  try {
    const m = await import('tesseract.js');
    return m.default || m;
  } catch (e) {
    return null;
  }
};

const truncate = (text, maxChars = 12000) => {
  if (!text) return text;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + `\n\n[... truncated — original length: ${text.length} chars]`;
};

const extractPDF = async (filePath) => {
  const parse = await loadPdfParse();
  if (!parse) return { text: '', pages: 0, info: {} };

  let buffer;
  try {
    buffer = fs.readFileSync(filePath);
  } catch (e) {
    return { text: '', pages: 0, info: {} };
  }

  const result = await parse(buffer);
  return {
    text: result.text?.trim() || '',
    pages: result.numpages,
    info: result.info,
  };
};

const extractDOCX = async (filePath) => {
  const m = await loadMammoth();
  if (!m) return { text: '', messages: [] };

  try {
    if (typeof m.convertToMarkdown === 'function') {
      const result = await m.convertToMarkdown({ path: filePath });
      return { text: (result.value || '').trim(), messages: result.messages || [] };
    }
    if (typeof m.convertToHtml === 'function') {
      const result = await m.convertToHtml({ path: filePath });
      const html = result.value || '';
      const td = await loadTurndown();
      let markdown = '';
      if (td) {
        const TurndownService = typeof td === 'function' ? td : td.default;
        const turndown = new TurndownService();
        markdown = turndown.turndown(html);
      } else {
        markdown = html.replace(/<[^>]+>/g, '');
      }
      return { text: markdown.trim(), messages: result.messages || [] };
    }
    if (typeof m.extractRawText === 'function') {
      const result = await m.extractRawText({ path: filePath });
      return { text: (result.value || '').trim(), messages: result.messages || [] };
    }
  } catch (e) {
    return { text: '', messages: [] };
  }

  return { text: '', messages: [] };
};

const extractXLSX = async (filePath) => {
  const lib = await loadXLSX();
  if (!lib) return { text: '' };

  const workbook = lib.readFile(filePath);
  const parts = [];

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rows = lib.utils.sheet_to_json(sheet, { header: 1 });
    if (!rows || !rows.length) return;

    const maxCols = Math.max(...rows.map((r) => (r ? r.length : 0)));
    const header = rows[0].map((c) => (c === null || c === undefined ? '' : String(c))).slice(0, maxCols);
    const body = rows.slice(1);

    const tableLines = [];
    tableLines.push(`### Sheet: ${sheetName}`);
    tableLines.push(`| ${header.join(' | ')} |`);
    tableLines.push(`| ${header.map(() => '---').join(' | ')} |`);
    for (const row of body) {
      const cells = [];
      for (let i = 0; i < maxCols; i++) {
        const v = row && row[i] !== undefined && row[i] !== null ? String(row[i]) : '';
        cells.push(v.replace(/\r?\n/g, ' '));
      }
      tableLines.push(`| ${cells.join(' | ')} |`);
    }
    parts.push(tableLines.join('\n'));
  });

  return { text: parts.join('\n\n') };
};

const extractCSV = (filePath) => {
  const raw = fs.readFileSync(filePath, 'utf8');
  const rows = raw.split('\n').slice(0, 500).map((r) => r.replace(/\r$/, ''));
  if (!rows.length) return { text: '' };
  const header = rows[0].split(',');
  const body = rows.slice(1).map((r) => r.split(','));
  const lines = [];
  lines.push(`| ${header.join(' | ')} |`);
  lines.push(`| ${header.map(() => '---').join(' | ')} |`);
  for (const r of body) {
    if (r.join('').trim()) lines.push(`| ${r.join(' | ')} |`);
  }
  return { text: lines.join('\n') };
};

const extractText = (filePath) => {
  const raw = fs.readFileSync(filePath, 'utf8');
  return { text: raw };
};

const extractImageOCR = async (filePath, lang = 'eng+vie') => {
  const mod = await loadTesseract();
  if (!mod) return { text: '', confidence: 0 };

  const createWorker = mod.createWorker || (mod.default && mod.default.createWorker);
  if (!createWorker) return { text: '', confidence: 0 };

  const worker = await createWorker({ logger: () => {} });
  try {
    if (typeof worker.load === 'function') await worker.load();
    if (typeof worker.loadLanguage === 'function') await worker.loadLanguage(lang);
    if (typeof worker.initialize === 'function') await worker.initialize(lang);
    const rec = await worker.recognize(filePath);
    const text = rec?.data?.text ?? rec?.text ?? '';
    const confidence = rec?.data?.confidence ?? rec?.confidence ?? 0;
    return {
      text: (text || '').trim(),
      confidence: Math.round(confidence || 0),
      method: 'tesseract-ocr',
    };
  } catch (e) {
    return { text: '', confidence: 0 };
  } finally {
    try {
      if (typeof worker.terminate === 'function') await worker.terminate();
    } catch (e) {}
  }
};

// ─── Main extractFileContent ─────────────────────────────────────────────────

export const extractFileContent = async (filePath, mimetype, originalName) => {
  const ext = path.extname(originalName || filePath).toLowerCase();

  if (!fs.existsSync(filePath)) {
    return {
      text: null,
      error: `File not found: ${originalName || filePath}`,
      supported: false,
      hasContent: false,
    };
  }

  try {
    let result;

    if (mimetype === 'application/pdf' || ext === '.pdf') {
      result = await extractPDF(filePath);
      result.type = 'pdf';
    }

    else if (
      mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimetype === 'application/msword' ||
      ext === '.docx' ||
      ext === '.doc'
    ) {
      result = await extractDOCX(filePath);
      result.type = 'docx';
    }

    else if (
      mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      mimetype === 'application/vnd.ms-excel' ||
      ext === '.xlsx' ||
      ext === '.xls'
    ) {
      result = await extractXLSX(filePath);
      result.type = 'xlsx';
    }

    else if (mimetype === 'text/csv' || ext === '.csv') {
      result = extractCSV(filePath);
      result.type = 'csv';
    }

    else if (
      mimetype?.startsWith('text/') ||
      ['.txt', '.md', '.json', '.xml', '.html', '.htm', '.yaml', '.yml', '.log', '.env'].includes(ext)
    ) {
      result = extractText(filePath);
      result.type = 'text';
    }

    else if (mimetype?.startsWith('image/')) {
      result = await extractImageOCR(filePath);
      result.type = 'image-ocr';
    }

    else {
      return {
        text: null,
        error: `Unsupported file type: ${mimetype || ext}`,
        supported: false,
        hasContent: false,
      };
    }

    return {
      text: truncate(result.text || '') || null,
      metadata: {
        type: result.type,
        pages: result.pages,
        confidence: result.confidence,
        method: result.method,
        originalLength: result.text?.length || 0,
      },
      supported: true,
      hasContent: (result.text?.trim().length || 0) > 0,
    };
  } catch (err) {
    console.error(
      `[fileExtractor] Error extracting ${originalName}:`,
      err && err.message ? err.message : String(err)
    );
    const isNotFound =
      err && (err.code === 'ENOENT' || /no such file/i.test(err.message || ''));
    return {
      text: null,
      error: err && err.message ? err.message : String(err),
      supported: !isNotFound,
      hasContent: false,
    };
  }
};

export const buildFileContext = async (attachments = []) => {
  if (!attachments.length) return '';

  const sections = [];

  for (const att of attachments) {
    const localPath =
      att.localPath ||
      att.url?.replace('/uploads/', '') ||
      att.filename ||
      att.originalName;

    const fullPath = path.isAbsolute(localPath)
      ? localPath
      : path.join(process.cwd(), 'uploads', path.basename(localPath));

    if (!fs.existsSync(fullPath)) {
      sections.push(
        `<file name="${att.originalName}">[File not found: ${att.originalName}]</file>`
      );
      continue;
    }

    const extracted = await extractFileContent(fullPath, att.mimetype, att.originalName);

    if (!extracted.supported) {
      sections.push(
        `<file name="${att.originalName}">[Cannot read file type: ${att.originalName}]</file>`
      );
      continue;
    }

    if (!extracted.hasContent) {
      const errMsg = extracted.error
        ? ` (Error: ${extracted.error})`
        : ' (Empty or unreadable)';
      sections.push(
        `<file name="${att.originalName}">[File: ${att.originalName}${errMsg}]</file>`
      );
      continue;
    }

    const content = extracted.text || '';
    sections.push(`<file name="${att.originalName}">\n${content}\n</file>`);
  }

  if (!sections.length) return '';

  return (
    `The user has attached the following file(s). Use their content to answer:\n\n` +
    sections.join('\n\n')
  );
};