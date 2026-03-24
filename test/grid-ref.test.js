/**
 * Tests for National Grid reference string parsing and formatting.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prefixToEN, enToPrefix, parseGridRef, formatGridRef } from '../src/grid-ref.js';

function assertClose(actual, expected, tol, label) {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${label}: expected ${expected}, got ${actual}`
  );
}

// ── prefixToEN ────────────────────────────────────────────────────────────────

describe('prefixToEN', () => {
  it('SV = (0, 0) — the grid false origin', () => {
    const { easting, northing } = prefixToEN('SV');
    assert.equal(easting,  0);
    assert.equal(northing, 0);
  });

  it('TQ = (500000, 100000) — London 100 km square', () => {
    const { easting, northing } = prefixToEN('TQ');
    assert.equal(easting,  500_000);
    assert.equal(northing, 100_000);
  });

  it('NT = (300000, 600000) — Edinburgh 100 km square', () => {
    const { easting, northing } = prefixToEN('NT');
    assert.equal(easting,  300_000);
    assert.equal(northing, 600_000);
  });

  it('SU = (400000, 100000) — Southampton area', () => {
    const { easting, northing } = prefixToEN('SU');
    assert.equal(easting,  400_000);
    assert.equal(northing, 100_000);
  });

  it('NN = (200000, 700000) — Ben Nevis area', () => {
    const { easting, northing } = prefixToEN('NN');
    assert.equal(easting,  200_000);
    assert.equal(northing, 700_000);
  });

  it('HY = (300000, 1000000) — Orkney', () => {
    const { easting, northing } = prefixToEN('HY');
    assert.equal(easting,  300_000);
    assert.equal(northing, 1_000_000);
  });

  it('is case-insensitive', () => {
    const upper = prefixToEN('TQ');
    const lower = prefixToEN('tq');
    assert.deepEqual(upper, lower);
  });

  it('throws on prefix containing I', () => {
    assert.throws(() => prefixToEN('IA'), /invalid grid letter/i);
  });

  it('throws on wrong length', () => {
    assert.throws(() => prefixToEN('T'),   /exactly 2/i);
    assert.throws(() => prefixToEN('TQR'), /exactly 2/i);
  });
});

// ── enToPrefix ────────────────────────────────────────────────────────────────

describe('enToPrefix', () => {
  it('(0, 0) → SV', () => {
    assert.equal(enToPrefix(0, 0), 'SV');
  });

  it('(500000, 100000) → TQ', () => {
    assert.equal(enToPrefix(500_000, 100_000), 'TQ');
  });

  it('(300000, 600000) → NT', () => {
    assert.equal(enToPrefix(300_000, 600_000), 'NT');
  });

  it('(216670, 771300) → NN (Ben Nevis area)', () => {
    assert.equal(enToPrefix(216_670, 771_300), 'NN');
  });

  it('SW corner of TQ square is still TQ', () => {
    assert.equal(enToPrefix(500_000, 100_000), 'TQ');
  });

  it('1 m inside TQ NE edge is still TQ', () => {
    assert.equal(enToPrefix(599_999, 199_999), 'TQ');
  });

  it('throws for out-of-range coordinates', () => {
    assert.throws(() => enToPrefix(-1_000_001, 0),  /outside/i);
    assert.throws(() => enToPrefix(0, -500_001),    /outside/i);
  });

  it('round-trips with prefixToEN for all active squares', () => {
    const squares = [
      'SV','SW','SX','SY','SZ','TV',
      'SU','TQ','TR',
      'ST','SH','SJ','SK','TF','TG','TL','TM',
      'NT','NU','NZ','NY','SE','TA',
      'NN','NH','NJ','NK',
      'HU','HY',
    ];
    for (const sq of squares) {
      const { easting, northing } = prefixToEN(sq);
      const back = enToPrefix(easting, northing);
      assert.equal(back, sq, `round-trip failed for ${sq}`);
    }
  });
});

// ── parseGridRef ─────────────────────────────────────────────────────────────

describe('parseGridRef', () => {
  it('6-figure ref "TG 51409 13177" → E=651409, N=313177', () => {
    // This corresponds to the OS Guide worked example (E≈651410, N≈313177)
    const { easting, northing, precision } = parseGridRef('TG 51409 13177');
    // TG base: E=600000, N=300000
    assert.equal(easting,  651_409);
    assert.equal(northing, 313_177);
    assert.equal(precision, 1);
  });

  it('6-figure "SU 386 137" → E=438600, N=113700', () => {
    const { easting, northing, precision } = parseGridRef('SU 386 137');
    assert.equal(easting,  438_600);
    assert.equal(northing, 113_700);
    assert.equal(precision, 100);
  });

  it('no-space "SU386137" parses identically', () => {
    const a = parseGridRef('SU 386 137');
    const b = parseGridRef('SU386137');
    assert.deepEqual(a, b);
  });

  it('lowercase "su 386 137" parses identically', () => {
    const a = parseGridRef('SU 386 137');
    const b = parseGridRef('su 386 137');
    assert.deepEqual(a, b);
  });

  it('4-figure "TQ 30 80" → E=530000, N=180000, precision=1000', () => {
    const { easting, northing, precision } = parseGridRef('TQ 30 80');
    assert.equal(easting,  530_000);
    assert.equal(northing, 180_000);
    assert.equal(precision, 1_000);
  });

  it('8-figure "NT 25163 73427" → E=325163, N=673427', () => {
    const { easting, northing, precision } = parseGridRef('NT 25163 73427');
    assert.equal(easting,  325_163);
    assert.equal(northing, 673_427);
    assert.equal(precision, 1);
  });

  it('10-figure "TQ 30015 80069" → E=530015, N=180069', () => {
    const { easting, northing, precision } = parseGridRef('TQ 30015 80069');
    assert.equal(easting,  530_015);
    assert.equal(northing, 180_069);
    assert.equal(precision, 1);
  });

  it('2-figure "SU 4 1" → E=440000, N=110000, precision=10000', () => {
    const { easting, northing, precision } = parseGridRef('SU 4 1');
    assert.equal(easting,  440_000);
    assert.equal(northing, 110_000);
    assert.equal(precision, 10_000);
  });

  it('throws on too-short ref', () => {
    assert.throws(() => parseGridRef('SU'), /too short/i);
  });

  it('throws on odd digit count', () => {
    assert.throws(() => parseGridRef('SU123'), /even/i);
  });

  it('throws on non-numeric digits', () => {
    assert.throws(() => parseGridRef('SU 3A6 137'), /non-numeric/i);
  });

  it('throws on more than 10 digits', () => {
    assert.throws(() => parseGridRef('SU 123456 789012'), /too many/i);
  });
});

// ── formatGridRef ─────────────────────────────────────────────────────────────

describe('formatGridRef', () => {
  it('formats a 1 m precision point (5 digits)', () => {
    // TQ base: 500000, 100000
    const result = formatGridRef(530_015, 180_069, 5);
    assert.equal(result, 'TQ 30015 80069');
  });

  it('formats a 100 m precision point (3 digits)', () => {
    const result = formatGridRef(438_600, 113_700, 3);
    assert.equal(result, 'SU 386 137');
  });

  it('formats a 1 km precision point (2 digits)', () => {
    const result = formatGridRef(530_000, 180_000, 2);
    assert.equal(result, 'TQ 30 80');
  });

  it('truncates (does not round) to the containing cell', () => {
    // E=438650, N=113750 at 3-digit precision should give "SU 386 137"
    // (the 100 m cell from E=438600 to E=438700)
    const result = formatGridRef(438_650, 113_750, 3);
    assert.equal(result, 'SU 386 137');
  });

  it('pads with leading zeros', () => {
    // SV 00005 00003 → point 5 m E, 3 m N of grid false origin
    const result = formatGridRef(5, 3, 5);
    assert.equal(result, 'SV 00005 00003');
  });

  it('default digits=3 gives 100 m precision (3 digits per axis)', () => {
    // 651409 - TG_base(600000) = 51409 → floor(51409/100)=514 → "514"
    // 313177 - TG_base(300000) = 13177 → floor(13177/100)=131 → "131"
    const result = formatGridRef(651_409, 313_177);
    assert.equal(result, 'TG 514 131');
  });

  it('throws for digits outside 1–5', () => {
    assert.throws(() => formatGridRef(500_000, 100_000, 0), /1.5/);
    assert.throws(() => formatGridRef(500_000, 100_000, 6), /1.5/);
  });
});

// ── parseGridRef / formatGridRef round-trip ────────────────────────────────

describe('parseGridRef / formatGridRef round-trip', () => {
  const cases = [
    { ref: 'TQ 30015 80069', digits: 5 },
    { ref: 'SU 386 137',     digits: 3 },
    { ref: 'NT 251 734',     digits: 3 },
    { ref: 'NN 166 713',     digits: 3 },
    { ref: 'HY 00000 00000', digits: 5 },
    { ref: 'TQ 30 80',       digits: 2 },
  ];

  for (const { ref, digits } of cases) {
    it(`round-trips "${ref}"`, () => {
      const { easting, northing } = parseGridRef(ref);
      const formatted = formatGridRef(easting, northing, digits);
      assert.equal(formatted, ref);
    });
  }
});
