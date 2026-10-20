import { Injectable } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { PublicConfiguration } from '../../../shared/contracts';

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const field = z.object({
  id: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/),
  title: z.string(),
  description: z.string().optional(),
  component: z.enum(['text', 'checkbox', 'select', 'radio', 'slider']),
  config: z.record(z.string(), z.unknown()).optional(),
  options: z
    .array(z.object({ label: z.string(), value: z.union([z.string(), z.number()]) }))
    .optional(),
  validation: z
    .array(
      z.object({
        type: z.enum(['required', 'minLength', 'maxLength', 'min', 'max', 'pattern']),
        params: z.record(z.string(), z.unknown()).optional(),
        message: z.string(),
      }),
    )
    .optional(),
  defaultValue: z.unknown().optional(),
});
const schema = z.object({
  id: z.string(),
  title: z.string().optional(),
  groups: z.array(
    z.object({
      id: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
      fields: z.array(field),
    }),
  ),
});
const environment = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().default('postgres://newton:newton@127.0.0.1:5432/newton'),
  PUBLIC_URL: z.url().default('http://localhost:4200'),
  SITE_NAME: z.string().min(1).default('Newton users'),
  DISCORD_CLIENT_ID: z.string().default(''),
  DISCORD_CLIENT_SECRET: z.string().default(''),
  THEME_PRIMARY: color.default('#b2d279'),
  THEME_SURFACE: color.default('#182a21'),
  THEME_BACKGROUND: color.default('#101c16'),
  THEME_TEXT: color.default('#e4ecd8'),
  LOCATION_MINIMUM_KM: z.coerce.number().min(1).default(1),
  LOCATION_DEFAULT_KM: z.coerce.number().positive().default(5),
  LOCATION_MAXIMUM_KM: z.coerce.number().positive().max(1000).default(25),
  POST_INTERVAL_SECONDS: z.coerce.number().int().min(1).default(60),
  MAXIMUM_UPLOAD_BYTES: z.coerce.number().int().positive().max(100_000_000).default(25_000_000),
  MAXIMUM_VIDEO_SECONDS: z.coerce.number().int().min(1).max(300).default(60),
  PROFILE_SCHEMA_PATH: z.string().default('config/profile-form.json'),
  TILE_URL: z.string().default('https://tile.openstreetmap.org/{z}/{x}/{y}.png'),
  TILE_ATTRIBUTION: z.string().default('© OpenStreetMap contributors'),
});

@Injectable()
export class Configuration {
  readonly values = environment.parse(process.env);
  readonly profileSchema = schema.parse(
    JSON.parse(readFileSync(resolve(this.values.PROFILE_SCHEMA_PATH), 'utf8')),
  );

  constructor() {
    const v = this.values;
    if (
      v.LOCATION_MINIMUM_KM > v.LOCATION_DEFAULT_KM ||
      v.LOCATION_DEFAULT_KM > v.LOCATION_MAXIMUM_KM
    ) {
      throw new Error('Location radii must satisfy minimum <= default <= maximum.');
    }
    const ids = this.profileSchema.groups.flatMap((group) => group.fields.map((item) => item.id));
    if (new Set(ids).size !== ids.length)
      throw new Error('Custom profile field IDs must be unique.');
    const reserved = new Set([
      'nickname',
      'punchline',
      'bio',
      'birthYear',
      'birthMonth',
      'birthDay',
      'unit',
      'avatar',
    ]);
    if (ids.some((id) => reserved.has(id)))
      throw new Error('Custom profile fields cannot use built-in profile IDs.');
    if (v.NODE_ENV === 'production' && !v.PUBLIC_URL.startsWith('https://')) {
      throw new Error('PUBLIC_URL must use HTTPS in production.');
    }
  }

  get public(): PublicConfiguration {
    const v = this.values;
    return {
      siteName: v.SITE_NAME,
      locale: 'en-US',
      discordConfigured: Boolean(v.DISCORD_CLIENT_ID && v.DISCORD_CLIENT_SECRET),
      theme: {
        primary: v.THEME_PRIMARY,
        surface: v.THEME_SURFACE,
        background: v.THEME_BACKGROUND,
        text: v.THEME_TEXT,
      },
      locationPolicy: {
        minimumRadiusKm: v.LOCATION_MINIMUM_KM,
        defaultRadiusKm: v.LOCATION_DEFAULT_KM,
        maximumRadiusKm: v.LOCATION_MAXIMUM_KM,
      },
      postIntervalSeconds: v.POST_INTERVAL_SECONDS,
      maximumUploadBytes: v.MAXIMUM_UPLOAD_BYTES,
      maximumVideoSeconds: v.MAXIMUM_VIDEO_SECONDS,
      tileUrl: v.TILE_URL,
      tileAttribution: v.TILE_ATTRIBUTION,
      profileSchema: this.profileSchema,
    };
  }
}
