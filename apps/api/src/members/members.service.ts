import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Member, MyProfile, Page, MemberLocation } from '../../../../shared/contracts';
import { Database } from '../database/database.service';
import { Configuration } from '../configuration';
import { memberProjection } from './member-query';
import { cleanBiography, profileInput, validateCustomAnswers } from './profile-validation';
import { parseInput } from '../http/validation';

@Injectable()
export class MembersService {
  constructor(
    @Inject(Database) private readonly database: Database,
    @Inject(Configuration) private readonly configuration: Configuration,
  ) {}

  async list(
    limit: number,
    cursor: string | undefined,
    sort: 'asc' | 'desc',
  ): Promise<Page<Member>> {
    const comparison = sort === 'asc' ? '>' : '<';
    const rows = await this.database.query<{ member: Member }>(
      `SELECT ${memberProjection} AS member FROM members m
       WHERE m.profile_complete AND ($1::uuid IS NULL OR m.id ${comparison} $1)
       ORDER BY m.id ${sort} LIMIT $2`,
      [cursor ?? null, limit + 1],
    );
    const items = rows.slice(0, limit).map((row) => row.member);
    return { items, nextCursor: rows.length > limit ? items[items.length - 1].id : null };
  }

  async one(id: string): Promise<Member> {
    const [row] = await this.database.query<{ member: Member }>(
      `SELECT ${memberProjection} AS member FROM members m WHERE m.id = $1 AND m.profile_complete`,
      [id],
    );
    if (!row) throw new NotFoundException('Member not found.');
    return row.member;
  }

  async mine(id: string): Promise<MyProfile> {
    const [row] = await this.database.query<{
      member: Member;
      unit: 'km' | 'mi';
      birth_year: number | null;
      birth_month: number | null;
      birth_day: number | null;
      profile_complete: boolean;
    }>(
      `SELECT ${memberProjection} AS member, m.unit, m.birth_year, m.birth_month, m.birth_day, m.profile_complete
       FROM members m WHERE m.id = $1`,
      [id],
    );
    if (!row) throw new NotFoundException('Account not found.');
    const locations = await this.database.query<MemberLocation>(
      `SELECT kind, latitude AS lat, longitude AS lng, radius_km AS "radiusKm", comment,
       updated_at::text AS "updatedAt" FROM locations WHERE member_id = $1`,
      [id],
    );
    return {
      ...row.member,
      unit: row.unit,
      birthYear: row.birth_year,
      birthMonth: row.birth_month,
      birthDay: row.birth_day,
      profileComplete: row.profile_complete,
      locations,
    };
  }

  async update(id: string, input: unknown): Promise<MyProfile> {
    const value = parseInput(profileInput, input);
    const answers = validateCustomAnswers(this.configuration.profileSchema, value.customAnswers);
    await this.database.query(
      `UPDATE members SET nickname = $2, punchline = $3, bio = $4, birth_year = $5,
       birth_month = $6, birth_day = $7, unit = $8, custom_answers = $9,
       schema_id = $10, profile_complete = true WHERE id = $1`,
      [
        id,
        value.nickname,
        value.punchline,
        cleanBiography(value.bio),
        value.birthYear,
        value.birthMonth,
        value.birthDay,
        value.unit,
        JSON.stringify(answers),
        this.configuration.profileSchema.id,
      ],
    );
    return this.mine(id);
  }

  async delete(id: string): Promise<void> {
    await this.database.transaction(async (client) => {
      await client.query('SELECT id FROM members WHERE id = $1 FOR UPDATE', [id]);
      await client.query(
        `DELETE FROM media WHERE owner_id = $1 AND NOT EXISTS (SELECT 1 FROM posts WHERE media_id = media.id)`,
        [id],
      );
      await client.query('DELETE FROM members WHERE id = $1', [id]);
      await client.query(`SELECT pg_notify('newton_events', 'members-changed')`);
    });
  }
}
