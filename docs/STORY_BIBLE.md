# Aqua Nova — story bible

Written 2026-11-19, brought up to date 2026-11-27. Sources: the Characters and Chapters PDFs, `data/contacts.json`, `data/commsContacts.json` and the arrival and logbook text. The owner has okayed it in principle (not yet read in full). Anything beyond the PDFs is invention by Claude. The bios in `contacts.json` use it. Names were changed on 2026-11-19 (see the end).

## Theme
**Who decides what the deep is for?** The Aqua Nova is sold as a peaceful research ship, and the owner's own notes say Captain Voss did not think it should be *only* that. Science, security and funding all want something from the ocean floor. Missions should keep returning to that question in different forms (a discovery that is also a resource, a distress call that is also a test, a find that someone wants kept quiet) rather than being random encounters. The player starts as someone who believes the sea is worth understanding before it is worth using. The story tests that belief.

## The ship and the opening (owner, 2026-11-26)
- **The Aqua Nova Deep Sea Vessel (DSV).** The most advanced submarine ever built. A state-of-the-art hull skin designed for high-speed supercavitation, **hydro-jet propulsion** (port and starboard jets, 14 kt) and a **quantum fusion drive** (twin cores, seen in the Engineering room) that powers **super cruise** at 100 kt and more. Remora (tethered science ROV), the Tern (shuttle) and four WSKRs (scout drones) go with her. Systems detail: `ENGINEERING.md`.
- **Mission statement (the owner's words, in Okafor's welcome):** "Your mission is to seek out new life where no light has ever reached. To explore, rescue, and protect. You are to become the guardian of the ocean, for beneath the waves lies our future." *Beneath the waves lies our future* is the tagline.
- **Inspiration, not source:** the owner's brief echoes 90s TV submarines (SeaQuest DSV: twin reactors, water jets). Keep ours original.
- **Opening in three letters from Admiral Okafor:**
  1. **Welcome** (logbook entry M.LOG-0001, `data/logbooks/SeaTrials.json`): congratulations, the mission statement, the logbook, collect the PED and pin, call ARIA.
  2. **Commissioning orders** (mail after the ship tour): depart immediately for the **Trials AO** at 39°54'N 071°00'W, on the shelf edge about 100 nm south; en route no more than 15 knots or 300 metres.
  3. **Welcome to the AO** (mail on arrival): friendly vessels nearby, not everyone wants her to succeed, ship untested and crew new; push the limits of speed, "you should be able to get over 100 knots".
- **Depth certification (owner asked for a reason for 300 m, 2026-11-27):** the hull is built for the deepest trenches (crush depth 11,000 m), but the supercavitation hull skin is a new design. The **Atlantic Classification Society** certifies her depth in steps; each step is approved only after the strain data from the dives before it has been reviewed. The trials certify the first step, **300 m**. Later steps could unlock with missions (an idea, not built: 1,000 m, 3,000 m, 6,000 m, full depth), so depth becomes part of the story: the deep sites are earned. Pushing past a step in the trials gives the society its data, and risks damage.
- **The trials** test depth (300 m), full speed and super cruise. After each, the department head asks to **push her further** (two steps each: 450 then 600 m, 15.5 then 17 kt on the jets, 110 then 120 kt in super cruise). Each step that works sets a **ship record** in the logbook; each risks light damage that goes to the engineering computer for repair (`trials.js`). Marcus's "notices when the Captain is pushing the boat too hard" and Ryan's pride in the fusion plant both play here.
- **Two meanings of AO:** the charter's **Area of Operations** (below) is the whole box the ship may work in. The **Trials AO** is a small area inside it, assigned for commissioning. Okafor's orders call it "the Area of Operations (AO) located at …", which is normal naval usage for a tasking area; ARIA's topic about "our Area of Operations" means the charter box.
- **The escort:** while Sea Trials runs, the O.E.R.A. support ship *Seaward* and the cutter *CGC Vigilant* patrol the Trials AO on AIS (`trials.js`).
- **Not built yet:** hostile contacts beyond the poacher and pirate factions in `data/world/factions.json`.

## Areas of Operation (owner, 2026-11-20)
The Aqua Nova is advanced enough that the nations behind O.E.R.A. will not let her go anywhere. The **Area of Operations** (AO) is the box the charter allows, and it is **political, not physical**: the ship could physically go further. In the game the AO is the charted area. **Outside it is a no-transgression zone**, drawn on the chart as a red hatched band with a dashed limit line.
- **Where it is now:** 30°N to 42.4°N and 74.63°W to 0°W (Woods Hole, the shelf, Hudson Canyon, the abyssal plain, the Mid-Atlantic Ridge, the Azores and the Iberian coast), **minus the north-east block** (north of 40°N and east of 70°W) where there is no chart data yet. That block is red until the tiles arrive.
- **In play:** Helm warns about 6 nm out ("the limit of our Area of Operations is about N miles ahead. We are not cleared to cross it"). At the line the ship stops, with no damage ("That is the limit of our Area of Operations. We are not cleared to go further. All stop."). Plotting a course outside is refused ("outside our Area of Operations").
- **ARIA** has an "Ask about… our Area of Operations" topic: the funding nations agreed on a box, the charter lets O.E.R.A. operate in those waters and no others, neither ARIA nor Helm can take the ship over the line, and only Admiral Okafor can redraw it, with the governments in the room.
- **Story use (ideas, not built):** the AO can be redrawn by a mission, a decision or a message from Okafor; crossing it on purpose could be the real cost of a Captain's choice (the theme again); the Halcyon distress call sits at 40.3°N 69.5°W, which is **just outside the AO today**, so answering it is a choice about whether to cross the line. The Titanic Wreck Site (41.73°N 49.95°W) is also outside until a 40–45°N, 50–40°W tile is exported.

## Timeline
- **Backstory:** O.E.R.A. (Oceanic Exploration and Research Alliance, a joint venture of several nations) builds the Aqua Nova at Woods Hole. Captain Elena Voss, a Navy veteran, is instrumental in the project and insists on a security officer and a hull that can do more than research.
- **A few days before sea trials:** Voss is relieved of command at short notice. The reason is not given. ARIA was in the room and has not said what she saw. This is the first long thread.
- **Day one** (50 years after the day the player first starts the game, 06:00; older saves and docs say 16 Aug 2074, see `TIME_CRUISE_AND_START.md`): the player, a retired naval captain who came as an outsider to help bring the systems online, is given command. Admiral Okafor chose the player personally.
- **Early game:** the commissioning trip to the Trials AO (depth and speed trials, records), charting on the way home, first survey. Quiet and teaching, with the theme planted: OERA wants the survey data, and some of it is wanted by someone other than the scientists.
- **First real choice:** the Halcyon distress call (hidden contact in `commsContacts.json`, HF 4.125 MHz, 40.3 N 69.5 W). Nicole hears it first because it is on an old frequency. It lies outside the Area of Operations (see above).

## Crew (bios in `contacts.json`; traditional pronouns throughout)
- **Captain (the player).** Retired naval captain with a systems background. Outsider at first, then in command. Believes in the peaceful mission.
- **ARIA, Executive Officer (she).** Built from decades of deep-sea mission records as a crew member, not a tool. Calm, candid, allowed to disagree on the record. Does not claim to feel. Was present at Voss's relief and has said nothing. *Use:* the Voss thread; she should never lie, only decline to say.
- **Marcus Chen, Helmsman (he).** Navy coxswain, nine years on small boats in bad water, then ferrying scientists to a research sub. Precise, dry, hates being rushed in harbour. *Use:* competence; notices when the Captain is pushing the boat too hard.
- **Dr. Samira Patel, Chief Science and Medical Officer (she).** Emergency doctor turned marine biologist, ship's doctor on three expeditions. Chosen by Voss personally. *Use:* science and crew health; first to say what a discovery might cost.
- **Alex Torres, Sensors (he).** Six years in a Navy sonar shack. Reports only when sure. *Use:* the contact he is not sure about, and whether the Captain trusts a "probably".
- **Ryan Doyle, Chief Engineer (he).** Boston Irish, from Southie; his father ran harbour tugs. Twenty years in merchant ship engine rooms, then the team that commissioned the fusion plant. Loud, superstitious about his reactor (talks to it like a horse), fixes things with parts nobody planned to use. *Use:* the ship's heart; pride in the fusion plant during the trials; the first up all night when something breaks.
- **Lt. Andre Washington, Security (he).** Twelve years a Marine (Force Recon, embassy duty, boarding teams in the Gulf). Six foot five, sleeves of tattoos (the Corps emblem, the names of men he served with, an anchor his daughter drew that she insists is a whale), a laugh you hear two decks away, quiet and exact when it counts. Voss insisted on him over the science side's objections. Believes a ship that goes deeper than anyone will meet something it cannot talk to. *Use:* the voice of the other side of the theme; never a villain.
- **Nicole Brooks, Communications (she).** Signals officer, then four years at a polar station with one satellite window twice a day. Knows what a delayed message costs. Hears old frequencies first. *Use:* Halcyon.

- **Appearance** (portraits in `tablet/retro/assets/crew/`, sources in `art_src/crew/`; one look per person, keep new art to it):
  - ARIA: no body. A glowing blue holographic brain of linked nodes over a projector ring.
  - Marcus Chen: short dark hair, warm brown skin, a calm half-smile; seen over his shoulder at the helm console, navy uniform with the ship's patch.
  - Dr. Samira Patel: long dark curly hair tied back, white lab coat over the navy uniform; in the lab with a tablet and a sample tube.
  - Nicole Brooks: at the comms station (a stand-in picture; the owner wants an over-the-shoulder pose like Marcus).
  - Still to draw: Alex Torres; Ryan Doyle (red-brown hair, freckles, sleeves rolled, grease on the hands, fifties); Andre Washington (very tall and broad, close-cropped hair, tattooed forearms, the uniform a size too small at the shoulders).

- **Where they work** (the Captain meets them there, then can call them): bridge = Marcus (helm), Nicole (comms, left console), Alex (sensors, right console; may move to a sonar room off the bridge if Marcus takes the right console); launch bay = Lt. Washington; science lab and sick bay = Dr. Patel; engineering = Chief Doyle; ARIA everywhere.

## Factions (`data/world/factions.json`)
- O.E.R.A., Civil Harbour Authority and the Meridian Free Colony are friendly; freight, fishing, yachts, Sable Offshore Energy and two mining consortia (Deepcut, Abyssal Metals) are neutral; Concord Naval Command and Ridgeline Extraction are wary; the Grey Net Fleet (poachers) and the Black Tide Syndicate (pirates) are hostile. The miners and the colony are where the theme bites: the sea floor as a resource.

## Contacts
- **Admiral Catherine Okafor, Director of Operations (she).** Retired rear admiral. Argued for years for a ship that can go where no one else can and come back. Answers to a board and to the funding governments, who want different things. **Draws the Area of Operations with them.**
- **Cdr. Sarah Mitchell, Harbour Master, Woods Hole (she).** Retired Coast Guard, eleven years running the harbour. Knows every vessel by sound. Keeps her opinions of the Aqua Nova to herself, mostly.
- **Dr. Thomas Webb, Research Coordinator (he).** Marine ecologist who wants data, not discoveries. Disagreed with Voss, politely and at length, over carrying anything that is not for science.
- **Captain Elena Voss (offstage, she).** Veteran Navy officer, instrumental in the project, not convinced it should be solely a research vessel. Firm but fair. Where she is now, and why she was relieved, is the first long question.

## Names changed 2026-11-27 (owner: a more varied crew, 90s archetypes, before the portraits are made)
- Lt. **Daniel Kim** is now **Andre Washington**, a big African American ex-Marine with tattoos.
- Chief Engineer **Ryan Chen** is now **Ryan Doyle**, Boston Irish (two Chens was confusing). The "no relation" running joke is gone. "Commander Chen" in old text meant either man; it is now Marcus (helm) or Chief Doyle (engineering).

## Names changed 2026-11-19 (owner: names are not important, they should fit the person)
- Admiral **Elena Vasquez** is now **Catherine Okafor** (two Elenas was confusing). Voss keeps Elena, since the PDFs use it.
- Dr. **Marcus Webb** is now **Thomas Webb** (Marcus Chen keeps Marcus).
- Gender-neutral first names were made clear, so traditional pronouns read naturally: Sam Patel is now **Samira**, Riley Chen became **Ryan** (now Ryan Doyle), Jordan Kim became **Daniel** (now Andre Washington).

## Other congruity checks
- O.E.R.A. is "Oceanic Exploration and Research Alliance" everywhere (the Comms inbox said "Ocean").
- Ryan's very first bio said his solutions had "saved the ship on more than one occasion", but the ship is new. Fixed.
- The Characters PDF lists a different original cast (Marcos Patel engineer, Dr. Lila Moreno, Lt. Gabriel Tanaka). The game's cast is treated as current.
- The Chapters PDF has the player as a consultant who later becomes Captain. The game compresses this into day one; the Captain bio keeps both.
- Crew pleasantries mix "Captain", "Commander" and "Sir" on purpose, for variety.
- No save conversion: the owner has no saves and restarts the game after changes like these (2026-11-27). Do not write code to convert old saves.
