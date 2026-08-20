/* 深渊圣所 · 产品化层 ui.js （第三轮 · 第七层）
 * ---------------------------------------------------------------------------
 * 主包的暂停界面（`pause` 场景）只有三个按钮：继续 / 声音开关（一刀切静音）/ 返回主菜单，
 * 没有音量、没有画质、没有键位说明。这一层把它换成一个完整的暂停菜单：
 *
 *   §1 设置持久化（画质档位；音量由 audio.js 自己存）
 *   §2 画质档位：写 window.__abyssQuality，art.js 的特效预算 / 尘埃 / 暗角按它缩放
 *   §3 暂停菜单：键盘 ↑↓ 选择、←→ 调整、Enter 确认、ESC 返回；用 __abyssArt.panel 画框
 *   §4 操作说明子页：把主包 + 三个扩展层的键位统一列出来（此前散落在各层，没有一处能查）
 *
 * 约束：零外部依赖；只替换 pause 场景的 create（那是主包里最简陋的一块，包 after 钩子
 * 没法删掉它已经画上去的按钮），其余场景一律用 kit.wrap 加东西不改原逻辑。
 */
(function () {
  "use strict";

  var VERSION = "ui-1.0";
  var SKEY = "abyssal-deep-ui-v1";
  var FONT = "ZCOOL XiaoWei, KaiTi, STKaiti, Songti SC, serif";

  var GAME = null;
  var kit = null;

  // ===========================================================================
  // §1 + §2 画质档位
  // ===========================================================================
  var TIERS = [
    { id: "high", name: "高", fx: 1, dust: 1, vig: true, desc: "全部粒子与暗角，默认" },
    { id: "mid", name: "中", fx: 0.55, dust: 0.5, vig: true, desc: "粒子减半，保留氛围" },
    { id: "low", name: "低", fx: 0, dust: 0, vig: false, desc: "关闭爆发特效/尘埃/暗角" },
  ];
  var CFG = { quality: "high" };

  function loadCfg() {
    try {
      var raw = JSON.parse(localStorage.getItem(SKEY) || "null");
      if (raw && typeof raw.quality === "string") CFG.quality = raw.quality;
    } catch (e) {
      /* 隐私模式读不到就用默认 */
    }
    applyQuality();
  }
  function saveCfg() {
    try {
      localStorage.setItem(SKEY, JSON.stringify(CFG));
    } catch (e) {
      /* 忽略 */
    }
  }
  function tier() {
    for (var i = 0; i < TIERS.length; i++) if (TIERS[i].id === CFG.quality) return TIERS[i];
    return TIERS[0];
  }
  function applyQuality() {
    var t = tier();
    window.__abyssQuality = { fx: t.fx, dust: t.dust, vig: t.vig };
  }
  function cycleQuality(dir) {
    var i = 0;
    for (var k = 0; k < TIERS.length; k++) if (TIERS[k].id === CFG.quality) i = k;
    i = (i + dir + TIERS.length) % TIERS.length;
    CFG.quality = TIERS[i].id;
    applyQuality();
    saveCfg();
    return TIERS[i];
  }

  function aud() {
    return window.__abyssAudio || null;
  }
  function acfg() {
    var a = aud();
    return a ? a.cfg() : { music: 0.7, sfx: 0.85, muted: false };
  }
  function bar(v) {
    // 用方块画音量条，避免依赖任何图形资源
    var n = Math.round(v * 10);
    var s = "";
    for (var i = 0; i < 10; i++) s += i < n ? "▮" : "▯";
    return s + " " + Math.round(v * 100) + "%";
  }

  // ===========================================================================
  // §4 键位表（各层散落的键位在这里统一登记）
  // ===========================================================================
  var KEYS = [
    ["WASD / 方向键", "移动"],
    ["鼠标", "瞄准；按住 = 持续射击"],
    ["空格", "冲刺（有冷却，冲刺中无敌帧）"],
    ["Q", "放置炸弹"],
    ["E", "构筑面板（武器 / 遗物 / 协同）"],
    ["F", "过载：短时间大幅提升输出"],
    ["H", "显示 / 隐藏屏幕提示"],
    ["M", "深渊记忆（阶级 / 成就 / 恩赐）· 主菜单可用"],
    ["[ ]", "主菜单：调整深潜阶级；N：切换无尽模式"],
    ["ESC", "暂停菜单（本页）"],
    ["靠近即触发", "商店 / 祭坛 / 锻炉铁砧 / 重铸台，走上去自动交互"],
  ];
  // ===========================================================================
  // §3 暂停菜单
  // ===========================================================================
  function buildPause(sc) {
    var W = 960,
      H = 600;
    sc.add.rectangle(W / 2, H / 2, W, H, 0x050408, 0.9).setDepth(0);

    var art = window.__abyssArt;
    var pw = 560,
      ph = 430;
    if (art && art.panel) {
      art.panel(sc, W / 2, H / 2, pw, ph, "暂 停");
    } else {
      sc.add.rectangle(W / 2, H / 2, pw, ph, 0x0d0a12, 0.96).setStrokeStyle(2, 0xe0b352, 0.9);
      sc.add.text(W / 2, H / 2 - ph / 2 + 22, "暂 停", { fontFamily: FONT, fontSize: "24px", color: "#efdcae" }).setOrigin(0.5);
    }

    var rows = [
      { id: "resume", label: "继续探索" },
      { id: "music", label: "音乐音量" },
      { id: "sfx", label: "音效音量" },
      { id: "mute", label: "静音" },
      { id: "quality", label: "画质档位" },
      { id: "keys", label: "操作说明" },
      { id: "menu", label: "返回主菜单" },
    ];
    var sel = 0;
    var top = H / 2 - ph / 2 + 74;
    var lh = 42;
    var texts = [];
    var vals = [];
    rows.forEach(function (r, i) {
      texts.push(
        sc.add.text(W / 2 - pw / 2 + 46, top + i * lh, "", { fontFamily: FONT, fontSize: "21px", color: "#d8cab0" }).setOrigin(0, 0.5),
      );
      vals.push(
        sc.add
          .text(W / 2 + pw / 2 - 46, top + i * lh, "", { fontFamily: FONT, fontSize: "19px", color: "#b7ad8c" })
          .setOrigin(1, 0.5),
      );
    });
    var hint = sc.add
      .text(W / 2, H / 2 + ph / 2 - 30, "", { fontFamily: FONT, fontSize: "14px", color: "#8d8570", align: "center" })
      .setOrigin(0.5);

    // --- 键位子页 ---
    var keyPage = null;
    function openKeys() {
      if (keyPage) return;
      var objs = [];
      objs.push(sc.add.rectangle(W / 2, H / 2, W, H, 0x050408, 0.94).setDepth(40));
      var kw = 660,
        kh = 524;
      if (art && art.panel) {
        var r = art.panel(sc, W / 2, H / 2, kw, kh, "操 作 说 明");
        r.objects.forEach(function (o) {
          o.setDepth(41);
          objs.push(o);
        });
      }
      KEYS.forEach(function (k, i) {
        objs.push(
          sc.add
            .text(W / 2 - kw / 2 + 54, H / 2 - kh / 2 + 76 + i * 34, k[0], {
              fontFamily: FONT,
              fontSize: "19px",
              color: "#efdcae",
            })
            .setOrigin(0, 0.5)
            .setDepth(42),
        );
        objs.push(
          sc.add
            .text(W / 2 - kw / 2 + 246, H / 2 - kh / 2 + 76 + i * 34, k[1], {
              fontFamily: FONT,
              fontSize: "17px",
              color: "#b7ad8c",
            })
            .setOrigin(0, 0.5)
            .setDepth(42),
        );
      });
      objs.push(
        sc.add
          .text(W / 2, H / 2 + kh / 2 - 30, "ESC / Enter 返回", { fontFamily: FONT, fontSize: "15px", color: "#8d8570" })
          .setOrigin(0.5)
          .setDepth(42),
      );
      keyPage = objs;
    }
    function closeKeys() {
      if (!keyPage) return;
      keyPage.forEach(function (o) {
        o.destroy();
      });
      keyPage = null;
    }

    function refresh() {
      var c = acfg();
      var t = tier();
      rows.forEach(function (r, i) {
        var on = i === sel;
        texts[i].setText((on ? "◆ " : "  ") + r.label).setColor(on ? "#f3dda6" : "#a2977f");
        var v = "";
        if (r.id === "music") v = bar(c.music);
        else if (r.id === "sfx") v = bar(c.sfx);
        else if (r.id === "mute") v = c.muted ? "开" : "关";
        else if (r.id === "quality") v = t.name;
        else if (r.id === "keys" || r.id === "menu" || r.id === "resume") v = "▸";
        vals[i].setText(v).setColor(on ? "#efdcae" : "#8d8570");
      });
      var r0 = rows[sel];
      var tip = "↑↓ 选择    Enter 确认    ESC 继续探索";
      if (r0.id === "music" || r0.id === "sfx") tip = "← → 调整音量（音乐与音效互相独立）\n" + tip;
      else if (r0.id === "quality") tip = t.desc + "\n" + tip;
      else if (r0.id === "mute") tip = "总静音，音量设置会被保留\n" + tip;
      hint.setText(tip);
    }

    function adjust(dir) {
      var a = aud();
      var r = rows[sel];
      var c = acfg();
      if (r.id === "music" && a) a.setMusic(Math.round((c.music + dir * 0.1) * 10) / 10);
      else if (r.id === "sfx" && a) a.setSfx(Math.round((c.sfx + dir * 0.1) * 10) / 10);
      else if (r.id === "mute" && a) a.setMuted(dir > 0);
      else if (r.id === "quality") cycleQuality(dir);
      refresh();
    }

    function resume() {
      sc.scene.stop();
      sc.scene.resume("game");
    }

    function confirm() {
      var a = aud();
      var r = rows[sel];
      if (r.id === "resume") {
        if (a) a.play("uiConfirm");
        resume();
      } else if (r.id === "menu") {
        if (a) a.play("uiConfirm");
        sc.scene.stop("game");
        sc.scene.start("menu");
      } else if (r.id === "keys") {
        if (a) a.play("uiConfirm");
        openKeys();
      } else if (r.id === "mute") {
        if (a) a.setMuted(!acfg().muted);
        refresh();
      } else {
        adjust(1);
      }
    }

    sc.input.keyboard.on("keydown", function (ev) {
      var a = aud();
      if (keyPage) {
        if (ev.key === "Escape" || ev.key === "Enter") closeKeys();
        return;
      }
      if (ev.key === "ArrowUp" || ev.key === "w" || ev.key === "W") {
        sel = (sel - 1 + rows.length) % rows.length;
        if (a) a.play("uiMove");
        refresh();
      } else if (ev.key === "ArrowDown" || ev.key === "s" || ev.key === "S") {
        sel = (sel + 1) % rows.length;
        if (a) a.play("uiMove");
        refresh();
      } else if (ev.key === "ArrowLeft") {
        adjust(-1);
        if (a) a.play("uiMove");
      } else if (ev.key === "ArrowRight") {
        adjust(1);
        if (a) a.play("uiMove");
      } else if (ev.key === "Enter" || ev.key === " ") {
        confirm();
      } else if (ev.key === "Escape") {
        resume();
      }
    });

    // 鼠标也能用：点一行 = 选中并确认
    rows.forEach(function (r, i) {
      var zone = sc.add
        .zone(W / 2, top + i * lh, pw - 60, lh - 6)
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      zone.on("pointerover", function () {
        sel = i;
        refresh();
      });
      zone.on("pointerdown", function () {
        sel = i;
        confirm();
      });
    });

    refresh();
    sc.__abyssUiReady = true;
  }

  function installPause() {
    var sc = GAME.scene.getScene("pause");
    if (!sc) return false;
    var P = Object.getPrototypeOf(sc);
    if (P.__abyssUi) return true;
    P.__abyssUi = true;
    // 这里是**替换**不是包装：主包的 create 会把它那三个按钮画上去，
    // after 钩子删不掉，只能整块换掉。原实现保留在 __origCreate 上以便回退。
    P.__origCreate = P.create;
    P.create = function () {
      buildPause(this);
    };
    return true;
  }

  function boot() {
    GAME = window.__phaserGame;
    kit = window.__abyssKit;
    loadCfg();
    installPause();

    window.__abyssUI = {
      version: VERSION,
      tiers: TIERS,
      quality: function () {
        return tier();
      },
      setQuality: function (id) {
        CFG.quality = id;
        applyQuality();
        saveCfg();
        return tier();
      },
      keys: KEYS,
      openPause: function () {
        var g = GAME.scene.getScene("game");
        if (g && g.scene.isActive()) g.scene.pause().launch("pause");
      },
    };
    console.log("[ui] ready " + VERSION);
  }

  var tries = 0;
  (function wait() {
    if (window.__phaserGame && window.__abyssKit && window.__phaserGame.scene.getScene("pause")) {
      boot();
      return;
    }
    if (tries++ > 400) {
      console.warn("[ui] 等待主包超时，产品化层未启用");
      return;
    }
    setTimeout(wait, 60);
  })();
})();
