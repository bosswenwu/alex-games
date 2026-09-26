# Instructions for coding agents

## Game changes

- Before changing a game, inspect its existing design, controls, save behavior, debug API, and tests. Make the smallest cohesive change that improves the requested visual quality, gameplay, or content variety.
- Treat `games/minecraft/` as **沙海奇境 (Sandsea)**. Do not change it when the requested scope excludes 沙海奇境.
- Preserve each game's core loop, existing controls, save compatibility, and mobile behavior unless a task explicitly asks to change them.
- Validate the affected game in a browser where possible. Check gameplay state through its debug API, console errors, and relevant desktop/mobile layouts; report any checks that could not be performed.
- For every user-visible game change, update `GAME-CHANGELOG.md` in the same change. Record the game, player-visible behavior, affected files, and verification performed. Keep older entries rather than replacing the history.
- Do not commit or push unless the user asks for it.

## Repository notes

- Games are static browser projects under `games/`; the arcade homepage is at the repository root.
- Start a local preview from the repository root with `npx serve .` or another static HTTP server. Some games use browser APIs that do not work from `file://`.
- Read each game's README and `SPEC.md` (if present) before making changes; not every game has its own documentation yet.
- Headless browser checks: `node tools/headless.mjs selftest` runs 沙海奇境's `?selftest=1` (prints PASS/FAIL and failing lines; exit code 1 on failure). `node tools/headless.mjs shot <page> <out.png> [--script setup.js]` takes a screenshot, and `node tools/headless.mjs eval <page> <script.js>` runs a script in the page. The tool needs no npm packages (Node ≥ 22). It starts its own static server for repo paths (e.g. `games/abyss/`), finds Chrome/Chromium/Edge automatically (or set `CHROME_PATH`), and adds `--no-sandbox` when running as root on Linux. Use it when an IDE preview pane is hidden or throttled, because hidden panes freeze pages. `?seed=N` gives a reproducible 沙海奇境 world on a fresh profile.
