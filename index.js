/**
 * os-mapping — Ordnance Survey coordinate conversion library
 *
 * Conversion chain:
 *
 *   WGS84 lat/lon
 *       ↕  (7-parameter Helmert, ±3.5 m / 95 %)
 *   OSGB36 lat/lon
 *       ↕  (Redfearn Transverse Mercator, < 1 mm)
 *   National Grid easting / northing
 *       ↕  (string parsing / formatting, exact)
 *   Grid reference string  e.g. "TQ 30015 80069"
 *
 * Accuracy note:
 *   The Redfearn projection (lat/lon ↔ E/N on OSGB36) is accurate to < 1 mm.
 *   The Helmert datum shift (OSGB36 ↔ WGS84) achieves ±3.5 m (95 %) across
 *   Great Britain.  For sub-metre accuracy the OSTN15 shift grid is required.
 *
 * @module os-mapping
 */

import { NATIONAL_GRID, AIRY_1830, WGS84_ELLIPSOID, OSGB36_TO_WGS84 }
  from './src/constants.js';
import { geodeticToCartesian, cartesianToGeodetic }
  from './src/ellipsoid.js';
import { applyHelmert, invertHelmert }
  from './src/helmert.js';
import { latLonToEN as tmLatLonToEN, enToLatLon as tmEnToLatLon }
  from './src/transverse-mercator.js';
import { parseGridRef, formatGridRef, prefixToEN, enToPrefix }
  from './src/grid-ref.js';

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

// ─── Low-level: pure Transverse Mercator projection (no datum shift) ─────────
//     Input/output is OSGB36 lat/lon; accuracy < 1 mm.

/**
 * Convert OSGB36 lat/lon to National Grid easting/northing.
 * Pure Redfearn projection — no datum shift.  Accuracy < 1 mm.
 *
 * @param {number} latDeg  OSGB36 latitude  in decimal degrees
 * @param {number} lonDeg  OSGB36 longitude in decimal degrees
 * @returns {{easting:number, northing:number}}
 */
export function osgb36ToEN(latDeg, lonDeg) {
  const { E, N } = tmLatLonToEN(latDeg * RAD, lonDeg * RAD, NATIONAL_GRID);
  return { easting: E, northing: N };
}

/**
 * Convert National Grid easting/northing to OSGB36 lat/lon.
 * Pure Redfearn inverse — no datum shift.  Accuracy < 1 mm.
 *
 * @param {number} easting
 * @param {number} northing
 * @returns {{lat:number, lon:number}}  OSGB36 decimal degrees
 */
export function enToOsgb36(easting, northing) {
  const { phi, lam } = tmEnToLatLon(easting, northing, NATIONAL_GRID);
  return { lat: phi * DEG, lon: lam * DEG };
}

// ─── Mid-level: datum transformation only (OSGB36 ↔ WGS84) ──────────────────

/**
 * Convert WGS84 lat/lon to OSGB36 lat/lon via 7-parameter Helmert.
 * Accuracy: ±3.5 m (95 %) across Great Britain.
 *
 * @param {number} latDeg   WGS84 latitude  in decimal degrees
 * @param {number} lonDeg   WGS84 longitude in decimal degrees
 * @param {number} [h=0]    Ellipsoidal height in metres
 * @returns {{lat:number, lon:number}}  OSGB36 decimal degrees
 */
export function wgs84ToOsgb36(latDeg, lonDeg, h = 0) {
  const cart = geodeticToCartesian(latDeg * RAD, lonDeg * RAD, h, WGS84_ELLIPSOID);
  const shifted = applyHelmert(cart.X, cart.Y, cart.Z, invertHelmert(OSGB36_TO_WGS84));
  const { phi, lam } = cartesianToGeodetic(shifted.X, shifted.Y, shifted.Z, AIRY_1830);
  return { lat: phi * DEG, lon: lam * DEG };
}

/**
 * Convert OSGB36 lat/lon to WGS84 lat/lon via 7-parameter Helmert.
 * Accuracy: ±3.5 m (95 %) across Great Britain.
 *
 * @param {number} latDeg   OSGB36 latitude  in decimal degrees
 * @param {number} lonDeg   OSGB36 longitude in decimal degrees
 * @param {number} [h=0]    Ellipsoidal height in metres
 * @returns {{lat:number, lon:number}}  WGS84 decimal degrees
 */
export function osgb36ToWgs84(latDeg, lonDeg, h = 0) {
  const cart = geodeticToCartesian(latDeg * RAD, lonDeg * RAD, h, AIRY_1830);
  const shifted = applyHelmert(cart.X, cart.Y, cart.Z, OSGB36_TO_WGS84);
  const { phi, lam } = cartesianToGeodetic(shifted.X, shifted.Y, shifted.Z, WGS84_ELLIPSOID);
  return { lat: phi * DEG, lon: lam * DEG };
}

// ─── High-level: WGS84 lat/lon ↔ National Grid ───────────────────────────────

/**
 * Convert WGS84 lat/lon to National Grid easting/northing.
 * Accuracy: ±3.5 m (95 %) — dominated by Helmert datum shift.
 *
 * @param {number} latDeg  WGS84 latitude  in decimal degrees
 * @param {number} lonDeg  WGS84 longitude in decimal degrees
 * @returns {{easting:number, northing:number}}
 */
export function wgs84ToEN(latDeg, lonDeg) {
  const osgb = wgs84ToOsgb36(latDeg, lonDeg);
  return osgb36ToEN(osgb.lat, osgb.lon);
}

/**
 * Convert National Grid easting/northing to WGS84 lat/lon.
 * Accuracy: ±3.5 m (95 %) — dominated by Helmert datum shift.
 *
 * @param {number} easting
 * @param {number} northing
 * @returns {{lat:number, lon:number}}  WGS84 decimal degrees
 */
export function enToWgs84(easting, northing) {
  const osgb = enToOsgb36(easting, northing);
  return osgb36ToWgs84(osgb.lat, osgb.lon);
}

// ─── High-level: Grid reference string ↔ WGS84 lat/lon ───────────────────────

/**
 * Convert an OS grid reference string to WGS84 lat/lon.
 * Accuracy: ±3.5 m (95 %) — dominated by Helmert datum shift.
 *
 * @param {string} gridRef  e.g. "TQ 30015 80069"
 * @returns {{lat:number, lon:number}}  WGS84 decimal degrees
 */
export function gridRefToWgs84(gridRef) {
  const { easting, northing } = parseGridRef(gridRef);
  return enToWgs84(easting, northing);
}

/**
 * Convert WGS84 lat/lon to an OS grid reference string.
 * Accuracy: ±3.5 m (95 %) — dominated by Helmert datum shift.
 *
 * @param {number} latDeg    WGS84 latitude  in decimal degrees
 * @param {number} lonDeg    WGS84 longitude in decimal degrees
 * @param {number} [digits=3] Digits per axis (1–5).
 *   3 = 100 m precision ("TQ 300 800"),  5 = 1 m precision ("TQ 30015 80069")
 * @returns {string}
 */
export function wgs84ToGridRef(latDeg, lonDeg, digits = 3) {
  const { easting, northing } = wgs84ToEN(latDeg, lonDeg);
  return formatGridRef(easting, northing, digits);
}

/**
 * Convert an OS grid reference to National Grid easting/northing.
 * Exact integer arithmetic.
 *
 * @param {string} gridRef
 * @returns {{easting:number, northing:number, precision:number}}
 */
export { parseGridRef };

/**
 * Format National Grid easting/northing as a grid reference string.
 *
 * @param {number} easting
 * @param {number} northing
 * @param {number} [digits=3]
 * @returns {string}
 */
export { formatGridRef };

/** Convert two-letter grid prefix to SW-corner easting/northing. */
export { prefixToEN };

/** Convert easting/northing to two-letter grid prefix. */
export { enToPrefix };

// Re-export constants for users who need them
export { NATIONAL_GRID, AIRY_1830, WGS84_ELLIPSOID, OSGB36_TO_WGS84 };
