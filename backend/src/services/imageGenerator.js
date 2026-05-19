const https = require('https');
const http = require('http');
const cloudinary = require('../config/cloudinary');

const POLLINATIONS_BASE = 'https://image.pollinations.ai/prompt';

const buildPollinationsUrl = (prompt, options = {}) => {
  const {
    width = 1024,
    height = 1024,
    model = 'flux',
    seed = Math.floor(Math.random() * 1000000),
    nologo = true,
  } = options;

  const encoded = encodeURIComponent(prompt);
  const params = new URLSearchParams({ width, height, model, seed, nologo });
  return `${POLLINATIONS_BASE}/${encoded}?${params}`;
};

const fetchImageBuffer = (url) =>
  new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchImageBuffer(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
  
const uploadToCloudinary = (buffer, prompt) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'ai_generated',
        public_id: `gen_${Date.now()}`,
        resource_type: 'image',
        context: { caption: prompt.slice(0, 200) },
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });

const generateWithPollinations = async (prompt, options = {}) => {
  const pollinationsUrl = buildPollinationsUrl(prompt, options);

  try {
    const buffer = await fetchImageBuffer(pollinationsUrl);
    const cloudinaryUrl = await uploadToCloudinary(buffer, prompt);
    return {
      url: cloudinaryUrl,
      provider: 'pollinations',
      model: options.model || 'flux',
      prompt,
    };
  } catch (err) {
    // If upload fails, fall back to the raw Pollinations URL (ephemeral but usable)
    console.warn('[imageGenerator] Cloudinary upload failed, using direct URL:', err.message);
    return {
      url: pollinationsUrl,
      provider: 'pollinations',
      model: options.model || 'flux',
      prompt,
    };
  }
};

const SD_API_URL = process.env.SD_API_URL;

const generateWithStableDiffusion = async (prompt, options = {}) => {
  const {
    negative_prompt = 'blurry, bad quality, watermark, text',
    steps = 20,
    width = 512,
    height = 512,
    cfg_scale = 7,
  } = options;

  const payload = JSON.stringify({
    prompt, negative_prompt, steps, width, height, cfg_scale,
    sampler_index: 'Euler a',
  });

  return new Promise((resolve, reject) => {
    const url = new URL(`${SD_API_URL}/sdapi/v1/txt2img`);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port || 7860,
        path: url.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', async () => {
          try {
            const json = JSON.parse(data);
            const base64 = json.images?.[0];
            if (!base64) return reject(new Error('No image in SD response'));

            const buffer = Buffer.from(base64, 'base64');
            const cloudinaryUrl = await uploadToCloudinary(buffer, prompt).catch(() => null);

            resolve({
              url: cloudinaryUrl || `data:image/png;base64,${base64}`,
              provider: 'stable-diffusion',
              prompt,
            });
          } catch (e) {
            reject(new Error('Invalid JSON from SD: ' + e.message));
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(60000, () => reject(new Error('SD request timed out')));
    req.write(payload);
    req.end();
  });
};

const isSDRunning = () =>
  new Promise((resolve) => {
    if (!SD_API_URL) return resolve(false);
    const url = new URL(`${SD_API_URL}/sdapi/v1/sd-models`);
    const req = http.request(
      { hostname: url.hostname, port: url.port || 7860, path: url.pathname, method: 'GET' },
      (res) => { resolve(res.statusCode === 200); res.destroy(); }
    );
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => { resolve(false); req.destroy(); });
    req.end();
  });

const generateImage = async (prompt, options = {}) => {
  const provider = options.provider || 'auto';

  if (provider === 'pollinations') return generateWithPollinations(prompt, options);
  if (provider === 'stable-diffusion') return generateWithStableDiffusion(prompt, options);

  if (provider === 'auto') {
    const sdAvailable = await isSDRunning();
    if (sdAvailable) {
      try { return await generateWithStableDiffusion(prompt, options); }
      catch (err) { console.warn('[imageGenerator] SD failed, fallback:', err.message); }
    }
    return generateWithPollinations(prompt, options);
  }

  throw new Error(`Unknown provider: ${provider}`);
};

const extractImagePromptFromMessage = (text) => {
  if (!text?.trim()) return null;

  const triggers = [
    /^(?:generate|create|make|sinh)\s+(?:an?\s+)?(?:image|picture|photo|ảnh|hình)\s*(?:of\s+|về\s+|:)?\s*(.+)/i,
    /^(?:image|picture|photo|ảnh|hình)\s+(?:of|về|:)\s+(.+)/i,
    /^(?:draw|paint)\s+(.+)/i,
    /^(?:tạo|vẽ)\s+(.+)/i,
  ];

  for (const re of triggers) {
    const match = text.trim().match(re);
    if (match) return match[match.length - 1].trim();
  }

  return null;
};

module.exports = { generateImage, extractImagePromptFromMessage, buildPollinationsUrl };