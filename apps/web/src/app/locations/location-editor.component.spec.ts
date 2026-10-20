import '@angular/compiler';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { ApiService } from '../core/api.service';
import { CommunityStore } from '../core/community.store';
import { COMMUNITY_INTL, CommunityEnglishIntl } from '../core/feature-intl';
import { LocationEditor } from './location-editor.component';

function setup(
  unit: 'km' | 'mi' = 'km',
  policy = { minimumRadiusKm: 1, defaultRadiusKm: 5, maximumRadiusKm: 25 },
) {
  let pending = Promise.resolve();
  const saved = { lat: 52.4, lng: 4.9, radiusKm: policy.defaultRadiusKm };
  const api = {
    configuration: () => ({ locationPolicy: policy }),
    session: () => ({ member: { unit } }),
    write: vi.fn().mockResolvedValue(saved),
    refreshSession: vi.fn().mockResolvedValue(undefined),
    notice: signal(''),
    run: (operation: () => Promise<void>) => (pending = operation()),
  };
  const store = {
    mapCenter: signal({ lat: 30, lng: -20 }),
    mapZoom: signal(2),
    refreshMembers: vi.fn().mockResolvedValue(undefined),
  };
  const router = { navigateByUrl: vi.fn().mockResolvedValue(true) };
  const injector = Injector.create({
    providers: [
      { provide: ApiService, useValue: api },
      { provide: CommunityStore, useValue: store },
      { provide: Router, useValue: router },
      { provide: COMMUNITY_INTL, useValue: new CommunityEnglishIntl() },
    ],
  });
  const editor = runInInjectionContext(injector, () => new LocationEditor());
  return { editor, api, store, saved, settled: () => pending };
}

describe('location privacy slider', () => {
  it.each(['km', 'mi'] as const)(
    'keeps the exact default and limits in kilometers for %s',
    (unit) => {
      const { editor } = setup(unit);
      const radius = editor.engine.schema.groups
        .flatMap((group) => group.fields)
        .find((field) => field.id === 'radius');
      expect(radius?.component).toBe('privacy-radius');
      expect(radius?.config).toEqual({ min: 1, max: 25, step: 1, unit });
      expect(editor.radiusKm()).toBe(5);
      editor.engine.setValue('radius', 25);
      expect(editor.radiusKm()).toBe(25);
      editor.engine.setValue('radius', 1);
      expect(editor.radiusKm()).toBe(1);
    },
  );

  it('keeps fractional policy defaults on the slider step grid', () => {
    const { editor } = setup('mi', {
      minimumRadiusKm: 1.25,
      defaultRadiusKm: 5.5,
      maximumRadiusKm: 25,
    });
    const radius = editor.engine.schema.groups
      .flatMap((group) => group.fields)
      .find((field) => field.id === 'radius');
    expect(radius?.config?.['step']).toBe(0.01);
    expect(editor.radiusKm()).toBe(5.5);
  });

  it('shows preferred units without changing the underlying radius', () => {
    const intl = new CommunityEnglishIntl();
    expect(intl.radius(5, 'km')).toBe('5 km');
    expect(intl.radius(5, 'mi')).toBe('3.11 mi');
    expect(intl.radius(1, 'mi')).toBe('0.62 mi');
    expect(intl.radius(25, 'mi')).toBe('15.53 mi');
  });

  it('saves the canonical radius and returns to the saved coarse area', async () => {
    const { editor, api, store, saved, settled } = setup('mi');
    const exact = { lat: 52.37, lng: 4.91 };
    editor.selectLocation(exact);
    expect(editor.center()).toEqual(exact);
    editor.zoom.set(10);
    editor.save({ kind: 'checkin', radius: 5, comment: '' });
    await settled();
    expect(api.write).toHaveBeenCalledWith('PUT', 'me/locations/checkin', {
      ...exact,
      radiusKm: 5,
      comment: '',
    });
    expect(store.mapCenter()).toEqual({ lat: saved.lat, lng: saved.lng });
    expect(store.mapZoom()).toBe(10);
    expect(editor.selected()).toBeNull();
  });
});
