import { describe, expect, it } from 'vitest';
import { cleanBiography, profileInput, validateCustomAnswers } from './profile-validation';

describe('profile validation', () => {
  it('requires only a nickname among biographical fields', () => {
    const profile = profileInput.parse({ nickname: 'Newton fan', unit: 'km', customAnswers: {} });
    expect(profile.birthYear).toBeNull();
    expect(profile.birthMonth).toBeNull();
    expect(profile.birthDay).toBeNull();
    expect(profileInput.safeParse({ ...profile, nickname: '   ' }).success).toBe(false);
  });
  it('permits partial birth dates but rejects impossible combinations', () => {
    const base = { nickname: 'Fan', unit: 'km', customAnswers: {} };
    expect(profileInput.safeParse({ ...base, birthDay: 31 }).success).toBe(true);
    expect(profileInput.safeParse({ ...base, birthMonth: 2, birthDay: 29 }).success).toBe(true);
    expect(
      profileInput.safeParse({ ...base, birthYear: 2023, birthMonth: 2, birthDay: 29 }).success,
    ).toBe(false);
    expect(profileInput.safeParse({ ...base, birthMonth: 4, birthDay: 31 }).success).toBe(false);
  });
  it('sanitizes rich text without allowing scripts, trackers, or embedded media', () => {
    expect(
      cleanBiography(
        '<p>Hello <strong>Newton</strong><script>alert(1)</script><img src="https://tracker.test/a"></p>',
      ),
    ).toBe('<p>Hello <strong>Newton</strong></p>');
    expect(
      cleanBiography('<a href="javascript:alert(1)" onclick="alert(1)">Click</a>'),
    ).not.toContain('javascript:');
  });
  it('preserves toolbar alignment while stripping other styles', () => {
    expect(
      cleanBiography(
        '<div style="text-align:center;color:red;background:url(https://tracker.test)">Hello</div>',
      ),
    ).toBe('<p style="text-align:center">Hello</p>');
    expect(cleanBiography('<p style="text-align:invalid;position:fixed">Hello</p>')).toBe(
      '<p>Hello</p>',
    );
    expect(cleanBiography('<strike>Old Newton</strike>')).toBe('<strike>Old Newton</strike>');
  });
  it('validates deployment fields on the server', () => {
    const schema = {
      id: 'test-v1',
      groups: [
        {
          id: 'custom',
          fields: [
            { id: 'owns', title: 'Owns a Newton', component: 'checkbox' },
            {
              id: 'favorite',
              title: 'Favorite',
              component: 'text',
              validation: [{ type: 'maxLength' as const, params: { max: 3 }, message: 'Too long' }],
            },
          ],
        },
      ],
    };
    expect(validateCustomAnswers(schema, { owns: true, favorite: 'abc' })).toEqual({
      owns: true,
      favorite: 'abc',
    });
    expect(() => validateCustomAnswers(schema, { owns: 'yes' })).toThrow();
    expect(() => validateCustomAnswers(schema, { favorite: 'abcd' })).toThrow();
    expect(() => validateCustomAnswers(schema, { unknown: true })).toThrow();
  });
});
