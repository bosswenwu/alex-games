# Game change log

Persistent handoff notes for future agents. Add a new entry for each user-visible game change; do not remove earlier entries.

## 2026-09-26 — 沙海奇境 第九轮（云端）：参考图风格的草地与植被

**Scope:** 沙海奇境 (`games/minecraft/index.html`) only. The user sent a high-quality Minecraft village screenshot as the visual target.

| Change | Player-visible behavior |
| --- | --- |
| Grass tone variation | Grass tops, tall-grass tufts and leaves get low-frequency world-space tone/hue variation (darker blue-green vs. sunlit yellow-green patches plus slight per-block jitter), so large meadows no longer look like one flat sheet. Implemented in the `mainProg` fragment shader by atlas-tile id; no vertex-format or uniform changes. |
| Meadow tufts & flowers | Plains, forest, savanna, swamp and taiga now grow clustered tall-grass tufts (noise-based meadows vs. bare patches) with occasional roses/daisies. Desert, mesa, salt lake and volcano stay barren as before. Plants remain non-solid and are skipped by `groundY`, so spawning and collision are unaffected. |
| Mossy cobblestone | Atlas tile 96 repainted with a narrower moss palette and less relief so it no longer looks noisy up close. |

**Verification:** inline script `node --check`; headless Chromium `?selftest=1` **322/322** (new check: plains chunk tuft coverage 2–40%, barren biomes have zero tuft multiplier, shader contains the grass-variation code); before/after screenshots at 极致 quality from the same camera.

## 2026-09-25 — Multi-game design improvements

**Scope:** Updated six games. 沙海奇境 (`games/minecraft/`) was explicitly excluded and not modified.

| Game | Player-visible change | Files |
| --- | --- | --- |
| 深渊圣所 | Added the rare 裂潮棱片 relic. A successful dash triggers a cyan shockwave that can damage up to six nearby enemies; pulse count is exposed through the debug state. | `games/abyss/assets/deep-content.js` |
| HAVEN | Added deterministic desert oasis generation with a spring, sandstone shore, palms, HUD identification, and debug lookup. Existing block IDs and save format are unchanged. | `games/haven/haven.js` |
| 星际突围 | Added paired muzzle flashes and a brief ship recoil while firing; overdrive changes the flash color. Exposed the effect state through the debug API. | `games/nebula/index.html` |
| 钢铁前线 | Added enemy firing telegraphs: a dashed aim line and a pulsing player warning ring near shot release. Documented the new debug fields. | `games/tank-strike/index.html`, `games/tank-strike/README.md`, `games/tank-strike/SPEC.md` |
| 三国塔防 | Selected attack towers show their range, in-range enemies, and the current target/priority with a lock-on overlay. Exposed target information through the debug API. | `games/three-kingdoms/index.html` |
| 竹知了 | Added short-lived airflow ripple feedback driven by player input, including at low rotor speeds; exposed wake strength through the debug API. | `games/zhuzhiliao/index.html` |

**Verification recorded for this change:**

- All six game owners performed targeted checks; reported checks include browser gameplay/API state changes, desktop/mobile layout checks, and no observed browser console errors.
- HAVEN reported 287 self-tests passed and 0 failed, plus deterministic seeded oasis generation.
- JavaScript syntax checks passed for the changed HAVEN and 深渊圣所 scripts; `git diff --check` passed for the combined change.
- Direct device touch and screenshot inspection were not available for every game; see the owning agent's verification notes if further detail is needed.

**Delivery:** Commit `7053c43` (`feat(games): enrich combat feedback and exploration variety`) was pushed to `origin/main`.
