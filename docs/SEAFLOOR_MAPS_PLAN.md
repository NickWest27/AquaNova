# Sea-floor maps

Status: **built 2026-11-18, extended 2026-11-19 and 2026-11-20** (now the whole 30–40°N strip out to 0°W, fine detail box round Hudson Canyon, Area of Operations limit). Data pipeline, runtime and tests are in the repo.

## Owner decisions
- **Real place**: Woods Hole and the Atlantic shelf out to Hudson Canyon and beyond, from the owner's own GEBCO contour files.
- **Hitting the bottom**: **real damage**.
- **Detail** (2026-11-18): rough contours everywhere; finer contours only where the ship or a WSKR has looked (fog of war).
- **Deep trenches matter** (2026-11-19): the main game locations are deep, so the map must cover them and show finer detail there.
- **Import as much as possible, and mark the chart limits as a no-transgression zone** (2026-11-20). The story calls the limits the **Area of Operations** (political limits on a very advanced ship; see `STORY_BIBLE.md`).

## Map now
- **Bounds: 30.0°N to 42.4°N, 74.63°W to 0.0°W.** Tile and chart origin stays at the north-west corner (W -74.63, N 42.4) so old saves line up.
- **Two depth grids** (finest grid containing the point answers `depthAt`):
  - **Detail grid** `depth.bin`: 0.005° cells (about 0.5 km), box **74.63°W to 69.0°W, 37.0°N to 42.4°N** (Woods Hole, the shelf and Hudson Canyon). Uint16, decimetres, 65535 = NODATA.
  - **Wide grid** `depth_wide.bin`: 0.02° cells over the whole map (3732 x 621), from the 100, 500 and 1000 m lines, points thinned to a third of a cell.
- **NODATA block**: north of 40°N and east of 70°W has no tile. `depthAt` gives null there; it is outside the Area of Operations.
- Source tiles used (all 30–40°N, every 10° from 80°W to 0°W) plus `n45s40w-75e-70` (40–45°N, 75–70°W). Only the 100, 500 and 1000 m files are read east of 69°W; the 10 m files are read only inside the detail box.
- **Missing tiles** (the owner can export from QGIS): **40–45°N, 70–65°W** (`n45s40w-70e-65`, Nantucket Shoals and the Gulf of Maine) and **40–45°N, 50–40°W** (for the Titanic Wreck Site at 41.73°N, 49.95°W). The Halcyon call (40.3°N, 69.5°W) falls in the first gap. The folder also holds `gebco_2025_n40.0_s30.0_w-50.0_e-40.0_cm.png` and a relief png: images, not used.
- Not imported: anything west of 74.63°W or south of 30°N, and Atlantic trenches such as Puerto Rico.

## Files (`tools/make_seafloor.py --src <bathymetry folder>`, needs numpy and scipy, about 70 s)
Defaults: `--west -74.63 --east 0 --south 30 --north 42.4 --detail -74.63,-69.0,37.0,42.4 --cell 0.005 --wide 0.02 --tile 0.5 --simplify 0.004`.
- `depth.bin` 2379 KB, `depth_wide.bin` 4526 KB, `rough.json` 2409 KB (coast, 100 m and 500 m lines), `fine/<ix>_<iy>.json` 121 tiles, 3617 KB, largest 182 KB (10 m lines inside the detail box; 100 m lines shallower than 500 m outside it), `index.json`, `pois.json`.
- **Total about 12.9 MB** (3.1 MB at first, 8.4 MB at 60°W). Offline cache (`sw.js`) 217 files, about 14.7 MB.
- **Rough lines outside the detail box are simplified** (Douglas-Peucker, 0.004° about 0.25 nm) and tiny loops dropped; without that `rough.json` was 12.9 MB.
- **Outside the detail box deep ocean shows only the 500 m lines** (the 100 m deep lines cost about 4.9 MB). The Mid-Atlantic Ridge and the Azores show at 500 m spacing.

## Runtime (`tablet/js/seafloor.js`, `nd.js`)
- `depthAt(lat, lon)`: bilinear; NODATA in any corner gives null; `inside` = depthAt not null; `inDetail`.
- **Fog of war** chart: one byte per 0.01° cell (**7463 x 1240 cells, about 9.3 MB bitmap in memory**), saved run-length in `navigation.charted`. **New strings start with `w<nx>` (now `w7463`)**; old strings with no prefix are treated as 463 columns wide and remapped.
- Fine tiles load on demand (40 kept in memory). **Revealing detail does not change file size**; only the saved chart string grows.
- **Contour thinning** (`nd.js`): every level above -200 m, then every 20 m to -1000, every 50 m to -3500, every 100 m below.
- iPad check (headless Chrome, not a real iPad): draws take about 2–4 ms at 8, 64 and 256 nm; JS heap about 33 MB.

## Area of Operations (`nd.js drawLimit`, `sim.js`, `app.js`)
Everything off the charted area (`!seafloor.inside`) is the no-transgression zone: red hatch plus a dashed limit line on every chart (main screen, craft and WSKR pages), sampled on a 12 px grid. Helm warns when the point `max(6 nm, 2 minutes of travel)` ahead is outside (once per approach, bump event `ao-near`); at the line the ship stops with no damage (`edge`). `plotmath.js` refuses points outside. ARIA topic "our Area of Operations". Test `tools/ao_test.py`.

## Game rules on the floor
Keel clearance 8 m. The ship cannot dive below floor - 8 m. Shoals stop the ship and cost hull: **2% + 1.5% per knot**, one hit per 30 game seconds. A 2 nm harbour zone round the dock skips the stop-and-damage checks (since 2026-11-22 terrain protection still holds a 3 m margin there: `CODE_NOTES.md`). The dock repairs about 6% an hour.

## POIs
Tablet overrides in `data/seafloor/pois.json`: **Deep Trench Alpha = Hudson Canyon (39.40°N, 72.20°W, about 750 m)**, **Canyon Head (39.62°N, 72.45°W)**, Vineyard Ledge. The desktop `locations.json` is untouched. Sea Trials dive depth is 30 m. Titanic (41.73°N, 49.95°W) is outside the Area of Operations until its tile exists. More places: `WORLD_POPULATION.md`.

## Findings
- Near Woods Hole the water is shallow (dock 9 m, 60 m at 7 nm). Deep water is past the shelf break, about 130 nm south. At 14 kt Woods Hole to Hudson Canyon is about 9 hours; Woods Hole to the Azores is about 3 days (use sleep warp or super cruise).
- Depth between contours is interpolated, so deep, coarse areas are smooth guesses.

## Tests
`tools/seafloor_test.py`, `tools/seafloor_wide_test.py` (two grids, bounds 74.63W to 0W, abyssal depth, Azores land, Portugal coast, NODATA block, no seam at 37°N, fine tile at Deep Trench Alpha, old chart string aligns, new string has its width, draw times) and `tools/ao_test.py`.

## Not done yet
- The two missing tiles above; echo-sounder strip on the Sensors station; mission triggers such as `area_mapped`.
- A finer detail box round other deep sites (for example the Mid-Atlantic Ridge) if the story goes there; the 10 m files for those tiles are in the owner's folder and would be staged on request.
- Missions that redraw the Area of Operations.
- The sandbox has no network, so only the owner can export more GEBCO tiles; the converter warns about gaps.
