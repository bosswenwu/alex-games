/* 深渊圣所 · 深层 Boss 与敌人层 deep-boss.js  （第三轮 · 第八层）
 * ---------------------------------------------------------------------------
 * 跑在 deep.js 暴露的 window.__deep SDK 上（与 deep-content.js 同源），
 * 这一层专做「主包私有表里原本没有的敌人与 Boss」，并且是**原生注册**：
 *   - 新敌人进 E 表，走主包的 spawnEnemy / 血条 / 层数缩放 / 死亡奖励；
 *   - 新 Boss 进 P 表，走主包的 telegraph → executeBossPattern → 阶段切换 →
 *     bossIntro → 血条 → announceBossStage，一条不落。
 *
 * 主包读实（见 PROGRESS.md「主包关键机制」）后确认的三处「新名会落空」并已补齐：
 *   ① 敌人自定义 ai 名在 updateEnemyAI 的 if/else 链里没有分支 → 敌人会站着不动。
 *      解法：wrapBefore(updateEnemyAI)，认出自己的 ai 名就自行驱动并 return "skip"。
 *   ② Boss 自定义 pattern 名在 executeBossPattern 里没有分支 → 预警照放但没有实弹。
 *      解法：wrap(executeBossPattern) 在原方法之后补上自定义 pattern 的执行。
 *   ③ Boss 出生 bossId 在 spawnWave 内联写死 seraph（floor>=3）。
 *      解法：wrapBefore(spawnEnemy) 认出 boss 生成，按规则把 bossId 改判成新 Boss。
 *      仅在「无尽深潜第 4 层起」轮替，或普通局按种子约 1/3 作第 3 层备选终 Boss；
 *      seraph 仍在池中，非破坏。
 *
 * 贴图：零外部依赖，全部 Canvas2D 程序化生成后缓存进 game.textures（同 art.js 手法）。
 * 192×192 与主包角色 PNG 同尺寸，body 居中，与 setCircle 的物理圆对齐。
 */
(function () {
  "use strict";

  var D = null; // SDK (window.__deep)
  var Ph = null;
  var kit = null;
  var GAME = null;

  function st() {
    return D.state();
  }
  function log(m) {
    console.log("[deep-boss] " + m);
  }

  // ===========================================================================
  // §0 程序化贴图（Canvas2D → game.textures）
  // ===========================================================================
  var TEXDONE = {};
  function tex(key, w, h, painter) {
    try {
      if (TEXDONE[key] && GAME.textures.exists(key)) return key;
      if (GAME.textures.exists(key)) GAME.textures.remove(key);
      var ct = GAME.textures.createCanvas(key, w, h);
      var ctx = ct.getContext();
      painter(ctx, w, h);
      ct.refresh();
      TEXDONE[key] = true;
      return key;
    } catch (e) {
      console.warn("[deep-boss] 贴图生成失败 " + key, e);
      return null;
    }
  }

  // 小工具：把 0xRRGGBB 转 css
  function css(hex, a) {
    var r = (hex >> 16) & 255,
      g = (hex >> 8) & 255,
      b = hex & 255;
    return "rgba(" + r + "," + g + "," + b + "," + (a == null ? 1 : a) + ")";
  }

  // --- 空渊裔：披风兜帽 + 虚空核心 + 飘散的相位丝 -----------------------------
  function paintWraith(ctx, w, h) {
    var cx = w / 2,
      cy = h / 2;
    ctx.clearRect(0, 0, w, h);

    // 外层相位光晕
    var glow = ctx.createRadialGradient(cx, cy, 8, cx, cy, 92);
    glow.addColorStop(0, css(0x9a6cff, 0.5));
    glow.addColorStop(0.5, css(0x5b3aa8, 0.18));
    glow.addColorStop(1, css(0x120a26, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    // 飘散的相位丝（下摆）
    ctx.lineWidth = 5;
    for (var i = -3; i <= 3; i++) {
      var sx = cx + i * 12;
      ctx.strokeStyle = css(i % 2 ? 0x6f4bd0 : 0x4a2f8f, 0.85);
      ctx.beginPath();
      ctx.moveTo(sx, cy + 6);
      ctx.quadraticCurveTo(sx + i * 8, cy + 58, sx + i * 16, cy + 96 + Math.abs(i) * 4);
      ctx.stroke();
    }

    // 兜帽披风主体（水滴/斗篷剪影）
    ctx.beginPath();
    ctx.moveTo(cx, cy - 62);
    ctx.bezierCurveTo(cx + 52, cy - 44, cx + 46, cy + 40, cx + 20, cy + 74);
    ctx.lineTo(cx - 20, cy + 74);
    ctx.bezierCurveTo(cx - 46, cy + 40, cx - 52, cy - 44, cx, cy - 62);
    ctx.closePath();
    var body = ctx.createLinearGradient(cx, cy - 62, cx, cy + 74);
    body.addColorStop(0, css(0x3a2668));
    body.addColorStop(0.55, css(0x241541));
    body.addColorStop(1, css(0x140b28));
    ctx.fillStyle = body;
    ctx.fill();

    // 轮廓光（右上方向光）
    ctx.lineWidth = 3;
    ctx.strokeStyle = css(0xb79bff, 0.7);
    ctx.stroke();

    // 兜帽内的虚空核心
    var core = ctx.createRadialGradient(cx, cy - 8, 2, cx, cy - 8, 30);
    core.addColorStop(0, css(0xf0e6ff, 0.95));
    core.addColorStop(0.35, css(0xa877ff, 0.9));
    core.addColorStop(1, css(0x3a1f78, 0));
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy - 8, 30, 0, Math.PI * 2);
    ctx.fill();

    // 核心里的裂隙眼
    ctx.strokeStyle = css(0x2a0f4a, 0.9);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy - 8);
    ctx.lineTo(cx, cy - 14);
    ctx.lineTo(cx + 10, cy - 8);
    ctx.lineTo(cx, cy - 2);
    ctx.stroke();
  }

  // --- 噬渊之王：同心暗环 + 张开的渊口 + 六道尖棘 + 轮廓光 --------------------
  function paintEater(ctx, w, h) {
    var cx = w / 2,
      cy = h / 2;
    ctx.clearRect(0, 0, w, h);

    // 外层氛围光
    var amb = ctx.createRadialGradient(cx, cy, 12, cx, cy, 96);
    amb.addColorStop(0, css(0x7a4fd0, 0.4));
    amb.addColorStop(0.6, css(0x2a1550, 0.18));
    amb.addColorStop(1, css(0x0a0618, 0));
    ctx.fillStyle = amb;
    ctx.fillRect(0, 0, w, h);

    // 六道尖棘（放射）
    ctx.save();
    ctx.translate(cx, cy);
    for (var k = 0; k < 6; k++) {
      ctx.rotate((Math.PI * 2) / 6);
      var spike = ctx.createLinearGradient(0, -40, 0, -90);
      spike.addColorStop(0, css(0x4a2f8f, 0.95));
      spike.addColorStop(1, css(0x1a0e38, 0.2));
      ctx.fillStyle = spike;
      ctx.beginPath();
      ctx.moveTo(-13, -42);
      ctx.lineTo(0, -92);
      ctx.lineTo(13, -42);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = css(0x9a7bff, 0.5);
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();

    // 主体外壳（暗紫石质球）
    var shell = ctx.createRadialGradient(cx - 18, cy - 20, 8, cx, cy, 62);
    shell.addColorStop(0, css(0x4d3382));
    shell.addColorStop(0.6, css(0x2c1a54));
    shell.addColorStop(1, css(0x160c30));
    ctx.fillStyle = shell;
    ctx.beginPath();
    ctx.arc(cx, cy, 62, 0, Math.PI * 2);
    ctx.fill();

    // 同心暗环（吞噬的纹路）
    for (var r = 54; r > 20; r -= 11) {
      ctx.strokeStyle = css(0x120a28, 0.55);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 张开的渊口（中央发光深洞）
    var maw = ctx.createRadialGradient(cx, cy, 2, cx, cy, 30);
    maw.addColorStop(0, css(0xffffff, 0.95));
    maw.addColorStop(0.25, css(0xd8b0ff, 0.95));
    maw.addColorStop(0.6, css(0x7a3fd0, 0.85));
    maw.addColorStop(1, css(0x0a0420, 0.95));
    ctx.fillStyle = maw;
    ctx.beginPath();
    ctx.arc(cx, cy, 30, 0, Math.PI * 2);
    ctx.fill();

    // 渊口锯齿
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = css(0x1a0e38, 0.92);
    for (var t = 0; t < 10; t++) {
      ctx.rotate((Math.PI * 2) / 10);
      ctx.beginPath();
      ctx.moveTo(-6, -30);
      ctx.lineTo(0, -19);
      ctx.lineTo(6, -30);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // 轮廓光（右上）
    ctx.strokeStyle = css(0xc4a8ff, 0.75);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, 62, Math.PI * 1.15, Math.PI * 1.9);
    ctx.stroke();
  }

  // ===========================================================================
  // §1 新敌人：空渊裔 x_wraith（自定义 AI x_phase）
  // ===========================================================================
  var WRAITH = "x_wraith";
  var WRAITH_TINT = 0x9a6cff;
  var WRAITH_STATS = {
    name: "空渊裔",
    texture: WRAITH,
    hp: 30,
    speed: 96,
    radius: 11,
    contact: 1,
    ai: "x_phase",
    cooldown: 1650,
    bulletSpeed: 225,
    tint: WRAITH_TINT,
    weight: 0, // 不进任何主题池（主题池是字面量），只靠 poolRule 注入或 Boss 召唤
  };

  // 自定义 AI：中距离绕身游走并缓慢逼近，冷却到就「相位穿身猛扑」并甩出一发。
  // 猛扑期间不再每帧改写速度（return 早退），靠无阻力让它笔直穿过玩家。
  function wraithAI(g, e, ang, dist, now, spd) {
    if (e.__spin === undefined) e.__spin = Math.random() < 0.5 ? 1 : -1;

    if (e.aiState === "lunge") {
      if (now < e.stateUntil) return; // 保持猛扑速度
      e.aiState = "idle";
      // 相位落地：一圈碎裂粒子
      g.fx.particle(e.x, e.y, WRAITH_TINT, { count: 8, speed: 70, life: 260, size: 3 });
    }

    if (now - e.lastAttack > (e.cooldown || e.def.cooldown)) {
      e.aiState = "lunge";
      e.stateUntil = now + 500;
      e.lastAttack = now;
      // 预警相位闪 + 甩弹
      g.fx.particle(e.x, e.y, 0xd8c4ff, { count: 12, speed: 95, life: 300, size: 3 });
      if (g.enemyFire) g.enemyFire(e, ang, 1, e.def.bulletSpeed, WRAITH_TINT);
      e.setVelocity(Math.cos(ang) * spd * 3.4, Math.sin(ang) * spd * 3.4);
      return;
    }

    // 绕身游走（切向）+ 缓慢闭合到 ~170 半径
    var perp = ang + (Math.PI / 2) * e.__spin;
    var closing = (dist - 170) * 0.34;
    e.setVelocity(
      Math.cos(perp) * spd * 0.82 + Math.cos(ang) * closing,
      Math.sin(perp) * spd * 0.82 + Math.sin(ang) * closing
    );
  }

  // ===========================================================================
  // §2 新 Boss：噬渊之王 x_eater
  // ===========================================================================
  var EATER = "x_eater";
  var EATER_TINT = 0x7a4fd0;
  var EATER_STATS = {
    name: "噬渊之王",
    title: "以静默吞没了三座圣所的光",
    hp: 1120,
    tint: EATER_TINT,
    phases: [0.66, 0.33], // 3 阶段
    stageNames: ["垂涎", "渊口张开", "万有归寂"],
    // 复用原生 pattern（radial/spiral/cross/summon）+ 自定义 x_vortex
    patterns: ["radial", "x_vortex", "spiral", "summon", "cross", "x_vortex"],
  };

  // 自定义 pattern：汇聚弹幕漩涡 + 召唤空渊裔。
  // executeBossPattern 原方法对未知 pattern 无分支 → 用 wrap-after 在其后补执行。
  function vortexExecute(g, boss, def, stage) {
    if (!boss || !boss.active) return;
    var arms = 3 + stage; // 阶段越高手臂越多
    for (var k = 0; k < arms; k++) {
      (function (k) {
        g.time.delayedCall(k * 85, function () {
          if (!boss.active) return;
          var base = boss.phase + (k * (Math.PI * 2)) / arms;
          g.enemyFire(boss, base, 9, 150 + stage * 22, def.tint);
        });
      })(k);
    }
    // 与新敌人联动：漩涡把空渊裔从渊口里吐出来
    var n = 1 + stage;
    for (var s2 = 0; s2 < n; s2++) {
      g.spawnEnemy(boss.x + Ph.Math.Between(-70, 70), boss.y + Ph.Math.Between(-70, 70), WRAITH);
    }
    g.fx.explosion(boss.x, boss.y, 88, def.tint);
    if (kit.shockwave) kit.shockwave(g, boss.x, boss.y, def.tint, 150);
    if (kit.zoomPunch) kit.zoomPunch(g, 0.03, 150);
  }

  // 自定义 pattern 的预警加料：在原预警之上叠几圈向内汇聚的环，强化「漩涡」读感。
  function vortexTelegraph(g, boss, def) {
    if (!boss || !boss.active) return;
    for (var i = 0; i < 3; i++) {
      (function (i) {
        var ring = g.add.circle(boss.x, boss.y, 150 - i * 8);
        ring.setStrokeStyle(2, def.tint, 0.5).setDepth(6);
        g.tweens.add({
          targets: ring,
          radius: 28,
          alpha: 0,
          duration: 520,
          delay: i * 90,
          ease: "Sine.In",
          onComplete: function () {
            ring.destroy();
          },
        });
      })(i);
    }
  }

  // ===========================================================================
  // §3 投放规则
  // ===========================================================================
  // 种子字符串 → 稳定 0..1，用来决定普通局第 3 层是否换成新 Boss。
  function seedFrac(s) {
    var h = 2166136261;
    var str = String((s && s.seed) || "") + "|eater";
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return (h % 1000) / 1000;
  }

  // 判断这一次 boss 生成该用哪个 bossId（null = 不干预，保留主包原判定）
  function pickBossId(s) {
    if (!s) return null;
    var floor = s.floor || 1;
    var meta = window.__abyssMeta;
    var endless = !!(meta && meta.save && meta.save().endless);

    // 无尽深潜第 4 层起：新 Boss 与三只原 Boss 轮替登场，给无尽真正的 Boss 变化
    if (endless && floor >= 4) {
      var rot = floor % 4;
      if (rot === 0) return EATER; // 第 4/8/12… 层交给噬渊之王
      return null; // 其余层保留主包（seraph）
    }

    // 普通局：约 1/3 的种子在第 3 层遇到噬渊之王作为备选终 Boss（seraph 仍在池中）
    if (floor === 3 && seedFrac(s) < 0.34) return EATER;
    return null;
  }

  // ===========================================================================
  // §4 装配
  // ===========================================================================
  function install(g, api) {
    D = api;
    Ph = api.phaser;
    kit = api.kit;
    GAME = window.__phaserGame;

    var P = Object.getPrototypeOf(g);
    if (P.__deepBossPatched) {
      hookState(g);
      return;
    }
    P.__deepBossPatched = true;

    // --- 生成贴图（必须早于任何 spawn）---
    tex(WRAITH, 192, 192, paintWraith);
    tex("boss-" + EATER, 192, 192, paintEater);

    // --- 原生注册 ---
    var okE = api.registerEnemy(WRAITH, { stats: WRAITH_STATS });
    var okB = api.registerBoss(EATER, { stats: EATER_STATS });
    log("注册 敌人 x_wraith=" + okE + " Boss x_eater=" + okB);

    // --- 敌人自定义 AI：接管 x_phase ---
    kit.wrapBefore(P, "updateEnemyAI", function (args) {
      var e = args[0];
      if (!e || !e.def || e.def.ai !== "x_phase") return;
      try {
        wraithAI(this, e, args[1], args[2], args[3], args[4]);
      } catch (err) {
        console.warn("[deep-boss] wraithAI 失败", err);
      }
      return "skip";
    });

    // --- Boss 自定义 pattern：在原 executeBossPattern 之后补执行 ---
    kit.wrap(P, "executeBossPattern", function (args) {
      var pattern = args[3];
      if (pattern !== "x_vortex") return;
      try {
        vortexExecute(this, args[0], args[1], args[2]);
      } catch (err) {
        console.warn("[deep-boss] vortexExecute 失败", err);
      }
    });

    // --- Boss 自定义 pattern 的预警加料 ---
    kit.wrap(P, "telegraphBossAttack", function (args) {
      var pattern = args[3];
      if (pattern !== "x_vortex") return;
      try {
        vortexTelegraph(this, args[0], args[1]);
      } catch (err) {
        /* 预警是纯表现，失败不影响弹幕 */
      }
    });

    // --- Boss 出生改判：把 seraph 换成噬渊之王（按 §3 规则）---
    kit.wrapBefore(P, "spawnEnemy", function (args) {
      if (args[2] !== "boss") return; // 只管 Boss 生成
      try {
        var id = pickBossId(st());
        if (id && D.tables.bosses && D.tables.bosses[id]) {
          args[3] = id;
        }
      } catch (err) {
        /* 改判失败就用主包原 bossId */
      }
    });

    // --- 敌人池注入：无尽/高压第 3 层起，概率把普通刷怪改判成空渊裔 ---
    api.setPoolRule(function (pool, picked) {
      var s = st();
      if (!s) return picked;
      var floor = s.floor || 1;
      if (floor < 3) return picked;
      var meta = window.__abyssMeta;
      var endless = !!(meta && meta.save && meta.save().endless);
      var deep = endless && floor >= 4;
      var pr = 1;
      try {
        pr = kit.pressureLevel(s, D.scene()).level;
      } catch (e) {}
      if (deep) {
        if (Math.random() < 0.3) return WRAITH;
      } else if (pr >= 12) {
        if (Math.random() < 0.16) return WRAITH;
      }
      return picked;
    });

    // --- Boss 登场时的音效/成就联动 ---
    kit.wrap(P, "spawnEnemy", function (args, result) {
      if (args[2] !== "boss" || args[3] !== EATER || !result) return;
      try {
        window.dispatchEvent(new Event("abyss-boss-eater"));
        if (window.__abyssAudio && window.__abyssAudio.play) {
          // 主包出生分支已经放了 bossRoar，这里只叠一记「精英登场」音色做辨识，避免重复轰鸣
          window.__abyssAudio.play("elite");
        }
      } catch (e) {}
    });

    hookState(g);
    log("装配完成");
  }

  // 调试态：把新内容的运行状态挂进 window.__game.getState
  function hookState(g) {
    if (!window.__game || window.__game.__deepBossState) return;
    window.__game.__deepBossState = true;
    var base = window.__game.getState;
    window.__game.getState = function () {
      var s = base ? base() : {};
      try {
        s.deepBoss = "deep-boss-1.0";
        s.bossRegistered = !!(D.tables.bosses && D.tables.bosses[EATER]);
        s.wraithRegistered = !!(D.tables.enemies && D.tables.enemies[WRAITH]);
        var sc = D.scene();
        if (sc && sc.enemies) {
          var kinds = { wraith: 0, eater: 0 };
          sc.enemies.getChildren().forEach(function (e) {
            if (!e.active) return;
            if (e.kind === WRAITH) kinds.wraith++;
            if (e.bossId === EATER) kinds.eater++;
          });
          s.wraithsAlive = kinds.wraith;
          s.eaterAlive = kinds.eater;
        }
      } catch (e) {}
      return s;
    };
  }

  // ===========================================================================
  // §5 调试接口
  // ===========================================================================
  window.__deepBoss = {
    version: "deep-boss-1.0",
    stats: { wraith: WRAITH_STATS, eater: EATER_STATS },
    // 在当前位置直接召出噬渊之王（用于验证：贴图/血条/阶段/弹幕）
    summonBoss: function () {
      var g = D.scene();
      if (!g || !g.spawnEnemy) return false;
      if (!GAME.textures.exists("boss-" + EATER)) tex("boss-" + EATER, 192, 192, paintEater);
      var b = g.spawnEnemy(480, 200, "boss", EATER);
      try {
        g.fx.bossIntro(EATER_STATS.name, EATER_STATS.title);
        g.audioFx.bossRoar();
      } catch (e) {}
      return !!b;
    },
    // 在玩家附近刷 n 只空渊裔
    spawnWraiths: function (n) {
      var g = D.scene();
      if (!g || !g.player) return 0;
      n = n || 3;
      for (var i = 0; i < n; i++) {
        g.spawnEnemy(
          g.player.x + Ph.Math.Between(-120, 120),
          g.player.y + Ph.Math.Between(-120, 120),
          WRAITH
        );
      }
      return n;
    },
  };

  // ===========================================================================
  // §6 启动
  // ===========================================================================
  function boot() {
    D = window.__deep;
    D.onBoot(install);
    // SDK 的 create 钩子晚于本次 create，若游戏已在跑要补装一次
    var g = D.scene();
    if (g && g.sys.isActive() && D.tables.enemies) install(g, D);
  }

  if (window.__deep) boot();
  else window.addEventListener("deep-sdk-ready", boot);
})();
