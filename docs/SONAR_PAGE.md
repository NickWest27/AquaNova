# SNR page: passive sonar (owner spec 2026-11-23, built the same day)

Code: `tablet/js/sonar.js` (model, sweep, scan, investigate), `tablet/js/sonarView.js` (the page, and `mountSnr` for the Sensors station), listening in `traffic.js` (`triangulate`, `snrGain`, `sonarNm`), WSKR trailing in `sim.js` (`sim.trailWskr`). Test: `tools/sonar_test.py`.

## Where it is
- **Bridge:** SNR on the left desk panel.
- **Sensors station:** two tabs, **SONAR** (first; the same display with its controls and range buttons) and **WSKRs**. The old "Sites and scans" tab was removed on 2026-11-25: **Full sweep** turns once round at 10°/s (about 36 s, a short pause per contact); while it runs the chart is drawn finer round the ship (8 nm), and each bearing hears twice as far **once the beam has passed it**, so faint contacts come up one by one as the beam reaches them; it raises the tutorial flag; **Scan site** appears in the controls when the ship is at a site it has not scanned; to send a WSKR to a site, tap the site on the WSKRs chart, then Investigate. A ship whose signature is on file can be scanned out to 12 nm (6 nm otherwise). **Survey site** (2026-11-26) appears at a site: hold station (within 0.5 nm, 2 kt or less) for 30 game minutes; the button counts down (tap it to stop). Done: the sea floor is charted in detail for 3 nm round the site, a survey finding is filed, and the site's survey count goes up (Seabed survey missions). Moving off station or speeding up breaks it off. Code: `tablet/js/survey.js`.

## What the page shows
- **Every listener feeds every display.** The source only sets the map centre and which bearings are drawn from the centre. Anything the ship or any WSKR in contact hears is on the page.
- **Left half:** top-down, **track-up** map centred on the **source**, range rings (4), bearing scale. Each contact is a **light bearing line**: from the centre when the source hears it, from the WSKR's own place when only that WSKR hears it (the info box says "from <WSKR>").
  - With a **fix** (range known): symbol and name at the real place, range measured from the source.
  - Without a fix: a **"?"** at the end of the line, on the outer ring, with its bearing.
  - A fixed contact beyond the map range sits on the ring, dimmed.
- **Right half:** the contact list, **by range** (nearest first), contacts with no range after them **by age** (newest first). Tap a row, a symbol or a bearing line: the **info box** replaces the list (name, type, side, bearing, range, depth, speed, course, track age, acoustic observations, who heard it, which WSKR is investigating). ✕ or Clear closes it; a tap on an empty map space closes it too.
- Faded contacts stay in the list for 120 s, dim and marked LOST.

## Controls
- **Centre:** **Source** (expands a list: AQUA NOVA or each deployed WSKR in contact), **Full sweep** (toggles to Stop sweep). With a contact picked: **Scan**, **Investigate**, **Clear**.
- **Right desk:** − , range readout, + (1 to 64 nm, shared by the large and medium copies), **DSP**, two blank slots.

## Rules
- **Powered sonar hears all the time.** No scan or sweep is needed to detect (sweep and scan only extend the reach). `s.sonar` is the power switch (Sensors station); off, the ship hears 1 nm; the WSKRs always hear.
- A listener hears a contact inside `range × loudness`. **Ship 12 nm** (`sensing.sonar_nm`), **WSKR 6 nm** (`sensing.wskr_sonar_nm`), both in `data/world/traffic.json`. Loudness: ship size and speed (0.6 to 1.2, a loud freighter at speed is about 14 nm), installations by kind (mine 1.2, platform 1.0, colony 0.8). (Raised 2026-11-23: it was 4 and 3, and ships on AIS 8 nm away were silent.)
- A **fix** comes from two bearings from different listeners that cross by 20° or more (ship + WSKR, or two WSKRs), from AIS, from a scan, or from sight. **AIS counts as a fix on this page.** A ship on AIS but too quiet to hear is **not** on the sonar page.
- **Full sweep:** 360° at **10°/s** (a 36 second lap) from the chosen source; that listener's sensitivity **doubles** during it; it **pauses 2 s** on each contact it can place a line on. Changing source cancels it. Not saved.
- **Scan** (a contact must be picked and heard): 10 s, sensitivity on that contact doubles; at the end, if the contact is within **6 nm** of the listener it gets an **exact fix for 3 min** and is **identified**; otherwise Sensors says it is too far.
- **Investigate**: sends a WSKR to the picked contact. Which one: the chosen source if it is a WSKR, otherwise the nearest WSKR in formation (none free: Sensors says so). The WSKR mode is `trail` (`w.trail = {kind, id, last, seen}`, saved). It closes to **1 nm** (`WSKR_TRAIL_NM`, inside the 2 nm camera range, so the contact is **identified**, and Sensors reports it) and **stays with the contact**. It ends when: the Captain taps Investigate again (button reads "Investigating"), any other order is given to that WSKR (Hold formation, Manual, Search, Relay, Recall, a task), the battery recall fires, or the contact has been out of the traffic bubble for **2 minutes** (Sensors: "lost the contact", WSKR back to formation). The WSKRS page shows "Investigating a sonar contact". Charted places are still investigated with the older WSKRS page task (`task` mode, files a scan).
- Noise sources now: ship traffic, and installations (POIs with kind mine, platform, colony). **Whales, subs and torpedoes do not exist yet**; when they do, add them as sources in `sonar.js` (a contact is `{id, kind, ref, from, by, byName, icon, bearing, range, pos, name, type, side, depth, speed, course, notes}`) and teach `trailPoint` in `sim.js` their position.
- Speed without identity is a guess from blade rate (nearest 2 kt). Identified ships show their real speed.

## Open
- SNR sweep state, source and selection are not saved (a new session starts on the ship, nothing selected).
- The Sensors station's old "Full sweep" (chart detail 8 nm for 30 min, now also doubles the ship's hearing) is a different thing from the SNR sweep.
- A trailing WSKR is not held by the control-link range (auto modes never were).
- Page order: TAC, VW, SYS specs still to come.
