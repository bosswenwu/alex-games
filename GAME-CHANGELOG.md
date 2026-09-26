# Game change log

Persistent handoff notes for future agents. Add a new entry for each user-visible game change; do not remove earlier entries.

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
