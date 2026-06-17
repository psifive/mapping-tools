/**
 * OSTN15 NTv2 horizontal datum shift grid.
 * Converts between OSGB36 and ETRS89/WGS84 with sub-0.1 m accuracy.
 *
 * Source: Ordnance Survey OSTN15, © Crown copyright 2016.
 * Format: NTv2 binary (.gsb)
 */
import { readFileSync } from 'node:fs';

let _osgbToEtrs = null;
let _etrsToOsgb = null;

function parseGrid(buf) {
  // Detect endianness (NUM_OREC record, value should be 11)
  const le = buf.readUInt32LE(8) === 11;
  const ri32 = (o) => le ? buf.readInt32LE(o)   : buf.readInt32BE(o);
  const rf64 = (o) => le ? buf.readDoubleLE(o)  : buf.readDoubleBE(o);
  const rf32 = (o) => le ? buf.readFloatLE(o)   : buf.readFloatBE(o);

  const numOrec = ri32(8);
  const numSrec = ri32(16 + 8);

  // Skip overview header, read sub-grid header
  let off = numOrec * 16;
  const sub = {};
  for (let i = 0; i < numSrec; i++, off += 16) {
    const key = buf.toString('ascii', off, off + 8).trimEnd();
    if      (key === 'GS_COUNT')  sub.gsCount = ri32(off + 8);
    else if (key === 'S_LAT')     sub.sLat    = rf64(off + 8);
    else if (key === 'N_LAT')     sub.nLat    = rf64(off + 8);
    else if (key === 'E_LONG')    sub.eLon    = rf64(off + 8);
    else if (key === 'W_LONG')    sub.wLon    = rf64(off + 8);
    else if (key === 'LAT_INC')   sub.latInc  = rf64(off + 8);
    else if (key === 'LONG_INC')  sub.lonInc  = rf64(off + 8);
  }

  const nLatNodes = Math.round((sub.nLat - sub.sLat) / sub.latInc) + 1;
  const nLonNodes = Math.round((sub.wLon - sub.eLon) / sub.lonInc) + 1;

  const latShift = new Float32Array(sub.gsCount);
  const lonShift = new Float32Array(sub.gsCount);

  for (let i = 0; i < sub.gsCount; i++) {
    const b = off + i * 16;
    latShift[i] = rf32(b);
    lonShift[i] = rf32(b + 4);
    // bytes b+8, b+12 are accuracy values — skip
  }

  return { sLat: sub.sLat, latInc: sub.latInc,
           eLon: sub.eLon, wLon: sub.wLon, lonInc: sub.lonInc,
           nLonNodes, latShift, lonShift };
}

export function loadOSTN15(osgbToEtrsPath, etrsToOsgbPath) {
  _osgbToEtrs = parseGrid(readFileSync(osgbToEtrsPath));
  _etrsToOsgb = parseGrid(readFileSync(etrsToOsgbPath));
}

export function isOSTN15Loaded() {
  return _osgbToEtrs !== null;
}

function interpolate(grid, lat_deg, lon_deg) {
  const latS  = lat_deg * 3600;   // arc-seconds, positive north
  const lonPW = -lon_deg * 3600;  // positive-west arc-seconds

  const r = (latS  - grid.sLat) / grid.latInc;
  // NTv2 columns run from E_LONG (easternmost, col 0) to W_LONG (westernmost, col nLon-1)
  const c = (lonPW - grid.eLon)  / grid.lonInc;

  if (r < 0 || r > grid.latShift.length / grid.nLonNodes - 1 ||
      c < 0 || c > grid.nLonNodes - 1) return null;

  const r0 = Math.min(Math.floor(r), Math.floor(grid.latShift.length / grid.nLonNodes) - 2);
  const c0 = Math.min(Math.floor(c), grid.nLonNodes - 2);
  const t  = r - r0;  // northward fraction
  const s  = c - c0;  // westward fraction (col increases westward)

  const nL = grid.nLonNodes;
  const ls = grid.latShift, lo = grid.lonShift;
  const sw = r0 * nL + c0,  se = sw + 1;
  const nw = sw + nL,       ne = nw + 1;

  return {
    latShift: (1-t)*((1-s)*ls[sw] + s*ls[se]) + t*((1-s)*ls[nw] + s*ls[ne]),
    lonShift: (1-t)*((1-s)*lo[sw] + s*lo[se]) + t*((1-s)*lo[nw] + s*lo[ne]),
  };
}

/** OSGB36 lat/lon → ETRS89/WGS84.  Returns null if outside grid. */
export function osgb36ToWgs84_ostn15(lat_deg, lon_deg) {
  const sh = interpolate(_osgbToEtrs, lat_deg, lon_deg);
  if (!sh) return null;
  return { lat: lat_deg + sh.latShift / 3600,
           lon: lon_deg - sh.lonShift / 3600 };
}

/** ETRS89/WGS84 lat/lon → OSGB36.  Returns null if outside grid. */
export function wgs84ToOsgb36_ostn15(lat_deg, lon_deg) {
  const sh = interpolate(_etrsToOsgb, lat_deg, lon_deg);
  if (!sh) return null;
  return { lat: lat_deg + sh.latShift / 3600,
           lon: lon_deg - sh.lonShift / 3600 };
}
