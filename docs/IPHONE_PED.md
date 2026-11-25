# iPhone PED (`ped/`)

A portrait web app in the PDA frame. **It has no simulation.** It shows what the iPad last reported through the secret gist, so it is only as fresh as the last sync and is useless while the iPad is off (owner, 2026-11-20: no point in orders from the phone for that reason, so it stays read-only).

Tabs: **Status, Nav, Missions, Findings, Tasks, Journal, Settings**. Notes and tasks sync both ways. Code: `ped/ped.js`; the iPad builds the status in `tablet/js/sync.js` (`buildStatus`).

## Nav tab (2026-11-20)
- A plan view (north up) centred on the ship: heading arrow, one-hour vector at the current speed, range rings, the destination point and a dashed line to it, the sites (yellow, docks blue, names shown when zoomed in), and the craft out (Remora, Tern, WSKRs) in pink.
- **Zoom in / Zoom out** buttons (4, 10, 25, 60, 150, 400 nm top to bottom), **drag** to pan, **Centre on ship**.
- **While the iPad is asleep (Crew has the con)** the ship is drawn at the estimated position from the crew plan (the same dead reckoning as the Status card), and the plan path is drawn dashed.
- The chart is two pictures made by `python3 tools/make_navmap.py` from `data/seafloor/`: `ped/navmap.png` (whole area, 0.02 degree cells) and `ped/navmap_fine.png` (Woods Hole waters, 0.005). Land grey-green, no data dark, water shaded by depth. Run the script again if the sea floor data changes, then `python3 tools/update_sw.py`.
- Status fields added for it: `wpt` (name, lat, lon), `pois` (name, type, lat, lon), `craft` (kind, lat, lon).
- Test: `tools/phone_nav_test.py` (screenshot in `tools/shots/phone-nav.png`).

## App icon (2026-11-22)
The Aqua Nova squid logo (the project's `favicon.png`) on white: `ped/icon-v2-180.png` (apple-touch-icon) and `ped/icon-v2-512.png` (manifest). The `v2` name forces iOS to fetch the new icon. The source logo is only 96 px, so the 512 is upscaled and soft; a larger logo would sharpen it. On the iPhone, remove the Home Screen app and add it again to see the new icon.

## Not built
- Orders from the phone (needs the iPad awake and the game running; not wanted).
- A trail of past positions; depth contours on the phone chart.
