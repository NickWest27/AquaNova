# Contact tracking: detection chance, tracks and signatures

Decided by the owner on 2026-11-25. The code is in `tablet/js/traffic.js` (detection, tracks), `tablet/js/sonar.js` (contact list, auto-intercept) and `data/world/traffic.json` (`sensing`, the numbers). This applies to ships. Fixed installations are unchanged.

## Why
Before this change, sonar had a hard edge: a ship was heard inside its range and never outside it. Once a ship was identified, its name stayed with it for good, so a ship that came back after hours out of contact still had its name. The owner called this magic. Now a name belongs to a **track**, and keeping a track depends on chance and time.

## 1. Detection is a chance, not a wall
Each listener (the Aqua Nova, each WSKR) has a **50% range** for each ship:

```
R50 = base × size × loudness × sweep × flow
```
- `base`: 12 nm for the Aqua Nova (1 nm with the sonar off), 6 nm for a WSKR.
- `size`: 0.6, 0.8, 1.0 or 1.2 by size class (small boat to large ship).
- `loudness`: 0.8 + (ship speed, up to 20 kt) / 50, so 0.8 to 1.2.
- `sweep`: 2 during an SNR sweep or scan on that listener, else 1.
- `flow`: the listener's own flow noise. The Aqua Nova is quiet at normal speeds: **1.0 up to 15 kt** (its top normal speed is 14 kt). Above 15 kt, which means super cruise, it falls in a straight line to **0.4 at 100 kt**. Sample values: 50 kt is about 0.75, 100 kt is 0.4. A WSKR in super cruise uses 0.4.

The chance of hearing the ship on one check:

```
P = 1 / (1 + (d / R50)^6)        d = distance to the ship
```
| d / R50 | 0.5 | 0.7 | 0.85 | 1.0 | 1.2 | 1.4 | 2.0 or more |
|---|---|---|---|---|---|---|---|
| P | 98% | 90% | 73% | 50% | 25% | 12% | 0 (cut off) |

- A check runs every **5 game seconds** for each ship and listener (`check_s`).
- A heard ship stays heard until **2 checks in a row** miss (`drop_misses`), so a contact at the edge fades in and out, without flicker.
- AIS and sight are unchanged: certain inside their ranges.

## 2. The name belongs to the track
- A **track** is held while any listener hears the ship (or AIS or sight has it). While the track is held, its identity stays.
- When nothing has heard the ship for **120 s** (`track_hold_s`, the same as the contact list's LOST time), the track is lost. The game remembers where and when it was last heard.

## 3. Picking a track up again: a match chance, not a certainty
If a ship that was identified is heard again after its track was lost, the crew compares it with what they remember:

```
R     = 0.5 nm + (ship top speed × hours since last heard)      the circle it could be in by now
Pmatch = previous × 1 / (1 + (R / 5 nm)^2) / (1 + others)
```
- `others`: other ships of the same size class that are heard inside that circle. Each one makes the match less sure.
- `previous`: 1 for an identified track, or the match chance it already had if it was only probable (uncertainty adds up).
- The top speed is 1.2 × the ship's speed (the speed of a ship that reacts).
- Examples for a 10 kt ship with no other ships nearby: after 5 min about 92%, after 15 min about 67%, after 30 min about 37%, after 1 h about 14%, after 2 h about 4%.

What the player sees:
- **Pmatch 25% or more:** "Probable: MV Sea Hawk (73%)". The icon and the side stay *unknown* until it is confirmed.
- **Below 25%:** "Unidentified contact".
- A probable match **is not an identification**. Mission objectives do not count it, and the hostile warnings do not name it.

A confirmed identification (see below) clears "Probable".

## 4. Certain identification (unchanged)
- AIS (it says who it is).
- Within 4 nm of the Aqua Nova.
- A WSKR camera within 2 nm.
- A ship that answers a hail.
- A sensor sweep (Sensors station, 20 s) or a scan (SNR page).

## 5. Signature on file
Once a ship has been identified, its acoustic **signature is on file** for the rest of the game, and it is saved.
- A sensor sweep reaches **12 nm** instead of 8 nm for a ship on file (`sweep_nm_known`).
- The WSKR auto-intercept does not chase a ship on file. Sweep it, or send a WSKR by hand.
- The contact card says "Signature on file".

## Saving and reloading
The traffic is rebuilt from the world seed on each load. `world.known` holds, for each ship on file: the time it was last heard, where it was, and whether its track was identified (1) or probable (the match chance). After a reload the track picks up where it was: if it is heard again within 120 s of that time, it keeps its name; if not, section 3 applies. Old saves (a plain list of ids) load as "on file" with no live track.

## Tests
`traffic_test.py`: the detection curve, flow noise in super cruise, a held track keeping its name, the match chance after time out of contact, signature-on-file sweep range, and the reload. Tests that need the old fixed edges set `traffic.rand = () => 0.5` (so a ship is heard exactly when P > 50%, which is inside R50), `check_s = 0` and `drop_misses = 1`.
