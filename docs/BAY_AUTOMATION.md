# Bay automation: WSKR relaunch, Launch all, crew slows for the bay (2026-11-23)

Extends `LAUNCH_BAY_AND_SHUTTLE.md` and `WSKRS.md`. Code: `tablet/js/bayops.js` (`pumpLaunches`, `launchAllWskrs`, `crewSlows`), orders in `stations/crew.js`. Test: `tools/wskr_bay_test.py`.

## Rules (owner, 2026-11-23)
- **A WSKR recalled for low battery goes out again by itself once it is fully charged** (100%, 2 hours in the rack). Alex says "fully charged and going back out". If the ship is over 8 kt or the bay is busy it waits (over 8 kt with the Captain at the con, Alex says so once). Docked: it waits until undocked. A WSKR the Captain launches by hand cancels the pending relaunch. Saved in `navigation.bay.relaunch`.
- **Launch all WSKRs** (Alex, WSKRs folder): the bay launches every free slot one after another (1 minute each, the most charged first, 20% minimum). Refused when docked, over 8 kt (Captain at the con), or when all are out or none has 20%. If a launch fails part way it stops and Alex says why. Saved as `navigation.bay.launchAll`.
- **Recall all WSKRs** (Alex): the existing recall, now an order.
- **"Deploy sensor buoys" was a stub that only explained that WSKRs launch from the Sensors station. It is gone; Launch all WSKRs replaces it.**
- **When the crew have the con (XO has the con / sleep), Marcus slows the ship to 8 kt for any bay job that is waiting on speed** (taking a WSKR aboard, relaunching one). The standing speed comes back when the job is done (`bay().slow` holds a speed cap only while a job waits). The away log notes it ("Marcus slowed the ship to 8 knots for the launch bay"). **With the Captain at the con nothing slows the ship by itself**: the WSKR waits and the sensors officer asks the Captain to slow down.

## Not done
- Remora and the Tern are not automated; the crew do not launch them while the Captain sleeps except for the existing sleep-time Tern supply run and sample taking.
- The away forecast (ETA on the phone) ignores the slowdown.
