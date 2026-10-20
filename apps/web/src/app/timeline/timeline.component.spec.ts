import '@angular/compiler';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { ApiService } from '../core/api.service';
import { CommunityStore } from '../core/community.store';
import { COMMUNITY_INTL, CommunityEnglishIntl } from '../core/feature-intl';
import { ComposerState, Timeline } from './timeline.component';

function setup(write = vi.fn().mockResolvedValue(undefined)) {
  let pending = Promise.resolve();
  const api = {
    error: signal(''),
    notice: signal(''),
    write,
    run: (operation: () => Promise<void>) => {
      pending = operation().catch((error: Error) => api.error.set(error.message));
      return pending;
    },
  };
  const composer = new ComposerState();
  const store = { refreshPosts: vi.fn().mockResolvedValue(undefined) };
  const injector = Injector.create({
    providers: [
      { provide: ApiService, useValue: api },
      { provide: CommunityStore, useValue: store },
      { provide: ComposerState, useValue: composer },
      { provide: COMMUNITY_INTL, useValue: new CommunityEnglishIntl() },
    ],
  });
  const timeline = runInInjectionContext(injector, () => new Timeline());
  return { timeline, composer, api, store, settled: () => pending };
}

describe('timeline message dialog', () => {
  it('keeps the composer closed until requested and preserves dismissed drafts', () => {
    const { timeline, composer, api } = setup();
    expect(timeline.composerOpen()).toBe(false);
    composer.engine().setValue('body', 'Unpublished draft');
    api.error.set('Previous error');
    timeline.openComposer();
    expect(api.error()).toBe('');
    timeline.composerOpen.set(false);
    timeline.openComposer();
    expect(composer.engine().values()['body']).toBe('Unpublished draft');
  });

  it('closes and clears the composer only after a successful post', async () => {
    const { timeline, composer, store, settled } = setup();
    composer.engine().setValue('body', 'Hello');
    timeline.openComposer();
    timeline.post({ body: 'Hello' });
    await settled();
    expect(timeline.composerOpen()).toBe(false);
    expect(composer.engine().values()['body']).not.toBe('Hello');
    expect(store.refreshPosts).toHaveBeenCalledOnce();
  });

  it('leaves a failed draft open with an explicit error', async () => {
    const { timeline, composer, api, store, settled } = setup(
      vi.fn().mockRejectedValue(new Error('Please wait before posting again.')),
    );
    composer.engine().setValue('body', 'Try later');
    timeline.openComposer();
    timeline.post({ body: 'Try later' });
    await settled();
    expect(timeline.composerOpen()).toBe(true);
    expect(composer.engine().values()['body']).toBe('Try later');
    expect(api.error()).toBe('Please wait before posting again.');
    expect(store.refreshPosts).not.toHaveBeenCalled();
  });
  it('posts a trimmed video link without uploading a file', async () => {
    const { timeline, api, settled } = setup();
    timeline.openComposer();
    timeline.post({ videoUrl: ' https://youtu.be/abc123 ' });
    await settled();
    expect(api.write).toHaveBeenCalledExactlyOnceWith('POST', 'posts', {
      body: '',
      mediaId: null,
      videoUrl: 'https://youtu.be/abc123',
    });
    expect(timeline.composerOpen()).toBe(false);
  });
});
