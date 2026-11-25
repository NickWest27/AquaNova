# Screen names (shared vocabulary)

## Screen size and the no-scroll rule (owner, 2026-11-25)
- **Target screen: 1180 × 820 CSS pixels**, an iPad Air in landscape (the owner plays on an iPad). `tools/smoke.py` and `tools/fit_test.py` use this size.
- **Display pages fit this screen without scrolling**, in their normal busy state (for example all four WSKRs out, or one selected).
- **Allowed to scroll:** the logbook, mail, the Comms contact directory, and the PED's list pages (Tasks, Contacts, Findings, Journal, Settings; the PED is a small handheld screen). The lab's Research list may scroll once it grows past one screen.
- Ways used to make pages fit: tiles that share a column equally (WSKRs), two or three cards to a row (Launch Bay, lab Research), a screen beside its controls (lab Analysis, Remora), a picker instead of a button per item (shuttle "Send to…"), short spec lines instead of paragraphs.
- **Test:** `python3 tools/fit_test.py` opens every station and tab (and harder states: WSKR in manual control, Remora out, shuttle alongside) and fails on any part of a page that scrolls or is cut off. Screenshots: `tools/shots/fit_*.png`. Add new pages and states to it.

Use these names when talking about the bridge and the science lab.

## Bridge
| Name | What it is |
|---|---|
| Main Screen (window) | Big centre screen. Nav map by default. With DSP on, shows the page on the Centre Display. |
| Info Left | Permanent, far-left corner. Stacked Speed, Depth, Floor, Heading. |
| Info Right | Permanent, far-right corner. Bars: Pressure, Temp, Energy, O₂, CO₂, Hull. |
| Position Log | On the nav map, left side. |
| Vertical Profile | Right side of the nav map, full screen height. |
| Top Strip | Two lines, centred. Line 1: ship state ("Docked · X", "Arrival at X", "Incoming message", "Bay door opening"). Line 2: lat/long, date and time. Never shows crew voice (voice goes to the line at the foot of the screen). |
| Centre Display | Small screen showing the page picked on the Left Desk Panel. No label. |
| Left Desk Panel | Picks the page: NAV / HELM / SYS / VIEW. |
| Centre Desk Strip | Controls for the current page. Shows pan arrows while PAN is on. |
| Right Desk Panel | Main Screen Control: RANGE − +, DSP toggle, PAN toggle. |
| Left / Right Station Screens | COMMS / SENSORS, "STANDBY". Content not decided. |

Hotspots: COMMS and SENSORS (small, round their screens). WALKWAY covers the whole bottom edge.
There is no Full button now, so the full-screen station pages (Nav, Helm, Sys) cannot be opened from the bridge.

(Later changes to the console pages are in `BRIDGE_CONSOLE.md`: pages are now NAV, HLM, TAC, SNR, VW, SYS, and the right desk panel is a bank of six. The 2026-11-25 retro reskin moved the screens in the new frame; see `RETRO_SKIN_PLAN.md`.)

## Science lab
| Name | What it is |
|---|---|
| Banner | Line 1: ROV status, tether %, samples held. Line 2: what is being analysed, % done, time left, queue. "Labs idle" when nothing runs. |
| Latest Sample | Large upper right. Newest sample and its labels. |
| Main Computer | Large right. Shows the analysis running now (type, sample, progress bar, time left). Tap opens the analysis pages (Material, Spectral, Gene). |
| Research Computer | Centre-right. Research points and topics done. |
| ROV Station | Left-centre. Pilot the Remora. |

Medbay is reached through the walkway (no lab hotspot).
