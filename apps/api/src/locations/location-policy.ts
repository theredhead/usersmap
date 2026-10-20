import type { Coordinate } from '../../../../shared/contracts';

const radians = (value: number) => (value * Math.PI) / 180;

export function coarseLocation(coordinate: Coordinate, radiusKm: number): Coordinate {
  // Each cell's half-diagonal is smaller than the advertised radius, including at the poles.
  const latitudeCells = Math.ceil((180 * 111.32) / radiusKm);
  const latitudeStep = 180 / latitudeCells;
  const latitudeIndex = Math.min(
    latitudeCells - 1,
    Math.floor((coordinate.lat + 90) / latitudeStep),
  );
  const latitude = -90 + (latitudeIndex + 0.5) * latitudeStep;
  const equatorwardEdge = Math.max(0, Math.abs(latitude) - latitudeStep / 2);
  const longitudeCells = Math.max(
    1,
    Math.ceil((360 * 111.32 * Math.cos(radians(equatorwardEdge))) / radiusKm),
  );
  const longitudeStep = 360 / longitudeCells;
  const normalizedLongitude = (((coordinate.lng + 180) % 360) + 360) % 360;
  return {
    lat: latitude,
    lng: -180 + (Math.floor(normalizedLongitude / longitudeStep) + 0.5) * longitudeStep,
  };
}
