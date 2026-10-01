# 沙海奇境第十八轮提案：P1 低端 GPU 实测与监控可信度

> 状态：[PR #54](https://github.com/bosswenwu/alex-games/pull/54) **已推送、开放待审且未合并**；工具切片已在独立分支实现并测试，真实低端 GPU 数据尚未取得。这是下一周期的执行规格，不是 P1 战斗参数调优已经通过的声明。取数之前先读 [Issue #11](https://github.com/bosswenwu/alex-games/issues/11) 最新认领和本文件记录的基线 SHA；不要复用过期分支事实。

## 1. 已核验事实与主分支健康（2026-09-30，美西时间）

| 项目 | 实际核验结果 |
|---|---|
| [PR #52](https://github.com/bosswenwu/alex-games/pull/52) | 2026-10-01 04:25:34 UTC 合并，merge `b0d651749c84e00e5e260463b0655327038417e2`；3 个 PR 内提交、15 个文件、+741/−7 行。加入点测指南、P1 性能方案、`tools/sandsea-perf/` 五个源脚本、Word/ZIP/技能归档及路线文档；未改游戏 `index.html`。 |
| [PR #53](https://github.com/bosswenwu/alex-games/pull/53) | 2026-10-01 04:29:31 UTC 合并，merge `cb95d55c7e41d14fecb80f3408d567d65bb803e9`；1 个 PR 内提交、5 个文件、+155/−8 行。补录 P1–P5 细化计划，并更新 Word 报告和交接索引的 #52 合并状态；未改游戏 `index.html`。 |
| `main` | `HEAD = origin/main = cb95d55c7e41d14fecb80f3408d567d65bb803e9`，工作树干净；默认与 `?seed=424242` 的 `node tools/headless.mjs selftest` 各 **362/362 PASS**，Chromium/ANGLE SwiftShader。原有对比器 6/6 合成夹具通过；现有监控脚本可解析，页面注入脚本须包在 async 上下文语法检查。无与 #52/#53 关联的 GitHub 检查项，**不能写成 CI 已通过**。 |
| 可维护性/证据界限 | 可玩游戏仍是单一 `games/minecraft/index.html`（约 1,047,452 字节、16,403 行）；这种规模值得持续监测性能和耦合，但不是当前回归失败。SwiftShader、自测、截图/脚本布景都不能证明真实低端 GPU 表现、温控或真人触控感。 |

第十八轮复核时，发现原先误以为 `device-monitor.js` 将慢帧排序后再累加；源码实际上只对分位数排序，连续区间遍历原始 `frames`。**原算法正确，不修改**；本轮增加交替/连续慢帧确定性用例以防将来回归。另有真实可比性缺口：旧对比器没有比对**画布实际像素尺寸**，也可能让双方都使用 SwiftShader/未知渲染器的样本得到“真机暂定通过”；本分支补充这些守门条件。更早的 Issue #11 认领误判已公开勘误。

## 2. 本轮边界、依赖与可交付结果

- **允许修改**：`tools/sandsea-perf/compare-device.mjs`、测试脚本、性能协议文档、可复用 `sandsea-iteration` 技能及交接说明。只新增/调整测量工具，不改 `games/minecraft/index.html`、控制键、存档、敌人 AI 或粒子/伤害数值；不与开放的 [PR #49](https://github.com/bosswenwu/alex-games/pull/49) 争用 `CLAUDE.md`。
- **真实设备前置门**：至少一台**已记录型号/SoC/GPU 的低端参考 Android 设备**和能实际操作它的测试者；固定 OS、Chrome 版本、屏幕刷新率、浏览器显示倍率、设备电量/电源、温度或热状态（能取则记）。目前 Sandbox 只有 SwiftShader；授权设备列表显示一台在线 Desktop，但其 GPU 型号/性能级别未知，**不能将其直接认定为低端 GPU**。USB 真机连通、远程控制与设备实测仍待落实。
- **服务与版本**：在真实手机加载可对应 Git SHA 的不可变候选页面/工作树，先核对浏览器实际拿到的是该版本、seed 和画质；不可用可变线上站点 URL 冒充固定版本。工具不得把设备序列号或用户隐私上传到 GitHub，JSON 发布前审查 UA/设备标签。
- **结果分层**：①工具单测/无头 smoke：可在 Sandbox 完成；②真机页面侧 rAF/粒子数据：需真实设备；③GPU 占用/功耗/温度与用户读招：浏览器 JS 不直接提供，需厂商/OS 分析工具及真人点测，缺项保持 **未测**。本轮“脚本落地”不等于第②③层已经验收。

## 3. 可操作的第十八轮工作包

| ID | 顺序与责任 | 操作/产物 | 完成门槛 |
|---|---|---|---|
| R18-A | 工程代理：锁定基线与认领 | 复核 main、Issue #11、开放 PR；运行默认/固定种子自测；在 Issue 声明只做 P1 工具。 | 记录基线 SHA、断言数、渲染器、脏/净工作树；无他人重叠认领。**本次完成**。 |
| R18-B | 工程代理：脚本可信度 | 保持原顺序的慢帧统计；新增 `test-monitor.mjs`；在 `compare-device.mjs` 比较实际 canvas 像素，并拒绝未知/软件 WebGL renderer 的 GPU 暂定通过。 | 3 个监控时序用例、9 个比较器夹具全绿；软件/缺失 canvas 返回 `NOT_COMPARABLE`（exit 3）；不改生产游戏。**本次分支已实现**。 |
| R18-C | 测试者 + 工程代理：选设备与场景 | 记录一台确为低端的参考机；打开固定版本/seed；关掉投屏，确保前台、未锁屏、非节流；按 `idle` 与**真实可重复**的圣甲虫遭遇分开采样。 | 提交匿名设备档案、页面 revision/renderer/实际 canvas 维度、场景步骤；自然遭遇无法稳定 3 只时不伪写 `charge3`，另设计明确标记的测试专用受控场景。**待真机**。 |
| R18-D | 测试者：真实设备取样 | 每格预热至少 10 秒（加载世界和初始编译完成后）；使用 DevTools Snippet 加载 `device-monitor.js`，**返回游戏前台**，在同一页面按相同路线独立采样 30 秒 ×3；先基线版后候选版；同时录像记录起止画质、粒子、热状态与 FPS。 | 每版一份含 3 次原始 run 的 JSON、操作视频/时间戳、没有隐藏或意外降档。DevTools 连接与投屏可能改变开销；关闭 screencast，并在同样接入条件测两版。**待真机**。 |
| R18-E | 工程代理：自动审查与诊断 | `compare-device.mjs --require-30fps` 比较**同机同场景同画质同视口/DPR/实际 canvas 像素**样本；可用时用 Chrome Performance 面板定位 CPU 主线程长任务，另用支持的 OS/厂商工具获取 GPU/热证据。 | 未满足协议为 `NOT_COMPARABLE`，不强行判 PASS；p95 中位数恶化 >10%、连续 >33.3 ms 帧间隔累计 ≥5s、粒子超 cap 均回报复审；GPU 占用缺失明确标空。 |
| R18-F | 工程代理：条件优化与交付 | 仅在复现问题时另开**游戏性能参数**认领，定位 CPU/GPU 主要瓶颈后一次只改一个因素，保存 before/after、截图与完整回归；更新 BACKLOG/Issue/PR。 | 未取得真机不动战斗数值、不宣布 P1 达标。本工具/计划切片开独立待审 PR，**未获新的明确合并授权不合并**。 |

**采样建议**：第一优先级是低端机 `idle` 与可重复的真实 `charge3`；随后按成本与证据质量补 `charge1`、低/中/高画质、横屏不同视口。不得把无头隔离页强制视线/提升 HP/屏蔽自然刷怪的场景伪装为真实遭遇。相同场景、相同 GPU、相同画布像素下基线与候选的**三次 p95 帧时中位数**建议恶化不超过 10%；低端 `charge3` 无 ≥5s 连续低于约 30 FPS 的 rAF 代理片段。阈值需选定参考机后由测试者确认。刷新率、系统省电/温控和后台暂停都会影响 rAF，记录并排除不可比样本。

## 4. 逐项测试用例与预期

| 用例 | 操作/夹具 | 通过标准与当前状态 |
|---|---|---|
| H01 双种子基线 | `node tools/headless.mjs selftest` 和 `node tools/headless.mjs selftest 'games/minecraft/?seed=424242'` | 各 362/362，零运行时错误；**当前 main 已通过**。 |
| H02 工具注入解析 | `node --check` 检查独立 CLI；用 async wrapper 解析 `sandsea-perf-page.js`（它不是独立 Node 程序）。 | 不把注入脚本合法的 top-level `await` 误报为应用语法错误；**已通过**。 |
| M01 交替慢帧 | 模拟交替 16/40 ms，1 秒采样。 | `longestSlowStreakMs=40`、p95=40；**新增回归用例通过，原算法不变**。 |
| M02 连续慢帧 | 模拟 40/45 ms 相邻，其间插入 16 ms 正常间隔。 | 最长连续 85 ms；**新增用例通过**。 |
| M03 隐藏后恢复 | 测量中触发 `visibilitychange` hidden → visible。 | `hiddenDuringRun=true`，不得作为真机有效数据；**新增用例通过**。 |
| C01–C06 原比较器夹具 | 相同条件、p95 退化、隐藏、renderer 变化、慢帧、动态 cap 越界。 | PASS/REVIEW/NOT_COMPARABLE 各按规则返回；**6/6 已通过**。 |
| C07 canvas 像素变化 | CSS 视口与 DPR 相同，候选 canvas `844×390→640×390`。 | `NOT_COMPARABLE`（exit 3）；**新增用例通过**。 |
| C08 canvas 数据缺失 | 一方缺少 WebGL canvas 像素大小。 | `NOT_COMPARABLE`，不得补零；**新增用例通过**。 |
| C09 双方软件渲染 | before/after renderer 均为 SwiftShader。 | `NOT_COMPARABLE`，不是“真实 GPU 暂定通过”；**新增用例通过**。 |
| D01 真实设备档案 | 记录低端型号、SoC/GPU、系统/Chrome、屏幕刷新率、实际 renderer 与 canvas 像素，核对游戏版本。 | hardware 证据可核验；未知/通用 renderer 只能用于诊断，不判 GPU 门槛；**待设备**。 |
| D02 有效序列 | 同机、同种子/场景/画质，每版 10s 预热、30s ×3，页面全程可见。 | 原始 JSON、录屏、版本 SHA/设备档案完整；对比器产生可解释结果；**未测**。 |
| D03 不可比序列 | 缩小 canvas、换浏览器/GPU、切 tab、自动降画质、人工提前 stop 或缺样本。 | 明确 `NOT_COMPARABLE`；缺数据不得以 0 代替；**真机待测**。 |
| D04 质量与热衰减 | 低端设备重复真实遭遇及相近时段空闲；记录热状态与 30s 长帧、粒子峰值/战后回落。 | ≥5s 慢帧、cap 越界或页面错误触发复审；热/OS GPU 指标不支持则标“未测”；**待真机**。 |
| G01 操作/读招 | 按 [PR #51 A1–A7 点测清单](SANDSEA-PR51-POSTMERGE-ACCEPTANCE-2026-09-30.md) 实际躲避、反击、触屏横屏。 | 真人能辨认预警、按键/按钮生效、误判可复现并记录；不能被 rAF 成绩替代；**未测**。 |

> 注意：`PASS_PROVISIONAL_REAL_DEVICE` 仅表示**页面侧帧时代理指标**通过协议，不表示 GPU 占用、机身温控、真实交互全部合格。若渲染器报 SwiftShader/未知、实际画布不一致、场景不重复，必须返回不可比。若同一版本只采了 before，没有独立 candidate，形成**基线档案**而非 before/after PASS。

## 5. 命令与人工操作卡

```bash
# 仓库根目录；只是软件渲染逻辑冒烟，不是低端 GPU 数据
node tools/sandsea-perf/test-monitor.mjs
node tools/sandsea-perf/test-compare.mjs
node tools/sandsea-perf/baseline.mjs --scenario charge3 --gfx 0 --seed 424242 --warmup 2 --duration 4 --repeat 1 --out /tmp/sandsea-r18-smoke.json

# 只有真实设备同场景的三次有效序列才调用此对比
node tools/sandsea-perf/compare-device.mjs --baseline /path/to/before.json --candidate /path/to/after.json --out /tmp/r18-device-review.json --max-p95-regression 10 --require-30fps
```

Android Chrome 可按 [Chrome 官方远程调试](https://developer.chrome.com/docs/devtools/remote-debugging/)通过 USB/`chrome://inspect#devices` 连接；**关闭 screencast**，因为官方明确说明它会损害帧率。测量页前台执行 `device-monitor.js`，先人工预热 10 秒，再 `__sandseaPerf.start({seconds:30,label:'anonymous-low-end-01',scenario:'charge3-natural',revision:'<exact-sha>'})`，在**同一页面**连续测三轮并记录缓存/热状态，结束后 `downloadAll()`；刷新页面会清空内存中的 `history`，若必须每轮重开页面，需分别下载原始 run 并经额外校验后再组装序列。一次序列只保存同场景/画质，不要把 idle 与 charge3 混进同一个对比文件。分析短时瓶颈可用 [Chrome Performance 面板](https://developer.chrome.com/docs/devtools/performance)观察 FPS/主线程，但录制带有测量开销，正式两版本应同等条件。

## 6. 下一次决策与交接边界

- **现在即可完成**：当前分支的工具/文档/技能变更，单元测试、无头 smoke、双种子自测、PR 和 Issue 交接；没有真实设备时止步于“实测待办”。
- **需要外部条件才能完成**：确定低端参考机和操作方、手机能访问确定 SHA 页面、采到真机 JSON/录像、按场景和硬件核对可比性。在线 Desktop 的 GPU 型号未知，不能替代这一步；若用户之后指定设备，再按授权环境与设备权限重新检查。
- **可能的后续工具工作**：收集完整画质/渲染距离时间线以捕捉测量中改档又恢复；改进可重复的**真实设备**测试场景和预热记录。不得为了“改善得分”关闭生产自动降档或削弱圣甲虫预警可读性。
- **代码健康局限**：当前无 PR 检查项；自测仅覆盖已有 362 项，不等于性能/真实触屏验收。详情见 [P1 性能方案](SANDSEA-P1-PERFORMANCE-BASELINE-2026-09-30.md) 与 [长期路线](SANDSEA-P1-P5-NEXT-CYCLE-PLAN-2026-09-30.md)。

## 资料依据

- [Chrome：Android 远程调试](https://developer.chrome.com/docs/devtools/remote-debugging/)（USB 检测、Inspect、screencast 影响帧率）。
- [Chrome：Performance 面板](https://developer.chrome.com/docs/devtools/performance)（FPS、CPU、长任务/帧轨迹）。
- [MDN：requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)（刷新率与后台节流、时间戳口径）。
