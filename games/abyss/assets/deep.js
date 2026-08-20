/* 深渊圣所 · 深层扩展 deep.js  （第三轮）
 * ---------------------------------------------------------------------------
 * 与前两轮（enhance.js 表现层 / expand.js 内容层）的根本区别：
 *
 * 前两轮认为「主包的内容表（武器 / 敌人 / 遗物 / 联动 / Boss）是模块私有、拿不到」，
 * 因此只能「先让主包生成一个基础实体，再把它改写成新东西」。这条路能跑，但天花板明显：
 * 新武器无法进 HUD 与构筑面板，新敌人拿不到主包的血条 / 精英词缀 / 层数缩放，
 * 新遗物进不了抽卡池 / 商店 / 宝箱。
 *
 * 第三轮实测确认：这些表全部可以在运行时拿到实引用，因此扩展层可以「真正注册」内容。
 * 四条取表通道（全部已在浏览器中验证）：
 *
 *   ① Phaser 命名空间
 *      主包 `import{r as q,g as X}from"./phaser-*.js"`，其中 q 是带缓存的 CJS 工厂、
 *      X 是 interop-default。因此 `X(q())` 拿到的就是主包正在用的那一个 Phaser 对象
 *      （已断言 `Ph.Game === __phaserGame.constructor`，版本 3.90.0）。
 *      → 全量 Phaser API、可注册新 Scene、且 Utils.Array.GetRandom 可打补丁。
 *
 *   ② 以「字符串键查表」为入口的表（武器 O / 敌人 E / Boss P）
 *      主包写法是 `O[state.weapon]` / `E[kind]` / `P[bossId]`，键由我们控制。
 *      在 Object.prototype 上临时定义一个同名 getter，getter 里的 `this` 就是那张表本身。
 *      取到后立刻 delete 掉 getter，只留下表的引用。
 *
 *   ③ 以数组方法遍历的表（遗物 A / 联动 de）
 *      主包写法是 `A.filter(...)` / `de.filter(...)`。临时替换 Array.prototype.filter，
 *      从调用现场的 `this` 收集候选数组，再按元素形状（id+rarity / id+requires）认领。
 *
 *   ④ 层主题里的敌人池
 *      主包用 `Phaser.Utils.Array.GetRandom(theme.enemyPool)` 抽敌人。
 *      我们不去改那个数组（它是跨局共用的模块常量，改了会污染），
 *      而是在 GetRandom 外面套一层：认出敌人池时，按当前层数与压迫度决定是否改判成新敌人。
 *
 * 结论：主包对新内容不再「无感」，而是「原生认得」。
 * 本层因此分成两段：§A 取表与注册 SDK（框架），§B 之后的内容都跑在 SDK 上。
 *
 * 约束：零外部依赖，贴图一律 Graphics 程序绘制后 generateTexture。
 */
(function () {
  "use strict";

  var VERSION = "deep-3.0";
  var PHASER_URL = "./phaser-DFK5Ua9d.js";

  // ===========================================================================
  // §A.0 基础工具
  // ===========================================================================
  var Ph = null; // Phaser 命名空间（与主包同一实例）
  var kit = null; // enhance.js 的共享工具
  var GAME = null;

  function st() {
    return (window.__game && window.__game.state) || null;
  }
  function scene() {
    return GAME && GAME.scene.getScene("game");
  }
  function log(msg, extra) {
    if (extra === undefined) console.log("[deep] " + msg);
    else console.log("[deep] " + msg, extra);
  }

  // 取表过程中出的任何问题都必须留痕：报告里不允许把「没取到」说成「取到了」。
  var DIAG = {
    phaser: false,
    weapons: false,
    enemies: false,
    relics: false,
    synergies: false,
    bosses: false,
    roomMeta: false,
    pools: false,
    errors: [],
  };
  function fail(what, err) {
    DIAG.errors.push(what + ": " + (err && err.message ? err.message : String(err)));
    console.warn("[deep] 取表失败 " + what, err);
  }

  // ===========================================================================
  // §A.1 通道②：字符串键查表 → Object.prototype 临时 getter
  // ===========================================================================
  // trigger 里必须真的触发一次 `TABLE[probeKey]` 的读取。getter 返回 stub，
  // 让主包那一行代码能正常走完，不留副作用。
  //
  // getter 挂在 Object.prototype 上，触发期间「任何」对象读这个键都会命中。
  // 实测这不是理论风险：updateHud 内部还会调 drawMinimap，那里有一个同样按房间
  // 类型索引的内联配色字面量，会把房间元信息表的捕获结果覆盖掉。
  // 因此这里收集全部候选，由调用方用 claim 认领，而不是只留最后一个。
  function captureByKeyLookup(probeKey, stub, trigger, claim) {
    var seen = [];
    Object.defineProperty(Object.prototype, probeKey, {
      configurable: true,
      get: function () {
        seen.push(this);
        return stub;
      },
    });
    try {
      trigger(probeKey);
    } finally {
      delete Object.prototype[probeKey];
    }
    for (var i = 0; i < seen.length; i++) {
      if (seen[i] && claim(seen[i])) return seen[i];
    }
    return null;
  }

  // ===========================================================================
  // §A.2 通道③：数组遍历表 → 临时替换 Array.prototype.filter
  // ===========================================================================
  function captureByFilter(trigger, claim) {
    var seen = [];
    var orig = Array.prototype.filter;
    Array.prototype.filter = function () {
      seen.push(this);
      return orig.apply(this, arguments);
    };
    try {
      trigger();
    } finally {
      Array.prototype.filter = orig;
    }
    for (var i = 0; i < seen.length; i++) {
      if (Array.isArray(seen[i]) && seen[i].length && claim(seen[i])) return seen[i];
    }
    return null;
  }

  // ===========================================================================
  // §A.3 表引用
  // ===========================================================================
  var T = {
    weapons: null, // { ember, thorn, void, blood, star, ... }
    enemies: null, // { crawler, spitter, ... }
    relics: null, // [ {id,name,rarity,desc,color,tags}, ... ]
    synergies: null, // [ {id,name,requires,desc}, ... ]
    bosses: null, // { ossuary, furnace, seraph, ... }
    roomMeta: null, // { start, battle, elite, treasure, shop, shrine, challenge, secret, boss }
  };

  function grabWeapons(g) {
    try {
      var s = st();
      if (!s) return;
      var prev = s.weapon;
      var stub = { name: "·", damage: 1, cooldown: 99999, speed: 100, color: 0xffffff, size: 5 };
      var tbl = captureByKeyLookup(
        "__deepProbeWeapon",
        stub,
        function (k) {
          s.weapon = k;
          g.updateHud(); // 主包这里读 O[state.weapon].name
        },
        function (o) {
          return o.ember && o.void && o.ember.damage;
        }
      );
      s.weapon = prev;
      g.updateHud();
      if (tbl && tbl.ember && tbl.void) {
        T.weapons = tbl;
        DIAG.weapons = true;
      } else fail("weapons", "认领校验未通过");
    } catch (e) {
      fail("weapons", e);
    }
  }

  function grabEnemies(g) {
    try {
      // spawnEnemy 里是 `E[kind] || E.crawler`，getter 返回 stub 即可拿到 E。
      // 会真的造出一个精灵，用完必须连影子一起清掉（不能走 killEnemy，那会发奖励）。
      var stub = {
        name: "·",
        texture: "crawler",
        hp: 1,
        speed: 0,
        radius: 11,
        contact: 0,
        ai: "__deep_none",
        tint: 0xffffff,
        weight: 0,
      };
      var made = null;
      var tbl = captureByKeyLookup(
        "__deepProbeEnemy",
        stub,
        function (k) {
          made = g.spawnEnemy(-9999, -9999, k);
        },
        function (o) {
          return o.crawler && o.brute && o.crawler.texture;
        }
      );
      if (made) {
        if (made.shadow) made.shadow.destroy();
        if (made.healthUi) {
          made.healthUi.bg.destroy();
          made.healthUi.bar.destroy();
        }
        made.destroy();
      }
      if (tbl && tbl.crawler && tbl.brute) {
        T.enemies = tbl;
        DIAG.enemies = true;
      } else fail("enemies", "认领校验未通过");
    } catch (e) {
      fail("enemies", e);
    }
  }

  function grabBosses(g) {
    try {
      // updateBoss 首行是 `P[e.bossId]`。构造一个「刚攻击过」的假 Boss，
      // 让方法读完表就从冷却分支 return，全程零副作用。
      var stub = { name: "·", title: "", hp: 1, tint: 0xffffff, phases: [], stageNames: [], patterns: ["radial"] };
      var fake = {
        bossId: null,
        hp: 1,
        maxHp: 1,
        stage: 0,
        phase: 0,
        patternIndex: 0,
        lastAttack: Number.MAX_SAFE_INTEGER,
        pendingAttack: null,
        setVelocity: function () {},
      };
      var tbl = captureByKeyLookup(
        "__deepProbeBoss",
        stub,
        function (k) {
          fake.bossId = k;
          g.updateBoss(fake, 0, 0, 0, 0);
        },
        function (o) {
          return o.ossuary && o.seraph && Array.isArray(o.ossuary.patterns);
        }
      );
      if (tbl && tbl.ossuary && tbl.seraph) {
        T.bosses = tbl;
        DIAG.bosses = true;
      } else fail("bosses", "认领校验未通过");
    } catch (e) {
      fail("bosses", e);
    }
  }

  function grabRoomMeta(g) {
    try {
      // updateHud 里是 `ue[this.currentRoom.type]?.name || "深渊"`。
      // 临时把当前房间的 type 换成探针键，读完立刻换回来并重画一次 HUD。
      if (!g.currentRoom) return;
      var prev = g.currentRoom.type;
      var stub = { name: "·", icon: "·", locked: false };
      var tbl = captureByKeyLookup(
        "__deepProbeRoom",
        stub,
        function (k) {
          g.currentRoom.type = k;
          g.updateHud();
        },
        // 认领关键：drawMinimap 里的配色字面量也有 boss/shop/elite 等键，
        // 但它的值是数字；房间元信息表的值是 {name,icon,locked} 对象。
        function (o) {
          return o.battle && o.boss && typeof o.battle === "object" && o.battle.name;
        }
      );
      g.currentRoom.type = prev;
      g.updateHud();
      if (tbl && tbl.battle && tbl.boss) {
        T.roomMeta = tbl;
        DIAG.roomMeta = true;
      } else fail("roomMeta", "认领校验未通过");
    } catch (e) {
      fail("roomMeta", e);
    }
  }

  function grabRelics(g) {
    try {
      var tbl = captureByFilter(
        function () {
          g.chooseRelic(false); // 内部 `A.filter(o=>!state.relics.includes(o.id))`
        },
        function (arr) {
          return arr.length > 10 && arr[0] && arr[0].id && arr[0].rarity && arr[0].desc !== undefined;
        }
      );
      if (tbl) {
        T.relics = tbl;
        DIAG.relics = true;
      } else fail("relics", "未在 chooseRelic 中认领到遗物表");
    } catch (e) {
      fail("relics", e);
    }
  }

  function grabSynergies(g) {
    try {
      // toggleBuildPanel 内部调用联动解析器 `T(state.relics)`，其中 `de.filter(...)`。
      // 开→关成对调用，本帧内不会渲染出来。
      var tbl = captureByFilter(
        function () {
          g.toggleBuildPanel();
          g.toggleBuildPanel();
        },
        function (arr) {
          return arr[0] && arr[0].id && Array.isArray(arr[0].requires);
        }
      );
      if (tbl) {
        T.synergies = tbl;
        DIAG.synergies = true;
      } else fail("synergies", "未在 toggleBuildPanel 中认领到联动表");
    } catch (e) {
      fail("synergies", e);
    }
  }

  // ===========================================================================
  // §A.4 通道④：敌人池改判（不改动主包的池数组本身）
  // ===========================================================================
  // GetRandom 是全局共用的工具函数，套壳时必须做到：
  //   - 只对「敌人池」生效，别的调用一律原样透传；
  //   - 只在游戏场景活跃时生效；
  //   - 概率与层数由我们自己的规则决定，主包的池数组保持只读。
  var poolRule = null; // function(pool, pickedByBase) -> kind
  function installPoolHook() {
    try {
      var orig = Ph.Utils.Array.GetRandom;
      if (orig.__deepWrapped) {
        DIAG.pools = true;
        return;
      }
      var wrapped = function (arr) {
        var picked = orig.apply(this, arguments);
        if (!poolRule || !Array.isArray(arr) || !arr.length) return picked;
        if (typeof arr[0] !== "string") return picked;
        if (!T.enemies || !T.enemies[arr[0]]) return picked; // 不是敌人池
        try {
          var r = poolRule(arr, picked);
          return r || picked;
        } catch (e) {
          return picked;
        }
      };
      wrapped.__deepWrapped = true;
      Ph.Utils.Array.GetRandom = wrapped;
      DIAG.pools = true;
    } catch (e) {
      fail("pools", e);
    }
  }

  // ===========================================================================
  // §A.5 注册 API
  // ===========================================================================
  var REG = { weapons: {}, enemies: {}, relics: {}, synergies: {}, bosses: {}, rooms: {} };

  function registerWeapon(id, def) {
    if (!T.weapons) return false;
    if (!T.weapons[id]) T.weapons[id] = def.stats;
    REG.weapons[id] = def;
    return true;
  }
  function registerEnemy(id, def) {
    if (!T.enemies) return false;
    if (!T.enemies[id]) T.enemies[id] = def.stats;
    REG.enemies[id] = def;
    return true;
  }
  function registerRelic(def) {
    if (!T.relics) return false;
    var exists = T.relics.some(function (r) {
      return r.id === def.entry.id;
    });
    if (!exists) T.relics.push(def.entry);
    REG.relics[def.entry.id] = def;
    return true;
  }
  function registerSynergy(entry) {
    if (!T.synergies) return false;
    var exists = T.synergies.some(function (s) {
      return s.id === entry.id;
    });
    if (!exists) T.synergies.push(entry);
    REG.synergies[entry.id] = entry;
    return true;
  }
  function registerBoss(id, def) {
    if (!T.bosses) return false;
    if (!T.bosses[id]) T.bosses[id] = def.stats;
    REG.bosses[id] = def;
    return true;
  }
  // 房间类型注册进 ue 之后，主包的房间标题栏就会原生显示新名字；
  // 小地图配色是内联字面量、取不到，由内容层在 drawMinimap 之后补画。
  function registerRoom(type, def) {
    if (!T.roomMeta) return false;
    if (!T.roomMeta[type]) T.roomMeta[type] = def.meta;
    REG.rooms[type] = def;
    return true;
  }

  // ===========================================================================
  // §A.6 启动：取 Phaser → 取表 → 交给内容层
  // ===========================================================================
  var contentBoot = []; // 内容层注册的启动回调，签名 (g, api)
  function onBoot(fn) {
    contentBoot.push(fn);
  }

  var booted = false;
  function bootTables(g) {
    if (booted) return;
    booted = true;
    grabWeapons(g);
    grabEnemies(g);
    grabBosses(g);
    grabRoomMeta(g);
    grabRelics(g);
    grabSynergies(g);
    installPoolHook();
    log(
      "取表结果 " +
        Object.keys(DIAG)
          .filter(function (k) {
            return k !== "errors";
          })
          .map(function (k) {
            return k + "=" + (DIAG[k] ? "✔" : "✘");
          })
          .join(" ")
    );
    if (DIAG.errors.length) console.warn("[deep] 取表异常", DIAG.errors);
  }

  function api() {
    return {
      version: VERSION,
      phaser: Ph,
      kit: kit,
      tables: T,
      diag: DIAG,
      registerWeapon: registerWeapon,
      registerEnemy: registerEnemy,
      registerRelic: registerRelic,
      registerSynergy: registerSynergy,
      registerBoss: registerBoss,
      registerRoom: registerRoom,
      setPoolRule: function (fn) {
        poolRule = fn;
      },
      state: st,
      scene: scene,
      onBoot: onBoot,
    };
  }

  function start() {
    GAME = window.__phaserGame;
    kit = window.__abyssKit;
    var g = scene();
    var P = Object.getPrototypeOf(g);

    // 取表必须发生在游戏场景真正跑起来之后（updateHud / spawnEnemy 都要求场景已 create）。
    kit.wrap(P, "create", function () {
      var self = this;
      try {
        bootTables(self);
      } catch (e) {
        fail("bootTables", e);
      }
      var A = api();
      contentBoot.forEach(function (fn) {
        try {
          fn(self, A);
        } catch (e) {
          console.warn("[deep] 内容层启动失败", e);
        }
      });
    });

    window.__deep = api();
    window.dispatchEvent(new Event("deep-sdk-ready"));
    log("SDK ready " + VERSION);
  }

  var tries = 0;
  (function wait() {
    if (window.__abyssKit && window.__phaserGame && window.__phaserGame.scene.getScene("game") && window.__abyssContent) {
      import(PHASER_URL)
        .then(function (m) {
          // m.r 是带缓存的 CJS 工厂，m.g 是 interop-default —— 与主包顶部的 import 完全一致，
          // 因此 g(r()) 返回的就是主包正在使用的那一个 Phaser 对象，而不是新副本。
          if (typeof m.r !== "function" || typeof m.g !== "function") throw new Error("phaser 模块导出形状与预期不符");
          var ns = m.g(m.r());
          if (!ns || !ns.Scene || !ns.Utils || ns.Game !== window.__phaserGame.constructor) {
            throw new Error("取到的 Phaser 与游戏实例不是同一份");
          }
          Ph = ns;
          DIAG.phaser = true;
          start();
        })
        .catch(function (e) {
          fail("phaser", e);
          console.error("[deep] 无法取得 Phaser 命名空间，深层扩展未启用", e);
        });
      return;
    }
    if (tries++ > 800) {
      console.warn("[deep] 依赖层未就绪，深层扩展未启用");
      return;
    }
    setTimeout(wait, 30);
  })();
})();
