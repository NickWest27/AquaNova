# Search patterns

Built 2026-11-24 (owner request: one search pattern the WSKRs, the Aqua Nova and the Tern can all use). Part of the document set listed in `DEVELOPMENT.md`.
Code: `tablet/js/searchPattern.js` (pure generator), `searchDialog.js` (planner and assignment), `sim.js` (`orderWskr`, `patternPoints`, `plotSearch`), `bayops.js` and `tern.js` (Tern `search` mode). Test: `tools/searchpattern_test.py`. Screenshot: `tools/shots/search_dialog.png`.

## The generator
`build(spec, datum)` returns up to 80 waypoints `{lat, lon}`. It knows nothing about craft. Bearings are degrees true, distances nautical miles, turns to starboard unless `side: 'left'`.

| kind | what it is | numbers |
|---|---|---|
| `square` | Expanding square: legs 1,1,2,2,3,3 times the spacing, first leg on `brg`. Best when the datum is good. | `space`, `legs` (2 to 40) |
| `sector` | Triangles of side `radius`, each round turned 120/rounds degrees so the radials are evenly spaced. Ends on the datum. | `radius`, `rounds` (1 to 3) |
| `parallel` | Tracks along `brg`, `length` long, spread across `width`, never more than `space` apart. Centred on the datum. | `length`, `width`, `space` |
| `creeping` | Tracks across `brg`, `width` long, advancing `length` ahead along `brg`. First track passes the datum. | `length`, `width`, `space` |

Other helpers: `normalize` (holds every number inside its limits; unknown kind becomes square), `lengthNm`, `extentNm`, `clip(wps, ok)`, `hours`, `describe` (one plain line), `project`.

## How each craft follows it
- **WSKR** (`sim.orderWskr(n, 'search', { spec, datum })`): `w.pat = { lat, lon, k, t, spec }`. The points are built once and cached on `pat._w` (not saved; rebuilt from `spec`). Next point on arrival or after 30 game minutes, then back to escort with `wskr-search-done`. Points outside the Area of Operations are dropped. **The plain Search button still runs the old square** (0.45 nm legs, 14 legs); saves from before this have no `spec` and get the same.
- **Aqua Nova** (`sim.plotSearch(spec, datum)`): the points become the Route as fixes SP1, SP2, … and `plotRoute` steers round land. Points on land or outside the Area of Operations are dropped. Fails with `empty` or `blocked`.
- **Tern** (`orderTern({ kind: 'search', spec, datum, depth? })`): mode `search`, `sh.pat = { spec, lat, lon, k, wps }` (saved). Flies at 10 knots (`TERN_SEARCH_KT`, or the ordered speed), a waypoint counts within 0.05 nm. Refused when fewer than two points are open water, or when the pattern plus the trip home needs more hours than her battery and air give. At the end she holds station and says so (`shuttle-search-done`). On low battery or air she heads home like a trip. **Return to mission** resumes the pattern at the waypoint she had reached. Her report says "searching, waypoint 3 of 12". It still goes by radio: out of contact the order waits like any other.

## The planner
`openSearchDialog({ craft })`. Craft chips: Aqua Nova, each live WSKR, All WSKRs (two or more out), The Tern (when out). Datum: **Here**, **Lat / Long**, or **Place / Bearing** (same entry as Plot a course, `plotmath.resolveTarget`). Then the pattern chips and its numbers. The preview line (pattern, waypoint count, length) and Start search stay pinned at the bottom.
- Entry points: Navigation station (**Search pattern** button), WSKR page (**Pattern…**, for one WSKR or all), Communicator → Commands → Order the Tern to → **Run a search pattern …**.
- **All WSKRs** shares the work: squares and sectors start 360/n degrees apart; tracks share the width, each on its own strip (`splitSpec`).

## Not built / ideas
- No pattern drawn on the chart (the ship's Route shows; WSKR and Tern points do not).
- No time estimate in the preview.
- Datum drift (a missing vessel's position gets stale) and a probability of detection: not built. This is the next piece for the missing-vessel rescue (`MISSION_GENERATOR.md`).
- Moving the datum for a drifting casualty; a pattern for a mining colony.
