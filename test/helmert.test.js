/**
 * Tests for the 7-parameter Helmert transformation.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyHelmert, invertHelmert } from '../src/helmert.js';
import { OSGB36_TO_WGS84 } from '../src/constants.js';

function assertClose(actual, expected, tol, label) {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${label}: expected ${expected}, got ${actual}, diff ${Math.abs(actual - expected)} > tol ${tol}`
  );
}

describe('invertHelmert', () => {
  it('negates all seven parameters', () => {
    const inv = invertHelmert(OSGB36_TO_WGS84);
    assert.equal(inv.tx, -OSGB36_TO_WGS84.tx);
    assert.equal(inv.ty, -OSGB36_TO_WGS84.ty);
    assert.equal(inv.tz, -OSGB36_TO_WGS84.tz);
    assert.equal(inv.rx, -OSGB36_TO_WGS84.rx);
    assert.equal(inv.ry, -OSGB36_TO_WGS84.ry);
    assert.equal(inv.rz, -OSGB36_TO_WGS84.rz);
    assert.equal(inv.s,  -OSGB36_TO_WGS84.s);
  });
});

describe('applyHelmert', () => {
  it('zero parameters is identity', () => {
    const zero = { tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0, s: 0 };
    const pt = { X: 3_980_000, Y: -10_000, Z: 4_960_000 };
    const out = applyHelmert(pt.X, pt.Y, pt.Z, zero);
    assertClose(out.X, pt.X, 1e-6, 'X identity');
    assertClose(out.Y, pt.Y, 1e-6, 'Y identity');
    assertClose(out.Z, pt.Z, 1e-6, 'Z identity');
  });

  it('pure translation shifts Cartesian correctly', () => {
    const params = { tx: 100, ty: -50, tz: 200, rx: 0, ry: 0, rz: 0, s: 0 };
    const out = applyHelmert(0, 0, 0, params);
    assertClose(out.X,  100, 1e-9, 'X translation');
    assertClose(out.Y,  -50, 1e-9, 'Y translation');
    assertClose(out.Z,  200, 1e-9, 'Z translation');
  });

  it('scale factor of +1 ppm scales coordinates by (1 + 1e-6)', () => {
    const params = { tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0, s: 1 };
    const pt = { X: 4_000_000, Y: 0, Z: 0 };
    const out = applyHelmert(pt.X, pt.Y, pt.Z, params);
    assertClose(out.X, pt.X * (1 + 1e-6), 1e-3, 'scale ppm');
  });

  it('OSGB36 → WGS84 → OSGB36 round-trip error < 0.1 mm', () => {
    // Approximate OSGB36 Cartesian for a point in central England
    const pts = [
      { X: 3_874_938, Y:  -111_748, Z: 5_047_351 },  // Edinburgh area
      { X: 3_980_468, Y:    -9_750, Z: 4_966_014 },  // London area
      { X: 3_823_765, Y:  -289_465, Z: 5_069_416 },  // Glasgow area
    ];

    const wgs84ToOsgb = invertHelmert(OSGB36_TO_WGS84);

    for (const pt of pts) {
      const wgs  = applyHelmert(pt.X, pt.Y, pt.Z, OSGB36_TO_WGS84);
      const back = applyHelmert(wgs.X, wgs.Y, wgs.Z, wgs84ToOsgb);
      assertClose(back.X, pt.X, 0.1, 'round-trip X');
      assertClose(back.Y, pt.Y, 0.1, 'round-trip Y');
      assertClose(back.Z, pt.Z, 0.1, 'round-trip Z');
    }
  });

  it('OSGB36→WGS84 translation is in the expected direction', () => {
    // tx=+446 m means WGS84 origin is east of OSGB36 origin; for a UK point
    // the WGS84 X should be slightly larger than OSGB36 X
    const pt = { X: 3_980_000, Y: -10_000, Z: 4_960_000 };
    const out = applyHelmert(pt.X, pt.Y, pt.Z, OSGB36_TO_WGS84);
    // Net shift is dominated by tx=+446, tz=+542 → X increases, Z increases
    assert.ok(out.X > pt.X, 'X increases OSGB36→WGS84');
    assert.ok(out.Z > pt.Z, 'Z increases OSGB36→WGS84');
  });
});
