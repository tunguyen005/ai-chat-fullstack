require('dotenv').config();
const https = require('https');
const Groq = require('groq-sdk');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_VISION_MODEL = process.env.GROQ_VISION_MODEL;
const groq = new Groq({ apiKey: GROQ_API_KEY });


const fetchImageBase64 = (url) =>
  new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchImageBase64(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} fetching image`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const contentType = res.headers['content-type'] || 'image/jpeg';
        resolve({ base64: buffer.toString('base64'), contentType });
      });
      res.on('error', reject);
    }).on('error', reject);
  });

const describeWithGroq = async (imageUrl, prompt = null) => {
  const { base64, contentType } = await fetchImageBase64(imageUrl);

  const completion = await groq.chat.completions.create({
    model: GROQ_VISION_MODEL,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: `data:${contentType};base64,${base64}`,
            },
          },
          {
            type: 'text',
            text: prompt ||
              'Describe this image in detail. If there is any text in the image, transcribe it exactly. Respond in the same language as any text visible in the image.',
          },
        ],
      },
    ],
    temperature: 0.1,
    max_tokens: 1024,
  });

  return completion.choices[0]?.message?.content?.trim() || '';
};

const ocrFallback = async (imageUrl) => {
  try {
    const { createWorker } = require('tesseract.js');
    const worker = await createWorker('eng+vie', 1, { logger: () => {} });
    try {
      const { data: { text, confidence } } = await worker.recognize(imageUrl);
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

const describeImage = async (imageUrl, prompt = null) => {
  if (!imageUrl) {
    return { description: null, error: 'No image URL provided', available: false };
  }

  try {
    const description = await describeWithGroq(imageUrl, prompt);
    return { description, method: `groq/${GROQ_VISION_MODEL}`, available: true };
  } catch (err) {
    console.warn(`[visionService] Groq vision failed: ${err.message}`);
  }

  console.log('[visionService] Falling back to Tesseract OCR');
  const ocr = await ocrFallback(imageUrl);
  return {
    description: ocr.description,
    method: ocr.method,
    available: !!ocr.description,
    note: `Groq vision unavailable. OCR fallback used.`,
  };
};

const buildImageContext = async (imageAttachments = []) => {
  if (!imageAttachments.length) return '';

  const sections = [];

  for (const att of imageAttachments) {
    const imageUrl = att.url || att.localPath;
    const name = att.originalName || 'image';

    if (!imageUrl) {
      sections.push(`<image name="${name}">[No URL available]</image>`);
      continue;
    }

    const result = await describeImage(imageUrl);

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

module.exports = { describeImage, buildImageContext };