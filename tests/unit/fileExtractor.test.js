import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

vi.mock('pdf-parse', () => {
  const fn = vi.fn().mockResolvedValue({  
    text: 'Sample PDF content\nPage 2 content',
    numpages: 2,
    info: { Title: 'Test PDF' },
  });
  return { default: fn };
});

vi.mock('mammoth', () => ({
  default: {
    convertToMarkdown: vi.fn().mockResolvedValue({
      value: '# Heading\n\nParagraph text',
      messages: [],
    }),
    extractRawText: vi.fn().mockResolvedValue({
      value: 'Raw text fallback',
      messages: [],
    }),
  },
}));

vi.mock('xlsx', () => ({
  default: {
    readFile: vi.fn().mockReturnValue({
      SheetNames: ['Sheet1'],
      Sheets: { Sheet1: {} },
    }),
    utils: {
      sheet_to_json: vi.fn().mockReturnValue([
        ['Name', 'Age', 'City'],
        ['Alice', 30, 'HCM'],
        ['Bob', 25, 'HN'],
      ]),
    },
  },
}));

vi.mock('tesseract.js', () => {
  const mockWorker = {
    load: vi.fn().mockResolvedValue(undefined),
    loadLanguage: vi.fn().mockResolvedValue(undefined),
    initialize: vi.fn().mockResolvedValue(undefined),
    recognize: vi.fn().mockResolvedValue({
      data: { text: 'OCR extracted text', confidence: 92 },
    }),
    terminate: vi.fn().mockResolvedValue(undefined),
  };
  const createWorker = vi.fn().mockResolvedValue(mockWorker);
  return {
    default: { createWorker },
    createWorker,
  };
});

vi.mock('turndown', () => ({
  default: class {
    turndown(html) { return html.replace(/<[^>]+>/g, ''); }
  },
}));

import { extractFileContent, buildFileContext } from '../../backend/src/services/fileExtractor.js';

let tmpDir;
beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fe-test-'));
});
afterAll(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
});

const tmp = (name, content) => {
  const p = path.join(tmpDir, name);
  Buffer.isBuffer(content)
    ? fs.writeFileSync(p, content)
    : fs.writeFileSync(p, content, 'utf8');
  return p;
};

describe('fileExtractor', () => {
  describe('extractFileContent — PDF', () => {
    it('should detect PDF by .pdf extension without mimetype', async () => {
      const p = tmp('nodoc.pdf', Buffer.from('%PDF'));

      const r = await extractFileContent(p, null, 'nodoc.pdf');

      expect(r.supported).toBe(true);
    });

    it('should return hasContent=false for empty PDF text', async () => {
      const p = tmp('empty.pdf', Buffer.from('%PDF'));
      const pdfMod = await import('pdf-parse');
      vi.mocked(pdfMod.default).mockResolvedValueOnce({
        text: '', numpages: 1, info: {},
      });

      const r = await extractFileContent(p, 'application/pdf', 'empty.pdf');

      expect(r.hasContent).toBe(false);
    });
  });

  describe('extractFileContent — DOCX', () => {
    it('should detect .doc by mimetype', async () => {
      const p = tmp('old.doc', Buffer.from('\xD0\xCF\x11\xE0'));

      const r = await extractFileContent(p, 'application/msword', 'old.doc');

      expect(r.supported).toBe(true);
    });
  });

  describe('extractFileContent — CSV', () => {
    it('should convert CSV to markdown table', async () => {
      const p = tmp('data.csv', 'Name,Age\nAlice,30\nBob,25');

      const r = await extractFileContent(p, 'text/csv', 'data.csv');

      expect(r.supported).toBe(true);
      expect(r.text).toContain('| Name | Age |');
      expect(r.text).toMatch(/\|\s*---/);
      expect(r.text).toContain('Alice');
    });
  });

  describe('extractFileContent — text files', () => {
    it('should read .txt files', async () => {
      const p = tmp('readme.txt', 'Hello world');

      const r = await extractFileContent(p, 'text/plain', 'readme.txt');

      expect(r.supported).toBe(true);
      expect(r.text).toBe('Hello world');
    });

    it('should read .json files', async () => {
      const p = tmp('cfg.json', '{"key": "value"}');

      const r = await extractFileContent(p, 'application/json', 'cfg.json');

      expect(r.supported).toBe(true);
      expect(r.text).toContain('"key"');
    });

    it('should read .md files', async () => {
      const p = tmp('notes.md', '# Title\n\nContent');

      const r = await extractFileContent(p, 'text/markdown', 'notes.md');

      expect(r.supported).toBe(true);
      expect(r.text).toContain('# Title');
    });
  });

  describe('extractFileContent — unsupported types', () => {
    it('should return supported=false for video/mp4', async () => {
      const p = tmp('video.mp4', Buffer.from('fake'));

      const r = await extractFileContent(p, 'video/mp4', 'video.mp4');

      expect(r.supported).toBe(false);
      expect(r.text).toBeNull();
    });

    it('should return supported=false for .exe', async () => {
      const p = tmp('app.exe', Buffer.from('MZ'));

      const r = await extractFileContent(p, 'application/octet-stream', 'app.exe');

      expect(r.supported).toBe(false);
    });
  });

  describe('extractFileContent — file not found', () => {
    it('should return supported=false and error when file missing', async () => {
      const r = await extractFileContent(
        '/absolutely/nonexistent/ghost.pdf',
        'application/pdf',
        'ghost.pdf'
      );

      expect(r.supported).toBe(false);
      expect(r.text).toBeNull();
      expect(r.error).toBeTruthy();
    });
  });

  describe('extractFileContent — truncation', () => {
    it('should truncate content over 12000 chars', async () => {
      const p = tmp('huge.txt', 'X'.repeat(20000));

      const r = await extractFileContent(p, 'text/plain', 'huge.txt');

      expect(r.supported).toBe(true);
      expect(r.text).not.toBeNull();
      expect(r.text.length).toBeLessThan(15000);
      expect(r.text).toContain('truncated');
    });

    it('should NOT truncate content under limit', async () => {
      const p = tmp('small.txt', 'Hello '.repeat(50));

      const r = await extractFileContent(p, 'text/plain', 'small.txt');

      expect(r.text).not.toContain('truncated');
    });
  });

  describe('buildFileContext', () => {
    it('should return empty string for empty array', async () => {
      expect(await buildFileContext([])).toBe('');
    });

    it('should wrap content in <file> tags', async () => {
      const p = tmp('report.txt', 'Report content here');

      const ctx = await buildFileContext([
        { localPath: p, mimetype: 'text/plain', originalName: 'report.txt' },
      ]);

      expect(ctx).toContain('<file name="report.txt">');
      expect(ctx).toContain('Report content here');
      expect(ctx).toContain('</file>');
    });

    it('should include intro sentence about attachments', async () => {
      const p = tmp('intro.txt', 'intro content');

      const ctx = await buildFileContext([
        { localPath: p, mimetype: 'text/plain', originalName: 'intro.txt' },
      ]);

      expect(ctx).toMatch(/attached/i);
    });

    it('should handle missing file gracefully', async () => {
      const ctx = await buildFileContext([
        {
          localPath: '/nonexistent/ghost.pdf',
          mimetype: 'application/pdf',
          originalName: 'ghost.pdf',
        },
      ]);

      expect(typeof ctx).toBe('string');
      expect(ctx).toContain('ghost.pdf');
    });

    it('should handle multiple files', async () => {
      const p1 = tmp('f1.txt', 'Content one');
      const p2 = tmp('f2.txt', 'Content two');

      const ctx = await buildFileContext([
        { localPath: p1, mimetype: 'text/plain', originalName: 'f1.txt' },
        { localPath: p2, mimetype: 'text/plain', originalName: 'f2.txt' },
      ]);

      expect(ctx).toContain('Content one');
      expect(ctx).toContain('Content two');
    });

    it('should handle CSV file', async () => {
      const p = tmp('sales.csv', 'Month,Revenue\nJan,1000\nFeb,2000');

      const ctx = await buildFileContext([
        { localPath: p, mimetype: 'text/csv', originalName: 'sales.csv' },
      ]);

      expect(ctx).toContain('sales.csv');
      expect(ctx).toContain('Month');
    });

    it('should handle unsupported file type gracefully', async () => {
      const p = tmp('vid.mp4', Buffer.from('fake'));

      const ctx = await buildFileContext([
        { localPath: p, mimetype: 'video/mp4', originalName: 'vid.mp4' },
      ]);

      expect(typeof ctx).toBe('string');
      expect(ctx).toContain('vid.mp4');
    });
  });
});