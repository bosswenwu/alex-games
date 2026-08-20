/* 深渊圣所 · 第三轮内容层 deep-content.js
 * 跑在 deep.js 暴露的 window.__deep SDK 上。
 * 本文件只写「内容与系统」，取表 / 注册 / Phaser 命名空间一律走 SDK。
 *
 * §1 三把深层武器（原生注册进武器表，HUD 与构筑面板直接认得）
 * §2 熔渊锻炉：真正的新房间类型（进楼层生成、进房间标题、进小地图）
 */
(function () {
  "use strict";

  var D = null; // SDK
  var Ph = null;
  var kit = null;
  var W = 960;
  var H = 600;

  function st() {
    return D.state();
  }

  // ===========================================================================
  // §1 深层武器
  // ===========================================================================
  // stats 会被塞进主包的武器表，因此字段名必须和主包一致：
  // name / damage / cooldown / speed / color / size / pierce / homing / lifesteal
  //
  // 主包 update 的自动开火判定是 `now - lastShot > O[weapon].cooldown / (fireMult...)`，
  // 蓄力武器要靠一个极大的 cooldown 把自动开火关掉，再由本层自己驱动。
  var WEAPONS = {
    x_scythe: {
      stats: {
        name: "蚀影镰",
        damage: 9,
        cooldown: 300,
        speed: 330,
        color: 0x8ce0c8,
        size: 9,
        pierce: 2,
      },
      tag: "近身扇形 · 连击越高扇面越宽",
      lore: "刃身没有反光，因为它连光一起吃掉了。",
      // 射程极短：子弹存活 280ms 后自行湮灭
      range: 280,
      // 单次开火的弹数下限，只用于锻炉里的秒伤对比显示
      dpsShots: 3,
      dpsNote: "×3~7 发",
    },
    x_railcore: {
      stats: {
        name: "星髓炮",
        damage: 22,
        cooldown: 999999, // 关闭主包自动开火，改由蓄力逻辑驱动
        speed: 780,
        color: 0xffd27a,
        size: 12,
        pierce: 4,
      },
      tag: "蓄力贯穿 · 满蓄力过载",
      lore: "把一颗死去的星星压进枪管，它还在挣扎。",
      chargeMax: 900,
    },
    x_revenant: {
      stats: {
        name: "溯洄弦",
        damage: 11,
        cooldown: 300,
        speed: 540,
        color: 0xc79bff,
        size: 7,
      },
      tag: "双弦折返 · 回收灵魂",
      lore: "射出去的从来不是箭，是你还没想清楚的问题。",
      returnAt: 360,
      dpsShots: 2,
      dpsNote: "×2 发",
    },
  };
  var MY_WEAPON = function (id) {
    return !!WEAPONS[id];
  };

  // 武器价目：基础武器便宜，深层武器贵
  function weaponPrice(id) {
    return MY_WEAPON(id) ? 16 : 10;
  }

  // --- 生成一发子弹并给它打标记 ---------------------------------------------
  // 不能用「取组里最后一个」：this.shots 是对象池，create 会复用池中间已死的槽位，
  // 于是「最后一个」经常是上一发还活着的子弹，新子弹反而没被标记
  //（实测表现为溯洄弦只生成 1 发折返弹而不是 2 发）。
  // 用「生成前后的活跃集合求差」才是可靠的。
  function spawnMarked(g, ang, def, mark) {
    var before = new Set(g.shots.getChildren().filter(function (b) {
      return b.active;
    }));
    g.spawnPlayerShot(ang, def);
    var made = g.shots.getChildren().filter(function (b) {
      return b.active && !before.has(b);
    });
    made.forEach(mark);
    return made[0] || null;
  }

  // --- 蚀影镰 ---------------------------------------------------------------
  function fireScythe(g, ang, now) {
    var s = st();
    var def = D.tables.weapons.x_scythe;
    // 与连击评级咬合：连击越高，扇面从 3 发扩到 7 发
    var n = g.combo >= 20 ? 7 : g.combo >= 8 ? 5 : 3;
    var spread = 0.5;
    for (var i = 0; i < n; i++) {
      var a = ang + (i - (n - 1) / 2) * spread * (2 / (n - 1 || 1));
      spawnMarked(g, a, def, function (b) {
        b.__deepRange = WEAPONS.x_scythe.range;
        b.__deepKnock = 210;
      });
    }
    // 近身武器需要一点「挥砍」的形，画一道弧
    var arc = g.add.graphics().setDepth(19);
    arc.lineStyle(4, def.color, 0.5);
    arc.beginPath();
    arc.arc(g.player.x, g.player.y, 62, ang - 0.55, ang + 0.55);
    arc.strokePath();
    g.tweens.add({
      targets: arc,
      alpha: 0,
      duration: 190,
      onComplete: function () {
        arc.destroy();
      },
    });
    g.fx.muzzle(g.player.x, g.player.y, ang, def.color);
    g.audioFx.shoot("thorn");
    g.cameras.main.shake(40, 0.0025);
  }

  // --- 星髓炮 ---------------------------------------------------------------
  function railRelease(g, ang, charge) {
    var s = st();
    var base = D.tables.weapons.x_railcore;
    var t = Math.min(1, charge / WEAPONS.x_railcore.chargeMax);
    var full = t >= 0.98;
    // 临时 def：绝不能改表里的对象，那是跨局共用的
    var def = {
      name: base.name,
      damage: 14 + 42 * t,
      cooldown: base.cooldown,
      speed: 520 + 340 * t,
      color: full ? 0xfff2c4 : base.color,
      size: 7 + 9 * t,
      pierce: Math.round(1 + 5 * t),
    };
    spawnMarked(g, ang, def, function (b) {
      b.__deepRail = t;
      b.setScale(def.size / 7);
      if (full) b.__deepOverload = true;
    });
    g.fx.muzzle(g.player.x, g.player.y, ang, def.color);
    g.audioFx.shoot(full ? "void" : "ember");
    g.cameras.main.shake(full ? 120 : 45, full ? 0.008 : 0.003);
    if (full) {
      kit.shockwave(g, g.player.x, g.player.y, 0xfff2c4, 130);
      kit.hitStop(g, 70, 0.3);
      kit.zoomPunch(g, 0.04, 160);
      g.fx.statusText(g.player.x, g.player.y - 42, "过载", "#fff2c4", 17);
    }
  }

  // --- 溯洄弦 ---------------------------------------------------------------
  function fireRevenant(g, ang, now) {
    var def = D.tables.weapons.x_revenant;
    [-0.13, 0.13].forEach(function (o) {
      spawnMarked(g, ang + o, def, function (b) {
        b.__deepReturn = { turnAt: now + WEAPONS.x_revenant.returnAt, phase: "out" };
        b.__deepSoul = true;
      });
    });
    g.fx.muzzle(g.player.x, g.player.y, ang, def.color);
    g.audioFx.shoot("star");
  }

  // ===========================================================================
  // §2 熔渊锻炉
  // ===========================================================================
  var FORGE_TYPE = "x_forge";
  var FORGE_COLOR = 0xd98a4a;

  // 楼层生成后处理：把一间够远的普通战斗房改造成锻炉。
  // 不动主包的生成算法，只在进房间之前对 state.rooms 这张活 Map 打补丁。
  function ensureForge(s) {
    if (!s || !s.rooms) return;
    var stamp = s.seed + "/" + s.floor;
    if (s.__deepForgeStamp === stamp) return;
    s.__deepForgeStamp = stamp;
    var cands = [];
    s.rooms.forEach(function (r) {
      if (r.type === "battle" && !r.cleared && Math.abs(r.x) + Math.abs(r.y) >= 2) cands.push(r);
    });
    if (!cands.length) {
      s.rooms.forEach(function (r) {
        if (r.type === "battle" && !r.cleared) cands.push(r);
      });
    }
    if (!cands.length) return;
    var pick = cands[Math.floor(Math.random() * cands.length)];
    pick.type = FORGE_TYPE;
    pick.cleared = true; // 无战斗房间，门必须是开的
  }

  // 房间内容：中央熔炉 + 三座铁砧 + 一座重铸台
  function buildForge(g) {
    var s = st();
    var room = g.currentRoom;
    if (!room || room.type !== FORGE_TYPE) return;

    var objs = [];
    // 主包换房时会统一 destroy roomObjects，但不会清理指向它们的补间。
    // 循环补间（呼吸光环、淡出）在对象销毁后仍会去写 radius，下一帧直接炸掉整个游戏循环。
    // 所以每个对象都在自己的 destroy 事件里把补间杀干净。
    function keep(o) {
      objs.push(o);
      g.roomObjects.push(o);
      o.once("destroy", function () {
        g.tweens.killTweensOf(o);
      });
      return o;
    }

    // 熔炉本体
    var core = keep(g.add.circle(480, 168, 46, FORGE_COLOR, 0.14));
    core.setStrokeStyle(3, FORGE_COLOR, 0.8).setDepth(3);
    var halo = keep(g.add.circle(480, 168, 58));
    halo.setStrokeStyle(2, 0xffc07a, 0.35).setDepth(3);
    g.tweens.add({ targets: halo, radius: 76, alpha: 0.08, duration: 1700, yoyo: true, repeat: -1 });
    keep(
      g.add
        .text(480, 168, "熔", {
          fontFamily: "ZCOOL XiaoWei, KaiTi, STKaiti, serif",
          fontSize: "30px",
          color: "#ffcf95",
        })
        .setOrigin(0.5)
        .setDepth(4)
    );
    keep(
      g.add
        .text(480, 108, "◈ 熔 渊 锻 炉 ◈", {
          fontFamily: "ZCOOL XiaoWei, KaiTi, STKaiti, serif",
          fontSize: "22px",
          color: "#f0d0a4",
          backgroundColor: "#120c08cc",
          padding: { x: 12, y: 4 },
        })
        .setOrigin(0.5)
        .setDepth(20)
    );

    if (room.__forgeUsed) {
      keep(
        g.add
          .text(480, 300, "炉火已熄。", { fontSize: "14px", color: "#8b8376" })
          .setOrigin(0.5)
          .setDepth(20)
      );
      g.__forge = null;
      return;
    }

    // 三把候选武器：排除当前手上这把
    var all = Object.keys(D.tables.weapons).filter(function (k) {
      return k !== s.weapon && D.tables.weapons[k] && D.tables.weapons[k].name;
    });
    Ph.Utils.Array.Shuffle(all);
    var offer = all.slice(0, 3);

    var cur = D.tables.weapons[s.weapon] || {};
    var anvils = [];
    offer.forEach(function (id, i) {
      var wd = D.tables.weapons[id];
      var x = 240 + i * 240;
      var y = 346;
      var mine = MY_WEAPON(id);
      var price = weaponPrice(id);

      var pad = keep(g.add.circle(x, y, 38, wd.color, 0.1));
      pad.setStrokeStyle(3, wd.color, 0.7).setDepth(3);
      // 铁砧剪影
      var anv = keep(g.add.graphics().setDepth(4));
      anv.fillStyle(0x4a4038, 1).fillRoundedRect(x - 24, y - 4, 48, 14, 4);
      anv.fillStyle(0x5d5147, 1).fillRoundedRect(x - 11, y + 8, 22, 14, 3);
      anv.fillStyle(wd.color, 0.9).fillCircle(x, y - 17, 8);

      keep(
        g.add
          .text(x, y - 70, wd.name, {
            fontFamily: "ZCOOL XiaoWei, KaiTi, STKaiti, serif",
            fontSize: "19px",
            color: mine ? "#f2c887" : "#e6dcc8",
          })
          .setOrigin(0.5)
          .setDepth(20)
      );
      // 与当前武器的数值对比。扇形 / 双弦武器一次开火不止一发，
      // 只比单发伤害会把它们显示得远弱于实际，所以按弹数折算。
      function dpsOf(id2, def2) {
        if (!def2 || def2.cooldown > 100000) return null;
        var mult = (WEAPONS[id2] && WEAPONS[id2].dpsShots) || 1;
        return (def2.damage * mult / def2.cooldown) * 1000;
      }
      var dpsNew = dpsOf(id, wd);
      var dpsOld = dpsOf(s.weapon, cur);
      var note = mine && WEAPONS[id].dpsNote ? " " + WEAPONS[id].dpsNote : "";
      var cmp;
      if (dpsNew == null) cmp = "蓄力武器 · 无固定射速";
      else if (dpsOld == null) cmp = "秒伤 " + dpsNew.toFixed(1) + note;
      else {
        var d = dpsNew - dpsOld;
        cmp = "秒伤 " + dpsNew.toFixed(1) + note + "（" + (d >= 0 ? "+" : "") + d.toFixed(1) + "）";
      }
      keep(
        g.add
          .text(x, y + 62, (mine ? WEAPONS[id].tag : "圣所旧械") + "\n" + cmp + "\n◉ " + price, {
            fontSize: "11px",
            color: "#a49b8d",
            align: "center",
            lineSpacing: 6,
            backgroundColor: "#0b0a0ecc",
            padding: { x: 8, y: 5 },
          })
          .setOrigin(0.5, 0)
          .setDepth(20)
      );
      anvils.push({ id: id, x: x, y: y, price: price, pad: pad });
    });

    // 重铸台：花金币把一件随机遗物换成另一件
    // 右上角：避开左侧 HUD（x<210）与右上角小地图（x>820）
    var rx = 750;
    var ry = 186;
    var rpad = keep(g.add.circle(rx, ry, 32, 0x9a7fd0, 0.1));
    rpad.setStrokeStyle(3, 0x9a7fd0, 0.7).setDepth(3);
    keep(
      g.add
        .text(rx, ry - 52, "重铸台", {
          fontFamily: "ZCOOL XiaoWei, KaiTi, STKaiti, serif",
          fontSize: "17px",
          color: "#cbb6f0",
        })
        .setOrigin(0.5)
        .setDepth(20)
    );
    keep(
      g.add
        .text(rx, ry + 40, "随机重铸一件遗物\n◉ 8", {
          fontSize: "11px",
          color: "#a49b8d",
          align: "center",
          lineSpacing: 5,
          backgroundColor: "#0b0a0ecc",
          padding: { x: 8, y: 5 },
        })
        .setOrigin(0.5, 0)
        .setDepth(20)
    );

    keep(
      g.add
        .text(480, 518, "站上铁砧换取武器 · 每座锻炉只能取用一次", { fontSize: "12px", color: "#8b8376" })
        .setOrigin(0.5)
        .setDepth(20)
    );

    // armed：先离开所有台座才允许触发，避免刚进门就踩在上面被误选
    g.__forge = { anvils: anvils, reforge: { x: rx, y: ry, pad: rpad }, armed: false, objs: objs, room: room };
    g.audioFx.door();
  }

  function takeWeapon(g, anvil) {
    var s = st();
    var f = g.__forge;
    if (!f || f.room.__forgeUsed) return;
    if (s.coins < anvil.price) {
      g.fx.statusText(anvil.x, anvil.y - 30, "金币不足", "#d06a72", 14);
      f.blockUntil = g.time.now + 700;
      return;
    }
    s.coins -= anvil.price;
    s.weapon = anvil.id;
    f.room.__forgeUsed = true;
    // 派发给 meta.js（成就计数）与 audio.js（铁砧敲击音）
    window.dispatchEvent(new Event("abyss-forge-used"));
    var wd = D.tables.weapons[anvil.id];
    kit.shockwave(g, anvil.x, anvil.y, wd.color, 150);
    kit.zoomPunch(g, 0.045, 200);
    kit.hitStop(g, 90, 0.28);
    g.cameras.main.flash(220, 220, 170, 110, false);
    g.fx.statusText(g.player.x, g.player.y - 40, "◈ " + wd.name, "#ffd97a", 19);
    g.showToast("换装：" + wd.name + "\n" + (MY_WEAPON(anvil.id) ? WEAPONS[anvil.id].lore : "圣所留下的旧械。"));
    g.audioFx.pickup();
    fadeForge(g);
    g.updateHud();
  }

  function doReforge(g) {
    var s = st();
    var f = g.__forge;
    if (!f || f.room.__forgeUsed) return;
    if (!s.relics.length) {
      g.fx.statusText(f.reforge.x, f.reforge.y - 30, "无物可铸", "#d06a72", 14);
      f.blockUntil = g.time.now + 700;
      return;
    }
    if (s.coins < 8) {
      g.fx.statusText(f.reforge.x, f.reforge.y - 30, "金币不足", "#d06a72", 14);
      f.blockUntil = g.time.now + 700;
      return;
    }
    var fresh = g.chooseRelic(true);
    if (!fresh) {
      g.fx.statusText(f.reforge.x, f.reforge.y - 30, "深渊已无新物", "#d06a72", 14);
      f.blockUntil = g.time.now + 700;
      return;
    }
    s.coins -= 8;
    var lost = s.relics[Math.floor(Math.random() * s.relics.length)];
    var lostName = (D.tables.relics.filter(function (r) {
      return r.id === lost;
    })[0] || {}).name;
    s.relics = s.relics.filter(function (r) {
      return r !== lost;
    });
    f.room.__forgeUsed = true;
    window.dispatchEvent(new Event("abyss-reforge"));
    g.applyRelic(fresh);
    kit.shockwave(g, f.reforge.x, f.reforge.y, 0x9a7fd0, 140);
    g.showToast("重铸完成\n失去：" + (lostName || lost) + "\n获得：" + fresh.name);
    g.audioFx.pickup();
    fadeForge(g);
    g.updateHud();
  }

  function fadeForge(g) {
    var f = g.__forge;
    if (!f) return;
    f.objs.forEach(function (o) {
      if (!o || !o.scene) return;
      g.tweens.killTweensOf(o);
      g.tweens.add({ targets: o, alpha: 0, duration: 340 });
    });
    g.__forge = null;
  }

  // 小地图：主包的配色是内联字面量取不到，按同样的几何在它画完之后补一层
  function paintForgeOnMinimap(g) {
    var s = st();
    if (!s || !s.rooms) return;
    var mm = g.minimap;
    if (!mm) return;
    var list = [];
    s.rooms.forEach(function (r) {
      if (!r.hidden) list.push(r);
    });
    if (!list.length) return;
    var minX = Math.min.apply(
      null,
      list.map(function (r) {
        return r.x;
      })
    );
    var maxX = Math.max.apply(
      null,
      list.map(function (r) {
        return r.x;
      })
    );
    var minY = Math.min.apply(
      null,
      list.map(function (r) {
        return r.y;
      })
    );
    var maxY = Math.max.apply(
      null,
      list.map(function (r) {
        return r.y;
      })
    );
    var cell = 20;
    var boxW = (maxX - minX + 1) * cell + 18;
    var left = 944 - boxW;
    var top = 100;
    list.forEach(function (r) {
      if (r.type !== FORGE_TYPE) return;
      if (r.x + "," + r.y === s.roomKey) return; // 当前房间保留主包的高亮
      var cx = left + 9 + (r.x - minX) * cell + cell / 2;
      var cy = top + 9 + (r.y - minY) * cell + cell / 2;
      mm.fillStyle(FORGE_COLOR, 1).fillRoundedRect(cx - 7, cy - 7, 14, 14, 2);
      mm.lineStyle(1, 0x171a20, 0.8).strokeRoundedRect(cx - 7, cy - 7, 14, 14, 2);
    });
  }

  // ===========================================================================
  // §3 每帧驱动
  // ===========================================================================
  function tick(g, time, delta) {
    var s = st();
    if (!s || !g.player || !g.player.active) return;

    // --- 子弹行为：射程 / 折返 / 击退标记 ---
    g.shots.getChildren().forEach(function (b) {
      if (!b.active) return;
      if (b.__deepRange && time - b.born > b.__deepRange) {
        g.fx.particle(b.x, b.y, 0x8ce0c8, { count: 3, speed: 50, life: 200, size: 3 });
        b.destroy();
        return;
      }
      var r = b.__deepReturn;
      if (r) {
        if (r.phase === "out" && time >= r.turnAt) {
          r.phase = "back";
          g.fx.particle(b.x, b.y, 0xc79bff, { count: 5, speed: 60, life: 240, size: 3 });
        }
        if (r.phase === "back") {
          var a = Math.atan2(g.player.y - b.y, g.player.x - b.x);
          var sp = b.baseSpeed * 1.15;
          b.setVelocity(Math.cos(a) * sp, Math.sin(a) * sp);
          if (Ph.Math.Distance.Between(b.x, b.y, g.player.x, g.player.y) < 26) {
            s.soul = Math.min(100, s.soul + 2);
            g.fx.particle(b.x, b.y, 0xc79bff, { count: 6, speed: 70, life: 260, size: 3 });
            b.destroy();
            g.updateHud();
          }
        }
      }
    });

    // --- 星髓炮蓄力 ---
    if (s.weapon === "x_railcore") {
      var ch = g.__rail || (g.__rail = { charge: 0, down: false, ui: null });
      var down = !!(g.input.activePointer && g.input.activePointer.primaryDown);
      // 键盘瞄准也要能蓄力：主包用方向键作为射击输入
      var kb = g.input.keyboard;
      if (!down && kb && kb.addKeys) {
        var ks = g.__railKeys || (g.__railKeys = kb.addKeys("UP,DOWN,LEFT,RIGHT"));
        down = ks.UP.isDown || ks.DOWN.isDown || ks.LEFT.isDown || ks.RIGHT.isDown;
        if (down) {
          ch.kx = (ks.RIGHT.isDown ? 1 : 0) - (ks.LEFT.isDown ? 1 : 0);
          ch.ky = (ks.DOWN.isDown ? 1 : 0) - (ks.UP.isDown ? 1 : 0);
        }
      } else if (down) {
        ch.kx = null;
      }
      if (down) {
        ch.charge = Math.min(WEAPONS.x_railcore.chargeMax, ch.charge + delta);
        ch.down = true;
      } else if (ch.down) {
        ch.down = false;
        var ang;
        if (ch.kx || ch.ky) ang = Math.atan2(ch.ky, ch.kx);
        else {
          var p = g.input.activePointer;
          ang = Math.atan2(p.worldY - g.player.y, p.worldX - g.player.x);
        }
        if (ch.charge > 90) {
          railRelease(g, ang, ch.charge);
          g.lastShot = time;
        }
        ch.charge = 0;
        ch.kx = ch.ky = 0;
      }
      drawChargeRing(g, ch.charge / WEAPONS.x_railcore.chargeMax);
    } else if (g.__rail) {
      drawChargeRing(g, 0);
      g.__rail.charge = 0;
    }

    // --- 锻炉台座判定 ---
    var f = g.__forge;
    if (f && (!f.blockUntil || time > f.blockUntil)) {
      var px = g.player.x;
      var py = g.player.y;
      var onAnvil = null;
      f.anvils.forEach(function (a) {
        var d = Ph.Math.Distance.Between(px, py, a.x, a.y);
        a.pad.setStrokeStyle(3, D.tables.weapons[a.id].color, d < 60 ? 1 : 0.7);
        if (d < 42) onAnvil = a;
      });
      var dR = Ph.Math.Distance.Between(px, py, f.reforge.x, f.reforge.y);
      f.reforge.pad.setStrokeStyle(3, 0x9a7fd0, dR < 60 ? 1 : 0.7);
      var onRe = dR < 38;
      if (!f.armed) {
        if (!onAnvil && !onRe) f.armed = true;
      } else if (onAnvil) takeWeapon(g, onAnvil);
      else if (onRe) doReforge(g);
    }
  }

  function drawChargeRing(g, t) {
    var ui = g.__chargeUi;
    if (!ui || !ui.scene) {
      if (t <= 0) return;
      ui = g.__chargeUi = g.add.graphics().setDepth(21);
    }
    ui.clear();
    if (t <= 0 || !g.player || !g.player.active) return;
    var full = t >= 0.98;
    ui.lineStyle(4, full ? 0xfff2c4 : 0xffd27a, full ? 0.95 : 0.55);
    ui.beginPath();
    ui.arc(g.player.x, g.player.y, 34, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * t);
    ui.strokePath();
    if (full) {
      ui.lineStyle(2, 0xfff2c4, 0.5);
      ui.strokeCircle(g.player.x, g.player.y, 40 + Math.sin(g.time.now / 90) * 3);
    }
  }

  // ===========================================================================
  // §4 装配
  // ===========================================================================
  function install(g, api) {
    D = api;
    Ph = api.phaser;
    kit = api.kit;
    var P = Object.getPrototypeOf(g);
    if (P.__deepContentPatched) {
      onSceneCreate(g);
      return;
    }
    P.__deepContentPatched = true;

    // --- 注册内容 ---
    Object.keys(WEAPONS).forEach(function (id) {
      api.registerWeapon(id, WEAPONS[id]);
    });
    api.registerRoom(FORGE_TYPE, { meta: { name: "熔渊锻炉", icon: "⚒", locked: false } });

    // --- 开火接管 ---
    kit.wrapBefore(P, "fire", function (args) {
      var s = st();
      if (!s || !MY_WEAPON(s.weapon)) return;
      var dx = args[0];
      var dy = args[1];
      var now = args[2];
      var ang = Math.atan2(dy, dx);
      this.lastShot = now;
      this.shotCounter++;
      if (s.weapon === "x_scythe") fireScythe(this, ang, now);
      else if (s.weapon === "x_revenant") fireRevenant(this, ang, now);
      // x_railcore 完全由蓄力逻辑驱动，这里吞掉主包的自动开火
      return "skip";
    });

    // --- 蚀影镰击退 / 星髓炮过载穿透表现 ---
    kit.wrap(P, "hitEnemy", function (args) {
      var b = args[0];
      var e = args[1];
      if (!b || !e || !e.active) return;
      if (b.__deepKnock) {
        var a = Math.atan2(e.y - this.player.y, e.x - this.player.x);
        e.x += Math.cos(a) * 6;
        e.y += Math.sin(a) * 6;
      }
      if (b.__deepOverload) {
        this.fx.particle(e.x, e.y, 0xfff2c4, { count: 6, speed: 120, life: 260, size: 4 });
      }
      if (b.__deepSoul) {
        var s = st();
        if (s) s.soul = Math.min(100, s.soul + 1);
      }
    });

    // --- 楼层生成后处理：塞进锻炉 ---
    kit.wrapBefore(P, "enterRoom", function () {
      ensureForge(st());
    });

    kit.wrap(P, "enterRoom", function () {
      this.__forge = null;
      buildForge(this);
    });

    kit.wrap(P, "drawMinimap", function () {
      paintForgeOnMinimap(this);
    });

    // --- 每帧 ---
    kit.wrap(P, "create", function () {
      onSceneCreate(this);
    });
    onSceneCreate(g);
  }

  function onSceneCreate(g) {
    if (g.__deepTicking) return;
    g.__deepTicking = true;
    g.__rail = { charge: 0, down: false };
    g.__forge = null;
    g.__chargeUi = null;
    var onUpd = function (time, delta) {
      try {
        tick(g, time, delta);
      } catch (e) {
        console.warn("[deep-content] tick failed", e);
      }
    };
    g.events.on("update", onUpd);
    g.events.once("shutdown", function () {
      g.events.off("update", onUpd);
      g.__deepTicking = false;
    });

    // 调试接口
    if (window.__game) {
      var base = window.__game.getState;
      window.__game.getState = function () {
        var s = base();
        var cur = st();
        s.deep = "deep-3.0";
        s.deepWeapon = cur ? cur.weapon : null;
        s.deepWeaponIsNew = cur ? MY_WEAPON(cur.weapon) : false;
        s.railCharge = g.__rail ? Math.round(g.__rail.charge) : 0;
        s.forgeOpen = !!g.__forge;
        s.forgeRooms = cur && cur.rooms
          ? [...cur.rooms.values()].filter(function (r) {
              return r.type === FORGE_TYPE;
            }).length
          : 0;
        return s;
      };
    }
  }

  window.__deepDebug = {
    weapons: WEAPONS,
    give: function (id) {
      var s = st();
      if (!s || !D.tables.weapons[id]) return false;
      s.weapon = id;
      D.scene().updateHud();
      return true;
    },
    forgeHere: function () {
      var g = D.scene();
      var s = st();
      g.currentRoom.type = FORGE_TYPE;
      g.currentRoom.__forgeUsed = false;
      g.currentRoom.cleared = true;
      g.enterRoom();
      return true;
    },
  };

  function boot() {
    window.__deep.onBoot(install);
    // SDK 的 create 钩子晚于本次 create，若游戏已在跑要补装一次
    var g = window.__deep.scene();
    if (g && g.sys.isActive() && window.__deep.tables.weapons) install(g, window.__deep);
  }

  if (window.__deep) boot();
  else window.addEventListener("deep-sdk-ready", boot);
})();
