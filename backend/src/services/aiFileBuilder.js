const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, BorderStyle, WidthType } = require('docx');

const stripCodeFence = (text) => {
  const fenceMatch = text.match(/^```[\w]*\n?([\s\S]*?)```$/m);
  if (fenceMatch) return fenceMatch[1].trim();

  const firstFence = text.match(/```[\w]*\n?([\s\S]*?)```/);
  if (firstFence) return firstFence[1].trim();

  return text.trim();
};

const extractCSV = (text) => {
  const fenced = text.match(/```(?:csv)?\n?([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();

  const lines = text.split('\n').filter((l) => l.trim().startsWith('|'));
  if (lines.length > 1) {
    return lines
      .filter((l) => !/^\|[-| ]+\|$/.test(l.trim())) 
      .map((l) =>
        l
          .trim()
          .replace(/^\||\|$/g, '') 
          .split('|')
          .map((cell) => {
            const v = cell.trim();
            return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
          })
          .join(',')
      )
      .join('\n');
  }

  return text.trim();
};

const buildDocx = async (markdownText, title = '') => {
  const lines = markdownText.split('\n');
  const children = [];

  if (title) {
    children.push(new Paragraph({ text: title, heading: HeadingLevel.TITLE }));
    children.push(new Paragraph({ text: '' }));
  }

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      children.push(new Paragraph({ text: '' }));
      continue;
    }

    if (trimmed.startsWith('```') || trimmed.endsWith('```')) continue; 

    if (trimmed.startsWith('### ')) {
      children.push(new Paragraph({ text: trimmed.slice(4), heading: HeadingLevel.HEADING_3 }));
    } else if (trimmed.startsWith('## ')) {
      children.push(new Paragraph({ text: trimmed.slice(3), heading: HeadingLevel.HEADING_2 }));
    } else if (trimmed.startsWith('# ')) {
      children.push(new Paragraph({ text: trimmed.slice(2), heading: HeadingLevel.HEADING_1 }));
    }
    else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      children.push(new Paragraph({ text: trimmed.slice(2), bullet: { level: 0 } }));
    }
    else if (/^\d+\.\s/.test(trimmed)) {
      children.push(new Paragraph({ text: trimmed.replace(/^\d+\.\s/, '') }));
    }
    else if (/^\*\*(.+)\*\*$/.test(trimmed)) {
      const inner = trimmed.replace(/^\*\*|\*\*$/g, '');
      children.push(new Paragraph({ children: [new TextRun({ text: inner, bold: true })] }));
    }
    else {
      children.push(new Paragraph({ children: parseInline(trimmed) }));
    }
  }

  const doc = new Document({ sections: [{ properties: {}, children }] });
  return Packer.toBuffer(doc);
};

const parseInline = (text) => {
  const runs = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|([^*`]+))/g;
  let m;
  while ((m = regex.exec(text)) !== null) {
    if (m[2]) runs.push(new TextRun({ text: m[2], bold: true }));
    else if (m[3]) runs.push(new TextRun({ text: m[3], italics: true }));
    else if (m[4]) runs.push(new TextRun({ text: m[4], font: 'Courier New', size: 20 }));
    else if (m[5]) runs.push(new TextRun({ text: m[5] }));
  }
  return runs.length ? runs : [new TextRun({ text })];
};

const buildFile = async ({ aiResponse, fileType, extension, language, suggestedName, mime }) => {
  const name = (suggestedName || 'output').replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 60);

  if (fileType === 'code' || fileType === 'txt') {
    const code = stripCodeFence(aiResponse);
    return {
      buffer: Buffer.from(code, 'utf8'),
      filename: `${name}${extension}`,
      contentType: mime || 'text/plain',
    };
  }

  if (fileType === 'markdown') {
    return {
      buffer: Buffer.from(aiResponse, 'utf8'),
      filename: `${name}.md`,
      contentType: 'text/markdown',
    };
  }

  if (fileType === 'csv') {
    const csv = extractCSV(aiResponse);
    return {
      buffer: Buffer.from('\uFEFF' + csv, 'utf8'), 
      filename: `${name}.csv`,
      contentType: 'text/csv; charset=utf-8',
    };
  }

  return {
    buffer: Buffer.from(aiResponse, 'utf8'),
    filename: `${name}.txt`,
    contentType: 'text/plain',
  };
};

const buildDocxFile = async ({ aiResponse, suggestedName }) => {
  const name = (suggestedName || 'document').replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 60);
  const buffer = await buildDocx(aiResponse, name.replace(/_/g, ' '));
  return {
    buffer,
    filename: `${name}.docx`,
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
};

module.exports = { buildFile, buildDocxFile, stripCodeFence, extractCSV };
