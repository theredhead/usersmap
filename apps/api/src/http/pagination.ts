import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { parseInput } from './validation';

const cursorSchema = z.object({ date: z.iso.datetime(), id: z.uuid() });
export function decodeCursor(value: string | undefined): z.infer<typeof cursorSchema> | null {
  if (!value) return null;
  if (value.length > 300) throw new BadRequestException('Invalid pagination cursor.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    throw new BadRequestException('Invalid pagination cursor.');
  }
  return parseInput(cursorSchema, parsed);
}

export function encodeCursor(date: string, id: string): string {
  return Buffer.from(JSON.stringify({ date, id })).toString('base64url');
}

export function pageOptions(query: unknown): {
  limit: number;
  sort: 'asc' | 'desc';
  cursor?: string;
} {
  return parseInput(
    z
      .object({
        limit: z.coerce.number().int().min(1).max(100).default(30),
        sort: z.enum(['asc', 'desc']).default('desc'),
        cursor: z.string().optional(),
      })
      .strict(),
    query,
  );
}
