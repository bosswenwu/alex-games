/* 深渊圣所 · 增强层 enhance.js
 * 纯代码绘制、零外部依赖。以「外挂式包装」的方式给已构建的 Phaser 主包补齐：
 *   1. 手感反馈：顿帧、镜头冲击、冲刺残影、命中挤压、击杀冲击波
 *   2. 视觉质感：暗角、浮尘、低血量心跳、连击边缘辉光、场景淡入
 *   3. 系统可见：常驻操作提示条、深渊压迫（难度梯度）指示器、菜单系统一览
 *   4. 完整闭环：结算评级 + 一键重开（Enter / R）+ 返回菜单（Esc）
 *   5. 调试接口：window.__game 扩展 + window.__abyss 控制台 API
 * 不修改主包玩法数值，只包装方法、追加表现层。
 */
(function () {
  "use strict";

  var VERSION = "enhance-1.0";
  var W = 960;
  var H = 600;

  // ---------- 小工具 ----------
  function now() {
    return performance.now();
  }
  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }
  function state() {
    return (window.__game && window.__game.state) || null;
  }
  // after 钩子：先跑原方法，再跑增强逻辑。允许多次叠加。
  function wrap(proto, name, after) {
    if (!proto || typeof proto[name] !== "function") return;
    var original = proto[name];
    function patched() {
      var result = original.apply(this, arguments);
      try {
        after.call(this, arguments, result);
      } catch (err) {
        console.warn("[enhance] " + name + " after-hook failed", err);
      }
      return result;
    }
    proto[name] = patched;
  }

  // before 钩子：返回 "skip" 可以完全接管原方法（用于护盾抵挡、免死等需要拦截的逻辑）
  function wrapBefore(proto, name, before) {
    if (!proto || typeof proto[name] !== "function") return;
    var original = proto[name];
    function patched() {
      var verdict;
      try {
        verdict = before.call(this, arguments);
      } catch (err) {
        console.warn("[enhance] " + name + " before-hook failed", err);
      }
      if (verdict === "skip") return undefined;
      return original.apply(this, arguments);
    }
    proto[name] = patched;
  }

  // ---------- 顿帧（hit stop） ----------
  // 恢复由每帧的原始 delta 驱动，而不是 setTimeout：
  // 挂起的标签页 / 掉帧 / 自动化逐帧推进都不会把游戏卡在慢放状态。
  function restoreTime(scene) {
    try {
      if (scene.physics && scene.physics.world) scene.physics.world.timeScale = 1;
      scene.time.timeScale = 1;
      scene.tweens.timeScale = 1;
    } catch (e) {
      /* 场景已销毁，忽略 */
    }
    scene.__stopRemain = 0;
    scene.__stopGap = 320;
  }

  function hitStop(scene, ms, hardness) {
    if (!scene || !scene.sys || !scene.sys.isActive()) return;
    if (scene.__stopGap > 0) return; // 冷却中，避免连锁顿帧糊成慢动作
    var slow = hardness || 0.3;
    try {
      if (scene.physics && scene.physics.world) scene.physics.world.timeScale = 1 / slow;
      scene.time.timeScale = slow;
      scene.tweens.timeScale = slow;
    } catch (e) {
      return;
    }
    scene.__stopRemain = ms;
    scene.__stopGap = ms + 320;
  }

  function tickHitStop(scene, delta) {
    if (scene.__stopGap > 0) scene.__stopGap -= delta;
    if (scene.__stopRemain > 0) {
      scene.__stopRemain -= delta;
      if (scene.__stopRemain <= 0) {
        scene.__stopRemain = 0;
        try {
          if (scene.physics && scene.physics.world) scene.physics.world.timeScale = 1;
          scene.time.timeScale = 1;
          scene.tweens.timeScale = 1;
        } catch (e) {
          /* ignore */
        }
      }
    }
  }

  // ---------- 镜头冲击 ----------
  function zoomPunch(scene, amount, ms) {
    var cam = scene.cameras && scene.cameras.main;
    if (!cam) return;
    scene.tweens.add({
      targets: cam,
      zoom: 1 + (amount || 0.03),
      duration: (ms || 80) * 0.4,
      yoyo: true,
      ease: "Quad.easeOut",
      onComplete: function () {
        cam.zoom = 1;
      },
    });
  }

  // ---------- 击杀冲击波 ----------
  function shockwave(scene, x, y, color, radius) {
    var ring = scene.add.circle(x, y, 6);
    ring.setStrokeStyle(3, color == null ? 0xf3e0a8 : color, 0.9);
    ring.setDepth(44);
    scene.tweens.add({
      targets: ring,
      radius: radius || 46,
      alpha: 0,
      duration: 340,
      ease: "Cubic.easeOut",
      onUpdate: function () {
        ring.setStrokeStyle(3, color == null ? 0xf3e0a8 : color, ring.alpha * 0.9);
      },
      onComplete: function () {
        ring.destroy();
      },
    });
  }

  // ---------- 冲刺残影 ----------
  function afterImages(scene) {
    var p = scene.player;
    if (!p || !p.texture) return;
    var key = p.texture.key;
    for (var i = 0; i < 5; i++) {
      (function (index) {
        scene.time.delayedCall(index * 34, function () {
          if (!p.active) return;
          var ghost = scene.add.image(p.x, p.y, key);
          ghost.setDepth(9);
          ghost.setScale(p.scaleX, p.scaleY);
          ghost.setFlipX(p.flipX);
          ghost.setTint(0x7fd7ff);
          ghost.setAlpha(0.42 - index * 0.06);
          scene.tweens.add({
            targets: ghost,
            alpha: 0,
            scaleX: p.scaleX * 0.86,
            scaleY: p.scaleY * 0.86,
            duration: 260,
            onComplete: function () {
              ghost.destroy();
            },
          });
        });
      })(i);
    }
  }

  // ---------- 氛围层：暗角 + 浮尘 + 低血量脉动 ----------
  function buildAmbience(scene) {
    var cam = scene.cameras.main;
    var vignette = scene.add.graphics().setDepth(46).setScrollFactor(0);
    vignette.__tone = 0x000000;
    scene.__vignette = vignette;

    var motes = [];
    for (var i = 0; i < 26; i++) {
      var big = i % 6 === 0;
      var mote = scene.add.circle(
        Math.random() * W,
        Math.random() * H,
        big ? 3.4 : 1.4,
        big ? 0xd9c07a : 0xa9bcd0,
        big ? 0.14 : 0.2
      );
      mote.setDepth(big ? 43 : 6);
      mote.__vx = (Math.random() - 0.5) * 10;
      mote.__vy = -6 - Math.random() * 14;
      mote.__phase = Math.random() * Math.PI * 2;
      motes.push(mote);
    }
    scene.__motes = motes;

    function drawVignette(pulse, tone) {
      vignette.clear();
      var steps = 7;
      for (var s = 0; s < steps; s++) {
        var t = s / (steps - 1);
        var inset = 6 + t * 62;
        vignette.fillStyle(tone, (0.05 + t * 0.05) * pulse);
        vignette.fillRect(0, 0, W, inset);
        vignette.fillRect(0, H - inset, W, inset);
        vignette.fillRect(0, 0, inset, H);
        vignette.fillRect(W - inset, 0, inset, H);
      }
    }

    var tick = 0;
    function onUpdate(time, delta) {
      if (!vignette.scene) return;
      tickHitStop(scene, delta);
      tick += delta;
      var d = delta / 1000;
      for (var m = 0; m < motes.length; m++) {
        var mo = motes[m];
        mo.__phase += d * 1.6;
        mo.x += (mo.__vx + Math.sin(mo.__phase) * 9) * d;
        mo.y += mo.__vy * d;
        if (mo.y < -8) {
          mo.y = H + 8;
          mo.x = Math.random() * W;
        }
        if (mo.x < -8) mo.x = W + 8;
        if (mo.x > W + 8) mo.x = -8;
      }
      var st = state();
      var pulse = 1;
      var tone = 0x05070c;
      if (st) {
        var ratio = st.maxHp ? st.hp / st.maxHp : 1;
        if (ratio <= 0.34) {
          pulse = 1.5 + Math.sin(tick / 190) * 0.75;
          tone = 0x3a0910;
        } else if (scene.combo >= 14) {
          pulse = 1.15;
          tone = 0x2a2008;
        }
      }
      drawVignette(pulse, tone);
    }

    scene.events.on("update", onUpdate);
    scene.events.once("shutdown", function () {
      scene.events.off("update", onUpdate);
    });
    drawVignette(1, 0x05070c);
    cam.fadeIn(420, 4, 5, 9);
  }

  // ---------- 常驻信息层：操作条 + 深渊压迫 ----------
  var HINT = "WASD 移动 · 按住鼠标射击 · 空格冲刺 · F 灵魂爆发 · Q 炸弹 · E 构筑 · Esc 暂停 · H 隐藏提示";

  var HINT_TOUCH = "左摇杆移动 · 右摇杆自动射击 · 冲 / 爆 / 炸弹 / 构筑 按钮";

  function buildInfoLayer(scene) {
    var touch = !!(scene.sys.game.device.input.touch);
    var hint = scene.add
      .text(480, 578, touch ? HINT_TOUCH : HINT, {
        fontSize: "12px",
        color: "#9a927f",
        backgroundColor: "#070910cc",
        padding: { x: 10, y: 4 },
      })
      .setOrigin(0.5, 0.5)
      .setDepth(52)
      .setScrollFactor(0);
    scene.__hint = hint;
    scene.__hintVisible = true;

    var pressure = scene.add
      .text(28, 148, "", {
        fontSize: "12px",
        color: "#d79b7a",
      })
      .setDepth(52)
      .setScrollFactor(0);
    var barBg = scene.add.rectangle(28, 170, 180, 6, 0x231a1a, 0.94).setOrigin(0, 0.5).setDepth(52).setScrollFactor(0);
    var bar = scene.add.rectangle(28, 170, 0, 4, 0xc9603f, 1).setOrigin(0, 0.5).setDepth(52).setScrollFactor(0);
    scene.__pressure = { text: pressure, bg: barBg, bar: bar };

    scene.time.delayedCall(9000, function () {
      if (scene.__hint && scene.__hintVisible) {
        scene.tweens.add({ targets: scene.__hint, alpha: 0.18, duration: 900 });
      }
    });
    if (scene.input && scene.input.keyboard) {
      scene.input.keyboard.on("keydown-H", function () {
        scene.__hintVisible = !scene.__hintVisible;
        scene.__hint.setAlpha(scene.__hintVisible ? 1 : 0);
      });
    }
  }

  function pressureLevel(st, scene) {
    if (!st) return { level: 1, ratio: 0 };
    var waves = scene && scene.waveIndex ? scene.waveIndex - 1 : 0;
    var raw = (st.floor - 1) * 6 + Math.floor(st.roomsCleared / 2) + waves;
    return { level: Math.max(1, raw + 1), ratio: clamp(raw / 18, 0, 1) };
  }

  function refreshInfoLayer(scene) {
    var p = scene.__pressure;
    // 场景重启/关闭途中 updateHud 仍可能被调用，此时文本对象已销毁
    if (!p || !scene.sys || !scene.sys.isActive()) return;
    if (!p.text.scene || !p.bar.scene) return;
    var st = state();
    var info = pressureLevel(st, scene);
    p.text.setText("⚠ 深渊压迫 Lv." + info.level);
    p.bar.width = 180 * info.ratio;
    p.bar.setFillStyle(info.ratio > 0.72 ? 0xe0553f : info.ratio > 0.4 ? 0xd08a45 : 0x8f9d6b);
    if (scene.__hint && scene.__hintVisible) scene.__hint.setDepth(52);
  }

  // ---------- 结算评级 ----------
  function gradeOf(st, win) {
    if (!st) return { grade: "C", note: "深渊无记录" };
    var score =
      st.kills * 2 +
      st.roomsCleared * 6 +
      st.maxCombo * 3 +
      st.relics.length * 8 +
      (st.synergies ? st.synergies.length * 14 : 0) +
      (st.floor - 1) * 40 +
      (win ? 120 : 0);
    var table = [
      [420, "S", "深渊亦为你让路"],
      [300, "A", "圣所的常客"],
      [200, "B", "已窥见门后之物"],
      [110, "C", "尚能再走一程"],
      [0, "D", "深渊记住了你的名字"],
    ];
    for (var i = 0; i < table.length; i++) {
      if (score >= table[i][0]) return { grade: table[i][1], note: table[i][2], score: score };
    }
    return { grade: "D", note: "深渊记住了你的名字", score: score };
  }

  // ---------- 快速重开：结算 → 菜单 → 自动开局 ----------
  var autoStart = false;
  function pressEnter() {
    var ev = new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true });
    window.dispatchEvent(ev);
    document.dispatchEvent(ev);
  }

  // ---------- 场景包装 ----------
  function patchGameScene(scene) {
    var P = Object.getPrototypeOf(scene);

    wrap(P, "create", function () {
      var self = this;
      restoreTime(self);
      buildAmbience(self);
      buildInfoLayer(self);
      // create 期间 scene.sys.isActive() 仍为 false，refreshInfoLayer 会提前返回，
      // 压迫指示器要等到第一次 updateHud 才有字。补一帧延迟刷新，进房间即可见。
      refreshInfoLayer(self);
      self.time.delayedCall(0, function () {
        refreshInfoLayer(self);
      });
      self.__lastFloor = state() ? state().floor : 1;
      // 扩展调试接口
      if (window.__game) {
        window.__game.version = VERSION;
        window.__game.phase = "playing";
        var base = window.__game.getState;
        window.__game.getState = function () {
          var s = base();
          var st = state();
          s.phase = "playing";
          s.pressure = pressureLevel(st, self).level;
          s.wave = self.waveIndex;
          s.totalWaves = self.totalWaves;
          s.roomsCleared = st ? st.roomsCleared : 0;
          s.synergies = st ? st.synergies.slice() : [];
          s.grade = gradeOf(st, false).grade;
          return s;
        };
      }
    });

    wrap(P, "updateHud", function () {
      refreshInfoLayer(this);
    });

    wrap(P, "hitEnemy", function (args) {
      var target = args[1];
      if (!target || !target.active) return;
      var sx = target.scaleX;
      var sy = target.scaleY;
      if (target.__squash) return;
      target.__squash = true;
      this.tweens.add({
        targets: target,
        scaleX: sx * 1.16,
        scaleY: sy * 0.84,
        duration: 55,
        yoyo: true,
        ease: "Quad.easeOut",
        onComplete: function () {
          if (target.active) {
            target.setScale(sx, sy);
          }
          target.__squash = false;
        },
      });
    });

    wrap(P, "killEnemy", function (args) {
      var e = args[0];
      if (!e) return;
      var heavy = e.kind === "boss" || e.kind === "brute" || e.kind === "charger" || !!e.affix;
      shockwave(this, e.x, e.y, heavy ? 0xffb26b : 0xd7e5f0, heavy ? 78 : 44);
      if (heavy) {
        hitStop(this, e.kind === "boss" ? 120 : 70, 0.28);
        zoomPunch(this, e.kind === "boss" ? 0.05 : 0.028, 110);
      }
    });

    wrap(P, "damagePlayer", function () {
      hitStop(this, 90, 0.24);
      zoomPunch(this, 0.04, 110);
      if (this.player) shockwave(this, this.player.x, this.player.y, 0xc74a56, 62);
    });

    // 冲刺 / 爆发都可能因冷却或能量不足而空转，用状态变化判断是否真的触发
    wrap(P, "tryDash", function () {
      if (this.dashReadyAt === this.__prevDashReadyAt) return;
      this.__prevDashReadyAt = this.dashReadyAt;
      afterImages(this);
    });

    wrap(P, "activateOverdrive", function () {
      var cam = this.cameras.main;
      if (!cam) return;
      if (!(this.overdriveUntil > this.time.now)) return;
      zoomPunch(this, 0.07, 220);
      cam.flash(180, 150, 90, 220, false);
      if (this.player) shockwave(this, this.player.x, this.player.y, 0xb894ff, 120);
    });

    wrap(P, "clearRoom", function () {
      zoomPunch(this, 0.02, 160);
      refreshInfoLayer(this);
    });

    wrap(P, "enterRoom", function () {
      var st = state();
      refreshInfoLayer(this);
      if (st && this.__lastFloor !== st.floor) {
        this.__lastFloor = st.floor;
        if (this.__hint && this.__hint.scene) {
          this.__hint.setAlpha(1);
          this.__hintVisible = true;
          this.tweens.add({ targets: this.__hint, alpha: 0.18, delay: 6000, duration: 900 });
        }
        this.cameras.main.fadeIn(420, 4, 5, 9);
      }
    });

    wrap(P, "announceBossStage", function () {
      hitStop(this, 130, 0.22);
      zoomPunch(this, 0.06, 200);
    });
  }

  function patchMenuScene(scene) {
    var P = Object.getPrototypeOf(scene);
    wrap(P, "create", function () {
      var self = this;
      self.cameras.main.fadeIn(500, 3, 4, 8);
      window.__game = window.__game || {};
      window.__game.phase = "menu";
      window.__game.version = VERSION;
      var prev = window.__game.getState;
      window.__game.getState = function () {
        if (self.sys.isActive()) return { phase: "menu", mode: "menu", version: VERSION };
        return prev ? prev() : { phase: "menu", mode: "menu" };
      };

      // 余烬粒子：自下而上缓缓飘升
      var embers = [];
      for (var i = 0; i < 34; i++) {
        var em = self.add.circle(
          Math.random() * W,
          Math.random() * H,
          Math.random() * 2.2 + 0.8,
          Math.random() < 0.3 ? 0xd8a55f : 0x8fa6bb,
          0.05 + Math.random() * 0.22
        );
        em.setDepth(1);
        em.__vy = -8 - Math.random() * 18;
        em.__phase = Math.random() * 6.28;
        embers.push(em);
      }
      var onMenuUpdate = function (time, delta) {
        var d = delta / 1000;
        for (var k = 0; k < embers.length; k++) {
          var e = embers[k];
          e.__phase += d * 1.4;
          e.y += e.__vy * d;
          e.x += Math.sin(e.__phase) * 12 * d;
          if (e.y < -6) {
            e.y = H + 6;
            e.x = Math.random() * W;
          }
        }
      };
      self.events.on("update", onMenuUpdate);
      self.events.once("shutdown", function () {
        self.events.off("update", onMenuUpdate);
      });

      // 暗角
      var vg = self.add.graphics().setDepth(30);
      for (var s = 0; s < 7; s++) {
        var t = s / 6;
        var inset = 4 + t * 40;
        vg.fillStyle(0x04060a, 0.03 + t * 0.045);
        vg.fillRect(0, 0, W, inset);
        vg.fillRect(0, H - inset, W, inset);
        vg.fillRect(0, 0, inset, H);
        vg.fillRect(W - inset, 0, inset, H);
      }

      // 系统一览（右侧）
      var lines = [
        "◈ 已实装系统",
        "3 层主题地牢 · 种子随机",
        "13 种敌人 · 4 类精英词缀",
        "3 名多阶段 Boss",
        "36 件遗物 · 6 种联动",
        "5 种武器 · 连击评级",
        "灵魂爆发 · 冲刺无敌帧",
        "商店 / 祭坛 / 宝箱 / 隐藏房",
      ];
      var y = 150;
      for (var li = 0; li < lines.length; li++) {
        self.add
          .text(946, y, lines[li], {
            fontSize: li === 0 ? "13px" : "11px",
            color: li === 0 ? "#c9a86a" : "#7f7a72",
          })
          .setOrigin(1, 0)
          .setDepth(31);
        y += li === 0 ? 22 : 17;
      }
      self.add
        .text(14, 150, "◈ 本次远征将随机生成\n   地图 · 遗物 · 商店与隐藏房", {
          fontSize: "11px",
          color: "#7f7a72",
          lineSpacing: 5,
        })
        .setDepth(31);
      self.add
        .text(480, 452, "Enter 直接开始", { fontSize: "12px", color: "#8d8677" })
        .setOrigin(0.5)
        .setDepth(31);

      if (autoStart) {
        autoStart = false;
        self.time.delayedCall(120, pressEnter);
      }
    });
  }

  function patchGameOverScene(scene) {
    var P = Object.getPrototypeOf(scene);
    wrap(P, "create", function (args) {
      var self = this;
      var data = args[0] || {};
      var st = state();
      var info = gradeOf(st, !!data.win);
      self.cameras.main.fadeIn(600, 4, 4, 8);

      window.__game = window.__game || {};
      window.__game.phase = "gameover";
      window.__game.version = VERSION;
      window.__game.result = { win: !!data.win, grade: info.grade, score: info.score };
      window.__game.getState = function () {
        return {
          phase: "gameover",
          mode: "gameover",
          win: !!data.win,
          grade: info.grade,
          score: info.score,
          floor: st ? st.floor : 0,
          kills: st ? st.kills : 0,
          roomsCleared: st ? st.roomsCleared : 0,
          maxCombo: st ? st.maxCombo : 0,
          relics: st ? st.relics.slice() : [],
        };
      };

      var gradeColor = { S: "#ffd97a", A: "#a9d8ff", B: "#9fd39a", C: "#d9c08d", D: "#9a9098" }[info.grade];
      var badge = self.add
        .text(480, 175, info.grade, {
          fontFamily: "ZCOOL XiaoWei, KaiTi, STKaiti, serif",
          fontSize: "46px",
          color: gradeColor,
          stroke: "#140d11",
          strokeThickness: 9,
        })
        .setOrigin(0.5)
        .setScale(0.2)
        .setAlpha(0);
      self.tweens.add({ targets: badge, scale: 1, alpha: 1, duration: 520, ease: "Back.easeOut", delay: 260 });
      self.add
        .text(480, 288, "评级 " + info.grade + "  ·  " + info.note + "  ·  评分 " + (info.score || 0), {
          fontSize: "13px",
          color: "#9a9084",
        })
        .setOrigin(0.5);

      self.add
        .text(480, 462, "Enter / R 立即再战    ·    Esc 返回主菜单", {
          fontSize: "13px",
          color: "#8d857c",
        })
        .setOrigin(0.5);

      var restart = function () {
        autoStart = true;
        self.scene.start("menu");
      };
      self.input.keyboard.on("keydown-ENTER", restart);
      self.input.keyboard.on("keydown-R", restart);
      self.input.keyboard.on("keydown-ESC", function () {
        self.scene.start("menu");
      });
    });
  }

  // ---------- 启动 ----------
  function boot(game) {
    var veil = document.getElementById("boot-veil");
    if (veil) {
      veil.classList.add("gone");
      setTimeout(function () {
        if (veil.parentNode) veil.parentNode.removeChild(veil);
      }, 800);
    }

    var g = game.scene.getScene("game");
    var m = game.scene.getScene("menu");
    var o = game.scene.getScene("gameover");
    if (g) patchGameScene(g);
    if (m) patchMenuScene(m);
    if (o) patchGameOverScene(o);

    // 菜单已经 create 过一次（增强层晚于主包加载），补一次重启
    if (m && m.sys.isActive()) {
      m.scene.restart();
    }

    window.__abyss = {
      version: VERSION,
      game: game,
      scene: function (key) {
        return game.scene.getScene(key);
      },
      phase: function () {
        return (window.__game && window.__game.phase) || "boot";
      },
      state: function () {
        return window.__game && window.__game.getState ? window.__game.getState() : null;
      },
      start: function () {
        game.scene.getScene("menu").scene.isActive() ? pressEnter() : game.scene.start("menu");
      },
      toMenu: function () {
        var active = game.scene.getScenes(true)[0];
        if (active) active.scene.start("menu");
      },
      // 页面被隐藏时 rAF 会被节流，用它手动推进游戏循环做自动化验证。
      // Phaser 的 TimeStep 内部直接读 performance.now()，所以这里临时接管时钟，
      // 让补间、计时器和物理都按虚拟时间推进。
      step: function (frames, ms) {
        var loop = game.loop;
        var dt = ms || 16.667;
        var realNow = performance.now.bind(performance);
        var virt = realNow();
        loop.running = true;
        performance.now = function () {
          return virt;
        };
        try {
          for (var i = 0; i < (frames || 1); i++) {
            virt += dt;
            loop.step(virt);
          }
        } finally {
          performance.now = realNow;
        }
        return virt;
      },
      snapshot: function (cb) {
        game.renderer.snapshot(function (image) {
          cb(image.src);
        });
      },
    };
    // 供 expand.js（内容扩展层）复用的共享 API
    window.__abyssKit = {
      wrap: wrap,
      wrapBefore: wrapBefore,
      hitStop: hitStop,
      zoomPunch: zoomPunch,
      shockwave: shockwave,
      state: state,
      clamp: clamp,
      pressureLevel: pressureLevel,
    };
    window.dispatchEvent(new Event("abyss-kit-ready"));
    console.log("[enhance] ready " + VERSION);
  }

  var tries = 0;
  (function waitForGame() {
    if (window.__phaserGame) {
      var game = window.__phaserGame;
      if (game.isRunning || (game.scene && game.scene.getScene("menu"))) {
        boot(game);
        return;
      }
    }
    if (tries++ > 600) {
      console.warn("[enhance] 未找到 window.__phaserGame，增强层未启用");
      return;
    }
    setTimeout(waitForGame, 30);
  })();
})();
