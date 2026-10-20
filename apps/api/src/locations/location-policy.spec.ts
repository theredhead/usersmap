import { describe, expect, it } from 'vitest';
import { coarseLocation } from './location-policy';
import { distanceKm } from '../../../../shared/geography';

describe('coarse location privacy', () => {
  it('quantizes exact positions and contains them inside the claimed radius across the globe', () => {
    for (const radius of [1, 5, 25]) {
      for (let latitude = -90; latitude <= 90; latitude += 2.5) {
        for (let longitude = -180; longitude <= 180; longitude += 5) {
          const input = { lat: latitude, lng: longitude };
          const coarse = coarseLocation(input, radius);
          expect(distanceKm(input, coarse)).toBeLessThanOrEqual(radius);
          expect(coarse.lat).toBeGreaterThanOrEqual(-90);
          expect(coarse.lat).toBeLessThanOrEqual(90);
          expect(coarse.lng).toBeGreaterThanOrEqual(-180);
          expect(coarse.lng).toBeLessThanOrEqual(180);
          expect(coarseLocation(coarse, radius)).toEqual(coarse);
        }
      }
    }
  });
  it('maps adjacent coordinates in a cell to the same point', () => {
    const first = coarseLocation({ lat: 52.123456, lng: 4.123456 }, 5);
    const second = coarseLocation({ lat: 52.123457, lng: 4.123457 }, 5);
    expect(first).toEqual(second);
    expect(first.lat).not.toBe(52.123456);
    expect(first.lng).not.toBe(4.123456);
  });
});
