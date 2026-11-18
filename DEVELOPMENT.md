# Aqua Nova — Development Notes

Last updated: 2026-11-17

## Repos
- **`NickWest27/AquaNova`** (this repo): the web game. Source of truth.
- `NickWest27/aquaNovaPart1`: older web snapshot (Nov 2025). Archive only.
- `NickWest27/AquaNovaPico`: PICO-8 side project (V1-V3). Parked because of size limits. Design reference only.

## Decision log
- 2026-11-17: Continue the web version. PICO-8 version parked.
- Target devices include iPad (Safari, touch, 4:3).
- Plan: TypeScript + Vite. HTML/CSS for bridge screens, canvas for nav/sonar.

## Known problems (from a review of Sept 2025 code; re-verify against current code)
1. Scaling is applied three times (displayManager `--scale`, stage transform, per-rule `calc(Npx * var(--scale))`).
2. `cropTolerant` mode crops up to 10%. The stage is 16:9; an iPad is 4:3.
3. The nav canvas is sized with `getBoundingClientRect()` under transforms, so the size is wrong.
4. Display tilt is hand-tuned CSS rotation. Use corner-point `matrix3d` from data instead.
5. Text is too small on iPad (canvas 11-12px, soft keys about 6pt). Add tap-to-expand.
6. Controls are keyboard-only (Tab, C, Enter, hover). Add touch equivalents.
7. Multi-page navigation reloads and re-initializes everything on each screen change.
8. The animation loop calls `JSON.stringify` every frame. Draw code logs to the console.
9. Possible mojibake in labels (UTF-8 read as Windows-1252).
10. The communicator checks crew id `helm`, but the state has no `helm` contact. Verify `contacts.json`.
11. No simulation loop. Seafloor data is not implemented (plan: seeded procedural terrain plus small tiles).

## Keep (port forward)
`state.js` (observer, snapshots), logbook save/revert, MFD page pattern, keyboard unit, communicator dialogue tree, CustomEvent mission hooks.

## Next steps
1. Re-review this repo against the problems above.
2. Build an iPad prototype: fixed 4:3 stage, frame with cutouts, corner-point display mapping, tap-to-expand.
