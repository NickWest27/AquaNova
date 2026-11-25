# Aqua Nova — story bible

Written 2026-11-19 from the Characters and Chapters PDFs, `data/contacts.json`, `data/commsContacts.json` and the arrival and logbook text. The owner has okayed it in principle (not yet read in full). Anything beyond the PDFs is invention by Claude. The bios in `contacts.json` use it. Names were changed on 2026-11-19 (see the end).

## Theme
**Who decides what the deep is for?** The Aqua Nova is sold as a peaceful research ship, and the owner's own notes say Captain Voss did not think it should be *only* that. Science, security and funding all want something from the ocean floor. Missions should keep returning to that question in different forms (a discovery that is also a resource, a distress call that is also a test, a find that someone wants kept quiet) rather than being random encounters. The player starts as someone who believes the sea is worth understanding before it is worth using. The story tests that belief.

## Areas of Operation (owner, 2026-11-20)
The Aqua Nova is advanced enough that the nations behind O.E.R.A. will not let her go anywhere. The **Area of Operations** (AO) is the box the charter allows, and it is **political, not physical**: the ship could physically go further. In the game the AO is the charted area. **Outside it is a no-transgression zone**, drawn on the chart as a red hatched band with a dashed limit line.
- **Where it is now:** 30°N to 42.4°N and 74.63°W to 0°W (Woods Hole, the shelf, Hudson Canyon, the abyssal plain, the Mid-Atlantic Ridge, the Azores and the Iberian coast), **minus the north-east block** (north of 40°N and east of 70°W) where there is no chart data yet. That block is red until the tiles arrive.
- **In play:** Helm warns about 6 nm out ("the limit of our Area of Operations is about N miles ahead. We are not cleared to cross it"). At the line the ship stops, with no damage ("That is the limit of our Area of Operations. We are not cleared to go further. All stop."). Plotting a course outside is refused ("outside our Area of Operations").
- **ARIA** has an "Ask about… our Area of Operations" topic: the funding nations agreed on a box, the charter lets O.E.R.A. operate in those waters and no others, neither ARIA nor Helm can take the ship over the line, and only Admiral Okafor can redraw it, with the governments in the room.
- **Story use (ideas, not built):** the AO can be redrawn by a mission, a decision or a message from Okafor; crossing it on purpose could be the real cost of a Captain's choice (the theme again); the Halcyon distress call sits at 40.3°N 69.5°W, which is **just outside the AO today**, so answering it is a choice about whether to cross the line. The Titanic Wreck Site (41.73°N 49.95°W) is also outside until a 40–45°N, 50–40°W tile is exported.

## Timeline
- **Backstory:** O.E.R.A. (Oceanic Exploration and Research Alliance, a joint venture of several nations) builds the Aqua Nova at Woods Hole. Captain Elena Voss, a Navy veteran, is instrumental in the project and insists on a security officer and a hull that can do more than research.
- **A few days before sea trials:** Voss is relieved of command at short notice. The reason is not given. ARIA was in the room and has not said what she saw. This is the first long thread.
- **Day one (16 Aug 2074):** the player, a retired naval captain who came as an outsider to help bring the systems online, is given command. Admiral Okafor chose the player personally.
- **Early game:** sea trials, charting, first survey. Quiet and teaching, with the theme planted: OERA wants the survey data, and some of it is wanted by someone other than the scientists.
- **First real choice:** the Halcyon distress call (hidden contact in `commsContacts.json`, HF 4.125 MHz, 40.3 N 69.5 W). Nicole hears it first because it is on an old frequency. It lies outside the Area of Operations (see above).

## Crew (bios in `contacts.json`; traditional pronouns throughout)
- **Captain (the player).** Retired naval captain with a systems background. Outsider at first, then in command. Believes in the peaceful mission.
- **ARIA, Executive Officer (she).** Built from decades of deep-sea mission records as a crew member, not a tool. Calm, candid, allowed to disagree on the record. Does not claim to feel. Was present at Voss's relief and has said nothing. *Use:* the Voss thread; she should never lie, only decline to say.
- **Marcus Chen, Helmsman (he).** Navy coxswain, nine years on small boats in bad water, then ferrying scientists to a research sub. Precise, dry, hates being rushed in harbour. *Use:* competence; notices when the Captain is pushing the boat too hard.
- **Dr. Samira Patel, Chief Science and Medical Officer (she).** Emergency doctor turned marine biologist, ship's doctor on three expeditions. Chosen by Voss personally. *Use:* science and crew health; first to say what a discovery might cost.
- **Alex Torres, Sensors (he).** Six years in a Navy sonar shack. Reports only when sure. *Use:* the contact he is not sure about, and whether the Captain trusts a "probably".
- **Ryan Chen, Chief Engineer (he).** Merchant ship engine rooms, then the team that commissioned the fusion plant. Fixes things with parts nobody planned to use. No relation to Marcus; both are tired of the question. *Use:* a running joke that can pay off once.
- **Lt. Daniel Kim, Security (he).** Navy special warfare, then maritime boarding. Voss insisted on him over the science side's objections. Believes a ship that goes deeper than anyone will meet something it cannot talk to. *Use:* the voice of the other side of the theme; never a villain.
- **Nicole Brooks, Communications (she).** Signals officer, then four years at a polar station with one satellite window twice a day. Knows what a delayed message costs. Hears old frequencies first. *Use:* Halcyon.

## Contacts
- **Admiral Catherine Okafor, Director of Operations (she).** Retired rear admiral. Argued for years for a ship that can go where no one else can and come back. Answers to a board and to the funding governments, who want different things. **Draws the Area of Operations with them.**
- **Cdr. Sarah Mitchell, Harbour Master, Woods Hole (she).** Retired Coast Guard, eleven years running the harbour. Knows every vessel by sound. Keeps her opinions of the Aqua Nova to herself, mostly.
- **Dr. Thomas Webb, Research Coordinator (he).** Marine ecologist who wants data, not discoveries. Disagreed with Voss, politely and at length, over carrying anything that is not for science.
- **Captain Elena Voss (offstage, she).** Veteran Navy officer, instrumental in the project, not convinced it should be solely a research vessel. Firm but fair. Where she is now, and why she was relieved, is the first long question.

## Names changed 2026-11-19 (owner: names are not important, they should fit the person)
- Admiral **Elena Vasquez** is now **Catherine Okafor** (two Elenas was confusing). Voss keeps Elena, since the PDFs use it.
- Dr. **Marcus Webb** is now **Thomas Webb** (Marcus Chen keeps Marcus).
- Gender-neutral first names were made clear, so traditional pronouns read naturally: Sam Patel is now **Samira**, Riley Chen is now **Ryan**, Jordan Kim is now **Daniel**.
- Saves keep the old text of logbook entries and mail they already hold. Names on contact cards and the new introductions update on load.

## Other congruity checks
- O.E.R.A. is "Oceanic Exploration and Research Alliance" everywhere (the Comms inbox said "Ocean").
- Ryan's old bio said his solutions had "saved the ship on more than one occasion", but the ship is new. Fixed.
- The Characters PDF lists a different original cast (Marcos Patel engineer, Dr. Lila Moreno, Lt. Gabriel Tanaka). The game's cast is treated as current.
- The Chapters PDF has the player as a consultant who later becomes Captain. The game compresses this into day one; the Captain bio keeps both.
- Crew pleasantries mix "Captain", "Commander" and "Sir" on purpose, for variety.
