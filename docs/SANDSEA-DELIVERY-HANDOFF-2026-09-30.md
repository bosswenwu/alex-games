# 沙海奇境｜本轮完整交付与 AI 接手说明（2026-09-30）

本页是 [PR #52](https://github.com/bosswenwu/alex-games/pull/52) 的交付索引。PR #52 已依用户明确指令合入 `main`，merge SHA 为 `b0d651749c84e00e5e260463b0655327038417e2`；合并后默认/固定种子各 **362/362 PASS**。**后续 PR 状态与最新分工仍以 GitHub 和 [Issue #11](https://github.com/bosswenwu/alex-games/issues/11) 为准**。

## 文件去向

| 项目 | 入库文件 | 用途 |
|---|---|---|
| 本次对话总报告 | [Word 报告](releases/SANDSEA-CONVERSATION-REPORT-2026-09-30.docx) | 汇总 PR #38/#39/#40/#50/#51/#52 的实际合并状态、P1–P5 路线和待测风险；已补记 #52 的实际 merge SHA。 |
| 下载包 | [P1 工具与指南 ZIP](releases/SANDSEA-P1-TOOLKIT-2026-09-30.zip) | 两份指南与五份 Node/页面脚本的便携副本；项目中的 `tools/sandsea-perf/` 与 `docs/` 源文件才是后续更新的单一事实来源。 |
| 下一开发周期细化计划 | [P1–P5 详细拆解](SANDSEA-P1-P5-NEXT-CYCLE-PLAN-2026-09-30.md) | 已在本轮对话形成的各阶段步骤、下一周期 P1-A 至 P1-F 验收与自动/真人验证矩阵；本次补录入 GitHub。 |
| 人工验收 | [PR #51 合并后点测清单](SANDSEA-PR51-POSTMERGE-ACCEPTANCE-2026-09-30.md) | A1–A7 桌面/真触屏/旧档/命中手感点测与 P0/P1/P2 判断。 |
| 测量方案 | [P1 性能基线与设备监控](SANDSEA-P1-PERFORMANCE-BASELINE-2026-09-30.md) | 同机同场景协议、SwiftShader 限制、真实设备监控使用步骤、阈值及验证方法。 |
| 可复用工程技能 | [Sandsea Iteration 技能](skills/sandsea-iteration/SKILL.md) 与 [Issue #11 记录模板](skills/sandsea-iteration/templates/iteration-record.md) | 源自本轮 `skill-creator` 制作的技能副本。仓库归档**不会自动安装**进其他 AI 的技能目录；使用者应在获授权的环境中按其技能机制启用，并先核对当前仓库/Issue 状态。 |

## 当前可证明的结果与未测项

[PR #51](https://github.com/bosswenwu/alex-games/pull/51) 已在用户先前授权下合并到 `main`，merge SHA `5f0af39a52b964b4f68d4645ba97c6686f95ba27`；[PR #52](https://github.com/bosswenwu/alex-games/pull/52) 已合并，且合并后默认与 `?seed=424242` 的完整 headless selftest 各 **362/362 PASS**。P1 工具的六组**合成**对比夹具通过，固定敌人数的短时无头 smoke 与浏览器 monitor 接口已验证；短样本被正确标为 `NOT_COMPARABLE`。

**未验证：**真实玩家连续闪避/精准反击手感、真触屏输入、真实低端 GPU、匹配的 10 秒预热 + 30 秒采样 × 3 次性能矩阵。不得把软件渲染帧率或脚本布景截图写成真机验收通过。PR #52 仅增加工具与说明，未修改 `games/minecraft/index.html`、战斗数值、控制键或存档字段，因此不另增玩家向 changelog 项。

## 下一位 AI 的执行顺序

1. 先核对实际运行设备、GitHub `main`、Issue #11 最新认领与开放 PR；不要拿文档的日期快照替代实时状态。
2. 根据点测清单获取 A1–A7 的**真实**设备记录；优先处理 P0 战斗/存档/触屏阻断问题。缺设备就明确写“未测”。
3. 只有测到可复现性能或读招问题，才在 Issue #11 单独认领 P1 战斗改码；同机同场景 before/after、一次仅改一个因素、确定性回归与可视检查完整后再开新的单主题 PR。
4. P2 单一对照敌人、P3 有限成长闭环、P4 可重玩遗迹、P5 全系统稳定化按 [长期路线](SANDSEA-LONG-TERM-PLAN-2026-09-30.md) 和 [详细拆解](SANDSEA-P1-P5-NEXT-CYCLE-PLAN-2026-09-30.md) 顺序实施，不因本次脚本入库视为已经开工。
