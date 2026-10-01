# 沙海奇境 P1：性能基线、设备监控与自动化脚本

> **用途**：PR #51 已合并后的下一周期测量工具与执行方案；本 PR 不修改游戏源码/存档/敌人 AI。脚本在 `tools/sandsea-perf/`，Node ≥22，零 npm 依赖。测得的 SwiftShader 帧率是软件渲染**回归信号**，**不是**真机 GPU 结果或已经达标的证明。自然遭遇和触屏手感仍以真人点测记录为准；见 [PR #51 合并后点测清单](SANDSEA-PR51-POSTMERGE-ACCEPTANCE-2026-09-30.md)。

## 1. 游戏代码事实与优化入口

当前 `games/minecraft/index.html`：圣甲虫预警 `0.52 s`，冲锋 `0.38 s`，收招 `0.58 s`，有效起手距离 `<8.5`，水平命中半径 `1.55`；沙步闪避窗口 `0.35 s`，同目标反击窗口 `2.0 s`、伤害 +35%（四舍五入）、封顶 +3。实体蓄力暖色 tint、`emitScarabTelegraph()` 浮空粒子，以及 `updateMobs()` / `updateScarabCharge()` / `drawEntity()` 是 P1 潜在热点。`partCap()` 按 **渲染距离**而非画质档确定上限：`RENDER≤6` 时 90、`≤8` 时 220、其余 420；`autoScalePerf()` 连续低帧时先降档再缩渲染距离，最多 5 次。以上均为代码常量/机制，**不是测量结果**。

优化应先采集相同设备与场景的证据，再区别：CPU 主线程更新/粒子创建、WebGL 绘制/后处理、世界区块重建、输入/指针锁、浏览器后台限帧。只读采样以 rAF 回调时间差估算呈现节奏，p50/p95 采用时间差分位数；`window.__game.fps` 是游戏约 0.5 秒刷新一次的内部 FPS；二者不能代表 GPU 使用率。每 250 ms 采样粒子数、cap、状态机阶段、画质、渲染距离。长任务由可用时的 `PerformanceObserver({type:'longtask'})` 捕获，API 不支持则该指标缺失，不能写作 0；JS heap 也仅在浏览器暴露 `performance.memory` 时有值。慢帧连续时长采用相邻 rAF 间隔 **>33.3ms** 的最长连续区间，只是“持续低于约 30 FPS”的代理指标，不是物理刷新率/真 GPU 用时。

## 2. 采样协议与矩阵

| 维度 | 固定设置 | 有效性检查 |
|---|---|---|
| 版本 | 合并主分支 SHA 与候选修复 SHA | 先基线后候选；相同脚本版本与同类浏览器 |
| 世界/负载 | `seed=424242`；`idle`、`charge1`、`charge3`、`charge6` | 合成场景只保留指定数量圣甲虫；真实设备上另做自然遭遇记录 |
| 渲染 | 低/中/高档 `gfx=0/1/2`，极致可选；固定视口 | 同一 renderer、DPR、浏览器版本、画质、视角与渲染距离方可做前后对比 |
| 时长 | 预热至少 10 s，正式测量至少 30 s，每格新页面重复至少 3 次 | 页面始终可见、无页面错误；样本过少或中途降档标不可比较 |
| 人工参考 | 桌面 1280×720，真实横屏触屏设备，至少一台低端参考机 | 记录机型、OS、浏览器、GPU renderer、屏幕分辨率、温度/电量/电源状态（若可取得） |

**建议门槛（P1 与参考机确认后使用）**：同机、同种子、同负载、同渲染设置的候选与基线 **p95 帧时中位数增加 ≤10%**；低端参考机 `charge3` 不出现连续约 5 s 的 <30 FPS 片段；粒子数不超过当时的 cap，离战后可回落；无页面错误/误判命中。阈值并非浏览器行业标准，不应把候选 `charge3` 与基线 `idle` 相比判退化。真实设备可自动降档；若前后任一运行期间档位/渲染距离改变，则**不可用固定负载 p95 做达标比较**，应先定位降档原因。

## 3. 无头自动化：`baseline.mjs` + `sandsea-perf-page.js`

依赖仓库原生 `tools/headless.mjs eval`，它在隔离 Chromium/SwiftShader 中运行，包装器每格启动新浏览器配置，写 JSON + CSV。脚本**只在测试页**移动角色到固定种子附近开阔地、提升 HP、屏蔽自然刷怪、清除额外实体并强制敌人可见；为了保持固定负载，在软件渲染中临时关闭 `autoScalePerf()`。真实生产源码、旧档均不修改，故它**不验证**自然生成、自动降级有效性、GPU 利用率或触屏操作。报告包含 `autoScaleSuppressed`、`unexpectedSpawnsRemoved`、敌人数/剩余 HP 与 renderer，以便审核样本是否有效。

```bash
# 在仓库根目录，先做小样本功能验证（不是性能结论）
node tools/sandsea-perf/baseline.mjs --scenario charge3 --gfx 1 --warmup 2 --duration 4 --repeat 1 --out /tmp/sandsea-smoke.json

# 正式一格：低画质，固定种子，30 秒 × 3；建议对同一格做前后版本
node tools/sandsea-perf/baseline.mjs --scenario charge3 --gfx 0 --seed 424242 --size 1280x720 --warmup 10 --duration 30 --repeat 3 --out /tmp/sandsea-main-charge3-low.json

# 完整矩阵 4 场景 × 3 画质 × 3 轮，耗时较长；后台运行时定期查看输出
node tools/sandsea-perf/baseline.mjs --matrix --seed 424242 --warmup 10 --duration 30 --repeat 3 --out /tmp/sandsea-p1-matrix.json
```

**对比两个版本**：在保存此工具的工作树调用同一个 `baseline.mjs`，用 `--repo /path/to/older-or-candidate-alex-games` 分别指向版本基线和候选工作树；不会改变这两个工作树代码。候选命令加 `--compare /tmp/older.json` 与 `--max-p95-regression 10`。生成报告的 `comparison.gate` 只能是 `HEADLESS_WITHIN_P95_CEILING`、`REVIEW_REGRESSION`、`FAIL_RUNTIME`、`FAIL_PARTICLE_CAP` 或 `NOT_COMPARABLE`；即使在阈值以内，`deviceAcceptance` 仍为 `NOT_ESTABLISHED_BY_HEADLESS_SWIFTSHADER`。**CLI 本身输出 gate，但不作为 CI 硬失败；审核自动化应检查 JSON gate 字段。**

```bash
node tools/sandsea-perf/baseline.mjs --repo /path/to/candidate-alex-games --scenario charge3 --gfx 0 --seed 424242 --size 1280x720 --warmup 10 --duration 30 --repeat 3 --compare /tmp/sandsea-main-charge3-low.json --out /tmp/sandsea-candidate-charge3-low.json
node -e 'const x=require("/tmp/sandsea-candidate-charge3-low.json");console.log(x.comparison?.gate,x.comparison?.regressionPercent)'
```

`--matrix` 一次跑多格，只用于探索；`--compare` 要求**单格**同协议（种子/视口/DPR/renderer/画质/时长/重复数/设备标签），至少 3 轮。若 SwiftShader 的极端慢速令游戏几乎不推进状态机，报告阶段计数为 0 或出现大量外来实体，应标“不适合估算交战性能”，转真机定位，**不要造出通过率**。

## 4. 真实设备被动采样：`device-monitor.js`

先在实际设备上运行目标版本并进入游戏；建议 Chrome/Chromium 通过远程调试或 DevTools Sources → Snippets **一次粘贴整个脚本并运行**。在页面切到前台、完成 10 秒世界加载/机身升温后，运行下面示例；录制期间不要切 tab、锁屏或改变浏览器缩放，且尽量用相同场景路线与操作。若 DevTools 与游戏在同一台电脑，先让 DevTools 独立窗口，避免改变游戏视口：

```js
// 在浏览器 DevTools Console；加载过 device-monitor.js 才能调用。
// 5 秒后开始：给测试者时间返回游戏并保持前台。
setTimeout(() => window.__sandseaPerf.start({
  seconds: 30, label: 'low-end-android-01', scenario: 'charge3-natural', revision: '5f0af39a'
}), 5000);
// 同一版本同条件重复 3 次（逐次调用，结束后再启动下一次）
// __sandseaPerf.history 只读快照；__sandseaPerf.downloadAll() 导出 3 次 JSON。
```

对桌面、中端手机、低端手机的 `idle` 和实际 `charge3-natural` 分别建**新页面/新序列**；不要将混杂不同场景/画质的 6 次结果保存在同一个 `downloadAll()` JSON 文件里。监控器不改敌人状态，不上传数据、不采集输入行为；输出含 userAgent/设备描述，传给他人前应审查隐私。可通过 `__sandseaPerf.last` 查看本次细节、`stop()` 提前终止；一旦 `hiddenDuringRun` 或 `stopReason` 不为 `duration` 则丢弃重录。记录开始/结束画质、渲染距离、粒子计数/动态 cap、最长慢帧连续时长和长任务，必要时用 Chrome [Performance 面板](https://developer.chrome.com/docs/devtools/performance)抓取 CPU 主线程 flame chart，另用设备 OS/开发者工具测 GPU/温度/电量；页面 JS **不能**测 GPU 占用或温度。

### 自动对比设备序列

对**同一台设备、同一种子/场景/画质/视口**分别在基线版和候选版导出 3 次序列（revision 不同，样本不少于 30 秒），然后：

```bash
node tools/sandsea-perf/compare-device.mjs --baseline /path/to/main-device-series.json --candidate /path/to/candidate-device-series.json --out /tmp/sandsea-device-review.json --max-p95-regression 10 --require-30fps
```

脚本对比 label、场景、seed、userAgent、platform、renderer、画质、渲染距离、视口、DPR 和**WebGL canvas 实际像素尺寸**，要求每个序列至少 3 次、两组次数相等；任何隐藏、运行错误、自动降档、短样本、缺 canvas 尺寸或版本未记录均报 `NOT_COMPARABLE`（exit 3）。未知/通用或 SwiftShader、llvmpipe 等软件 renderer 的双方样本也不能标为“真实 GPU 暂定通过”；仍可保留原始帧时供诊断。p95 中位数恶化超过阈值、粒子数超过同时刻 cap、`--require-30fps` 时出现 ≥5000ms 慢帧连续区间报 `REVIEW_*`（exit 2）；仅可比场景及具有可辨认硬件 renderer 的样本满足这些页面侧阈值时才报 `PASS_PROVISIONAL_REAL_DEVICE`（exit 0），**仍需真人判断读招和触屏手感、独立确认 GPU/温控**。沙步按键/攻击点击的人机可用性不由性能采样证明。

## 5. 质量控制和后续优化顺序

1. 先确认默认与固定种子完整 `selftest`、页面无异常；运行 `node tools/sandsea-perf/test-compare.mjs` 与 `node tools/sandsea-perf/test-monitor.mjs` 锁住设备对比/监控时序逻辑，再用 10 s/30 s×3 建环境档案。前者目前有 9 组**合成**夹具，后者 3 组 VM 模拟时序；它们都不提供真机样本。若一个指标为 `null`，标“不支持/未采到”，不要填 0。
2. `idle→charge1→charge3→charge6` 比较边际成本。用 DevTools 区分 CPU 的 `updateMobs`、粒子创建、世界加载与 GPU 相关绘制/后处理；同时看 `maxTelegraph`、粒子峰值与当时 cap。headless 的阶段覆盖可能不足，需真机录像。
3. 若自然遇敌时出现 P0 命中误判，先修逻辑；性能回归再先定位瓶颈。一次只改一个变量，例如预警粒子频率/单批数量、tint 绘制条件或帧内重复计算；不要同时缩短预警与降低粒子可读性。
4. 每改一次按“基线/候选同条件对比 → 功能/固定种子 selftest → 桌面/横屏截图目视 → 真机点测 → changelog/BACKLOG/Issue #11 → 单主题 PR”收尾。性能没有取得匹配真机样本时填写**待测**，不能把 `HEADLESS_WITHIN_P95_CEILING` 改写为真机 PASS。

## 参考资料

- [MDN：requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)：回调与显示刷新同步、后台常暂停、时间戳间隔的解释。
- [MDN：Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)：`visibilitychange` 和后台节流，说明为何隐藏样本无效。
- [MDN：Long Task Timing](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceLongTaskTiming)：长任务为主线程 ≥50ms；该 API 可用性有限。
- [Chrome DevTools：Analyze runtime performance](https://developer.chrome.com/docs/devtools/performance)：Performance 面板 FPS、主线程火焰图与长任务分析。
