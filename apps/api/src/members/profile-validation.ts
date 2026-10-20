import { z } from 'zod';
import sanitizeHtml from 'sanitize-html';
import type { FormSchema } from '@theredhead/lucid-forms';
import { BadRequestException } from '@nestjs/common';
import { parseInput } from '../http/validation';

const optionalInteger = (min: number, max: number) =>
  z.preprocess(
    (value) => (value === '' || value === undefined ? null : value),
    z.coerce.number().int().min(min).max(max).nullable(),
  );
export const profileInput = z
  .object({
    nickname: z.string().trim().min(1).max(60),
    punchline: z.string().trim().max(160).default(''),
    bio: z.string().max(20000).default(''),
    birthYear: optionalInteger(1900, new Date().getUTCFullYear()),
    birthMonth: optionalInteger(1, 12),
    birthDay: optionalInteger(1, 31),
    unit: z.enum(['km', 'mi']).default('km'),
    customAnswers: z.record(z.string(), z.unknown()).default({}),
  })
  .strict()
  .superRefine((data, context) => {
    if (data.birthMonth !== null && data.birthDay !== null) {
      const year = data.birthYear ?? 2000;
      const date = new Date(Date.UTC(year, data.birthMonth - 1, data.birthDay));
      if (date.getUTCMonth() !== data.birthMonth - 1) {
        context.addIssue({
          code: 'custom',
          path: ['birthDay'],
          message: 'This day does not exist in the selected month.',
        });
      }
    }
  });

export function cleanBiography(value: string): string {
  return sanitizeHtml(value, {
    allowedTags: [
      'p',
      'br',
      'strong',
      'b',
      'em',
      'i',
      'u',
      's',
      'strike',
      'ul',
      'ol',
      'li',
      'blockquote',
      'a',
      'h2',
      'h3',
    ],
    allowedAttributes: { a: ['href', 'title'], p: ['style'] },
    allowedStyles: {
      '*': { 'text-align': [/^(left|center|right|justify)$/] },
    },
    allowedSchemes: ['https', 'http', 'mailto'],
    transformTags: {
      div: 'p',
      a: sanitizeHtml.simpleTransform('a', { rel: 'nofollow noopener noreferrer' }),
    },
  });
}

export function validateCustomAnswers(
  schema: FormSchema,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const fields = schema.groups.flatMap((group) => group.fields);
  const knownIds = new Set(fields.map((field) => field.id));
  if (Object.keys(values).some((key) => !knownIds.has(key))) {
    throw new BadRequestException('Unknown custom profile field. Refresh the profile form.');
  }
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    const value = values[field.id];
    const required = field.validation?.some((rule) => rule.type === 'required');
    if (value === undefined || value === null || value === '') {
      if (required) throw new BadRequestException(`${field.title} is required.`);
      continue;
    }
    let validator: z.ZodType;
    if (field.component === 'checkbox') validator = z.boolean();
    else if (field.component === 'slider') validator = z.number().finite();
    else if (field.component === 'select' || field.component === 'radio')
      validator = z.union([z.string().max(2000), z.number().finite()]);
    else validator = z.string().max(2000);
    const parsed: unknown = parseInput(validator, value);
    if (field.options && !field.options.some((option) => option.value === parsed)) {
      throw new BadRequestException(`Invalid choice for ${field.title}.`);
    }
    for (const rule of field.validation ?? []) {
      const length = typeof parsed === 'string' ? Array.from(parsed).length : 0;
      const minimum = Number(rule.params?.['min']);
      const maximum = Number(rule.params?.['max']);
      if (
        (rule.type === 'minLength' && length < minimum) ||
        (rule.type === 'maxLength' && length > maximum) ||
        (rule.type === 'min' && typeof parsed === 'number' && parsed < minimum) ||
        (rule.type === 'max' && typeof parsed === 'number' && parsed > maximum) ||
        (rule.type === 'required' && parsed === false) ||
        (rule.type === 'pattern' &&
          typeof parsed === 'string' &&
          !new RegExp(String(rule.params?.['pattern'])).test(parsed))
      ) {
        throw new BadRequestException(rule.message);
      }
    }
    result[field.id] = parsed;
  }
  return result;
}
