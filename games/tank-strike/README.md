# 钢铁前线 · IRON VEIL

纯 Canvas 2D 实时绘制的俯视角坦克射击游戏，包含波次战斗、敌军 AI、Boss、战场强化、粒子与合成音效。

## 操作

- `WASD` / 方向键：移动
- 鼠标：瞄准
- 鼠标左键：开火
- `Space`：推进冲刺
- `E`：EMP 电磁脉冲
- `P` / `Esc`：暂停

移动端使用左侧虚拟摇杆和右侧 FIRE / EMP / BOOST 按钮。

## 战场威胁提示

敌军进入射程并接近装填完成时，会以红色虚线短暂标出射击方向；临近开火时，玩家坦克周围会出现红色瞄准环。观察提示并及时移动或冲刺，可以主动躲避来袭炮弹。调试接口 `window.__game.getState().enemies` 也会提供 `shotCharge` 与 `telegraph` 状态。

## 启动

从 Alex Games 根目录通过 HTTP/HTTPS 静态服务器访问：

```powershell
npx serve .
```

然后打开 `/games/tank-strike/index.html`。不要直接依赖 `file://` 运行。

## 自测要求

测试脚本会验证开始、移动、开火、敌人受伤、玩家受伤、EMP、升级、重开、桌面截图、移动端触控和控制台零错误。
