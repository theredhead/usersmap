import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { randomBytes, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { AppModule as SourceAppModule } from './app.module';
import { Database as SourceDatabase } from './database/database.service';
import { tokenHash } from './auth/auth.service';
import { normalizeVideo } from './media/video-normalizer';
import { Configuration as SourceConfiguration } from './configuration';

const requireBuilt = createRequire(import.meta.url);
const compiledApp: typeof import('./app.module') | null = process.env['TEST_COMPILED_API']
  ? requireBuilt('../../../dist/api/apps/api/src/app.module.js')
  : null;
const compiledDatabase: typeof import('./database/database.service') | null = process.env[
  'TEST_COMPILED_API'
]
  ? requireBuilt('../../../dist/api/apps/api/src/database/database.service.js')
  : null;
const compiledConfiguration: typeof import('./configuration') | null = process.env[
  'TEST_COMPILED_API'
]
  ? requireBuilt('../../../dist/api/apps/api/src/configuration.js')
  : null;
const AppModule = compiledApp?.AppModule ?? SourceAppModule;
const Database = compiledDatabase?.Database ?? SourceDatabase;
const Configuration = compiledConfiguration?.Configuration ?? SourceConfiguration;

process.env['DATABASE_URL'] =
  process.env['TEST_DATABASE_URL'] ??
  'postgres://newton:newton-test-only@127.0.0.1:55439/newton_test';
process.env['PUBLIC_URL'] = 'http://localhost:4200';
process.env['NODE_ENV'] = 'test';

describe('real PostgreSQL API', () => {
  let app: INestApplication;
  let database: SourceDatabase;
  let base: string;
  const memberId = randomUUID();
  const viewerId = randomUUID();
  const token = randomBytes(32).toString('hex');
  const viewerToken = randomBytes(32).toString('hex');
  const csrf = randomBytes(32).toString('hex');
  const discordId = `test-${randomUUID()}`;
  const posts: string[] = [];
  const media: string[] = [];

  const request = (path: string, method = 'GET', body?: unknown, cookie = token) =>
    fetch(`${base}/api/${path}`, {
      method,
      headers: {
        Cookie: `newton_session=${cookie}`,
        Origin: 'http://localhost:4200',
        'x-csrf-token': csrf,
        ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });
  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.use(cookieParser());
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
    database = app.get(Database);
    for (const [id, discord, sessionToken] of [
      [memberId, discordId, token],
      [viewerId, `test-${randomUUID()}`, viewerToken],
    ]) {
      await database.query(
        `INSERT INTO members(id, discord_id, nickname, schema_id, profile_complete)
         VALUES ($1, $2, 'Integration member', 'newton-profile-v1', true)`,
        [id, discord],
      );
      await database.query(
        `INSERT INTO sessions(token_hash, member_id, csrf_token, expires_at)
        VALUES ($1, $2, $3, now() + interval '1 hour')`,
        [tokenHash(sessionToken), id, csrf],
      );
    }
  });
  afterAll(async () => {
    if (database) {
      await database.query('DELETE FROM posts WHERE id = ANY($1::uuid[])', [posts]);
      await database.query('DELETE FROM members WHERE id = ANY($1::uuid[])', [
        [memberId, viewerId],
      ]);
      await database.query('DELETE FROM media WHERE id = ANY($1::uuid[])', [media]);
    }
    await app?.close();
  });
  it('protects content and writes', async () => {
    expect((await fetch(`${base}/api/members`)).status).toBe(401);
    expect(
      (
        await fetch(`${base}/api/me`, {
          method: 'DELETE',
          headers: { Cookie: `newton_session=${token}` },
        })
      ).status,
    ).toBe(403);
    expect((await fetch(`${base}/api/configuration`)).status).toBe(200);
  });
  it('uses Discord only for identity, without a guild setting or membership request', async () => {
    const configuration = app.get(Configuration);
    const previousId = configuration.values.DISCORD_CLIENT_ID;
    const previousSecret = configuration.values.DISCORD_CLIENT_SECRET;
    configuration.values.DISCORD_CLIENT_ID = 'oauth-test-client';
    configuration.values.DISCORD_CLIENT_SECRET = 'oauth-test-placeholder';
    const discordIdentity = '123456789012345678';
    const originalFetch = globalThis.fetch;
    const discordRequests: string[] = [];
    const mock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, options) => {
      const url = String(input);
      if (!url.startsWith('https://discord.com/')) return originalFetch(input, options);
      discordRequests.push(url);
      if (url.endsWith('/oauth2/token'))
        return Response.json({ access_token: 'test-access-token' });
      if (url.endsWith('/users/@me')) {
        return Response.json({ id: discordIdentity, username: 'Identity only', avatar: null });
      }
      throw new Error('Unexpected Discord API request.');
    });
    try {
      expect(configuration.public.discordConfigured).toBe(true);
      const start = await fetch(`${base}/api/auth/discord`, { redirect: 'manual' });
      expect(start.status).toBe(302);
      const redirect = new URL(start.headers.get('location')!);
      expect(redirect.searchParams.get('scope')).toBe('identify');
      const state = redirect.searchParams.get('state')!;
      const callback = await fetch(
        `${base}/api/auth/discord/callback?state=${state}&code=test-code`,
        {
          redirect: 'manual',
          headers: { Cookie: `newton_oauth=${state}` },
        },
      );
      expect(callback.status).toBe(302);
      expect(callback.headers.get('location')).toBe('/settings');
      expect(callback.headers.get('set-cookie')).toContain('newton_session=');
      expect(discordRequests).toEqual([
        'https://discord.com/api/v10/oauth2/token',
        'https://discord.com/api/v10/users/@me',
      ]);
      const [member] = await database.query<{ id: string }>(
        'SELECT id FROM members WHERE discord_id = $1',
        [discordIdentity],
      );
      expect(member.id).toBeTruthy();
    } finally {
      mock.mockRestore();
      configuration.values.DISCORD_CLIENT_ID = previousId;
      configuration.values.DISCORD_CLIENT_SECRET = previousSecret;
      await database.query('DELETE FROM members WHERE discord_id = $1', [discordIdentity]);
    }
  });
  it('validates and saves optional profile fields and sanitized biographies', async () => {
    const profile = {
      nickname: 'Test Newton',
      unit: 'mi',
      customAnswers: { messagepad2100: true },
      birthMonth: 2,
      birthDay: 29,
      bio: '<p>Hello<script>bad()</script></p>',
    };
    const response = await request('me', 'PUT', profile);
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.bio).toBe('<p>Hello</p>');
    expect(result.birthYear).toBeNull();
    expect(result.customAnswers.messagepad2100).toBe(true);
    expect(
      (await request('me', 'PUT', { ...profile, customAnswers: { invented: true } })).status,
    ).toBe(400);
  });
  it('stores only the present coarse area and enforces exact radius bounds', async () => {
    const first = { lat: 52.123456, lng: 4.123456, radiusKm: 5, comment: 'Hello there' };
    expect(
      (await request('me/locations/checkin', 'PUT', { ...first, radiusKm: 0.99999 })).status,
    ).toBe(400);
    expect(
      (await request('me/locations/checkin', 'PUT', { ...first, radiusKm: 25.00001 })).status,
    ).toBe(400);
    expect((await request('me/locations/checkin', 'PUT', first)).status).toBe(200);
    const [stored] = await database.query<{ latitude: number; longitude: number }>(
      'SELECT latitude, longitude FROM locations WHERE member_id = $1',
      [memberId],
    );
    expect(stored.latitude).not.toBe(first.lat);
    expect(stored.longitude).not.toBe(first.lng);
    expect(
      (await request('me/locations/checkin', 'PUT', { ...first, lat: 40, lng: -70 })).status,
    ).toBe(200);
    const locations = await database.query('SELECT * FROM locations WHERE member_id = $1', [
      memberId,
    ]);
    expect(locations).toHaveLength(1);
  });
  it('validates square avatar dimensions and normalizes media', async () => {
    const invalid = await sharp({
      create: { width: 513, height: 513, channels: 3, background: '#223322' },
    })
      .png()
      .toBuffer();
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(invalid)], { type: 'image/png' }), 'avatar.png');
    expect((await request('media/avatar', 'POST', form)).status).toBe(400);
    const valid = await sharp({
      create: { width: 64, height: 64, channels: 3, background: '#223322' },
    })
      .png()
      .toBuffer();
    for (const purpose of ['avatar', 'post']) {
      const upload = new FormData();
      upload.append('file', new Blob([new Uint8Array(valid)], { type: 'image/png' }), 'image.png');
      const response = await request(`media/${purpose}`, 'POST', upload);
      expect(response.status).toBe(201);
      media.push((await response.json()).id);
    }
  });
  it('emits SSE notifications and serializes concurrent posting limits', async () => {
    const controller = new AbortController();
    const response = await fetch(`${base}/api/posts/events`, {
      headers: { Cookie: `newton_session=${token}` },
      signal: controller.signal,
    });
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const reader = response.body!.getReader();
    await reader.read();
    const responses = await Promise.all([
      request('posts', 'POST', { body: 'First update', mediaId: media[1] }),
      request('posts', 'POST', { body: 'Concurrent update', mediaId: media[1] }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 429]);
    for (const response of responses) {
      if (response.status === 201) posts.push((await response.json()).id);
    }
    const event = await reader.read();
    expect(new TextDecoder().decode(event.value)).toContain('posts-changed');
    controller.abort();
    await reader.cancel().catch(() => undefined);
    const list = await (await request('posts?limit=1&sort=desc')).json();
    expect(list.items).toHaveLength(1);
    expect(list.items[0].id).toBe(posts[0]);
    expect(list.items[0].media.id).toBe(media[1]);
  });
  it('normalizes videos, rejects duration violations, and supports playback ranges', async () => {
    const source = spawnSync('ffmpeg', [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=c=green:s=64x64:d=0.4',
      '-c:v',
      'libx264',
      '-movflags',
      'frag_keyframe+empty_moov',
      '-f',
      'mp4',
      'pipe:1',
    ]);
    expect(source.status).toBe(0);
    await expect(normalizeVideo(source.stdout, 0.1, 25_000_000)).rejects.toThrow(
      'seconds or shorter',
    );
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(source.stdout)], { type: 'video/mp4' }),
      'clip.mp4',
    );
    const response = await request('media/post', 'POST', form);
    expect(response.status).toBe(201);
    const uploaded = await response.json();
    media.push(uploaded.id);
    const range = await fetch(`${base}${uploaded.url}`, {
      headers: { Cookie: `newton_session=${token}`, Range: 'bytes=0-99' },
    });
    expect(range.status).toBe(206);
    expect(range.headers.get('content-type')).toBe('video/mp4');
    expect((await range.arrayBuffer()).byteLength).toBe(100);
  });
  it('persists video links separately from the message and rejects unsafe URLs', async () => {
    for (const videoUrl of ['javascript:alert(1)', 'http://youtu.be/abc', 'not a link']) {
      expect((await request('posts', 'POST', { body: '', videoUrl })).status).toBe(400);
    }
    await database.query('UPDATE members SET next_post_at = now() WHERE id = $1', [memberId]);
    const videoUrl = 'https://www.youtube.com/watch?v=abc123';
    const response = await request('posts', 'POST', { body: '', videoUrl });
    expect(response.status).toBe(201);
    const created = await response.json();
    posts.push(created.id);
    const page = await (await request('posts?limit=1&sort=desc')).json();
    expect(page.items[0]).toMatchObject({ id: created.id, body: '', media: null, videoUrl });
    expect(page.nextCursor).not.toBeNull();
    const older = await (await request(`posts?limit=1&sort=desc&cursor=${page.nextCursor}`)).json();
    expect(older.items[0]).toMatchObject({ id: posts[0], videoUrl: null });
  });
  it('deletes personal data but retains anonymous public posts and attachments', async () => {
    expect((await request('me', 'DELETE')).status).toBe(200);
    for (const table of ['members', 'sessions', 'locations']) {
      const column = table === 'members' ? 'id' : 'member_id';
      expect(
        await database.query(`SELECT 1 FROM ${table} WHERE ${column} = $1`, [memberId]),
      ).toHaveLength(0);
    }
    expect(await database.query('SELECT 1 FROM media WHERE id = $1', [media[0]])).toHaveLength(0);
    expect(
      await database.query('SELECT 1 FROM media WHERE owner_id = $1', [memberId]),
    ).toHaveLength(0);
    const list = await (await request('posts?sort=desc', 'GET', undefined, viewerToken)).json();
    const retained = list.items.find((post: { id: string }) => post.id === posts[0]);
    expect(retained.author).toBeNull();
    expect(retained.media.id).toBe(media[1]);
    const retainedLink = list.items.find((post: { id: string }) => post.id === posts[1]);
    expect(retainedLink.author).toBeNull();
    expect(retainedLink.videoUrl).toBe('https://www.youtube.com/watch?v=abc123');
    expect((await request('members', 'GET')).status).toBe(401);
  });
});
