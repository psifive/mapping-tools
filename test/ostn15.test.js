/**
 * OSTN15 grid-shift tests.
 *
 * These require the OSTN15 NTv2 binaries in data/ (~30 MB, not committed —
 * see loadOSTN15). When the files are absent the whole suite is skipped so the
 * default `node --test test/*.test.js` run stays green without them.
 *
 * Reference value is the official OS OSTN15 worked example:
 *   ETRS89  52.658007833 N, 1.716073973 E
 *     →  National Grid  E = 651409.804,  N = 313177.450
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadOSTN15, wgs84ToEN, enToWgs84 } from '../index.js';

const OSGB_TO_ETRS = fileURLToPath(new URL('../data/OSTN15_NTv2_OSGBtoETRS.gsb', import.meta.url));
const ETRS_TO_OSGB = fileURLToPath(new URL('../data/OSTN15_NTv2_ETRStoOSGB.gsb', import.meta.url));

const filesPresent = existsSync(OSGB_TO_ETRS) && existsSync(ETRS_TO_OSGB);

function assertClose(actual, expected, tol, label) {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${label}: expected ${expected}, got ${actual}, diff=${Math.abs(actual - expected).toFixed(6)}`
  );
}

describe('[OSTN15] sub-metre datum transform', {
  skip: filesPresent ? false : 'OSTN15 .gsb grid files not present in data/ (see loadOSTN15)',
}, () => {
  before(() => loadOSTN15(OSGB_TO_ETRS, ETRS_TO_OSGB));

  it('matches the official OS OSTN15 worked example to < 5 mm', () => {
    const { easting, northing } = wgs84ToEN(52.658007833, 1.716073973);
    assertClose(easting,  651_409.804, 0.005, 'E — OSTN15 worked example');
    assertClose(northing, 313_177.450, 0.005, 'N — OSTN15 worked example');
  });

  it('EN → WGS84 → EN round-trips to < 5 mm', () => {
    const lat = 52.658007833, lon = 1.716073973;
    const { easting, northing } = wgs84ToEN(lat, lon);
    const back = enToWgs84(easting, northing);
    const there = wgs84ToEN(back.lat, back.lon);
    assertClose(there.easting,  easting,  0.005, 'E round-trip');
    assertClose(there.northing, northing, 0.005, 'N round-trip');
  });
});
