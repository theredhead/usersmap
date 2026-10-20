import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { Database } from '../database/database.service';
import { normalizeVideo } from './video-normalizer';
import { Configuration } from '../configuration';

@Injectable()
export class MediaService {
  constructor(
    @Inject(Database) private readonly database: Database,
    @Inject(Configuration) private readonly configuration: Configuration,
  ) {}

  async upload(memberId: string, purpose: 'avatar' | 'post', file: Express.Multer.File) {
    const { fileTypeFromBuffer } = await import('file-type');
    const detected = await fileTypeFromBuffer(file.buffer);
    let contents: Buffer;
    let contentType: string;
    if (detected && ['image/jpeg', 'image/png', 'image/webp'].includes(detected.mime)) {
      const image = sharp(file.buffer, { limitInputPixels: 40_000_000, animated: false });
      const metadata = await image.metadata();
      if (
        purpose === 'avatar' &&
        (!metadata.width ||
          !metadata.height ||
          metadata.width !== metadata.height ||
          metadata.width > 512)
      ) {
        throw new BadRequestException('Choose a square avatar no larger than 512 × 512 pixels.');
      }
      contents = await image
        .rotate()
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .webp()
        .toBuffer();
      contentType = 'image/webp';
    } else if (
      purpose === 'post' &&
      detected &&
      ['video/mp4', 'video/webm', 'video/quicktime'].includes(detected.mime)
    ) {
      contents = await normalizeVideo(
        file.buffer,
        this.configuration.values.MAXIMUM_VIDEO_SECONDS,
        this.configuration.values.MAXIMUM_UPLOAD_BYTES,
      );
      contentType = 'video/mp4';
    } else {
      throw new BadRequestException('Choose a JPEG, PNG, WebP image or an MP4/WebM/MOV video.');
    }
    const id = randomUUID();
    await this.database.transaction(async (client) => {
      const member = await client.query<{ avatar_id: string | null }>(
        'SELECT avatar_id FROM members WHERE id = $1 FOR UPDATE',
        [memberId],
      );
      if (!member.rowCount) throw new NotFoundException('Account no longer exists.');
      const count = await client.query<{ count: string }>(
        `SELECT count(*) FROM media WHERE owner_id = $1 AND purpose = 'post'
         AND NOT EXISTS (SELECT 1 FROM posts WHERE media_id = media.id)`,
        [memberId],
      );
      if (purpose === 'post' && Number(count.rows[0].count) >= 5) {
        throw new BadRequestException('Remove unused attachments before uploading more.');
      }
      await client.query(
        'INSERT INTO media(id, owner_id, purpose, content_type, contents) VALUES ($1, $2, $3, $4, $5)',
        [id, memberId, purpose, contentType, contents],
      );
      if (purpose === 'avatar') {
        await client.query('UPDATE members SET avatar_id = $1 WHERE id = $2', [id, memberId]);
        if (member.rows[0].avatar_id)
          await client.query('DELETE FROM media WHERE id = $1', [member.rows[0].avatar_id]);
      }
    });
    return { id, url: `/api/media/${id}` };
  }

  async one(id: string, viewerId: string) {
    const [row] = await this.database.query<{ content_type: string; contents: Buffer }>(
      `SELECT content_type, contents FROM media WHERE id = $1 AND
       (owner_id = $2 OR EXISTS (SELECT 1 FROM members WHERE avatar_id = media.id AND profile_complete)
        OR EXISTS (SELECT 1 FROM posts WHERE media_id = media.id))`,
      [id, viewerId],
    );
    if (!row) throw new NotFoundException('Attachment not found.');
    return row;
  }

  async delete(id: string, memberId: string): Promise<void> {
    await this.database.query(
      `DELETE FROM media WHERE id = $1 AND owner_id = $2
       AND NOT EXISTS (SELECT 1 FROM posts WHERE media_id = media.id)`,
      [id, memberId],
    );
  }
}
