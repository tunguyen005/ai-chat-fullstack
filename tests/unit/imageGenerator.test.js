import { describe, it, expect, vi } from 'vitest';

vi.mock('https');
vi.mock('http');

import {
  extractImagePromptFromMessage,
  buildPollinationsUrl,
} from '../../backend/src/services/imageGenerator.js';

const detectFlow = (content, attachments) => {
  const hasImageAttachment = attachments.some((a) => a.mimetype?.startsWith('image/'));
  if (hasImageAttachment) return { flow: 'vision' };
  const imagePrompt = extractImagePromptFromMessage(content || '');
  if (imagePrompt) return { flow: 'imagegen', imagePrompt };
  return { flow: 'normal' };
};

describe('detectFlow', () => {
  describe('vision flow — has image attachment', () => {
    it('should return vision when image attached, even if text looks like gen request', () => {
      const result = detectFlow('ảnh này nói gì', [
        { mimetype: 'image/jpeg', originalName: 'photo.jpg', url: '/uploads/photo.jpg' },
      ]);
      expect(result.flow).toBe('vision');
    });

    it('should return vision regardless of content', () => {
      const result = detectFlow('generate an image of a dog', [
        { mimetype: 'image/png', originalName: 'screenshot.png', url: '/uploads/ss.png' },
      ]);
      expect(result.flow).toBe('vision');
    });

    it('should return vision for multiple attachments with one image', () => {
      const result = detectFlow('describe these files', [
        { mimetype: 'application/pdf', originalName: 'doc.pdf', url: '/uploads/doc.pdf' },
        { mimetype: 'image/jpeg', originalName: 'img.jpg', url: '/uploads/img.jpg' },
      ]);
      expect(result.flow).toBe('vision');
    });
  });

  describe('imagegen flow — text trigger, no image attachment', () => {
    it('should detect English generate request', () => {
      const result = detectFlow('generate an image of a sunset', []);
      expect(result.flow).toBe('imagegen');
      expect(result.imagePrompt).toContain('sunset');
    });

    it('should detect "create image" pattern', () => {
      const result = detectFlow('create an image of a mountain', []);
      expect(result.flow).toBe('imagegen');
    });

    it('should detect Vietnamese tạo ảnh', () => {
      const result = detectFlow('tạo ảnh một con mèo ngồi trên mây', []);
      expect(result.flow).toBe('imagegen');
      expect(result.imagePrompt).toBeTruthy();
    });

    it('should detect Vietnamese vẽ', () => {
      const result = detectFlow('vẽ một chiếc xe đua màu đỏ', []);
      expect(result.flow).toBe('imagegen');
    });

    it('should detect "draw" pattern', () => {
      const result = detectFlow('draw a cat sitting on the moon', []);
      expect(result.flow).toBe('imagegen');
    });

    it('should NOT trigger imagegen for non-image file attachments', () => {
      const result = detectFlow('generate an image of a dog', [
        { mimetype: 'application/pdf', originalName: 'doc.pdf', url: '/uploads/doc.pdf' },
      ]);
      expect(result.flow).toBe('imagegen');
    });
  });

  describe('normal flow', () => {
    it('should return normal for regular chat', () => {
      const result = detectFlow('What is the capital of Vietnam?', []);
      expect(result.flow).toBe('normal');
    });

    it('should return normal for "ảnh này" without attachment', () => {
      const result = detectFlow('ảnh này đẹp không?', []);
      expect(result.flow).toBe('normal');
    });

    it('should return normal for empty content with no attachments', () => {
      const result = detectFlow('', []);
      expect(result.flow).toBe('normal');
    });

    it('should return normal for code-related questions', () => {
      const result = detectFlow('write a React component for a todo list', []);
      expect(result.flow).toBe('normal');
    });

    it('should return normal for file-related questions with PDF', () => {
      const result = detectFlow('tóm tắt file này', [
        { mimetype: 'application/pdf', originalName: 'doc.pdf', url: '/uploads/doc.pdf' },
      ]);
      expect(result.flow).toBe('normal');
    });
  });
});

describe('extractImagePromptFromMessage', () => {
  it('returns prompt for "generate an image of X"', () => {
    expect(extractImagePromptFromMessage('generate an image of a cat')).toContain('cat');
  });

  it('returns prompt for "create image: X"', () => {
    const result = extractImagePromptFromMessage('create image: a mountain at sunrise');
    expect(result).toBeTruthy();
  });

  it('returns null for normal chat', () => {
    expect(extractImagePromptFromMessage('How does React work?')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractImagePromptFromMessage('')).toBeNull();
  });

  it('handles Vietnamese tạo ảnh', () => {
    const result = extractImagePromptFromMessage('tạo ảnh con chó đang chơi');
    expect(result).toBeTruthy();
  });

  it('handles Vietnamese vẽ', () => {
    const result = extractImagePromptFromMessage('vẽ một bức tranh phong cảnh');
    expect(result).toBeTruthy();
  });
});

describe('buildPollinationsUrl', () => {
  it('should encode prompt correctly', () => {
    const url = buildPollinationsUrl('a cat on the moon');
    expect(url).toContain('a%20cat%20on%20the%20moon');
    expect(url.startsWith('https://image.pollinations.ai/prompt/')).toBe(true);
  });

  it('should include default params', () => {
    const url = buildPollinationsUrl('test');
    expect(url).toContain('width=1024');
    expect(url).toContain('height=1024');
    expect(url).toContain('nologo=true');
  });

  it('should allow custom dimensions', () => {
    const url = buildPollinationsUrl('test', { width: 512, height: 768 });
    expect(url).toContain('width=512');
    expect(url).toContain('height=768');
  });

  it('should encode Vietnamese characters', () => {
    const url = buildPollinationsUrl('con mèo trên mây');
    expect(url).toContain('image.pollinations.ai');
    expect(() => new URL(url)).not.toThrow();
  });
});
