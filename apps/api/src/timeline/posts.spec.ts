import { describe, expect, it } from 'vitest';
import { postInput } from './posts.service';
import { decodeCursor, encodeCursor } from '../http/pagination';

describe('posts and pagination', () => {
  it('limits messages to 250 Unicode characters', () => {
    expect(postInput.safeParse({ body: '🙂'.repeat(250) }).success).toBe(true);
    expect(postInput.safeParse({ body: '🙂'.repeat(251) }).success).toBe(false);
    expect(postInput.safeParse({ body: ' '.repeat(12) }).success).toBe(false);
    expect(
      postInput.safeParse({ body: '', mediaId: '6b826d62-c9ef-4edb-a895-ea8243a4a824' }).success,
    ).toBe(true);
  });
  it('round trips composite cursors and rejects malformed values', () => {
    const date = '2026-10-20T18:00:00.000Z';
    const id = '6b826d62-c9ef-4edb-a895-ea8243a4a824';
    expect(decodeCursor(encodeCursor(date, id))).toEqual({ date, id });
    expect(() => decodeCursor('not-a-cursor')).toThrow();
    expect(() => decodeCursor(encodeCursor('invalid date', 'not-an-id'))).toThrow();
  });
  it('accepts video-link-only posts and rejects unsafe or oversized links', () => {
    for (const videoUrl of [
      'https://www.youtube.com/watch?v=abc123',
      'https://youtu.be/abc123?t=10',
      'https://vimeo.com/123456',
      'https://video.example/channel/clip',
    ]) {
      expect(postInput.parse({ body: '', videoUrl }).videoUrl).toBe(videoUrl);
    }
    for (const videoUrl of [
      '',
      'not a URL',
      'javascript:alert(1)',
      'data:text/html,video',
      'http://youtube.com/watch?v=abc',
      'https://user:password@youtube.com/watch?v=abc',
      `https://youtube.com/watch?v=${'a'.repeat(2048)}`,
    ]) {
      expect(postInput.safeParse({ body: '', videoUrl }).success).toBe(false);
    }
    expect(postInput.parse({ body: 'Existing post' }).videoUrl).toBeNull();
  });
});
