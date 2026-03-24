/**
 * Constants for OS coordinate conversions.
 *
 * Sources:
 *   A Guide to Coordinate Systems in Great Britain (OS, v3.6)
 *   https://www.ordnancesurvey.co.uk/documents/resources/guide-coordinate-systems-great-britain.pdf
 */

// ── Ellipsoid definitions ────────────────────────────────────────────────────

/** Airy 1830 ellipsoid — used by OSGB36 / National Grid */
export const AIRY_1830 = Object.freeze({
  a: 6_377_563.396,   // semi-major axis (m)
  b: 6_356_256.909,   // semi-minor axis (m)
});

/** WGS84 ellipsoid — used by GPS / WGS84 datum */
export const WGS84_ELLIPSOID = Object.freeze({
  a: 6_378_137.000,   // semi-major axis (m)  [exactly defined]
  b: 6_356_752.3142,  // semi-minor axis (m)
});

// ── National Grid projection parameters (Transverse Mercator, Appendix C) ───

export const NATIONAL_GRID = Object.freeze({
  a:    AIRY_1830.a,
  b:    AIRY_1830.b,
  F0:   0.9996012717,                    // scale factor on central meridian
  phi0: 49 * (Math.PI / 180),            // true origin latitude  (49°N)
  lam0: -2 * (Math.PI / 180),            // true origin longitude (2°W)
  N0:   -100_000,                        // false northing (m)
  E0:    400_000,                        // false easting  (m)
});

// ── Helmert 7-parameter transformation: OSGB36 → WGS84 ──────────────────────
//
// Position Vector (Bursa-Wolf) convention — as specified in the OS guide.
// Accuracy: ±3.5 m (95% confidence) across Great Britain.
// For sub-metre accuracy the OSTN15 shift grid is required.
//
// tx, ty, tz  — translations in metres
// rx, ry, rz  — rotations in arc-seconds (positive = anticlockwise when viewed
//               from positive end of axis)
// s           — scale difference in ppm (parts per million)

export const OSGB36_TO_WGS84 = Object.freeze({
  tx:  446.448,
  ty: -125.157,
  tz:  542.060,
  rx:    0.1502,
  ry:    0.2470,
  rz:    0.8421,
  s:   -20.4894,
});
