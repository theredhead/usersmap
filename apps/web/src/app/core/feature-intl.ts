import { Injectable, InjectionToken } from '@angular/core';

export interface CommunityIntl {
  readonly locale: string;
  readonly map: string;
  readonly timeline: string;
  readonly checkIn: string;
  readonly saveLocation: string;
  readonly profile: string;
  readonly signIn: string;
  readonly deletedUser: string;
  readonly loadMore: string;
  readonly noCheckin: string;
  readonly distanceUnavailable: string;
  date(value: string): string;
  distance(kilometers: number, unit: 'km' | 'mi'): string;
  radius(kilometers: number, unit: 'km' | 'mi'): string;
}

@Injectable({ providedIn: 'root' })
export class CommunityEnglishIntl implements CommunityIntl {
  readonly locale = 'en-US';
  readonly map = 'World map';
  readonly timeline = 'Community';
  readonly checkIn = 'Check in';
  readonly saveLocation = 'Save location';
  readonly profile = 'Your profile';
  readonly signIn = 'Continue with Discord';
  readonly deletedUser = 'Deleted user';
  readonly loadMore = 'Load older posts';
  readonly noCheckin = 'No check-in yet';
  readonly distanceUnavailable = 'Enable your location to see approximate distance.';
  date(value: string): string {
    return new Intl.DateTimeFormat(this.locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(value),
    );
  }
  distance(kilometers: number, unit: 'km' | 'mi'): string {
    const value = unit === 'mi' ? kilometers / 1.609344 : kilometers;
    return `about ${new Intl.NumberFormat(this.locale, { maximumFractionDigits: 0 }).format(Math.max(1, Math.round(value)))} ${unit}`;
  }
  radius(kilometers: number, unit: 'km' | 'mi'): string {
    const value = unit === 'mi' ? kilometers / 1.609344 : kilometers;
    return `${new Intl.NumberFormat(this.locale, { maximumFractionDigits: 2 }).format(value)} ${unit}`;
  }
}
export const COMMUNITY_INTL = new InjectionToken<CommunityIntl>('CommunityIntl', {
  providedIn: 'root',
  factory: () => new CommunityEnglishIntl(),
});

export interface ProfileIntl {
  readonly title: string;
  readonly save: string;
  readonly nickname: string;
  readonly punchline: string;
  readonly biography: string;
  readonly birthYear: string;
  readonly birthMonth: string;
  readonly birthDay: string;
  readonly unit: string;
  readonly avatar: string;
}
@Injectable({ providedIn: 'root' })
export class ProfileEnglishIntl implements ProfileIntl {
  readonly title = 'Make yourself at home';
  readonly save = 'Save profile';
  readonly nickname = 'Nickname';
  readonly punchline = 'Punchline';
  readonly biography = 'About you';
  readonly birthYear = 'Birth year';
  readonly birthMonth = 'Birth month';
  readonly birthDay = 'Birth day';
  readonly unit = 'Distance units';
  readonly avatar = 'Avatar (square, at most 512 × 512)';
}
export const PROFILE_INTL = new InjectionToken<ProfileIntl>('ProfileIntl', {
  providedIn: 'root',
  factory: () => new ProfileEnglishIntl(),
});
