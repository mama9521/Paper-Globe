import {
  degreesToRadians,
  normalizeLongitude,
  radiansToDegrees,
  type GeoPoint,
} from './coordinates';

export type ProjectedPoint = {
  x: number;
  y: number;
};

export function cassiniForward(
  longitude: number,
  latitude: number,
  centralMeridian: number,
): ProjectedPoint {
  const lambda = degreesToRadians(normalizeLongitude(longitude - centralMeridian));
  const phi = degreesToRadians(latitude);

  return {
    x: Math.asin(Math.cos(phi) * Math.sin(lambda)),
    y: Math.atan2(Math.tan(phi), Math.cos(lambda)),
  };
}

export function cassiniInverse(
  x: number,
  y: number,
  centralMeridian: number,
): GeoPoint {
  return {
    longitude: normalizeLongitude(
      centralMeridian + radiansToDegrees(Math.atan2(Math.tan(x), Math.cos(y))),
    ),
    latitude: radiansToDegrees(Math.asin(Math.cos(x) * Math.sin(y))),
  };
}
