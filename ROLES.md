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

## Cursor 任务队列（按优先级）
1. **Haven 拆包**（P0 唯一未动项）：入口改外链已拆好的 `haven.js`+`styles.css`+`assets/`，删 `haven.html` 4 处 base64，**拆完不要双维护两份**。验收：旧存档 `haven.world.v1` 能读、建造/世界/UI 正常、console 零报错。
2. **修自己的一致性债**：①三国把界面「25 波」统一成「30 波」（已核实 337 行=25、`FINAL_WAVE=30`）；②坦克「矢量履带·推进冷却缩短」升级——真去缩短 `dashCooldown`（现硬编码 4.2）或删掉该文案，别留假信息。
3. **性能补漏**：三国 `victory`/`gameover` 后只画一帧即停 rAF；沙海 `particles` 加上限（抄三国 `QUAL.cap`，低配砍天气粒子）。
4. **深化沙海**：火山/晶洞群系——**先重新核实图集空闲格再写方块**（两份报告冲突：BACKLOG 说 215–232/235–255 空，早前 209–214 疑被罗马敌人占用）；复用死分支 `BIO_FOREST`/`BIO_TAIGA`，别再开新枚举、别再往 209–214 写。再加探索目标（遗迹/沉船+图纸/剧情）。
5. **坦克平衡**：线上点测后调跳弹角度/弹种数值/ Boss 弱点可破性。

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

## 待用户决策
- **竹知了方案A(已上线) vs 方案B**：现状是方案A——MediaPipe+three 全本地化，vendor 约 14MB 入库，仓库 6.6M→20M。Cursor 自己的建议书主张方案B（只本地化 three 1.3MB、MediaPipe 保 CDN+超时+中文兜底、不入库 25MB）。这是仓库体积 vs 抗墙离线的取舍，待用户拍板；在此之前 `games/zhuzhiliao/` 冻结不动。
