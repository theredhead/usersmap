import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { UIAvatar, UIButton } from '@theredhead/lucid-kit';
import { ApiService } from './core/api.service';
import { CommunityStore } from './core/community.store';
import { COMMUNITY_INTL } from './core/feature-intl';
import { ComposerState } from './timeline/timeline.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, UIButton, UIAvatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.component.html',
})
export class App {
  readonly api = inject(ApiService);
  readonly intl = inject(COMMUNITY_INTL);
  private readonly store = inject(CommunityStore);
  private readonly router = inject(Router);
  private readonly composer = inject(ComposerState);
  logout(): void {
    void this.api.run(async () => {
      await this.api.write('POST', 'auth/logout');
      this.store.stop();
      this.composer.reset();
      this.api.session.set({ member: null, csrfToken: null });
      await this.router.navigateByUrl('/');
    });
  }
}
