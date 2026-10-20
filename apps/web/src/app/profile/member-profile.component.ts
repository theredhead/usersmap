import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { UIAvatar } from '@theredhead/lucid-kit';
import type { Member } from '../../../../../shared/contracts';
import { ApiService } from '../core/api.service';
import { COMMUNITY_INTL } from '../core/feature-intl';

@Component({
  selector: 'app-member-profile',
  imports: [RouterLink, UIAvatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './member-profile.component.html',
  styleUrl: './member-profile.component.scss',
})
export class MemberProfile implements OnInit {
  readonly api = inject(ApiService);
  readonly intl = inject(COMMUNITY_INTL);
  readonly member = signal<Member | null>(null);
  private readonly route = inject(ActivatedRoute);
  ngOnInit(): void {
    void (async () => {
      const id = this.route.snapshot.paramMap.get('id');
      this.member.set(await this.api.get<Member>(`members/${id}`));
    })().catch((error) => this.api.report(error));
  }
}
