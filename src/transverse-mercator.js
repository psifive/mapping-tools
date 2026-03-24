/**
 * Redfearn series Transverse Mercator projection.
 *
 * Converts between geodetic coordinates (φ, λ) on an ellipsoid and
 * Transverse Mercator plane coordinates (E, N).
 *
 * Formulas from Appendix C of:
 *   A Guide to Coordinate Systems in Great Britain (OS, v3.6)
 *
 * Accuracy: better than 0.01 mm anywhere on the National Grid.
 */

/**
 * Compute the meridional arc M from true origin φ₀ to latitude φ.
 * Uses the four-term Redfearn series (OS Guide, eq. C1).
 *
 * @param {number} phi   Target latitude in radians
 * @param {number} phi0  True origin latitude in radians
 * @param {number} b     Semi-minor axis (m)
 * @param {number} F0    Scale factor on central meridian
 * @param {number} n     Third flattening = (a−b)/(a+b)
 * @returns {number} Meridional arc in metres
 */
function meridionalArc(phi, phi0, b, F0, n) {
  const n2 = n * n;
  const n3 = n2 * n;

  const A0 =  1  +  n  + (5/4)*n2 + (5/4)*n3;
  const A2 =  3*n + 3*n2 + (21/8)*n3;
  const A4 =  (15/8)*n2 + (15/8)*n3;
  const A6 =  (35/24)*n3;

  return b * F0 * (
      A0 * (phi - phi0)
    - A2 * Math.sin(  phi - phi0) * Math.cos(  phi + phi0)
    + A4 * Math.sin(2*(phi - phi0)) * Math.cos(2*(phi + phi0))
    - A6 * Math.sin(3*(phi - phi0)) * Math.cos(3*(phi + phi0))
  );
}

/**
 * Convert OSGB36 geodetic coordinates (φ, λ) to National Grid (E, N).
 * Implements the OS Guide Appendix C forward projection (equations C1–C5).
 *
 * @param {number} phi  Latitude  in radians (OSGB36)
 * @param {number} lam  Longitude in radians (OSGB36)
 * @param {{a:number, b:number, F0:number,
 *          phi0:number, lam0:number, N0:number, E0:number}} proj
 * @returns {{E:number, N:number}} Easting and Northing in metres
 */
export function latLonToEN(phi, lam, proj) {
  const { a, b, F0, phi0, lam0, N0, E0 } = proj;

  const n   = (a - b) / (a + b);
  const e2  = 1 - (b * b) / (a * a);

  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const tanPhi = Math.tan(phi);
  const tan2   = tanPhi * tanPhi;
  const tan4   = tan2 * tan2;
  const cos3   = cosPhi * cosPhi * cosPhi;
  const cos5   = cos3 * cosPhi * cosPhi;

  const nu  = a * F0 / Math.sqrt(1 - e2 * sinPhi * sinPhi);
  const rho = a * F0 * (1 - e2) / Math.pow(1 - e2 * sinPhi * sinPhi, 1.5);
  const eta2 = nu / rho - 1;

  const M = meridionalArc(phi, phi0, b, F0, n);

  // OS Guide coefficients I–VI
  const I    = M + N0;
  const II   = (nu / 2)   * sinPhi * cosPhi;
  const III  = (nu / 24)  * sinPhi * cos3   * (5 - tan2 + 9 * eta2);
  const IIIA = (nu / 720) * sinPhi * cos5   * (61 - 58 * tan2 + tan4);
  const IV   = nu * cosPhi;
  const V    = (nu / 6)   * cos3   * (nu / rho - tan2);
  const VI   = (nu / 120) * cos5   * (5 - 18 * tan2 + tan4 + 14 * eta2 - 58 * tan2 * eta2);

  const dL = lam - lam0;
  const dL2 = dL * dL;
  const dL3 = dL2 * dL;
  const dL4 = dL2 * dL2;
  const dL5 = dL4 * dL;
  const dL6 = dL4 * dL2;

  const N_out = I  + II * dL2  + III * dL4  + IIIA * dL6;
  const E_out = E0 + IV * dL   + V   * dL3  + VI   * dL5;

  return { E: E_out, N: N_out };
}

/**
 * Convert National Grid (E, N) to OSGB36 geodetic coordinates (φ, λ).
 * Implements the OS Guide Appendix C inverse projection (equations C6–C10).
 *
 * @param {number} E    Easting  in metres
 * @param {number} N    Northing in metres
 * @param {{a:number, b:number, F0:number,
 *          phi0:number, lam0:number, N0:number, E0:number}} proj
 * @returns {{phi:number, lam:number}} Latitude and longitude in radians (OSGB36)
 */
export function enToLatLon(E, N, proj) {
  const { a, b, F0, phi0, lam0, N0, E0 } = proj;

  const n   = (a - b) / (a + b);
  const e2  = 1 - (b * b) / (a * a);

  // Step 1 — iterate to find φ' such that M(φ') = N − N0
  let phi = phi0 + (N - N0) / (a * F0);
  for (let i = 0; i < 100; i++) {
    const M    = meridionalArc(phi, phi0, b, F0, n);
    const dphi = (N - N0 - M) / (a * F0);
    phi += dphi;
    if (Math.abs(dphi) < 1e-12) break;
  }

  // Step 2 — compute radii and ancillary quantities at converged φ'
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const tanPhi = Math.tan(phi);
  const secPhi = 1 / cosPhi;
  const tan2   = tanPhi * tanPhi;
  const tan4   = tan2 * tan2;
  const tan6   = tan4 * tan2;

  const nu  = a * F0 / Math.sqrt(1 - e2 * sinPhi * sinPhi);
  const rho = a * F0 * (1 - e2) / Math.pow(1 - e2 * sinPhi * sinPhi, 1.5);
  const eta2 = nu / rho - 1;

  const nu3  = nu * nu * nu;
  const nu5  = nu3 * nu * nu;
  const nu7  = nu5 * nu * nu;

  // Step 3 — OS Guide coefficients VII–XIIA
  const VII  = tanPhi / (2  * rho * nu);
  const VIII = tanPhi / (24 * rho * nu3) * (5 + 3 * tan2 + eta2 - 9 * tan2 * eta2);
  const IX   = tanPhi / (720 * rho * nu5) * (61 + 90 * tan2 + 45 * tan4);
  const X    = secPhi / nu;
  const XI   = secPhi / (6   * nu3) * (nu / rho + 2 * tan2);
  const XII  = secPhi / (120 * nu5) * (5 + 28 * tan2 + 24 * tan4);
  const XIIA = secPhi / (5040 * nu7) * (61 + 662 * tan2 + 1320 * tan4 + 720 * tan6);

  const dE  = E - E0;
  const dE2 = dE * dE;
  const dE3 = dE2 * dE;
  const dE4 = dE2 * dE2;
  const dE5 = dE4 * dE;
  const dE6 = dE4 * dE2;
  const dE7 = dE6 * dE;

  const phiOut = phi  - VII * dE2 + VIII * dE4 - IX   * dE6;
  const lamOut = lam0 +  X  * dE  -  XI  * dE3 + XII  * dE5 - XIIA * dE7;

  return { phi: phiOut, lam: lamOut };
}
