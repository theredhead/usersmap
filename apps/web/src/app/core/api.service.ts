import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { getContrastingTextColor } from '@theredhead/lucid-foundation';
import type { PublicConfiguration, SessionInfo } from '../../../../../shared/contracts';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  readonly configuration = signal<PublicConfiguration | null>(null);
  readonly session = signal<SessionInfo>({ member: null, csrfToken: null });
  readonly error = signal('');
  readonly notice = signal('');
  readonly busy = signal(false);

  get<T>(path: string): Promise<T> {
    return firstValueFrom(this.http.get<T>(`/api/${path}`));
  }
  write<T>(method: 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
    const headers = new HttpHeaders({ 'x-csrf-token': this.session().csrfToken ?? '' });
    return firstValueFrom(this.http.request<T>(method, `/api/${path}`, { body, headers }));
  }
  async initialize(): Promise<void> {
    const [configuration, session] = await Promise.all([
      this.get<PublicConfiguration>('configuration'),
      this.get<SessionInfo>('auth/session'),
    ]);
    this.configuration.set(configuration);
    this.session.set(session);
    document.title = configuration.siteName;
    const style = document.documentElement.style;
    const theme = configuration.theme;
    for (const [key, value] of Object.entries({
      '--ui-accent': theme.primary,
      '--ui-brand': theme.primary,
      '--ui-link': theme.primary,
      '--ui-surface': theme.surface,
      '--ui-surface-2': `color-mix(in srgb, ${theme.surface}, ${theme.text} 5%)`,
      '--ui-bg': theme.background,
      '--ui-text': theme.text,
      '--ui-text-muted': `color-mix(in srgb, ${theme.text}, ${theme.surface} 35%)`,
      '--ui-border': `color-mix(in srgb, ${theme.surface}, ${theme.text} 18%)`,
      '--ui-accent-contrast': getContrastingTextColor(theme.primary),
      '--ui-on-primary': getContrastingTextColor(theme.primary),
    }))
      style.setProperty(key, value);
  }
  async refreshSession(): Promise<void> {
    this.session.set(await this.get<SessionInfo>('auth/session'));
  }
  async run(operation: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await operation();
    } catch (error) {
      this.report(error);
    } finally {
      this.busy.set(false);
    }
  }
  report(error: unknown): void {
    if (error instanceof HttpErrorResponse) {
      const payload: unknown = error.error;
      const message =
        payload && typeof payload === 'object' && 'message' in payload ? payload.message : null;
      this.error.set(
        typeof message === 'string' ? message : 'The request failed. Please try again.',
      );
      if (error.status === 401) this.session.set({ member: null, csrfToken: null });
    } else {
      this.error.set(
        error instanceof Error ? error.message : 'Something went wrong. Please try again.',
      );
    }
  }
}
