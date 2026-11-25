# Aqua Nova — sending reports to OERA (owner request, 2026-11-19)

Addendum to `COMMS_AND_PROGRESSION.md`. Replaces the old instant "Transmit report".

**Change 2026-11-20 (owner: "I don't need read receipts"):** there is no longer an "awaiting OERA" phase, a downlink or a generic "Report received" message. The bar ends with **REPORT SENT** the moment the upload finishes (clears after 3 s). OERA replies only when a mission has something to say (for example the Sea Trials reply mail); that mail comes from the mission, not from the transfer.

## What the player sees
- **Nicole (Communications) has an order: "Transmit a report"** (communicator → Nicole → Give an order). The Comms station **Transmit report** buttons (Mail tab and Controls tab) start the same transfer. The button reads "Transmitting…" while one is running.
- A **progress bar on the Communications console** (the `xfer-slot`; see `xferBar()` in `transfer.js`), not a pop-up:
  1. **UPLINK**: blue bar, percent, dB and seconds left.
  2. **REPORT SENT**: the report is in the outbox and the `report-sent` event has fired (mission objectives such as the Sea Trials report step complete here, not at the button press).
- Nicole speaks at the start ("Sending it on LASER … about N seconds") and when the upload finishes ("Report is out, Captain."). She refuses with a reason when there is no link or when a transfer is already running.
- **Sound** (`audio.js`): `dataTick(up)` plays 16 quick chirps of about 0.5 s (rising when sending), every 3 s plus at phase starts; `dataDone(ok)` is three rising notes, or two falling on failure. Uses the `ui` volume bus.

## Speed, signal and stalls (`tablet/js/transfer.js`)
- All times are **real seconds**.
- Base upload times at full signal: SAT 18 s, LASER 7 s, HF 45 s. Speed factor = signal dB ÷ the link's base dB, limited to 0.3 to 1.15.
- **Link drops** (antenna too deep, source changes, no lock): the bar turns amber, "Signal lost. Holding.", progress pauses and resumes when the link is back. After **40 s** without a link the transfer **fails** (the report is not sent), Nicole says so, and the player can try again.
- One transfer at a time. Not saved across a reload.

## Code
- `tablet/js/transfer.js` (`startReport()`, `transferring()`, `xfer` state, `xfer-change` event); audio in `audio.js`; `.xfer` styles in `tablet.css`; `stations/crew.js` (`ORDERS['Transmit a report']`); `stations/comms.js`.
- Test: `tools/transfer_test.py` (refused at depth, Nicole's order, bar, outbox timing, no receipt in the inbox, stall and resume).

## Not done
- A cancel button on the bar; transfer size by content; separate uploads for findings or samples; a secure-channel requirement for some missions.
