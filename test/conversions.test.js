/**
 * Integration tests for the full conversion pipeline.
 *
 * Accuracy budget:
 *   - Redfearn projection (OSGB36 lat/lon ↔ E/N):  < 0.001 m
 *   - Helmert datum shift (OSGB36 ↔ WGS84):        ± 3.5 m (95 %)
 *   - Full pipeline (WGS84 ↔ E/N):                 ± 5 m (allowing margin)
 *
 * Tests marked [OSGB36] use purely OSGB36 coordinates and have sub-mm accuracy.
 * Tests marked [WGS84] go through the Helmert shift and are accurate to ~ 3-5 m.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  osgb36ToEN, enToOsgb36,
  wgs84ToOsgb36, osgb36ToWgs84,
  wgs84ToEN, enToWgs84,
  wgs84ToGridRef, gridRefToWgs84,
  parseGridRef, formatGridRef,
} from '../index.js';

function assertClose(actual, expected, tol, label) {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${label}: expected ${expected}, got ${actual}, diff=${Math.abs(actual - expected).toFixed(4)}`
  );
}

// ── OSGB36 lat/lon ↔ National Grid (pure projection, no datum shift) ─────────

describe('[OSGB36] osgb36ToEN', () => {
  it('OS Guide Appendix C point (tolerance 0.001 m)', () => {
    // φ = 52°39'27.2531"N, λ = 1°43'4.5177"E → E=651409.903, N=313177.270
    const phi = (52 + 39/60 + 27.2531/3600);
    const lam = (1  + 43/60 +  4.5177/3600);
    const { easting, northing } = osgb36ToEN(phi, lam);

    assertClose(easting,  651_409.903, 0.001, 'E — OS worked example');
    assertClose(northing, 313_177.270, 0.001, 'N — OS worked example');
  });

  it('true origin (49°N, 2°W) → E=400000, N=-100000', () => {
    const { easting, northing } = osgb36ToEN(49, -2);
    assertClose(easting,   400_000, 0.001, 'E at true origin');
    assertClose(northing, -100_000, 0.001, 'N at true origin');
  });
});

describe('[OSGB36] enToOsgb36', () => {
  it('round-trip OSGB36 lat/lon < 0.001 m', () => {
    const pts = [
      { lat: 52.6576, lon:  1.7179 },  // OS worked example
      { lat: 51.5,    lon: -0.12   },  // London
      { lat: 55.95,   lon: -3.20   },  // Edinburgh
      { lat: 56.80,   lon: -5.00   },  // Ben Nevis area
      { lat: 49.95,   lon: -6.33   },  // Scilly Isles
    ];
    for (const pt of pts) {
      const { easting, northing } = osgb36ToEN(pt.lat, pt.lon);
      const back = enToOsgb36(easting, northing);
      // Convert degree residual to metres: 1° latitude ≈ 111 320 m
      assertClose(back.lat * 111_320, pt.lat * 111_320, 1e-3, `lat round-trip ${pt.lat}`);
      assertClose(back.lon * 111_320 * Math.cos(pt.lat * Math.PI / 180),
                  pt.lon  * 111_320 * Math.cos(pt.lat * Math.PI / 180),
                  1e-3, `lon round-trip ${pt.lon}`);
    }
  });
});

// ── Datum shift: WGS84 ↔ OSGB36 ─────────────────────────────────────────────

describe('[WGS84] wgs84ToOsgb36 / osgb36ToWgs84', () => {
  it('WGS84 → OSGB36 → WGS84 round-trip < 0.1 m', () => {
    // Round-trip error should be much less than the ±3.5 m Helmert accuracy
    const pts = [
      { lat: 51.4999, lon: -0.1246 },  // London
      { lat: 55.9486, lon: -3.1999 },  // Edinburgh
      { lat: 56.7969, lon: -5.0035 },  // Ben Nevis
      { lat: 53.4808, lon: -2.2426 },  // Manchester
    ];
    for (const pt of pts) {
      const osgb = wgs84ToOsgb36(pt.lat, pt.lon);
      const back = osgb36ToWgs84(osgb.lat, osgb.lon);
      assertClose(back.lat * 111_320, pt.lat * 111_320, 0.1, `lat round-trip ${pt.lat}`);
      assertClose(back.lon * 111_320 * Math.cos(pt.lat * Math.PI / 180),
                  pt.lon  * 111_320 * Math.cos(pt.lat * Math.PI / 180),
                  0.1, `lon round-trip ${pt.lon}`);
    }
  });

  it('WGS84 and OSGB36 differ by a few arcseconds (datum shift is visible)', () => {
    // For a typical UK point the datum shift should move coordinates by
    // roughly 5–8 arcseconds in lat and lon.
    const wgs84 = { lat: 51.5, lon: -0.12 };
    const osgb  = wgs84ToOsgb36(wgs84.lat, wgs84.lon);
    const deltaSec = Math.abs(wgs84.lat - osgb.lat) * 3600;
    assert.ok(deltaSec > 1,  `Expected datum shift > 1",  got ${deltaSec.toFixed(3)}"`);
    assert.ok(deltaSec < 20, `Expected datum shift < 20", got ${deltaSec.toFixed(3)}"`);
  });

  it('OSGB36 → WGS84 → OSGB36 round-trip < 0.1 m', () => {
    const osgb = { lat: 52.6576, lon: 1.7179 };
    const wgs  = osgb36ToWgs84(osgb.lat, osgb.lon);
    const back = wgs84ToOsgb36(wgs.lat,  wgs.lon);
    assertClose(back.lat * 111_320, osgb.lat * 111_320, 0.1, 'lat round-trip');
    assertClose(back.lon * 111_320 * Math.cos(osgb.lat * Math.PI / 180),
                osgb.lon * 111_320 * Math.cos(osgb.lat * Math.PI / 180),
                0.1, 'lon round-trip');
  });
});

// ── Full pipeline: WGS84 lat/lon ↔ National Grid E/N ─────────────────────────

describe('[WGS84] wgs84ToEN / enToWgs84', () => {
  it('E/N → WGS84 → E/N round-trip < 1 m', () => {
    // Going EN → WGS84 → EN errors partially cancel, so round-trip is
    // much smaller than the one-way Helmert error of ±3.5 m.
    const pts = [
      { E: 530_025, N: 179_835 },  // Westminster / Big Ben area
      { E: 325_163, N: 673_427 },  // Edinburgh Castle
      { E: 216_670, N: 771_300 },  // Ben Nevis
      { E: 651_409, N: 313_177 },  // OS worked example
      { E:  91_492, N:  11_318 },  // Isles of Scilly
      { E: 393_000, N: 494_000 },  // Sheffield
    ];
    for (const pt of pts) {
      const wgs  = enToWgs84(pt.E, pt.N);
      const back = wgs84ToEN(wgs.lat, wgs.lon);
      assertClose(back.easting,  pt.E, 1, `E round-trip E=${pt.E}`);
      assertClose(back.northing, pt.N, 1, `N round-trip N=${pt.N}`);
    }
  });

  it('WGS84 → E/N → WGS84 round-trip < 0.0001° (≈ 11 m)', () => {
    // One-way error is ±3.5 m; going WGS84→EN→WGS84 the error stays similar.
    const pts = [
      { lat: 51.4999, lon: -0.1246 },  // London
      { lat: 55.9486, lon: -3.1999 },  // Edinburgh
    ];
    for (const pt of pts) {
      const { easting, northing } = wgs84ToEN(pt.lat, pt.lon);
      const back = enToWgs84(easting, northing);
      assertClose(back.lat, pt.lat, 0.0001, `lat ${pt.lat}`);
      assertClose(back.lon, pt.lon, 0.0001, `lon ${pt.lon}`);
    }
  });
});

// ── Grid reference string ↔ WGS84 ────────────────────────────────────────────

describe('[WGS84] gridRefToWgs84 / wgs84ToGridRef', () => {
  it('wgs84ToGridRef returns a valid parseable string', () => {
    // London — Trafalgar Square area
    const ref = wgs84ToGridRef(51.5079, -0.1281, 3);
    assert.match(ref, /^[A-Z]{2} \d{3} \d{3}$/);
    // Should be in TQ square (London)
    assert.ok(ref.startsWith('TQ'), `Expected TQ square, got ${ref}`);
  });

  it('wgs84ToGridRef Edinburgh is in NT square', () => {
    const ref = wgs84ToGridRef(55.9486, -3.1999, 3);
    assert.ok(ref.startsWith('NT'), `Expected NT square for Edinburgh, got ${ref}`);
  });

  it('wgs84ToGridRef Ben Nevis is in NN square', () => {
    const ref = wgs84ToGridRef(56.7969, -5.0035, 3);
    assert.ok(ref.startsWith('NN'), `Expected NN square for Ben Nevis, got ${ref}`);
  });

  it('gridRefToWgs84 / wgs84ToGridRef round-trip (3-digit precision)', () => {
    // The Helmert datum shift (~3.5 m) can move a point across a 100 m cell
    // boundary, so an exact string round-trip is not guaranteed.
    // Instead verify: WGS84 coords are sensible, and the resulting grid ref
    // is within one cell (100 m) of the original.
    const ref = 'TQ 300 800';
    const { easting: eOrig, northing: nOrig } = parseGridRef(ref);
    const wgs = gridRefToWgs84(ref);
    assert.ok(wgs.lat > 51 && wgs.lat < 52,  `lat in range: ${wgs.lat}`);
    assert.ok(wgs.lon > -1 && wgs.lon < 0.5, `lon in range: ${wgs.lon}`);
    // Convert back and check we land within ±200 m (2 cells) of the original
    const { easting: eBack, northing: nBack } = parseGridRef(wgs84ToGridRef(wgs.lat, wgs.lon, 3));
    assertClose(eBack, eOrig, 200, 'E within 2 cells after round-trip');
    assertClose(nBack, nOrig, 200, 'N within 2 cells after round-trip');
  });

  it('5-digit (1 m) precision round-trip consistent to grid cell', () => {
    const ref = 'TQ 30015 80069';
    const wgs = gridRefToWgs84(ref);
    // Convert back; due to Helmert the 1 m grid ref may not recover exactly,
    // but should land within ~5 m (half a 10 m cell at worst).
    const { easting, northing } = parseGridRef(ref);
    const back = wgs84ToEN(wgs.lat, wgs.lon);
    assertClose(back.easting,  easting,  5, 'E 5-digit round-trip');
    assertClose(back.northing, northing, 5, 'N 5-digit round-trip');
  });

  it('gridRefToWgs84 London TQ gives sensible coordinates', () => {
    // Big Ben / Westminster area
    const wgs = gridRefToWgs84('TQ 302 798');
    assertClose(wgs.lat, 51.500, 0.005, 'lat Big Ben area');
    assertClose(wgs.lon, -0.124, 0.005, 'lon Big Ben area');
  });

  it('gridRefToWgs84 Edinburgh NT gives sensible coordinates', () => {
    const wgs = gridRefToWgs84('NT 252 734');
    assertClose(wgs.lat, 55.949, 0.005, 'lat Edinburgh');
    assertClose(wgs.lon, -3.198, 0.005, 'lon Edinburgh');
  });
});

// ── Accuracy characterisation ─────────────────────────────────────────────────
//
// The 7-parameter Helmert achieves ±3.5 m (95 %) accuracy relative to the
// OSTN15 shift grid.  These tests verify we are in the right general area;
// they do NOT require sub-5 m agreement because verifying that would require
// the OSTN15 grid file itself.

describe('Helmert accuracy characterisation', () => {
  it('Big Ben WGS84 → grid ref lands in TQ 30x 79x (correct 100 m cell area)', () => {
    // Elizabeth Tower (Big Ben): WGS84 ≈ 51.5007°N, 0.1246°W
    // National Grid published ref: TQ 302 797 → E=530200–530300, N=179700–179800
    const { easting, northing } = wgs84ToEN(51.5007, -0.1246);
    // Helmert should land within the TQ 30x 79x area (±100 m from cell boundary)
    assertClose(easting,  530_250, 150, 'E Big Ben in TQ 30x cell');
    assertClose(northing, 179_750, 150, 'N Big Ben in TQ 79x cell');
    // Verify the grid prefix is correct
    const ref = formatGridRef(Math.round(easting), Math.round(northing), 2);
    assert.ok(ref.startsWith('TQ'), `Expected TQ square, got ${ref}`);
  });

  it('Edinburgh Castle WGS84 → grid ref in NT 25x 73x area', () => {
    // Edinburgh Castle: WGS84 ≈ 55.9482°N, 3.1981°W → NT 2516 7343
    const { easting, northing } = wgs84ToEN(55.9482, -3.1981);
    assertClose(easting,  325_160, 150, 'E Edinburgh Castle');
    assertClose(northing, 673_430, 150, 'N Edinburgh Castle');
  });

  it('Helmert self-consistency: the stated ±3.5 m applies as round-trip budget', () => {
    // Round-trip EN → WGS84 → EN should be within 1 m (errors cancel).
    // One-way error (vs OSTN15) is ±3.5 m — that requires the full OSTN15
    // grid to verify, which is out of scope here.
    const testPoints = [
      { E: 530_025, N: 179_835 },  // Westminster
      { E: 325_163, N: 673_427 },  // Edinburgh
      { E: 216_670, N: 771_300 },  // Ben Nevis
    ];
    for (const pt of testPoints) {
      const wgs  = enToWgs84(pt.E, pt.N);
      const back = wgs84ToEN(wgs.lat, wgs.lon);
      assertClose(back.easting,  pt.E, 1, `round-trip E=${pt.E}`);
      assertClose(back.northing, pt.N, 1, `round-trip N=${pt.N}`);
    }
  });
});
