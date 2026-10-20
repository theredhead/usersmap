import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { FormEngine } from '@theredhead/lucid-forms';
import { composerSchema, profileSchema } from './form-schemas';
import { ProfileEnglishIntl } from './feature-intl';
import type { PublicConfiguration } from '../../../../../shared/contracts';
import { ComposerState } from '../timeline/timeline.component';

describe('timeline Lucidkit form', () => {
  it('uses the same 250 Unicode character boundary as the backend', () => {
    const engine = new FormEngine(composerSchema);
    engine.setValue('body', '🙂'.repeat(250));
    expect(engine.valid()).toBe(true);
    engine.setValue('body', '🙂'.repeat(251));
    expect(engine.valid()).toBe(false);
  });
  it('validates optional video links independently of the message character limit', () => {
    const engine = new FormEngine(composerSchema);
    expect(engine.valid()).toBe(true);
    for (const value of ['https://youtu.be/abc123', 'https://vimeo.com/123', '']) {
      engine.setValue('videoUrl', value);
      expect(engine.valid()).toBe(true);
    }
    for (const value of ['javascript:alert(1)', 'http://youtu.be/abc', 'not a link']) {
      engine.setValue('videoUrl', value);
      expect(engine.valid()).toBe(false);
    }
  });

  describe('profile biography form', () => {
    it('offers only basic formatting, lists, and alignment', () => {
      const configuration: PublicConfiguration = {
        siteName: 'Test',
        locale: 'en-US',
        discordConfigured: false,
        theme: { primary: '#b2d279', surface: '#182a21', background: '#101c16', text: '#e4ecd8' },
        locationPolicy: { minimumRadiusKm: 1, defaultRadiusKm: 5, maximumRadiusKm: 25 },
        postIntervalSeconds: 60,
        maximumUploadBytes: 25000000,
        maximumVideoSeconds: 60,
        tileUrl: '',
        tileAttribution: '',
        profileSchema: { id: 'custom', groups: [] },
      };
      const schema = profileSchema(configuration, new ProfileEnglishIntl());
      const bio = schema.groups
        .flatMap((group) => group.fields)
        .find((field) => field.id === 'bio');
      expect(bio?.config?.['toolbarActions']).toEqual([
        'undo',
        'redo',
        'bold',
        'italic',
        'underline',
        'strikethrough',
        'unorderedList',
        'orderedList',
        'indent',
        'outdent',
        'alignLeft',
        'alignCenter',
        'alignRight',
        'alignJustify',
      ]);
    });
  });
  it('replaces the form engine when clearing a published draft', () => {
    const composer = new ComposerState();
    const previous = composer.engine();
    previous.setValue('body', 'A draft');
    composer.reset();
    expect(composer.engine()).not.toBe(previous);
    expect(composer.engine().values()['body']).not.toBe('A draft');
  });
});
