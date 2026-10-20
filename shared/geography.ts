import type { Coordinate } from './contracts';

export function distanceKm(first: Coordinate, second: Coordinate): number {
  const radians = (value: number) => (value * Math.PI) / 180;
  const latitude = radians(second.lat - first.lat);
  const longitude = radians(second.lng - first.lng);
  const a =
    Math.sin(latitude / 2) ** 2 +
    Math.cos(radians(first.lat)) * Math.cos(radians(second.lat)) * Math.sin(longitude / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
}

export function worldPixel(coordinate: Coordinate, zoom: number): { x: number; y: number } {
  const scale = 256 * 2 ** zoom;
  const latitude = (Math.max(-85.051128, Math.min(85.051128, coordinate.lat)) * Math.PI) / 180;
  return {
    x: ((coordinate.lng + 180) / 360) * scale,
    y: ((1 - Math.log(Math.tan(latitude) + 1 / Math.cos(latitude)) / Math.PI) / 2) * scale,
  };
}
export function pixelCoordinate(x: number, y: number, zoom: number): Coordinate {
  const scale = 256 * 2 ** zoom;
  return {
    lat: Math.max(
      -85.051128,
      Math.min(85.051128, (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / scale))) * 180) / Math.PI),
    ),
    lng: (((((x / scale) * 360) % 360) + 540) % 360) - 180,
  };
}

export function radiusPixels(radiusKm: number, latitude: number, zoom: number): number {
  const projectedLatitude = Math.max(-85.051128, Math.min(85.051128, latitude));
  const metersPerPixel = (156543.03392 * Math.cos((projectedLatitude * Math.PI) / 180)) / 2 ** zoom;
  return (radiusKm * 1000) / metersPerPixel;
}

export function radiusZoom(radiusKm: number, latitude: number, availablePixels: number): number {
  return Math.max(
    1,
    Math.min(16, Math.floor(Math.log2(availablePixels / radiusPixels(radiusKm, latitude, 0)))),
  );
}
