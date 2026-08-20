/* 深渊圣所 · 元进度层 meta.js  （第三轮 · 第四层）
 * ---------------------------------------------------------------------------
 * 前三层解决的是「一局之内」的内容：手感(enhance) / 内容(expand) / 原生注册(deep)。
 * 这一层解决「一局之外」：玩家反复开局的理由。三个互相咬合的系统：
 *
 *   ① 深潜阶级（Ascension 0–8）
 *      每一级追加一条**具名的、可被玩家读懂的**规则，且逐级累加。
 *      通关第 N 级才解锁第 N+1 级 —— 难度是被「赚」出来的，不是滑块拖出来的。
 *
 *   ② 成就（18 条）
 *      带实时进度，达成时弹出播报并结算「渊晶」。成就条件全部读自本层自己维护的
 *      局内计数器 RUN 与跨局存档 SAVE，不依赖主包内部私有量。
 *
 *   ③ 渊晶与启程恩赐（6 件）
 *      成就产出渊晶，渊晶换永久开局强化。这是唯一的「变强不靠运气」的通道，
 *      用来抵消高阶深潜的压制，让阶级曲线不至于卡死。
 *
 *   ④ 无尽深潜
 *      首次通关后解锁。第 3 层 Boss 不再结束远征，而是继续下潜；
 *      每多下一层，敌人生命与压迫等级按曲线继续爬。
 *
 * 与既有系统的咬合点：
 *   - 压迫等级：阶级 1/7 与无尽深度都会抬高 enhance.js 的 pressureLevel 基线。
 *   - 连击评级：成就「连锁反应」直接读 state.maxCombo。
 *   - 遗物协同：成就「收藏家 / 共鸣」读 state.relics / state.synergies。
 *   - 熔渊锻炉：阶级 2 抬高铁砧与商店价格；成就「深层锻造」读锻炉换枪事件。
 *   - 深层武器：三把武器各有一条「用它通关」的成就。
 *
 * 约束：零外部依赖；全部 UI 用 Phaser GameObject 画在 960×600 逻辑画布上，
 * 随主包的 Scale 一起缩放；存档走 localStorage，与主包的 "abyssal-chamber-meta" 分开存。
 */
(function () {
  "use strict";

  var VERSION = "meta-1.0";
  var SAVE_KEY = "abyssal-deep-meta-v1";
  var W = 960;
  var H = 600;
  var FONT = "ZCOOL XiaoWei, KaiTi, STKaiti, Songti SC, serif";

  var kit = null;
  var GAME = null;

  function st() {
    return (window.__game && window.__game.state) || null;
  }

  // ===========================================================================
  // §1 存档
  // ===========================================================================
  var DEFAULT_SAVE = {
    shards: 0, // 渊晶余额
    earned: 0, // 累计获得渊晶
    ascension: 0, // 当前选中的深潜阶级
    ascensionMax: 0, // 已解锁的最高阶级
    ascensionCleared: -1, // 已通关的最高阶级（-1 = 一次都没通关）
    endless: false, // 无尽深潜开关
    endlessUnlocked: false,
    bestEndlessFloor: 0,
    achieved: {}, // id -> 达成时间戳
    boons: {}, // id -> true
    totalKills: 0,
    totalElites: 0,
    totalRuns: 0,
    totalWins: 0,
    __peakCombo: 0, // 历史最高连击，仅用于成就进度条显示
  };

  var SAVE = null;

  function loadSave() {
    var raw = null;
    try {
      raw = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
    } catch (e) {
      raw = null;
    }
    SAVE = {};
    Object.keys(DEFAULT_SAVE).forEach(function (k) {
      var d = DEFAULT_SAVE[k];
      var v = raw && raw[k] !== undefined ? raw[k] : d;
      // 对象字段要深拷贝，避免所有存档共用同一个默认对象
      if (d && typeof d === "object") v = Object.assign({}, d, v || {});
      SAVE[k] = v;
    });
    return SAVE;
  }
  function persist() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE));
    } catch (e) {
      /* 隐私模式下 localStorage 可能不可写，忽略：本局仍然正常 */
    }
  }

  // ===========================================================================
  // §2 深潜阶级
  // ===========================================================================
  // 每级只加一条规则，累加生效。desc 就是玩家在菜单里看到的原文。
  var ASCENSIONS = [
    { name: "初临深渊", desc: "没有额外的枷锁。" },
    { name: "渊压", desc: "敌人生命 ×1.15；深渊压迫起步 +1 级" },
    { name: "贫瘠", desc: "拾取金币 ×0.75；商店与铁砧价格 ×1.3" },
    { name: "锐化", desc: "每承受 3 次伤害，额外扣 1 心" },
    { name: "繁殖", desc: "每波额外 +1 敌人；精英词缀出现率翻倍" },
    { name: "枯竭", desc: "回心效果减半（每 2 次回心只生效 1 次）" },
    { name: "疾走", desc: "敌人移速 ×1.2" },
    { name: "厄兆", desc: "敌人生命再 ×1.15；深渊压迫再 +1 级" },
    { name: "渊噬", desc: "每清理 4 个房间，生命上限 -1（下限 2 心）" },
  ];
  var MAX_ASC = ASCENSIONS.length - 1;

  // 把 0..lv 的规则折算成一组数值系数，供各钩子读取。
  function mods(lv) {
    var m = {
      enemyHp: 1,
      enemySpeed: 1,
      coin: 1,
      price: 1,
      pressure: 0,
      extraWave: 0,
      eliteBonus: 0,
      hitPenaltyEvery: 0, // 每 N 次受伤额外扣 1 心，0 = 关闭
      healEvery: 0, // 每 N 次回心只生效 1 次，0 = 关闭
      maxHpDecayRooms: 0, // 每 N 个房间 -1 生命上限，0 = 关闭
    };
    if (lv >= 1) {
      m.enemyHp *= 1.15;
      m.pressure += 1;
    }
    if (lv >= 2) {
      m.coin *= 0.75;
      m.price *= 1.3;
    }
    if (lv >= 3) m.hitPenaltyEvery = 3;
    if (lv >= 4) {
      m.extraWave += 1;
      m.eliteBonus += 1;
    }
    if (lv >= 5) m.healEvery = 2;
    if (lv >= 6) m.enemySpeed *= 1.2;
    if (lv >= 7) {
      m.enemyHp *= 1.15;
      m.pressure += 1;
    }
    if (lv >= 8) m.maxHpDecayRooms = 4;
    return m;
  }

  // 无尽深潜：第 3 层之后每多下一层继续爬曲线。
  function endlessMods(depth) {
    var over = Math.max(0, depth - 3);
    return {
      enemyHp: Math.pow(1.12, over),
      enemySpeed: Math.pow(1.03, over),
      pressure: Math.floor(over / 2),
    };
  }

  // ===========================================================================
  // §3 成就
  // ===========================================================================
  // check(RUN, SAVE, ctx) 返回 true 即达成；goal/now 用于进度条。
  var ACHIEVEMENTS = [
    {
      id: "first_dive",
      name: "初次下潜",
      desc: "完成一局远征（无论生死）",
      shards: 10,
      at: "end",
      test: function () {
        return true;
      },
    },
    {
      id: "daybreak",
      name: "破晓",
      desc: "首次通关：击败第 3 层的主宰",
      shards: 30,
      at: "end",
      test: function (R) {
        return R.win;
      },
    },
    {
      id: "thousand",
      name: "千次挥击",
      desc: "累计击杀 1000 名深渊造物",
      shards: 40,
      progress: function () {
        return [SAVE.totalKills, 1000];
      },
      test: function () {
        return SAVE.totalKills >= 1000;
      },
    },
    {
      id: "chain30",
      name: "连锁反应",
      desc: "单局最高连击达到 30",
      shards: 25,
      progress: function (R) {
        return [Math.max(R.bestCombo, SAVE.__peakCombo || 0), 30];
      },
      test: function (R) {
        return R.bestCombo >= 30;
      },
    },
    {
      id: "flawless10",
      name: "静水",
      desc: "单局有 10 个房间全程零受伤",
      shards: 30,
      progress: function (R) {
        return [R.cleanRooms, 10];
      },
      test: function (R) {
        return R.cleanRooms >= 10;
      },
    },
    {
      id: "forge",
      name: "深层锻造",
      desc: "在熔渊锻炉换取一次武器",
      shards: 15,
      test: function (R) {
        return R.forgeUsed > 0;
      },
    },
    {
      id: "win_scythe",
      name: "镰影",
      desc: "手持蚀影镰通关",
      shards: 35,
      at: "end",
      test: function (R) {
        return R.win && R.endWeapon === "x_scythe";
      },
    },
    {
      id: "win_rail",
      name: "星轨",
      desc: "手持星髓炮通关",
      shards: 35,
      at: "end",
      test: function (R) {
        return R.win && R.endWeapon === "x_railcore";
      },
    },
    {
      id: "win_revenant",
      name: "溯洄",
      desc: "手持溯洄弦通关",
      shards: 35,
      at: "end",
      test: function (R) {
        return R.win && R.endWeapon === "x_revenant";
      },
    },
    {
      id: "collector",
      name: "收藏家",
      desc: "单局同时持有 12 件遗物",
      shards: 30,
      progress: function (R) {
        return [R.peakRelics, 12];
      },
      test: function (R) {
        return R.peakRelics >= 12;
      },
    },
    {
      id: "resonance",
      name: "共鸣",
      desc: "单局同时激活 3 组联动",
      shards: 30,
      progress: function (R) {
        return [R.peakSynergies, 3];
      },
      test: function (R) {
        return R.peakSynergies >= 3;
      },
    },
    {
      id: "elite60",
      name: "精英猎手",
      desc: "累计击杀 60 名精英",
      shards: 35,
      progress: function () {
        return [SAVE.totalElites, 60];
      },
      test: function () {
        return SAVE.totalElites >= 60;
      },
    },
    {
      id: "asc3",
      name: "深潜三阶",
      desc: "在深潜 3 级或更高通关",
      shards: 50,
      at: "end",
      test: function (R) {
        return R.win && R.ascension >= 3;
      },
    },
    {
      id: "asc6",
      name: "深潜六阶",
      desc: "在深潜 6 级或更高通关",
      shards: 80,
      at: "end",
      test: function (R) {
        return R.win && R.ascension >= 6;
      },
    },
    {
      id: "asc8",
      name: "极渊",
      desc: "在深潜 8 级通关",
      shards: 150,
      at: "end",
      test: function (R) {
        return R.win && R.ascension >= 8;
      },
    },
    {
      id: "rich",
      name: "富甲",
      desc: "单局同时持有 120 枚金币",
      shards: 25,
      progress: function (R) {
        return [R.peakCoins, 120];
      },
      test: function (R) {
        return R.peakCoins >= 120;
      },
    },
    {
      id: "endless8",
      name: "长夜",
      desc: "无尽深潜抵达第 8 层",
      shards: 60,
      progress: function () {
        return [SAVE.bestEndlessFloor, 8];
      },
      test: function (R) {
        return R.maxFloor >= 8;
      },
    },
    {
      id: "unbroken",
      name: "不灭",
      desc: "通关时生命全满",
      shards: 45,
      at: "end",
      test: function (R) {
        return R.win && R.endHp >= R.endMaxHp && R.endMaxHp > 0;
      },
    },
  ];
  var ACH_BY_ID = {};
  ACHIEVEMENTS.forEach(function (a) {
    ACH_BY_ID[a.id] = a;
  });

  // ===========================================================================
  // §4 启程恩赐
  // ===========================================================================
  var BOONS = [
    { id: "b_edge", name: "磨砺", cost: 30, desc: "开局伤害 +8%" },
    { id: "b_pack", name: "备囊", cost: 30, desc: "开局额外 +1 炸弹、+1 钥匙" },
    { id: "b_iron", name: "铁心", cost: 60, desc: "生命上限 +1" },
    { id: "b_soul", name: "灵触", cost: 60, desc: "开局灵魂能量 20%" },
    { id: "b_luck", name: "拾遗", cost: 90, desc: "幸运 +1" },
    { id: "b_heir", name: "传承", cost: 140, desc: "开局随机获得 1 件遗物" },
  ];

  // ===========================================================================
  // §5 局内计数器
  // ===========================================================================
  var RUN = null;
  var BLANK_RUN = null;
  function blankRun() {
    if (!BLANK_RUN) {
      var keep = RUN;
      newRun();
      BLANK_RUN = RUN;
      RUN = keep;
    }
    return BLANK_RUN;
  }
  function newRun() {
    RUN = {
      stamp: 0,
      ascension: SAVE.ascension,
      endless: SAVE.endless && SAVE.endlessUnlocked,
      mods: mods(SAVE.ascension),
      kills: 0,
      elites: 0,
      bestCombo: 0,
      peakRelics: 0,
      peakSynergies: 0,
      peakCoins: 0,
      cleanRooms: 0,
      forgeUsed: 0,
      hits: 0,
      heals: 0,
      maxFloor: 1,
      decayApplied: 0,
      win: false,
      endWeapon: null,
      endHp: 0,
      endMaxHp: 0,
      settled: false,
      newAch: [],
    };
    return RUN;
  }

  // 达成检查：随时可调，只有第一次达成才记账。
  function checkAchievements(when) {
    if (!RUN) return;
    var gained = 0;
    ACHIEVEMENTS.forEach(function (a) {
      if (SAVE.achieved[a.id]) return;
      if (a.at === "end" && when !== "end") return;
      var ok = false;
      try {
        ok = !!a.test(RUN);
      } catch (e) {
        ok = false;
      }
      if (!ok) return;
      SAVE.achieved[a.id] = Date.now();
      SAVE.shards += a.shards;
      SAVE.earned += a.shards;
      gained += a.shards;
      RUN.newAch.push(a);
      announceAchievement(a);
      window.dispatchEvent(new Event("abyss-achievement"));
    });
    if (gained) persist();
  }

  // ===========================================================================
  // §6 播报（成就弹窗）
  // ===========================================================================
  var toastQueue = [];
  var toastBusy = false;

  function announceAchievement(a) {
    toastQueue.push(a);
    pumpToast();
  }
  function pumpToast() {
    if (toastBusy || !toastQueue.length) return;
    var g = GAME && GAME.scene.getScene("game");
    if (!g || !g.scene.isActive()) return; // 不在战斗场景就攒着，回头结算界面里统一列出
    var a = toastQueue.shift();
    toastBusy = true;
    var box = g.add.container(W / 2, 96).setDepth(220).setScrollFactor(0);
    var bg = g.add.rectangle(0, 0, 400, 62, 0x0d0a12, 0.92).setStrokeStyle(2, 0xe0b352, 0.9);
    var t1 = g.add
      .text(0, -13, "◆ 成就达成 · " + a.name, { fontFamily: FONT, fontSize: "19px", color: "#f3dda6" })
      .setOrigin(0.5);
    var t2 = g.add
      .text(0, 13, a.desc + "   ＋" + a.shards + " 渊晶", {
        fontFamily: FONT,
        fontSize: "14px",
        color: "#b7ad8c",
      })
      .setOrigin(0.5);
    box.add([bg, t1, t2]);
    box.setAlpha(0).setScale(0.9);
    // 对象销毁时必须杀掉指向它的补间，否则下一帧补间写已销毁对象会打断游戏循环
    box.once("destroy", function () {
      g.tweens.killTweensOf(box);
    });
    g.tweens.add({
      targets: box,
      alpha: 1,
      scale: 1,
      duration: 220,
      ease: "Back.out",
      onComplete: function () {
        g.time.delayedCall(1500, function () {
          if (!box.scene) {
            toastBusy = false;
            pumpToast();
            return;
          }
          g.tweens.add({
            targets: box,
            alpha: 0,
            y: 70,
            duration: 260,
            onComplete: function () {
              box.destroy();
              toastBusy = false;
              pumpToast();
            },
          });
        });
      },
    });
    try {
      if (g.audioFx && g.audioFx.relic) g.audioFx.relic();
    } catch (e) {
      /* 音效可选 */
    }
  }

  // ===========================================================================
  // §7 战斗场景钩子
  // ===========================================================================
  function activeEnemies(g) {
    return g.enemies
      ? g.enemies.getChildren().filter(function (e) {
          return e.active;
        })
      : [];
  }

  // 组合系数：深潜阶级 × 无尽深度
  function liveMods() {
    var s = st();
    var m = RUN ? RUN.mods : mods(0);
    var out = Object.assign({}, m);
    if (RUN && RUN.endless && s) {
      var em = endlessMods(s.floor || 1);
      out.enemyHp *= em.enemyHp;
      out.enemySpeed *= em.enemySpeed;
      out.pressure += em.pressure;
    }
    return out;
  }

  function installGameHooks(P) {
    // --- 开局：应用启程恩赐 ---
    kit.wrap(P, "create", function () {
      var g = this;
      var s = st();
      if (!s) return;
      if (!RUN || RUN.stamp !== s.startedAt) {
        newRun();
        RUN.stamp = s.startedAt;
        applyBoons(g, s);
      }
      mountRunBadge(g);
    });

    // --- 敌人生成：血量 / 移速 / 精英率 ---
    // 用「生成前后活跃集合求差」拿新敌人：enemies 是对象池，取最后一个 child 会拿到
    // 池中间被复用的旧槽位（同 deep-content.js 的子弹池问题）。
    kit.wrapBefore(P, "spawnEnemy", function () {
      this.__metaBefore = new Set(activeEnemies(this));
    });
    kit.wrap(P, "spawnEnemy", function () {
      var g = this;
      var before = g.__metaBefore || new Set();
      var m = liveMods();
      var made = activeEnemies(g).filter(function (e) {
        return !before.has(e);
      });
      made.forEach(function (e) {
        if (e.kind === "boss") {
          // Boss 只吃血量曲线，不动移速（移速影响它的阶段位移编排）
          e.hp = Math.round(e.hp * m.enemyHp);
          e.maxHp = e.hp;
          return;
        }
        e.hp = Math.max(1, Math.round(e.hp * m.enemyHp));
        e.maxHp = e.hp;
        e.speed = e.speed * m.enemySpeed;
        // 精英率翻倍：只对还没有词缀的敌人补掷一次
        if (m.eliteBonus > 0 && !e.affix && Math.random() < 0.12 * m.eliteBonus) {
          try {
            g.applyEliteAffix(e);
          } catch (err) {
            /* 主包内部状态异常时跳过，不影响本局 */
          }
        }
      });
    });

    // --- 每波额外敌人 ---
    kit.wrap(P, "spawnWave", function (args) {
      var g = this;
      var m = liveMods();
      if (m.extraWave <= 0) return;
      var room = args[0];
      if (!room || room.type === "boss") return;
      var Ph = window.__deep && window.__deep.phaser;
      for (var i = 0; i < m.extraWave; i++) {
        try {
          var x = Ph ? Ph.Math.Between(110, 850) : 110 + Math.random() * 740;
          var y = Ph ? Ph.Math.Between(100, 500) : 100 + Math.random() * 400;
          // 复用本波已有敌人的 kind，保证与楼层主题一致
          var peers = activeEnemies(g).filter(function (e) {
            return e.kind !== "boss";
          });
          if (!peers.length) return;
          g.spawnEnemy(x, y, peers[Math.floor(Math.random() * peers.length)].kind);
        } catch (err) {
          /* 生成失败就少一只，不中断本波 */
        }
      }
    });

    // --- 受伤：阶级 3 的额外扣心 ---
    kit.wrap(P, "damagePlayer", function () {
      if (!RUN) return;
      RUN.hits++;
      var m = liveMods();
      if (!m.hitPenaltyEvery) return;
      if (RUN.hits % m.hitPenaltyEvery !== 0) return;
      var s = st();
      if (!s || s.hp <= 0) return;
      s.hp = Math.max(0, s.hp - 1);
      try {
        this.fx.statusText(this.player.x, this.player.y - 44, "锐化 · 追加伤害", "#ff9d7a", 15);
        this.updateHud();
      } catch (e) {
        /* 表现失败不影响数值 */
      }
    });

    // --- 击杀统计 ---
    kit.wrap(P, "killEnemy", function (args) {
      if (!RUN) return;
      var e = args[0];
      RUN.kills++;
      SAVE.totalKills++;
      if (e && e.affix) {
        RUN.elites++;
        SAVE.totalElites++;
      }
    });

    // --- 房间清理：无伤计数 / 生命上限衰减 / 无尽续关 ---
    kit.wrapBefore(P, "clearRoom", function () {
      var g = this;
      if (!RUN) return;
      if (!g.roomHitTaken) RUN.cleanRooms++;
      // 无尽深潜：第 3 层 Boss 不再结束远征
      var s = st();
      if (
        RUN.endless &&
        g.currentRoom &&
        g.currentRoom.type === "boss" &&
        s &&
        s.floor >= 3
      ) {
        // 主包 clearRoom 的 boss 分支写死了 floor>=3 → gameover。
        // 这里整段接管：把主包 clearRoom 的其余副作用照做一遍，然后转去 reward。
        g.currentRoom.cleared = true;
        s.roomsCleared++;
        try {
          g.createDoors(g.currentRoom);
          g.updateHud();
          g.audioFx.roomClear();
          g.fx.roomClear();
          g.cameras.main.flash(220, 210, 182, 111, false);
        } catch (e2) {
          /* 表现失败不阻断流程 */
        }
        g.time.delayedCall(850, function () {
          g.scene.start("reward");
        });
        return "skip";
      }
    });

    kit.wrap(P, "clearRoom", function () {
      if (!RUN) return;
      var s = st();
      if (!s) return;
      var m = liveMods();
      if (m.maxHpDecayRooms > 0) {
        var due = Math.floor(s.roomsCleared / m.maxHpDecayRooms);
        while (RUN.decayApplied < due && s.maxHp > 2) {
          RUN.decayApplied++;
          s.maxHp = Math.max(2, s.maxHp - 1);
          s.hp = Math.min(s.hp, s.maxHp);
          try {
            this.fx.statusText(this.player.x, this.player.y - 52, "渊噬 · 生命上限 -1", "#c98bff", 15);
          } catch (e) {
            /* 忽略 */
          }
        }
        this.updateHud();
      }
      sampleRun();
      checkAchievements("live");
    });

    // --- 金币缩水 / 回心减半：拾取后修正 ---
    kit.wrapBefore(P, "getPickup", function () {
      var s = st();
      this.__metaCoins = s ? s.coins : 0;
      this.__metaHp = s ? s.hp : 0;
    });
    kit.wrap(P, "getPickup", function () {
      var s = st();
      if (!s || !RUN) return;
      var m = liveMods();
      // 金币
      var dc = s.coins - (this.__metaCoins || 0);
      if (dc > 0 && m.coin < 1) {
        var keep = Math.max(1, Math.round(dc * m.coin));
        s.coins = (this.__metaCoins || 0) + keep;
      }
      // 回心
      var dh = s.hp - (this.__metaHp || 0);
      if (dh > 0 && m.healEvery > 0) {
        RUN.heals++;
        if (RUN.heals % m.healEvery !== 0) {
          s.hp = this.__metaHp || 0;
          try {
            this.fx.statusText(this.player.x, this.player.y - 44, "枯竭 · 治疗失效", "#8fb7c9", 14);
          } catch (e) {
            /* 忽略 */
          }
        }
      }
      this.updateHud();
      sampleRun();
      checkAchievements("live");
    });

    // --- 每帧轻量采样（连击 / 遗物 / 金币峰值）---
    kit.wrap(P, "updateCombatHud", function () {
      sampleRun();
    });

    // --- 压迫等级 HUD 补正 ---
    // enhance.js 的 refreshInfoLayer 走的是模块内部的 pressureLevel 闭包引用，
    // §12 改 kit.pressureLevel 只能影响 expand.js 的读取，改不到这块显示。
    // 所以在 updateHud 的 after 钩子里（此时 enhance 已经写完文本）把加成补回去。
    kit.wrap(P, "updateHud", function () {
      var pz = this.__pressure;
      if (!pz || !pz.text || !pz.text.scene) return;
      var m = liveMods();
      if (!m.pressure) return;
      var cur = /Lv\.(\d+)/.exec(pz.text.text);
      if (!cur) return;
      var lv = parseInt(cur[1], 10) + m.pressure;
      pz.text.setText("⚠ 深渊压迫 Lv." + lv);
      pz.bar.width = Math.min(180, pz.bar.width + 180 * m.pressure * 0.08);
    });
  }

  function sampleRun() {
    var s = st();
    if (!s || !RUN) return;
    RUN.bestCombo = Math.max(RUN.bestCombo, s.maxCombo || 0);
    if (RUN.bestCombo > (SAVE.__peakCombo || 0)) SAVE.__peakCombo = RUN.bestCombo;
    RUN.peakRelics = Math.max(RUN.peakRelics, (s.relics && s.relics.length) || 0);
    RUN.peakSynergies = Math.max(RUN.peakSynergies, (s.synergies && s.synergies.length) || 0);
    RUN.peakCoins = Math.max(RUN.peakCoins, s.coins || 0);
    RUN.maxFloor = Math.max(RUN.maxFloor, s.floor || 1);
    RUN.endWeapon = s.weapon;
    RUN.endHp = s.hp;
    RUN.endMaxHp = s.maxHp;
  }

  // ===========================================================================
  // §8 启程恩赐生效
  // ===========================================================================
  function applyBoons(g, s) {
    var b = SAVE.boons || {};
    if (b.b_edge) s.damageMult = (s.damageMult || 1) * 1.08;
    if (b.b_pack) {
      s.bombs = (s.bombs || 0) + 1;
      s.keys = (s.keys || 0) + 1;
    }
    if (b.b_iron) {
      s.maxHp = (s.maxHp || 6) + 1;
      s.hp = (s.hp || 6) + 1;
    }
    if (b.b_soul) s.soul = Math.max(s.soul || 0, 20);
    if (b.b_luck) s.luck = (s.luck || 0) + 1;
    if (b.b_heir) {
      try {
        var pool = window.__deep && window.__deep.tables && window.__deep.tables.relics;
        if (pool && pool.length) {
          var pick = pool[Math.floor(Math.random() * pool.length)];
          if (pick && !s.relics.includes(pick.id)) g.applyRelic(pick.id);
        }
      } catch (e) {
        /* 遗物表拿不到就跳过这条恩赐 */
      }
    }
    try {
      g.updateHud();
    } catch (e) {
      /* 忽略 */
    }
  }

  // ===========================================================================
  // §9 局内徽章（HUD 右上）
  // ===========================================================================
  function mountRunBadge(g) {
    if (g.__metaBadge && g.__metaBadge.scene) return;
    var txt = g.add
      .text(W - 18, 40, "", { fontFamily: FONT, fontSize: "14px", color: "#c8b48a", align: "right" })
      .setOrigin(1, 0)
      .setDepth(120)
      .setScrollFactor(0);
    g.__metaBadge = txt;
    txt.once("destroy", function () {
      g.__metaBadge = null;
    });
    var refresh = function () {
      if (!txt.scene) return;
      var s = st();
      var parts = [];
      parts.push("深潜 " + roman(RUN ? RUN.ascension : 0) + " · " + ASCENSIONS[(RUN ? RUN.ascension : 0)].name);
      if (RUN && RUN.endless) parts.push("无尽 · 第 " + (s ? s.floor : 1) + " 层");
      txt.setText(parts.join("\n"));
    };
    refresh();
    var ev = g.time.addEvent({ delay: 400, loop: true, callback: refresh });
    txt.once("destroy", function () {
      ev.remove(false);
    });
  }

  function roman(n) {
    return ["0", "I", "II", "III", "IV", "V", "VI", "VII", "VIII"][n] || String(n);
  }

  // ===========================================================================
  // §10 结算接入
  // ===========================================================================
  function installOverHooks() {
    var over = GAME.scene.getScene("gameover");
    if (!over) return;
    var P = Object.getPrototypeOf(over);
    if (P.__metaOverPatched) return;
    P.__metaOverPatched = true;
    kit.wrap(P, "create", function (args) {
      var sc = this;
      var data = (args && args[0]) || {};
      settle(!!data.win);
      renderSettle(sc);
    });
  }

  function settle(win) {
    if (!RUN || RUN.settled) return;
    RUN.settled = true;
    RUN.win = win;
    sampleRun();
    SAVE.totalRuns++;
    if (win) SAVE.totalWins++;
    if (RUN.endless) SAVE.bestEndlessFloor = Math.max(SAVE.bestEndlessFloor, RUN.maxFloor);
    RUN.unlockedAsc = false;
    if (win) {
      SAVE.ascensionCleared = Math.max(SAVE.ascensionCleared, RUN.ascension);
      if (RUN.ascension >= SAVE.ascensionMax && SAVE.ascensionMax < MAX_ASC) {
        SAVE.ascensionMax = RUN.ascension + 1;
        RUN.unlockedAsc = true;
      }
      if (!SAVE.endlessUnlocked) {
        SAVE.endlessUnlocked = true;
        RUN.unlockedEndless = true;
      }
    }
    checkAchievements("end");
    persist();
  }

  function renderSettle(sc) {
    if (!RUN) return;
    var lines = [];
    lines.push("深潜 " + roman(RUN.ascension) + " · " + ASCENSIONS[RUN.ascension].name + (RUN.endless ? "   ·   无尽深潜" : ""));
    lines.push("精英击杀 " + RUN.elites + "   ·   无伤房间 " + RUN.cleanRooms + "   ·   最深 " + RUN.maxFloor + " 层");
    if (RUN.newAch.length) {
      var got = RUN.newAch.reduce(function (n, a) {
        return n + a.shards;
      }, 0);
      lines.push("新成就 " + RUN.newAch.length + " 项：" + RUN.newAch.map(function (a) {
        return a.name;
      }).join("、") + "   ＋" + got + " 渊晶");
    }
    if (RUN.unlockedAsc) lines.push("◆ 解锁深潜 " + roman(SAVE.ascensionMax) + " · " + ASCENSIONS[SAVE.ascensionMax].name);
    if (RUN.unlockedEndless) lines.push("◆ 解锁无尽深潜");
    lines.push("渊晶余额 " + SAVE.shards);

    var y = H - 96;
    var panel = sc.add.rectangle(W / 2, y + 4, 780, 96, 0x0b0910, 0.72).setStrokeStyle(1, 0x6a5a3c, 0.8).setDepth(180);
    var t = sc.add
      .text(W / 2, y, lines.join("\n"), {
        fontFamily: FONT,
        fontSize: "15px",
        color: "#d8c79c",
        align: "center",
        lineSpacing: 4,
      })
      .setOrigin(0.5)
      .setDepth(181);
    panel.setSize(780, t.height + 26);
  }

  // ===========================================================================
  // §11 菜单：状态条 + 深渊记忆面板
  // ===========================================================================
  function installMenuHooks() {
    var menu = GAME.scene.getScene("menu");
    if (!menu) return;
    var P = Object.getPrototypeOf(menu);
    if (P.__metaMenuPatched) return;
    P.__metaMenuPatched = true;
    kit.wrap(P, "create", function () {
      buildMenuStrip(this);
    });
    if (menu.sys && menu.sys.isActive()) buildMenuStrip(menu);
  }

  function buildMenuStrip(sc) {
    if (!sc || !sc.add) return;
    var strip = sc.add
      .text(16, 14, "", { fontFamily: FONT, fontSize: "15px", color: "#cbb489" })
      .setDepth(200);
    var refresh = function () {
      if (!strip.scene) return;
      var done = Object.keys(SAVE.achieved).length;
      strip.setText(
        "深潜 " +
          roman(SAVE.ascension) +
          " · " +
          ASCENSIONS[SAVE.ascension].name +
          "    ◈ 渊晶 " +
          SAVE.shards +
          "    ◆ 成就 " +
          done +
          "/" +
          ACHIEVEMENTS.length +
          (SAVE.endlessUnlocked ? "    ∞ 无尽 " + (SAVE.endless ? "开" : "关") : "") +
          "\n[ / ] 调整深潜阶级" +
          (SAVE.endlessUnlocked ? "   N 无尽开关" : "") +
          "   M 深渊记忆",
      );
    };
    refresh();
    sc.__metaStrip = strip;

    var kb = sc.input && sc.input.keyboard;
    if (!kb) return;
    var onKey = function (ev) {
      var k = ev.key;
      if (sc.__metaPanel) {
        if (k === "m" || k === "M" || k === "Escape") {
          closePanel(sc);
          ev.stopPropagation();
        }
        return;
      }
      if (k === "[") {
        SAVE.ascension = Math.max(0, SAVE.ascension - 1);
        persist();
        refresh();
      } else if (k === "]") {
        SAVE.ascension = Math.min(SAVE.ascensionMax, SAVE.ascension + 1);
        persist();
        refresh();
      } else if ((k === "n" || k === "N") && SAVE.endlessUnlocked) {
        SAVE.endless = !SAVE.endless;
        persist();
        refresh();
      } else if (k === "m" || k === "M") {
        openPanel(sc, refresh);
      }
    };
    kb.on("keydown", onKey);
    sc.events.once("shutdown", function () {
      kb.off("keydown", onKey);
      sc.__metaPanel = null;
    });
  }

  // --- 深渊记忆面板：阶级 / 成就 / 恩赐 三栏 ---
  function openPanel(sc, onChange) {
    if (sc.__metaPanel) return;
    var c = sc.add.container(0, 0).setDepth(400);
    sc.__metaPanel = c;
    var veil = sc.add.rectangle(W / 2, H / 2, W, H, 0x05060a, 0.94);
    c.add(veil);

    var title = sc.add
      .text(W / 2, 26, "深 渊 记 忆", { fontFamily: FONT, fontSize: "26px", color: "#efdcae" })
      .setOrigin(0.5, 0);
    c.add(title);
    var hint = sc.add
      .text(W / 2, 60, "[ / ] 选择深潜阶级    1–6 购买启程恩赐    N 无尽开关    M / Esc 返回", {
        fontFamily: FONT,
        fontSize: "13px",
        color: "#8a7f68",
      })
      .setOrigin(0.5, 0);
    c.add(hint);

    // 左栏：深潜阶级
    var colA = sc.add.text(28, 92, "", { fontFamily: FONT, fontSize: "13px", color: "#c9b58c", lineSpacing: 3 });
    // 中栏：成就
    var colB = sc.add.text(348, 92, "", { fontFamily: FONT, fontSize: "12px", color: "#bfae87", lineSpacing: 2 });
    // 右栏：恩赐
    var colC = sc.add.text(700, 92, "", { fontFamily: FONT, fontSize: "13px", color: "#c9b58c", lineSpacing: 3 });
    c.add([colA, colB, colC]);

    var draw = function () {
      var a = ["◇ 深 潜 阶 级", ""];
      for (var i = 0; i <= MAX_ASC; i++) {
        var locked = i > SAVE.ascensionMax;
        var cur = i === SAVE.ascension;
        var mark = locked ? "　✕ " : cur ? "▶ " : "　 ";
        a.push(mark + roman(i) + " " + ASCENSIONS[i].name + (locked ? "（未解锁）" : ""));
        if (cur) a.push("     " + ASCENSIONS[i].desc);
      }
      a.push("");
      a.push("已通关最高阶级：" + (SAVE.ascensionCleared < 0 ? "无" : roman(SAVE.ascensionCleared)));
      a.push("无尽深潜：" + (SAVE.endlessUnlocked ? (SAVE.endless ? "已开启" : "已解锁 · 关闭") : "未解锁（先通关一次）"));
      if (SAVE.bestEndlessFloor) a.push("无尽最深：第 " + SAVE.bestEndlessFloor + " 层");
      colA.setText(a.join("\n"));

      var b = ["◇ 成 就   " + Object.keys(SAVE.achieved).length + " / " + ACHIEVEMENTS.length, ""];
      ACHIEVEMENTS.forEach(function (ac) {
        var done = !!SAVE.achieved[ac.id];
        var line = (done ? "✦ " : "· ") + ac.name + "  " + ac.desc;
        if (!done && ac.progress) {
          var p = ac.progress(RUN || blankRun());
          line += "  (" + Math.min(p[0], p[1]) + "/" + p[1] + ")";
        }
        b.push(line + (done ? "" : "   ＋" + ac.shards));
      });
      colB.setText(b.join("\n"));

      var cc = ["◇ 启 程 恩 赐", "渊晶 " + SAVE.shards, ""];
      BOONS.forEach(function (bo, i) {
        var owned = !!SAVE.boons[bo.id];
        cc.push((owned ? "✦ " : i + 1 + ". ") + bo.name + (owned ? "（已获得）" : "  ◈" + bo.cost));
        cc.push("    " + bo.desc);
      });
      colC.setText(cc.join("\n"));
    };
    draw();

    var kb = sc.input.keyboard;
    var onKey = function (ev) {
      var k = ev.key;
      if (k === "[") SAVE.ascension = Math.max(0, SAVE.ascension - 1);
      else if (k === "]") SAVE.ascension = Math.min(SAVE.ascensionMax, SAVE.ascension + 1);
      else if ((k === "n" || k === "N") && SAVE.endlessUnlocked) SAVE.endless = !SAVE.endless;
      else if (/^[1-6]$/.test(k)) {
        var bo = BOONS[parseInt(k, 10) - 1];
        if (bo && !SAVE.boons[bo.id] && SAVE.shards >= bo.cost) {
          SAVE.shards -= bo.cost;
          SAVE.boons[bo.id] = true;
        }
      } else return;
      persist();
      draw();
      if (onChange) onChange();
      ev.stopPropagation();
    };
    kb.on("keydown", onKey);
    c.__onKey = onKey;
  }

  function closePanel(sc) {
    var c = sc.__metaPanel;
    if (!c) return;
    if (c.__onKey && sc.input && sc.input.keyboard) sc.input.keyboard.off("keydown", c.__onKey);
    c.destroy(true);
    sc.__metaPanel = null;
  }

  // ===========================================================================
  // §12 压迫等级抬升（与 enhance.js 咬合）
  // ===========================================================================
  function installPressureHook() {
    if (!kit || typeof kit.pressureLevel !== "function" || kit.__metaPressure) return;
    var orig = kit.pressureLevel;
    kit.__metaPressure = true;
    var patched = function (s, scene) {
      var r = orig(s, scene);
      var m = liveMods();
      if (m.pressure) {
        r = { level: r.level + m.pressure, ratio: Math.min(1, r.ratio + m.pressure * 0.08) };
      }
      return r;
    };
    kit.pressureLevel = patched;
    window.__abyssKit.pressureLevel = patched;
  }

  // ===========================================================================
  // §13 启动
  // ===========================================================================
  function boot() {
    GAME = window.__phaserGame;
    kit = window.__abyssKit;
    loadSave();

    var g = GAME.scene.getScene("game");
    if (g) installGameHooks(Object.getPrototypeOf(g));
    installMenuHooks();
    installOverHooks();
    installPressureHook();

    // 锻炉换枪事件（deep-content 未派发事件时，靠轮询武器变化兜底见 §7 sampleRun）
    window.addEventListener("abyss-forge-used", function () {
      if (RUN) {
        RUN.forgeUsed++;
        checkAchievements("live");
      }
    });

    window.__abyssMeta = {
      version: VERSION,
      save: function () {
        return SAVE;
      },
      run: function () {
        return RUN;
      },
      mods: liveMods,
      ascensions: ASCENSIONS,
      achievements: ACHIEVEMENTS,
      boons: BOONS,
      setAscension: function (n) {
        SAVE.ascensionMax = Math.max(SAVE.ascensionMax, Math.min(MAX_ASC, n));
        SAVE.ascension = Math.max(0, Math.min(SAVE.ascensionMax, n));
        persist();
        window.dispatchEvent(new Event("abyss-meta-unlock"));
        return SAVE.ascension;
      },
      setEndless: function (v) {
        SAVE.endlessUnlocked = true;
        SAVE.endless = !!v;
        persist();
        return SAVE.endless;
      },
      grantShards: function (n) {
        SAVE.shards += n;
        persist();
        return SAVE.shards;
      },
      buy: function (id) {
        var bo = BOONS.filter(function (b) {
          return b.id === id;
        })[0];
        if (!bo || SAVE.boons[id] || SAVE.shards < bo.cost) return false;
        SAVE.shards -= bo.cost;
        SAVE.boons[id] = true;
        persist();
        window.dispatchEvent(new Event("abyss-meta-unlock"));
        return true;
      },
      reset: function () {
        try {
          localStorage.removeItem(SAVE_KEY);
        } catch (e) {
          /* 忽略 */
        }
        loadSave();
        return SAVE;
      },
      check: function () {
        checkAchievements("end");
        return RUN;
      },
    };
    console.log("[meta] ready " + VERSION);
  }

  var tries = 0;
  (function wait() {
    if (window.__phaserGame && window.__abyssKit && window.__phaserGame.scene.getScene("game")) {
      boot();
      return;
    }
    if (tries++ > 400) {
      console.warn("[meta] 等待主包超时，元进度层未启用");
      return;
    }
    setTimeout(wait, 60);
  })();
})();
