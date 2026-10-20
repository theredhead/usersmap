import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { UIAvatar, UIMapView, UIButton } from '@theredhead/lucid-kit';
import type { Coordinate, Member } from '../../../../../shared/contracts';
import {
  distanceKm,
  pixelCoordinate,
  radiusPixels,
  radiusZoom,
  worldPixel,
} from '../../../../../shared/geography';
import { ApiService } from '../core/api.service';
import { COMMUNITY_INTL } from '../core/feature-intl';
import { CommunityStore } from '../core/community.store';

@Component({
  selector: 'app-member-map',
  imports: [UIMapView, UIAvatar, UIButton, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:pointerdown)': 'outside($event)',
    '(document:keydown.escape)': 'closeCard()',
  },
  templateUrl: './member-map.component.html',
  styleUrl: './member-map.component.scss',
})
export class MemberMap implements AfterViewInit {
  readonly api = inject(ApiService);
  readonly intl = inject(COMMUNITY_INTL);
  private readonly store = inject(CommunityStore);
  private readonly destroy = inject(DestroyRef);
  readonly members = input<Member[]>([]);
  readonly center = input<Coordinate>({ lat: 30, lng: -20 });
  readonly zoom = input(2);
  readonly picking = input(false);
  readonly selection = input<Coordinate | null>(null);
  readonly selectionRadiusKm = input(5);
  readonly centerChange = output<Coordinate>();
  readonly zoomChange = output<number>();
  readonly locationSelected = output<Coordinate>();
  readonly selected = signal<Member | null>(null);
  readonly selectedGroup = signal<Member[]>([]);
  private readonly size = signal({ width: 1, height: 1 });
  private readonly container = viewChild.required<ElementRef<HTMLElement>>('container');
  private readonly card = viewChild<ElementRef<HTMLElement>>('card');
  gesture: {
    x: number;
    y: number;
    center: Coordinate;
    touch: boolean;
    moved: boolean;
    pointerId: number;
  } | null = null;
  get attribution(): string {
    const text = this.api.configuration()!.tileAttribution.replace(/[<>&"']/g, '');
    return `<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">${text}</a>`;
  }
  readonly markers = computed(() => {
    const clusters: { member: Member; members: Member[]; x: number; y: number; radius: number }[] =
      [];
    for (const member of this.members()) {
      if (!member.location) continue;
      const point = this.project(member.location);
      if (
        point.x < -30 ||
        point.y < -30 ||
        point.x > this.size().width + 30 ||
        point.y > this.size().height + 30
      )
        continue;
      const cluster = clusters.find(
        (cluster) => Math.hypot(cluster.x - point.x, cluster.y - point.y) < 48,
      );
      if (cluster) cluster.members.push(member);
      else {
        clusters.push({
          member,
          members: [member],
          ...point,
          radius: Math.max(
            3,
            radiusPixels(member.location.radiusKm, member.location.lat, this.zoom()),
          ),
        });
      }
    }
    return clusters;
  });
  readonly picked = computed(() => {
    const point = this.selection();
    return point
      ? {
          ...this.project(point),
          radius: radiusPixels(this.selectionRadiusKm(), point.lat, this.zoom()),
        }
      : null;
  });
  readonly selectionRadiusLabel = computed(() =>
    this.intl.radius(this.selectionRadiusKm(), this.api.session().member?.unit ?? 'km'),
  );

  constructor() {
    effect(() => {
      const point = this.selection();
      const radius = this.selectionRadiusKm();
      const { width, height } = this.size();
      if (!this.picking() || !point || width <= 1 || height <= 1) return;
      this.zoomChange.emit(radiusZoom(radius, point.lat, Math.min(width, height) * 0.35));
    });
  }

  ngAfterViewInit(): void {
    const observer = new ResizeObserver(([entry]) =>
      this.size.set({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    observer.observe(this.container().nativeElement);
    this.destroy.onDestroy(() => observer.disconnect());
  }
  private project(coordinate: Coordinate): { x: number; y: number } {
    const point = worldPixel(coordinate, this.zoom());
    const center = worldPixel(this.center(), this.zoom());
    const worldWidth = 256 * 2 ** this.zoom();
    let difference = point.x - center.x;
    if (difference > worldWidth / 2) difference -= worldWidth;
    if (difference < -worldWidth / 2) difference += worldWidth;
    return {
      x: difference + this.size().width / 2,
      y: point.y - center.y + this.size().height / 2,
    };
  }
  centerChanged(value: Coordinate): void {
    this.centerChange.emit(value);
  }
  zoomChanged(value: number): void {
    this.zoomChange.emit(Math.max(1, Math.min(16, value)));
  }
  pointerDown(event: PointerEvent): void {
    if (!event.isPrimary || event.button !== 0) return;
    if ((event.target as HTMLElement).closest('button,a,.member-card')) return;
    this.gesture = {
      x: event.clientX,
      y: event.clientY,
      center: this.center(),
      touch: event.pointerType === 'touch',
      moved: false,
      pointerId: event.pointerId,
    };
    if (event.pointerType === 'touch')
      this.container().nativeElement.setPointerCapture(event.pointerId);
  }
  pointerMove(event: PointerEvent): void {
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (Math.hypot(dx, dy) > 6) gesture.moved = true;
    if (gesture.touch && gesture.moved) {
      const origin = worldPixel(gesture.center, this.zoom());
      this.centerChange.emit(pixelCoordinate(origin.x - dx, origin.y - dy, this.zoom()));
    }
  }
  pointerUp(event: PointerEvent): void {
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    this.gesture = null;
    if (
      gesture.moved ||
      Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 6 ||
      !this.picking()
    )
      return;
    const bounds = this.container().nativeElement.getBoundingClientRect();
    const center = worldPixel(this.center(), this.zoom());
    this.locationSelected.emit(
      pixelCoordinate(
        center.x + event.clientX - bounds.left - bounds.width / 2,
        center.y + event.clientY - bounds.top - bounds.height / 2,
        this.zoom(),
      ),
    );
  }
  select(member: Member, event: Event): void {
    event.stopPropagation();
    this.selectedGroup.set([]);
    this.selected.set(member);
    setTimeout(() => this.card()?.nativeElement.focus());
  }
  selectGroup(members: Member[], event: Event): void {
    if (members.length === 1) this.select(members[0], event);
    else {
      this.selected.set(null);
      this.selectedGroup.set(members);
    }
  }
  closeCard(): void {
    this.selected.set(null);
    this.selectedGroup.set([]);
  }
  biographyPreview(html: string): string {
    return new DOMParser().parseFromString(html, 'text/html').body.textContent?.slice(0, 220) ?? '';
  }
  outside(event: PointerEvent): void {
    const target = event.target;
    if (target instanceof Element && !target.closest('.member-card,.member-picker,.avatar-marker'))
      this.closeCard();
  }
  approximateDistance(member: Member): string {
    const viewer = this.store.viewerLocation();
    if (!viewer || !member.location) return this.intl.distanceUnavailable;
    return `${this.intl.distance(distanceKm(viewer, member.location), this.api.session().member?.unit ?? 'km')} (approximate area)`;
  }
}
