# Game change log

Persistent handoff notes for future agents. Add a new entry for each user-visible game change; do not remove earlier entries.

## 2026-10-04 — 沙海奇境 第二十四轮·本地：遗迹远征 MVP 垂直切片

**Scope:** 沙海奇境 (`games/minecraft/index.html`) only. Builds on the existing three-symbol glyph UI; no new blocks, atlas tiles, keys or hotbar slots. **One new save field:** `ruinExpedition`.

| Change | Player-visible behavior |
| --- | --- |
| 🏛 遗迹远征石板 | B 合成台新增配方：砂岩×8 + 金矿石×2 + 钻石×1 → 石板。点击合成即开启一局遗迹远征。 |
| 三符号机关 | 进入远征后立即弹出已有的三符号机关面板；顺序由世界种子 + 局序号确定性生成；错误只清空输入，可无限重试；取消无惩罚。 |
| 三波守卫 | 解对后刷出 3 波遗迹守卫：甲虫/巨蝎 → 木乃伊/骷髅/巨蝎 → 阿努比斯/木乃伊/甲虫。战斗复用现有试炼刷怪逻辑，在玩家周围空地生成。 |
| 幂等结算 | 通关奖励（金×6、钻×2、文物×3、能量核心×2、+120 经验、埃及声望+4）只按 `runId` 发一次；重载/重开同一世界再次完成时只给少量纪念品。 |
| 中断规则 | 死亡、离开机关面板或新开世界都会中断远征；已结算的完成记录随世界存档保留。 |
| 存档兼容 | `ruinExpedition {runs, completed}` 写入 `sandsea_save_v1`；老存档无此字段时归零；坏值/非法 runId 被过滤，负数 completed 钳为 0。 |
| 调试接口 | `window.__game.ruinExpedition` 只读状态，`startRuinExpedition()` / `abortRuinExpedition()` 可调。 |

**How:** `RUIN_EXPEDITION_WAVES`, `ruinExpeditionState`, `ruinExpeditionSave`, `generateRuinExpedition()`, `startRuinExpedition()`, `abortRuinExpedition()`, `tickRuinExpedition(dt)`, `claimRuinExpeditionReward()`, `completeRuinExpedition()`, `spawnRuinMob()`; hooked into `frame()` after `tickExpedition`, into `doDie()` and new-world reset; `RECIPES` 追加石板配方；`collectSave`/`loadGame` 处理新字段；`window.__game` 暴露调试入口；selftest 8q3 覆盖确定性、状态机、幂等、存档往返、旧档兼容。

**Verification:** `node tools/headless.mjs selftest` 目标全绿（基线 392 + 新增断言）于默认种子与 `?seed=424242`。显示态浏览器可手动走通：合成石板 → 解机关 → 三波战斗 → 领奖 → 再次合成提示已结算/只给纪念品。

## 2026-10-03 — 沙海奇境 第二十三轮·云端：躲开木乃伊重击也能精准反击

**Scope:** 沙海奇境 (`games/minecraft/index.html`) only. No save, key, block or atlas changes; riposte numbers unchanged.

| Change | Player-visible behavior |
| --- | --- |
| Riposte from mummy slam | Sandstepping through a mummy's slam now grants the same precise riposte as dodging a scarab charge: 2 s to land one melee hit on **that** mummy for the bonus (combat-mastery upgrades apply). It pairs with the mummy's 0.5 s recovery after the slam. Skeleton arrows and ordinary hits still grant nothing. |
| Riposte cue | The cue names the actual target ("近战命中原木乃伊 / 原圣甲虫 · 仅一次") instead of always saying scarab. The H guide is updated. |
| Test robustness | The Sandstep repeat-keydown test now releases any movement keys left held by earlier tests before pressing C (its new diagnostics showed `land=false`, i.e. the dodge had been steered sideways into a wall), and lists held keys if it ever fails again. |

**Verification:** `node tools/headless.mjs selftest` **385/385** on random seeds ×3 and seeds 424242 / 2718281 / 1 (the mummy Sandstep assertion now also checks the riposte grant and the cue text).

## 2026-10-03 — 沙海奇境 第二十二轮·云端：木乃伊重击前摇（第三种敌人读招）

**Scope:** 沙海奇境 (`games/minecraft/index.html`) only. No save, key, block or atlas changes.

| Change | Player-visible behavior |
| --- | --- |
| Mummy slam | Mummies no longer hit instantly in melee. Within ~2.3 blocks they stop, raise their arms, glow purple and draw a purple curse ring (radius 2.6) on the ground; after 0.75 s they slam: inside the ring you take 5 damage and are knocked outward, outside nothing happens. The slam **cannot** be interrupted by hitting them. Afterwards they recover slowly for 0.5 s (counter window), 2 s cooldown. |
| Counters | Step out of the ring, or Sandstep through it (the slam goes through `foeStrike`). This rounds out three distinct reads: scarab = line charge (sidestep), skeleton = ranged aim (cover / strafe / interrupt), mummy = area slam (leave the ring). |
| Help | The H guide adds a paragraph on mummies. |
| Tests | Two rare, terrain-dependent flaky assertions (Sandstep repeat-keydown, drive-HUD height) now print diagnostics when they fail, so the cause can be read off the next failure. |

**How:** `MUMMY_*` constants, `emitMummyRing`, `mummySlamHits`, `updateMummySlam` (idle/wind/recover), hooked in `updateMobs` after the skeleton block; the mummy is excluded from the generic melee branch; `drawEntity` tints the wind-up purple.

**Verification:** `node tools/headless.mjs selftest` **385/385** on seeds 424242 / 2718281 / 1 (4 new assertions: no damage during wind-up and no interrupt, hit inside the ring; miss after stepping out; Sandstep avoids it; `updateMobs` starts the wind-up instead of hitting). One random-seed run hit the known rare drive-HUD flake (unrelated; diagnostics added). Headless screenshot of a winding-up mummy with its ring checked by eye.

## 2026-10-03 — 沙海奇境 第二十一轮·云端：试炼厅加入骷髅射手 + 沙漠旋风

**Scope:** 沙海奇境 (`games/minecraft/index.html`) only. No save, key, block or atlas changes.

| Change | Player-visible behavior |
| --- | --- |
| Trial hall | Wave 2 of the Osiris trial now includes a skeleton archer (normal: replaces one scarab; ominous: replaces one mummy), so the repeatable trial uses the round-19 aimed-shot read-and-counter. The final wave is still led by Anubis guards. |
| Dust devils | On clear days (sun well up) in arid biomes (desert, mesa, salt lake, canyon), a swirling sand funnel occasionally forms 18–40 blocks away, wanders for 14–22 s, then dies down. At most one at a time; ~90 particles/s on high (half on medium, none on low), capped by the global particle limit; it disappears if the weather changes, night falls or you leave arid ground. Purely visual: no damage or gameplay effect. |

**How:** `TRIAL_WAVES` / `TRIAL_WAVES_OMEN` wave 2 edited; `dustDevils`, `dustDevilOK()`, `tickDustDevils(dt)` (main loop after `tickRainbow`); `updateParticles` gets a `p.dd` branch that orbits each particle around its devil's moving center (radius grows, slow rise) instead of normal gravity.

**Verification:** `node tools/headless.mjs selftest` **381/381** on random seed and seeds 424242 / 2718281 / 1 (2 new assertions: trial wave composition; dust-devil gating, single instance, particle-rate bound and dispersal on weather change). Headless screenshot of a desert dust devil checked by eye (earlier versions scattered sand everywhere or looked too thin; tuned until it reads as a funnel).

## 2026-10-03 — 沙海奇境 第二十轮·云端：雨后彩虹 + 远方天空闪电

**Scope:** 沙海奇境 (`games/minecraft/index.html`) only, desktop. Sky/weather rendering only; no gameplay, save, key, block or atlas changes.

| Change | Player-visible behavior |
| --- | --- |
| Rainbow after rain | When rain or a thunderstorm clears in daytime (not in snow biomes and not after a sandstorm), a rainbow appears opposite the sun: a 42° primary bow (red outside, violet inside) plus a fainter 51° secondary bow with reversed colors. The lower the sun, the higher the arc; with the sun above 42° it sits below the horizon. It fades in over ~4 s, lasts ~50 s, fades out over the last 10 s, dims with weaker sunlight, and clouds/terrain cover it. |
| Distant sky lightning | Every thunderstorm strike now also draws a jagged bolt in the sky, from the cloud base down to the horizon, in the direction of the strike. Its brightness goes bright → dim → bright and then fades, matching the existing screen flash. The ground strike column, thunder and damage are unchanged. |

**How:** `skyProg` gains `uRainbow` / `uBolt` and a `rainbowCol()` helper; the rainbow is added before the cloud layer, the bolt after it (it sits below the cloud base). JS: `RAINBOW_T`, `rainbowT`/`rainbowK`, `rainbowTarget()`, `tickRainbow(dt)` (main loop, after `tickWetness`), `boltA`/`boltSeed`/`boltAlpha()`; `updateWeather` sets `rainbowT` when rain/storm turns clear and records the strike direction.

**Verification:** `node tools/headless.mjs selftest` **379/379** on random seed and seeds 424242 / 2718281 / 1 (2 new assertions: rainbow trigger, day/snow/sand gating and fade; strike direction, flicker curve and shader uniforms). Headless screenshots checked by eye: dusk rainbow over the village (primary + secondary, occluded by roofs/trees) and a storm bolt over the oasis village. An extra stress script (40 strikes, 17 hitting mobs) threw no errors.

## 2026-10-03 — 沙海奇境 第十九轮·云端：能量核心战技（P3 有上限的成长出口）

**Scope:** 沙海奇境 (`games/minecraft/index.html`) only. P3 of the P1–P5 plan, following the user-supplied "round-15 proposal" (core-funded combat mastery). Reuses the existing energy-core currency and B crafting panel; no new currency, keys, blocks or hotbar slots. **One new save field:** `combatMastery`.

| Change | Player-visible behavior |
| --- | --- |
| ⚡ 战技·沙步熟练 | B panel: each level cuts the Sandstep cooldown by 0.4 s (4.5 → 4.1 → 3.7 → 3.3). Max 3 levels; costs 3 / 4 / 5 cores. |
| ⚡ 战技·回砂反击 | B panel: each level adds +10% to the precise-riposte bonus and +1 to its cap (35% / +3 → 65% / +6 at level 3). Max 3 levels; costs 4 / 5 / 6 cores. |
| Panel text | Recipe descriptions show the current level and effect; at max level the recipe locks with "已满 3 级". The H guide mentions both. |
| Saves | `combatMastery {step, riposte}` is saved and loaded; old saves without it start at level 0; bad types become 0; out-of-range values clamp to 0..3; a new world resets both to 0. |

**How:** `MASTERY_MAX`, `combatMastery`, `sandStepCd()`, `riposteRate()`, `riposteCap()`, `restoreCombatMastery()`; `sandStep` uses `sandStepCd()`, `sandRiposteDamage` uses the rate/cap helpers; two recipes appended at the end of `RECIPES` with getter-based `coreCost`/`desc`; `collectSave`/`loadGame`/new-world reset; `window.__game.combatMastery` (read-only).

**Verification:** `node tools/headless.mjs selftest` **377/377** on random seed and seeds 424242 / 2718281 (4 new assertions: escalating cost + cap + cooldown; level-2 cooldown 3.7 s in a real `sandStep`; riposte bonus +3 → +6 and purchase cost; save round-trip, clamping, bad/legacy values, `__game`). Headless screenshot of the B panel checked by eye. Balance in real play is not verified.

## 2026-10-03 — 沙海奇境 第十九轮·云端：骷髅蓄力瞄准箭（P2 第二种敌人读招）

**Scope:** 沙海奇境 (`games/minecraft/index.html`) only. P2 of `docs/SANDSEA-P1-P5-NEXT-CYCLE-PLAN-2026-09-30.md`: one new enemy behavior with a tell and counters that differ from the scarab charge. No new save fields, keys, blocks or atlas tiles; mechs/titan, scarab charge and the precise-riposte rules are unchanged.

| Change | Player-visible behavior |
| --- | --- |
| Aimed shot | Skeletons no longer fire instantly. When ready (in range, line of sight) they stand still for 0.9 s, glow red, and draw a short red aim line from the bow toward you; for the last 0.28 s the aim **locks** (line and glow brighten) and stops tracking. The arrow then flies at the locked point, faster than before (32 vs 26), without leading the target. Damage stays 4 via `foeStrike()`. |
| Counters | Break line of sight (cover) or leave aggro → aim cancels. Strafe after lock → the arrow misses. Hit the skeleton while it aims → interrupted and **staggered for 1.2 s** (cold-grey tint, slow, cannot shoot). Sandstep can dodge the aimed arrow, but only the scarab charge grants a precise riposte. |
| Help | The H guide adds a paragraph on reading and countering the skeleton. |
| Robustness | `updateMobs` skips an empty slot when an earlier mob in the same pass removed more than one mob (found when a test ran `updateMobs` with the whole world's mobs). |

**How:** `SKEL_*` constants, `emitSkeletonAim`, `skeletonFireAimed`, `updateSkeletonAim` (states idle/aim/stagger), hooked in `updateMobs` after the scarab block; `m.chaseNow` records the hostile chase flag; the ranged branch no longer calls `mobShoot` for skeletons; `drawEntity` tints aim/stagger; hostile arrows pass their `tag` to `foeStrike`.

**Verification:** `node tools/headless.mjs selftest` **373/373** on random seed and seeds 424242 / 2718281 / 1 (5 new assertions: aim→lock→fire without tracking; hurt interrupts + stagger; cover/disengage cancels; sandstep dodges without riposte; `updateMobs` no longer insta-shoots for skeletons). Headless screenshot of a locked skeleton (red glow + red aim line) checked by eye. Real-player timing on desktop/touch is **not** verified.

## 2026-10-01 — 沙海奇境 第十九轮·Codex：触屏侧闪与精准反击提示

- 触屏摇杆方向现在与沙步方向一致，支持左右和斜向；松开摇杆仍沿视线前进。键盘和显式调试方向保持原语义。
- 完整帮助显示期间，沙步入口也会拦截触屏调用，避免阅读时误位移。
- 精准反击窗口新增居中的金色倒计时、同目标近战提示与命中确认；帮助/暂停/拍照/死亡/目标离场时隐藏，移动横屏避开血条。
- H 完整帮助新增三步战斗指南。没有新增快捷键、存档字段、依赖，也没有修改敌人 AI、战斗时限、伤害或渲染管线。

**Affected files:** `games/minecraft/index.html`, `tools/sandsea-combat-ui-smoke.js`.

**Verification:** 默认世界及 seed=424242 selftest 各 **368/368 PASS**（原基线 362/362）；浏览器模拟触摸经真实监听器验证摇杆输入、按钮侧移、帮助拦截、释放归中；1280×720 帮助、844×390 反击、390×844 帮助布局截图。测试页面新增检查期间无捕获异常。截图为脚本布景，非真人反击手感验收；RTX 5060 Ti 本机验证不代表低端 GPU 或真实手机验收。

## 2026-09-29 — 沙海奇境 第十六轮·Manus：沙步 v1.1 边界加固

**Scope:** 沙海奇境 (`games/minecraft/index.html`) only. The C-key Sandstep now explicitly refuses to activate while a gameplay panel is open, while airborne, riding, grappling, in water/lava, dead, paused, or otherwise not grounded; repeated keydown events cannot retrigger it. Collision-safe landing remains unchanged in distance and AABB semantics, and the player still follows WASD or view direction as documented. No other key, save field, enemy AI, `foeStrike()` damage logic, shader, or rendering code changed.

**Verification:** Added `ok(...)` selftests for a temporary solid wall, four-sided no-landing space (including no movement/cooldown/evade window), each disabled state including pause, WASD/view direction, and repeat-key behavior. Every test restores player/runtime state and temporary blocks. SwiftShader headless runs: default seed **355/355**, `?seed=2718281` **355/355**, `?seed=424242` **355/355**. Real-device dodge timing remains **待真机点测**.

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
- `?selftest=1` after merging main (5d9b12a, incl. round 13 + selftest speedup): seeds 2718281 / 314159 / 8675309 / 424242 / 1 all **343/343**. On main without this fix, seed 2718281 fails the geyser assertion (342/343, `site=-523,-521 bio=10`).

## 2026-09-29 — 沙海奇境 第十三轮·云端：手持动态光 + 方块光摇曳 + 月光辉光/22° 月晕

**Scope:** 沙海奇境 (`games/minecraft/index.html`) only, desktop. Rendering only; no new keys, blocks, atlas tiles or save fields. Did not touch the C-key Sandstep / `foeStrike()` / global key handler (Manus) or the hotbar logic (only reads `HOTBAR_ITEMS[selSlot]`).

| Change | Player-visible behavior |
| --- | --- |
| Handheld dynamic light | With a light-emitting block selected in the hotbar (and at least one in the bag), a point light at the player's right hand lights the surroundings: bright within ~2 blocks, fading out by ~5–11 blocks, and brighter on faces turned toward the player. Lantern / lava / magma / lit furnace give warm light with a flame-like flicker; crystal, salt crystal, amethyst, neon, glow vein and Ka-heart use their own cool/colored tints. Strength follows the existing block-light curve (strong at night, barely visible at noon). Off on 低 quality, in death, or with no item in the bag. It casts no shadow, so a little light leaks through walls, as in shader-pack dynamic lights. |
| Block-light flicker | The warm pools around lanterns/lava/crystals now "breathe" by about ±8%, using smooth noise that drifts with world position and time, so neighbouring lamps don't pulse in sync. |
| Moonlight atmosphere | The night sky gets a wide, soft, cool glow around the moon. Under thin cloud (medium cover) a faint 22° ice-crystal halo rings the moon, warm on the inside edge and cool on the outside; it does not appear on clear or overcast nights. |

**How:** `mainProg` new uniforms `uHeld` (hand position relative to `uWOrig`, + intensity) and `uHeldC`; JS `HELD_LIGHT` table + `heldLightState(blK, now)` next to `blockLightK`, set once per frame in the main-pass uniform block (the reflection pass reuses it). Flicker is in the `mainProg` block-light line. Moon glow and halo are in `skyProg` (halo after the cloud layer, gated by `uCover`).

**Verification:** `CHROME_PATH=… node tools/headless.mjs selftest` **343/343** (342 on main + 1 new round-13 assertion: warm lantern/cool crystal, night > noon, flicker over time, and no light with an empty bag, a weapon, 低 quality or when dead; shader hooks present). Headless SwiftShader screenshots (seed 424242, 极致, midnight): the same spot holding a lantern vs. holding the sword, showing the warm pool on the sand and cactus; and the night sky at cloud cover 0.4, showing the moon glow and the 22° halo. Not verified by screenshot: the flicker animation itself (checked numerically in the self-test only), colored-crystal tints on screen, and mobile (desktop-only scope). A first attempt passed world coordinates while the shader works relative to the 1024-block origin; the light landed in the wrong place until that was fixed before the screenshots above.

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


## 2026-09-29 — 沙海奇境：Sandstep touch control and HUD feedback (round 16.2)

**Scope:** `games/minecraft/index.html` only. This finishes the player-facing input/feedback slice; it does not change the Sandstep movement, landing collision checks, cooldown, enemy damage boundary, rendering, or world-save schema.

| Change | Player-visible behavior | Files |
| --- | --- | --- |
| Touch control | Adds a 60 px Sandstep button to the existing touch controls, positioned beside the task card and above the tutorial card on landscape screens. It calls the same `sandStep()` path as **C**. | `games/minecraft/index.html` |
| Status feedback | Desktop HUD shows ready/evading/cooldown/success. The touch button mirrors the state with a short success highlight. Successful activation and cooldown no longer create bottom toasts over hearts/hotbar; blocked-use reasons retain their existing feedback. | `games/minecraft/index.html` |
| Runtime-only state | The 1 s success highlight is cleared on pause/death/respawn/new world and is not saved. `window.__game.sandStep` exposes status fields for smoke tests. | `games/minecraft/index.html` |

**Verification:** `node tools/headless.mjs selftest` **356/356** both on the default world and `?seed=424242`; seeded Chromium touch-event smoke at 844×390 triggered the visible control, moved 3.33 blocks, and confirmed the button stays inside the viewport without overlapping the tutorial card. A second touch during cooldown produced no movement and no cooldown toast. Desktop smoke at 1280×720 showed the HUD status with touch controls off; both screenshots inspected; `git diff --check` passed. Simulated browser touch is not a substitute for real-device feel testing.


## 2026-09-30 — 沙海奇境：圣甲虫预警与沙步精准反击（第十七轮）

**范围：**仅 `games/minecraft/index.html`。圣甲虫新增“蓄力预警 → 锁向冲锋 → 收招”攻击节奏；蓄力期间以暖金实体高亮与浮空粒子环提示。受击、失去视线、超出距离或锁定方向明显偏离时会取消冲锋。

**战斗规则：**只有沙步窗口成功避开带圣甲虫冲锋标记的攻击，才获得绑定同一圣甲虫、持续 2 秒的一次性反击。下一次对该目标的近战主击增加约 35% 伤害（向上取整、封顶 +3）；重锤范围副伤害、远程和环境伤害不继承奖励。普通敌击不授予机会。反击状态为运行态，不新增存档字段。

**验证：**`node tools/headless.mjs selftest` 默认世界 **362/362 PASS**，`?seed=424242` **362/362 PASS**；自动截图并目视检查 1280×720 桌面预警、844×390 横屏触控反击、390×844 竖屏旋转提示，脚本布景未报告窗口错误；`git diff --check` 通过。截图由无头 Chromium / SwiftShader 和脚本化状态生成，不代表真人操作时机、真实触屏或低端 GPU 性能结论。合并前仍需真人点测冲锋可读性和反击时机。

## 2026-10-04 — 沙海奇境：遗迹远征三符号机关前端核心

**范围：**`games/minecraft/index.html` 的可复用解密面板与输入状态机；`docs/SANDSEA-META-GROWTH-AFFIX-DESIGN-2026-10-04.md` 为局外成长/装备词缀方案。没有新增方块 ID、快捷键、货币、世界生成、奖励或存档字段；没有改既有战斗数值。机关还未接入遗迹远征地图入口。

| 变化 | 玩家行为 / 接入契约 |
| --- | --- |
| 三符号输入面板 | 3 个大触控按钮和 3 格序列槽；调用方传入 0/1/2 各一次的解与线索文本。线索通过 `textContent` 呈现；解不显示在 UI。 |
| 输入状态机 | 错误选择只清空本轮输入并提示可重试；正确完成关闭面板并调用 `onSolved` 一次；Esc、遮罩或“暂时离开”只取消会话、不记失败。 |
| 输入隔离与键盘可访问性 | 解谜期间阻断游戏快捷键；Tab 焦点在模态层内循环，Enter/Space 保留按钮原生激活；关闭时返还焦点。会话为内存态，不写入 `collectSave()`。 |
| 集成接口 | `openRuinGlyphPanel({solution, clueText, onSolved, onCancel})`；远征入口仍需提供结构坐标、答案/线索映射和幂等奖励结算。 |
| 设计交付 | 提供三条确定性专精树（复用既有核心）、既有文物碎片拆解/重铸、装备品质/词缀池/数值封顶、存档结构建议和分期验收指标。 |

**验证：**`node tools/headless.mjs selftest` 默认世界及 `?seed=424242` 均 **392/392 PASS**；覆盖非法解、重复打开、错序重置、按钮操作、成功回调一次性、键盘屏蔽、Esc/遮罩取消及无新增存档字段。`git diff --check` 通过。无头 Chromium / SwiftShader 检查 1280×720 与 390×844 截图：卡片分别 520×326、350×326 px，三按钮均为 72 px 高且没有视口溢出。模拟截图不代表真人手机/触屏验收；地图入口接线仍待后续切片。


**键盘复核补充：**额外验证 Tab/Shift+Tab 焦点循环、Enter/Space 不被全局门控拦截及关闭后焦点返回；修正后默认与 `?seed=424242` 仍各 **392/392 PASS**。
