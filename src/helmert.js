/**
 * Helmert 7-parameter similarity transformation between two Cartesian ECEF
 * coordinate systems (e.g. OSGB36 ↔ WGS84).
 *
 * Uses the Position Vector (Bursa-Wolf) convention as specified in:
 *   OS Guide to Coordinate Systems in Great Britain, Section C.
 *
 * Rotation matrix for small angles (Position Vector convention):
 *
 *   ⎡  1    rz  -ry ⎤
 *   ⎢ -rz    1   rx ⎥
 *   ⎣  ry  -rx    1 ⎦
 */

const ARC_SEC_TO_RAD = Math.PI / (180 * 3600);

/**
 * Apply a 7-parameter Helmert transformation to Cartesian ECEF coordinates.
 *
 * @param {number} X
 * @param {number} Y
 * @param {number} Z
 * @param {{tx:number, ty:number, tz:number,
 *          rx:number, ry:number, rz:number, s:number}} params
 *   tx/ty/tz in metres; rx/ry/rz in arc-seconds; s in ppm.
 * @returns {{X:number, Y:number, Z:number}}
 */
export function applyHelmert(X, Y, Z, params) {
  const { tx, ty, tz } = params;
  const rx = params.rx * ARC_SEC_TO_RAD;
  const ry = params.ry * ARC_SEC_TO_RAD;
  const rz = params.rz * ARC_SEC_TO_RAD;
  const sf = 1 + params.s * 1e-6;           // scale factor

  return {
    X: tx + sf * (      X + rz * Y - ry * Z),
    Y: ty + sf * (-rz * X +     Y  + rx * Z),
    Z: tz + sf * ( ry * X - rx * Y +      Z),
  };
}

/**
 * Invert Helmert parameters by negating all seven values.
 * This is an approximation valid for the small parameters involved in
 * geodetic datum transformations (error < 1 µm for OSGB36 ↔ WGS84).
 *
 * @param {{tx,ty,tz,rx,ry,rz,s}} params
 * @returns {{tx,ty,tz,rx,ry,rz,s}}
 */
export function invertHelmert(params) {
  return {
    tx: -params.tx,
    ty: -params.ty,
    tz: -params.tz,
    rx: -params.rx,
    ry: -params.ry,
    rz: -params.rz,
    s:  -params.s,
  };
}
