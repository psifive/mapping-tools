# os-mapping

A zero-dependency Node.js library for converting between the coordinate systems used on Ordnance Survey maps of Great Britain:

- **Grid references** — e.g. `TQ 30015 80069`
- **Easting / Northing** — National Grid metric coordinates (OSGB36)
- **Latitude / Longitude** — WGS84 decimal degrees (GPS / web maps)

Formulas are taken directly from the appendices of the official OS publication [*A Guide to Coordinate Systems in Great Britain*](https://www.ordnancesurvey.co.uk/documents/resources/guide-coordinate-systems-great-britain.pdf).

---

## Accuracy

| Operation | Method | Accuracy |
|---|---|---|
| Grid reference ↔ Easting/Northing | String parsing (exact integer arithmetic) | Exact |
| OSGB36 lat/lon ↔ Easting/Northing | Redfearn series Transverse Mercator | < 0.001 m |
| OSGB36 ↔ WGS84 | 7-parameter Helmert transform | ±3.5 m (95 %) |
| **WGS84 lat/lon ↔ Easting/Northing** | **Helmert + Redfearn** | **±3.5 m (95 %)** |
| WGS84 lat/lon ↔ Easting/Northing | OSTN15 grid + Redfearn *(optional)* | < 0.1 m |

The Redfearn projection matches the OS Guide Appendix C worked example to < 1 mm. The dominant source of error for GPS coordinates is the Helmert datum shift, which is a best-fit approximation for the whole of Great Britain.

For **sub-metre accuracy**, load the official [OSTN15 shift grid](https://www.ordnancesurvey.co.uk/documents/resources/ostn15-coords-transformation.pdf) with [`loadOSTN15`](#loadostn15osgbtoetrspath-etrstoosgbpath--void). Once loaded, all datum-shift functions use it automatically (with a transparent Helmert fallback for points outside the grid). See [Sub-metre accuracy with OSTN15](#sub-metre-accuracy-with-ostn15) below.

---

## Requirements

Node.js 18 or later (uses ES modules and the built-in `node:test` runner).

No `npm install` needed — the library and its tests have zero runtime or development dependencies.

---

## Installation

Copy the package into your project, or reference it directly from GitHub:

```js
// From a local copy
import { wgs84ToGridRef } from './mapping-tools/index.js';

// Or with npm link / workspace
import { wgs84ToGridRef } from 'os-mapping';
```

---

## Quick start

```js
import {
  wgs84ToGridRef,
  gridRefToWgs84,
  wgs84ToEN,
  enToWgs84,
  parseGridRef,
  formatGridRef,
} from './index.js';

// WGS84 (GPS) → grid reference
wgs84ToGridRef(51.5007, -0.1246)        // "TQ 302 797"
wgs84ToGridRef(51.5007, -0.1246, 5)     // "TQ 30293 79739"  (1 m precision)

// Grid reference → WGS84
gridRefToWgs84('TQ 30015 80069')        // { lat: 51.5007, lon: -0.1246 }
gridRefToWgs84('NT 252 734')            // { lat: 55.9486, lon: -3.1982 }

// WGS84 → easting / northing
wgs84ToEN(51.5007, -0.1246)             // { easting: 530293, northing: 179739 }

// Easting / northing → WGS84
enToWgs84(530000, 180000)               // { lat: 51.4993, lon: -0.1268 }

// Parse a grid reference string
parseGridRef('SU 386 137')
// { easting: 438600, northing: 113700, precision: 100 }

// Format easting/northing as a grid reference
formatGridRef(438600, 113700, 3)        // "SU 386 137"
formatGridRef(530015, 180069, 5)        // "TQ 30015 80069"
```

---

## Full API

### High-level conversions

These are the functions most projects will use. They handle the full conversion chain including the WGS84 ↔ OSGB36 datum shift.

#### `wgs84ToGridRef(lat, lon, digits = 3) → string`

Convert a WGS84 GPS coordinate to a National Grid reference string.

- `lat`, `lon` — decimal degrees (WGS84). Longitude is negative west of Greenwich.
- `digits` — digits per axis: `1` (10 km), `2` (1 km), `3` (100 m, default), `4` (10 m), `5` (1 m).
- The result identifies the **SW corner** of the grid cell at the given precision.

```js
wgs84ToGridRef(55.9482, -3.1981)        // "NT 251 734"   — Edinburgh Castle
wgs84ToGridRef(56.7969, -5.0035)        // "NN 166 713"   — Ben Nevis
wgs84ToGridRef(51.1789, -1.8262)        // "SU 122 422"   — Stonehenge
wgs84ToGridRef(51.5007, -0.1246, 5)     // "TQ 30293 79739"
```

#### `gridRefToWgs84(gridRef) → { lat, lon }`

Convert a National Grid reference string to WGS84 decimal degrees. Accepts any precision (2–10 digits total) with or without spaces. Returns the WGS84 coordinates of the **SW corner** of the grid cell (consistent with `parseGridRef`).

```js
gridRefToWgs84('TQ 30015 80069')   // { lat: 51.5006, lon: -0.1246 }
gridRefToWgs84('NT252734')         // { lat: 55.9484, lon: -3.1985 }
gridRefToWgs84('SU 386 137')       // { lat: 50.9296, lon: -1.4408 }
```

#### `wgs84ToEN(lat, lon) → { easting, northing }`

Convert WGS84 decimal degrees to National Grid easting/northing in metres.

```js
wgs84ToEN(51.5007, -0.1246)   // { easting: 530293, northing: 179739 }
```

#### `enToWgs84(easting, northing) → { lat, lon }`

Convert National Grid easting/northing to WGS84 decimal degrees.

```js
enToWgs84(325163, 673427)   // { lat: 55.9482, lon: -3.1981 }
```

---

### Grid reference string utilities

These work with text representations of grid references and involve no datum shift or floating-point maths.

#### `parseGridRef(gridRef) → { easting, northing, precision }`

Parse any standard OS grid reference string into metric easting/northing. The `precision` field is the cell size in metres.

| Input | Easting | Northing | Precision |
|---|---|---|---|
| `"SU 4 1"` | 440 000 | 110 000 | 10 000 m |
| `"SU 43 13"` | 443 000 | 113 000 | 1 000 m |
| `"SU 386 137"` | 438 600 | 113 700 | 100 m |
| `"SU 3862 1370"` | 438 620 | 113 700 | 10 m |
| `"SU 38600 13700"` | 438 600 | 113 700 | 1 m |

Accepts upper or lower case, with or without spaces between the prefix and digits.

```js
parseGridRef('TG 51409 13177')
// { easting: 651409, northing: 313177, precision: 1 }
```

#### `formatGridRef(easting, northing, digits = 3) → string`

Format easting/northing as a grid reference string. `digits` is the number of digits per axis (1–5). The output always represents the SW corner of the containing grid cell at that precision (i.e. values are truncated, not rounded).

```js
formatGridRef(651409, 313177, 5)   // "TG 51409 13177"
formatGridRef(651409, 313177, 3)   // "TG 514 131"
formatGridRef(530015, 180069, 2)   // "TQ 30 80"
```

#### `prefixToEN(prefix) → { easting, northing }`

Returns the easting/northing of the **SW corner** of a 100 km grid square identified by its two-letter prefix.

```js
prefixToEN('TQ')   // { easting: 500000, northing: 100000 }
prefixToEN('SV')   // { easting: 0,      northing: 0      }  — grid false origin
prefixToEN('NT')   // { easting: 300000, northing: 600000 }
```

#### `enToPrefix(easting, northing) → string`

Returns the two-letter prefix of the 100 km square containing the given easting/northing.

```js
enToPrefix(530000, 180000)   // "TQ"
enToPrefix(216670, 771300)   // "NN"
```

---

### Mid-level datum shift

Use these when you already have OSGB36 latitude/longitude (e.g. from old OS mapping data) and need to convert the datum without going through the National Grid projection.

#### `osgb36ToWgs84(lat, lon, h = 0) → { lat, lon }`
#### `wgs84ToOsgb36(lat, lon, h = 0) → { lat, lon }`

Both accept an optional ellipsoidal height `h` in metres (default 0). All angles are decimal degrees.

```js
// A point given in OSGB36 degrees → WGS84
osgb36ToWgs84(52.6576, 1.7179)
// { lat: 52.6581, lon: 1.7151 }  — shifted by ~5" in each axis
```

---

### Sub-metre accuracy with OSTN15

By default the library uses a 7-parameter Helmert transform for the WGS84 ↔ OSGB36 datum shift, accurate to ±3.5 m. For sub-0.1 m accuracy, load the official Ordnance Survey **OSTN15** NTv2 shift grids. Once loaded, every datum-shift function (`wgs84ToOsgb36`, `osgb36ToWgs84`, and everything built on them — `wgs84ToEN`, `enToWgs84`, `gridRefToWgs84`, `wgs84ToGridRef`) uses the grid automatically, falling back to Helmert for any point outside grid coverage.

The grid files are **not bundled** (~30 MB). Download `OSTN15_NTv2_OSGBtoETRS.gsb` and `OSTN15_NTv2_ETRStoOSGB.gsb` from the [OS OSTN15 page](https://www.ordnancesurvey.co.uk/products/os-net/for-developers) and supply their paths.

#### `loadOSTN15(osgbToEtrsPath, etrsToOsgbPath) → void`

Loads and parses the two OSTN15 NTv2 (`.gsb`) grid files. Call once at startup, before any conversion. Node.js only (reads from the filesystem).

- `osgbToEtrsPath` — path to `OSTN15_NTv2_OSGBtoETRS.gsb`
- `etrsToOsgbPath` — path to `OSTN15_NTv2_ETRStoOSGB.gsb`

```js
import { loadOSTN15, wgs84ToEN } from './index.js';

// Helmert (±3.5 m) until the grids are loaded:
wgs84ToEN(52.658007833, 1.716073973);
// { easting: 651435.917, northing: 313166.888 }

// Load the OSTN15 grids once:
loadOSTN15(
  './data/OSTN15_NTv2_OSGBtoETRS.gsb',
  './data/OSTN15_NTv2_ETRStoOSGB.gsb',
);

// Now sub-0.1 m — matches the official OS worked example:
wgs84ToEN(52.658007833, 1.716073973);
// { easting: 651409.804, northing: 313177.450 }
```

---

### Low-level OSGB36 projection

Use these when you have OSGB36 lat/lon coordinates and want National Grid E/N without any datum shift — e.g. when working directly from old OS data that is already in OSGB36. Accuracy is < 0.001 m.

#### `osgb36ToEN(lat, lon) → { easting, northing }`
#### `enToOsgb36(easting, northing) → { lat, lon }`

```js
// OS Guide Appendix C worked example:
osgb36ToEN(52.6576, 1.7179)
// { easting: 651409.903, northing: 313177.270 }
```

---

## How it works

The library implements a three-step conversion chain. Each step is independent and can be used on its own.

```
WGS84 lat/lon  ──(1)──►  OSGB36 lat/lon  ──(2)──►  Easting/Northing  ──(3)──►  Grid reference
               ◄──────                   ◄──────                      ◄──────
```

### Step 1 — Datum shift: WGS84 ↔ OSGB36

GPS and web mapping services use the **WGS84** datum, while OS maps use the **OSGB36** datum. These are different models of the Earth's shape (different reference ellipsoids) with different origins, and their coordinates differ by several metres across Great Britain.

The library converts between them using a **7-parameter Helmert similarity transformation** (also called a Bursa-Wolf transform), applied to 3D Cartesian (X, Y, Z) coordinates centred on the Earth's centre of mass:

```
[X_WGS84]   [tx]               [X_OSGB36]
[Y_WGS84] = [ty] + (1 + s) × R [Y_OSGB36]
[Z_WGS84]   [tz]               [Z_OSGB36]
```

where R is a small-angle rotation matrix and s is a scale factor in parts per million. The seven published parameters are:

| Parameter | Value | Units |
|---|---|---|
| tx | +446.448 | metres |
| ty | −125.157 | metres |
| tz | +542.060 | metres |
| rx | +0.1502 | arc-seconds |
| ry | +0.2470 | arc-seconds |
| rz | +0.8421 | arc-seconds |
| s | −20.4894 | ppm |

The geodetic ↔ Cartesian conversion uses Bowring's iterative method and converges in fewer than five iterations for all UK locations.

### Step 2 — Projection: OSGB36 lat/lon ↔ National Grid E/N

The National Grid is a **Transverse Mercator** projection of the Airy 1830 ellipsoid. The library implements the full **Redfearn series** (Appendix C of the OS Guide), accurate to < 0.001 m anywhere on the British National Grid.

Key projection constants:

| Parameter | Value |
|---|---|
| Ellipsoid | Airy 1830 (a = 6 377 563.396 m) |
| Scale factor F₀ | 0.9996012717 |
| True origin | 49°N, 2°W |
| False easting E₀ | 400 000 m |
| False northing N₀ | −100 000 m |

The false origin is placed south-west of the Isles of Scilly so that all National Grid coordinates across Great Britain are positive.

### Step 3 — Grid reference strings ↔ Easting/Northing

A grid reference like `TQ 30015 80069` consists of:

- A **two-letter prefix** identifying a 100 km × 100 km square (e.g. `TQ` covers Greater London)
- **Numeric digits** giving the position within that square at the stated precision

The 25-letter alphabet used is A–Z omitting I. The letters are laid out in a 5×5 grid from NW to SE, where the first letter identifies a 500 km square and the second identifies a 100 km square within it:

```
500 km squares:   100 km squares (within each):
  A B C D E         A B C D E
  F G H J K         F G H J K
  L M N O P         L M N O P
  Q R S T U         Q R S T U
  V W X Y Z         V W X Y Z
```

`SV` is at (E=0, N=0) — the false origin of the whole grid.

---

## Running the tests

```bash
node --test test/*.test.js
```

87 tests covering all functions, including the OS Guide Appendix C worked example verified to < 0.001 m.

---

## Source reference

All formulas are from:

> *A Guide to Coordinate Systems in Great Britain*, v3.6
> Ordnance Survey, 2015
> https://www.ordnancesurvey.co.uk/documents/resources/guide-coordinate-systems-great-britain.pdf

Specifically:
- **Appendix B** — ellipsoid parameters and Helmert transformation parameters
- **Appendix C** — Redfearn series Transverse Mercator projection (forward and inverse)

---

## License

MIT
