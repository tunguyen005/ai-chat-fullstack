const http = require('http');
const fs = require('fs');
const path = require('path');

const OLLAMA_URL = process.env.OLLAMA_URL;
const VISION_MODEL = process.env.OLLAMA_VISION_MODEL;

let _ollamaStatus = null; 
let _ollamaCheckedAt = 0;

const isOllamaRunning = async () => {
  const now = Date.now();
  if (_ollamaStatus !== null && now - _ollamaCheckedAt < 30000) return _ollamaStatus;

  return new Promise((resolve) => {
    const url = new URL(`${OLLAMA_URL}/api/tags`);
    const req = http.request(
      { hostname: url.hostname, port: url.port || 11434, path: url.pathname, method: 'GET' },
      (res) => {
        _ollamaStatus = res.statusCode === 200;
        _ollamaCheckedAt = Date.now();
        resolve(_ollamaStatus);
        res.destroy();
      }
    );
    req.on('error', () => { _ollamaStatus = false; _ollamaCheckedAt = Date.now(); resolve(false); });
    req.setTimeout(1500, () => { _ollamaStatus = false; _ollamaCheckedAt = Date.now(); resolve(false); req.destroy(); });
    req.end();
  });
};

const hasVisionModel = async (model) => {
  return new Promise((resolve) => {
    const url = new URL(`${OLLAMA_URL}/api/tags`);
    const req = http.request(
      { hostname: url.hostname, port: url.port || 11434, path: url.pathname, method: 'GET' },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const models = (json.models || []).map((m) => m.name.split(':')[0]);
            resolve(models.includes(model.split(':')[0]));
          } catch { resolve(false); }
        });
      }
    );
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => { resolve(false); req.destroy(); });
    req.end();
  });
};

const describeWithOllama = (imageBase64, prompt, model) =>
  new Promise((resolve, reject) => {
    const base64 = imageBase64.replace(/^data:image\/[a-z+]+;base64,/, '');

    const payload = JSON.stringify({
      model,
      prompt: prompt || 'Describe this image in detail. If there is any text in the image, transcribe it exactly. Respond in the same language as any text visible in the image.',
      images: [base64],
      stream: false,
      options: { temperature: 0.1, num_predict: 1024 },
    });

    const url = new URL(`${OLLAMA_URL}/api/generate`);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port || 11434,
        path: url.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.error) return reject(new Error(json.error));
            resolve((json.response || '').trim());
          } catch (e) { reject(new Error('Invalid JSON from Ollama vision')); }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(90000, () => reject(new Error('Ollama vision timed out')));
    req.write(payload);
    req.end();
  });

const ocrFallback = async (imagePath) => {
  try {
    const { createWorker } = require('tesseract.js');
    const worker = await createWorker('eng+vie', 1, { logger: () => {} });
    try {
      const { data: { text, confidence } } = await worker.recognize(imagePath);
      return {
        description: text?.trim()
          ? `[OCR extracted text — confidence ${Math.round(confidence)}%]\n\n${text.trim()}`
          : null,
        method: 'tesseract-ocr',
      };
    } finally {
      await worker.terminate();
    }
  } catch (err) {
    console.warn('[visionService] Tesseract OCR failed:', err.message);
    return { description: null, method: 'none' };
  }
};

const describeImage = async (imagePath, prompt = null) => {
  if (!fs.existsSync(imagePath)) {
    return { description: null, error: `File not found: ${imagePath}`, available: false };
  }

  const ollamaUp = await isOllamaRunning();

  if (ollamaUp) {
    const modelAvailable = await hasVisionModel(VISION_MODEL);

    if (modelAvailable) {
      try {
        const buffer = fs.readFileSync(imagePath);
        const base64 = buffer.toString('base64');
        const description = await describeWithOllama(base64, prompt, VISION_MODEL);
        return { description, method: `ollama/${VISION_MODEL}`, available: true };
      } catch (err) {
        console.warn(`[visionService] ${VISION_MODEL} failed:`, err.message);
      }
    } else {
      console.warn(`[visionService] Model '${VISION_MODEL}' not found. Run: ollama pull ${VISION_MODEL}`);
    }
  }

  console.log('[visionService] Using Tesseract OCR fallback');
  const ocr = await ocrFallback(imagePath);
  return {
    description: ocr.description,
    method: ocr.method,
    available: !!ocr.description,
    note: ollamaUp
      ? `Vision model '${VISION_MODEL}' not installed. Run: ollama pull ${VISION_MODEL}`
      : `Ollama not running. Install at https://ollama.ai then: ollama pull ${VISION_MODEL}`,
  };
};

const buildImageContext = async (imageAttachments = []) => {
  if (!imageAttachments.length) return '';

  const sections = [];

  for (const att of imageAttachments) {
    const localPath = att.localPath || path.join(process.cwd(), 'uploads', path.basename(att.url || att.filename || ''));
    const name = att.originalName || path.basename(localPath);

    const result = await describeImage(localPath);

    if (result.available && result.description) {
      const methodNote = result.note ? ` *(${result.note})*` : '';
      sections.push(
        `<image name="${name}" analyzed-by="${result.method}"${methodNote}>\n${result.description}\n</image>`
      );
    } else {
      const note = result.note || result.error || 'Could not analyze';
      sections.push(`<image name="${name}">[Could not analyze: ${note}]</image>`);
    }
  }

  if (!sections.length) return '';
  return 'The user has attached image(s). Here is the analysis:\n\n' + sections.join('\n\n');
};

module.exports = { describeImage, buildImageContext, isOllamaRunning };
