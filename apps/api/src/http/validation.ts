import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

export function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException({
      message: 'Please check the submitted fields.',
      errors: result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  return result.data;
}

export const uuid = z.uuid();

export function parseId(value: unknown): string {
  return parseInput(uuid, value);
}
