/* 深渊圣所 · 音频层 audio.js （第三轮 · 第六层）
 * ---------------------------------------------------------------------------
 * 先探查再动手。主包 `scene.audioFx` 的实际情况（读 index-DN03p2tr.js 得到）：
 *
 *   - 一个 WebAudio `context` + 单个 `master` GainNode（gain=0.18），**没有分总线**，
 *     所以「音乐音量」和「音效音量」在主包里根本无法分开调，只有 setMuted 一刀切。
 *   - 两个合成原语：`tone({frequency,endFrequency,duration,volume,type,attack})`
 *     走指数包络的振荡器；`noise({duration,volume,highpass})` 走一次性噪声 buffer。
 *   - 音色词典：shoot / enemyHit / enemyDeath / playerHit / pickup / door /
 *     bossRoar / roomClear。风格是**极短的指数下滑音 + 很小的音量（0.05–0.18）**，
 *     低沉、干、不做混响。新音色必须守住这个风格，否则一响就出戏。
 *   - `startAmbience(floor)`：480ms 一拍的 setInterval，根音 [55,48,42] 按层降，
 *     八音符琶音 + 每四拍一个低八度长音。很单薄，且**不随战斗状态变化**。
 *   - `shoot()` 的音色表只有 ember/thorn/void/blood/star 五把 —— 深层三把新武器
 *     （x_scythe / x_railcore / x_revenant）**全部落到 ember 的兜底音**，
 *     这是「新内容没有配套音效」最具体的一条证据。
 *
 * 这一层做四件事，全部是在主包的通道上加东西，不另起一套：
 *   §2 总线改造：在 master 之下插 music / sfx 两条子总线，两个音量独立可调并持久化。
 *   §3 音色扩展：补 12 个新音色，风格对齐主包；三把深层武器各有自己的射击音。
 *   §4 音乐引擎：替换 startAmbience，做成分层的（低音持续 / 琶音 / 打击 / 张力音），
 *      随层数换调式、随战斗状态（敌人数量、玩家血量、压迫等级）实时改变织体与速度。
 *   §5 挂钩：把新音色接到暴击 / 精英出现 / Boss 阶段 / 遗物获得 / 成就 / 死亡 / 锻炉 等节点。
 *   §6 设置：音乐、音效音量与静音的读写接口 + localStorage 持久化。
 *
 * 约束：零外部依赖，纯 WebAudio 合成，不下载任何音频文件。
 */
(function () {
  "use strict";

  var VERSION = "audio-1.0";
  var SKEY = "abyssal-deep-audio-v1";

  var kit = null;
  var GAME = null;
  var FX = null; // 当前场景的 audioFx 实例
  var BUS = null; // { music, sfx }
  var CFG = { music: 0.7, sfx: 0.85, muted: false };

  function st() {
    return (window.__game && window.__game.state) || null;
  }

  // ===========================================================================
  // §1 设置持久化
  // ===========================================================================
  function loadCfg() {
    try {
      var raw = JSON.parse(localStorage.getItem(SKEY) || "null");
      if (raw) {
        if (typeof raw.music === "number") CFG.music = raw.music;
        if (typeof raw.sfx === "number") CFG.sfx = raw.sfx;
        CFG.muted = !!raw.muted;
      }
    } catch (e) {
      /* 隐私模式下读不到就用默认值 */
    }
  }
  function saveCfg() {
    try {
      localStorage.setItem(SKEY, JSON.stringify(CFG));
    } catch (e) {
      /* 忽略 */
    }
  }

  // ===========================================================================
  // §2 总线改造
  // ===========================================================================
  // 主包的 tone/noise 都硬连 this.master。这里把它们改成连到「当前通道」，
  // 通道由可选参数 channel 决定，缺省 sfx。音乐引擎显式传 channel:"music"。
  function installBus(fx) {
    if (!fx || !fx.context || !fx.master || fx.__busInstalled) return !!BUS;
    var ctx = fx.context;
    var music = ctx.createGain();
    var sfx = ctx.createGain();
    music.connect(fx.master);
    sfx.connect(fx.master);
    BUS = { music: music, sfx: sfx, ctx: ctx };
    applyVolumes();

    var origTone = fx.tone.bind(fx);
    var origNoise = fx.noise.bind(fx);

    // 重写而不是包一层：需要改的是「连到哪个节点」，包 after 钩子改不了。
    // 实现照抄主包的包络形状，保证新旧音色的听感一致。
    fx.tone = function (o) {
      if (!fx.enabled || !fx.context || !fx.master) return;
      o = o || {};
      var dest = o.channel === "music" ? music : sfx;
      var t0 = ctx.currentTime + (o.delay || 0);
      var f = o.frequency === undefined ? 220 : o.frequency;
      var f2 = o.endFrequency === undefined ? f : o.endFrequency;
      var dur = o.duration === undefined ? 0.1 : o.duration;
      var vol = o.volume === undefined ? 0.2 : o.volume;
      var atk = o.attack === undefined ? 0.004 : o.attack;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = o.type || "sine";
      osc.frequency.setValueAtTime(Math.max(20, f), t0);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + dur);
      if (o.detune) osc.detune.setValueAtTime(o.detune, t0);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + atk);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      var tail = gain;
      // 可选的低通，用来做「闷」的音色（Boss 咆哮、深层低音）
      if (o.lowpass) {
        var lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = o.lowpass;
        gain.connect(lp);
        tail = lp;
      }
      osc.connect(gain);
      tail.connect(dest);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    };

    fx.noise = function (o) {
      if (!fx.enabled || !fx.context || !fx.master) return;
      o = o || {};
      var dest = o.channel === "music" ? music : sfx;
      var dur = o.duration === undefined ? 0.08 : o.duration;
      var vol = o.volume === undefined ? 0.08 : o.volume;
      var hp = o.highpass === undefined ? 500 : o.highpass;
      var t0 = ctx.currentTime + (o.delay || 0);
      var n = Math.ceil(ctx.sampleRate * dur);
      var buf = ctx.createBuffer(1, n, ctx.sampleRate);
      var ch = buf.getChannelData(0);
      // 主包是线性衰减的白噪声；这里加一个可选的 curve 指数，
      // curve>1 = 更快掉下去（金属撞击），curve<1 = 拖尾更长（风声）。
      var curve = o.curve || 1;
      for (var i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, curve);
      var src = ctx.createBufferSource();
      var flt = ctx.createBiquadFilter();
      var gain = ctx.createGain();
      flt.type = o.filter || "highpass";
      flt.frequency.value = hp;
      if (o.q) flt.Q.value = o.q;
      gain.gain.value = vol;
      src.buffer = buf;
      src.connect(flt);
      flt.connect(gain);
      gain.connect(dest);
      src.start(t0);
    };

    fx.__origTone = origTone;
    fx.__origNoise = origNoise;
    fx.__busInstalled = true;
    return true;
  }

  function applyVolumes() {
    if (!BUS) return;
    var t = BUS.ctx.currentTime;
    BUS.music.gain.setTargetAtTime(CFG.muted ? 0 : CFG.music, t, 0.03);
    BUS.sfx.gain.setTargetAtTime(CFG.muted ? 0 : CFG.sfx, t, 0.03);
  }

  // 主包的 setMuted 会把 master 拉到 0 / 0.18。保留它作为总静音，
  // 但我们自己的 CFG.muted 走子总线，两者互不打架。
  function tone(o) {
    if (FX && FX.tone) FX.tone(o);
  }
  function noise(o) {
    if (FX && FX.noise) FX.noise(o);
  }

  // ===========================================================================
  // §3 音色扩展
  // ===========================================================================
  // 设计准则（从主包音色反推）：时长 ≤0.7s、音量 ≤0.18、以指数下滑为主、
  // 低频用 sawtooth/triangle、金属感用 square + 高通噪声、灵性感用 sine 叠五度。
  var SFX = {
    // --- 暴击：比普通命中高一个八度，加一记金属泛音，让「打爆了」立刻听得出来 ---
    crit: function () {
      tone({ frequency: 880, endFrequency: 420, duration: 0.07, volume: 0.1, type: "square" });
      tone({ frequency: 1760, endFrequency: 990, duration: 0.05, volume: 0.05, type: "sine", delay: 0.01 });
      noise({ duration: 0.06, volume: 0.05, highpass: 2400, curve: 2.2 });
    },
    // --- 精英出现：低频膨胀 + 一记不谐和的小二度，制造不安 ---
    elite: function () {
      tone({ frequency: 70, endFrequency: 140, duration: 0.5, volume: 0.13, type: "sawtooth", attack: 0.12, lowpass: 700 });
      tone({ frequency: 208, endFrequency: 220, duration: 0.45, volume: 0.06, type: "triangle", attack: 0.15 });
      noise({ duration: 0.4, volume: 0.05, highpass: 200, curve: 0.6 });
    },
    // --- Boss 阶段转换：主包 bossRoar 的加剧版，三段下坠 + 长噪声压场 ---
    bossStage: function () {
      tone({ frequency: 140, endFrequency: 40, duration: 0.8, volume: 0.17, type: "sawtooth", lowpass: 900 });
      tone({ frequency: 70, endFrequency: 26, duration: 1.1, volume: 0.13, type: "triangle", attack: 0.05 });
      tone({ frequency: 330, endFrequency: 110, duration: 0.4, volume: 0.07, type: "square", delay: 0.08 });
      noise({ duration: 0.9, volume: 0.1, highpass: 90, curve: 0.5 });
    },
    // --- 遗物获得：上行纯四度 + 五度的钟鸣，明亮但不甜 ---
    relic: function () {
      [0, 0.07, 0.15].forEach(function (d, i) {
        var f = [392, 523, 784][i];
        tone({ frequency: f, endFrequency: f * 1.01, duration: 0.5 - i * 0.1, volume: 0.075, type: "sine", attack: 0.01, delay: d });
        tone({ frequency: f * 2, endFrequency: f * 2, duration: 0.22, volume: 0.025, type: "triangle", delay: d });
      });
    },
    // --- 协同激活：两个音同时上滑，制造「合上了」的感觉 ---
    synergy: function () {
      tone({ frequency: 330, endFrequency: 660, duration: 0.42, volume: 0.08, type: "sine", attack: 0.05 });
      tone({ frequency: 495, endFrequency: 990, duration: 0.42, volume: 0.05, type: "triangle", attack: 0.05, detune: 6 });
      noise({ duration: 0.3, volume: 0.03, highpass: 3000, curve: 0.7 });
    },
    // --- 成就解锁：大三和弦 + 高频微光，全曲最亮的一个音，只在这里用 ---
    achievement: function () {
      [523, 659, 784, 1047].forEach(function (f, i) {
        tone({ frequency: f, endFrequency: f, duration: 0.75 - i * 0.08, volume: 0.06, type: "sine", attack: 0.02, delay: i * 0.055 });
      });
      noise({ duration: 0.6, volume: 0.025, highpass: 4200, curve: 0.5, delay: 0.05 });
    },
    // --- 死亡：长下坠 + 心跳停 + 噪声退潮 ---
    death: function () {
      tone({ frequency: 220, endFrequency: 28, duration: 1.6, volume: 0.16, type: "sawtooth", attack: 0.02, lowpass: 800 });
      tone({ frequency: 110, endFrequency: 22, duration: 2.0, volume: 0.11, type: "sine", attack: 0.1 });
      noise({ duration: 1.6, volume: 0.07, highpass: 120, curve: 0.4 });
      tone({ frequency: 55, endFrequency: 40, duration: 0.5, volume: 0.12, type: "triangle", delay: 0.35, attack: 0.01 });
    },
    // --- 锻炉换枪：铁砧敲击。两个错开的方波 + 短促高通噪声 = 金属 clang ---
    anvil: function () {
      tone({ frequency: 1180, endFrequency: 620, duration: 0.16, volume: 0.1, type: "square" });
      tone({ frequency: 1770, endFrequency: 880, duration: 0.1, volume: 0.05, type: "square", delay: 0.012 });
      tone({ frequency: 160, endFrequency: 90, duration: 0.3, volume: 0.09, type: "triangle" });
      noise({ duration: 0.18, volume: 0.07, highpass: 1800, curve: 2.5 });
    },
    // --- 重铸：反向上滑的微光，和 relic 区分开 ---
    reforge: function () {
      tone({ frequency: 180, endFrequency: 720, duration: 0.55, volume: 0.07, type: "triangle", attack: 0.08 });
      tone({ frequency: 270, endFrequency: 1080, duration: 0.5, volume: 0.04, type: "sine", attack: 0.1, detune: -8 });
      noise({ duration: 0.5, volume: 0.03, highpass: 2600, curve: 0.6 });
    },
    // --- 深潜阶级提升 / 解锁：庄重的低音上行 ---
    unlock: function () {
      [147, 220, 294].forEach(function (f, i) {
        tone({ frequency: f, endFrequency: f, duration: 0.9 - i * 0.1, volume: 0.08, type: "triangle", attack: 0.06, delay: i * 0.14 });
      });
    },
    // --- 界面：选择与确认，非常轻 ---
    uiMove: function () {
      tone({ frequency: 520, endFrequency: 520, duration: 0.04, volume: 0.045, type: "square" });
    },
    uiConfirm: function () {
      tone({ frequency: 440, endFrequency: 660, duration: 0.11, volume: 0.06, type: "sine" });
      tone({ frequency: 880, endFrequency: 1320, duration: 0.08, volume: 0.03, type: "triangle", delay: 0.03 });
    },
    uiDeny: function () {
      tone({ frequency: 180, endFrequency: 120, duration: 0.14, volume: 0.07, type: "square" });
    },
    // --- 无尽深潜进入下一层：地面塌陷感 ---
    descend: function () {
      tone({ frequency: 120, endFrequency: 34, duration: 1.2, volume: 0.14, type: "sawtooth", attack: 0.15, lowpass: 600 });
      noise({ duration: 1.1, volume: 0.08, highpass: 70, curve: 0.45 });
      tone({ frequency: 300, endFrequency: 150, duration: 0.6, volume: 0.05, type: "sine", delay: 0.5 });
    },
  };

  // --- 三把深层武器的射击音 ---
  // 主包 shoot() 的音色表没有这三把，全落到 ember 的兜底音。这里补齐，
  // 并且让每把的音色和它的机制对上：镰=挥砍风声，轨炮=充能电流，溯洄弦=双弦回响。
  var DEEP_SHOOT = {
    x_scythe: function () {
      noise({ duration: 0.12, volume: 0.06, highpass: 900, curve: 1.6 });
      tone({ frequency: 300, endFrequency: 120, duration: 0.11, volume: 0.07, type: "sawtooth" });
    },
    x_railcore: function () {
      tone({ frequency: 1200, endFrequency: 260, duration: 0.14, volume: 0.09, type: "square" });
      tone({ frequency: 90, endFrequency: 55, duration: 0.2, volume: 0.07, type: "sine" });
      noise({ duration: 0.1, volume: 0.04, highpass: 3200, curve: 2 });
    },
    x_revenant: function () {
      tone({ frequency: 520, endFrequency: 300, duration: 0.13, volume: 0.06, type: "triangle" });
      tone({ frequency: 347, endFrequency: 200, duration: 0.15, volume: 0.05, type: "triangle", delay: 0.035, detune: -10 });
    },
  };

  // ===========================================================================
  // §4 音乐引擎
  // ===========================================================================
  // 主包的 startAmbience 是单层琶音。这里做成四层，并且按局势实时调整：
  //   低音层（持续）—— 一直在，随层数换根音
  //   琶音层        —— 一直在，音阶随层数从自然小调走向减音阶（越深越不谐和）
  //   打击层        —— 只在战斗中（场上有敌人）出现，敌人越多越密
  //   张力层        —— 玩家残血 或 压迫等级高 时出现的持续高音
  // 速度也随战斗强度变化：480ms/拍 → 最快 300ms/拍。
  var MUSIC = {
    timer: null,
    beat: 0,
    floor: 1,
    intensity: 0,
    lastTick: 0,
  };

  // 每层一套音阶（半音偏移）。越深越暗：自然小调 → 弗里几亚 → 洛克里亚 → 八声减音阶。
  var SCALES = [
    [0, 2, 3, 5, 7, 8, 10],
    [0, 1, 3, 5, 7, 8, 10],
    [0, 1, 3, 5, 6, 8, 10],
    [0, 2, 3, 5, 6, 8, 9],
  ];
  var ROOTS = [55, 49, 43.7, 38.9]; // A1 → G1 → F#1 → D#1，逐层下沉

  function semi(root, n) {
    return root * Math.pow(2, n / 12);
  }

  function musicScene() {
    if (!GAME) return null;
    return GAME.scene.getScene("game");
  }

  // 战斗强度 0..1：敌人数量、玩家残血、压迫等级三者取加权最大
  function computeIntensity() {
    var g = musicScene();
    var s = st();
    if (!g || !s || !g.sys || !g.sys.isActive()) return 0;
    var alive = 0;
    try {
      alive = g.enemies.getChildren().filter(function (e) {
        return e.active;
      }).length;
    } catch (e) {
      alive = 0;
    }
    var byCount = Math.min(1, alive / 8);
    var hpRatio = s.maxHp ? s.hp / s.maxHp : 1;
    var byHp = hpRatio <= 0.34 && alive > 0 ? 0.85 : 0;
    var pr = (s.pressure || 1) / 22;
    return Math.min(1, Math.max(byCount, byHp, pr * 0.7));
  }

  function stopMusic() {
    if (MUSIC.timer) {
      clearTimeout(MUSIC.timer);
      MUSIC.timer = null;
    }
  }

  function startMusic(floor) {
    stopMusic();
    MUSIC.floor = Math.max(1, floor || 1);
    MUSIC.beat = 0;
    schedule();
  }

  function schedule() {
    var target = computeIntensity();
    // 强度平滑，避免一杀完敌人音乐就断崖
    MUSIC.intensity += (target - MUSIC.intensity) * 0.25;
    var i = MUSIC.intensity;
    var period = Math.round(480 - 180 * i);
    tick(i);
    MUSIC.timer = setTimeout(schedule, period);
  }

  function tick(i) {
    if (!FX || !FX.enabled || !FX.context) return;
    var idx = Math.min(SCALES.length - 1, MUSIC.floor - 1);
    var scale = SCALES[idx];
    var root = ROOTS[idx];
    var b = MUSIC.beat;

    // --- 低音层：每 4 拍一记长音，第 8 拍换到五度 ---
    if (b % 4 === 0) {
      var bassNote = b % 8 === 0 ? 0 : 7;
      tone({
        channel: "music",
        frequency: semi(root, bassNote),
        endFrequency: semi(root, bassNote) * 0.99,
        duration: 1.7,
        volume: 0.05 + i * 0.02,
        type: "sine",
        attack: 0.25,
        lowpass: 400,
      });
    }

    // --- 琶音层：八拍一循环，音级按固定花样走 ---
    var pattern = [0, 4, 2, 6, 0, 3, 4, 5];
    var deg = pattern[b % pattern.length];
    var f = semi(root * 4, scale[deg % scale.length]);
    tone({
      channel: "music",
      frequency: f,
      endFrequency: f * 0.985,
      duration: 0.75,
      volume: 0.022 + i * 0.014,
      type: "triangle",
      attack: 0.08,
    });

    // --- 打击层：只在战斗时出现，强度越高越密 ---
    if (i > 0.18) {
      noise({
        channel: "music",
        duration: 0.09,
        volume: 0.02 + i * 0.05,
        highpass: 1600,
        curve: 2.4,
      });
      if (i > 0.5 && b % 2 === 1) {
        noise({ channel: "music", duration: 0.13, volume: 0.03 + i * 0.04, highpass: 120, curve: 2.8 });
      }
    }

    // --- 张力层：残血 / 高压时的持续高音，刻意用小二度制造焦虑 ---
    if (i > 0.62 && b % 8 === 0) {
      tone({
        channel: "music",
        frequency: semi(root * 8, scale[1]),
        endFrequency: semi(root * 8, scale[1]) * 1.004,
        duration: 3.4,
        volume: 0.016 + (i - 0.62) * 0.03,
        type: "sine",
        attack: 1.1,
      });
    }

    MUSIC.beat++;
  }

  // ===========================================================================
  // §5 挂钩
  // ===========================================================================
  function installHooks(P) {
    // 接管环境音乐：主包的 startAmbience/stopAmbience 换成我们的引擎
    kit.wrap(P, "create", function () {
      var g = this;
      FX = g.audioFx;
      // audioFx.unlock() 要等玩家第一次输入，所以这里也等
      var arm = function () {
        if (!FX || !FX.context) return;
        if (!installBus(FX)) return;
        if (FX.__origAmbience === undefined) {
          FX.__origAmbience = FX.startAmbience;
          FX.startAmbience = function (floor) {
            startMusic(floor);
          };
          FX.stopAmbience = function () {
            stopMusic();
          };
        }
        applyVolumes();
        // 主包可能在我们接管之前就已经起过 ambience（那时用的是它自己的单层琶音，
        // 而且 setInterval 还在跑）。接管后立刻停掉旧的、起我们的分层音乐。
        if (FX.musicTimer) {
          try {
            window.clearInterval(FX.musicTimer);
          } catch (e) {
            /* 忽略 */
          }
          FX.musicTimer = null;
        }
        if (!MUSIC.timer) {
          var s2 = st();
          startMusic((s2 && s2.floor) || 1);
        }
      };
      g.input.once("pointerdown", function () {
        g.time.delayedCall(30, arm);
      });
      g.input.keyboard.once("keydown", function () {
        g.time.delayedCall(30, arm);
      });
      // audioFx.context 要等浏览器解锁音频才存在，一次 delayedCall 很可能扑空。
      // 这里持续重试到装上为止（装上后 arm 自身幂等，事件也会自动停）。
      var armTimer = g.time.addEvent({
        delay: 200,
        repeat: 120,
        callback: function () {
          arm();
          if (BUS && FX && FX.__origAmbience !== undefined) armTimer.remove(false);
        },
      });
      // 换房 / 换层时把音乐的层数跟上
      var s = st();
      if (s) MUSIC.floor = s.floor || 1;
    });

    // 深层武器的射击音：主包 shoot() 音色表里没有它们，会落到 ember 兜底。
    kit.wrap(P, "shoot", function (args) {
      var id = args && args[0];
      if (DEEP_SHOOT[id]) DEEP_SHOOT[id]();
    });

    // 暴击：主包 hitEnemy(bullet, enemy) 里暴击是**函数内的局部变量**（`Math.random()<.15 && relics.includes("crit")`，
    // 命中时 s*=2），既不写回敌人也不返回，外面读不到。所以这里用「扣血量 / 子弹伤害」的比值反推：
    // 常规命中比值为 1，暴击为 2。阈值取 1.6 留出其它层改伤害的余量。这是可靠的间接判据，不是猜。
    kit.wrapBefore(P, "hitEnemy", function (args) {
      var e = args && args[1];
      var b = args && args[0];
      this.__audHp = e && typeof e.hp === "number" ? e.hp : null;
      this.__audDmg = b && typeof b.damage === "number" ? b.damage : null;
    });
    kit.wrap(P, "hitEnemy", function (args) {
      var e = args && args[1];
      var hp0 = this.__audHp,
        dmg = this.__audDmg;
      this.__audHp = this.__audDmg = null;
      if (!e || hp0 === null || !dmg || dmg <= 0) return;
      var dealt = hp0 - e.hp;
      if (dealt >= dmg * 1.6) SFX.crit();
    });

    // 精英出现
    kit.wrap(P, "applyEliteAffix", function () {
      SFX.elite();
    });

    // Boss 阶段转换
    kit.wrap(P, "announceBossStage", function () {
      SFX.bossStage();
    });

    // 遗物获得 / 协同激活
    kit.wrapBefore(P, "applyRelic", function () {
      var s = st();
      this.__audSyn = s && s.synergies ? s.synergies.length : 0;
    });
    kit.wrap(P, "applyRelic", function () {
      SFX.relic();
      var s = st();
      var now = s && s.synergies ? s.synergies.length : 0;
      if (now > (this.__audSyn || 0)) {
        var self = this;
        self.time.delayedCall(340, function () {
          SFX.synergy();
        });
      }
    });

    // 换层：无尽深潜的下坠音
    kit.wrapBefore(P, "enterRoom", function () {
      var s = st();
      this.__audFloor = s ? s.floor : 1;
    });
    kit.wrap(P, "enterRoom", function () {
      var s = st();
      if (!s) return;
      if (s.floor !== this.__audFloor) {
        MUSIC.floor = s.floor;
        SFX.descend();
      }
    });
  }

  function installOverHooks() {
    var over = GAME.scene.getScene("gameover");
    if (!over) return;
    var P = Object.getPrototypeOf(over);
    if (P.__audOver) return;
    P.__audOver = true;
    kit.wrap(P, "create", function (args) {
      stopMusic();
      var data = (args && args[0]) || {};
      if (!data.win) SFX.death();
    });
  }

  // ===========================================================================
  // §6 对外接口
  // ===========================================================================
  function boot() {
    GAME = window.__phaserGame;
    kit = window.__abyssKit;
    loadCfg();

    var g = GAME.scene.getScene("game");
    if (g) installHooks(Object.getPrototypeOf(g));
    installOverHooks();

    // 成就解锁的播报音由 meta.js 派发事件驱动，避免两层互相引用
    window.addEventListener("abyss-achievement", function () {
      SFX.achievement();
    });
    window.addEventListener("abyss-forge-used", function () {
      SFX.anvil();
    });
    window.addEventListener("abyss-reforge", function () {
      SFX.reforge();
    });
    window.addEventListener("abyss-meta-unlock", function () {
      SFX.unlock();
    });

    window.__abyssAudio = {
      version: VERSION,
      sfx: SFX,
      play: function (name) {
        if (SFX[name]) {
          SFX[name]();
          return true;
        }
        return false;
      },
      cfg: function () {
        return Object.assign({}, CFG);
      },
      setMusic: function (v) {
        CFG.music = Math.max(0, Math.min(1, v));
        applyVolumes();
        saveCfg();
        return CFG.music;
      },
      setSfx: function (v) {
        CFG.sfx = Math.max(0, Math.min(1, v));
        applyVolumes();
        saveCfg();
        SFX.uiMove();
        return CFG.sfx;
      },
      setMuted: function (v) {
        CFG.muted = !!v;
        applyVolumes();
        saveCfg();
        return CFG.muted;
      },
      music: MUSIC,
      intensity: computeIntensity,
      busReady: function () {
        return !!BUS;
      },
    };
    console.log("[audio] ready " + VERSION);
  }

  var tries = 0;
  (function wait() {
    if (window.__phaserGame && window.__abyssKit && window.__phaserGame.scene.getScene("game")) {
      boot();
      return;
    }
    if (tries++ > 400) {
      console.warn("[audio] 等待主包超时，音频层未启用");
      return;
    }
    setTimeout(wait, 60);
  })();
})();
