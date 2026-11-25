# Aqua Nova: 90s retro tablet plan

Decided: 2026-11-24 (owner). Updated 2026-11-25. The palette is in `RETRO_PALETTE.md` and `data/palette.json`; art rules for artists and AI tools are in `Guides/ASSET_SPEC.md`.

## Direction (owner, 2026-11-24)
- The **tablet branch** (`tablet`) gets a **90s retro look** for its art: **320 x 240 art, 4:3, drawn with the 64-color master palette**, scaled up by whole numbers.
- The old 16:9 stage (1920 x 1080, higher resolution) is on **`main`** and carries on as the **desktop version**.
- Two targets, two looks (this replaces an earlier idea of a skin flag on one codebase).

## RESKIN, NOT REDESIGN (owner, 2026-11-25)
The owner wants the **same game**: same screens, buttons, layout and info displays. Only the **frames and art assets** change to the retro look. Making the info displays (charts, text, canvases) more retro is a possible **later, separate step**, only when the owner asks. A first attempt (2026-11-24) rebuilt the bridge as a native 320 x 240 pixel screen with its own layout; the owner rejected it as a redesign. That code is kept as an experiment in `tablet/retro/` and is not built on.

How the reskin works in code (bridge done first): the AI-made 320 x 240 PNG frame, with transparent holes where the live screens go, is shown at 6x with hard pixels (`tablet/retro/assets/bridge.png`, used in `tablet/js/scene.js`). The original screens and buttons are placed behind it or on top of it at the hole positions. The bridge stage is 1920 x 1440 (4:3); other scenes stay 16:9 until their frames are replaced. See `HANDOFF.md`.

## Why retro (owner, 2026-11-25)
The retro look is **not** about purism (no NES, PlayStation or DOS pastiche). It removes production problems that kept costing immersion:
1. **Art consistency.** Room frames came out looking like they belonged to different games. A fixed palette with fewer colors makes every asset look like one set.
2. **People you can see and talk to.** Realistic animation is too hard and voice audio is large and complex. The 90s answer is the **static portrait with a speech bubble or text box**, which fits the communicator and crew dialogue.
3. **Believable cut scenes and animation.** A low-resolution style makes believable cut scenes and animation possible, where high-definition assets were out of reach.
4. **Believable sound.** Retro-style sound is easier to make convincingly than high-definition sound.
5. **Programmatic animation and sound.** Both can be generated in code, so the game can do more and still feel believable. The owner called this a big deal.
6. **Immersion.** Visuals, sound and interaction were being compromised by programming and asset-making limits. A style that matches what can actually be made well should fix that.

Test for later decisions: does a choice make assets **more consistent** and **cheaper to make or generate in code**, **without changing the game itself**? If not, it works against the reason for the retro look.

## Notes for the work
- Art is drawn at 320 x 240 native and scaled by whole numbers only (6x = 1920 x 1440 stage pixels; the page then scales that to fit the screen). Frames have fully transparent holes for the live screens.
- Reserved meanings (keep stable): amber = mission, red = error or alert, green = known contour or OK, blue = interpolated. Do not use these colors for decoration on panels.
- AI-generated art: generators cannot make true pixel grids. Generate larger at 4:3, shrink to exactly 320 x 240, snap to the palette, then clean by hand (see `Guides/ASSET_SPEC.md`). The bridge frame of 2026-11-25 came out palette-only at 320 x 240 with transparent holes.
- Git: the owner does not use git; Claude works on `tablet`, tests, runs `tools/update_sw.py`, commits and pushes. `main` is the desktop version and is not touched unless asked.
- Deferred ideas (not started): programmatic sound, programmatic animation and cut scenes, static crew portraits with speech boxes, more-retro info displays (pixel-native chart, small font for dense pages).
