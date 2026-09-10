export type GeoPoint = {
  longitude: number;
  latitude: number;
};

export type PixelPoint = {
  x: number;
  y: number;
};

export const degreesToRadians = (degrees: number) => (degrees * Math.PI) / 180;
export const radiansToDegrees = (radians: number) => (radians * 180) / Math.PI;

export function normalizeLongitude(longitude: number) {
  return ((longitude + 180) % 360 + 360) % 360 - 180;
}

export function angularDistance(longitude: number, centralMeridian: number) {
  return normalizeLongitude(longitude - centralMeridian);
}

export function pixelToGeo(
  x: number,
  y: number,
  width: number,
  height: number,
): GeoPoint {
  return {
    longitude: (x / width) * 360 - 180,
    latitude: 90 - (y / height) * 180,
  };
}

export function geoToPixel(
  longitude: number,
  latitude: number,
  width: number,
  height: number,
): PixelPoint {
  return {
    x: ((normalizeLongitude(longitude) + 180) / 360) * width,
    y: ((90 - Math.max(-90, Math.min(90, latitude))) / 180) * height,
  };
}
