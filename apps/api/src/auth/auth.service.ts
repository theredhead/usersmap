import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { Database } from '../database/database.service';
import { Configuration } from '../configuration';
import { parseInput } from '../http/validation';

export interface AuthenticatedSession {
  memberId: string;
  csrfToken: string;
}
export type AuthenticatedRequest = Request & { memberSession?: AuthenticatedSession };
export const tokenHash = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(
    @Inject(Database) private readonly database: Database,
    @Inject(Configuration) private readonly configuration: Configuration,
  ) {}

  private get cookieOptions() {
    return {
      httpOnly: true,
      secure: this.configuration.values.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
    };
  }

  async session(request: Request): Promise<AuthenticatedSession | null> {
    const token: unknown = request.cookies?.['newton_session'];
    if (typeof token !== 'string' || token.length !== 64) return null;
    const [row] = await this.database.query<{ memberId: string; csrfToken: string }>(
      `SELECT member_id AS "memberId", csrf_token AS "csrfToken" FROM sessions
       WHERE token_hash = $1 AND expires_at > now()`,
      [tokenHash(token)],
    );
    return row ?? null;
  }

  async start(response: Response): Promise<void> {
    const v = this.configuration.values;
    if (!this.configuration.public.discordConfigured) {
      throw new ForbiddenException('Discord access has not been configured for this deployment.');
    }
    const state = randomBytes(32).toString('hex');
    await this.database.query('DELETE FROM oauth_states WHERE expires_at < now()');
    await this.database.query(
      `INSERT INTO oauth_states(token_hash, expires_at) VALUES ($1, now() + interval '10 minutes')`,
      [tokenHash(state)],
    );
    response.cookie('newton_oauth', state, { ...this.cookieOptions, maxAge: 600000 });
    const parameters = new URLSearchParams({
      client_id: v.DISCORD_CLIENT_ID,
      response_type: 'code',
      redirect_uri: `${v.PUBLIC_URL}/api/auth/discord/callback`,
      scope: 'identify',
      state,
    });
    response.redirect(`https://discord.com/oauth2/authorize?${parameters}`);
  }

  async finish(request: Request, response: Response): Promise<void> {
    const cookie: unknown = request.cookies?.['newton_oauth'];
    const { state, code } = parseInput(
      z.object({ state: z.string().length(64), code: z.string().min(1).max(1000) }),
      request.query,
    );
    if (typeof cookie !== 'string' || state !== cookie)
      throw new UnauthorizedException('Invalid login state.');
    response.clearCookie('newton_oauth', this.cookieOptions);
    const states = await this.database.query(
      'DELETE FROM oauth_states WHERE token_hash = $1 AND expires_at > now() RETURNING token_hash',
      [tokenHash(state)],
    );
    if (!states.length) throw new UnauthorizedException('Login expired. Please try again.');
    const v = this.configuration.values;
    const tokenResponse = await fetch('https://discord.com/api/v10/oauth2/token', {
      method: 'POST',
      body: new URLSearchParams({
        client_id: v.DISCORD_CLIENT_ID,
        client_secret: v.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${v.PUBLIC_URL}/api/auth/discord/callback`,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!tokenResponse.ok)
      throw new UnauthorizedException('Discord login failed. Please try again.');
    const tokens = z.object({ access_token: z.string() }).parse(await tokenResponse.json());
    const headers = { Authorization: `Bearer ${tokens.access_token}` };
    const userResponse = await fetch('https://discord.com/api/v10/users/@me', {
      headers,
      signal: AbortSignal.timeout(15000),
    });
    if (!userResponse.ok) throw new UnauthorizedException('Unable to read your Discord account.');
    const discordUser = z
      .object({
        id: z.string().regex(/^\d+$/),
        username: z.string(),
        global_name: z.string().nullable().optional(),
        avatar: z.string().nullable(),
      })
      .parse(await userResponse.json());
    const [member] = await this.database.query<{ id: string; profile_complete: boolean }>(
      `INSERT INTO members(id, discord_id, nickname, schema_id) VALUES ($1, $2, $3, $4)
       ON CONFLICT(discord_id) DO UPDATE SET discord_id = EXCLUDED.discord_id
       RETURNING id, profile_complete`,
      [
        randomUUID(),
        discordUser.id,
        (discordUser.global_name || discordUser.username).slice(0, 60),
        this.configuration.profileSchema.id,
      ],
    );
    if (
      !member.profile_complete &&
      discordUser.avatar &&
      /^[a-zA-Z0-9_]+$/.test(discordUser.avatar)
    ) {
      const normalized = await this.discordAvatar(discordUser.id, discordUser.avatar);
      if (normalized)
        await this.database.transaction(async (client) => {
          const id = randomUUID();
          const previous = await client.query<{ avatar_id: string | null }>(
            'SELECT avatar_id FROM members WHERE id = $1 FOR UPDATE',
            [member.id],
          );
          await client.query(
            `INSERT INTO media(id, owner_id, purpose, content_type, contents) VALUES ($1, $2, 'avatar', 'image/webp', $3)`,
            [id, member.id, normalized],
          );
          await client.query('UPDATE members SET avatar_id = $1 WHERE id = $2', [id, member.id]);
          if (previous.rows[0].avatar_id) {
            await client.query('DELETE FROM media WHERE id = $1', [previous.rows[0].avatar_id]);
          }
        });
    }
    const sessionToken = randomBytes(32).toString('hex');
    await this.database.query('DELETE FROM sessions WHERE expires_at < now()');
    await this.database.query(
      `INSERT INTO sessions(token_hash, member_id, csrf_token, expires_at)
       VALUES ($1, $2, $3, now() + interval '12 hours')`,
      [tokenHash(sessionToken), member.id, randomBytes(32).toString('hex')],
    );
    response.cookie('newton_session', sessionToken, {
      ...this.cookieOptions,
      maxAge: 12 * 3600000,
    });
    response.redirect(member.profile_complete ? '/' : '/settings');
  }

  private async discordAvatar(discordId: string, avatarId: string): Promise<Buffer | null> {
    let response: globalThis.Response;
    try {
      response = await fetch(
        `https://cdn.discordapp.com/avatars/${discordId}/${avatarId}.png?size=256`,
        {
          signal: AbortSignal.timeout(15000),
        },
      );
    } catch (error) {
      if (
        !(error instanceof TypeError) &&
        !(error instanceof DOMException && error.name === 'TimeoutError')
      )
        throw error;
      this.logger.warn('Discord avatar download unavailable; using the nickname avatar.');
      return null;
    }
    if (!response.ok) {
      this.logger.warn(
        `Discord avatar download returned HTTP ${response.status}; using the nickname avatar.`,
      );
      return null;
    }
    const { default: sharp } = await import('sharp');
    return sharp(Buffer.from(await response.arrayBuffer()))
      .resize(256, 256, { fit: 'cover' })
      .webp()
      .toBuffer();
  }

  async logout(request: Request, response: Response): Promise<void> {
    const token: unknown = request.cookies?.['newton_session'];
    if (typeof token === 'string') {
      await this.database.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash(token)]);
    }
    response.clearCookie('newton_session', this.cookieOptions);
  }
}
