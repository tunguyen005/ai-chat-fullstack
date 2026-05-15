const path = require('path');
const os = require('os');
const fs = require('fs');

const exportDocx = async (req, res) => {
  try {
    const { content, filename = 'export' } = req.body;
    if (!content?.trim()) {
      return res.status(400).json({ success: false, error: 'Content required' });
    }

    const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');

    const lines = content.split('\n');
    const children = [];

    for (const line of lines) {
      if (!line.trim()) {
        children.push(new Paragraph({ text: '' }));
        continue;
      }
      
      if (line.startsWith('### ')) {
        children.push(new Paragraph({ text: line.slice(4), heading: HeadingLevel.HEADING_3 }));
      } else if (line.startsWith('## ')) {
        children.push(new Paragraph({ text: line.slice(3), heading: HeadingLevel.HEADING_2 }));
      } else if (line.startsWith('# ')) {
        children.push(new Paragraph({ text: line.slice(2), heading: HeadingLevel.HEADING_1 }));
      }
      else if (line.startsWith('- ') || line.startsWith('* ')) {
        children.push(
          new Paragraph({
            text: line.slice(2),
            bullet: { level: 0 },
          })
        );
      }
      else if (/^\d+\.\s/.test(line)) {
        children.push(
          new Paragraph({
            text: line.replace(/^\d+\.\s/, ''),
            numbering: { reference: 'default-numbering', level: 0 },
          })
        );
      }
      else {
        const runs = parseInlineMarkdown(line);
        children.push(new Paragraph({ children: runs }));
      }
    }

    const doc = new Document({
      sections: [{ properties: {}, children }],
    });

    const buffer = await Packer.toBuffer(doc);
    const safeName = filename.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 50);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.docx"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (err) {
    console.error('[exportDocx]', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

const parseInlineMarkdown = (text) => {
  const runs = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|([^*`]+))/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match[2]) runs.push(new (require('docx').TextRun)({ text: match[2], bold: true }));
    else if (match[3]) runs.push(new (require('docx').TextRun)({ text: match[3], italics: true }));
    else if (match[4]) runs.push(new (require('docx').TextRun)({ text: match[4], font: 'Courier New', size: 20 }));
    else if (match[5]) runs.push(new (require('docx').TextRun)({ text: match[5] }));
  }
  return runs.length ? runs : [new (require('docx').TextRun)({ text })];
};

const exportTxt = (req, res) => {
  const { content, filename = 'export' } = req.body;
  if (!content?.trim()) return res.status(400).json({ success: false, error: 'Content required' });

  const safeName = (filename || 'export').replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 50);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}.txt"`);
  res.send(content);
};


module.exports = { exportDocx, exportTxt };
