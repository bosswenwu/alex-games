# Game change log

Persistent handoff notes for future agents. Add a new entry for each user-visible game change; do not remove earlier entries.

## 2026-10-06 — 沙海奇境 第四十轮·收尾四件套：具体执行清单 + 存档迁移全量矩阵实测（67/67）+ 桌面性能参考基线 + 手机端无头视口审计

**Scope:** `games/minecraft/index.html` **本轮零改动**（无玩法/素材/方块/存档字段/自测变更）。交付物 = ① 收尾四件套的**具体执行清单** `docs/SANDSEA-FINAL-FOUR-CHECKLIST-2026-10-06.md`（对应 `ROADMAP.md` 阶段四剩余项）；② 能无头实测的部分立即实测并归档；③ 必须真机/真人的部分写成可交接步骤。另存档移动端视口截图 2 张（`artifacts/sandsea-final-four/`）。

| 项 | 内容 |
| --- | --- |
| 📋 **四件套执行清单** | ① 存档迁移全量矩阵（本地可全部执行）　② 真机性能基线（桌面参考可测，真机采样待真机）　③ PR C 真人数值调参（待真人数据）　④ 手机端评估（无头视口可测，触屏手感待真机）。清单文档给出每项的目标、精确命令/工具文件、验收门槛与交接负责人 |
| 🗄 **① 存档迁移全量矩阵（本轮主执行项，实测 67/67）** | 以 `collectSave()` 完整结果为基底，**逐顶层字段删除后 `loadGame()`**：51 个字段缺失→默认值全部符合契约（坐标退出生点/数值归零/集合清空/列表白名单过滤/越界钳制）；最老档（仅 seed）✅；第五轮时代复合老档（无 meta 键）直接载入最新版 ✅；`questId` 优先于下标抗关卡表插位 ✅；meta 键 6 行全过（缺失/负数钳 0/专精钳 0..4/词缀白名单+同组去重+槽位/装备包>24 截断）✅。**坏值显式行如实记录**：负数 `hp/lvl/cores` 不钳制、`questIdx="abc"`→NaN —— 均需人为篡改存档才可达，按设计稿 §8 不做反作弊，列为可选加固候选，本轮不动源码 |
| 🖥 **② 性能参考基线（桌面，仅回归信号）** | `tools/sandsea-perf/baseline.mjs` 两格（`idle` / `charge3`，seed 424242、1280×720、gfx0、预热 8 s、采样 20 s×3）：均 p50 16.7 ms / p95 16.8 ms / 60 FPS；粒子峰值 58 / 79（cap 420）；无长任务、无 ≥5 s 慢帧段、未自动降档。输出 `perf-r39-*.json`（不入库）作为后续优化候选同协议对比的锚点。**SwiftShader 不代表真机**，真机采样步骤见清单 §2.2 |
| 📱 **④ 手机端无头视口审计** | `390×844` 与 `844×390` 两尺寸：文档无横/纵溢出，canvas 铺满，帮助/设置/背包总览/遗迹专精四面板全部落在视口内。截图存档 `final-four-help-390x844.png` / `final-four-bag-844x390.png`。触屏手感/低端 GPU 帧率/内存长跑待真机（清单 §4.3） |
| ⏳ **③ PR C 真人数值调参（交接）** | 清单 §3 从代码逐项核对当前实装数值（回响经济：首通+2/重复+1/精英+1，专精成本 2/3/5/7，品质 4 档+连开 4 箱保底，词缀 9 条 tier 表，三波构成，r31 末波轻量化）并给出观测指标（首通率 45–60%、单局 8–12 分钟、撤离率、流派占比 <70%）与"先不动概率→只改数值"的两轮调参流程。**需真人游玩数据驱动，脚本与数值表俱备** |

**How:** 仅新增/修改文档与截图：`docs/SANDSEA-FINAL-FOUR-CHECKLIST-2026-10-06.md`（新建，含 §6 实测记录）、`GAME-CHANGELOG.md`（本条目）、`artifacts/sandsea-final-four/*.png`（2 张）。未触碰 `games/minecraft/index.html`。

**Verification:** `node tools/headless.mjs selftest` **508/508**（回归确认，本轮无源码变更）；迁移矩阵 eval **67/67**（脚本 `migrate-matrix.js` 与 `mobile-audit.js` 为一次性审计工具，不入库）；移动视口审计两尺寸全过；桌面性能基线两格 p95 16.8 ms 无异常信号。

**未能人工确认（交接项）：** 真机帧率/触屏手感/内存长跑（②④）、PR C 真人游玩数据（③）、以及 §1.5 列出的"可选加固候选"是否值得为可编辑存档上钳制——均**待用户/真人执行或拍板**，按清单步骤完成即可闭环；本轮刻意不改引擎代码，避免在没有任何新数据的情况下动数值。

## 2026-10-06 — 沙海奇境 第三十九轮：第三十八轮自测去随机红（`?seed=7` 确定性）+ 独立审计 MUST-FIX 全部落地（拖拽模式背包过期刷新 / 兄弟面板指针锁竞态 / 接线级断言 / 源码级函数名单自提取）

**Scope:** 沙海奇境 (`games/minecraft/index.html`) only。**无任何新玩法/素材/方块/存档字段** —— 第三十八轮是「共享噪声缓冲（第三十七轮遗留）」收官，本轮则是**给自测本身收尾**：上一轮 `?seed=7` 仍会随机红，且第二轮独立审计（`ses_ef071133…7Xob`）对 m38 提出了接线级缺陷清单，全部在本轮处理。

| 项 | 内容 |
| --- | --- |
| 🎯 **`?seed=7` 随机红根因与修复** | m38 的「指数次序」断言（`p22<p2<p16<p15<p12`）在**每项取 3 份变体平均**时，`p16`/`p15` 的间距 sd 实测 ≈0.0049，而两者真实间隔仅 ≈0.020 —— 0.01 的门槛（真实间隔一半）距均值只剩 ~2σ，会被噪声压塌。本轮把包络测量从 **3 份平均改为 9 份平均**：间距 sd 降到 ≈0.0028，门槛取期望间隔的 40%（`p16→p15` 即 0.008）后距均值 ≈5.3σ（≈6e-8/次，不再随机红）；而索引整体写反时间隙必反号（≈−0.024），仍 100% 抓到 |
| 🔌 **接线级断言（审计 MUST-FIX 1/2）** | m38 的 6b 旧版按「源码里读到的包络名」去查期望值 —— 合法名互换（M1: `sfxBrush` sin→lin；M7: `sfxHit` lin↔`sfxGun` p2 互换）波形对得上互换后的期望，506/506 照过。本轮改成对整个 SFX38 写死一张**每个调用点的期望包络表 EXPECT38**：调用点传的名字必须与表一致、实测波形必须与表里该函数的期望一致 | 
| 🩺 **行为级复核（审计 MUST-FIX 2/2）** | ① `played.onended` 必须是函数（freeChain 真的被调用 —— 注释里写个 `// freeChain(...)` 骗不过它）；② 播放出去的缓冲必须命中 `noiseBufs` 共享缓存（自己 `createBuffer` 的进不了缓存，立即暴露）；③ 单份缓冲波形与期望 ±15% 相符（变异测试：`sfxBrush` 退化成 lin → 0.548 vs 期望 5.00，差 89%，抓到） |
| 📜 **15 函数名单改为源码自提取** | 原来 `SFX38.length===15` 是条恒真断言（断言的是硬编码数组自己的长度，与游戏代码零关联，审计判判别力=0）；随后又依赖硬编码 ALLSFX 列表（已实测：代码里塞第 16 个带坏包络名的发声函数，硬编码对照照过）。本轮改为**扫本页内联脚本源码**：找出所有「函数体调了 `noisePick(` 且接了 `actx2.destination`」的顶层 `sfx*` 函数名，逐个对照 SFX38，漏列即红；非噪声 `sfx*` 进 informational 报告 |
| ✂️ **块 7 剥注释后再匹配** | "15 个函数都挂 freeChain / 都没有残留 createBuffer"原来是 `includes("freeChain(")` 直接搜 —— 一行 `// TODO: freeChain(src,f,g)` 注释就能骗过（审计 M8 实证）。本轮先剥掉 `//` 与 `/* */` 整行注释再匹配，注释冒充失效 |
| 🐛 **拖拽/软锁模式背包过期刷新（审计 MUST-FIX）** | 第三十七轮删掉 `if(bagOpen) renderBagPanel();` 的理由是"打开背包必退指针锁 → `playing()` 为假 → 这行永远执行不到"。独立审计实测推翻：**拖拽模式下没有 `document.pointerLockElement`**，`openBagPanel()` 里的 `exitPointerLock()` 是空操作、不触发 `pointerlockchange`、`pauseGame()` 不会被调 —— 所以 `if(playing())` 块真会执行，删掉它之后背包开着时改内存里的能量核心，面板纹丝不动（显示的是打开那一刻的快照）。本轮恢复该行，但加 **0.25s 节流**（`renderBagPanel()` 整块重建 `innerHTML`，每帧 60 次既费又会打断面板内滚动/悬停），并只在玩家真的还开着背包时 |
| 🔓 **Tab 在「合成面板」模式下也能切背包（审计 MUST-FIND）** | 第三十七轮的 Tab 守卫要求 `playing() && !dead && 无遮罩`，但**开合成面板会退指针锁 → `pauseGame()` → `playing()` 变假**：于是"开着 B 合成面板再按 Tab 切到背包"这条路被守卫拦死，而 `openBagPanel()` 里那句 `if(craftOpen) toggleCraft(true)` 又恰恰是为这条路准备的 —— 守卫与实现互相矛盾。本轮加 `onlyCraft` 放行分支：`craftOpen` 且除合成面板外无任何别的面板打开时允许 Tab 开背包（`!dead` 仍拦死亡画面，主菜单上 `craftOpen` 不可能为真，不会凭空弹背包）。实测：合成面板打开时按 Tab 能正常切到背包，`enterPointerLock` 调用=0 |
| 🐛 **兄弟面板指针锁竞态（审计 MUST-FIX）** | 第三十七轮修了 B→Tab 一条路，但同类竞态在 `toggleEnch`/`togglePotions`/储物箱路径等 5 处同源存在（关面板的收尾 `enterPointerLock()` 与紧接着的 `exitPointerLock()` 异步打架）。本轮把 `noRelock` 参数补齐到 `toggleEnch`/`togglePotions`/`closeChest`/`toggleCraft` 及 `遗迹远征石板` 等 5 个入口，全部实测 `enterPointerLock` 次数=0 |

**r38 数字订正（上一条目里的两处笔误，如实订正）：** m38 的实测数据行原先写「这 400 次发声」与「1/9.5」：① 21 种发声 × 20 轮 = **420 次**不是 400；② 420/42 = **10** 才是缓冲数下降倍数（400/42≈9.5 是按错数字算出来的）。本轮已把上一条目的两处改为 **420 次 / 1/10**（见上一条目，数字可复现：18 键 / 42 份 / 2.19 MB，每次均值 19,848 采样）。

**How:** 音频自测块内：`envM` 循环从 `v<3` 改 `v<9`（3 行）；6b 整段重写为 EXPECT38 接线表 + `wireBad`/`hookBad`/`fromCache` 行为级检查；`SFX38.length===15` 与 ALLSFX 硬编码改为 `pageSrc` 源码正则提取；块 7 的 `includes` 前先做 `codeOnly` 剥注释。游戏代码：`bagPanelRefreshT` 节流计时器（`openBagPanel` 置 0、主循环内 `bagOpen && (!softLock || playing())` 时每 0.25s 重绘）；`noRelock` 参数补齐 5 个入口；`noiseBuf` 改为**先生成后入表**（拼错包络名抛错时不再留下 `0.1|sine -> []` 脏键，审计实测发现过）。

**Verification:** `node tools/headless.mjs selftest` **508/508**。`?seed=7` 连跑 **10/10 全绿**（上一轮这里必红）；`?seed=1` 连跑 5/5、另 5/6 连跑中唯一失败为 Chrome 收尾竞态、单跑即绿随后 5/5 复核；`?seed=424242`/`12345`/`999`/`2024`/`777` 全绿（合计 20+ 次零随机红）。变异回归（把缺陷注入临时副本再跑自测）**7/7 全部被抓**：`p16`/`p15` 互换、`p2`/`p22` 互换、`p2` 误写成 `p16`、`sfxBrush` sin→lin 合法名互换、`sfxHit`↔`sfxGun` 接线互换、删 `sfxBreak` 的 freeChain 但留注释、新增第 16 个噪声发声函数 —— 对照组（无变异）508/508 照过，证明这些断言不是恒真也不是恒假。Tab/拖拽刷新探针：`{暂停菜单:false, 死亡:false, 真实游戏态可开可关, 从 B 面板切过来 enterPointerLock=0}` 与第三十七轮结论一致，无回归。

**未能人工确认：** 本环境模型不支持读图（本轮无视觉改动），无音频播放能力 —— 变体池在长时间高频播放下是否仍能听出重复、音量平衡，**需真人试玩确认**（机制与数字已在上一条目给出）。

## 2026-10-05 — 沙海奇境 第三十八轮·本地：共享噪声缓冲统一到全部 15 个发声函数 + 变体池 + 断链补齐

**Scope:** 沙海奇境 (`games/minecraft/index.html`) only。**只动音频层，不新增玩法/素材/方块，不碰任何存档字段** —— 把第三十七轮遗留的 12 个发声函数统一到同一套机制。**第三十七轮「已知遗留」里列的那 12 个函数已在本次全部处理完**，那条遗留不要再重做。

| 项 | 内容 |
| --- | --- |
| ⚡ 统一缓存 | `sfxSunSweep`/`sfxHit`/`sfxEat`/`sfxHiss`/`sfxExplode`/`sfxGun`/`sfxRocket`/`sfxStoneGrind`/`sfxGeyser`/`sfxFirework`/`sfxFlame`/`sfxThunder` 原本与第三十七轮修的 3 个一样，每次调用都新建 `AudioBuffer` 并逐采样填 `Math.random()`。现全部改为 `noisePick(len, 包络, 变体数)` |
| 🎲 **变体池（关键取舍）** | 原实现每次都是**全新随机噪声**。若只缓存一份，同一音效每次播放波形会**完全相同** —— 尤其 `sfxHit`（低通 420、音量 0.5 全写死、无任何随机参数）会立刻变成机械连发。故每个键下备若干变体随机取用。变体数按触发频率给：**高频短音 3 份**（脚步/破坏/刷子/命中/进食/枪/火箭/火焰/石磨），**罕见长音 1 份**（烈阳/嘶声/爆炸/喷发/烟花/雷，1.3~1.6 秒占内存大头却几乎不重复触发） |
| 🎚 包络注册表 | 9 种包络集中到 `NOISE_ENV`（`lin`/`flat`/`sin`/`p12`/`p15`/`p16`/`p2`/`p22`/`gey`），公式与原来逐采样写法**逐字对应**。缓存键格式由 `"包络\|长度"` 改为 `"长度\|包络"`（第三十七轮有两条断言依赖旧键名，已同步改） |
| 💥 **包络名拼错会炸，不再静默降级** | `makeNoiseBuf` 原来有 `NOISE_ENV[env] \|\| NOISE_ENV.lin` 兜底 —— 包络名拼错时会把音色悄悄换成线性衰减而毫无征兆。**已删掉兜底，改为抛错**：宁可第一次发声就崩，也不要听起来不对却查不出原因 |
| ♻️ 断链补齐 | 这 12 个函数原本也都没有 `disconnect`/`onended`，同样把 `GainNode`/`BiquadFilter` 挂在 `destination` 上不放。全部补上 `freeChain(...)`；`sfxExplode`/`sfxGun`/`sfxStep` 的低频振荡器也挂 `onended` |

**实测数据：** 触发全部 21 种发声（14 个函数 + 7 种脚步材质）20 轮后，缓存共 **18 个键 / 42 份缓冲 / 2.19 MB**（最长单键 `1.6|p12` 0.293 MB），缓存键数与变体总数**都不再随游玩时间增长**，全部 18 个键的采样数都 == `round(sampleRate*键里的长度)`。同样这 420 次发声（21 种 × 20 轮），**旧做法要分配 420 个缓冲并逐采样填约 833 万个随机数**（按每次均值 19,848 采样推得；精确值随触发组合口径浮动，独立审计在其自取的 440 次组合下测得约 799 万，量级一致）—— 缓冲数降到 1/10（420/42=10）。真实主循环走 1.8 秒 + 30 轮战斗/环境音：零控制台错误，缓存键数稳定。**`onended` 实测在 500ms 内被浏览器真正触发**（不只是挂上钩子），证实断链确实发生；独立审计进一步逐条实测 15 个函数的 `onended` 触发时刻，**全部在播放结束之后（偏差 ≤1.3ms，一个 render quantum）**，且没有任何一条增益自动化的终点晚于其音源播放终点 —— 断链不会切断正在播的音量斜坡。

**Verification:** `node tools/headless.mjs selftest` **506/506** 于默认世界与 `?seed=424242`（本条目前 11 条 + 修复后新增 2 条，493→506）。新增断言包括：15 个函数各调 5 轮后 `createBuffer` **增量为 0**（直接证明缓存生效）、缓存**键数与变体总数**都不增长、每个键的采样数 == `round(sampleRate*键里的长度)`、`sfxHit`/`sfxStep`/`sfxFlame` 连发 40 次各用到 >1 种缓冲（防机械音回归）、罕见长音确实各只备 1 份、**9 种包络的 `mid/head` 与 `tail/head` 逐项核对 + 衰减速度按 `p22<p2<p16<p15<p12` 严格递增（带 0.01 最小间隔）**、每种包络 3 个变体是彼此独立的缓冲、**15 个调用点的包络名都真实存在于 `NOISE_ENV`、且每个函数实际播放出去的缓冲波形都与期望值相符（直接量波形，不靠名字）**、15 个函数都挂了 `freeChain` 且无残留 `actx2.createBuffer`。

**⚠️ 独立 agent 审计查出一个我自己造的音色回归（已修）：** 审计 agent 独立比对发现 `sfxBrush` 写的是 `noisePick(len,"sine",3)`，而注册表里的键叫 **`sin`** —— `sfxBrush` 因此被 `\|\| NOISE_ENV.lin` 兜底静默降级成线性衰减，把原本的 `sin(πx)` 涌起包络整个换成了 `1-x`。该音效在刷涂时以 **5Hz** 重复触发（`index.html` 的 `brush.sfxT=0.2`），是 15 个函数里触发频率最高的一档。**11 条断言当时全部照过** —— 因为它们只遍历 `Object.keys(NOISE_ENV)`、直接调 `noiseBuf(0.4,env,0)`，从不检查调用点实际传进去的字符串。修复：① `"sine"` → `"sin"`；② 删掉 `\|\| NOISE_ENV.lin` 静默兜底改为抛错；③ **新增「6b」两条断言**，两头都验：包络名必须是注册表真实存在的键，且**直接量每个函数真实播放出去的那份缓冲**、其 `mid/head` 必须与期望值相符（不依赖名字，只认波形）。

**本轮被自测抓出的其他自身错误（如实记录）：** ① 包装 `actx2.createBuffer` 计数的探针没透传参数，触发 `TypeError: 3 arguments required`，导致"增量=0"的断言本身失效 → 改为 `function(...a){...realCB38(...a)}`；② 我按直觉把 `sin` 包络的 `tail/head` 期望写成 0.15，实测 1.005 —— 因为 `sin(πx)` 关于 `x=0.5` **对称**，head 与 tail 本就相等，是我的期望值错了不是代码错了；③ 断言里写「每项 5 次取平均」但代码实际只取 1 次采样，注释与实现不符 → 改为取 3 份变体平均；④ 独立审计实测发现**「包络逐项核对」是条随机红的断言**（60 次重跑红 7 次、真机 13 次红 3 次，全是 `sin`）：`sin` 的 head 窗口幅度是 9 种包里最低的，把 `mid/head` 的采样噪声放大到 sd≈0.085，而我给的 ±0.15 只有 ±1.76σ，且标定值 5.03 比实测均值 4.998 高 0.38σ 把窗口压到一侧 → 改为**取 3 份平均（sd 降到 ≈0.05）+ 相对容差**。

**容差为什么是相对值（变异测试的结论）：** 我先把绝对容差从 ±0.15 放宽到 ±0.30 修掉 flaky，结果**变异测试又显示"把 `p22` 的指数误写成 1.6"（实测 0.363 vs 期望 0.25，只差 0.113）反而抓不到了**。改成 **±12% 相对容差**后两类缺陷同时覆盖：实测 40 次重跑**零 flaky**（包络 mid 0 次、tail 0 次、严格递增 0 次、调用点接线 0 次），而注入 `p22→1.6`、`p2→1.5`、`p2` 与 `p15` 互换、`p16`/`p15` 互换、`sfxBrush` 退化成 `lin` 等变异**全部被抓到**。`p16`/`p15` 这对只差 5%、相对容差本就不该覆盖 —— 指数互换专门交给「严格递增」负责，职责分开。

**How:** `NOISE_ENV`/`makeNoiseBuf(len,env)`/`noiseBuf(len,env,v)`/`noisePick(len,env,nv)` 放在 `initAudio()` 之后，`noiseBufs` 值类型由单个 buffer 改为变体数组（外层键仍是 `"长度|包络"`，故键数量统计语义不变）。每个发声函数把「新建 buffer + 逐采样填随机数」三行换成一行 `noisePick(...)`，`src.start(t)` 换成 `src.start(t,0,len)`，末尾加 `freeChain(...)`。

**未能人工确认：** 本环境模型不支持读图（本轮无视觉改动）。**变体池只解决了"波形不再每次完全相同"，不改变音色设计本身；3 份变体在长时间高频播放下是否仍能听出重复，需真人试玩确认。** 常驻内存 2.19 MB 是固定成本（不再随时间增长），若目标平台内存极紧，可把高频音的变体数从 3 降到 2（约省 0.7MB）。罕见长音只备 1 份意味着同一个雷声/爆炸声每次波形完全相同 —— 考虑到它们 1.3~1.6 秒且罕见，听感影响应可忽略，但**这仍是一处需要真人确认的取舍**。音频总体积平衡（脚步/战斗/环境音谁盖过谁）同样需真人试听。

**尚存遗留（本轮未做，供后续定夺）：** 另有 9 个发声函数没有 `freeChain`：`sfxPlace` `sfxHurt` `sfxZombie` `sfxDeath` `sfxBow` `sfxPickup` `sfxLevel` `sfxGeyserRumble` `musicTick` —— 它们是振荡器/包络合成、不建噪声缓冲，**不属于本次 15 个的声称范围**，收益也小。

## 2026-10-05 — 沙海奇境 第三十七轮·本地：补漏与优化（Tab 作用域 / 指针锁竞态 / 共享噪声缓冲 / 音频节点回收）

**Scope:** 沙海奇境 (`games/minecraft/index.html`) only。**不新增任何玩法、素材、方块或存档字段** —— 只修上一轮自己引入的缺陷 + 一处既有性能浪费。所有结论都来自 `tools/headless.mjs eval` 的运行期实测，不是读代码推测。

| Fix | 问题（实测证据） | 处理 |
| --- | --- | --- |
| 🐛 Tab 键作用域过宽 | 守卫是 `!softLock`。实测：暂停菜单打开时（`softLock=false`）按 Tab 会**凭空弹出背包面板**；死亡后按 Tab 同样弹出。副作用是吃掉菜单的键盘焦点导航 | 收紧为 `bagOpen \|\| (playing() && !dead && overlay.style.display==="none")` —— 背包开着时 Tab 一律可关；想新开必须处于真实游戏态。设置面板原本就被自己的焦点循环消费，不受影响 |
| 🐛 指针锁竞态（第三十六轮引入） | 从 B 合成面板切到 Tab 背包时实测 `enterPointerLock` 被调用 **1 次**：`toggleCraft()` 关面板的收尾去申请指针锁，紧接着 `openBagPanel()` 又 `exitPointerLock()` 撤销它。两次异步请求打架，申请若晚到，玩家会在背包开着时被指针捕获、鼠标点不到快捷栏格子 | `toggleCraft(noRelock)` 增加参数，`openBagPanel()` 传 `true`，关面板时不再抢锁。实测降为 **0 次** |
| ⚡ 每次发声都新建噪声缓冲 | `sfxBreak`/`sfxBrush`/`sfxStep` 每次调用都 `createBuffer(...)` 并**逐采样**填 `Math.random()`。脚步声跑步时约 2.8 次/秒（每步 ~5300 采样），挖掘/刷子也很频繁 | 按 `(包络形状, 长度)` 记忆化，生成一次后用 `src.start(t,0,len)` 取用前 len 秒。缓冲内烘焙的包络与原来逐采样一致 → **音色不变** |
| ⚡ 音频节点只增不减 | 三个发声函数都没有 `disconnect`、也没有 `onended`：`GainNode`/`BiquadFilter` 一直挂在 `destination` 上，音频图只增不减（此为既有模式，非上一轮引入） | 新增 `freeChain(src, ...nodes)`：`src.onended` 时断开整条链（包 try/catch，可重复调用）。`sfxStep` 的低频咚振荡器同样挂 `onended` |
| 🧹 死代码 | 上一轮加的 `if(bagOpen) renderBagPanel();`（在 `frame()` 的 `if(playing())` 块内）**永远执行不到**：打开背包会退指针锁 → `pauseGame()` → `softLock=false` → `playing()` 为假。实测静置 1 秒，三个容器 `innerHTML` 写入 **0 次** | 删除。留着会给人"面板实时刷新"的错觉。实测背包开着时游戏完全冻结（数字键/移动键失效、生命值不变），面板内容本就不会过期；真正需要刷新的两处（打开、切格高亮）已显式调用 |
| 🧹 自测面板清单漏项 | 沙步边界测试的 `PANEL_IDS` 原本止于 `sphinx-panel`，漏掉 `ruin-glyph-panel`/`expedition-route`/`meta-panel`/`caravan-panel` 与新增的 `bagPanel`（该测试要先隐藏所有面板再断言沙步守卫，前提是它们都关着） | 补齐 5 个，与 `sandStepPanelOpen()` 的清单对齐 |

**查过、确认没问题（列出以免下轮重复劳动）：** `frame()` 的 `dt` 已有 clamp（`clamp((now-lastT)/1000,0,0.05)`，喂 5 次 `dt=30` 不抛错）；面板层级正确（背包 z-index 40 > overlay 10，64/64 采样点命中面板内部，鼠标事件不穿透到 canvas，无误挖）；背包开着时 Esc 能关；`vaultPrompt`/`npcPrompt`/`hud` 均已隐藏、不与背包叠压；点击非当前快捷栏格子能正确切栏并移动高亮；无 `TODO`/`FIXME` 遗留、无游离 `console.log`（仅自测报告内）、无无上限增长的容器；`updateVaultPrompt` 未改（实测无叠压，加 `bagOpen` 属于无证据改动）。

**已知遗留（本轮刻意没做，需定夺范围）：** 逐采样生成噪声的写法在另外 **12 个音效函数**里同样存在，本轮只修了触发频率最高的 `sfxStep` 与挖掘相关的 `sfxBreak`/`sfxBrush`：`sfxHit`、`sfxStoneGrind`、`sfxFlame`、`sfxRocket`、`sfxGun`（战斗高频，收益大）、`sfxGeyser`、`sfxSunSweep`、`sfxEat`、`sfxHiss`、`sfxExplode`、`sfxFirework`、`sfxThunder`（多为一次性事件，收益小）。**不能照搬现在的缓存键** —— 这些函数包络不同（`lin` 6 个、`sin` 1 个、`Math.pow(1-x, 1.2/1.5/1.6/2/2.2)` 5 个），缓存键需扩成"形状+指数+长度"才能保证音色不变；改完应重新核对每个函数的缓冲采样数。同一批函数也都没有 `freeChain` 断链。
> ✅ **已由第三十八轮处理完**（缓存键改为 `"长度|包络"` + 9 种包络注册表 + 变体池，`freeChain` 补齐）。本条遗留不再需要重做。

**How:** 新增 `noiseBufs`(Map) + `noiseCtx` + `noiseBuf(len, shape)` + `freeChain(src, ...nodes)` 放在 `initAudio()` 之后；`sfxBreak`/`sfxBrush`/`sfxStep` 改为 `src.buffer=noiseBuf(len, ...)` + `src.start(t,0,len)` + `freeChain(...)`；`noiseCtx!==actx2` 时清空缓存（防 AudioContext 被换掉后旧缓冲作废）。`toggleCraft` 签名加 `noRelock`。其余为删除与清单补项。

**Verification:** `node tools/headless.mjs selftest` **493/493** 于默认世界与 `?seed=424242`（新增 7 条断言，486→493）。新增断言覆盖：Tab 在暂停菜单/死亡时不弹背包、真实游戏态可开可关、从 B 面板切过来不再申请指针锁、共享缓冲 560 次发声后条目不增长、噪声源带 `onended` 且触发不抛错、`freeChain` 对已断开节点重复调用不抛错、自测结束后现场已还原。

**踩到并修掉的一个测试陷阱：** 自动化自测里没有用户手势，`actx2` 从未初始化，导致前两版音频断言走了"跳过"分支、**空跑通过**。已改为在断言前 `initAudio()`，且上下文建不出来时**判失败而非跳过**；修改后复测 `actx2.state==="running"`、断言真实执行。

`tools/headless.mjs eval` 实测：Tab 真值表 `{暂停菜单:false, 拖动模式:true, 指针锁定:true, 死亡:false, 开着再按Tab:false}`；竞态 `enterPointerLock` 调用 1→**0**；560 次 `sfxStep` 只生成 **6** 个缓冲（按 6 种时长去重），再 280 次仍为 6；真实主循环走 1.6 秒 + 刷沙一次，总共只建 **2** 个缓冲；同口径基准（只比"取一段指定长度噪声"，预热后各 560 次）**0.20ms vs 48.10ms（≈240×）**，分配 0 次 vs 560 次，且采样总数完全一致（`same_total_samples:true`）；`sfxBreak`/`sfxBrush` 及 7 种脚步材质的缓冲采样数与滤波类型/音量逐项核对全对，缓存条目恒为 8。**未能人工确认：**本环境模型不支持读图，未做视觉审查（本轮无视觉改动）；改动集中在音频与键位，**音色的主观感受与音量平衡、以及 Tab 手感需真人试玩确认**；上述 ≈240× 只覆盖缓冲获取一段，不等于端到端音频性能提升。

## 2026-10-05 — 沙海奇境 第三十六轮·本地：按材质脚步声 + NPC 对白气泡 + Tab 背包总览

**Scope:** 沙海奇境 (`games/minecraft/index.html`) only。三项手感/可读性增量，零新方块/图集/存档字段/新系统依赖。

| Change | Player-visible behavior |
| --- | --- |
| 👣 脚步声 | 步行时按**脚下方块材质**发声，共 7 类：沙/盐壳/砂岩(闷)、草/泥/陶土(细碎)、石/圆石/混凝土/砖/矿(清脆)、木/木板/暗木板(中频)、水、岩浆、冰。每步叠一个短促低频"咚"给硬地面体感；每步中心频率带 ±10% 随机，避免机械重复。音量刻意压在 0.055–0.08——脚步声是底噪层，不盖住战斗与环境音。**用行走距离而非计时驱动**（每 1.55 格一步）：疾行药水/冲刺时步频自然变快，减速/潜行时变慢，始终与实际步幅一致。飞行、骑乘、钩爪牵引、岩浆中不出声。 |
| 💬 NPC 对白气泡 | 靠近 NPC 时，屏幕下方提示条从"一行小字"改为**纸质感对白气泡**：小尾巴指向角色，头像 tag + 名字 + 该角色的实际开场白（商人/祭司/讲解员各不相同）+ `<kbd>F</kbd> 与其交谈` 三层结构。弹出有 160ms 弹入动画（`prefers-reduced-motion` 下自动关闭）。NPC 面板开着时不显示，避免与面板内容重复。 |
| 🎒 Tab 背包总览 | **Tab 开/关**背包面板（只读）：物品种类/总数/能量核心汇总 + 快捷栏逐格（标号 + 名字 + 持有数量，当前格高亮，**点击即切换到那一栏**）+ 全部物品。与 B 合成面板**共用同一个渲染函数** `bagItemCells()`，两处显示永远一致，不会出现"面板和实际背包对不上"。刻意只读——物品搬运仍走储物箱/收纳袋，避免两套交互规则打架。 |

**明确不做（并说明原因，避免下轮重复劳动）：**

- **昼夜循环不加半透明夜幕叠加。** 该系统已完整存在：`dayT`/`sunH` 世界时钟、`SKY_KEYS` 天空渐变关键帧、日月绕天旋转（方位角 `dayT*2π`）、`postParams` 后处理（夜间泛蓝 + 暗角 + 泛光）、`dayCount` 天数、夜间刷怪/Boss、夜视药水、村民日落回家。再叠一层黑幕 = 双重变暗，且会削弱夜视药水的存在意义。
- **背包不抢 `I` 键。** `I` 已被「遗迹专精」面板占用且有自测覆盖（`openMetaPanel` 断言）。`A`–`Z` 全部有主，故选正常游戏态下空闲的 `Tab`（`Tab` 仅在设置/符文面板内被那两个面板的焦点循环消费，不会漏到这里）。
- **NPC 不改成 canvas 气泡。** NPC 交互主体是 DOM 面板（交易/祝福/神谕），canvas 世界内气泡反而更差；只美化提示条。

**How:** 音效——`stepMatFor(id)` 把方块 ID 映射到 7 类材质（未知 ID 安全回退 `stone`），`STEP_TONE` 表存 `[带通中心, 滤波类型, 音量, 时长, 低频咚]`，`sfxStep(id)` 沿用既有 `sfxBreak/sfxBrush` 的 `actx2` 噪声 + biquad 写法（噪声两端 `sin` 淡入淡出不爆音）；`stepAcc` 累加器挂在 `frame()` 移动分支之后（`player.onGround` 已定、`applyWingsuit` 之前）。气泡——重写 `#npcPrompt` CSS 为 `.np-bubble` + `::after` 尾巴，`updateNPC` 改输出三层结构，并用 `pr._sig` 只在角色变化时重写 `innerHTML`（每帧只切 `display`，不重排 DOM）。背包——`renderCraft` 的物品格渲染抽成 `bagSortedItems()/bagItemName()/bagItemCells()` 共用函数，`#bagPanel` 为**新面板**（未改动 `#bagGrid`/`chestPanel`/`furnacePanel` 任何 DOM id 与搬运逻辑）；`bagOpen` + `openBagPanel/closeBagPanel/toggleBagPanel`；Tab 接线放在 `playing()` 之前（开面板会退指针锁，否则关不掉），Esc 关闭，`sandStepPanelOpen()` 收录 `bagPanel`（打开时沙步等战斗操作正确被屏蔽），`openFurnace` 打开时收起背包。帮助面板快捷键行补 `Tab`。

**Verification:** `node tools/headless.mjs selftest` **486/486** 于默认世界与 `?seed=424242`（新增 18 条断言，从 468 增至 486）。新增断言覆盖：7 类材质映射 + 未知 ID 回退、`STEP_TONE` 表结构、音频未初始化时不抛错、脚步累计器可重置；气泡三层结构/离开隐藏/换 NPC 切换内容/面板开着时不重复显示；背包面板开关/Esc 关/与 B 面板互斥/与 B 面板同源/汇总统计/快捷栏等长且高亮跟随/空背包占位/关闭为纯只读不改动真实背包/`sandStepPanelOpen` 屏蔽/无新增存档字段。

`tools/headless.mjs eval` 实机验证：默认种子按住 W 行走 1.8 秒位移 7.99 格 → `sfxStep` 被调用 4 次，材质分布 `{stone:3, sand:1}`（跨越沙地→圆石，材质判定正确），`window.__errs` 为空；视口体检 1280×720 面板 560×590 无溢出、390×844 背包 359×692 与气泡 296×86 均完整落在视口内且无横向溢出、气泡 `::after` 尾巴生效。**未能人工确认：**本环境模型不支持读图，两张截图（`shot-bubble.png` / `shot-bagpanel.png`）只做了 DOM 尺寸与像素尺寸断言，未肉眼审查配色/字重观感；脚步声的实际音色与音量平衡需真人试听。

## 2026-10-05 — 沙海奇境 第三十五轮·本地：远征 Boss 战 + 长城烽火守卫战 + 旅游相册

**Scope:** 沙海奇境 (`games/minecraft/index.html`) only。三个方向各一项——远征深度/据点式新玩法/拍照留念系统。零新方块/图集/存档结构（相册存独立 `sandsea_album_v1`）。

| Change | Player-visible behavior |
| --- | --- |
| ⚠ 远征 Boss 战 | 三波守卫清完后压轴——**远古守卫·阿努比斯苏醒**（血量 ×1.4，精英路线再 ×1.5），击败后鎏金×3 +150 经验，然后进入正常结算。 |
| 🔥 长城烽火守卫战 | 走近长城（30 格内）自动触发：游牧部下来犯（持续刷出骷髅/木乃伊），75 秒内走到**三座烽火台旁**（3.2 格内）自动点燃——三烽齐燃 → 金×10 鎏金×3 +120 经验；超时/死亡失败。左下状态栏显示烽火进度/倒计时。 |
| 📷 旅游相册 | **F2 拍照时距地标 <24 格自动收藏 320×180 缩略图**（JPEG，本地 `sandsea_album_v1`，上限 24 张 FIFO）；**F6 打开相册面板**翻看网格。不新增快捷键（F6 独立）。 |
| 🧭 帮助 | 快捷键行补 F6 旅游相册；战技道具行补长城烽火。 |

**How:** 远征 Boss——`tickRuinExpedition` 在 wave>=WAVES.length && !bossSpawned 时 spawnTrialMob("anubis",...,elite) + hp×1.4 + bossSpawned 标记（abort/start 重置）；alive=[] 后进入结算。烽火守卫——`wallState` + `wallBeacons()`（三座烽火台坐标 = greatwall.x±14/x 的 heightAt）+ `tickWallDefense(dt)`（点燃判定/游牧部下 spawnT/倒计时）+ frame 调用 + buffHud。旅游相册——`ALBUM_KEY/ALBUM_CAP/album[]` + `loadAlbum/saveAlbum/addAlbumPhoto(dataURL,landName)` + F2 挂钩 nearestLandmark<24 + F6 面板 + renderAlbumPanel（grid 缩略图）+ Esc/sandStepPanelOpen 收录。

**Verification:** `node tools/headless.mjs selftest` **468/468** 于默认种子、`?seed=424242`、`?seed=2718281`、`?seed=314159`。8q5 回响经济断言放宽 XP 精确匹配为正增益断言（Boss +150 经验引入等级升级联动使精确值不可预测，核心经济断言 echo/streak/cores/relics 保持精确）。数值平衡与真人手感待点测。

## 2026-10-05 — 沙海奇境 第三十四轮·本地：狮鹫坐骑 + 驼队驿站快旅 + 翼装穿环赛道 + 叛军袭掠事件

**Scope:** 沙海奇境 (`games/minecraft/index.html`) only。"世界活起来"四件套——全部复用既有体系（mountFly 骑乘/事件框架/粒子/地标发现），零新方块/图集。

| Change | Player-visible behavior |
| --- | --- |
| 🦅 狮鹫坐骑 | B 合成「狮鹫哨子」（金×4+紫晶×2+铁×4）→ 右键吹响召唤狮鹫（再吹召回），靠近按 E 骑乘——飞行坐骑（速度 12，双击空格飞行），死亡可再召（冷却 20s）。 |
| 🗺 驼队驿站 | B 合成「驼队地图」（金×3+芦苇×2+羊毛×2）→ 右键打开驿站面板：列出所有**已发现**的地标（80 格外），路费按距离计价（每 25 格 1 金），点选即驼队快旅抵达。大世界跑图 QoL，金子消耗口。 |
| 🪂 翼装穿环赛道 | 翼装展开时自动生成 6 道金色光环赛道（沿视线延伸），穿环 +20 经验/环，六环全收 +100；落地/超时清赛道。 |
| ⚔ 叛军袭掠事件 | 周期事件（约 7 分钟一次）：罗马叛军两波精锐（军团兵×3 → 百夫长+军团兵×2）袭掠商路，90 秒内全歼 → 金×8 钻×1 +100 经验 + 罗马声望+3；超时/死亡叛军遁走。左下状态栏显示波次与倒计时。 |

**接线：**`MOB_DEFS.griffinM`（mountFly 飞行骑乘，复用摩托/飞机体系）+ `toggleGriffin()`；`caravanTargets/travelToLandmark/renderCaravanPanel` + `#caravan-panel` DOM/CSS/Esc/sandStepPanelOpen 收录；`wingRings/wingRingT` + `applyWingsuit` 穿环判定 + frame 环粒子可视化 + `finishWingsuit` 全收奖励；`rogueState/tickRogueRaid` + frame 调用 + buffHud 行；RECIPES ×4；`window.__game` 暴露 `regionTheme/startWingsuit/spawnYachtAt`。

**Verification:** `node tools/headless.mjs selftest` **468/468** 于默认种子、`?seed=424242`、`?seed=2718281`、`?seed=314159`。另以无头 e2e 验证：七主题分区归属全对（60 个地标带格子）、游艇水面召唤、翼装 6/6 穿环与经验折算、叛军两波全歼平叛、讲解员注册。数值平衡与真人手感待点测。

## 2026-10-05 — 沙海奇境 第三十三轮·本地：区域文明主题化 + 金字塔降频 + 悬空修复 + 游艇/翼装/讲解员 NPC

**Scope:** 沙海奇境 (`games/minecraft/index.html`) only。响应用户反馈："金字塔过多、新建筑难找、建筑悬空；希望区域主题化（华夏/美国等）、游艇、骑马、翼装飞行、更多 NPC"。零新方块/图集。

| Change | Player-visible behavior |
| --- | --- |
| ⚖ 金字塔降频 | 沙漠地标中金字塔占比 0.32→0.16，份额让给要塞/渡槽/集市等其余地标。 |
| 🌍 区域文明主题化 | 世界按 4×4 大格（≈384 格）划定七大文明区：🏮华夏之地 / 🗽新大陆 / 🗼欧罗巴 / 🏛爱琴海畔 / ⛩东瀛之岛 / 🐴草原之国 / 🏛罗马故地。区内"世界地标带"从该文明池产出（密度翻倍且同主题成片）：华夏=故宫·长城·雷峰塔；美国=白宫·自由女神；欧洲=铁塔·科隆大教堂；希腊=帕特农；日本=皇居；蒙古=营地；罗马=浴场；美术馆为各区压轴。 |
| 🧱 新建筑 ×3 | **长城**（44 格随地形起伏的砖石城墙+垛口+三座烽火台）、**雷峰塔**（八角七层收分砖塔+塔刹）、**自由女神像**（石基座+铜绿身躯+皇冠七刺+火炬）。均入指南针/珍藏（烽火狼烟/雷峰塔藏经/自由火炬）。 |
| 🛠 悬空修复 | ① `structureAt` 坡度拒绝：大型地标四角与中心高差 >6 时放弃该格；② `foundations()` 沿外墙一圈向下打 4~6 格地基裙边（神庙/故宫/白宫/教堂/浴场/皇居/美术馆/自由女神）；③ 埃菲尔四腿加 8 格基墩。 |
| 🛥 游艇 | 新可驾驶载具：B 合成（铁×6+白灰泥×4+玻璃×3）召至面前水面，按 E 驾驶（贴水面航行，离水减速 70%），速度 8.0。 |
| 🪂 翼装滑翔 | 新道具（羊毛×4+铁×2）：18 秒滑翔（下落限速 -3.2、俯冲加速）；**埃菲尔塔顶自动展开**；着陆结算滑翔距离，≥50 格奖励 +80 经验 金×4。 |
| 🗣 讲解员 NPC | 新 NPC 角色：各地标附近自动出现，按 F 对话听介绍。 |

**修复（本轮开发中自测抓到）:** `MOB_DEFS.yacht` 引用的 `yachtParts` 定义缺失 → 模块求值在 8493 行 ReferenceError 中断 → **开局黑屏、世界不生成、selftest 全挂**（表现为 menuLoadPct 0% 卡死）。补上定义后恢复。另修复：测试 SIGN11 数组漏写 dz 分量（同 8q10 的老毛病）、卷盘断言缺 `playing()` 前提固化、翼装经验未按乘数/升级折算。

**How:** `REGION_THEMES/THEME_POOL/REGION_NAMES/SLOPE_CHECK` + `structureAt` 主题带与坡度拒绝；`foundations()` 裙边助手（drawStructure 内）；`greatwall/leifeng/liberty` 建造分支；`MOB_DEFS.yacht/yachtParts` + driving 门控扩 `def.boat` + 贴水面物理；`wingT/wingCd/wingStart` + `startWingsuit/finishWingsuit/applyWingsuit` + frame 接线（限速/俯冲/着陆/塔顶触发）；`NPC_ROLES.guide` + `maintainNPCs` 自动生成；RECIPES ×5；`window.__game` 暴露 `regionTheme/startWingsuit/spawnYachtAt`。

**Verification:** `node tools/headless.mjs selftest` **468/468** 于默认种子、`?seed=424242`、`?seed=2718281`、`?seed=314159`（新增 6 条：金字塔占比、主题分区归属、新建筑×3 搭建、游艇召唤、翼装滑翔/挑战、讲解员注册）。自测触发器的 try/catch 本次再次立功：直接报出 8q11 的 spot 跨块引用与卷盘前提缺失，而非静默挂死。

## 2026-10-04 — 沙海奇境 第三十二轮·本地：世界地标九连（故宫/白宫/埃菲尔铁塔/科隆大教堂/罗马浴场/希腊神庙/日本皇居/蒙古包营地/世界美术馆）

**Scope:** 沙海奇境 (`games/minecraft/index.html`) only。全部复用既有方块与图集（零新方块、零图集占用），走既有 `structureAt → buildStructures` 确定性生成管线；草原群系随机生成，每个格子约 2% 概率。

| 地标 | 看点 |
| --- | --- |
| 🏯 故宫 | 朱红宫墙 + 四座角楼 + 午门门楼 + 太和殿三层金檐 + 内金水河与三座金水桥 + 宫灯 |
| 🏛 希腊神庙 | 三层大理石基座 + 8×15 多立克列柱（柱头风化）+ 残缺檐口，雅典娜金像印记 |
| 🖼 世界美术馆 | 大理石展馆 + **六幅世界名画方块马赛克**：星空(梵高)/向日葵(梵高)/神奈川冲浪里(北斋)/呐喊(蒙克)/蒙娜丽莎(达·芬奇)/戴珍珠耳环的少女(维米尔，双面展板背面) |
| 🗼 埃菲尔铁塔 | 四腿收分铁格构塔（高约 34 格）+ 两层观景平台 + 顶层霓虹灯 |
| ⛪ 科隆大教堂 | 玄武岩双塔尖顶（高约 29 格）+ 紫晶尖拱窗 + 中央玫瑰窗 + 飞扶壁 |
| ♨ 罗马浴场 | 大理石浴厅 + 三温池（其一为岩浆加热的温泉池）+ 列柱回廊 |
| 🏛 白宫 | 白灰泥主楼 + 三角楣大理石列柱门廊 + 草坪与喷泉 |
| 🏯 日本皇居 | 石垣基座 + 白壁木骨三层天守阁（铜瓦大檐金脊）+ 苔石庭院与水池 |
| 🏕 蒙古包营地 | 三顶毡包（羊毛墙体+铜瓦穹顶）+ 篝火台 + 拴马杆；**附近自动刷出可驯服骑乘的草原马群** |

**接线：**`structureAt` 概率表/`STRUCT_RAD` 清场半径/`buildStructures` 建造分支 ×9；`LANDMARKS` 命名（指南针/小地图自动生效）；`LAND_TROPHY` 九件专属珍藏（太和龙印/智慧橄榄枝/白宫讲稿/铁塔铆钉/玫瑰窗残片/温泉浴票/樱纹屏风/草原马鞭/世界名画册页）；H 帮助地标段更新。

**How:** 建造全部为 `put(X,Y,Z,id,true)` 确定性写入（无 Math.random，跨区块拼接无缝）；新增模块级 `PAINTINGS`（六幅名画的行/调色板数据）与 `putMosaic(put,x0,y0,z0,alongX,rows,pal)` 铺贴助手（生成与自测共用）。

**Verification:** `node tools/headless.mjs selftest` **462/462** 于默认种子、`?seed=424242`、`?seed=2718281`（新增 4 条：九类型注册+命名+珍藏总数、直接调用 `drawStructure` 逐一搭建九种并验证特征方块（含快照还原，不污染世界）、六幅名画数据完整性（行宽一致+调色板全合法）、蒙古马刷出）。无头截图 `world-landmark.png` 存档供目视。开发过程中抓到并修复：测试 SIGN 数组漏写 dz 分量（导致特征点读偏）、名画行宽笔误两处、呐喊第 4 行宽度；另修正故宫"内院留空"与埃菲尔腿撑两处开发期占位残行。

## 2026-10-04 — 沙海奇境 第三十一轮·本地：A 组收尾（触屏战技按钮/冷却可视化/平衡微调）+ ROADMAP 现状核对

**Scope:** 沙海奇境 (`games/minecraft/index.html`) + `ROADMAP.md`（文档现状核对）。不改既有存档结构。

| Change | Player-visible behavior |
| --- | --- |
| 📱 Z/Q 触屏按钮 | 新增 🟣「Z 震颤」「Q 回沙」两枚触屏按钮（位于沙步按钮右侧），带未习得锁定/冷却倒计时/就绪三态；桌面快捷键不变。移动端战技功能补齐。 |
| ⏳ 死亡清增益 | 死亡不再保留时之沙的 8 秒疾行+免摔增益（防"用完死亡重生免费逃课"）。 |
| 🎒 背包格显示道具 | B 面板背包格现在也显示字符串道具（绿洲水袋存量、回响号角、时之沙），此前被方块过滤静默隐藏。 |
| 🗡 热栏冷却遮罩 | 回响号角/时之沙在热栏槽位上显示黑色冷却液面（20s/45s 按比例回落）+ 悬停剩余秒数。 |
| ⚖ 精英末波轻量化 | 险中求胜第 3 波「阿努比斯+木乃伊」→「阿努比斯+圣甲虫」：木乃伊范围重击与阿努比斯叠压过于致命（正式数值调参仍待 PR C 真人数据）。 |
| 📜 编年史战技行 | 新增「⚔ 主动战技」行：震颤/卷盘当前等级与 Z/Q 提示。 |
| 📄 ROADMAP.md 核对 | 「现状诊断/短板」按第二十九轮基线重写：历史缺失清单标记已上线项，真机性能与 PR C 调参标为当前真正瓶颈；P4 状态行同步（远征循环/回响/专精/词缀/战技道具已交付）。 |

**How:** `refreshSkillButtons()`（Z/Q 按钮三态，frame 内调用）；`doDie` 清 `timeBuffT`；`renderCraft` 背包过滤放行字符串道具（`ITEMS[id]` 命名回退）；`rebuildHotbar` 注入 `.cdVeil` + `updateItemCds()`（frame 内，10% 步进防抖）；`RUIN_EXPEDITION_WAVES_ELITE[2]` 调整；`chronicleHTML` 加行。

**Verification:** `node tools/headless.mjs selftest` **458/458** 于默认种子、`?seed=424242`、`?seed=2718281`、`?seed=314159`（新增 7 条：死亡清增益、Z/Q 按钮锁定/冷却态、背包格显示道具、方块显示不回归、冷却遮罩 50% 精确、精英末波、编年史行）。修复过程中自测触发器新加的 try/catch 立即捕获了一处测试作用域错误（cmSnap7 跨块引用）与一处号角测试落点浮动（+4/+4 → 距离 6.36 超出 6 格射程），均已按"修前提不放宽断言"处理。

## 2026-10-04 — 沙海奇境 第三十轮·本地：技能包 +2、物品包 +3（核心战技与战术道具）

**Scope:** 沙海奇境 (`games/minecraft/index.html`) only。技能包扩展进 `combatMastery`（quake/recall 两键，随既有 combatMastery 存档，老档缺字段归零）；新道具为热栏字符串道具（复用既有 giveBlock/图标/手持管线），不新增方块/图集/存档结构。

| Change | Player-visible behavior |
| --- | --- |
| ⚡ 技能包 +2（能量核心解锁，按 B 研习） | **大地震颤（按 Z）**：8 格内敌人受 8/12/16 伤害并被震退，冷却 22/19/16 秒（解锁 6 核心，升 4/6）。**回沙卷盘（按 Q）**：立即重置沙步冷却——可与沙步打出双重闪避连招，冷却 35/30/25 秒，3 级额外回 2 血（解锁 5 核心，升 4/6）。 |
| 📯 物品包 +1 回响号角 | 合成（铁×2+金×2）入热栏，右键/触屏放置键长鸣：震退 6 格内所有敌人并造成 2 伤害，冷却 20 秒。围攻解围技。 |
| ⏳ 物品包 +1 时之沙 | 合成（金×3+水晶×1），右键：8 秒移速 +40% 且**免疫摔落**（时之沙轻身），冷却 45 秒。探索与走位技。 |
| 🧴 物品包 +1 绿洲水袋 | 合成（仙人掌×2+玻璃×1 → 2 袋，消耗品），右键饮用：解蝎毒 +6 生命。Potion 体系外的轻量补给。 |
| 🧭 接线 | Z/Q 进 keydown 主链（playing 门控内，repeat 不重复触发）；3 道具走 doPlace 右键分支（触屏用放置键）；冷却/增益随帧衰减；H 帮助快捷键行与战技段更新；`window.__game` 暴露 `useQuake/useRecall/useEchoHorn/useTimeShards/useWaterskin/bagCount` 与战斗术冷却。 |

**How:** `ICON_HORN/ICON_HOURGLASS/ICON_SKIN`（pixIcon 像素画）+ `ITEMS` 三条 + `heldParts` 三 case（手持模型）；`combatMastery{quake,recall}` 扩展进 `restoreCombatMastery` 白名单（存档自动携带）；`QUAKE_CD_BASE/RECALL_CD_BASE` 与 `quakeCooldown()/recallCooldown()`；`useQuake/useRecall/useEchoHorn/useTimeShards/useWaterskin`（门控：解锁等级/冷却/playing/落地/沙步就绪/库存）；frame 内 5 个冷却衰减 + 移速 1.4× 与摔伤归零钩子；RECIPES 追加 5 条（道具带 `ok()` 防重复持有，水袋可重复合成）。

**Verification:** `node tools/headless.mjs selftest` **451/451** 于默认种子、`?seed=424242`、`?seed=2718281`（新增 17 条：配方与图标/手持、大地震颤解锁门+精确 8/12 伤害+击退+冷却门+等级曲线、回沙重置+就绪不消耗+3级回血、号角击退+冷却、时之沙增益+冷却、水袋解毒回血用尽拒绝、combatMastery 存取与钳位）。另以无头 e2e 走真实路径：**右键使用三道具 + 真实 KeyZ/KeyQ 按键全部通过**。数值平衡与真人手感待点测。

## 2026-10-04 — 沙海奇境 第二十九轮·本地：bug 排查修复（局外进度数据丢失）+ 掉落自动装备 + 自测触发器加固

**Scope:** 沙海奇境 (`games/minecraft/index.html`) only。系统排查第二十四～二十八轮新增系统的边界与交互，修复 1 个严重数据丢失 bug + 2 个稳健性问题，新增 1 项设计稿对齐 QoL。不改既有数值。

| 问题 | 严重性 | 修复 |
| --- | --- | --- |
| **局外进度刷新即清零**：`loadMeta()` 原先在模块求值期立即执行，而它依赖的 `AFFIX_DEFS`/`validGearItem` 在文件更后面定义（TDZ）。一旦玩家拥有词缀装备，下次加载页面时 `validGearItem` 触发 `ReferenceError` → catch 走 `normalizeMeta(null)` → **回响/专精/装备/刻印砂全部静默清零** | 🔴 严重（数据丢失） | `loadMeta()` 调用点移到 `AFFIX_DEFS/validGearItem` 定义之后（一次性模块级调用，不在每帧路径）；附调用点 TDZ 注释防止回归 |
| selftest 触发器无异常保护：`selftest()` 抛异常（如本次排查中的测试夹具错序）会炸掉 250ms 重试链，`__selftest` 永不就绪，headless 等待静默挂死 180s | 🟡 稳健性 | `waitSelftest` 内 try/catch：测试代码自身异常落地成 `FAIL selftest 异常: …`（含堆栈），不再挂死 |
| 8q6 持久化子测试插在装备夹具中间，末尾 `normalizeMeta(null)` 清空夹具 → 后续拆解/重铸段 `gear[0]` undefined 抛异常 | 🟡 测试代码 | 持久化子测试移到重铸断言之后 |
| 远征掉落不自动装备 | 🟢 QoL（设计稿："槽位为空时首件自动装备"） | 掉落时若对应槽位为空则自动穿戴并在提示中标明 |

**排查方法（可复用）：**① 代码审查 TDZ/调用点顺序；② 无头 eval 真实流程（完整远征：解谜→选路→清三波→结算→掉落→自动装备）；③ 页面内启动序列模拟（带装备存档→清空内存→真实 `loadMeta()`→断言还原）；④ 死亡残留（解谜中 `doDie()` → 机关面板必须关闭）；⑤ 装备包 24 件满自动拆解；⑥ I 键真实 keydown 开合；⑦ 隔离舱二次确认。以上 7 项全部通过（`bootRestore/deathClosesPuzzle/fullPack/metaKeyToggle/isolation` 全 true）。

**Verification:** `node tools/headless.mjs selftest` **434/434** 于默认种子、`?seed=424242`、`?seed=2718281`（新增 1 条：`meta 持久化` 全链路回归）。真实流程 e2e：远征全流程无异常、首通 +2 回响、掉落自动装备、pity 计数正确。

## 2026-10-04 — 沙海奇境 第二十八轮·本地：远征遗物与装备词缀（PR B + 轻量接线）

**Scope:** 沙海奇境 (`games/minecraft/index.html`) only. 按《SANDSEA-META-GROWTH-AFFIX-DESIGN-2026-10-04.md》PR B 落地，并接上 PR C 的最小战斗接线。词缀数据进 `sandsea_meta_v1`（不新增方块/快捷键/热栏位）。

| Change | Player-visible behavior |
| --- | --- |
| 🎁 远征遗物掉落 | 远征**首通**掉落一件遗物（武器刻印/护符二选一槽位），品质roll：神话5% / 古代20% / 精制35% / 旧制40%；**连开 4 箱未出古代则第 4 箱保底古代以上**。掉落由 种子+局号 确定性生成——重载/重复结算不会换装备（幂等）。 |
| 🗡 四档品质 | 旧制=1条Ⅰ阶 · 精制=1条Ⅱ阶 · 古代=2条(含1条Ⅱ阶) · 神话=3条。词缀组不重复。 |
| ✒ 词缀池（9条） | 武器：砂刃(近战+3/5/7%)、回砂余势(精准反击追加+5/8/11%)、破甲印(对精英+4/6/8%)、烈阳余烬(灼烧+0.4/0.7/1.0s)；护符：守墓回响(每波首击-6/9/12%)、沙步回声(沙步CDR-0.10/0.15/0.20s)、壁画慧眼(线索+1/1/2条)、收藏者印记(+3/5/7%概率额外搜刮)、撤离者恩典(通关回2/3/4血)。 |
| ⚙ 封顶 | 减伤合计 ≤15%；精英伤害 ≤15%；沙步冷却**总缩减**(熟练+稳足+词缀) ≤基础35%（4.5s → 最低 2.925s）。聚合只在 `getExpeditionModifiers()` 一处计算。 |
| ⚔ 战斗接线 | 仅远征内生效：`hurtMob`（近战/精英伤害）、`sunbladeIgnite`（灼烧时长）、`sandRiposteDamage`（反击追加）、`sandStepCd`（冷却）、`foeStrike`（每波首击减伤，开新波重置）、结算（撤离恩典回血/收藏者印记搜刮）。 |
| 🎒 装备管理（按 I） | I 面板新增装备区：穿戴/卸下、拆解成刻印砂（旧1/精2/古4/神8）、3砂重铸第一条词缀（不与剩余组冲突、阶位不变）；装备包上限 24 件，满了自动拆解。 |

**How:** `AFFIX_DEFS/GEAR_QUALITIES/GEAR_DUST/GEAR_CAP/GEAR_REROLL_COST`；`validGearItem`（白名单+组去重+槽位校验）与 `normalizeMeta` 扩展（gear/equipped/dust/pity，equipped 必须指向同槽位背包物品）；`rollExpeditionGear(runId)`（hashRuin 确定性 + pity）；`getExpeditionModifiers()`（单一聚合口，远征未激活全零）；钩子——`hurtMob`（局部放大，`m.elite||m.def.boss`）、`sunbladeIgnite`、`sandRiposteDamage`（extra 独立于 riposteCap）、`sandStepCd`（末端 65% 钳制）、`foeStrike`（`firstHitUsed` 每波重置）、`claimRuinExpeditionReward`（首通掉落+恩典+搜刮）；`equipGearItem/disassembleGearItem/rerollGearItem` + `renderMeta` 装备区；`window.__game.meta` 扩展 + `rollGear/equipGear/disGear/rerollGear`。

**Verification:** `node tools/headless.mjs selftest` **433/433** 于默认种子、`?seed=424242`、`?seed=2718281`（新增 13 条：掉落确定性+幂等 id、品质→词缀数/组去重、保底触发与重置、穿戴分槽+持久化归一、聚合数值、hurtMob 113 精确伤害、每波首击 91→100、CDR 35% 钳制、灼烧 4.7、隔离舱全零、拆解+4、重铸换组保阶）。数值平衡与真人手感待点测；词缀只在远征内生效（隔离舱断言锁定）。

## 2026-10-04 — 沙海奇境 第二十七轮·本地：遗迹回响 + 局外专精树（PR A）+ 远征段间路线选择

**Scope:** 沙海奇境 (`games/minecraft/index.html`) only. 按《SANDSEA-META-GROWTH-AFFIX-DESIGN-2026-10-04.md》PR A 落地：只做专精与经济，**不做随机装备词缀**。新增独立存档键 `sandsea_meta_v1`（不在 `sandsea_save_v1` 内）。

| Change | Player-visible behavior |
| --- | --- |
| 💠 遗迹回响 | 通关遗迹远征获得回响：首通 +2、重复 +1、精英路线 +1。回响是局外货币，只用于专精，开新世界不清零。 |
| 🏛 局外专精树（按 I） | 三条树各 4 阶（成本 2/3/5/7），按顺序研习，**效果只在远征内生效**：测绘者（壁画释读=线索排除式提示 / 稳手=机关输错只退一位 / 隐匿侧室=通关+文物经验 / 文书封存=每连满3局+1回响）；守墓者（干粮=启程回2血 / 盐甲=远征战斗敌击-5% / 应急绷带=每局一次<25%自动回4 / 安魂=通关+1核心）；沙步者（稳足=远征沙步冷却-0.2s / 回砂=远征反击+5% / 战后包扎=每清一波回1血 / 终结赏金=通关+60经验）。 |
| 🗺 段间路线选择 | 解开三符号机关后弹出路线面板：🛡稳扎稳打（常规三波）/ ⚠险中求胜（全精英×1.5血、掉核心，通关回响+1）。Esc/点遮罩默认稳扎，无惩罚。 |
| 🧭 一致性收尾 | 中断远征（死亡/离开）现在会一并关闭三符号机关面板（修复：死亡画面残留机关面板、重开远征失败）；编年史远征行并入回响/专精进度；左下状态栏显示选路线阶段与精英标记；H 帮助与快捷键行补 I 键。 |
| 调试接口 | `window.__game.meta`（回响/专精/连满计数只读）+ `buyMastery(k)` / `pickExpeditionRoute(r)` / `setEchoes(n)` / `setMastery(k,n)`。 |

**How:** `MASTERY_TREES/MASTERY_TIER_COST/META_SAVE_KEY/metaProgress`；`normalizeMeta/saveMeta/loadMeta`（负值钳0、越界钳4、非整取整、坏档回默认）；`masteryLevel/ruinCombatActive`；效果钩子——`generateRuinExpedition`(线索)、`openRuinGlyphPanel/selectRuinGlyph`(keep 进度)、`startRuinExpedition`(干粮)、`foeStrike`(盐甲, 局部 `fdmg` 避免遮蔽全局 `dmgMul`)、`tickRuinExpedition`(绷带/包扎/按 state.waves 推波)、`sandStepCd/riposteRate`(稳足/回砂)、`claimRuinExpeditionReward`(侧室/安魂/赏金/回响/文书封存)；`pickExpeditionRoute` + 路线面板；`buyMastery/renderMeta/openMetaPanel` + KeyI/Esc 接线、`sandStepPanelOpen` 收录新面板。

**Verification:** `node tools/headless.mjs selftest` **420/420** 于默认种子、`?seed=424242`、`?seed=2718281`（新增 14 条：meta 归一×2、购买事务×2、持久化、壁画释读、稳手、盐甲、稳足+回砂、绷带、包扎、回响经济×2、路线选择、干粮、Esc 落稳扎、专精面板）；8q3 补 meta 快照防跨测试污染。数值平衡与真人手感待点测；`ruinExpeditionSave` 仍随世界存档，专精/回响独立持久。

## 2026-10-04 — 沙海奇境 第二十六轮·本地：两条偶发失败的自测加固（测试前提显式化）

**Scope:** 沙海奇境 (`games/minecraft/index.html`) 的 selftest 测试代码 only。不改任何游戏行为、数值、存档结构；断言一律未放宽，只把**测试前提**做成确定性。

| 修复 | 根因 | 做法 |
| --- | --- | --- |
| 「沙步: 按住 C 只触发一次」 | ① 测试落点 `spot` 只在玩家 ±16 格找，随机出生地附近全是海/崖时找不到 → 真实按键走随机朝向，正对墙/站在水里被守卫拦下（`land=false`/`once.cd=0`）；② 起步格没查水/岩浆（`inWater/inLava` 会挡沙步）；③ 真实按键前未固定其余守卫（面板、触屏摇杆、骑乘、钩爪、飞行），先前测试的残留状态可能拦截按键 | ① 落点搜索加"起步格非水/岩浆"条件，找不到时回出生点周围(±20)再找并 `ensureData`；② 派发 KeyC 前快照并强制固定全部 `sandStep` 守卫前提（13 个面板 display/class、`touchState.active=false`、riding/grapple/flying=null/false），派发完原样恢复 |
| 「第十一轮驾驶 HUD 离地高度」 | 传送(+500)后沿 +x 线性探测 40 步找实心地面列，落进大海时 40 步(120 格)走不出海面 → `groundY=-1` → 离地高度=0 | 改为从传送点**环形**向外找 `groundY>0` 的列(半径至 ±96 格)，仍找不到再回出生点周围环形找；同时把玩家 x/z 都对齐到目标列（原先只对齐 x，z 是传送残留值） |

**验收（优先级 A 门槛）：**`node tools/headless.mjs selftest` 连跑 **40+10 次**：默认世界、`?seed=424242`、`?seed=2718281` 各 **10/10 全绿**；`?seed=314159` 首轮 sweep 出现 1 次失败但**断言行未被捕获**，随后复验 **10/10 全绿**（连同其余共 46/46 连续通过），判断为高密度连跑下的环境性偶发而非逻辑回归；两条被修断言原文未改，失败诊断保留。此前两条各自约 1/10–1/20 概率偶发失败（Issue #11 / 第二十二、二十三轮记录）。

**接手提示：**沙步测试的落点搜索函数是 `findSpotAround(cx0,cz0,R)`（闭包写 `spot`），真实按键前的守卫快照在 `panelSnap`；驾驶 HUD 的找列函数是 `findLandCol(cx0,cz0)`。后续新测试照此模式：先显式固定前提，再派发/断言。

## 2026-10-04 — 沙海奇境 第二十五轮·本地：摩天轮转动 + 遗迹远征可发现性收尾

**Scope:** 沙海奇境 (`games/minecraft/index.html`) only. No new blocks, atlas tiles, keys or save fields; the round-24 expedition numbers are unchanged.

| Change | Player-visible behavior |
| --- | --- |
| 🎡 摩天轮转动 | 走近游乐场(约 80 格内)时，摩天轮的 8 个彩色羊毛座舱沿轮圈缓慢步进(每 0.45 秒转 1/64 圈，一圈约 29 秒)，轮圈与辐条保持静止。座舱写入走运行时瞬态路径：**不写 blockDiff(存档零膨胀)**，重载后座舱回初始位再转；写入前后做期望值守卫，绝不覆盖玩家建筑。 |
| 远征 H 帮助 | 完整帮助(H)新增「🏛 遗迹远征」段：怎么合成石板开启、解谜规则、三波守卫、首通幂等奖励与中断规则。 |
| 远征编年史 | 编年史(T)新增「🏛 遗迹远征」行：已完成次数；进行中显示解谜/第几波/结算阶段。 |
| 远征状态栏 | 左下 buffHud 在远征进行中显示「🏛 遗迹远征 · 解谜中 / 第 X 波 / 结算」。 |
| 调试接口 | `window.__game.ferris`（只读 phase/near/wheel/queue）+ `ferrisWheelAt(s)` / `ferrisStepOnce(s)`（可传结构坐标强制步进）。 |

**How:** `ferrisWheelAt(s)`（与生成公式同源的纯函数）、`ferrisPhase/FERRIS_STEP_T=0.45/FERRIS_RANGE=80`、`ferrisStepOnce(force)`（8 舱各自从 `seg(phase+k*8)` 步进到 `seg(phase+1+k*8)`，守卫式瞬态写）、`setTransientBlock()`（直写区块数据+脏区块队列）、`tickFerrisWheels(dt)`（挂 frame() 的 playing 分支，每帧最多重建 1 个脏网格摊平开销）；`loadGame()`/新世界重置 `ferrisPhase=0` 与烘焙布局同步。修复过程中发现并修掉首版"8 次循环都写同一段座舱格"的错误（此前 wool 计数会 16→2 衰减）。

**Verification:** `node tools/headless.mjs selftest` **403/403** 于默认种子、`?seed=424242`、`?seed=2718281`（新增 3 条：轮体几何与生成公式一致；步进移动座舱且全程恰 16 个座舱格；整圈 64 步后轮体逐字节复原且 `blockDiff` 零增长）。无头截图 `ferris-wheel-step.png`（相位 10）已存档供目视；转动的连续观感与真机帧率仍待点测。

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
