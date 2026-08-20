/* 深渊圣所 · 内容扩展层 expand.js
 * 依赖 enhance.js 暴露的 window.__abyssKit（wrap / wrapBefore / hitStop / zoomPunch / shockwave）。
 * 零外部依赖，全部贴图用 Phaser Graphics 程序绘制后 generateTexture。
 *
 * 扩展内容：
 *   1. 6 种新敌人（分裂 / 自爆 / 抛射 / 护盾 / 召唤 / 相位闪现），按层数与压迫等级投放
 *   2. 新 Boss「深渊守望者」：3 阶段、4 套预警技能循环，接入顿帧与镜头冲击
 *   3. 8 件深渊遗物 + 3 组联动（含与主包遗物的跨联动），构筑面板可见
 *   4. 新房间事件「深渊回响祭坛」：三选一抉择（献祭 / 贪婪 / 试炼）
 *   5. 玩家成长：主动技能「时之停滞」（R 键）+ 冷却条
 *
 * 实现原则：不改主包数值，不往主包的敌人表 / 遗物表里塞东西（拿不到引用），
 * 而是「生成后改写实体」+「自有注册表 + 钩子」，主包对新内容完全无感。
 */
(function () {
  "use strict";

  var VERSION = "expand-1.0";
  var W = 960;
  var H = 600;
  var kit = null;

  function st() {
    return (window.__game && window.__game.state) || null;
  }
  // 主包的开局重置是 Object.assign(a, {...})，不会删掉我们挂上去的字段。
  // 因此用 startedAt 作为「这一局」的指纹，指纹变了就把深渊侧的进度清空。
  function ext() {
    var s = st();
    if (!s) return null;
    if (!s.__abyss || s.__abyss.runAt !== s.startedAt) {
      s.__abyss = {
        runAt: s.startedAt,
        relics: [],
        synergies: [],
        stasisReadyAt: 0,
        watcherKills: 0,
        echoEvents: 0,
      };
    }
    return s.__abyss;
  }
  function hasRelic(id) {
    var e = ext();
    return !!(e && e.relics.indexOf(id) >= 0);
  }
  function hasSyn(id) {
    var e = ext();
    return !!(e && e.synergies.indexOf(id) >= 0);
  }
  function baseRelic(id) {
    var s = st();
    return !!(s && s.relics.indexOf(id) >= 0);
  }

  // ============================ 程序绘制贴图 ============================
  // 所有贴图统一 160×160，圆心 (80,80)，与主包 setCircle 的换算保持一致。
  function makeTextures(scene) {
    if (scene.textures.exists("x-shardling")) return;
    var g = scene.make.graphics({ add: false });

    function reset() {
      g.clear();
    }
    function done(key, size) {
      g.generateTexture(key, size || 160, size || 160);
    }

    // 裂魂体：棱角水晶
    reset();
    g.fillStyle(0xffffff, 1);
    g.beginPath();
    g.moveTo(80, 18);
    g.lineTo(126, 62);
    g.lineTo(110, 132);
    g.lineTo(50, 132);
    g.lineTo(34, 62);
    g.closePath();
    g.fillPath();
    g.fillStyle(0xc8c8c8, 1);
    g.beginPath();
    g.moveTo(80, 18);
    g.lineTo(80, 132);
    g.lineTo(50, 132);
    g.lineTo(34, 62);
    g.closePath();
    g.fillPath();
    g.lineStyle(3, 0x707070, 1).strokeCircle(80, 80, 8);
    done("x-shardling");

    // 自爆孢囊：鼓胀囊体 + 尖刺
    reset();
    g.fillStyle(0x9a9a9a, 1);
    for (var i = 0; i < 10; i++) {
      var an = (i / 10) * Math.PI * 2;
      g.fillTriangle(
        80 + Math.cos(an) * 52,
        80 + Math.sin(an) * 52,
        80 + Math.cos(an + 0.2) * 40,
        80 + Math.sin(an + 0.2) * 40,
        80 + Math.cos(an - 0.2) * 40,
        80 + Math.sin(an - 0.2) * 40
      );
    }
    g.fillStyle(0xffffff, 1).fillCircle(80, 82, 44);
    g.fillStyle(0xbdbdbd, 1).fillCircle(66, 70, 15);
    g.lineStyle(4, 0x6e6e6e, 1).strokeCircle(80, 82, 44);
    done("x-bomber");

    // 深渊迫击：矮壮炮体
    reset();
    g.fillStyle(0x8f8f8f, 1).fillRoundedRect(28, 74, 104, 62, 16);
    g.fillStyle(0xffffff, 1).fillRoundedRect(36, 62, 88, 58, 14);
    g.fillStyle(0x5f5f5f, 1).fillRoundedRect(66, 20, 28, 52, 8);
    g.fillStyle(0xd0d0d0, 1).fillCircle(80, 24, 17);
    g.lineStyle(3, 0x555555, 1).strokeRoundedRect(36, 62, 88, 58, 14);
    done("x-mortar");

    // 缚魂守卫：宽体 + 六角护盾
    reset();
    g.fillStyle(0xffffff, 1).fillRoundedRect(40, 46, 80, 92, 20);
    g.fillStyle(0xbfbfbf, 1).fillRoundedRect(52, 58, 56, 34, 10);
    g.fillStyle(0x777777, 1);
    g.beginPath();
    g.moveTo(122, 40);
    g.lineTo(148, 62);
    g.lineTo(148, 108);
    g.lineTo(122, 132);
    g.lineTo(100, 108);
    g.lineTo(100, 62);
    g.closePath();
    g.fillPath();
    g.lineStyle(4, 0xdadada, 1).strokePath();
    done("x-warden");

    // 织魂者：细长躯体 + 多足
    reset();
    g.lineStyle(5, 0xa0a0a0, 1);
    for (var k = 0; k < 6; k++) {
      var a2 = Math.PI * 0.15 + (k / 5) * Math.PI * 0.7;
      g.lineBetween(80, 86, 80 + Math.cos(a2) * 62 * (k % 2 ? 1 : -1), 80 + Math.sin(a2) * 58);
    }
    g.fillStyle(0xffffff, 1).fillEllipse(80, 74, 52, 78);
    g.fillStyle(0x8e8e8e, 1).fillEllipse(80, 56, 30, 30);
    g.fillStyle(0x3a3a3a, 1).fillCircle(72, 54, 5).fillCircle(88, 54, 5);
    done("x-weaver");

    // 相位游影：兜帽剪影
    reset();
    g.fillStyle(0xffffff, 0.92);
    g.beginPath();
    g.moveTo(80, 20);
    g.lineTo(118, 66);
    g.lineTo(106, 138);
    g.lineTo(54, 138);
    g.lineTo(42, 66);
    g.closePath();
    g.fillPath();
    g.fillStyle(0x2b2b2b, 1).fillEllipse(80, 62, 44, 40);
    g.fillStyle(0xf4f4f4, 1).fillCircle(70, 60, 6).fillCircle(90, 60, 6);
    done("x-phantom");

    // 深渊守望者：巨眼 + 环带 + 触须（220×220）
    reset();
    g.lineStyle(6, 0x8a8a8a, 0.9).strokeCircle(110, 110, 96);
    g.lineStyle(3, 0xbcbcbc, 0.7).strokeCircle(110, 110, 78);
    for (var t = 0; t < 12; t++) {
      var a3 = (t / 12) * Math.PI * 2;
      g.lineStyle(5, 0x9d9d9d, 0.85);
      g.lineBetween(
        110 + Math.cos(a3) * 74,
        110 + Math.sin(a3) * 74,
        110 + Math.cos(a3) * 104,
        110 + Math.sin(a3) * 104
      );
    }
    g.fillStyle(0xffffff, 1).fillCircle(110, 110, 62);
    g.fillStyle(0x4a4a4a, 1).fillEllipse(110, 110, 70, 96);
    g.fillStyle(0xf6f6f6, 1).fillCircle(110, 110, 26);
    g.fillStyle(0x1a1a1a, 1).fillCircle(110, 110, 13);
    done("x-watcher", 220);

    g.destroy();
  }

  // ============================ 新敌人注册表 ============================
  // ai 字段刻意用主包不认识的 "x_*"，这样主包 updateEnemyAI 的 if-else 链全部落空、
  // 完全不干预这些实体，行为由本层的 after 钩子独占驱动。
  var ENEMIES = {
    x_shardling: {
      name: "裂魂体",
      texture: "x-shardling",
      ai: "x_shardling",
      hp: 30,
      speed: 132,
      contact: 1,
      tint: 0x7fd8ff,
      scale: 0.95,
      floor: 1,
      cooldown: 1400,
    },
    x_bomber: {
      name: "自爆孢囊",
      texture: "x-bomber",
      ai: "x_bomber",
      hp: 26,
      speed: 108,
      contact: 1,
      tint: 0xff9a5a,
      scale: 1,
      floor: 1,
      cooldown: 1000,
    },
    x_mortar: {
      name: "深渊迫击",
      texture: "x-mortar",
      ai: "x_mortar",
      hp: 46,
      speed: 58,
      contact: 1,
      tint: 0x8fbf7a,
      scale: 1.05,
      floor: 2,
      cooldown: 2100,
    },
    x_warden: {
      name: "缚魂守卫",
      texture: "x-warden",
      ai: "x_warden",
      hp: 58,
      speed: 74,
      contact: 2,
      tint: 0x86a8d8,
      scale: 1.15,
      floor: 2,
      cooldown: 1800,
      shield: 34,
    },
    x_weaver: {
      name: "织魂者",
      texture: "x-weaver",
      ai: "x_weaver",
      hp: 52,
      speed: 66,
      contact: 1,
      tint: 0xc79bff,
      scale: 1.05,
      floor: 3,
      cooldown: 3000,
    },
    x_phantom: {
      name: "相位游影",
      texture: "x-phantom",
      ai: "x_phantom",
      hp: 44,
      speed: 96,
      contact: 1,
      tint: 0xe8e2ff,
      scale: 1,
      floor: 3,
      cooldown: 2200,
    },
  };

  function morph(scene, e, key, scale) {
    var d = ENEMIES[key];
    if (!e || !e.active || !d) return e;
    var s = st();
    var floorHp = 1 + ((s ? s.floor : 1) - 1) * 0.16;
    var floorSpd = 1 + ((s ? s.floor : 1) - 1) * 0.06;
    var mult = scale || 1;
    e.kind = key;
    e.def = d;
    e.setTexture(d.texture);
    e.setTint(d.tint);
    e.hp = d.hp * floorHp * mult;
    e.maxHp = e.hp;
    e.speed = d.speed * floorSpd;
    e.contact = d.contact;
    e.cooldown = d.cooldown;
    e.setScale(0.38 * (d.scale || 1) * mult);
    e.setCircle(48, 32, 32);
    e.__mem = { shield: d.shield || 0, maxShield: d.shield || 0, born: scene.time.now, gen: 0 };
    if (d.shield) drawShieldRing(scene, e);
    return e;
  }

  // Phaser 不会自动清理指向已销毁对象的补间，半径类补间会在下一帧炸掉整个循环。
  // 所有「可能被提前销毁的、身上挂着补间的对象」都必须走这里。
  function killObj(scene, o) {
    if (!o || !o.scene) return;
    scene.tweens.killTweensOf(o);
    o.destroy();
  }

  function drawShieldRing(scene, e) {
    var ring = scene.add.circle(e.x, e.y, e.displayWidth * 0.62);
    ring.setStrokeStyle(3, 0x9fd0ff, 0.75).setDepth(9);
    e.__mem.ring = ring;
  }

  // ============================ 新敌人 AI ============================
  function aimAngle(scene, e) {
    return Phaser.Math.Angle.Between(e.x, e.y, scene.player.x, scene.player.y);
  }
  var Phaser = null; // 由 boot 时从 game 实例回填

  function customAI(scene, e, ang, dist, now, spd) {
    var m = e.__mem || (e.__mem = {});
    var ai = e.def.ai;

    if (ai === "x_shardling") {
      // 高速直冲，靠近后短暂盘旋，死亡时分裂
      var side = dist < 150 ? ang + Math.PI / 2 : ang;
      e.setVelocity(Math.cos(side) * spd, Math.sin(side) * spd);
      return;
    }

    if (ai === "x_bomber") {
      // 贴近后进入 700ms 引爆倒计时，闪烁预警，然后自爆
      if (m.fuseAt) {
        e.setVelocity(0, 0);
        e.setScale(e.scaleX * (Math.floor(now / 70) % 2 ? 1.02 : 0.985));
        if (now >= m.fuseAt) detonate(scene, e, 96, 1);
        return;
      }
      e.setVelocity(Math.cos(ang) * spd * 1.15, Math.sin(ang) * spd * 1.15);
      if (dist < 78) {
        m.fuseAt = now + 700;
        scene.fx.statusText(e.x, e.y - 26, "引爆！", "#ff9a5a", 15);
      }
      return;
    }

    if (ai === "x_mortar") {
      // 远程抛射：地面预警圈 → 延迟爆炸
      var keep = dist > 320 ? 1 : dist < 240 ? -0.8 : 0;
      e.setVelocity(Math.cos(ang) * spd * keep, Math.sin(ang) * spd * keep);
      if (now - e.lastAttack > e.cooldown) {
        e.lastAttack = now;
        lobShell(scene, e, scene.player.x, scene.player.y);
      }
      return;
    }

    if (ai === "x_warden") {
      // 缓步推进，护盾未破时不还手；护盾破碎后转为三连射
      e.setVelocity(Math.cos(ang) * spd, Math.sin(ang) * spd);
      if (m.ring && m.ring.scene) {
        m.ring.setPosition(e.x, e.y);
        m.ring.setAlpha(m.shield > 0 ? 0.35 + 0.4 * (m.shield / m.maxShield) : 0);
      }
      if (m.shield <= 0 && now - e.lastAttack > e.cooldown) {
        e.lastAttack = now;
        scene.enemyFire(e, ang, 3, 210, e.def.tint, 0.2);
      }
      return;
    }

    if (ai === "x_weaver") {
      // 远离玩家，周期召唤，并给附近敌人挂加速光环
      var away = dist > 340 ? 0.5 : -0.9;
      e.setVelocity(Math.cos(ang) * spd * away, Math.sin(ang) * spd * away);
      if (now - e.lastAttack > e.cooldown) {
        e.lastAttack = now;
        summonBrood(scene, e);
      }
      if (!m.auraAt || now - m.auraAt > 500) {
        m.auraAt = now;
        var buffed = 0;
        scene.enemies.getChildren().forEach(function (o) {
          if (!o.active || o === e) return;
          if (Phaser.Math.Distance.Between(e.x, e.y, o.x, o.y) < 210) {
            if (!o.__weaveBase) o.__weaveBase = o.speed;
            o.speed = o.__weaveBase * 1.3;
            buffed++;
            if (Math.random() < 0.3) scene.fx.lightning(e, o);
          }
        });
        m.buffed = buffed;
      }
      return;
    }

    if (ai === "x_phantom") {
      // 相位闪现：淡出 → 瞬移到玩家侧后方 → 落地三连散射
      if (m.blinkAt && now < m.blinkAt) {
        e.setVelocity(0, 0);
        return;
      }
      if (now - e.lastAttack > e.cooldown) {
        e.lastAttack = now;
        m.blinkAt = now + 260;
        blink(scene, e);
        return;
      }
      e.setVelocity(Math.cos(ang) * spd * 0.75, Math.sin(ang) * spd * 0.75);
      return;
    }
  }

  function detonate(scene, e, radius, dmg) {
    if (!e.active) return;
    var x = e.x;
    var y = e.y;
    scene.fx.explosion(x, y, radius, 0xff9a5a);
    kit.shockwave(scene, x, y, 0xffb26b, radius + 20);
    kit.hitStop(scene, 60, 0.32);
    scene.cameras.main.shake(180, 0.011);
    if (Phaser.Math.Distance.Between(x, y, scene.player.x, scene.player.y) < radius && !scene.invuln) {
      scene.damagePlayer(dmg);
    }
    scene.enemies.getChildren().forEach(function (o) {
      if (o.active && o !== e && Phaser.Math.Distance.Between(x, y, o.x, o.y) < radius) {
        o.hp -= 14;
        if (o.hp <= 0) scene.killEnemy(o);
      }
    });
    e.__mem.silent = true;
    scene.killEnemy(e);
  }

  function lobShell(scene, e, tx, ty) {
    var mark = scene.add.circle(tx, ty, 8);
    mark.setStrokeStyle(3, 0xa8e08a, 0.9).setDepth(5);
    scene.tweens.add({ targets: mark, radius: 58, duration: 900, ease: "Quad.easeIn" });
    var shell = scene.add.circle(e.x, e.y, 7, 0xa8e08a, 1).setDepth(30);
    scene.tweens.add({
      targets: shell,
      x: tx,
      y: ty,
      duration: 900,
      ease: "Sine.easeInOut",
      onComplete: function () {
        killObj(scene, shell);
        if (!mark.scene) return;
        killObj(scene, mark);
        scene.fx.explosion(tx, ty, 62, 0xa8e08a);
        if (Phaser.Math.Distance.Between(tx, ty, scene.player.x, scene.player.y) < 62 && !scene.invuln) {
          scene.damagePlayer(1);
        }
      },
    });
    scene.tweens.add({ targets: shell, scale: 1.9, duration: 450, yoyo: true });
  }

  function summonBrood(scene, e) {
    scene.fx.particle(e.x, e.y, e.def.tint, { count: 16, speed: 90, life: 420, size: 5 });
    for (var i = 0; i < 2; i++) {
      var n = scene.spawnEnemy(
        e.x + Phaser.Math.Between(-50, 50),
        e.y + Phaser.Math.Between(-50, 50),
        "crawler"
      );
      morph(scene, n, "x_shardling", 0.7);
      if (n.__mem) n.__mem.gen = 1;
    }
    scene.fx.statusText(e.x, e.y - 30, "编织", "#c79bff", 14);
  }

  function blink(scene, e) {
    var p = scene.player;
    var a = Math.random() * Math.PI * 2;
    var nx = kit.clamp(p.x + Math.cos(a) * 130, 90, W - 90);
    var ny = kit.clamp(p.y + Math.sin(a) * 130, 90, H - 110);
    scene.fx.particle(e.x, e.y, e.def.tint, { count: 12, speed: 80, life: 320, size: 4 });
    scene.tweens.add({
      targets: e,
      alpha: 0.15,
      duration: 130,
      yoyo: true,
      onYoyo: function () {
        if (!e.active) return;
        e.setPosition(nx, ny);
        scene.fx.particle(nx, ny, e.def.tint, { count: 12, speed: 80, life: 320, size: 4 });
        scene.enemyFire(e, aimAngle(scene, e), 3, 200, e.def.tint, 0.26);
      },
    });
  }

  // ============================ 深渊守望者（新 Boss） ============================
  var WATCHER = {
    name: "深渊守望者",
    title: "它一直在看着你",
    tint: 0xb9a2ff,
    stageNames: ["凝视", "扩瞳", "崩溃"],
    patterns: ["ring", "lance", "brood", "slam"],
  };

  function spawnWatcher(scene, x, y) {
    var s = st();
    var floor = s ? s.floor : 1;
    var e = scene.spawnEnemy(x || 480, y || 190, "crawler");
    e.kind = "x_watcher";
    e.def = {
      name: WATCHER.name,
      texture: "x-watcher",
      ai: "x_watcher",
      tint: WATCHER.tint,
      cooldown: 1400,
    };
    e.setTexture("x-watcher");
    e.setTint(WATCHER.tint);
    e.setScale(0.62);
    e.setCircle(70, 40, 40);
    e.hp = 360 + floor * 130;
    e.maxHp = e.hp;
    e.speed = 54;
    e.contact = 2;
    e.stage = 0;
    e.patternIndex = 0;
    e.lastAttack = 0;
    e.__mem = { boss: true, pending: null };
    if (e.healthUi) {
      e.healthUi.bg.destroy();
      e.healthUi.bar.destroy();
      e.healthUi = null;
    }
    scene.createEnemyHealthBar(e, true);
    if (e.shadow) e.shadow.setSize ? null : null;
    scene.fx.bossIntro(WATCHER.name, WATCHER.title);
    scene.audioFx.bossRoar();
    kit.zoomPunch(scene, 0.07, 260);
    scene.__watcher = e;
    return e;
  }

  function watcherAI(scene, e, ang, dist, now, spd) {
    var m = e.__mem;
    var ratio = e.hp / e.maxHp;
    var stage = [0.66, 0.33].filter(function (p) {
      return ratio < p;
    }).length;
    if (stage !== e.stage) {
      e.stage = stage;
      scene.cameras.main.shake(420, 0.018);
      scene.fx.explosion(e.x, e.y, 105, WATCHER.tint);
      scene.enemyShots.clear(true, true);
      scene.announceBossStage(WATCHER, stage);
      kit.hitStop(scene, 140, 0.22);
      kit.zoomPunch(scene, 0.06, 220);
    }

    if (m.pending) {
      e.setVelocity(0, 0);
      if (now >= m.pending.at) {
        var p = m.pending;
        m.pending = null;
        p.marks.forEach(function (o) {
          killObj(scene, o);
        });
        runWatcherPattern(scene, e, p.pattern, p.angle, stage);
      }
      return;
    }

    e.phase += 0.02 + stage * 0.008;
    e.setVelocity(Math.cos(ang + Math.sin(e.phase) * 1.2) * spd, Math.sin(ang + Math.sin(e.phase) * 1.2) * spd);

    var gap = Math.max(760, 1500 - stage * 300);
    if (now - e.lastAttack < gap) return;
    e.lastAttack = now;
    var pattern = WATCHER.patterns[e.patternIndex++ % WATCHER.patterns.length];
    telegraph(scene, e, pattern, ang, now, stage);
  }

  var PATTERN_LABEL = { ring: "环噬", lance: "贯目", brood: "增殖", slam: "陨瞳" };

  function telegraph(scene, e, pattern, ang, now, stage) {
    var lead = Math.max(340, 620 - stage * 90);
    var marks = [];
    var label = scene.add
      .text(e.x, e.y - e.displayHeight * 0.62, "◆ " + PATTERN_LABEL[pattern], {
        fontSize: "14px",
        color: "#ffe6a8",
        backgroundColor: "#180f18cc",
        padding: { x: 7, y: 3 },
      })
      .setOrigin(0.5)
      .setDepth(30);
    marks.push(label);

    if (pattern === "ring") {
      var r = scene.add.circle(e.x, e.y, 40);
      r.setStrokeStyle(3, 0xffc978, 0.85).setDepth(6);
      scene.tweens.add({ targets: r, radius: 190, duration: lead, ease: "Quad.easeOut" });
      marks.push(r);
    } else if (pattern === "lance") {
      var g = scene.add.graphics().setDepth(6);
      g.lineStyle(4, 0xff8f8f, 0.55);
      g.lineBetween(e.x, e.y, e.x + Math.cos(ang) * 900, e.y + Math.sin(ang) * 900);
      marks.push(g);
    } else if (pattern === "brood") {
      for (var i = 0; i < 3; i++) {
        var c = scene.add.circle(e.x + (i - 1) * 70, e.y + 60, 26, 0xc79bff, 0.18);
        c.setStrokeStyle(2, 0xc79bff, 0.7);
        c.setDepth(6);
        marks.push(c);
      }
    } else if (pattern === "slam") {
      var p = scene.player;
      for (var k = 0; k < 3; k++) {
        var mx = kit.clamp(p.x + Phaser.Math.Between(-150, 150), 80, W - 80);
        var my = kit.clamp(p.y + Phaser.Math.Between(-120, 120), 80, H - 90);
        var z = scene.add.circle(mx, my, 10, 0xff7d6b, 0.14);
        z.setStrokeStyle(3, 0xff7d6b, 0.8).setDepth(6);
        z.__target = true;
        scene.tweens.add({ targets: z, radius: 68, duration: lead, ease: "Quad.easeIn" });
        marks.push(z);
      }
    }
    e.__mem.pending = { at: now + lead, pattern: pattern, angle: ang, marks: marks };
  }

  function runWatcherPattern(scene, e, pattern, ang, stage) {
    if (!e.active) return;
    if (pattern === "ring") {
      scene.enemyFire(e, 0, 12 + stage * 3, 170 + stage * 20, WATCHER.tint);
      kit.shockwave(scene, e.x, e.y, WATCHER.tint, 150);
    } else if (pattern === "lance") {
      for (var i = 0; i < 3; i++) {
        (function (n) {
          scene.time.delayedCall(n * 110, function () {
            if (e.active) scene.enemyFire(e, aimAngle(scene, e), 1, 340 + stage * 40, 0xff8f8f);
          });
        })(i);
      }
    } else if (pattern === "brood") {
      for (var k = 0; k < 2 + stage; k++) {
        var n2 = scene.spawnEnemy(e.x + Phaser.Math.Between(-70, 70), e.y + 70, "crawler");
        morph(scene, n2, k % 2 ? "x_shardling" : "x_bomber", 0.85);
      }
      scene.fx.particle(e.x, e.y, WATCHER.tint, { count: 22, speed: 120, life: 500, size: 5 });
    } else if (pattern === "slam") {
      scene.cameras.main.shake(240, 0.014);
      kit.hitStop(scene, 70, 0.3);
      var p = scene.player;
      // 落点由 tickWorld 在预警期间记录下来
      (scene.__lastSlamZones || []).forEach(function (z) {
        scene.fx.explosion(z.x, z.y, 70, 0xff7d6b);
        if (Phaser.Math.Distance.Between(z.x, z.y, p.x, p.y) < 74 && !scene.invuln) scene.damagePlayer(1);
      });
      scene.__lastSlamZones = [];
    }
  }

  // ============================ 深渊遗物 ============================
  var RELICS = {
    echoblade: { name: "回响之刃", desc: "每 4 次命中触发回响冲击，对周围敌人造成 60% 伤害" },
    riftcloak: { name: "裂隙披风", desc: "冲刺穿过敌人造成伤害，并留下减速裂隙" },
    soulpact: { name: "噬魂契约", desc: "击杀多获得 40% 灵魂；爆发期间伤害 +25%" },
    bloodtotem: { name: "秽血图腾", desc: "生命 ≤ 2 时伤害 +40%、冲刺冷却 -35%" },
    manyeyes: { name: "千目凝视", desc: "每进入新房间标记一名敌人，其受到伤害 +30%" },
    emberheart: { name: "不朽余烬", desc: "致命伤害时消耗 3 金币免死，每房间一次" },
    abyssalsigil: { name: "深渊契印", desc: "解锁主动技能「时之停滞」（R 键）" },
    resonantcore: { name: "共鸣核心", desc: "连击 A 级以上时伤害 +25%，击杀多得灵魂" },
  };

  var SYNERGIES = {
    echoresonance: { name: "回响共鸣", need: ["echoblade", "resonantcore"], desc: "回响冲击改为每 2 次命中触发" },
    riftwalker: { name: "裂隙行者", need: ["riftcloak", "abyssalsigil"], desc: "时之停滞期间冲刺不进入冷却" },
    bloodfeast: { name: "血宴", need: ["bloodtotem"], needBase: ["vampire"], desc: "低血时击杀有 25% 概率回复半颗心" },
  };

  function grantRelic(scene, id) {
    var e = ext();
    if (!e || e.relics.indexOf(id) >= 0) return false;
    e.relics.push(id);
    refreshSynergies(scene);
    scene.fx.statusText(scene.player.x, scene.player.y - 40, "◈ " + RELICS[id].name, "#ffd97a", 18);
    scene.showToast("深渊遗物：" + RELICS[id].name + "\n" + RELICS[id].desc);
    scene.audioFx.pickup();
    kit.shockwave(scene, scene.player.x, scene.player.y, 0xffd97a, 110);
    kit.zoomPunch(scene, 0.035, 160);
    scene.updateHud();
    return true;
  }

  function randomRelic() {
    var e = ext();
    var pool = Object.keys(RELICS).filter(function (k) {
      return e.relics.indexOf(k) < 0;
    });
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function refreshSynergies(scene) {
    var e = ext();
    if (!e) return;
    Object.keys(SYNERGIES).forEach(function (k) {
      var s = SYNERGIES[k];
      var ok =
        s.need.every(function (r) {
          return e.relics.indexOf(r) >= 0;
        }) &&
        (!s.needBase ||
          s.needBase.every(function (r) {
            return baseRelic(r);
          }));
      if (ok && e.synergies.indexOf(k) < 0) {
        e.synergies.push(k);
        if (scene && scene.showToast) scene.showToast("联动觉醒：" + s.name + "\n" + s.desc);
      }
    });
  }

  // ============================ 时之停滞（主动技能） ============================
  var STASIS_CD = 22000;
  function castStasis(scene) {
    var e = ext();
    if (!e || !hasRelic("abyssalsigil")) return false;
    var now = scene.time.now;
    if (now < e.stasisReadyAt) return false;
    e.stasisReadyAt = now + STASIS_CD;
    e.stasisUntil = now + 1600;
    scene.enemies.getChildren().forEach(function (o) {
      if (o.active) o.status.frozenUntil = now + 1600;
    });
    scene.cameras.main.flash(160, 120, 190, 230, false);
    kit.shockwave(scene, scene.player.x, scene.player.y, 0x9fd0ff, 260);
    kit.zoomPunch(scene, 0.05, 200);
    kit.hitStop(scene, 110, 0.25);
    scene.fx.statusText(480, 150, "时 之 停 滞", "#bfe6ff", 26);
    if (hasSyn("riftwalker")) scene.dashReadyAt = 0;
    return true;
  }

  // ============================ 深渊回响祭坛（房间事件） ============================
  var RUNES = [
    { id: "blood", name: "献祭", color: 0xd06a72, cost: "代价：1 颗心", gain: "获得：深渊遗物 ×1" },
    { id: "greed", name: "贪婪", color: 0xd7b45a, cost: "代价：一半金币", gain: "获得：深渊遗物 ×1 + 钥匙" },
    { id: "trial", name: "试炼", color: 0x8fb8cc, cost: "代价：一波精英", gain: "获得：深渊遗物 ×1 + 30 金币" },
  ];

  function spawnEcho(scene) {
    if (scene.__echo) return;
    var objs = [];
    var runes = [];
    var title = scene.add
      .text(480, 178, "◈ 深 渊 回 响 ◈", {
        fontFamily: "ZCOOL XiaoWei, KaiTi, STKaiti, serif",
        fontSize: "24px",
        color: "#e6d5ac",
        backgroundColor: "#0c0a11cc",
        padding: { x: 14, y: 5 },
      })
      .setOrigin(0.5)
      .setDepth(20);
    objs.push(title);
    RUNES.forEach(function (r, i) {
      var x = 300 + i * 180;
      var y = 300;
      var ring = scene.add.circle(x, y, 34, r.color, 0.16);
      ring.setStrokeStyle(3, r.color, 0.85).setDepth(6);
      var glow = scene.add.circle(x, y, 44);
      glow.setStrokeStyle(2, r.color, 0.3).setDepth(6);
      scene.tweens.add({ targets: glow, radius: 56, alpha: 0.1, duration: 1400, yoyo: true, repeat: -1 });
      var name = scene.add
        .text(x, y - 62, r.name, {
          fontFamily: "ZCOOL XiaoWei, KaiTi, STKaiti, serif",
          fontSize: "20px",
          color: "#efe3c6",
        })
        .setOrigin(0.5)
        .setDepth(20);
      var info = scene.add
        .text(x, y + 52, r.cost + "\n" + r.gain, {
          fontSize: "11px",
          color: "#a49b8d",
          align: "center",
          lineSpacing: 4,
        })
        .setOrigin(0.5)
        .setDepth(20);
      objs.push(ring, glow, name, info);
      runes.push({ def: r, x: x, y: y, objs: [ring, glow, name, info] });
    });
    var tip = scene.add
      .text(480, 396, "走到符文上做出抉择 · 只能选择一次", { fontSize: "12px", color: "#8b8376" })
      .setOrigin(0.5)
      .setDepth(20);
    objs.push(tip);
    // armed：必须先离开所有符文，避免祭坛正好生成在脚下时被瞬间误选
    scene.__echo = { objs: objs, runes: runes, done: false, armed: false };
    scene.audioFx.door();
  }

  function chooseRune(scene, rune) {
    var e = ext();
    var s = st();
    var echo = scene.__echo;
    if (!echo || echo.done) return;
    var id = rune.def.id;

    if (id === "greed" && s.coins < 6) {
      scene.fx.statusText(rune.x, rune.y - 30, "金币不足", "#d06a72", 14);
      return;
    }
    echo.done = true;
    e.echoEvents++;
    echo.objs.forEach(function (o) {
      if (!o || !o.scene) return;
      scene.tweens.killTweensOf(o);
      scene.tweens.add({
        targets: o,
        alpha: 0,
        duration: 320,
        onComplete: function () {
          killObj(scene, o);
        },
      });
    });
    kit.shockwave(scene, rune.x, rune.y, rune.def.color, 130);

    if (id === "blood") {
      scene.damagePlayer(2);
      scene.time.delayedCall(220, function () {
        var r = randomRelic();
        if (r) grantRelic(scene, r);
      });
    } else if (id === "greed") {
      s.coins = Math.floor(s.coins / 2);
      s.keys += 1;
      var r2 = randomRelic();
      if (r2) grantRelic(scene, r2);
      scene.updateHud();
    } else if (id === "trial") {
      scene.showToast("试炼开始\n击溃全部精英");
      scene.__trial = { active: true, startedAt: scene.time.now };
      var floor = s.floor;
      var kinds = Object.keys(ENEMIES).filter(function (k) {
        return ENEMIES[k].floor <= floor;
      });
      for (var i = 0; i < 3 + floor; i++) {
        var nx = Phaser.Math.Between(120, 840);
        var ny = Phaser.Math.Between(110, 490);
        if (Phaser.Math.Distance.Between(nx, ny, scene.player.x, scene.player.y) < 170) nx = 900 - nx;
        var en = scene.spawnEnemy(nx, ny, "crawler");
        morph(scene, en, kinds[Math.floor(Math.random() * kinds.length)]);
        if (i === 0) scene.applyEliteAffix(en);
      }
    }
  }

  // ============================ UI ============================
  function buildUi(scene) {
    scene.__xui = {};
    scene.__xui.relics = scene.add
      .text(28, 192, "", { fontSize: "11px", color: "#c9a8ff", lineSpacing: 3 })
      .setDepth(52)
      .setScrollFactor(0);
    scene.__xui.skillText = scene.add
      .text(28, 236, "", { fontSize: "12px", color: "#9fd0ff" })
      .setDepth(52)
      .setScrollFactor(0);
    scene.__xui.skillBg = scene.add
      .rectangle(28, 256, 180, 6, 0x152030, 0.94)
      .setOrigin(0, 0.5)
      .setDepth(52)
      .setScrollFactor(0)
      .setVisible(false);
    scene.__xui.skillBar = scene.add
      .rectangle(28, 256, 0, 4, 0x6fc3f5, 1)
      .setOrigin(0, 0.5)
      .setDepth(52)
      .setScrollFactor(0)
      .setVisible(false);
    // 主包构筑面板容器是 depth 95，这里必须更高才不会被面板底板盖住
    scene.__xui.panel = scene.add
      .text(170, 384, "", {
        fontSize: "12px",
        color: "#c9a8ff",
        lineSpacing: 6,
        wordWrap: { width: 630 },
      })
      .setDepth(97)
      .setScrollFactor(0)
      .setVisible(false);
  }

  function refreshUi(scene) {
    var u = scene.__xui;
    var e = ext();
    if (!u || !e || !u.relics.scene) return;
    if (e.relics.length) {
      var names = e.relics.map(function (r) {
        return RELICS[r].name;
      });
      var syn = e.synergies.map(function (k) {
        return SYNERGIES[k].name;
      });
      u.relics.setText("◈ 深渊遗物 " + e.relics.length + "/8\n" + names.join(" · ") + (syn.length ? "\n联动：" + syn.join(" · ") : ""));
    } else {
      u.relics.setText("");
    }
    if (hasRelic("abyssalsigil")) {
      var left = Math.max(0, e.stasisReadyAt - scene.time.now);
      u.skillText.setText(left ? "◇ 时之停滞 " + Math.ceil(left / 100) / 10 + "s" : "◇ 时之停滞就绪 [R]");
      u.skillBg.setVisible(true);
      u.skillBar.setVisible(true);
      u.skillBar.width = 180 * (1 - left / STASIS_CD);
      u.skillBar.setFillStyle(left ? 0x3f6b86 : 0x6fc3f5);
    } else {
      u.skillText.setText("");
      u.skillBg.setVisible(false);
      u.skillBar.setVisible(false);
    }
  }

  function refreshPanel(scene) {
    var u = scene.__xui;
    var e = ext();
    if (!u || !e || !u.panel.scene) return;
    var lines = [];
    if (e.relics.length) {
      lines.push(
        "深渊遗物（" +
          e.relics.length +
          "/8）：" +
          e.relics
            .map(function (r) {
              return RELICS[r].name;
            })
            .join(" · ")
      );
      var last = e.relics[e.relics.length - 1];
      lines.push("最近获得：" + RELICS[last].name + " —— " + RELICS[last].desc);
    } else {
      lines.push("深渊遗物（0/8）：在「深渊回响」祭坛与守望者手中获取。");
    }
    if (e.synergies.length) {
      lines.push(
        "深渊联动：" +
          e.synergies
            .map(function (k) {
              return SYNERGIES[k].name + "（" + SYNERGIES[k].desc + "）";
            })
            .join("；")
      );
    }
    if (hasRelic("abyssalsigil")) lines.push("主动技能：时之停滞 [R]  冷却 22s");
    u.panel.setText(lines.join("\n"));
  }

  // ============================ 装配 ============================
  function patch(scene) {
    var P = Object.getPrototypeOf(scene);
    var wrap = kit.wrap;
    var wrapBefore = kit.wrapBefore;

    wrap(P, "create", function () {
      var self = this;
      makeTextures(self);
      buildUi(self);
      ext();
      refreshSynergies(self);
      self.__lastSlamZones = [];
      self.__echo = null;
      self.__trial = null;
      self.__watcher = null;
      self.__hitCount = 0;

      if (self.input && self.input.keyboard) {
        self.input.keyboard.on("keydown-R", function () {
          castStasis(self);
        });
      }

      var onUpd = function (time, delta) {
        try {
          tickWorld(self, time, delta);
        } catch (err) {
          console.warn("[expand] update failed", err);
        }
      };
      self.events.on("update", onUpd);
      self.events.once("shutdown", function () {
        self.events.off("update", onUpd);
      });

      // 扩展调试接口
      if (window.__game) {
        var base = window.__game.getState;
        window.__game.getState = function () {
          var s = base();
          var e = ext();
          s.expand = VERSION;
          s.abyssRelics = e ? e.relics.slice() : [];
          s.abyssSynergies = e ? e.synergies.slice() : [];
          s.stasisReady = e ? self.time.now >= e.stasisReadyAt : false;
          s.echoOpen = !!(self.__echo && !self.__echo.done);
          s.trialActive = !!(self.__trial && self.__trial.active);
          s.watcherAlive = !!(self.__watcher && self.__watcher.active);
          s.watcherHp = self.__watcher && self.__watcher.active ? Math.ceil(self.__watcher.hp) : 0;
          s.customEnemies = self.enemies
            .getChildren()
            .filter(function (o) {
              return o.active && o.kind && o.kind.indexOf("x_") === 0;
            })
            .map(function (o) {
              return o.kind;
            });
          return s;
        };
      }
    });

    // 新敌人 AI：主包 updateEnemyAI 对 x_* 全部落空，这里独占驱动
    wrap(P, "updateEnemyAI", function (args) {
      var e = args[0];
      if (!e || !e.active || !e.def || !e.def.ai) return;
      if (e.def.ai === "x_watcher") {
        watcherAI(this, e, args[1], args[2], args[3], args[4]);
        return;
      }
      if (e.def.ai.indexOf("x_") === 0) customAI(this, e, args[1], args[2], args[3], args[4]);
    });

    // 波次投放：把一部分主包敌人改写成新敌人；精英房有几率替换为守望者
    wrap(P, "spawnWave", function (args) {
      var self = this;
      var room = args[0];
      var wave = args[1] || 1;
      var s = st();
      if (!s || !room || room.type === "boss") return;
      makeTextures(self);

      var info = kit.pressureLevel(s, self);
      var alive = self.enemies.getChildren().filter(function (o) {
        return o.active && o.kind !== "boss" && (!o.kind || o.kind.indexOf("x_") !== 0);
      });

      // 守望者：第 2 层起的精英房，25% 触发，替换整波
      if (room.type === "elite" && s.floor >= 2 && wave === 1 && Math.random() < 0.25 && !self.__watcher) {
        alive.forEach(function (o) {
          if (o.shadow) o.shadow.destroy();
          if (o.healthUi) {
            o.healthUi.bg.destroy();
            o.healthUi.bar.destroy();
          }
          o.destroy();
        });
        spawnWatcher(self, 480, 190);
        return;
      }

      var ratio = kit.clamp(0.18 + info.ratio * 0.5, 0.18, 0.62);
      var pool = Object.keys(ENEMIES).filter(function (k) {
        return ENEMIES[k].floor <= s.floor;
      });
      if (!pool.length) return;
      var convert = Math.min(alive.length, Math.ceil(alive.length * ratio));
      for (var i = 0; i < convert; i++) {
        morph(self, alive[i], pool[Math.floor(Math.random() * pool.length)]);
      }
      // 高压迫时额外追加一只
      if (info.ratio > 0.55 && Math.random() < 0.6) {
        var nx = Phaser.Math.Between(120, 840);
        var ny = Phaser.Math.Between(110, 490);
        var extra = self.spawnEnemy(nx, ny, "crawler");
        morph(self, extra, pool[Math.floor(Math.random() * pool.length)]);
      }
    });

    // 护盾抵挡 / 标记 / 遗物加伤：命中前拦截
    wrapBefore(P, "hitEnemy", function (args) {
      var bullet = args[0];
      var target = args[1];
      var self = this;
      if (!target || !target.active) return;
      var m = target.__mem;
      if (m && m.shield > 0) {
        m.shield -= bullet.damage;
        self.fx.statusText(target.x, target.y - 22, "格挡", "#9fd0ff", 13);
        self.fx.hit(bullet.x, bullet.y, 0x9fd0ff);
        self.audioFx.enemyHit();
        if (m.shield <= 0) {
          m.shield = 0;
          kit.shockwave(self, target.x, target.y, 0x9fd0ff, 90);
          self.fx.statusText(target.x, target.y - 34, "护盾破碎！", "#ffd97a", 16);
          kit.hitStop(self, 60, 0.32);
        }
        if (bullet.pierce > 0) bullet.pierce--;
        else bullet.destroy();
        return "skip";
      }
    });

    wrap(P, "hitEnemy", function (args) {
      var self = this;
      var target = args[1];
      var s = st();
      if (!target || !s) return;
      var bonus = 0;
      var dmg = args[0] ? args[0].damage : 8;
      if (hasRelic("bloodtotem") && s.hp <= 2) bonus += dmg * 0.4;
      if (hasRelic("manyeyes") && target.__marked) bonus += dmg * 0.3;
      if (hasRelic("soulpact") && self.time.now < self.overdriveUntil) bonus += dmg * 0.25;
      if (hasRelic("resonantcore") && self.combo >= 14) bonus += dmg * 0.25;
      if (bonus > 0 && target.active) {
        target.hp -= bonus;
        if (target.hp <= 0) self.killEnemy(target);
      }
      if (hasRelic("echoblade") && target.active) {
        self.__hitCount = (self.__hitCount || 0) + 1;
        var need = hasSyn("echoresonance") ? 2 : 4;
        if (self.__hitCount % need === 0) echoBurst(self, target.x, target.y, dmg * 0.6);
      }
    });

    // 免死：致命伤害前拦截
    wrapBefore(P, "damagePlayer", function (args) {
      var self = this;
      var s = st();
      var amount = args[0] || 1;
      if (!s || !hasRelic("emberheart")) return;
      if (self.__emberUsedRoom === s.roomKey) return;
      if (s.hp - amount > 0 || s.coins < 3) return;
      self.__emberUsedRoom = s.roomKey;
      s.coins -= 3;
      s.hp = Math.max(s.hp, 2);
      self.invuln = 1400;
      self.fx.statusText(self.player.x, self.player.y - 34, "余烬不灭", "#ffb26b", 18);
      kit.shockwave(self, self.player.x, self.player.y, 0xffb26b, 150);
      kit.hitStop(self, 120, 0.22);
      self.cameras.main.flash(200, 220, 150, 90, false);
      self.updateHud();
      return "skip";
    });

    // 击杀：分裂 / 灵魂 / 吸血联动 / 守望者奖励
    wrap(P, "killEnemy", function (args) {
      var self = this;
      var e = args[0];
      var s = st();
      if (!e || !s) return;
      var m = e.__mem;
      self.tweens.killTweensOf(e);

      if (hasRelic("soulpact")) s.soul = Math.min(100, s.soul + 4);
      if (hasRelic("resonantcore") && self.combo >= 14) s.soul = Math.min(100, s.soul + 3);
      if (hasSyn("bloodfeast") && s.hp <= 2 && Math.random() < 0.25) {
        s.hp = Math.min(s.maxHp, s.hp + 1);
        self.fx.statusText(self.player.x, self.player.y - 30, "血宴", "#d06a72", 15);
        self.updateHud();
      }

      if (e.kind === "x_shardling" && m && m.gen === 0) {
        for (var i = 0; i < 2; i++) {
          var n = self.spawnEnemy(e.x + Phaser.Math.Between(-26, 26), e.y + Phaser.Math.Between(-26, 26), "crawler");
          morph(self, n, "x_shardling", 0.62);
          if (n.__mem) n.__mem.gen = 1;
        }
        self.fx.particle(e.x, e.y, 0x7fd8ff, { count: 14, speed: 110, life: 380, size: 4 });
      }
      if (e.kind === "x_bomber" && m && !m.silent) {
        detonate(self, e, 84, 1);
      }
      if (e.kind === "x_warden" && m && m.ring && m.ring.scene) m.ring.destroy();
      if (e.kind === "x_weaver") {
        self.enemies.getChildren().forEach(function (o) {
          if (o.__weaveBase) {
            o.speed = o.__weaveBase;
            o.__weaveBase = null;
          }
        });
      }
      if (e.kind === "x_watcher") {
        self.__watcher = null;
        ext().watcherKills++;
        kit.hitStop(self, 180, 0.2);
        kit.zoomPunch(self, 0.08, 320);
        self.fx.explosion(e.x, e.y, 150, WATCHER.tint);
        self.cameras.main.shake(500, 0.02);
        s.coins += 30;
        self.time.delayedCall(420, function () {
          var r = randomRelic();
          if (r) grantRelic(self, r);
        });
      }
    });

    // 房间事件投放
    wrap(P, "clearRoom", function () {
      var self = this;
      var s = st();
      var room = self.currentRoom;
      if (!s || !room || room.__echo) return;
      if (room.type !== "battle") return;
      if (Math.random() < 0.45 + s.luck * 0.03) {
        room.__echo = true;
        self.time.delayedCall(520, function () {
          if (s.roomKey === room.x + "," + room.y) spawnEcho(self);
        });
      }
    });

    wrap(P, "enterRoom", function () {
      var self = this;
      var s = st();
      self.__echo = null;
      self.__trial = null;
      self.__emberUsedRoom = null;
      if (!s) return;
      refreshUi(self);
      if (hasRelic("manyeyes")) {
        self.time.delayedCall(400, function () {
          var list = self.enemies.getChildren().filter(function (o) {
            return o.active;
          });
          if (!list.length) return;
          var pick = list[Math.floor(Math.random() * list.length)];
          pick.__marked = true;
          pick.__markUi = self.add.circle(pick.x, pick.y, 26);
          pick.__markUi.setStrokeStyle(2, 0xff8fd0, 0.85).setDepth(9);
        });
      }
    });

    wrap(P, "updateHud", function () {
      refreshUi(this);
    });

    wrap(P, "toggleBuildPanel", function () {
      var u = this.__xui;
      if (!u || !u.panel.scene) return;
      u.panel.setVisible(!!this.buildPanelOpen);
      if (this.buildPanelOpen) refreshPanel(this);
    });

    // 裂隙披风：冲刺留下裂隙
    wrap(P, "tryDash", function () {
      var self = this;
      if (!hasRelic("riftcloak")) return;
      if (self.dashUntil <= self.time.now) return;
      self.__riftHits = {};
      var rift = self.add.circle(self.player.x, self.player.y, 46, 0x7fd8ff, 0.1);
      rift.setStrokeStyle(2, 0x7fd8ff, 0.5).setDepth(5);
      rift.__until = self.time.now + 2600;
      self.__rifts = self.__rifts || [];
      self.__rifts.push(rift);
      self.tweens.add({ targets: rift, alpha: 0, duration: 2600 });
    });
  }

  function echoBurst(scene, x, y, dmg) {
    kit.shockwave(scene, x, y, 0xffd97a, 120);
    scene.fx.particle(x, y, 0xffd97a, { count: 12, speed: 130, life: 340, size: 4 });
    scene.enemies.getChildren().forEach(function (o) {
      if (o.active && Phaser.Math.Distance.Between(x, y, o.x, o.y) < 120) {
        o.hp -= dmg;
        if (o.hp <= 0) scene.killEnemy(o);
      }
    });
  }

  // 每帧：祭坛判定、试炼结算、裂隙、标记跟随、守望者预警落点记录
  function tickWorld(scene, time, delta) {
    if (!scene.player || !scene.player.active) return;
    var s = st();
    var e = ext();
    if (!s || !e) return;

    // 守望者 slam 预警圈记录（供落地判定）
    var w = scene.__watcher;
    if (w && w.active && w.__mem && w.__mem.pending && w.__mem.pending.pattern === "slam") {
      scene.__lastSlamZones = w.__mem.pending.marks
        .filter(function (o) {
          return o && o.__target && o.scene;
        })
        .map(function (o) {
          return { x: o.x, y: o.y };
        });
    }

    // 祭坛：走入符文即抉择
    if (scene.__echo && !scene.__echo.done) {
      var echo = scene.__echo;
      var near = echo.runes.filter(function (r) {
        return Phaser.Math.Distance.Between(scene.player.x, scene.player.y, r.x, r.y) < 46;
      });
      if (!echo.armed) {
        if (!near.length) echo.armed = true;
      } else if (near.length) {
        chooseRune(scene, near[0]);
      }
    }

    // 试炼结算
    if (scene.__trial && scene.__trial.active && time - scene.__trial.startedAt > 800) {
      var left = scene.enemies.getChildren().filter(function (o) {
        return o.active;
      }).length;
      if (left === 0) {
        scene.__trial.active = false;
        s.coins += 30;
        var r = randomRelic();
        if (r) grantRelic(scene, r);
        scene.fx.roomClear();
        scene.updateHud();
      }
    }

    // 裂隙披风：冲刺伤害 + 减速区
    if (hasRelic("riftcloak")) {
      if (time < scene.dashUntil) {
        scene.__riftHits = scene.__riftHits || {};
        scene.enemies.getChildren().forEach(function (o) {
          if (!o.active) return;
          if (Phaser.Math.Distance.Between(scene.player.x, scene.player.y, o.x, o.y) < 46) {
            if (scene.__riftHits[o.name || (o.name = "r" + Math.random())]) return;
            scene.__riftHits[o.name] = 1;
            o.hp -= 14 * (s.damageMult || 1);
            scene.fx.hit(o.x, o.y, 0x7fd8ff);
            if (o.hp <= 0) scene.killEnemy(o);
          }
        });
      }
      (scene.__rifts || []).forEach(function (rift) {
        if (!rift.scene) return;
        if (time > rift.__until) {
          killObj(scene, rift);
          return;
        }
        scene.enemies.getChildren().forEach(function (o) {
          if (o.active && Phaser.Math.Distance.Between(rift.x, rift.y, o.x, o.y) < 46) {
            o.status.frozenUntil = Math.max(o.status.frozenUntil || 0, time + 120);
          }
        });
      });
      scene.__rifts = (scene.__rifts || []).filter(function (r) {
        return r.scene;
      });
    }

    // 标记环跟随
    scene.enemies.getChildren().forEach(function (o) {
      if (o.__markUi) {
        if (!o.active) {
          o.__markUi.destroy();
          o.__markUi = null;
        } else {
          o.__markUi.setPosition(o.x, o.y);
        }
      }
    });

    if (!scene.__uiTick || time - scene.__uiTick > 120) {
      scene.__uiTick = time;
      refreshUi(scene);
    }
  }

  // ============================ 启动 ============================
  function start() {
    kit = window.__abyssKit;
    var game = window.__phaserGame;
    var scene = game.scene.getScene("game");
    // 主包以 ESM 方式引入 Phaser，页面上没有全局 Phaser 命名空间。
    // 本层只需要几个纯数学工具，直接内置等价实现，不去扒主包内部结构。
    Phaser = {
      Math: {
        Between: function (a, b) {
          return Math.floor(Math.random() * (b - a + 1)) + a;
        },
        Distance: {
          Between: function (x1, y1, x2, y2) {
            var dx = x2 - x1;
            var dy = y2 - y1;
            return Math.sqrt(dx * dx + dy * dy);
          },
        },
        Angle: {
          Between: function (x1, y1, x2, y2) {
            return Math.atan2(y2 - y1, x2 - x1);
          },
        },
      },
    };

    patch(scene);

    window.__abyssContent = {
      version: VERSION,
      enemies: Object.keys(ENEMIES),
      relics: RELICS,
      synergies: SYNERGIES,
      spawnEnemy: function (kind, x, y) {
        var g = game.scene.getScene("game");
        makeTextures(g);
        var e = g.spawnEnemy(x || 480, y || 200, "crawler");
        return morph(g, e, kind);
      },
      spawnWatcher: function () {
        var g = game.scene.getScene("game");
        makeTextures(g);
        return spawnWatcher(g, 480, 190);
      },
      spawnEcho: function () {
        spawnEcho(game.scene.getScene("game"));
      },
      grant: function (id) {
        return grantRelic(game.scene.getScene("game"), id);
      },
      grantAll: function () {
        var g = game.scene.getScene("game");
        Object.keys(RELICS).forEach(function (k) {
          grantRelic(g, k);
        });
      },
      stasis: function () {
        return castStasis(game.scene.getScene("game"));
      },
    };
    console.log("[expand] ready " + VERSION);
  }

  var tries = 0;
  (function wait() {
    if (window.__abyssKit && window.__phaserGame && window.__phaserGame.scene.getScene("game")) {
      try {
        start();
      } catch (err) {
        console.error("[expand] 启动失败", err);
      }
      return;
    }
    if (tries++ > 600) {
      console.warn("[expand] 未能挂载内容扩展层");
      return;
    }
    setTimeout(wait, 30);
  })();
})();
