# Retro skin: 64-color master palette (owner, 2026-11-24)

For the `tablet` branch (90s retro look, 4:3, 320x240 integer-scaled, 64 colors). Stored in code as `data/palette.json` on `tablet` (slot index = array index). Every retro art asset may use only these colors. `main` (desktop 16:9, 1920x1080) is not limited by it.

**00-15 Anchors (PICO-8 style: outlines, slate, cyan, amber):** #0B0F1A #162033 #1D2B53 #263B59 #354F6B #4A6582 #647E99 #829BB3 #A6BCCF #D8E6F2 #FFFDF5 #FFEC27 #FFA300 #29ADFF #008751 #FF004D

**16-31 Deep-sea blues, teals, sonar and window ramps:** #071324 #0C213D #113259 #174575 #1E5B91 #2673AD #2F8EC9 #3DA8E3 #59C3F7 #87DCFF | teals #0E3B4A #145466 #1C7082 #258E9E #36B0BA #5CD1D4

**32-47 Bulkhead grays, steel, grating, shadows:** #12161F #1D2330 #283040 #343E52 #424E63 #526075 #637387 #76879C #8A9BB0 #A1B1C4 #BAC8D9 #D4E0ED | violet-grays #2B2A33 #3E3B4A #544F63 #6D667D

**48-63 Warm lights, alerts, crew skin and uniform:** ambers #3B1C14 #5E2A19 #873B1E #B05023 #D66B27 #F28E2B #FFB838 #FFE066 | alert reds #5C1622 #8A1F31 #B82B41 #E04358 | skin and leather #6E4730 #9C6747 #C98E68 #E8B894

Checked: 64 slots, no duplicates.

## Plan context (owner, 2026-11-24)
- The old tablet game became `main` (fast-forward, commit dcd8b7f). `main` is to be reworked for desktop browsers at 16:9, 1920x1080.
- `tablet` (from the same commit) gets the 90s retro look: 4:3, 320x240 art, 64-color master palette. See `RETRO_SKIN_PLAN.md`: it is a reskin of the frames and art, not a redesign of the game.
