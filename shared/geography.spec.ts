import { describe, expect, it } from 'vitest';
import { radiusPixels, radiusZoom } from './geography';

describe('map privacy radius', () => {
  it('renders the configured geographic radius at the map latitude and zoom', () => {
    expect(radiusPixels(5, 0, 10)).toBeCloseTo(32.70666, 4);
    expect(radiusPixels(5, 60, 10)).toBeCloseTo(radiusPixels(5, 0, 10) * 2);
    expect(radiusPixels(25, 0, 10)).toBeCloseTo(radiusPixels(5, 0, 10) * 5);
  });

  it('fits the full privacy circle on desktop and mobile at all supported radii', () => {
    for (const latitude of [-90, -60, 0, 52, 85, 90]) {
      for (const radius of [1, 5, 25]) {
        for (const viewport of [260, 360, 600]) {
          const available = viewport * 0.35;
          const zoom = radiusZoom(radius, latitude, available);
          const pixels = radiusPixels(radius, latitude, zoom);
          expect(pixels).toBeLessThanOrEqual(available);
          expect(pixels).toBeGreaterThan(available / 2);
          expect(zoom).toBeGreaterThanOrEqual(1);
          expect(zoom).toBeLessThanOrEqual(16);
        }
      }
    }
  });
});
