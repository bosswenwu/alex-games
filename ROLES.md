# 协作分工 & 防冲突协议

> 两个 AI（Claude 主会话 / Cursor agent）并发开发同一仓库。本文件定义谁改哪些文件、以及避免互相覆盖的 git 纪律。开工前先读本文件 + `BACKLOG.md`。

## 部署与仓库（重要）
- **网页部署仓库 = `github.com/bosswenwu/alex-games`（本目录）**。桌面根那个 git 仓库（`game/深渊圣所` 等）是本地备份，**不参与线上部署**，网页的活一律落到本仓库。
- 推 `main` → GitHub Pages 主站 + Vercel 镜像同时更新。

## 防冲突协议（每次动手都遵守）
1. **一个文件同一时间只有一个 owner**（见下表）。不要碰不属于你的文件。
2. **动手前 + 推送前都 `git pull --rebase origin main`**；推完再干下一件。
3. **小提交、单一目的、改完立刻 push**，把分叉窗口压到最短。
4. **只 `git add <明确路径>`，永远不要 `git add -A`**（会误吞 `games/zhuzhiliao/vendor/`、`.claude/`、各 `*PROGRESS*.md` 等本地产物）。
5. `BACKLOG.md` 为共享文件：**只追加、先 pull 再改**，不要整体重写别人的段落。

## 文件归属
| Owner | 文件 |
|---|---|
| **Cursor** | `games/haven/`、`games/minecraft/`、`games/three-kingdoms/`、`games/tank-strike/`、`games/zhuzhiliao/` |
| **Claude** | `index.html`、`games/nebula/`、`games/abyss/`、`ROLES.md`、`vercel.json` |
| 共享(追加式) | `BACKLOG.md` |

## Cursor 已完成（PR #1，已合并 2026-08-22 · 979aacc）
竹知了方案B、Haven 拆包、三国 25→30、坦克 dashMax 文案对齐、三国停 rAF + 沙海粒子上限、沙海晶洞/遗迹群系(复用 BIO_FOREST/TAIGA)+指南针、五款返回游戏厅。静态复核通过；运动/摄像头/存档等运行项待真机点测。

## Cursor 下一波队列（从**更新后的 main** 拉分支，先 `git pull --rebase`；小提交、一批做完开 PR 由 Claude 复核合并）
1. **沙海"探索兑现"**（延续群系，最合"上强度"）：遗迹/沉船/商队残骸给**真实掉落**——图纸/稀有材料/剧情碎片；一条按群系产材的**资源链分级**；至少一个**环境事件**（沙暴：能见度骤降 + 需躲掩体）。指南针已能指遗迹，现在让抵达有回报。
2. **全站音频档次**（三款自承短板，跨游戏最大缺口）：三国/坦克/Haven 各补——设置面板**音乐/音效独立音量 + 静音**；音效加**变体/随机音高**避免听腻；关键节点听感区分(暴击/Boss/胜负)。**WebAudio 合成，不下载 mp3**。
3. **坦克步骤2 演出补全**：核实开火时 `recoilV`/`turretRecoil`/`hullPitch` 真被赋值(后坐/炮管缩回/车身后仰)，补**装填进度环**(用现有 `fireRate`/`lastShot`)，炮口用 `burst()` 加烟——"像坦克"的手感闭环。
4. **订正 BACKLOG 陈旧行**：顶部与 P0 段仍写"方案A/20M""haven.html 保留为离线单文件包"，已过时，改为方案B/已拆外链壳。

## Claude 任务队列
1. 首页：给竹知了标「需摄像头」、深渊标「键鼠」；精选封面加 `fetchpriority="high"`（游戏卡 `loading="lazy"` 已有）。
2. Nebula：补 `window.__game = NS`；弹池满时**回收最老的敌弹**而非静默丢弹（高波次掉手感真因）。
3. 深渊：`redressForge()` 把底层圆/矩形 `setAlpha(0)`，消除锻炉双层（比逐帧动画划算）。
4. `file://` 硬跳线上 → 改成「提示用本地 HTTP」而非静默踢走（避免 Vercel 用户被带到 Pages）。
5. 协调 / 复核 / 维护 BACKLOG。

## 验证分工（诚实边界）
- 无头浏览器不合成帧、rAF 不推进：**瞄准/后坐/跳弹/摄像头/群系画面必须真机或显示态浏览器点测**（由用户或显示态会话做）。
- 两个 AI 负责能自动化的部分：语法校验、`window.__game` 状态断言、git 状态核对、加载零报错。

## 明确不做
- 全站模块化 / 公共引擎 / Vite·webpack（7 款技术栈各异，抽公共层拖死迭代）。
- 音效改下载 mp3 包（定 WebAudio 合成 + 音量分轨 + 变体）。
- 拆包后继续双维护 `haven.html`+`haven.js`。
- 把无头浏览器当手感验收。
- `git add -A`（见协议 4）。

## 已决策
- **竹知了：用户已选方案B（2026-08-22）**。执行见 Cursor 队列第 0 项。
