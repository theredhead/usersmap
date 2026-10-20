import type { FormSchema } from '@theredhead/lucid-forms';

export type LocationKind = 'checkin' | 'home' | 'work';
export type DistanceUnit = 'km' | 'mi';
export interface Coordinate {
  lat: number;
  lng: number;
}
export interface MemberLocation extends Coordinate {
  kind: LocationKind;
  radiusKm: number;
  comment: string;
  updatedAt: string;
}
export interface Member {
  id: string;
  nickname: string;
  punchline: string;
  bio: string;
  avatarUrl?: string;
  customAnswers: Record<string, unknown>;
  location?: MemberLocation;
  lastCheckinAt?: string;
}
export interface MyProfile extends Member {
  unit: DistanceUnit;
  birthYear: number | null;
  birthMonth: number | null;
  birthDay: number | null;
  profileComplete: boolean;
  locations: MemberLocation[];
}
export interface SessionInfo {
  member: MyProfile | null;
  csrfToken: string | null;
}
export interface TimelinePost {
  id: string;
  body: string;
  createdAt: string;
  author: Pick<Member, 'id' | 'nickname' | 'avatarUrl'> | null;
  media: { id: string; type: 'image' | 'video'; url: string } | null;
  videoUrl: string | null;
}
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
export interface PublicConfiguration {
  siteName: string;
  locale: string;
  discordConfigured: boolean;
  theme: { primary: string; surface: string; background: string; text: string };
  locationPolicy: { minimumRadiusKm: number; defaultRadiusKm: number; maximumRadiusKm: number };
  postIntervalSeconds: number;
  maximumUploadBytes: number;
  maximumVideoSeconds: number;
  tileUrl: string;
  tileAttribution: string;
  profileSchema: FormSchema;
}
