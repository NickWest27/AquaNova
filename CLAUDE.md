# AquaNova: working notes for Claude

Browser game: a deep-sea research submarine, the Aqua Nova. Plain HTML, CSS and ES modules. No build step yet.
Read `ProjectNorms.txt` for code style and `DEVELOPMENT.md` for decisions and known problems.

## Rules
- **Use relative paths only.** Never start a path with `/`. The game is hosted at `/AquaNova/` on GitHub Pages.
  - Imports: `../game/state.js`
  - Files loaded by JS: `fetch(new URL('../data/x.json', import.meta.url))`
  - CSS images: relative to the CSS file.
- **File names are case-sensitive.** Pages is case-sensitive. A Mac is not. Match the case exactly.
- **Logging:** use `dlog()` from `utils/log.js` for routine messages. It is silent unless debug mode is on (`?debug=1`). Use `console.warn` or `console.error` only for real problems.
- **Every page's entry script imports `utils/debugPanel.js` first.** It must run before other code to catch early errors.
- **Touch first.** The owner plays on an iPad. Every action needs a tap path. Do not add keyboard-only or hover-only controls.
- **Do not edit `temp_backup/`.** Old files, kept for reference.
- Work on a branch. Do not push to `main` unless asked.

## Test before you push
```
python3 tools/smoke.py
```
This loads each screen at iPad size from a `/AquaNova/` subpath. It fails on console errors, uncaught errors, 404s and a broken debug panel. Screenshots go to `tools/shots/`. Look at them.

## Debug on the iPad
- Tap three times in the top-left corner (or press `` ` ``) to open the log panel. It has Copy and Clear buttons.
- Add `?debug=1` to a page URL to see routine logs. `?debug=0` turns it off.

## Hosting
GitHub Pages serves the repo at `https://nickwest27.github.io/AquaNova/`. Local option: `start_server.command` (Mac).
