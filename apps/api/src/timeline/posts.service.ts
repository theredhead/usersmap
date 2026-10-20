import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Page, TimelinePost } from '../../../../shared/contracts';
import { Database } from '../database/database.service';
import { Configuration } from '../configuration';
import { decodeCursor, encodeCursor } from '../http/pagination';
import { parseInput } from '../http/validation';
import { isVideoLink } from '../../../../shared/video-link';

export const postInput = z
  .object({
    body: z
      .string()
      .trim()
      .refine((value) => Array.from(value).length <= 250, 'Use 250 characters or fewer.'),
    mediaId: z.uuid().nullable().default(null),
    videoUrl: z
      .string()
      .trim()
      .max(2048)
      .refine(isVideoLink, 'Use a full HTTPS video link without a username or password.')
      .nullable()
      .default(null),
  })
  .strict()
  .refine(
    (value) => value.body.length > 0 || value.mediaId !== null || value.videoUrl !== null,
    'Add a message, video link, or upload.',
  );

const projection = `
  p.id, p.body, p.video_url AS "videoUrl", p.created_at AS "createdAt",
  CASE WHEN m.id IS NULL THEN NULL ELSE jsonb_build_object('id', m.id, 'nickname', m.nickname,
    'avatarUrl', CASE WHEN m.avatar_id IS NULL THEN NULL ELSE '/api/media/' || m.avatar_id END) END AS author,
  CASE WHEN media.id IS NULL THEN NULL ELSE jsonb_build_object('id', media.id,
    'type', CASE WHEN media.content_type LIKE 'video/%' THEN 'video' ELSE 'image' END,
    'url', '/api/media/' || media.id) END AS media`;

@Injectable()
export class PostsService {
  constructor(
    @Inject(Database) private readonly database: Database,
    @Inject(Configuration) private readonly configuration: Configuration,
  ) {}

  async list(
    limit: number,
    cursor: string | undefined,
    sort: 'asc' | 'desc',
  ): Promise<Page<TimelinePost>> {
    const decoded = decodeCursor(cursor);
    const comparison = sort === 'desc' ? '<' : '>';
    const rows = await this.database.query<TimelinePost & { createdAt: Date }>(
      `SELECT ${projection} FROM posts p LEFT JOIN members m ON m.id = p.author_id
       LEFT JOIN media ON media.id = p.media_id
       WHERE ($1::timestamptz IS NULL OR (p.created_at, p.id) ${comparison} ($1::timestamptz, $2::uuid))
       ORDER BY p.created_at ${sort}, p.id ${sort} LIMIT $3`,
      [decoded?.date ?? null, decoded?.id ?? null, limit + 1],
    );
    const items: TimelinePost[] = rows.slice(0, limit).map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    }));
    const last = items[items.length - 1];
    return {
      items,
      nextCursor: rows.length > limit ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  async create(memberId: string, input: unknown): Promise<{ id: string }> {
    const value = parseInput(postInput, input);
    const id = randomUUID();
    await this.database.transaction(async (client) => {
      const member = await client.query<{ profile_complete: boolean; allowed: boolean }>(
        `SELECT profile_complete, next_post_at <= now() AS allowed FROM members WHERE id = $1 FOR UPDATE`,
        [memberId],
      );
      if (!member.rows[0]?.profile_complete)
        throw new ForbiddenException('Complete your profile before posting.');
      // Re-evaluate after acquiring the row lock, rather than using a pre-lock snapshot.
      const allowed = await client.query<{ allowed: boolean }>(
        'SELECT next_post_at <= clock_timestamp() AS allowed FROM members WHERE id = $1',
        [memberId],
      );
      if (!allowed.rows[0].allowed)
        throw new HttpException('Please wait before posting again.', 429);
      if (value.mediaId) {
        const media = await client.query(
          `SELECT id FROM media WHERE id = $1 AND owner_id = $2 AND purpose = 'post'
           AND NOT EXISTS (SELECT 1 FROM posts WHERE media_id = $1) FOR UPDATE`,
          [value.mediaId, memberId],
        );
        if (!media.rowCount) throw new BadRequestException('This attachment is unavailable.');
      }
      await client.query(
        'INSERT INTO posts(id, author_id, body, media_id, video_url) VALUES ($1, $2, $3, $4, $5)',
        [id, memberId, value.body, value.mediaId, value.videoUrl],
      );
      await client.query(
        `UPDATE members SET next_post_at = clock_timestamp() + $2 * interval '1 second' WHERE id = $1`,
        [memberId, this.configuration.values.POST_INTERVAL_SECONDS],
      );
      await client.query(`SELECT pg_notify('newton_events', 'posts-changed')`);
    });
    return { id };
  }
}
