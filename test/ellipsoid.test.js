/**
 * Tests for geodetic ↔ Cartesian ECEF conversions.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { geodeticToCartesian, cartesianToGeodetic } from '../src/ellipsoid.js';
import { AIRY_1830, WGS84_ELLIPSOID } from '../src/constants.js';

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

// Tolerance constants
const MM  = 1e-3;   // 1 millimetre
const NM  = 1e-9;   // 1 nanometre (for round-trip angle residuals converted to distance)

function assertClose(actual, expected, tol, label) {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${label}: expected ${expected}, got ${actual}, diff ${Math.abs(actual - expected)} > tol ${tol}`
  );
}

describe('geodeticToCartesian', () => {
  it('converts a known WGS84 point to Cartesian', () => {
    // Greenwich Observatory: 51.4779°N, 0°E, h=0
    // Pre-computed reference values via the standard formula
    const phi = 51.4779 * RAD;
    const lam = 0.0;
    const { X, Y, Z } = geodeticToCartesian(phi, lam, 0, WGS84_ELLIPSOID);

    // For phi=51.4779°, lam=0°:
    //   N   = a/sqrt(1-e²sin²φ) ≈ 6390306 m
    //   X   = N·cosφ·cos0  = N·cosφ
    //   Y   = 0
    //   Z   = N·(1-e²)·sinφ
    assertClose(Y, 0, 0.001, 'Y should be 0 on the prime meridian');
    assert.ok(X > 3_900_000 && X < 4_100_000, `X ≈ 4 M, got ${X}`);
    assert.ok(Z > 4_900_000 && Z < 5_100_000, `Z ≈ 5 M, got ${Z}`);
  });

  it('equatorial point (0°N, 0°E) maps to (a, 0, 0)', () => {
    const { X, Y, Z } = geodeticToCartesian(0, 0, 0, WGS84_ELLIPSOID);
    assertClose(X, WGS84_ELLIPSOID.a, 0.001, 'X = semi-major axis');
    assertClose(Y, 0,                 0.001, 'Y = 0');
    assertClose(Z, 0,                 0.001, 'Z = 0');
  });

  it('North Pole (90°N, 0°E) maps to (0, 0, b)', () => {
    const { X, Y, Z } = geodeticToCartesian(Math.PI / 2, 0, 0, WGS84_ELLIPSOID);
    assertClose(X, 0,                      0.001, 'X = 0');
    assertClose(Y, 0,                      0.001, 'Y = 0');
    assertClose(Z, WGS84_ELLIPSOID.b,      0.001, 'Z = semi-minor axis');
  });

  it('height offset adds correctly', () => {
    const phi = 52 * RAD;
    const h = 100;
    const { X: X0 } = geodeticToCartesian(phi, 0, 0, WGS84_ELLIPSOID);
    const { X: Xh } = geodeticToCartesian(phi, 0, h, WGS84_ELLIPSOID);
    // The horizontal shift should be ≈ h·cos(phi)
    assertClose(Xh - X0, h * Math.cos(phi), 0.001, 'height adds cos(phi) to X');
  });
});

describe('cartesianToGeodetic', () => {
  it('round-trips WGS84 geodetic → Cartesian → geodetic (< 1 mm)', () => {
    const testPoints = [
      { phi:  51.5 * RAD, lam: -0.1 * RAD, h:   0 },  // London
      { phi:  55.9 * RAD, lam: -3.2 * RAD, h:  50 },  // Edinburgh
      { phi:  56.8 * RAD, lam: -5.0 * RAD, h: 1344 }, // Ben Nevis
      { phi:  49.9 * RAD, lam: -6.3 * RAD, h:   0 },  // Scilly Isles
      { phi:  58.6 * RAD, lam: -3.1 * RAD, h:   0 },  // Caithness
    ];

    for (const pt of testPoints) {
      const cart = geodeticToCartesian(pt.phi, pt.lam, pt.h, WGS84_ELLIPSOID);
      const back = cartesianToGeodetic(cart.X, cart.Y, cart.Z, WGS84_ELLIPSOID);

      // Angular residuals → linear distance ≈ R·Δangle
      const R = 6_371_000;
      assertClose(back.phi * R, pt.phi * R, MM,    `phi round-trip (${(pt.phi*DEG).toFixed(2)}°N)`);
      assertClose(back.lam * R, pt.lam * R, MM,    `lam round-trip (${(pt.lam*DEG).toFixed(2)}°E)`);
      assertClose(back.h,       pt.h,       MM,    `h round-trip (${pt.h} m)`);
    }
  });

  it('round-trips Airy 1830 geodetic → Cartesian → geodetic (< 1 mm)', () => {
    const pt = { phi: 52.6 * RAD, lam: 1.7 * RAD, h: 0 };
    const cart = geodeticToCartesian(pt.phi, pt.lam, pt.h, AIRY_1830);
    const back = cartesianToGeodetic(cart.X, cart.Y, cart.Z, AIRY_1830);

    const R = 6_371_000;
    assertClose(back.phi * R, pt.phi * R, MM, 'phi (Airy)');
    assertClose(back.lam * R, pt.lam * R, MM, 'lam (Airy)');
  });
});
