/**
 * Conversion between geodetic coordinates (φ, λ, h) and
 * 3-D Cartesian ECEF coordinates (X, Y, Z) for an arbitrary ellipsoid.
 *
 * Formulas from OS Guide to Coordinate Systems in Great Britain, Section C.
 */

/**
 * Convert geodetic (φ, λ, h) to Cartesian ECEF (X, Y, Z).
 *
 * @param {number} phi  Latitude  in radians
 * @param {number} lam  Longitude in radians
 * @param {number} h    Ellipsoidal height in metres (default 0)
 * @param {{a:number, b:number}} ellipsoid
 * @returns {{X:number, Y:number, Z:number}}
 */
export function geodeticToCartesian(phi, lam, h = 0, ellipsoid) {
  const { a, b } = ellipsoid;
  const e2 = 1 - (b * b) / (a * a);

  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const N = a / Math.sqrt(1 - e2 * sinPhi * sinPhi);

  return {
    X: (N + h) * cosPhi * Math.cos(lam),
    Y: (N + h) * cosPhi * Math.sin(lam),
    Z: (N * (1 - e2) + h) * sinPhi,
  };
}

/**
 * Convert Cartesian ECEF (X, Y, Z) to geodetic (φ, λ, h).
 * Uses Bowring's iterative method — converges in ≤ 5 iterations for terrestrial points.
 *
 * @param {number} X
 * @param {number} Y
 * @param {number} Z
 * @param {{a:number, b:number}} ellipsoid
 * @returns {{phi:number, lam:number, h:number}}  angles in radians, height in metres
 */
export function cartesianToGeodetic(X, Y, Z, ellipsoid) {
  const { a, b } = ellipsoid;
  const e2  = 1 - (b * b) / (a * a);   // first eccentricity squared

  const p   = Math.sqrt(X * X + Y * Y);
  const lam = Math.atan2(Y, X);

  // Initial estimate via Bowring's formula (avoids slow convergence near poles)
  let phi = Math.atan2(Z, p * (1 - e2));

  for (let i = 0; i < 10; i++) {
    const sinPhi = Math.sin(phi);
    const N = a / Math.sqrt(1 - e2 * sinPhi * sinPhi);
    const phiNext = Math.atan2(Z + e2 * N * sinPhi, p);
    if (Math.abs(phiNext - phi) < 1e-12) {
      phi = phiNext;
      break;
    }
    phi = phiNext;
  }

  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const N = a / Math.sqrt(1 - e2 * sinPhi * sinPhi);

  // Choose stable formula based on latitude
  const h = Math.abs(cosPhi) > 1e-10
    ? p / cosPhi - N
    : Z / sinPhi - N * (1 - e2);

  return { phi, lam, h };
}
