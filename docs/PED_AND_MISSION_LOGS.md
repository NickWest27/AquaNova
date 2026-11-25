# Aqua Nova — PED, sign-in, player name and mission logs

Last updated: 2026-11-19 (late night). Part of the document set listed in `DEVELOPMENT.md`.

**Names (2026-11-19):** the Operations Director is **Admiral Catherine Okafor** (was Vasquez). See `STORY_BIBLE.md` for all name changes.

**Rule (owner, 2026-11-19): a logbook entry is a document and never changes.** Its task list is shown as plain text, **never ticked and never struck through**, in every kind of entry (including "Mission complete" logs). Live progress belongs in **PED → Tasks**, where objectives are ticked off as they are done.

## New game start: arrival sign-in (owner, 2026-11-19)
The sequence, in order:
1. **Walkway A1.** The game starts here. A **secure crew sign-in** opens on a **PED, inside the PED frame** (`tablet/js/intake.js`; same frame and landscape layout as the PED pop-up). It is a **general form that every crew member signs in on**, so nothing in it is specific to the Captain. It is serious in tone: O.E.R.A. Secure access, "Crew sign-in", Vessel, Sign-in (Arrival), Location (**Launch Bay**), Date and time, **Given name** and **Surname**, and one declaration to tick: a truth declaration with a warning that falsifying O.E.R.A. personnel records is an offence (fine, court martial, dismissal or imprisonment). The **biometric sensor** (a fingerprint button, **reacts on finger down**) unlocks when both names are valid and the box is ticked. Pressing it runs a short verification animation, then "Print matched to the personnel record". It captures the name; nothing is really scanned. Names accept letters, spaces, hyphens and apostrophes; they are tidied to capitals ("o'neil-ray" becomes "O'Neil-Ray").
2. **Identification record**, also on the PED. This is where the Captain's role appears: "Biometric identification confirmed", Name, Rank Captain, Security clearance Level 5 Omega (highest), Quarters (Captain's Quarters, Deck A1), Vessel, and Notes (transferred from retirement at the request of Admiral Catherine Okafor to help commission the Aqua Nova after the relief of Captain Elena Voss). It ends with "Please report to your Quarters immediately. You have a message from O.E.R.A. Operations." and an **Acknowledged** button.
3. **Walk to the quarters.** The floor hotspot (`A1 DECK ▼` / `AN-1 DECK ▼`) and the QUARTERS door in walkway A1 glow until the player has been in the quarters.
4. **Quarters.** The **laptop glows** until the logbook is opened. The **PED lies on the bed** and the **communicator pin on the desk**, each drawn flat at the angle of its surface (`flat()` in `scene.js`). They **do not glow until the welcome logbook has been read**, and the player can take either before or after. The PED button in the top corner does not exist until the PED is taken.
5. **Logbook.** M.LOG-0001 (Admiral Okafor) is the welcome, addressed to "{captain}", with a signature. Its task list reads: collect the PED, collect the pin, call ARIA, find your way to the Bridge. Nothing in it is ticked. Progress on these shows in PED → Tasks. Newest entries are on top; **M.LOG-0001 is dated Day 1, 06:00 of the game calendar** (50 years after the real start date; see `TIME_CRUISE_AND_START.md`).

**Silence rule:** ARIA's chirps and hints stay silent until the communicator pin is picked up (`hush` in `notify.js`). The old "Welcome aboard, Captain" pop-up is gone.

**Resume rule:** coming back to a game that has read the welcome logbook, or reloading after an update, **opens the Logbook** first (back button returns to the Quarters). Automated tests start on the bridge unless the URL has `?resume=1`. Test: `tools/resume_test.py`.

**Where the data lives.** The name is `progress.player` `{first, surname, name, rank}`; `progress.got_ped`, `progress.read_welcome`, `progress.been_bridge`. These sit under `progress` on purpose, because a save keeps only navigation, shipSystems, crew, mission, environment, contacts, progress, inventory and settings. `tutorial.*` flags are **not** saved (the important ones are copied into `progress.flags`).

**Older saves** (no name, past the pin) skip the sign-in, keep their PED and are addressed as plain "Captain". "Restart from the beginning" reloads the game and shows the sign-in again. Changed M.LOG-0001 text only shows in a new or restarted game, because saves keep their own copy.

**Automated tests** skip the sign-in (`navigator.webdriver`), using the name Alex Mercer. Add `?intake=1` to test it. Test: `tools/intake_test.py`.

## The player's name in the game (`tablet/js/player.js`)
- Text may contain **`{captain}`** (formal: "Captain Surname"), `{surname}`, **`{first}`** (informal), `{name}` (full name). Without a name they fall back to plain "Captain".
- Filled in when shown: **crew speech** (`say()`), **mail** (body and subject), the **logbook** entries, and the **PED Contacts** cards.
- **Formal vs informal:** orders, mail and logbook use `{captain}`; use `{first}` when someone close to the player speaks casually.
- PED → Contacts shows a **You** card first: "Captain First Surname", with a short bio.
- **First meetings:** each crew member introduces themselves once, the first time they are reached on the communicator (`INTRO` in `stations/crew.js`, saved in `progress.met.<id>`).
- **Not done:** a place to see the name's spelling or change it.

## Mission flow and logbook (owner, 2026-11-19)
- **Missions arrive as Comms mail.** The mail is a cover page for a mission available at that time.
- **Accepting a mission** pushes the actual mission, its description and its **task list** into the logbook as a **mission log** (`M.LOG-xxxx`). That entry carries a **state save**, so the player can **revert** to the moment of acceptance if the mission goes badly.
- **When the mission is complete** (results or findings sent), a second mission log is written **from the captain's point of view**, describing the outcome, with another state save.
- Purpose: the entries remind a player who has been away what was going on, and give revert points.

### How it is built (`tablet/js/missionLog.js`)
- `logAccepted(id)` runs from the **Accept mission** button in Comms (`stations/comms.js`). It writes entry type `mission_log` (ids `M.LOG-0002`, `0003`, …; `M.LOG-0001` is the start of the game): "Mission accepted: <name>. <briefing>", with the mission's required objectives as the task list. It records the id in `mission.logged` (set before the save, so the saved moment knows).
- `missionManager.completeMission()` fires a `mission-completed` event (a mission that is already complete is ignored). For a mission in `mission.logged`, the handler writes "Mission complete: <name>. <outcome>", then ARIA reports the log number. `hasLog(id, kind)` stops a second "accepted" or "complete" log for the same mission. (The complete log stores its tasks as done, but the logbook draws no ticks, see the rule above.)
- Mission JSON fields: **`logBriefing`** (captain's wording of the orders) and **`logOutcome`** (the write-up). Outcome text can use `{location}`, `{depth}`, `{date}`, `{findings}`. Written for **Sea Trials** and **First Survey**. A mission without them falls back to its `description` and a short default.
- **Tutorial lessons** (Ship Tour, Charting a Course, Reading the Sea) are not accepted by mail and write **no** mission logs.
- The logbook shows each entry's stored task list and a **Revert here** button on any entry that has a snapshot. Reverting also calls `missionManager.restoreFromState()` so active and completed missions match the restored save.
- Test: `tools/missionlog_test.py` (also checks that no task is crossed out); `tools/transcript_test.py` (no duplicate logs).
- **Not done:** rewording older saves; a log for the start of a lesson chain; per-mission outcome variants (success or failure); a "mission failed" entry. (Generated missions have outcomes instead of failures: `MISSION_GENERATOR.md`.)

## PED (`tablet/js/stations/ped.js`)
Tabs: **Status, Missions, Tasks, Contacts, Findings, Journal, Settings**, plus the Communicator chip.
- **Missions** = **Active** (name, description, "n of m tasks done"), **Available** (offers in the mail not yet accepted, with an **Open Comms** button), and a **Completed** list.
- **Tasks** = the **objectives of the accepted missions**, grouped by mission name, ticked off live as they are done, then **My tasks** (personal to-do list, still synced with the iPhone).
- **Contacts** = a **You** card, then **crew the Captain has met** (`progress.met.<id>`) with role and **bio**; **Outside the ship** appears when an outside contact is known (none are unlocked yet).
- **Settings**:
  - **Sync with the iPhone PED**: not connected = three short steps, token and passphrase boxes, Connect; connected = status line, Sync now, Disconnect.
  - **Time compression**: Real time (default), 5x, 15x, 30x, 60x, 120x (see `TIME_CRUISE_AND_START.md`).
  - **Sound mixer**: Master, **Ship** (hum), **Ambient** (ventilation), **Communicator**, **Notices**, **Interface** sliders, plus Turn sound on/off and Test sound. Stored in `aquaNova_sound`. Defaults: master 60%, ship 25%, ambient 60%, others 100%. Levels are a first guess (not heard here).
  - **Game version**: build number, **Check for update**, and **Update now**.
  - **Text size**.
  - **Bug notes**: write a short finding; each note stores game time, place and build. **Copy all** puts them on the clipboard. Kept on the iPad (`aquaNova_bugnotes`); **private**: not part of saves, not synced, not sent anywhere.
  - **Erase and restart** lives in the **Logbook**, on the first entry (M.LOG-0001, "Restart from the beginning").
- Tests: `tools/ped_test.py`.

## Screen rules (owner, 2026-11-19)
- **Hotspot labels are hidden** for immersion (signs on the art stay). **Press and hold** anywhere on a scene for half a second to show labels and outlines; they fade about 2.5 s after release. Test: `tools/labels_test.py`.
- **No bottom info bar.** Stations fill the screen. Crew and ARIA lines show as a short-lived pill at the bottom (about 7 s), never reserving space.
- **Handling is in real seconds:** turn 6°/s slow down to 3°/s at full speed; the dive rate depends on speed (`TIME_CRUISE_AND_START.md`).

## Crew small talk: Nicole as the communications officer (2026-11-19)
Nicole's replies in `tablet/js/chat.js` come from the comms model: **link status** (laser, satellite, HF: operative with signal and rate, fading, or no carrier with the reason), whether a **relay WSKR** is up, whether the mast is too deep to hear VHF and HF, **radio chatter from stations in range** (RV Gannet, FV Marguerite, DSV Meridian, the Coast Guard sector, Nantucket Harbor, Woods Hole Station, each with its own line), waiting mail, and **gossip** (two Chens and one mailbox, Torres's "probably", Gerald the plant; the Captain's-chair and Captain Voss lines unlock after a few talks). The Halcyon distress call is deliberately not mentioned until it has been activated. She can also **transmit a report** (`REPORT_TRANSFER.md`) and give a **communications status report** (`HELM_AND_ORDERS.md`).
