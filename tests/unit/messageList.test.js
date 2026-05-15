import { describe, it, expect } from 'vitest';

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
  return {
    codeBlocks,
    hasLargeContent,
    hasStructure,
    exportable: codeBlocks.length > 0 || (hasLargeContent && hasStructure),
  };
};

describe('langToExt', () => {
  it.each([
    ['javascript', 'js'],
    ['typescript', 'ts'],
    ['python', 'py'],
    ['java', 'java'],
    ['cpp', 'cpp'],
    ['go', 'go'],
    ['rust', 'rs'],
    ['html', 'html'],
    ['css', 'css'],
    ['jsx', 'jsx'],
    ['tsx', 'tsx'],
    ['json', 'json'],
    ['yaml', 'yml'],
    ['bash', 'sh'],
    ['shell', 'sh'],
    ['sql', 'sql'],
    ['kotlin', 'kt'],
    ['swift', 'swift'],
    ['ruby', 'rb'],
  ])('"%s" → ".%s"', (lang, ext) => {
    expect(langToExt(lang)).toBe(ext);
  });

  it('returns the lang itself for unknown languages', () => {
    expect(langToExt('fortran')).toBe('fortran');
    expect(langToExt('cobol')).toBe('cobol');
  });

  it('returns txt for empty/null', () => {
    expect(langToExt('')).toBe('txt');
    expect(langToExt(undefined)).toBe('txt');
  });
});

describe('detectExportableContent', () => {
  describe('code blocks', () => {
    it('should detect single JS code block', () => {
      const content = '```javascript\nconst x = 1;\nconsole.log(x);\n```';
      const result = detectExportableContent(content);
      expect(result.codeBlocks).toHaveLength(1);
      expect(result.codeBlocks[0].lang).toBe('javascript');
      expect(result.codeBlocks[0].ext).toBe('js');
      expect(result.exportable).toBe(true);
    });

    it('should detect multiple code blocks', () => {
      const content = [
        '```python\nprint("hello")\n```',
        'Some text',
        '```sql\nSELECT * FROM users;\n```',
      ].join('\n');
      const result = detectExportableContent(content);
      expect(result.codeBlocks).toHaveLength(2);
      expect(result.codeBlocks[0].lang).toBe('python');
      expect(result.codeBlocks[1].lang).toBe('sql');
    });

    it('should ignore tiny code blocks (< 10 chars)', () => {
      const content = '```js\nx=1\n```';
      const result = detectExportableContent(content);
      expect(result.codeBlocks).toHaveLength(0);
    });

    it('should handle code block without language specifier', () => {
      const content = '```\nsome code here that is long enough\n```';
      const result = detectExportableContent(content);
      expect(result.codeBlocks).toHaveLength(1);
      expect(result.codeBlocks[0].lang).toBe('txt');
      expect(result.codeBlocks[0].ext).toBe('txt');
    });

    it('should correctly extract code content', () => {
      const code = 'function hello() {\n  return "world";\n}';
      const content = `\`\`\`javascript\n${code}\n\`\`\``;
      const result = detectExportableContent(content);
      expect(result.codeBlocks[0].code).toBe(code);
    });
  });

  describe('exportable detection', () => {
    it('should be exportable when has code', () => {
      const content = '```python\nprint("hello world")\n```';
      expect(detectExportableContent(content).exportable).toBe(true);
    });

    it('should be exportable for long structured content', () => {
      const content = '# Title\n\n' + 'Long content '.repeat(30);
      const result = detectExportableContent(content);
      expect(result.hasLargeContent).toBe(true);
      expect(result.hasStructure).toBe(true);
      expect(result.exportable).toBe(true);
    });

    it('should NOT be exportable for short plain message', () => {
      const result = detectExportableContent('Hello! How can I help you?');
      expect(result.exportable).toBe(false);
    });

    it('should NOT be exportable for long but unstructured text', () => {
      const content = 'word '.repeat(100); 
      const result = detectExportableContent(content);
      expect(result.hasLargeContent).toBe(true);
      expect(result.hasStructure).toBe(false);
      expect(result.exportable).toBe(false);
    });

    it('should be exportable for markdown with multiple headings', () => {
      const content = '# Section 1\n\nContent here.\n\n## Section 2\n\n' + 'More content '.repeat(20);
      const result = detectExportableContent(content);
      expect(result.exportable).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('handles empty string', () => {
      const result = detectExportableContent('');
      expect(result.codeBlocks).toHaveLength(0);
      expect(result.exportable).toBe(false);
    });

    it('handles undefined', () => {
      const result = detectExportableContent(undefined);
      expect(result.codeBlocks).toHaveLength(0);
    });

    it('handles code block in middle of long response', () => {
      const content = 'Introduction text.\n\n```typescript\ninterface User {\n  name: string;\n  age: number;\n}\n```\n\nConclusion.';
      const result = detectExportableContent(content);
      expect(result.codeBlocks).toHaveLength(1);
      expect(result.codeBlocks[0].lang).toBe('typescript');
      expect(result.codeBlocks[0].ext).toBe('ts');
    });
  });
});
