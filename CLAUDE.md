@AGENTS.md

# CLAUDE.md — 给 Claude 会话的补充说明

仓库通用规则见上面引入的 AGENTS.md（改 changelog、不擅自提交推送、浏览器验证、headless 工具用法）。本文件只补充 Claude 会话最常用的东西：怎么省 token 地读代码、沙海奇境的代码地图，以及这几轮踩过的坑。

## 省 token 的读法

- `games/minecraft/index.html`（沙海奇境）约 1.6 万行、100 万字符，是单文件。**不要整个 Read**：先用 Grep 按下面的函数名定位，再用 Read 的 offset/limit 读那一段。本文件不写行号，因为行号每轮都会变。
- 协作状态：看 GitHub issue #11 的**正文和最近 5 条评论**，不用翻完全部历史。每轮细节看 `GAME-CHANGELOG.md` 顶部和 `BACKLOG.md` 末尾，不要整份读。
- 后续规划和交接文档在 `docs/`，按文件名里的日期看**最新的那份**（如 `SANDSEA-*-2026-10-01.md`）。根目录 `ROADMAP.md` 里的「缺失功能」清单已过时。

## 仓库结构

- 根目录 `index.html` 是游戏厅首页；各游戏在 `games/<名字>/`：`minecraft`（沙海奇境）、`abyss`、`haven`、`nebula`、`tank-strike`、`three-kingdoms`、`zhuzhiliao`。全部是纯静态页面，零构建、零 npm 依赖。
- `tools/headless.mjs`：无头 Chrome 驱动（selftest / shot / eval），用法见 AGENTS.md。
- 部署：推到 `main` 后 GitHub Pages 和 Vercel 两处自动更新。

## 沙海奇境代码地图（按函数名 Grep）

| 区域 | 入口 |
|---|---|
| 世界常量 | `CS`=16 区块边长，`H`=96 世界高度，`WATER_Y`=29 海平面 |
| 方块 / 物品 / 形状 | `BLOCKS`、`HOTBAR_ITEMS`、`SHAPES`、`SHAPE_MATS`、`RECIPES` |
| 地形生成 | `biomeAt`、`heightAt`、`genChunk`、`geyserSites` |
| 建筑 / 村落 | `structureAt`、`buildStructures`、`drawStructure`、`STRUCT_RAD`、`structureCovers`、`villagePlan` |
| 方块读写 | `getBlock`、`setBlock`（`worldGenReady` 为真时才记入 `blockDiff` 存档）、`groundY` |
| 区块加载 / 网格 | `refreshChunks`（近处同步生成、远处进 `genQueue` 分帧）、`buildChunkMesh`、`bindMeshAttribs` |
| 着色器 | `mainProg`（地形，WebGL2 下经 `glsl3()` 转成 GLSL 300）、`waterProg`、`skyProg`、`horizonProg`、`depthProg`（阴影）、`colProg`、`blobProg`；后处理在 `post` 对象，场景渲染目标是 `sceneFBO` |
| 渲染 | `render()`、`renderReflection()`（平面反射，镜面高度 `reflY` 来自 `pickReflY`）、`GFX_PRESETS` 与 `setGfx()`（低/中/高/极致） |
| 主循环 | `frame()`：逻辑 tick 在前，最后调 `render()`。自测里用 `_stSkipRender` 可以跳过渲染 |
| 天气 | `updateWeather`、`weather`（clear/rain/storm/sand）、`wetK`/`tickWetness`、`rainK`/`tickRainSplash` |
| 生物 / 战斗 | `MOB_DEFS`、`spawnMob`、`updateMobs`、`drawEntity`；敌人伤害统一走 `foeStrike()`，环境伤害走 `damagePlayer()` |
| 玩家技能 | `sandStep`（C 键沙步）、`sandStepDirection`、`sandStepPanelOpen` |
| 输入 | 全局 `document.addEventListener("keydown", …)`；`playing()` = `locked \|\| softLock` |
| 存档 | `SAVE_KEY`、`collectSave`、`saveGame`、`loadGame`。偏好设置（`sandsea_gfx`、`sandsea_music_*`）单独存，不写进世界存档 |
| 调试 / 自测 | `window.__game`；`selftest()` 由 `?selftest=1` 触发，用 `ok(name, cond, detail)` 断言，2026-10 初约 365 条，以实际跑出来的为准 |

## 验证

- 云端或无显卡环境：`CHROME_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node tools/headless.mjs selftest`，约 15–25 秒；本地有显卡约 6 秒。
- 自测世界种子默认随机。怀疑是偶发失败时，用 `"games/minecraft/?seed=424242"` 这类固定种子复现，并多跑几次。
- 画面改动用 `node tools/headless.mjs shot <page> <out.png> --script setup.js` 截图确认；云端是 SwiftShader 软件渲染，截图和帧率都不代表真机。

## 踩过的坑（写测试和改代码时注意）

1. **`groundY()` 在树冠、水面上返回 -1**。测试里挑一列来放东西时，要先确认 `groundY>0`，否则就往旁边找一列。玩家位置常被前面的测试随机留下，这个坑已经导致过多次偶发失败。
2. **自测必须还原现场**：玩家位置和朝向、临时放的方块、天气、`softLock`、面板状态等都要在 `finally` 里还原，否则会污染后面的测试。
3. **自测里不要在渲染流程外做全屏绘制，也不要连续调多次 `frame()`/`render()`**。软件渲染下一次就要几分钟。确实要画时，把 viewport 缩成 1×1，或者打开 `_stSkipRender`。
4. **走真实按键路径的测试要控制朝向**：比如沙步取视线方向，玩家随机正对墙时就不会触发。
5. **不许删除或放宽断言来凑绿**；偶发失败要找到根因，修测试的前提条件，或者修生成逻辑。
6. **老存档兼容是硬约束**：新增存档字段时，缺字段要能读成默认值，类型错误或越界要限幅，并补存档往返测试。
7. **共享表只在末尾追加**（`RECIPES`、`collectSave` 等），注释标明轮次和署名；新方块 ID、图集格、快捷键先在 issue #11 报号。
8. 大改动之前先 `git fetch` 并合并最新 `origin/main`：多个 AI 在并行改同一个文件，冲突多发生在 `GAME-CHANGELOG.md` 顶部，两边条目都保留即可。

## 协作

- 车道（以 issue #11 正文为准）：**云端**负责画面渲染；**Manus**负责玩法、UI、设置、存档；**本地会话**负责结构生成、村落、近战。其他 AI（如 Codex）开工前也先在 issue #11 报号。跨车道先打招呼。
- 各走各的分支，开草稿 PR，**用户说「合并」才合并**。在 issue #11 汇报时附上 PR 链接和自测结果。
- 署名和轮次写成「第 N 轮·署名」，BACKLOG 里写 PR 链接，不写分支名。
