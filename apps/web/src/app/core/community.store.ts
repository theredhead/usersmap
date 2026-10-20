import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import type { Coordinate, Member, Page, TimelinePost } from '../../../../../shared/contracts';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class CommunityStore {
  private readonly api = inject(ApiService);
  private events?: EventSource;
  private started = false;
  readonly members = signal<Member[]>([]);
  readonly posts = signal<TimelinePost[]>([]);
  readonly nextCursor = signal<string | null>(null);
  readonly connected = signal(false);
  readonly mapCenter = signal<Coordinate>({ lat: 30, lng: -20 });
  readonly mapZoom = signal(2);
  readonly viewerLocation = signal<Coordinate | null>(null);
  readonly timelineScroll = signal(0);
  readonly locatedCount = computed(() => this.members().filter((member) => member.location).length);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.events?.close());
  }
  async start(): Promise<void> {
    if (this.started) return;
    await Promise.all([this.refreshMembers(), this.refreshPosts()]);
    this.started = true;
    this.events = new EventSource('/api/posts/events');
    this.events.onopen = () => {
      this.connected.set(true);
      void Promise.all([this.refreshMembers(), this.refreshPosts()]).catch((error) =>
        this.api.report(error),
      );
    };
    this.events.onerror = () => this.connected.set(false);
    this.events.onmessage = (message) => {
      const event: unknown = JSON.parse(message.data);
      if (!event || typeof event !== 'object' || !('type' in event)) return;
      if (event.type === 'posts-changed')
        void this.refreshPosts().catch((error) => this.api.report(error));
      if (event.type === 'members-changed') {
        void Promise.all([this.refreshMembers(), this.refreshPosts(true)]).catch((error) =>
          this.api.report(error),
        );
      }
    };
  }
  stop(): void {
    this.events?.close();
    this.started = false;
    this.connected.set(false);
    this.posts.set([]);
    this.members.set([]);
    this.viewerLocation.set(null);
    this.timelineScroll.set(0);
    this.nextCursor.set(null);
  }
  async refreshMembers(): Promise<void> {
    const members: Member[] = [];
    let cursor: string | null = null;
    do {
      const page: Page<Member> = await this.api.get(
        `members?limit=100&sort=asc${cursor ? `&cursor=${cursor}` : ''}`,
      );
      members.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);
    this.members.set(members);
  }
  async refreshPosts(refreshLoaded = false): Promise<void> {
    const page = await this.api.get<Page<TimelinePost>>('posts?limit=30&sort=desc');
    if (!this.posts().length) {
      this.posts.set(page.items);
      this.nextCursor.set(page.nextCursor);
    } else {
      // Fill any reconnect gap before merging with already loaded older pages.
      const boundary = refreshLoaded ? this.posts()[this.posts().length - 1] : this.posts()[0];
      const oldestLoaded = boundary.createdAt;
      const incoming = [...page.items];
      let cursor = page.nextCursor;
      while (cursor && incoming[incoming.length - 1]?.createdAt > oldestLoaded) {
        const next = await this.api.get<Page<TimelinePost>>(
          `posts?limit=100&sort=desc&cursor=${cursor}`,
        );
        incoming.push(...next.items);
        cursor = next.nextCursor;
      }
      const merged = new Map(this.posts().map((post) => [post.id, post]));
      for (const post of incoming) merged.set(post.id, post);
      this.posts.set(
        [...merged.values()].sort(
          (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
        ),
      );
    }
  }
  async loadMore(): Promise<void> {
    const cursor = this.nextCursor();
    if (!cursor) return;
    const page = await this.api.get<Page<TimelinePost>>(
      `posts?limit=30&sort=desc&cursor=${cursor}`,
    );
    const merged = new Map([...this.posts(), ...page.items].map((post) => [post.id, post]));
    this.posts.set([...merged.values()]);
    this.nextCursor.set(page.nextCursor);
  }
  async locateViewer(): Promise<void> {
    if (!navigator.geolocation) throw new Error('Your browser does not support location access.');
    const position = await new Promise<GeolocationPosition>((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(
        resolve,
        () =>
          reject(
            new Error(
              'Location unavailable. Check your browser permissions or select a point on the map.',
            ),
          ),
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 },
      ),
    );
    this.viewerLocation.set({ lat: position.coords.latitude, lng: position.coords.longitude });
  }
}
