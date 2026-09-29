# Game change log

Persistent handoff notes for future agents. Add a new entry for each user-visible game change; do not remove earlier entries.

## 2026-09-29 — 沙海奇境：地热喷口选址避开建筑（多种子自测巡检，bug 修复会话）

**Scope:** 沙海奇境 (`games/minecraft/index.html`) only. Generation fix for the geothermal-vent (间歇泉) placement; no test assertions loosened or removed. Did not touch the C-key dodge / `foeStrike()` / global key handler (Manus) or any shader/render/water code (cloud). (The village door-standing seed bug found in the same sweep was fixed independently on main by PR #37.)

**Found by:** running `?selftest=1` across many world seeds with `tools/headless.mjs`. On seed 2718281 the assertion 「间歇泉: 地热喷口(120)只在黑沙火山/盐湖生成…」 failed with `site=-523,-521 gen=false`.

| Change | Details | Files |
| --- | --- | --- |
| Vents no longer placed where a building will pave them | `geyserSites()` picked vent spots in volcano/saltlake by `heightAt`, but `placeGeysers` runs before `buildStructures`, so a structure whose clear box covers the spot erases the vent (for that seed a `city` — the generic structure table also applies to volcano — laid asphalt road over the vent at `-523,45,-521`). The site list then named a vent that the real chunk doesn't contain. Now `geyserSites()` skips any spot a nearby building covers, so the list matches the generated blocks and stays consistent with the runtime eruption check. | `games/minecraft/index.html` |
| `STRUCT_RAD` hoisted + `structureCovers(x,z)` | The per-type clear-box radii (`RADII`) were local to `buildStructures`; hoisted to a module-level `STRUCT_RAD` (placed after `VIL_N`) so both `buildStructures` and the new `structureCovers(x,z)` predicate use one table. `structureCovers` scans the 3×3 neighbouring structure cells and tests the point against each building's `±rad` box (rad bounds all of a building's blocks, since `buildStructures` culls by it). | `games/minecraft/index.html` |

**Verification (`tools/headless.mjs`, SwiftShader):**
- `vm.Script` compile-check of the inline script: clean.
- Geyser-site check (mimics the unchanged self-test: first vent of the first vent-bearing chunk) on 6 seeds → all intact (`gen=true`, `other=true`). Seed 2718281's first vent moved from the covered `-523,-521` to the intact `-488,-536`.
- `?selftest=1` on repro + varied seeds (2718281 / 314159 / 8675309 / 1 / 42) — see PR for the run.

## 2026-09-29 — 沙海奇境 第十二轮（云端）：倒影跟着最近水面 + 雨天湿地面 + 雨滴涟漪/水花

**Scope:** 沙海奇境 (`games/minecraft/index.html`) only, desktop. Rendering/weather visuals; no new keys, blocks, atlas tiles or save fields. Did not touch the C-key dodge / `foeStrike()` / global key handler (Manus round 15).

| Change | Player-visible behavior |
| --- | --- |
| Reflections follow the nearest water | The planar reflection (高/极致) no longer assumes sea level: every 0.5 s `pickReflY()` finds the nearest water surface below the camera (under the player first, then rings out to 32 blocks) and mirrors around it, so village ponds, oases and raised rivers reflect correctly. Falls back to sea level when no water is found. |
| Wet ground in rain | While it rains, open-sky blocks darken over ~8 s; tops gain a sky/sun sheen, and noise-shaped puddles show stronger reflections. Everything dries over ~40 s after the rain stops. Off on 低 quality; roofed/shaded blocks stay dry (sky-light gated). |
| Rain ripples on water | During rain/storms, water tops show expanding drop rings (two offset hash grids), denser in storms (`rainK` 0.6 rain / 1.0 storm, eased over ~3 s). Fades out 32–52 blocks away; skipped underwater. |
| Rain splashes | Within ~20 blocks, small splash particles pop on open-sky ground and water (≈30/s rain, ≈50/s storm, halved on 低). |
| Test robustness | The round-11 drive-HUD self-test now moves to a solid-ground column before checking height-above-ground; before, it failed whenever it landed on water or a tree top. |

**How:** `pickReflY`/`waterTopAt`/`reflY` in the reflection pass (`uReflY`, clip plane, entity filter); `mainProg` `uWet` + `wetK`/`tickWetness(dt)`; `waterProg` `uRain` + `rainRing()`; `rainK`/`tickRainSplash(dt)`. Both ticks run after `tickDriveHud(dt)`. The rain ripples were written by a helper agent and merged here.

**Verification:** `node tools/headless.mjs selftest` **338/338** after merging main (#37–#40), including 2 new round-12 assertions. The first run failed only the drive-HUD height check (the location issue above); it passes after the fix. Headless SwiftShader screenshots: a village pond during a storm (reflection on, `reflY` = 34.86, pond above sea level) and wet ground in rain; no console errors. Mobile not checked (desktop-only scope).

## 2026-09-28 — 沙海奇境: village market doorway clearance

**Scope:** 沙海奇境 (`games/minecraft/index.html`) only. A deterministic village-layout reliability fix; no new controls, blocks, or save fields.

| Change | Player-visible behavior |
| --- | --- |
| Market-post clearance | If one of the market canopy posts would occupy a house's villager standing cell just outside its doorway, the whole market is moved by one grid cell along a deterministic candidate direction. Candidate positions are rejected if the stall footprint overlaps a reserved house footprint. All unaffected villages retain their original market position. |

**Verification:** `node tools/headless.mjs selftest` **331/331**. An additional browser-side layout audit checked **1,024** deterministic village centers across both 6- and 8-slot layouts: no market post overlapped a doorway; 40 conflicting layouts were moved exactly one cell; no layout required a larger move. The new self-test also directly checks the market-post/doorway invariant.

## 2026-09-28 — 沙海奇境 第十一轮（云端）：载具驾驶 HUD + 倒影里的生物与载具

**Scope:** 沙海奇境 (`games/minecraft/index.html`) only. No gameplay/physics changes; no new keys, blocks or atlas tiles.

| Change | Player-visible behavior |
| --- | --- |
| Vehicle HUD | While riding, a jet-style green HUD overlays the screen (hidden in photo mode / on death / after dismounting). All vehicles: heading tape at the top (0 = N, 90 = E) and speed in km/h (from per-frame displacement; teleports ignored). Airliner & hover bike: artificial horizon with a 10° pitch ladder, altitude above sea level, height above ground/water (amber warning under 4 m in the airliner) and climb rate. Car / horse / chariot / camel: speed dial at the bottom-left, plus the camel's dash cooldown. Drawn on a 2D canvas at ≤30 fps. |
| Entities in water reflections | The round-10 planar reflection now also draws mobs, ridden vehicles and arrows within 40 blocks and above the water, so a plane skimming the sea or a camel on the shore shows up in the water. |

**Verification:** `node --check`; `node tools/headless.mjs selftest` **330/330**, and 330/330 with another random seed (new check: vehicle classification, heading, speed from displacement incl. teleport rejection, height above ground, HUD shown only while riding). Screenshots riding an airliner over the sea and a car on land at 极致. One car screenshot rendered only sky (camera heading had drifted to 198°); it could not be reproduced on re-run with the camera confirmed in air, and is believed to be a test-setup artifact.

## 2026-09-28 — 沙海奇境 第十轮（云端）：海平面水面的平面反射

**Scope:** 沙海奇境 (`games/minecraft/index.html`) only; the "water reflections" item from the user's reference screenshot.

| Change | Player-visible behavior |
| --- | --- |
| Planar water reflections (高 / 极致 quality) | Sea-level water now mirrors the shore: sandstone, grass tufts, flowers, trees and buildings appear upside-down in the water and wobble with the waves. Where no terrain is reflected, the existing sky/cloud Fresnel reflection is kept. Reflections stay visible even when looking down at the water (stylized, shader-pack-like). Ponds above sea level keep sky-only reflections. 低 / 中 quality are unchanged. |

**How:** a mirrored camera (pv × reflect about y = `WATER_Y`+0.86) redraws opaque terrain and cross plants within 6 chunks into a half-resolution RGBA texture (cleared transparent); `mainProg` gained a `uClipY` discard so underwater geometry doesn't block the mirror; culling flips to BACK for the mirrored pass. `waterProg` samples the texture in screen space, distorted by the wave normal. The pass is skipped when the camera is underwater, below the surface, more than 90 blocks above it, or when no water chunk was drawn in the previous frame. New preset field `refl` (0.5 on 高/极致).

**Verification:** inline script `node --check`; `node tools/headless.mjs selftest` **329/329** and 329/329 with another random seed (new check: presets, mirror matrix, FBO creation, skip conditions, shader uniforms); on/off screenshots of the same shoreline at 极致.

## 2026-09-28 — 沙海奇境: round-9 grass self-test made seed-robust (cloud)

**Scope:** test-only change in `games/minecraft/index.html` (no player-visible behavior change). The round-9 check "plains grow tuft meadows" searched a fixed ±60-chunk window every 3 chunks and required ≥3 plains chunks; under `tools/headless.mjs`'s seed only 2 were found, so it failed on main even though coverage was a normal 7.3%. The search now spans ±90 chunks every 2 chunks and needs ≥2 plains chunks.

**Verification:** `node tools/headless.mjs selftest` **328/328** (was 327/328 on main); also 328/328 with a different random seed via the previous Playwright runner.

## 2026-09-26 — 沙海奇境: faster chunk meshing (local round 9 ③)

**Scope:** 沙海奇境 (`games/minecraft/`) only. Performance-only; rendered output is byte-identical.

| Change | Details | Files |
| --- | --- | --- |
| Local block lookup in `buildChunkMesh` | The chunk plus a 1-block border (18×18 columns) is copied column-by-column into a reusable `Uint8Array`. Each of the ~72k per-chunk block lookups is now a single index instead of a `gb()` call that built a `"cx,cz"` key and did a Map lookup. Before, the lookup cache thrashed at chunk borders. | `games/minecraft/index.html` |
| Reusable typed mesh buffers | Vertices and indices are written into preallocated `Float32Array`/`Uint32Array` buffers that double when full, and upload directly via `subarray`. This removes per-chunk array growth and conversion garbage. | `games/minecraft/index.html` |
| Predicate lookup tables | `OCCLUDE`/`SKY_OCC`/`EMISSIVE`/`OPAQUE` inside the mesher are replaced with 256-entry tables built from the same predicates (3 AO samples per vertex). | `games/minecraft/index.html` |
| Result | Average mesh time 4.27 → 3.19 ms per chunk (−25%, 80 chunks, headless Chrome on RTX 5060 Ti). Less GC churn while streaming. | — |

**Verification:** Output of the optimized build vs the pre-change `HEAD` build was hashed on the same fixed seed (`?seed=424242`, 49 chunks, 2.42M vertex/index elements): identical hash. `?selftest=1` passed 327/327 (new regression check: padded lookup vs per-block `gb()` produce element-identical buffers, and all lookup tables match the predicates for all 256 IDs).

## 2026-09-26 — 沙海奇境: trial keys, trial vaults and ominous trials (local round 9 ②)

**Scope:** 沙海奇境 (`games/minecraft/`) only. Extends the 奥西里斯试炼厅 under each pyramid. Block IDs 121–124, atlas tiles 301–305 (claimed in issue #11).

| Player-visible change | Details | Files |
| --- | --- | --- |
| Trial keys (试炼钥匙) | Each cleared trial wave drops one key (three per run). Key counts appear in the crafting panel's bag row. | `games/minecraft/index.html` |
| Trial vaults / ominous vault | The trial hall now has two 试炼宝库 under the north wall and one 不祥宝库 on the south side. Right-click with the matching key to open. Each vault opens once, then goes dark (persisted via blockDiff). Vaults cannot be mined. Not to be confused with the older 封印宝库 opened with **U**. | `games/minecraft/index.html` |
| Ominous trial (不祥试炼) | After the first clear, the hall can be challenged once per in-game day. Enemies have ×1.5 HP and are elite, and the last wave has two Anubis guards. Each wave drops an ominous key (不祥钥匙). | `games/minecraft/index.html` |
| Loot | Trial vault: gold 3–6, gems 1–2, relics 2, energy core 1, +25 XP. Ominous vault: gold 6–10, gems 3–5, relics 5, cores 3, +60 XP, plus a 35% chance of +1 level to a random weapon enchantment. | `games/minecraft/index.html` |
| Save | New `trialVault` field (keys and per-hall ominous clear day). Older saves load as zero keys. | `games/minecraft/index.html` |

**Verification:** `?selftest=1` passed 326/326 (3 new checks: vault placement; key drops, ominous trial once per day with elite ×1.5 waves; vault rules for missing key, single use and wrong key type, plus save round-trip). The existing trial-hall structure test was updated to skip vault cells. Headless CDP screenshot of the two trial vaults.

## 2026-09-26 — 沙海奇境: geothermal geysers (local round 9 ①)

**Scope:** 沙海奇境 (`games/minecraft/`) only. Coordinated in GitHub issue #11 (local claimed block IDs 120–129, atlas tiles 300–309).

| Player-visible change | Details | Files |
| --- | --- | --- |
| Geothermal vents (地热喷口, block 120) in 黑沙火山 / 枯骨盐湖 | About 35% of those biome chunks get 1–3 vents, each ringed by basalt or salt crust with clear air above. Positions are deterministic per chunk (`geyserSites`). | `games/minecraft/index.html` |
| Periodic eruptions | Each vent runs a ~7 s cycle: idle steam wisps → 0.4 s spark/rumble warning → 1.4 s steam column. The player or any mob standing on the vent is launched about 8–9 blocks up. | `games/minecraft/index.html` |
| Softer landing, mace combo kept | After a steam launch, fall damage is ×1/4. Fall height is still tracked, so a 塞特之锤 smash from the apex keeps full damage. | `games/minecraft/index.html` |
| Mining a vent | Breaking a vent yields basalt, and the vent stops erupting. | `games/minecraft/index.html` |

**Verification:** `?selftest=1` passed 323/323 (2 new checks: generation only in the two biomes with ring and air gap; lift on eruption, no lift when idle or 2 blocks away, fall damage ×1/4). Also ran headlessly through a new CDP driver on real GPU (RTX 5060 Ti).

## 2026-09-26 — 沙海奇境 第九轮（云端）：参考图风格的草地与植被

**Scope:** 沙海奇境 (`games/minecraft/index.html`) only. The user sent a high-quality Minecraft village screenshot as the visual target.

| Change | Player-visible behavior |
| --- | --- |
| Grass tone variation | Grass tops, tall-grass tufts and leaves get low-frequency world-space tone/hue variation (darker blue-green vs. sunlit yellow-green patches plus slight per-block jitter), so large meadows no longer look like one flat sheet. Implemented in the `mainProg` fragment shader by atlas-tile id; no vertex-format or uniform changes. |
| Meadow tufts & flowers | Plains, forest, savanna, swamp and taiga now grow clustered tall-grass tufts (noise-based meadows vs. bare patches) with occasional roses/daisies. Desert, mesa, salt lake and volcano stay barren as before. Plants remain non-solid and are skipped by `groundY`, so spawning and collision are unaffected. |
| Mossy cobblestone | Atlas tile 96 repainted with a narrower moss palette and less relief so it no longer looks noisy up close. |

**Verification:** inline script `node --check`; headless Chromium `?selftest=1` **328/328** after merging local round 9 (new check: aggregate tuft coverage over 8 plains chunks is 2–40%, barren biomes have zero tuft multiplier, shader contains the grass-variation code); before/after screenshots at 极致 quality from the same camera.

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

## 2026-09-28 — 沙海奇境: weapon durability and altar repair (local round 12)

**Scope:** 沙海奇境 (`games/minecraft/index.html`) only. No new controls, blocks, atlas tiles or external dependencies.

| Change | Player-visible behavior |
| --- | --- |
| Weapon wear | Sword / 拉之烈阳剑, 塞特之锤 and bow now lose durability on successful melee hits, heavy smashes and arrow launches. Durability is shown by a green / yellow / red meter in the hotbar; selecting a weapon shows remaining uses. |
| Condition feedback | Damage scales down gradually with wear, but remains at least 70% at zero durability; gear is never destroyed. A warning appears below 20%. |
| Repair at the J altar | The existing 神庙武器祭坛 panel now shows each owned weapon's condition and distinct material costs. One repair restores full durability; insufficient materials change neither gear nor inventory. |
| Save compatibility | `gearWear` is saved and restored. Older saves start with full durability, malformed wear values are clamped, and a new world resets wear. |

**Verification:** `node tools/headless.mjs selftest` **334/334**; screenshot inspected for the altar panel and all three hotbar meters; `git diff --check` passed.

## 2026-09-28 — 沙海奇境: cinematic title screen and loading feedback (local round 13)

**Scope:** 沙海奇境 (`games/minecraft/index.html`) only. No new controls, save fields, assets, blocks, or external dependencies.

| Change | Player-visible behavior |
| --- | --- |
| Animated title scene | The main menu gains a dusk sky, sun glow, stars and gently drifting dune layers, plus staggered title/brand/menu entrance animation. The visual layers are CSS-only and isolated to the title screen. |
| Loading transition | The disabled start button is paired with a two-stage progress bar driven by the existing world-generation loop; it reaches 100% and changes to a ready state when the world is ready. Progress is exposed through an accessible `role=progressbar` and `aria-valuenow`. |
| Responsive/accessibility polish | The menu adapts to compact landscape viewports, keeps the primary action and key controls visible, provides keyboard focus outlines, and disables ambient/entrance motion for `prefers-reduced-motion`. Pause/death overlays retain their prior styling and behavior. |

**Verification:** `node tools/headless.mjs selftest` **335/335**; inspected headless screenshots at 1280×720 and 844×390 landscape; browser smoke verified ready progress/ARIA at 100%, no desktop overlay overflow, and pause-state class isolation; `git diff --check` passed.

## 2026-09-28 — 沙海奇境: pause hub and persistent settings (local round 14)

**Scope:** `games/minecraft/index.html` only. No world-save schema changes, new assets, block IDs, gameplay hotkeys, or external dependencies.

| Change | Player-visible behavior |
| --- | --- |
| Pause hub | The title and pause menus expose Settings and Controls; pausing also exposes an immediate-save button using the existing save path. Resume/new-world behavior is unchanged. |
| Graphics | Four visual presets (low/medium/high/ultra) have a selected-state panel and reuse existing `setGfx`, `sandsea_gfx`, `O` shortcut, and performance auto-downgrade. |
| Background music | Music on/off and a 0–100 volume slider persist independently in `sandsea_music_v1` and `sandsea_music_volume_v1`. Music uses its own WebAudio gain bus; sound effects are unchanged, and `M` stays synchronized. |
| Accessibility/responsive UI | Dialog semantics, focus return/trap, close button/backdrop/Esc, concise controls list with a link to full help, and compact landscape/portrait layouts. Short-landscape title menu remains within the viewport. |

**Verification:** `node tools/headless.mjs selftest` **336/336**; browser UI smoke confirmed the settings/persistence/Esc checks, and a real click in a disposable Chromium profile wrote a valid save (`seed` present) and showed success; inspected screenshots at 1280×720, 844×390 and 390×844; title-menu scroll metrics equal viewport dimensions at 1280×720 and 844×390; `git diff --check` passed.


## 2026-09-29 — 沙海奇境: player Sandstep evade
**Scope:** `games/minecraft/index.html` only. A player-side combat-control slice; no blocks, assets, enemy AI changes, recipes, core upgrades, or world-save schema changes.

| Change | Player-visible behavior |
| --- | --- |
| Sandstep (`C`) | On solid ground, press **C** to travel up to 3.2 blocks in the movement direction (or facing direction when stationary). The landing is collision-checked in 0.2-block steps, so the move stops short of walls instead of clipping through them. |
| Enemy-hit evade window | The step opens a **0.35 s** window that only rejects damage routed through `foeStrike()`—the shared enemy-attack entrance. Fall, traps, poison, weather and lava still use `damagePlayer()` and still hurt the player. |
| Feedback and cooldown | Sand particles, a sand-rush sound and toasts make activation, a successful evade, blocked use and the **4.5 s** cooldown clear. Controls appear in the title help, full help and settings controls. |
| Debug/test contract | `window.__game.sandStep` reports cooldown/window/ready/distance and `useSandStep(x,z)` triggers a testable step. Four self-tests cover movement, the precise damage boundary, cooldown/window expiry and absence of new save fields. |

**Verification:** `node tools/headless.mjs selftest` **342/342** (the four new Sandstep assertions plus all regressions); headless `KeyC` smoke moved 3.2 blocks and reported `cd=4.5`, `evade=0.35`, with both help surfaces present; `git diff --check` passed. Real-time dodge timing remains a desktop point-test item.
