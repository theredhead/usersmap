import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  Injectable,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormEngine, FormValues, UIForm } from '@theredhead/lucid-forms';
import { UIAvatar, UIButton, UIDialog, UIDialogBody, UIDialogHeader } from '@theredhead/lucid-kit';
import { ApiService } from '../core/api.service';
import { CommunityStore } from '../core/community.store';
import { COMMUNITY_INTL } from '../core/feature-intl';
import { composerSchema } from '../core/form-schemas';

export function selectedFile(value: unknown): File | null {
  if (!Array.isArray(value) || !value.length) return null;
  const entry: unknown = value[0];
  return entry && typeof entry === 'object' && 'file' in entry && entry.file instanceof File
    ? entry.file
    : null;
}

@Injectable({ providedIn: 'root' })
export class ComposerState {
  readonly engine = signal(new FormEngine(composerSchema));

  reset(): void {
    this.engine.set(new FormEngine(composerSchema));
  }
}

@Component({
  selector: 'app-timeline',
  imports: [UIForm, UIAvatar, UIButton, UIDialog, UIDialogBody, UIDialogHeader, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './timeline.component.html',
  styleUrl: './timeline.component.scss',
})
export class Timeline implements AfterViewInit {
  readonly api = inject(ApiService);
  readonly store = inject(CommunityStore);
  readonly intl = inject(COMMUNITY_INTL);
  readonly composer = inject(ComposerState);
  readonly composerOpen = signal(false);
  private readonly scroll = viewChild.required<ElementRef<HTMLElement>>('scroll');
  ngAfterViewInit(): void {
    this.scroll().nativeElement.scrollTop = this.store.timelineScroll();
  }
  openComposer(): void {
    this.api.error.set('');
    this.composerOpen.set(true);
  }
  post(values: FormValues): void {
    void this.api.run(async () => {
      let mediaId: string | null = null;
      const file = selectedFile(values['attachment']);
      if (file) {
        const data = new FormData();
        data.append('file', file);
        const media = await this.api.write<{ id: string }>('POST', 'media/post', data);
        mediaId = media.id;
      }
      try {
        await this.api.write('POST', 'posts', {
          body: values['body'] || '',
          mediaId,
          videoUrl:
            typeof values['videoUrl'] === 'string' ? values['videoUrl'].trim() || null : null,
        });
      } catch (error) {
        if (mediaId) await this.api.write('DELETE', `media/${mediaId}`);
        throw error;
      }
      this.composer.reset();
      this.composerOpen.set(false);
      await this.store.refreshPosts();
      this.api.notice.set('Your update is now part of the conversation.');
    });
  }
  loadMore(): void {
    void this.api.run(() => this.store.loadMore());
  }
  videoHost(url: string): string {
    return new URL(url).hostname;
  }
}
