/**
 * Tests for the Redfearn series Transverse Mercator projection.
 *
 * Reference values come from Appendix C of:
 *   A Guide to Coordinate Systems in Great Britain (OS, v3.6)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { latLonToEN, enToLatLon } from '../src/transverse-mercator.js';
import { NATIONAL_GRID } from '../src/constants.js';

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

function assertClose(actual, expected, tol, label) {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${label}: expected ${expected}, got ${actual}, diff ${Math.abs(actual - expected).toFixed(6)} > tol ${tol}`
  );
}

// Helper: degrees-minutes-seconds → decimal degrees
function dms(d, m, s) { return d + m / 60 + s / 3600; }

describe('latLonToEN — forward projection', () => {
  it('OS Guide Appendix C worked example (tolerance 0.001 m)', () => {
    // From OS Guide v3.6, Appendix C:
    //   OSGB36 input:  φ = 52°39'27.2531"N,  λ = 1°43'4.5177"E
    //   Expected:      E = 651 409.903 m,     N = 313 177.270 m
    const phi = dms(52, 39, 27.2531) * RAD;
    const lam = dms(1,  43,  4.5177) * RAD;
    const { E, N } = latLonToEN(phi, lam, NATIONAL_GRID);

    assertClose(E, 651_409.903, 0.001, 'Easting (OS worked example)');
    assertClose(N, 313_177.270, 0.001, 'Northing (OS worked example)');
  });

  it('true origin (49°N, 2°W) maps to E=400000, N=-100000', () => {
    const phi = 49 * RAD;
    const lam = -2 * RAD;
    const { E, N } = latLonToEN(phi, lam, NATIONAL_GRID);

    assertClose(E, 400_000, 0.001, 'True origin easting');
    assertClose(N, -100_000, 0.001, 'True origin northing');
  });

  it('a point on the central meridian has E = 400000 (the false easting)', () => {
    // Any point with λ = λ₀ = -2° lies on the central meridian; its easting
    // equals the false easting E₀ = 400 000 (exactly, for λ = λ₀).
    const phi = 53 * RAD;
    const lam = -2 * RAD;   // central meridian
    const { E } = latLonToEN(phi, lam, NATIONAL_GRID);

    assertClose(E, 400_000, 0.001, 'Central meridian easting');
  });

  it('south-of-origin point has N < -100000', () => {
    const phi = 48 * RAD;   // south of true origin (49°N)
    const lam = -2 * RAD;
    const { N } = latLonToEN(phi, lam, NATIONAL_GRID);
    assert.ok(N < -100_000, `N should be < -100000, got ${N}`);
  });

  it('northern Scotland point is in range', () => {
    // Ben Nevis OSGB36 ≈ 56.798°N, 5.003°W → NN 1667 7130
    // NN square: E_base=200000, N_base=700000 → E≈216700, N≈771300
    const phi = 56.798 * RAD;
    const lam = -5.003 * RAD;
    const { E, N } = latLonToEN(phi, lam, NATIONAL_GRID);
    assertClose(E, 216_700, 500, 'Ben Nevis easting');
    assertClose(N, 771_300, 500, 'Ben Nevis northing');
  });
});

describe('enToLatLon — inverse projection', () => {
  it('inverts the OS Guide worked example (tolerance 1e-7 rad ≈ 0.6 mm)', () => {
    const E = 651_409.903;
    const N = 313_177.270;
    const { phi, lam } = enToLatLon(E, N, NATIONAL_GRID);

    const phiExpected = dms(52, 39, 27.2531) * RAD;
    const lamExpected = dms(1,  43,  4.5177) * RAD;

    assertClose(phi, phiExpected, 1e-7, 'φ inverse (OS worked example)');
    assertClose(lam, lamExpected, 1e-7, 'λ inverse (OS worked example)');
  });

  it('true-origin northing/easting inverts to 49°N, 2°W', () => {
    const { phi, lam } = enToLatLon(400_000, -100_000, NATIONAL_GRID);
    assertClose(phi, 49 * RAD, 1e-10, 'φ at true origin');
    assertClose(lam, -2 * RAD, 1e-10, 'λ at true origin');
  });
});

describe('latLonToEN / enToLatLon round-trip', () => {
  const testPoints = [
    { phi: 51.5076 * RAD, lam: -0.1278 * RAD, label: 'London (Trafalgar Sq)' },
    { phi: 55.9486 * RAD, lam: -3.1999 * RAD, label: 'Edinburgh Castle'      },
    { phi: 56.7969 * RAD, lam: -5.0035 * RAD, label: 'Ben Nevis'             },
    { phi: 49.9505 * RAD, lam: -6.3264 * RAD, label: 'Isles of Scilly'       },
    { phi: 58.6440 * RAD, lam: -3.0700 * RAD, label: 'Duncansby Head'        },
    { phi: 51.1789 * RAD, lam: -1.8262 * RAD, label: 'Stonehenge'            },
    { phi: 53.4808 * RAD, lam: -2.2426 * RAD, label: 'Manchester'            },
  ];

  for (const pt of testPoints) {
    it(`round-trip < 0.001 mm — ${pt.label}`, () => {
      const { E, N }    = latLonToEN(pt.phi, pt.lam, NATIONAL_GRID);
      const { phi, lam } = enToLatLon(E, N, NATIONAL_GRID);

      // Convert angular residual to metres: R × Δangle (R ≈ 6 371 000 m)
      const R = 6_371_000;
      assertClose(phi * R, pt.phi * R, 1e-3, `φ round-trip ${pt.label}`);
      assertClose(lam * R, pt.lam * R, 1e-3, `λ round-trip ${pt.label}`);
    });
  }

  it('easting round-trip < 0.001 m across multiple points', () => {
    const pts = [
      { phi: 51.5   * RAD, lam: -0.12 * RAD },
      { phi: 53.0   * RAD, lam: -1.50 * RAD },
      { phi: 57.5   * RAD, lam: -4.00 * RAD },
    ];
    for (const pt of pts) {
      const { E, N } = latLonToEN(pt.phi, pt.lam, NATIONAL_GRID);
      const back = enToLatLon(E, N, NATIONAL_GRID);
      const { E: E2, N: N2 } = latLonToEN(back.phi, back.lam, NATIONAL_GRID);
      assertClose(E2, E, 1e-3, 'E double round-trip');
      assertClose(N2, N, 1e-3, 'N double round-trip');
    }
  });
});
