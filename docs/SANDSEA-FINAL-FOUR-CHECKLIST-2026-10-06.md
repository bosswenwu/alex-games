# 沙海奇境 第四十轮·收尾四件套具体执行清单 + 本轮实测记录

> **日期：**2026-10-06　**基线：**`34aaf8a`（第三十九轮，508/508 自测，工作树干净）
> **范围：**这是「阶段四：打磨与发布（收尾轮）」剩下的四件事的**可执行清单**，不是新一轮玩法开发。本轮**不改游戏源码**（存档矩阵若发现缺陷则例外，另行修复）；交付物 = 清单文档 + 能无头实测的部分立即实测并记录 + 必须真机/真人的部分按步骤交接。
> **四件套**（对应 `ROADMAP.md` 阶段四剩余项）：① 存档迁移全量矩阵　② 真机性能基线（性能复核）　③ PR C 真人数值调参　④ 手机端评估。

---

## 0. 总览

| # | 事项 | 谁执行 | 本轮状态 | 载体 / 关键工具 |
|---|---|---:|---|---|
| ① | 存档迁移全量矩阵 | **本地可全部执行** | ✅ 已实测（见 §1） | `tools/headless.mjs eval` + 迁移矩阵脚本 |
| ② | 真机性能基线 | 桌面参考：本地已测 ✅ / 真机采样：**待真机** | 🟡 半完成 | `tools/sandsea-perf/baseline.mjs`、`device-monitor.js`、`compare-device.mjs` |
| ③ | PR C 真人数值调参 | **待真人**（需要真实游玩数据） | ⏳ 交接（见 §3） | 设计稿 §7 指标 + 本清单 §3 数值表 |
| ④ | 手机端评估 | 无头视口审计本地已测 ✅ / 真机触屏手感：**待真机** | 🟡 半完成 | `tools/headless.mjs eval/shot --size WxH` + §4 真机清单 |

**结论先行：**① 全量矩阵本轮跑通（字段逐项缺失→默认值全部符合 `loadGame` 契约）；② 桌面 SwiftShader 参考基线已记录（仅回归信号，不代表真机）；④ 移动端视口无溢出、面板可读，触屏手感与低端 GPU 帧率仍需真机；③ 只能由真人游玩数据驱动，脚本与数值表俱备，等待实际游玩。

---

## 1. ① 存档迁移全量矩阵（本轮主执行项）

### 1.1 localStorage 键清单（跨设备/跨版本迁移只关心这几个键）

| 键 | 内容 | 首次引入 | 缺失行为 |
|---|---|---|---|
| `sandsea_save_v1` | 世界存档（种子/玩家/世界时间/方块 diff） | 首版 | 无 → 新世界 |
| `sandsea_meta_v1` | 局外进度（回响/专精/装备词缀/刻印砂） | 第二十七轮 PR A | 缺 → 全新默认（`loadMeta`→`normalizeMeta(null)`） |
| `sandsea_gfx` | 画质档 0/1/2/3 | 设置枢纽 | 缺 → 默认档 |
| `sandsea_music_v1` | 音乐开关 | 设置枢纽 | 缺 → 开 |
| `sandsea_music_volume_v1` | 音乐音量 | 设置枢纽 | 缺 → 默认音量 |
| `sandsea_tutorial_v1` | 新手引导是否已看/跳过 | 第八轮 | 缺 → 展示引导 |
| `sandsea_selftest_guard` | 自测哨兵键（测试专用，正常游玩不产生） | 自测基建 | — |

> 说明：第三十轮「拍照留念」不落 localStorage 键（F2 截图直接下载 PNG）。

### 1.2 世界存档：逐顶层字段「缺失 → 默认值」矩阵

实测方式：以 `collectSave()` 的完整结果作基底，**逐个删除每个顶层字段后 `loadGame()`**，断言该子系统回到 `loadGame` 代码规定的默认值。每个字段单独一次载入，互不干扰。**结果：全量 67/67 通过**（含 §1.3 复合老档、§1.4 meta 六行、§1.5 坏值显式行）。

| 字段 | 归属轮次 | 缺失 → 默认/钳制 | 实测 |
|---|---|---|---|
| `px/py/pz` | 首版 | 有限值校验失败 → 退回落点 `spawnPt`（C1 兜底） | ✅ |
| `yaw/pitch` | 首版 | 0 | ✅ |
| `hp` / `maxHp` / `lvl` / `xp` | 首版 | 20 / 20 / 1 / 0 | ✅ |
| `armor` / `cores` / `kills` / `dayCount` | 首版 | 0 / 0 / 0 / 1 | ✅ |
| `bioSeen` / `landSeen` / `trophies` | 首版起 | 空集合（且按表过滤非法 id） | ✅ |
| `market` | 首版起 | 空（逐 key 重建，非法丢弃） | ✅ |
| `weather` | 首版 | 缺失不改当前天气（避免沙暴永远持续） | ✅ |
| `npc` | 第二轮 | `relics/trades/blessings`=0、`traderMet/oracleMet`=false | ✅ |
| `arch` | 第三轮 | `pottery/pages/digs`=0、`shards`=[]、`setComplete`=false | ✅ |
| `arena` | 古文明大轮（早期） | `bestWave`=0、`cleared`=false、`keys`=0、进行中挑战不跨存档 | ✅ |
| `curse` | 古文明大轮（早期） | `pharaohSlain`=0，进行中诅咒终止 | ✅ |
| `feats` | 尾巴系统（多轮累计） | 全部 0（traps/chariot/bestStreak/elitesSlain/vaultsOpened） | ✅ |
| `faction` | 古文明大轮（罗马/埃及声望） | 0，且钳制到 0..`FAC_MAX` | ✅ |
| `djinn` / `sphinx` / `expedition` / `undead` | 古文明大轮（各自子系统） | 0 / 0,0 / 0 / 0 | ✅ |
| `mythic` | 神话遗物 | 每件碎片 0、`done`=[] | ✅ |
| `bag` | 首版 | 空 Map（坏值不入袋，第八轮矩阵加固） | ✅ |
| `dmgMul` | 首版 | 由 `lvl` 重算（1+(lvl−1)×0.12），存值不越权 | ✅ |
| `sunblade` / `mace` | 第五轮·本地 | false / false | ✅ |
| `ench` | 第五轮·本地 | 每词条 0（按 `ENCH_DEFS.max` 钳制） | ✅ |
| `gearWear` | 第十二轮·本地 | 满耐久（`restoreGearWear` 默认） | ✅ |
| `trialVault` | 第九轮·本地 | `trial/omen`=0、`omenDay`={} | ✅ |
| `potions` | 第五轮·云端 | 每药水 0、生效效果不存档 | ✅ |
| `fish` | 第五轮·云端 / 第七轮·云端（cooked） | 0 / 0 / 0，钓鱼状态关 | ✅ |
| `chests` / `bundle` | 第六轮·云端 | 空 / `owned`=false、items 空（非法 id 丢弃） | ✅ |
| `furnaces` | 第七轮·云端 | 空（输入/燃料/输出按烧炼表白名单） | ✅ |
| `combatMastery` | 第十九轮·云端 P3 | 四键全 0（钳 0..3，含第三十轮 quake/recall） | ✅ |
| `ruinExpedition` | 第二十四轮·本地 | `runs`=[]、`completed`=0、进行中远征强制中断 | ✅ |
| `questIdx/questId/questProg/questDone` | 首版(第六轮起加 id) | 第 0 关 / 0 进度 / 未完成；id 优先于下标 | ✅ |
| `bounty` | 悬赏 | `idx/prog/done`=0 | ✅ |
| `dayT` | 时光偏移 | 缺失不改 `dayShift` | ✅ |
| `spawn` | 出生点 | 缺失保留初始落点 | ✅ |
| `diff` | 方块改动 | 空（只有存档里写过的才恢复） | ✅ |

### 1.3 轮次边界复合老档（不是单字段缺失，而是"那个时代的老档"整体）

- **仅 seed 的最老档** `{seed}`：载入后玩家坐标有限、hp=20、lvl=1、背包空、npc 归零、任务回第 0 关 —— ✅
- **第五轮时代老档**（去掉第五轮之后新增的全部字段：sunblade/mace/ench/gearWear/trialVault/potions/fish/chests/bundle/furnaces/combatMastery/ruinExpedition/bounty，且 meta 键不存在）：载入后 SEED=424242、基础状态完好、所有后加子系统归默认 —— ✅
- **questId 定位**：`questIdx=999`+`questId=<QUESTS[3].id>` → 载入后 `questIdx=3`（id 优先，抗关卡表插位）—— ✅

### 1.4 meta（专精/词缀）存档矩阵

| 用例 | 预期 | 实测 |
|---|---|---|
| 键不存在 → 全默认 | echoes=0、专精全 0、gear=[]、equipped=null、dust=0、pity=0 | ✅ |
| 负数（echoes/streak/dust/pity） | 钳 0 | ✅ |
| 专精越界/非数字 | 钳到 0..4（如 surveyor:99→4） | ✅ |
| 词缀白名单+槽位+组去重 | 非法/错槽/重复 group/越界品质/非整数 tier 全部剔除，equipped 只认包内同槽 item | ✅ |
| 装备包 >24 件 | 截断到 `GEAR_CAP=24` | ✅ |

### 1.5 坏值显式行（记录现状，非缺陷修复）

按设计稿 §8「前端单机无法防止玩家改 localStorage，目标只保证稳定体验」：

| 用例 | 结果 | 处置 |
|---|---|---|
| `hp=-5` | 载入后 hp=-5（未钳制） | 记录；属人为篡改存档。可选加固点：`loadGame` 给 `hp/maxHp/lvl/xp/cores` 加有限值+非负钳制 |
| `lvl=-3` / `lvl=99` | 原样载入（-3 时 dmgMul=0.52） | 同上；`lvl` 负值会压低攻击倍率，但不会 NaN |
| `cores=-7` | 原样载入 | 同上 |
| `questIdx="abc"` | `Math.min("abc"??0, n)` → **NaN**（HUD 任务行可能异常） | 记录；`questIdx` 建议改为先 `Number(...)` 再 `Number.isFinite` 兜底，属低风险加固候选，**待用户拍板再动源码** |
| `faction.rome=999/−3` | 钳制到 `FAC_MAX`/0 | ✅ 已钳制 |
| `ruinExpedition.completed=-5` / 非法 runId | 钳 0 / 过滤非正整数 | ✅ 已钳制 |
| `diff` 非法写入 | 只恢复合法 key | ✅（既有契约） |

### 1.6 复现命令

```
node tools/headless.mjs selftest                        # 508/508（含既有 C2/老档兼容断言）
node tools/headless.mjs eval "games/minecraft/?seed=424242" --timeout 600 <迁移矩阵脚本>
```

---

## 2. ② 真机性能基线（性能复核）

### 2.1 桌面/无头参考基线（本轮已测，只作回归信号，**不是真机结论**）

工具：`tools/sandsea-perf/baseline.mjs`（SwiftShader 软件渲染）。同一格固定种子 `424242`、1280×720、gfx=0（低画质），预热 8 s、采样 20 s、每格 3 次新浏览器重复。

| 场景 | p50 帧时 | p95 帧时 | rAF FPS | 粒子峰值(峰值cap 420) | 长任务/慢帧段/自动降档 |
|---|---:|---:|---:|---:|---|
| `idle` | 16.7 ms | 16.8 ms | 60 | 58 | 无 / 无 / 无 |
| `charge3`（3 圣甲虫固定负载） | 16.7 ms | 16.8 ms | 60 | 79 | 无 / 无 / 无 |

输出文件：`C:\Users\wuge\AppData\Local\Temp\opencode\perf-r39-idle-gfx0.json`、`perf-r39-charge3-gfx0.json`（含 CSV；不入库，仅留档对照）。

> 报告以 gate 字段为准（`HEADLESS_WITHIN_P95_CEILING` 等）。**后续任何性能优化候选**都应与这两个文件同协议对比（`--compare`，≥3 轮），p95 帧时中位数恶化 ≤10% 才放行。
> SwiftShader 是软件渲染回归信号，**不代表真机帧率**；真机样本按 §2.2 采集。

### 2.2 真机采样（待真机执行）

1. 准备设备：**至少一台低端参考机**（如入门 Android）+ 可选中端/旗舰；记录机型、OS、浏览器、GPU renderer、分辨率。
2. 打开部署页面（GitHub Pages 或本地 HTTP），进入世界，等待 10 s 预热。
3. 在 DevTools Console 粘贴 `tools/sandsea-perf/device-monitor.js` 内容，然后：
   ```js
   setTimeout(() => window.__sandseaPerf.start({ seconds: 30, label: 'low-end-android-01', scenario: 'charge3-natural', revision: '34aaf8a' }), 5000);
   ```
   同版本同条件各 3 次；`window.__sandseaPerf.downloadAll()` 导出。
4. 如做前后版本对比：`node tools/sandsea-perf/compare-device.mjs --baseline ... --candidate ... --max-p95-regression 10 --require-30fps`。
5. 门槛（与 P1 文档一致）：同机同条件 p95 恶化 ≤10%；低端机 `charge3` 不出现连续约 5 s <30 FPS；粒子不超当时 cap；页面无错误。
6. 读招手感（圣甲虫冲锋/骷髅瞄准/木乃伊重击）与触屏操作必须**真人确认**，性能采样不证明手感。

---

## 3. ③ PR C 真人数值调参（待真人）

### 3.1 当前实装数值（第四十轮，从代码逐项核对，非设计稿初值）

**远征经济（`claimRuinExpeditionReward`）**
| 项目 | 值 |
|---|---|
| 首通奖励 | 金×6 钻×2 文物×3 核心×2 +120 经验 +埃及声望4 + 掉落 1 件远征遗物 |
| 重复通关 | 金×2 文物×1 +40 经验 |
| 回响 | 首通 +2、重复 +1、精英路线 +1；测绘者Ⅳ「文书封存」每连满 3 局再 +1 |
| 专精成本 | 2 / 3 / 5 / 7 回响（每树 4 阶，全树 51） |
| 装备包 | 24 件满自动拆解；拆解返 1/2/4/8 砂；重铸 3 砂 |
| 品质与词缀数 | 旧制 1×Ⅰ阶 / 精制 1×Ⅱ阶 / 古代 2 条 / 神话 3 条（保底：连开 4 箱必出古代以上） |
| 词缀 | 武器槽 4 条（砂刃 3/5/7%、回砂余势 5/8/11%、破甲印 4/6/8%、烈阳余烬 +0.4/0.7/1.0 s）；护符槽 5 条（守墓回响 6/9/12%、沙步回声 −0.10/0.15/0.20 s 封顶 35%、壁画慧眼 +1/1/2 条、收藏者印记 3/5/7%、撤离者恩典 +2/3/4 血） |
| 三波构成 | 常规 `[scarab,scarab,serqet] / [mummy,skeleton,serqet] / [anubis,mummy,scarab]`；精英线全精英（血×1.5、掉核心），第三十一轮已把末波 `anubis+mummy` 轻量化为 `anubis+scarab`（重击+叠压过致命） |

**核心战斗（P1 基线文档已有记录，供调参对照）**：沙步 CD 4.5 s（熟练每级 −0.4、封顶 35%）、反击窗口 2.0 s +35% 封顶 3；圣甲虫预警 0.52 s/冲锋 0.38 s/收招 0.58 s/起手 <8.5 格/命中半径 1.55。

### 3.2 观察指标（PR C 首轮，设计稿 §7）

| 指标 | 采集方式 | 目标区间（设计稿假设，待真人数据校准） |
|---|---|---|
| 单局时长 | 每局计时 | 8–12 分钟 |
| 首次通关率 | 统计新档首局 | 45–60% |
| 撤离率 / 失败原因 | 记录死亡/撤离 | 失败后仍有 ≥1 保底成长 |
| 流派占比 | 记录通关时的专精+词缀组合 | 无单一流派占通关率 >70% |
| 手感 | 真人主观（答题式） | 读招/反击/战技不"难到劝退" |

### 3.3 调参流程（沿用设计稿"两轮内部平衡"）

1. **先不动数值**：按 3.2 收集真人数据（建议 ≥10 局/人，至少 2–3 人，覆盖三条路线与至少 2 种流派）。
2. **只改数值**：按数据只调数值常量（回响成本、品质掉率、词缀 tier、波次构成），不改机制/概率结构。
3. 每改一次跑 ① 迁移矩阵 + `selftest` 508/508 + 桌面参考基线对比，再回到 1。
4. 第三十一轮已做的"末波轻量化"属于临时平衡，并入本轮数据基线一起评估。

---

## 4. ④ 手机端评估

### 4.1 无头视口审计（本轮已测）

- 尺寸：`390×844`（竖屏）与 `844×390`（横屏），`Emulation.setDeviceMetricsOverride`，DPR 1。
- 检查项：视口宽高、文档是否横向溢出、canvas 实际尺寸、帮助/设置/背包/专精面板的包围盒是否落在视口内。
- **结果（第四十轮实测，`seed=424242`）：**

| 尺寸 | 横向溢出 | 纵向溢出 | canvas | 帮助(fullhelp) | 设置 | 背包总览 | 遗迹专精 |
|---|---:|---:|---|---|---|---|---|
| 390×844 | 无（scrollW=innerW=390） | 无 | 390×844 铺满 | ✅ 全屏内 | ✅ 全屏内 | ✅ 359×692 居中 | ✅ 全屏内 |
| 844×390 | 无 | 无 | 844×390 铺满 | ✅ 全屏内 | ✅ 全屏内 | ✅ 560×320 居中 | ✅ 全屏内 |

- 目视截图存档：`artifacts/sandsea-final-four/final-four-help-390x844.png`、`final-four-bag-844x390.png`。
- **历史既有结论**（第二十~三十一圈）：1280×720 帮助、844×390 反击、390×844 帮助布局均已截图；摇杆/触屏战技按钮/放置键已上线；窄屏布局与暂停/设置枢纽可用。

### 4.2 手机端现状盘点（代码事实）

- 触屏输入：摇杆、攻击/战技按钮、放置键；`pointerdown/pointerup` 与鼠标路径共用状态机。
- 视口 meta 与窄屏 CSS：已存在（第十四轮设置枢纽、第三十一轮触屏战技按钮）。
- 性能自适应：`autoScalePerf()` 连续低帧先降画质档再缩渲染距离（最多 5 次）、`partCap()` 按渲染距离封顶粒子。
- 已知决策：PR #10 曾明确"只做电脑端"——**本次收尾需重新决策是否把手机端列为支持目标**。

### 4.3 真机验收清单（待真机）

- [ ] 低端 Android（如骁龙 6 系/入门机）+ iOS Safari 各一台，Chrome 新版本
- [ ] 进入世界 10 s 后无白屏/崩溃；首次加载时间可接受（记录秒数）
- [ ] 竖屏 390px 宽：帮助/暂停/设置/背包/专精面板无横向滚动、按钮可点（触控目标 ≥44px 参考）
- [ ] 横屏 812+px：战斗机舱/沙步 C 键在触屏上的映射（触屏按钮）可用
- [ ] 30 s 自然遇敌（charge3 级负载）无连续 <30 FPS、无自动降档到看不清画质
- [ ] 内存：连续游玩 20 分钟无明显卡顿积压（观察 JS heap 增长）
- [ ] 用 `tools/sandsea-perf/device-monitor.js` 各采 3 次，与 §2 门槛比对

---

## 5. 后续交接（谁来做、怎么做）

| 事项 | 下一步 | 负责人 |
|---|---|---|
| ① 迁移矩阵 | 已在自测内长期保持（每轮新增字段自带老档兼容用例）；本轮全量矩阵归档为 §1 | 已闭环 |
| ② 真机性能 | 按 §2.2 采 3 台设备样本，用 `compare-device.mjs` 出报告 | 用户/真人设备 |
| ③ PR C | 按 §3 收集真人数据 → 只调数值 → 回归后反馈 | 用户/真人 |
| ④ 手机端 | 先决策"是否支持手机端"（§4.2 决策项），再按 §4.3 验真机 | 用户 |

---

## 6. 本轮实测记录（附录）

**环境：** Windows + 无头 Chromium（SwiftShader 软件渲染），Node ≥22，零 npm 依赖。仓库基线 `34aaf8a`。时间：2026-10-06。

**① 存档迁移全量矩阵（67/67 PASS）**

```
node tools/headless.mjs selftest                                   # 508/508（含既有老档兼容断言）
node tools/headless.mjs eval "games/minecraft/?seed=424242" --timeout 600 <迁移矩阵脚本>
```

- 逐顶层字段缺失扫描：53 项全过（`collectSave` 全部顶层字段各删一次→`loadGame`→断言默认值）。
- 复合边界：仅 seed 最老档 ✅；第五轮时代老档（无 meta 键）直接载入最新版 ✅；questId 定位抗关卡表插位 ✅。
- meta 六行全过：键缺失/负数钳 0/专精钳 0..4/词缀白名单+同组去重+槽位校验/装备包 >24 截断 ✅。
- 坏值显式行（记录为主）：负数 hp/lvl/cores 不钳制、`questIdx="abc"`→NaN —— 均为**人为篡改存档**才可达；按设计稿 §8 不做反作弊，列为可选加固候选（`loadGame` 加有限值+非负钳制；`questIdx` 先 `Number` 再 `isFinite`），**未在本轮动源码**。
- 脚本：`C:\Users\wuge\AppData\Local\Temp\opencode\migrate-matrix.js`（不入库）。

**② 性能参考基线（SwiftShader 回归信号，非真机）**

```
node tools/sandsea-perf/baseline.mjs --scenario idle --gfx 0 --seed 424242 --size 1280x720 --warmup 8 --duration 20 --repeat 3 --out <temp>/perf-r39-idle-gfx0.json
node tools/sandsea-perf/baseline.mjs --scenario charge3 --gfx 0 --seed 424242 --size 1280x720 --warmup 8 --duration 20 --repeat 3 --out <temp>/perf-r39-charge3-gfx0.json
```

- 结果见 §2.1 表（两格均 p95 16.8 ms / 60 FPS / 粒子峰值远低于 cap / 无长任务·无慢帧连续段·未自动降档）。
- 真机采样未做：属**待真机**（§2.2 步骤 + `device-monitor.js` / `compare-device.mjs`）。

**④ 手机端无头视口审计（见 §4.1 表）**

```
node tools/headless.mjs eval "games/minecraft/?seed=424242" --size 390x844 <mobile-audit.js>
node tools/headless.mjs eval "games/minecraft/?seed=424242" --size 844x390 <mobile-audit.js>
node tools/headless.mjs shot "games/minecraft/?seed=424242" <artifacts>/final-four-help-390x844.png --script <shot-help-portrait.js> --size 390x844
node tools/headless.mjs shot "games/minecraft/?seed=424242" <artifacts>/final-four-bag-844x390.png --script <shot-bag-landscape.js> --size 844x390
```

- 两尺寸均无横/纵溢出；帮助/设置/背包总览/遗迹专精四面板全部落在视口内；canvas 铺满。
- 触屏手感、低端 GPU 帧率与内存长跑属**待真机**（§4.3 清单）。

**③ PR C 真人数值调参：**本轮无真人数据，交接清单见 §3（可执行步骤 + 观测指标 + 当前实装数值表）。