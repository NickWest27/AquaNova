# Aqua Nova retro tablet: asset spec (for artists and AI image tools)

Aqua Nova is a browser game about a deep-sea research submarine, in the spirit of the 90s TV show SeaQuest DSV: a calm, believable near-future sub with bulkheads, grating, glowing consoles and deep blue water. The tablet version is being redrawn as a **90s retro pixel game**. This file tells you how to make art that drops straight into the game.

If you are an AI tool: read **all** of this before drawing. Most failures are anti-aliasing, extra colors, or the wrong size.

## The hard rules
1. **Native size 320 x 240 pixels** (4:3). The game scales it up by whole numbers only (3x on the owner's iPad Air). Never deliver art at 3x or 4x "to look nice". Deliver at native size.
2. **Only the 64 colors below.** Not one other color. No gradients, no blur, no glow, no soft shadows, no anti-aliased edges, no transparency fades. Edges are hard pixels.
3. **Shading by hand**, with the ramps below: 3 to 5 steps per material. Dithering is allowed (checkerboard or ordered 2x2 only), used sparingly for water and sky. No noise.
4. **Pixel art, not a filtered photo.** One pixel is one pixel: no sub-pixel lines, no rotated pixels, no mixed pixel sizes in one image.
5. **PNG, indexed or RGB, no alpha except where stated.** Where a hole or transparent background is wanted, use fully transparent pixels (alpha 0). Never semi-transparent.
6. **Keep text out of the art.** The game draws all words in its own pixel font. Leave blank areas for labels. The one exception: tiny painted panel markings (a few pixels) are fine.
7. **Reserved colors (meaning):** amber (slots 11, 12, 54, 55) = mission or attention. Red (slots 15, 56-59) = alert or error. Green (slot 14) = known contour or OK. Blue (slot 13) = interpolated. Do not use these for decoration on screens or panels, so the meanings stay clear. The water ramp (slots 16-25) is not reserved: use it freely for water, sonar and glass.

## The 64-color master palette
Slot number = position in the list, starting at 00. Machine-readable copy: `data/palette.json` (also published at `https://nickwest27.github.io/AquaNova/tablet/data/palette.json`).

**00-15 Anchors (outlines, slate, cyan, amber):**
`#0B0F1A #162033 #1D2B53 #263B59 #354F6B #4A6582 #647E99 #829BB3 #A6BCCF #D8E6F2 #FFFDF5 #FFEC27 #FFA300 #29ADFF #008751 #FF004D`

**16-31 Deep-sea blues (16-25) and teals (26-31):**
`#071324 #0C213D #113259 #174575 #1E5B91 #2673AD #2F8EC9 #3DA8E3 #59C3F7 #87DCFF #0E3B4A #145466 #1C7082 #258E9E #36B0BA #5CD1D4`

**32-47 Bulkhead grays (32-43) and violet-grays (44-47):**
`#12161F #1D2330 #283040 #343E52 #424E63 #526075 #637387 #76879C #8A9BB0 #A1B1C4 #BAC8D9 #D4E0ED #2B2A33 #3E3B4A #544F63 #6D667D`

**48-63 Warm lights (48-55), alert reds (56-59), skin and leather (60-63):**
`#3B1C14 #5E2A19 #873B1E #B05023 #D66B27 #F28E2B #FFB838 #FFE066 #5C1622 #8A1F31 #B82B41 #E04358 #6E4730 #9C6747 #C98E68 #E8B894`

Note: the slot numbers in the "reserved colors" rule use this numbering. Outlines are normally slot 00 (#0B0F1A) or 01, not pure black.

### Ramps to shade with
- Water and sonar: 16 > 17 > 18 > 19 > 20 > 21 > 22 > 23 > 24 > 25 (dark to light blue).
- Teal glass and displays: 26 > 27 > 28 > 29 > 30 > 31.
- Steel and bulkheads: 32 > 33 > 34 > 35 > 36 > 37 > 38 > 39 > 40 > 41 > 42 > 43.
- Warm lamps and rust: 48 > 49 > 50 > 51 > 52 > 53 > 54 > 55.
- Skin: 60 > 61 > 62 > 63. Uniforms: use the slate and blue ramps.

## Art direction
- Lighting: cool and dim, with warm amber or yellow lamps as the accent. Consoles glow teal or cyan.
- Shapes: chunky and readable at 320 x 240. A detail smaller than 2 x 2 pixels is noise; leave it out.
- Camera: flat, front-on or gentle three-quarter views. Strong silhouettes. No heavy perspective.
- No logos, no real-world brands, no text, no copyrighted characters or ships (do not copy SeaQuest DSV art). Original designs only.

## Frames with live screens
Some art is a **frame** (a bridge, a laptop, a handheld) with **holes** where the game draws live screens. The holes must be **fully transparent**, with an exact rectangle that the game can read. For every frame, also give the hole rectangles as `x, y, w, h` in native pixels (or paint the holes in pure magenta #FF00FF in a separate reference copy). Do not paint a fake screen inside a hole.

## Files and names
- PNG, lowercase names with underscores: `bridge_frame.png`, `quarters_bg.png`, `icon_contact_sub.png`.
- Backgrounds and frames: exactly 320 x 240. Icons: 8 x 8 or 16 x 16 (say which). Portraits: see below.
- Put a one-line note with every file: size, what it is, hole rectangles if any, and the palette slots you leaned on.

## Check your files (the repo has a checker)
`python3 tools/check_asset.py path/to/file.png` reports the size and any color that is not in the palette. Add `--fix` to snap stray colors to the nearest palette color (it writes `name_fixed.png`). An AI tool that cannot run it should still **post-process in an image editor**: set the mode to indexed color with this exact palette, no dithering, nearest-color.

## What is wanted (proposed sizes; the owner confirms each before drawing)
| asset | size | notes |
|---|---|---|
| Splash / title | 320 x 240 | Aqua Nova under deep blue water, space for the title text drawn by the game |
| Bridge frame | 320 x 240 | Console arcs and a main viewport hole; holes for the live screens |
| Captain's quarters | 320 x 240 | Bunk, desk with a laptop, a porthole; tappable areas listed separately |
| PDA frame | to be confirmed | A handheld with one screen hole |
| Communicator pin | 16 x 16 | A small badge |
| Contact icons | 8 x 8, one file per icon | surface ship, submarine, WSKR, Tern, installation, unknown, plus friendly / neutral / hostile variants |
| Crew portraits | 48 x 48 (proposed) | Head and shoulders, skin and uniform ramps, plain slot 01 background |
| Favicon / home-screen icon | 16 x 16 and 64 x 64 | The sub, readable at small size |

When an asset is not on this list, ask what size and holes it needs before drawing.
