/**
 * OS National Grid reference string utilities.
 *
 * Supports any even-digit precision (2, 4, 6, 8, 10 total digits):
 *   2 digits  →  10 km resolution  (e.g. "SU 4 1")
 *   4 digits  →   1 km resolution  (e.g. "SU 43 13")
 *   6 digits  → 100 m resolution   (e.g. "SU 386 137")   ← most common
 *   8 digits  →  10 m resolution   (e.g. "SU 3862 1370")
 *  10 digits  →   1 m resolution   (e.g. "SU 38600 13700")
 *
 * The two-letter prefix identifies a 100 km × 100 km square.
 * The numeric digits give the position within that square; they encode
 * the SW corner of the grid cell at the stated precision.
 *
 * The 25-letter alphabet used is A–Z omitting I:
 *   A=0  B=1  C=2  D=3  E=4  F=5  G=6  H=7  J=8  K=9
 *   L=10 M=11 N=12 O=13 P=14 Q=15 R=16 S=17 T=18 U=19
 *   V=20 W=21 X=22 Y=23 Z=24
 *
 * Letter layout (row 0 = northernmost, column 0 = westernmost):
 *   A B C D E    ← row 0
 *   F G H J K    ← row 1
 *   L M N O P    ← row 2
 *   Q R S T U   ← row 3
 *   V W X Y Z    ← row 4
 *
 * The false origin of the lettered grid places SV at (E=0, N=0).
 */

const LETTERS = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';   // 25 letters, I omitted

function letterIndex(ch) {
  const idx = LETTERS.indexOf(ch.toUpperCase());
  if (idx === -1) throw new Error(`Invalid grid letter: '${ch}'`);
  return idx;
}

function indexLetter(idx) {
  if (idx < 0 || idx > 24) throw new Error(`Grid index out of range: ${idx}`);
  return LETTERS[idx];
}

/**
 * Convert a two-letter National Grid prefix to the easting/northing (metres)
 * of the SW corner of that 100 km square.
 *
 * @param {string} prefix  Two capital letters, e.g. "TQ"
 * @returns {{easting:number, northing:number}}
 */
export function prefixToEN(prefix) {
  const p = prefix.toUpperCase();
  if (p.length !== 2) throw new Error(`Prefix must be exactly 2 letters, got '${prefix}'`);

  const i1 = letterIndex(p[0]);   // 500 km square
  const i2 = letterIndex(p[1]);   // 100 km square within 500 km square

  const col500 = i1 % 5;
  const row500 = Math.floor(i1 / 5);

  const col100 = i2 % 5;
  const row100 = Math.floor(i2 / 5);

  const easting  = (col500 * 5 + col100) * 100_000 - 1_000_000;
  const northing = ((4 - row500) * 5 + (4 - row100)) * 100_000 - 500_000;

  return { easting, northing };
}

/**
 * Convert easting/northing (metres) to the two-letter National Grid prefix
 * of the 100 km square that contains that point.
 *
 * @param {number} easting
 * @param {number} northing
 * @returns {string}  Two-letter prefix, e.g. "TQ"
 */
export function enToPrefix(easting, northing) {
  // Shift to the notional letter-grid origin (SV = 0,0 → AA corner is SW)
  const e = easting  + 1_000_000;
  const n = northing + 500_000;

  if (e < 0 || n < 0 || e >= 2_500_000 || n >= 2_500_000) {
    throw new RangeError(
      `Coordinates (E=${easting}, N=${northing}) are outside the lettered National Grid`
    );
  }

  const col500 = Math.floor(e / 500_000);
  const row500 = 4 - Math.floor(n / 500_000);   // row 0 = northernmost

  const col100 = Math.floor((e % 500_000) / 100_000);
  const row100 = 4 - Math.floor((n % 500_000) / 100_000);

  const i1 = row500 * 5 + col500;
  const i2 = row100 * 5 + col100;

  return indexLetter(i1) + indexLetter(i2);
}

/**
 * Parse an OS National Grid reference string into numeric easting/northing.
 *
 * Accepted input examples:
 *   "SU386137"       → { easting: 438600, northing: 113700, precision: 100 }
 *   "SU 386 137"     → same
 *   "TG 51409 13177" → { easting: 651409, northing: 313177, precision:   1 }
 *   "TQ 30 80"       → { easting: 530000, northing: 180000, precision: 1000 }
 *
 * Returned `precision` is the size of the grid cell in metres.
 * The easting/northing represent the SW corner of that cell.
 *
 * @param {string} gridRef
 * @returns {{easting:number, northing:number, precision:number}}
 */
export function parseGridRef(gridRef) {
  // Strip all whitespace, convert to uppercase
  const clean = gridRef.replace(/\s+/g, '').toUpperCase();

  if (clean.length < 4) {
    throw new Error(`Grid reference too short: '${gridRef}'`);
  }

  const prefix = clean.slice(0, 2);
  const digits = clean.slice(2);

  if (!/^\d+$/.test(digits)) {
    throw new Error(`Non-numeric characters in grid reference digits: '${gridRef}'`);
  }
  if (digits.length === 0 || digits.length % 2 !== 0) {
    throw new Error(`Grid reference must have an even number of digits after the prefix: '${gridRef}'`);
  }

  const half = digits.length / 2;
  if (half > 5) {
    throw new Error(`Grid reference has too many digits (max 10 numeric digits): '${gridRef}'`);
  }

  const eDigits = digits.slice(0, half);
  const nDigits = digits.slice(half);

  // Each digit represents 10^(5-half) metres
  const precision = Math.pow(10, 5 - half);

  const { easting: eBase, northing: nBase } = prefixToEN(prefix);

  return {
    easting:   eBase + parseInt(eDigits, 10) * precision,
    northing:  nBase + parseInt(nDigits, 10) * precision,
    precision,
  };
}

/**
 * Format easting/northing as an OS National Grid reference string.
 *
 * The numeric part is truncated (not rounded) to the requested precision so
 * that the result always identifies the grid cell that contains the point.
 *
 * @param {number} easting    Metres
 * @param {number} northing   Metres
 * @param {number} [digits=3] Digits per axis (1–5).
 *   1 → 10 km cell ("SU 4 1"),  3 → 100 m cell ("SU 386 137"),
 *   5 →  1 m cell  ("SU 38600 13700")
 * @returns {string}
 */
export function formatGridRef(easting, northing, digits = 3) {
  if (digits < 1 || digits > 5 || !Number.isInteger(digits)) {
    throw new Error(`digits must be an integer 1–5, got ${digits}`);
  }

  const prefix = enToPrefix(easting, northing);
  const { easting: eBase, northing: nBase } = prefixToEN(prefix);

  const eOff = easting  - eBase;
  const nOff = northing - nBase;

  // Truncate to the cell at the given precision
  const scale = Math.pow(10, 5 - digits);
  const eNum  = Math.floor(eOff / scale);
  const nNum  = Math.floor(nOff / scale);

  return `${prefix} ${String(eNum).padStart(digits, '0')} ${String(nNum).padStart(digits, '0')}`;
}
