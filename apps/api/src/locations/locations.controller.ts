import { Body, Controller, Delete, Inject, Param, Put, Req } from '@nestjs/common';
import { z } from 'zod';
import { Database } from '../database/database.service';
import { Configuration } from '../configuration';
import type { AuthenticatedRequest } from '../auth/auth.service';
import { parseInput } from '../http/validation';
import { coarseLocation } from './location-policy';

const kindSchema = z.enum(['checkin', 'home', 'work']);

@Controller('api/me/locations')
export class LocationsController {
  constructor(
    @Inject(Database) private readonly database: Database,
    @Inject(Configuration) private readonly configuration: Configuration,
  ) {}

  @Put(':kind')
  async save(
    @Req() request: AuthenticatedRequest,
    @Param('kind') kind: string,
    @Body() body: unknown,
  ) {
    const locationKind = parseInput(kindSchema, kind);
    const policy = this.configuration.public.locationPolicy;
    const value = parseInput(
      z
        .object({
          lat: z.number().finite().min(-90).max(90),
          lng: z.number().finite().min(-180).max(180),
          radiusKm: z.number().finite().min(policy.minimumRadiusKm).max(policy.maximumRadiusKm),
          comment: z.string().trim().max(250).default(''),
        })
        .strict(),
      body,
    );
    const coarse = coarseLocation(value, value.radiusKm);
    await this.database.query(
      `INSERT INTO locations(member_id, kind, latitude, longitude, radius_km, comment)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT(member_id, kind) DO UPDATE
       SET latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude, radius_km = EXCLUDED.radius_km,
       comment = EXCLUDED.comment, updated_at = now()`,
      [
        request.memberSession!.memberId,
        locationKind,
        coarse.lat,
        coarse.lng,
        value.radiusKm,
        locationKind === 'checkin' ? value.comment : '',
      ],
    );
    await this.database.query(`SELECT pg_notify('newton_events', 'members-changed')`);
    return { ...coarse, radiusKm: value.radiusKm };
  }

  @Delete(':kind')
  async delete(@Req() request: AuthenticatedRequest, @Param('kind') kind: string): Promise<void> {
    await this.database.query('DELETE FROM locations WHERE member_id = $1 AND kind = $2', [
      request.memberSession!.memberId,
      parseInput(kindSchema, kind),
    ]);
    await this.database.query(`SELECT pg_notify('newton_events', 'members-changed')`);
  }
}
