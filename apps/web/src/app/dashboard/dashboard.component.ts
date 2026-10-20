import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { UIButton, UISplitContainer, UISplitPanel, UITab, UITabGroup } from '@theredhead/lucid-kit';
import { ApiService } from '../core/api.service';
import { CommunityStore } from '../core/community.store';
import { COMMUNITY_INTL } from '../core/feature-intl';
import { MemberMap } from '../map/member-map.component';
import { Timeline } from '../timeline/timeline.component';

@Component({
  selector: 'app-dashboard',
  imports: [
    NgTemplateOutlet,
    UIButton,
    UISplitContainer,
    UISplitPanel,
    UITab,
    UITabGroup,
    RouterLink,
    MemberMap,
    Timeline,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class Dashboard implements OnInit {
  readonly api = inject(ApiService);
  readonly store = inject(CommunityStore);
  readonly intl = inject(COMMUNITY_INTL);
  private readonly query = matchMedia('(max-width: 760px)');
  readonly mobile = signal(this.query.matches);
  constructor() {
    const listener = (event: MediaQueryListEvent) => this.mobile.set(event.matches);
    this.query.addEventListener('change', listener);
    inject(DestroyRef).onDestroy(() => this.query.removeEventListener('change', listener));
  }
  ngOnInit(): void {
    if (this.api.session().member) void this.store.start().catch((error) => this.api.report(error));
  }
  locate(): void {
    void this.api.run(async () => {
      await this.store.locateViewer();
      this.store.mapCenter.set(this.store.viewerLocation()!);
      this.store.mapZoom.set(7);
    });
  }
}
