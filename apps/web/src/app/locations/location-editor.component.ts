import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormEngine, FormValues, UIForm } from '@theredhead/lucid-forms';
import { UIButton } from '@theredhead/lucid-kit';
import type { Coordinate, LocationKind } from '../../../../../shared/contracts';
import { ApiService } from '../core/api.service';
import { CommunityStore } from '../core/community.store';
import { COMMUNITY_INTL } from '../core/feature-intl';
import { MemberMap } from '../map/member-map.component';

@Component({
  selector: 'app-location-editor',
  imports: [RouterLink, UIForm, UIButton, MemberMap],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './location-editor.component.html',
  styleUrl: './location-editor.component.scss',
})
export class LocationEditor {
  readonly api = inject(ApiService);
  readonly intl = inject(COMMUNITY_INTL);
  private readonly store = inject(CommunityStore);
  private readonly router = inject(Router);
  readonly policy = this.api.configuration()!.locationPolicy;
  readonly unit = this.api.session().member?.unit ?? 'km';
  private readonly radiusStep =
    10 **
    -Math.max(
      ...[
        this.policy.minimumRadiusKm,
        this.policy.defaultRadiusKm,
        this.policy.maximumRadiusKm,
      ].map((value) => String(value).split('.')[1]?.length ?? 0),
    );
  readonly selected = signal<Coordinate | null>(null);
  readonly center = signal<Coordinate>(this.store.mapCenter());
  readonly zoom = signal(this.store.mapZoom());
  readonly engine = new FormEngine({
    id: 'location',
    groups: [
      {
        id: 'where',
        fields: [
          {
            id: 'kind',
            title: 'What kind of place?',
            component: 'radio',
            defaultValue: 'checkin',
            options: [
              { label: 'Check-in', value: 'checkin' },
              { label: 'Home', value: 'home' },
              { label: 'Work', value: 'work' },
            ],
          },
          {
            id: 'radius',
            title: 'Privacy radius',
            component: 'privacy-radius',
            defaultValue: this.policy.defaultRadiusKm,
            config: {
              min: this.policy.minimumRadiusKm,
              max: this.policy.maximumRadiusKm,
              step: this.radiusStep,
              unit: this.unit,
            },
          },
          {
            id: 'comment',
            title: 'A little note (optional)',
            component: 'text',
            config: { multiline: true, rows: 3 },
            visibleWhen: { field: 'kind', operator: 'equals', value: 'checkin' },
            validation: [
              { type: 'maxLength', params: { max: 250 }, message: 'Use 250 characters or fewer.' },
            ],
          },
        ],
      },
    ],
  });
  readonly kind = computed(() => this.engine.values()['kind']);
  readonly radiusKm = computed(() => Number(this.engine.values()['radius']));
  selectLocation(point: Coordinate): void {
    this.selected.set(point);
    this.center.set(point);
  }
  useGps(): void {
    void this.api.run(async () => {
      await this.store.locateViewer();
      this.selectLocation(this.store.viewerLocation()!);
    });
  }
  save(values: FormValues): void {
    void this.api.run(async () => {
      const point = this.selected();
      if (!point) throw new Error('Choose a point on the map or use GPS before saving.');
      const radiusKm = Math.max(
        this.policy.minimumRadiusKm,
        Math.min(this.policy.maximumRadiusKm, Number(values['radius'])),
      );
      const savedLocation = await this.api.write<Coordinate>(
        'PUT',
        `me/locations/${values['kind']}`,
        {
          ...point,
          radiusKm,
          comment: values['comment'] || '',
        },
      );
      this.selected.set(null);
      await Promise.all([this.api.refreshSession(), this.store.refreshMembers()]);
      this.store.mapCenter.set({ lat: savedLocation.lat, lng: savedLocation.lng });
      this.store.mapZoom.set(this.zoom());
      this.api.notice.set(
        values['kind'] === 'checkin'
          ? 'You’re checked in. Only your approximate area was saved.'
          : 'Your approximate location is saved.',
      );
      await this.router.navigateByUrl('/');
    });
  }
  remove(kind: LocationKind): void {
    void this.api.run(async () => {
      await this.api.write('DELETE', `me/locations/${kind}`);
      await Promise.all([this.api.refreshSession(), this.store.refreshMembers()]);
      this.api.notice.set('Location removed.');
    });
  }
}
