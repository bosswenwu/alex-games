/* 深渊圣所 · 美术层 art.js （第三轮 · 第五层）
 * ---------------------------------------------------------------------------
 * 存在的理由（来自一次逐像素的截图审查，结论写在 PROGRESS.md M3）：
 *
 *   主包的**角色 PNG 是高水准的手绘素材**（有体积、有轮廓光、有质感），
 *   但主包与前几轮扩展层画出来的**环境与道具是纯色几何体**：
 *     - 地面 = 纯色格子 + 1px 网格线，没有材质、没有光影；
 *     - 熔渊锻炉的铁砧 = 一个纯色圆 + 一个灰色圆角矩形；
 *     - 面板 = 半透明黑矩形 + 1px 描边。
 *   把这些放在painted PNG 旁边，割裂感非常明显。**这一层就是来补这个差的。**
 *
 * 做法：**不下载任何素材**，全部在运行时用 Canvas2D 程序化生成高精度贴图，
 * 生成一次缓存进 Phaser 的纹理管理器复用（`game.textures`），不逐帧重画。
 * 用的手法和手绘素材同源：多层 FBM 噪声打底 → 方向光明暗 → 边缘暗化(AO) →
 * 轮廓光(rim) → 内发光 → 有序抖动(dither) 收噪点。
 *
 * 章节：
 *   §1 噪声与画布工具（可平铺的周期噪声，保证地砖无缝）
 *   §2 贴图工坊：地面 / 暗角 / 光斑 / 尘埃 / 铁砧 / 熔炉核心 / 面板边框
 *   §3 环境重制：地面材质 + 分层暗角 + 尘埃 + 逐层色调
 *   §4 熔渊锻炉重制
 *   §5 UI 面板重制（供 meta.js 调用的 window.__abyssArt.panel）
 *   §6 特效分层（命中 / 暴击 / 死亡的核心闪光 + 冲击环 + 碎片 + 余烬）
 *   §7 启动
 *
 * 约束：零外部依赖；纹理全缓存；粒子有硬上限；所有新对象都挂进 roomObjects
 * 或自己在 destroy 里清补间，避免主包换房时留下野指针（同 deep-content 的教训）。
 */
(function () {
  "use strict";

  var VERSION = "art-1.0";
  var W = 960;
  var H = 600;
  var WALL = 40; // 主包的墙厚（drawRoom 里的 g）

  var kit = null;
  var GAME = null;
  var Ph = null;

  function st() {
    return (window.__game && window.__game.state) || null;
  }

  // ===========================================================================
  // §1 噪声与画布工具
  // ===========================================================================
  // 可平铺的 value-noise。
  // 第一版用「整数频率正弦叠加」，天然无缝但**各向异性**——截图上直接看出斜向布纹，
  // 像磨砂织物而不是石头。改成格点哈希插值：格点索引对分辨率取模即可环绕，
  // 同样无缝，但噪声是各向同性的，叠 5 个八度就有真实的石粒。
  function hash2(ix, iy, seed) {
    var n = (ix * 374761393 + iy * 668265263 + seed * 1442695040888963407) | 0;
    n = (n ^ (n >>> 13)) * 1274126177;
    n = n ^ (n >>> 16);
    return (n >>> 0) / 4294967296;
  }
  function smooth(t) {
    return t * t * t * (t * (t * 6 - 15) + 10); // quintic，二阶连续，不会有格点棱
  }
  // 返回 fbm(u,v)∈[0,1]，period 为格点数（必须整除，才能首尾相接）
  function makeNoise(seed) {
    return function (u, v, period, octaves) {
      period = period || 8;
      octaves = octaves || 5;
      var acc = 0;
      var norm = 0;
      var amp = 1;
      var per = period;
      for (var o = 0; o < octaves; o++) {
        var x = u * per;
        var y = v * per;
        var x0 = Math.floor(x);
        var y0 = Math.floor(y);
        var fx = smooth(x - x0);
        var fy = smooth(y - y0);
        var xa = ((x0 % per) + per) % per;
        var ya = ((y0 % per) + per) % per;
        var xb = (xa + 1) % per;
        var yb = (ya + 1) % per;
        var sd = seed + o * 1013;
        var v00 = hash2(xa, ya, sd);
        var v10 = hash2(xb, ya, sd);
        var v01 = hash2(xa, yb, sd);
        var v11 = hash2(xb, yb, sd);
        var top = v00 + (v10 - v00) * fx;
        var bot = v01 + (v11 - v01) * fx;
        acc += (top + (bot - top) * fy) * amp;
        norm += amp;
        amp *= 0.5;
        per *= 2;
      }
      return acc / norm;
    };
  }

  // 有序抖动矩阵：把 8bit 量化产生的色带打散成细颗粒，
  // 这是让程序化渐变看起来「有胶片颗粒」而不是「PS 渐变」的关键一步。
  var BAYER = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ];
  function dither(x, y) {
    return (BAYER[y & 3][x & 3] / 16 - 0.5) * 6;
  }

  function clamp255(v) {
    return v < 0 ? 0 : v > 255 ? 255 : v | 0;
  }

  function hex2rgb(h) {
    return [(h >> 16) & 255, (h >> 8) & 255, h & 255];
  }

  var TEXCACHE = {};
  // 取（或生成）一张画布纹理。painter(ctx, imageData, w, h) 里随便画。
  function tex(key, w, h, painter) {
    if (TEXCACHE[key] && GAME.textures.exists(key)) return key;
    if (GAME.textures.exists(key)) GAME.textures.remove(key);
    var ct = GAME.textures.createCanvas(key, w, h);
    var ctx = ct.getContext();
    painter(ctx, w, h);
    ct.refresh();
    TEXCACHE[key] = true;
    return key;
  }

  // ===========================================================================
  // §2 贴图工坊
  // ===========================================================================

  // --- 地面石板：可无缝平铺的 96×96（2×2 块 48px 石板，与主包的 48px 网格对齐）---
  //
  // 走过的弯路（留档，别再犯）：
  //   v1 用「整数频率正弦叠加」的周期噪声 → 各向异性，肉眼是斜向布纹。
  //   v2 换成格点 value-noise 且拿它当高度场打方向光 → 高频噪声 × 方向光 =
  //      高对比斜向条纹，像草席，而且抢镜，把角色 PNG 压下去了。
  //   v3（现在这版）**先结构、后材质**：石板的形状与倒角是按格子算出来的确定性结构，
  //      噪声只做低振幅的斑驳与颗粒。地牢地面本来就该是安静的背景，
  //      对比度控制在 ±14 级以内，让画面的注意力留给角色和特效。
  // 4×4 块（192px 周期）而不是 2×2：2×2 时每 96px 就复现一次，平铺感肉眼可见。
  var CELL = 48;
  var CELLS = 4;
  function stoneTile(key, base, tile, accent, seed) {
    return tex(key, CELL * CELLS, CELL * CELLS, function (ctx, w, h) {
      var img = ctx.createImageData(w, h);
      var d = img.data;
      var nm = makeNoise(seed); // 大块斑驳
      var ng = makeNoise(seed + 7919); // 石粒
      var cb = hex2rgb(base);
      var ct2 = hex2rgb(tile);
      var ca = hex2rgb(accent);

      for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
          var cx = Math.floor(x / CELL);
          var cy = Math.floor(y / CELL);
          // 每块石板一个确定性的基调（同一块内一致，块与块之间有差别）
          var cellRnd = hash2(cx + 17, cy + 23, seed);
          var t = 0.25 + cellRnd * 0.55;
          var r = cb[0] + (ct2[0] - cb[0]) * t;
          var g = cb[1] + (ct2[1] - cb[1]) * t;
          var b = cb[2] + (ct2[2] - cb[2]) * t;

          // 低振幅斑驳：石头的水渍与风化
          var mot = (nm(x / w, y / h, 4, 3) - 0.5) * 16;
          r += mot;
          g += mot;
          b += mot * 1.15;

          // 结构性倒角：左上受光、右下背光，边缘 3px 内做斜面
          var ex = x % CELL;
          var ey = y % CELL;
          var edge = Math.min(ex, CELL - 1 - ex, ey, CELL - 1 - ey);
          // 灰缝宽度带一点噪声扰动，免得像 CAD 画的直线
          var jitter = (ng(x / w, y / h, 24, 2) - 0.5) * 1.6;
          if (edge + jitter <= 1.2) {
            var k = 0.5;
            r *= k;
            g *= k;
            b *= k * 1.14;
          } else if (edge < 6) {
            var e = (6 - edge) / 5;
            // 左边或上边挨着缝 = 受光的倒角，右/下 = 背光
            var lightSide = ex === edge || ey === edge;
            var amt = lightSide ? 20 * e : -16 * e;
            r += amt;
            g += amt;
            b += amt * 1.05;
          }

          // 裂纹：约五分之一的石板上有一道贯穿的细裂
          if (cellRnd > 0.62 && cellRnd < 0.82) {
            var crackAt = 8 + (cellRnd - 0.62) * 160; // 裂纹在块内的位置
            var wob = (nm(x / w, y / h, 26, 2) - 0.5) * 7;
            if (Math.abs(ey - crackAt + wob) < 0.9 && ex > 4 && ex < CELL - 4) {
              r *= 0.62;
              g *= 0.62;
              b *= 0.68;
            }
          }

          // 石粒：细颗粒，振幅很小，只为了破掉平涂感
          var gr = (ng(x / w, y / h, 32, 2) - 0.5) * 9;
          r += gr;
          g += gr;
          b += gr;

          // 矿脉：每块石板最多渗一点强调色，稀疏
          if (cellRnd > 0.78) {
            var vein = nm(x / w, y / h, 8, 2);
            if (vein > 0.6) {
              var m = Math.min(1, (vein - 0.6) / 0.25) * 0.16;
              r += (ca[0] - r) * m;
              g += (ca[1] - g) * m;
              b += (ca[2] - b) * m;
            }
          }

          var dd = dither(x, y);
          var i = (y * w + x) * 4;
          d[i] = clamp255(r + dd);
          d[i + 1] = clamp255(g + dd);
          d[i + 2] = clamp255(b + dd);
          d[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    });
  }

  // --- 分层暗角：中间透明，四周压黑，边角更黑 ---
  function vignetteTex(key) {
    return tex(key, W, H, function (ctx, w, h) {
      ctx.clearRect(0, 0, w, h);
      // 第一层：大范围径向压暗
      var g1 = ctx.createRadialGradient(w / 2, h * 0.46, h * 0.22, w / 2, h * 0.5, h * 0.95);
      g1.addColorStop(0, "rgba(0,0,0,0)");
      g1.addColorStop(0.55, "rgba(4,3,8,0.10)");
      g1.addColorStop(0.82, "rgba(3,2,6,0.34)");
      g1.addColorStop(1, "rgba(2,1,4,0.62)");
      ctx.fillStyle = g1;
      ctx.fillRect(0, 0, w, h);
      // 第二层：四条边的线性压暗，把墙根压实
      var edges = [
        [ctx.createLinearGradient(0, 0, 0, 90), 0, 0, w, 90],
        [ctx.createLinearGradient(0, h, 0, h - 90), 0, h - 90, w, 90],
        [ctx.createLinearGradient(0, 0, 110, 0), 0, 0, 110, h],
        [ctx.createLinearGradient(w, 0, w - 110, 0), w - 110, 0, 110, h],
      ];
      edges.forEach(function (e) {
        e[0].addColorStop(0, "rgba(2,2,5,0.5)");
        e[0].addColorStop(1, "rgba(2,2,5,0)");
        ctx.fillStyle = e[0];
        ctx.fillRect(e[1], e[2], e[3], e[4]);
      });
      // 抖动，避免大面积渐变出色带
      var img = ctx.getImageData(0, 0, w, h);
      var d = img.data;
      for (var y = 0; y < h; y++)
        for (var x = 0; x < w; x++) {
          var i = (y * w + x) * 4;
          d[i + 3] = clamp255(d[i + 3] + dither(x, y));
        }
      ctx.putImageData(img, 0, 0);
    });
  }

  // --- 软光斑：给点光、粒子、尘埃共用 ---
  function glowTex(key, rgb, size) {
    return tex(key, size, size, function (ctx, w, h) {
      var img = ctx.createImageData(w, h);
      var d = img.data;
      var c = hex2rgb(rgb);
      var R = w / 2;
      for (var y = 0; y < h; y++)
        for (var x = 0; x < w; x++) {
          var dx = x - R + 0.5;
          var dy = y - R + 0.5;
          var r = Math.sqrt(dx * dx + dy * dy) / R;
          // 双指数：核心很亮，外圈拖很长的尾巴，像真实的辉光
          var a = r >= 1 ? 0 : Math.pow(1 - r, 2.4) * 0.72 + Math.pow(1 - r, 8) * 0.5;
          var i = (y * w + x) * 4;
          var k = 1 + Math.pow(1 - Math.min(1, r), 6) * 0.6; // 核心过曝
          d[i] = clamp255(c[0] * k);
          d[i + 1] = clamp255(c[1] * k);
          d[i + 2] = clamp255(c[2] * k);
          d[i + 3] = clamp255(a * 255 + dither(x, y) * 0.5);
        }
      ctx.putImageData(img, 0, 0);
    });
  }

  // --- 碎片：不规则的小石片，用于死亡与破坏特效 ---
  function shardTex(key, rgb) {
    return tex(key, 12, 12, function (ctx, w, h) {
      ctx.clearRect(0, 0, w, h);
      var c = hex2rgb(rgb);
      ctx.beginPath();
      ctx.moveTo(6, 0);
      ctx.lineTo(11, 5);
      ctx.lineTo(7, 11);
      ctx.lineTo(1, 7);
      ctx.closePath();
      ctx.fillStyle = "rgb(" + c.join(",") + ")";
      ctx.fill();
      // 一条高光棱，做出体积
      ctx.beginPath();
      ctx.moveTo(6, 1);
      ctx.lineTo(10, 5);
      ctx.lineTo(7, 6);
      ctx.closePath();
      ctx.fillStyle = "rgba(255,255,255,0.42)";
      ctx.fill();
    });
  }

  // --- 铁砧：72×62，正等轴测的锻铁体块 ---
  // 分层：投影 → 底座 → 砧身（上亮下暗的金属渐变）→ 砧角 → 顶面热光 → 轮廓光 → 锈斑噪点
  function anvilTex(key, hot) {
    return tex(key, 72, 62, function (ctx, w, h) {
      ctx.clearRect(0, 0, w, h);
      var c = hex2rgb(hot);

      // 投影
      ctx.save();
      ctx.translate(36, 55);
      ctx.scale(1, 0.32);
      ctx.beginPath();
      ctx.arc(0, 0, 25, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fill();
      ctx.restore();

      function metal(x0, y0, x1, y1, top, bot) {
        var g = ctx.createLinearGradient(x0, y0, x1, y1);
        g.addColorStop(0, top);
        g.addColorStop(0.45, bot);
        g.addColorStop(1, "#15120f");
        return g;
      }

      // 底座（梯形）
      ctx.beginPath();
      ctx.moveTo(20, 44);
      ctx.lineTo(52, 44);
      ctx.lineTo(57, 54);
      ctx.lineTo(15, 54);
      ctx.closePath();
      ctx.fillStyle = metal(0, 44, 0, 54, "#5b5048", "#332c26");
      ctx.fill();

      // 腰身
      ctx.beginPath();
      ctx.moveTo(27, 26);
      ctx.lineTo(45, 26);
      ctx.lineTo(50, 45);
      ctx.lineTo(22, 45);
      ctx.closePath();
      ctx.fillStyle = metal(0, 26, 0, 45, "#6a5d52", "#3a322b");
      ctx.fill();

      // 砧身主体。旧版两侧各一个 7px 小角，在实际尺寸下根本看不出是铁砧（更像祭坛石墩）。
      // 改成真正的铁砧剪影：**左边一只长而尖的鹰嘴角**（占身长近三分之一、明显探出腰身之外），
      // 右边一个带台阶的方尾（heel），中间腰身收窄——这三件事才是「一眼是铁砧」的判据。
      ctx.beginPath();
      ctx.moveTo(22, 20); // 顶面左端
      ctx.lineTo(2, 22.5); // 鹰嘴尖（长、细、微微上翘）
      ctx.lineTo(9, 27);
      ctx.lineTo(20, 29);
      ctx.lineTo(52, 29);
      ctx.lineTo(56, 26); // 方尾下缘的台阶
      ctx.lineTo(68, 26);
      ctx.lineTo(68, 20);
      ctx.closePath();
      ctx.fillStyle = metal(0, 18, 0, 30, "#8b7c6d", "#4a4038");
      ctx.fill();

      // 鹰嘴下方补一道暗影，把角从底座的剪影里剥出来（否则角和腰身糊成一片）
      ctx.beginPath();
      ctx.moveTo(2, 22.5);
      ctx.lineTo(9, 27);
      ctx.lineTo(20, 29);
      ctx.lineTo(20, 31.5);
      ctx.lineTo(6, 27.5);
      ctx.closePath();
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fill();

      // 顶面（受光面）
      ctx.beginPath();
      ctx.moveTo(22, 20);
      ctx.lineTo(68, 20);
      ctx.lineTo(64, 16);
      ctx.lineTo(24, 16);
      ctx.closePath();
      var gt = ctx.createLinearGradient(22, 16, 68, 20);
      gt.addColorStop(0, "#b6a48f");
      gt.addColorStop(0.5, "#9a8974");
      gt.addColorStop(1, "#6d604f");
      ctx.fillStyle = gt;
      ctx.fill();

      // 顶面的热锻辉光：武器色，从中心往两边淡出
      var gh = ctx.createLinearGradient(24, 0, 64, 0);
      gh.addColorStop(0, "rgba(" + c.join(",") + ",0)");
      gh.addColorStop(0.5, "rgba(" + c.join(",") + ",0.85)");
      gh.addColorStop(1, "rgba(" + c.join(",") + ",0)");
      ctx.fillStyle = gh;
      ctx.fillRect(24, 15, 40, 4);

      // 轮廓光：顶棱与左棱各描一道
      ctx.strokeStyle = "rgba(232,215,180,0.55)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(24, 15.5);
      ctx.lineTo(64, 15.5);
      ctx.stroke();
      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.beginPath();
      ctx.moveTo(20, 29.5);
      ctx.lineTo(52, 29.5);
      ctx.stroke();

      // 锈斑 / 锤痕：稀疏噪点，去掉「矢量感」
      var img = ctx.getImageData(0, 0, w, h);
      var d = img.data;
      var n = makeNoise(4242);
      for (var y = 12; y < 56; y++)
        for (var x = 2; x < 70; x++) {
          var i = (y * w + x) * 4;
          if (d[i + 3] < 40) continue;
          var f = (n(x / w, y / h, 10, 3) - 0.5) * 52 + dither(x, y);
          d[i] = clamp255(d[i] + f);
          d[i + 1] = clamp255(d[i + 1] + f * 0.95);
          d[i + 2] = clamp255(d[i + 2] + f * 0.85);
        }
      ctx.putImageData(img, 0, 0);
    });
  }

  // --- 熔炉核心：翻腾的熔渣球 ---
  function forgeCoreTex(key) {
    return tex(key, 128, 128, function (ctx, w, h) {
      ctx.clearRect(0, 0, w, h);
      var img = ctx.createImageData(w, h);
      var d = img.data;
      var n1 = makeNoise(31337);
      var n2 = makeNoise(90210);
      var R = 56;
      for (var y = 0; y < h; y++)
        for (var x = 0; x < w; x++) {
          var dx = x - 64 + 0.5;
          var dy = y - 64 + 0.5;
          var r = Math.sqrt(dx * dx + dy * dy);
          var i = (y * w + x) * 4;
          if (r > R) {
            d[i + 3] = 0;
            continue;
          }
          var u = x / w;
          var v = y / h;
          // 熔渣：低频团块决定「结壳」的黑，高频决定裂缝里的亮
          var f = n1(u, v, 6, 3) * 0.6 + n2(u, v, 18, 3) * 0.4;
          var crust = Math.pow(f, 2.2); // 越大越黑
          var heat = 1 - crust;
          // 球面明暗：左上受光 + 边缘菲涅尔亮边
          var sh = 1 - Math.min(1, (dx + dy + R) / (R * 2)) * 0.45;
          var fres = Math.pow(r / R, 5) * 0.9;
          var t = Math.min(1, heat * sh + fres);
          // 热色阶：暗红 → 橙 → 白热
          var rr, gg, bb;
          if (t < 0.5) {
            var k = t / 0.5;
            rr = 60 + 165 * k;
            gg = 12 + 60 * k;
            bb = 8 + 14 * k;
          } else {
            var k2 = (t - 0.5) / 0.5;
            rr = 225 + 30 * k2;
            gg = 72 + 165 * k2;
            bb = 22 + 170 * k2;
          }
          var dd = dither(x, y);
          d[i] = clamp255(rr + dd);
          d[i + 1] = clamp255(gg + dd);
          d[i + 2] = clamp255(bb + dd);
          d[i + 3] = clamp255((r > R - 3 ? (R - r) / 3 : 1) * 255);
        }
      ctx.putImageData(img, 0, 0);
    });
  }

  // --- 面板：主包菜单同款的描金暗框 ---
  // 主包的框是「#0b0c11 底 + 金色 1px 描边 + 内缩第二道线」，这里保持同一套语言，
  // 只把纯色底换成有噪点的皮革感渐变，四角加上装饰角标。
  function panelTex(key, w, h) {
    return tex(key, w, h, function (ctx) {
      ctx.clearRect(0, 0, w, h);
      // 底：上暗下更暗的竖向渐变
      var g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "rgba(19,16,22,0.965)");
      g.addColorStop(0.5, "rgba(13,11,16,0.975)");
      g.addColorStop(1, "rgba(9,8,12,0.985)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      // 顶部一道极淡的暖光，模拟上方光源打在面板上沿
      var g2 = ctx.createLinearGradient(0, 0, 0, 70);
      g2.addColorStop(0, "rgba(198,160,96,0.10)");
      g2.addColorStop(1, "rgba(198,160,96,0)");
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, w, 70);
      // 噪点：去掉塑料感
      var img = ctx.getImageData(0, 0, w, h);
      var d = img.data;
      var n = makeNoise(7777);
      for (var y = 0; y < h; y++)
        for (var x = 0; x < w; x++) {
          var i = (y * w + x) * 4;
          var f = (n(x / w, y / h, 24, 3) - 0.5) * 14 + dither(x, y) * 0.8;
          d[i] = clamp255(d[i] + f);
          d[i + 1] = clamp255(d[i + 1] + f);
          d[i + 2] = clamp255(d[i + 2] + f * 1.1);
        }
      ctx.putImageData(img, 0, 0);
      // 双线描金
      ctx.strokeStyle = "rgba(198,160,96,0.72)";
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
      ctx.strokeStyle = "rgba(198,160,96,0.26)";
      ctx.strokeRect(5.5, 5.5, w - 11, h - 11);
      // 四角角标
      ctx.strokeStyle = "rgba(226,196,132,0.9)";
      ctx.lineWidth = 2;
      var L = 16;
      [[0, 0, 1, 1], [w, 0, -1, 1], [0, h, 1, -1], [w, h, -1, -1]].forEach(function (c) {
        ctx.beginPath();
        ctx.moveTo(c[0] + c[2] * 2, c[1] + c[3] * (2 + L));
        ctx.lineTo(c[0] + c[2] * 2, c[1] + c[3] * 2);
        ctx.lineTo(c[0] + c[2] * (2 + L), c[1] + c[3] * 2);
        ctx.stroke();
      });
    });
  }

  // ===========================================================================
  // §3 环境重制
  // ===========================================================================
  // 每层一套色调基底：越深越冷、越暗、越毒。阶级高时再整体压暗加红。
  var FLOOR_TONE = [
    { base: 0x2b2733, tile: 0x393343, accent: 0x6d5f8c, seed: 11, fog: 0x2a2338 },
    { base: 0x2f2a26, tile: 0x3e3630, accent: 0x8c6a45, seed: 23, fog: 0x33261c },
    { base: 0x222b30, tile: 0x2c3a41, accent: 0x4d8090, seed: 37, fog: 0x18262c },
    { base: 0x1e1d2c, tile: 0x282640, accent: 0x6a4f9c, seed: 53, fog: 0x1a1430 },
  ];
  function toneOf(floor) {
    return FLOOR_TONE[Math.min(FLOOR_TONE.length - 1, Math.max(0, floor - 1))];
  }

  function dressRoom(g) {
    var s = st();
    var floor = (s && s.floor) || 1;
    var t = toneOf(floor);
    var key = stoneTile("art-stone-" + floor, t.base, t.tile, t.accent, t.seed);

    // 地板材质：铺在主包 Graphics(depth -5) 之上、装饰(depth 1) 之下。
    // 用 TileSprite 而不是 22 张 Image，省 draw call。
    var floorSprite = g.add
      .tileSprite(WALL, WALL, W - WALL * 2, H - WALL * 2, key)
      .setOrigin(0, 0)
      .setDepth(-4)
      .setAlpha(1);
    g.roomObjects.push(floorSprite);

    // 墙面：同一张石材，压暗 + 冷色，做出「墙比地暗」的进深
    var wallTop = g.add.tileSprite(0, 0, W, WALL, key).setOrigin(0, 0).setDepth(-3).setTint(0x4a4658).setAlpha(0.95);
    var wallBot = g.add.tileSprite(0, H - WALL, W, WALL, key).setOrigin(0, 0).setDepth(-3).setTint(0x3a3646).setAlpha(0.95);
    var wallL = g.add.tileSprite(0, 0, WALL, H, key).setOrigin(0, 0).setDepth(-3).setTint(0x413d50).setAlpha(0.95);
    var wallR = g.add.tileSprite(W - WALL, 0, WALL, H, key).setOrigin(0, 0).setDepth(-3).setTint(0x413d50).setAlpha(0.95);
    [wallTop, wallBot, wallL, wallR].forEach(function (o) {
      g.roomObjects.push(o);
    });

    // 墙根 AO：四条内侧的暗带，把地面和墙「粘」起来
    var ao = g.add.graphics().setDepth(-2);
    g.roomObjects.push(ao);
    for (var i = 0; i < 14; i++) {
      var a = 0.055 * (1 - i / 14);
      ao.fillStyle(0x05040a, a);
      ao.fillRect(WALL, WALL + i, W - WALL * 2, 1);
      ao.fillRect(WALL, H - WALL - 1 - i, W - WALL * 2, 1);
      ao.fillRect(WALL + i, WALL, 1, H - WALL * 2);
      ao.fillRect(W - WALL - 1 - i, WALL, 1, H - WALL * 2);
    }

    // 地面反光斑：几处从上方漏下来的光，让地面不是一块死板
    var gk = glowTex("art-glow-warm", 0xffd9a0, 128);
    for (var j = 0; j < 3; j++) {
      var px = Ph.Math.Between(140, 820);
      var py = Ph.Math.Between(120, 480);
      var pool = g.add
        .image(px, py, gk)
        .setDepth(-1)
        .setBlendMode(Ph.BlendModes.ADD)
        .setAlpha(0.055)
        .setScale(Ph.Math.FloatBetween(1.6, 3.2), Ph.Math.FloatBetween(0.7, 1.1));
      g.roomObjects.push(pool);
    }
    dustField(g, t);
    if (Q().vig) mountVignette(g, floor);
  }

  // 尘埃：数量固定 34 粒，纯 tween 驱动，不用粒子系统，销毁时统一杀补间。
  var DUST_MAX = 34;
  function dustField(g, t) {
    var key = glowTex("art-glow-dust", 0xd8cbb0, 32);
    var n = Math.round(DUST_MAX * Q().dust);
    for (var i = 0; i < n; i++) {
      var m = g.add
        .image(Ph.Math.Between(50, 910), Ph.Math.Between(50, 550), key)
        .setDepth(6)
        .setBlendMode(Ph.BlendModes.ADD)
        .setAlpha(Ph.Math.FloatBetween(0.05, 0.2))
        .setScale(Ph.Math.FloatBetween(0.1, 0.32));
      g.roomObjects.push(m);
      (function (obj) {
        var tw = g.tweens.add({
          targets: obj,
          y: obj.y - Ph.Math.Between(40, 130),
          x: obj.x + Ph.Math.Between(-40, 40),
          alpha: 0,
          duration: Ph.Math.Between(4200, 9000),
          delay: Ph.Math.Between(0, 4000),
          repeat: -1,
        });
        obj.once("destroy", function () {
          tw.remove();
        });
      })(m);
    }
  }

  // 暗角：贴在 UI 之下、所有场景内容之上（depth 55），不随相机滚动。
  function mountVignette(g, floor) {
    var key = vignetteTex("art-vignette");
    var v = g.add.image(0, 0, key).setOrigin(0, 0).setDepth(55).setScrollFactor(0);
    g.roomObjects.push(v);
    // 逐层色调雾：越深越浓，深潜阶级高时再叠一层血色
    var t = toneOf(floor);
    var m = window.__abyssMeta ? window.__abyssMeta.mods() : null;
    var asc = m ? Math.min(1, (m.pressure || 0) / 3) : 0;
    var fog = g.add
      .rectangle(0, 0, W, H, t.fog, 0.06 + (floor - 1) * 0.03)
      .setOrigin(0, 0)
      .setDepth(54)
      .setScrollFactor(0)
      .setBlendMode(Ph.BlendModes.MULTIPLY);
    g.roomObjects.push(fog);
    if (asc > 0) {
      var blood = g.add
        .image(0, 0, key)
        .setOrigin(0, 0)
        .setDepth(56)
        .setScrollFactor(0)
        .setTint(0x8c1e22)
        .setAlpha(0.1 + asc * 0.22)
        .setBlendMode(Ph.BlendModes.ADD);
      g.roomObjects.push(blood);
    }
  }

  // ===========================================================================
  // §4 熔渊锻炉重制
  // ===========================================================================
  // deep-content 的 buildForge 画的是「纯色圆 + 灰圆角矩形」。
  // 这里在它之后运行：把那些几何体隐藏掉，换成程序化贴图，并补上动态点光。
  function redressForge(g) {
    var f = g.__forge;
    if (!f || g.__artForged === f) return;
    g.__artForged = f;

    // --- 中央熔炉 ---
    var coreKey = forgeCoreTex("art-forge-core");
    var glowK = glowTex("art-glow-forge", 0xff9a48, 256);
    var lamp = g.add
      .image(480, 168, glowK)
      .setDepth(2)
      .setBlendMode(Ph.BlendModes.ADD)
      .setAlpha(0.34)
      .setScale(2.5);
    var core = g.add.image(480, 168, coreKey).setDepth(3).setScale(0.78);
    var coreGlow = g.add
      .image(480, 168, coreKey)
      .setDepth(4)
      .setBlendMode(Ph.BlendModes.ADD)
      .setAlpha(0.32)
      .setScale(0.86);
    [lamp, core, coreGlow].forEach(function (o) {
      g.roomObjects.push(o);
      o.once("destroy", function () {
        g.tweens.killTweensOf(o);
      });
    });
    // deep-content 在熔炉正中放了一个「熔」字，正好压在我们的高亮熔渣球上，白字压亮球读不出来。
    // 处理：把它挪到炉体下方的台座位置，垫一块暗底 + 描一圈暗边，深度抬到熔渣之上。
    g.children.list.forEach(function (o) {
      if (o && o.type === "Text" && o.text === "熔" && !o.__artMoved) {
        o.__artMoved = true;
        o.setPosition(480, 236).setDepth(7);
        o.setColor("#ffd9a8");
        if (o.setStroke) o.setStroke("#241408", 4);
        var plate = g.add
          .image(480, 236, glowTex("art-glow-plate", 0x140c06, 96))
          .setDepth(6)
          .setAlpha(0.85)
          .setScale(0.62, 0.5);
        g.roomObjects.push(plate);
      }
    });

    // 熔渣翻腾：核心慢转 + 叠加层反向转 + 点光呼吸
    g.tweens.add({ targets: core, angle: 360, duration: 26000, repeat: -1 });
    g.tweens.add({ targets: coreGlow, angle: -360, duration: 17000, repeat: -1 });
    g.tweens.add({
      targets: lamp,
      alpha: 0.52,
      scaleX: 2.9,
      scaleY: 2.9,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    // 炉口余烬：向上飘的火星，硬上限 18
    var ember = glowTex("art-glow-ember", 0xffb765, 24);
    for (var i = 0; i < 18; i++) {
      (function (i) {
        var e = g.add
          .image(480, 168, ember)
          .setDepth(5)
          .setBlendMode(Ph.BlendModes.ADD)
          .setScale(0.3)
          .setAlpha(0);
        g.roomObjects.push(e);
        var tw = g.tweens.add({
          targets: e,
          x: 480 + Ph.Math.Between(-46, 46),
          y: 168 - Ph.Math.Between(60, 130),
          alpha: { from: 0.9, to: 0 },
          scale: { from: 0.42, to: 0.08 },
          duration: Ph.Math.Between(1400, 2600),
          delay: i * 130,
          repeat: -1,
          onRepeat: function () {
            e.x = 480 + Ph.Math.Between(-16, 16);
            e.y = 168;
          },
        });
        e.once("destroy", function () {
          tw.remove();
        });
      })(i);
    }

    // --- 三座铁砧 ---
    var D = window.__deep;
    f.anvils.forEach(function (a) {
      var wd = (D && D.tables.weapons[a.id]) || { color: 0xc8a86a };
      a.pad.setAlpha(0.0); // 主包的纯色圆退场，只留碰撞判定用的坐标
      // 地面的武器色投光
      var lit = g.add
        .image(a.x, a.y + 6, glowTex("art-glow-w-" + a.id, wd.color, 160))
        .setDepth(2)
        .setBlendMode(Ph.BlendModes.ADD)
        .setAlpha(0.22)
        .setScale(1.05, 0.5);
      // 石台
      // 石台：旧版是「两个椭圆 + 1px 矢量描边」，凑近看很廉价。
      // 改成四层错位椭圆做出**石唇的厚度**：暗侧地基 → 侧壁 → 台面 → 受光的上棱，
      // 最后用一道低透明度的武器色宽弧代替细描边（宽线不会像 1px 那样刺眼）。
      var slab = g.add.graphics().setDepth(2);
      slab.fillStyle(0x100d0b, 0.55).fillEllipse(a.x, a.y + 23, 98, 28); // 落地暗影
      slab.fillStyle(0x241f1b, 0.95).fillEllipse(a.x, a.y + 21, 92, 26); // 侧壁（背光）
      slab.fillStyle(0x362e27, 1).fillEllipse(a.x, a.y + 19, 89, 24);
      slab.fillStyle(0x3f372f, 1).fillEllipse(a.x, a.y + 17, 86, 22); // 台面
      slab.fillStyle(0x4c4238, 1).fillEllipse(a.x - 3, a.y + 15.5, 74, 17); // 左上受光
      slab.lineStyle(3, wd.color, 0.22).strokeEllipse(a.x, a.y + 17, 86, 22);
      var an = g.add.image(a.x, a.y + 2, anvilTex("art-anvil-" + a.id, wd.color)).setDepth(4);
      [lit, slab, an].forEach(function (o) {
        g.roomObjects.push(o);
        o.once("destroy", function () {
          g.tweens.killTweensOf(o);
        });
      });
      g.tweens.add({ targets: lit, alpha: 0.34, duration: 1200 + Math.random() * 700, yoyo: true, repeat: -1 });
      // 砧上悬浮的武器印记
      var mark = g.add
        .image(a.x, a.y - 24, glowTex("art-glow-w-" + a.id, wd.color, 160))
        .setDepth(5)
        .setBlendMode(Ph.BlendModes.ADD)
        .setAlpha(0.5)
        .setScale(0.34);
      g.roomObjects.push(mark);
      var tw2 = g.tweens.add({ targets: mark, y: a.y - 32, duration: 1400, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      mark.once("destroy", function () {
        tw2.remove();
      });
    });

    // --- 重铸台 ---
    if (f.reforge) {
      var r = f.reforge;
      var rg = g.add
        .image(r.x, r.y, glowTex("art-glow-reforge", 0x9a7fd0, 192))
        .setDepth(2)
        .setBlendMode(Ph.BlendModes.ADD)
        .setAlpha(0.24)
        .setScale(0.9, 0.55);
      var ring = g.add.graphics().setDepth(3);
      ring.fillStyle(0x1d1830, 0.9).fillEllipse(r.x, r.y + 12, 76, 24);
      ring.lineStyle(2, 0x9a7fd0, 0.7).strokeEllipse(r.x, r.y + 12, 76, 24);
      ring.lineStyle(1, 0xc7b0ff, 0.35).strokeEllipse(r.x, r.y + 12, 58, 17);
      var orb = g.add
        .image(r.x, r.y - 6, glowTex("art-glow-orb", 0xc7b0ff, 128))
        .setDepth(5)
        .setBlendMode(Ph.BlendModes.ADD)
        .setAlpha(0.65)
        .setScale(0.42);
      [rg, ring, orb].forEach(function (o) {
        g.roomObjects.push(o);
        o.once("destroy", function () {
          g.tweens.killTweensOf(o);
        });
      });
      g.tweens.add({ targets: orb, y: r.y - 16, scale: 0.5, duration: 1700, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    }
  }

  // ===========================================================================
  // §5 UI 面板（导出给 meta.js 用）
  // ===========================================================================
  // 主包的面板语言：暗底 + 金线 + 角标 + 楷体标题。这里做成一个可复用的绘制器。
  function panel(sc, x, y, w, h, title) {
    var key = panelTex("art-panel-" + w + "x" + h, w, h);
    var out = { objects: [] };
    var bg = sc.add.image(x, y, key).setOrigin(0.5);
    out.objects.push(bg);
    out.bg = bg;
    if (title) {
      var t = sc.add
        .text(x, y - h / 2 + 22, title, {
          fontFamily: "ZCOOL XiaoWei, KaiTi, STKaiti, Songti SC, serif",
          fontSize: "24px",
          color: "#efdcae",
        })
        .setOrigin(0.5, 0.5);
      // 标题下的分隔金线，两端渐隐
      var line = sc.add.graphics();
      for (var i = 0; i < 3; i++) {
        line.fillStyle(0xc6a060, 0.5 - i * 0.16);
        line.fillRect(x - w / 2 + 40 + i * 6, y - h / 2 + 40 + i, w - 80 - i * 12, 1);
      }
      out.objects.push(t, line);
      out.title = t;
    }
    return out;
  }

  // ===========================================================================
  // §6 特效分层
  // ===========================================================================
  // 主包 / enhance 的命中反馈是闪白 + 顿帧。这里补三层：
  // 核心过曝闪光（1 帧）→ 冲击环（扩散淡出）→ 碎片与余烬（带重力）。
  var FX_BUDGET = 0; // 同时存活的特效对象数，硬上限
  var FX_MAX = 160;
  // 画质档位（由 ui.js 写入 window.__abyssQuality）：
  //   fx  —— 特效预算与碎片数量的倍率，0 = 完全关闭爆发特效
  //   dust—— 尘埃粒子倍率
  //   vig —— 是否画分层暗角与色雾（低配下这几张大图最吃填充率）
  function Q() {
    return window.__abyssQuality || { fx: 1, dust: 1, vig: true };
  }

  function burst(g, x, y, color, power) {
    var q = Q();
    if (!Ph || q.fx <= 0 || FX_BUDGET > FX_MAX * q.fx) return;
    power = power || 1;
    var track = [];
    function reg(o) {
      FX_BUDGET++;
      track.push(o);
      o.once("destroy", function () {
        FX_BUDGET--;
        g.tweens.killTweensOf(o);
      });
      return o;
    }

    // 1) 核心闪光：极亮、极短，负责「打中了」的瞬时读数
    var core = reg(
      g.add
        .image(x, y, glowTex("art-glow-white", 0xffffff, 96))
        .setDepth(30)
        .setBlendMode(Ph.BlendModes.ADD)
        .setScale(0.2 * power)
    );
    g.tweens.add({ targets: core, scale: 0.62 * power, alpha: 0, duration: 130, onComplete: function () { core.destroy(); } });

    // 2) 冲击环：细环快速扩散，给空间感
    var ring = reg(g.add.circle(x, y, 6).setDepth(29));
    ring.setStrokeStyle(2, color, 0.9);
    g.tweens.add({
      targets: ring,
      radius: 26 * power,
      alpha: 0,
      duration: 260,
      ease: "Cubic.easeOut",
      onComplete: function () { ring.destroy(); },
    });

    // 3) 碎片：带重力的抛射，落地前淡出
    var n = Math.min(7, 3 + Math.round(power * 2));
    var sk = shardTex("art-shard-" + color, color);
    for (var i = 0; i < n; i++) {
      var ang = Math.random() * Math.PI * 2;
      var dist = 18 + Math.random() * 26 * power;
      var sp = reg(
        g.add.image(x, y, sk).setDepth(28).setScale(0.6 + Math.random() * 0.6).setAngle(Math.random() * 360)
      );
      (function (sp, ang, dist) {
        g.tweens.add({
          targets: sp,
          x: x + Math.cos(ang) * dist,
          y: y + Math.sin(ang) * dist + 16,
          angle: sp.angle + Ph.Math.Between(-260, 260),
          alpha: 0,
          scale: 0.15,
          duration: 320 + Math.random() * 220,
          ease: "Quad.easeIn",
          onComplete: function () { sp.destroy(); },
        });
      })(sp, ang, dist);
    }

    // 4) 余烬：慢速上飘的小火星，把画面「余味」拉长
    var ek = glowTex("art-glow-ember", 0xffb765, 24);
    for (var j = 0; j < Math.min(5, 2 + power); j++) {
      var em = reg(
        g.add.image(x, y, ek).setDepth(27).setBlendMode(Ph.BlendModes.ADD).setScale(0.25).setAlpha(0.85)
      );
      (function (em) {
        g.tweens.add({
          targets: em,
          x: em.x + Ph.Math.Between(-26, 26),
          y: em.y - Ph.Math.Between(24, 58),
          alpha: 0,
          scale: 0.05,
          duration: 620 + Math.random() * 420,
          onComplete: function () { em.destroy(); },
        });
      })(em);
    }
  }

  function installFxHooks(P) {
    // 击杀：全套分层
    kit.wrap(P, "killEnemy", function (args) {
      var e = args[0];
      if (!e) return;
      burst(this, e.x, e.y, e.affix ? 0xffcf7a : 0xd05a4a, e.kind === "boss" ? 3 : e.affix ? 2 : 1);
    });
    // 命中：只出核心闪光 + 小环，避免刷屏
    kit.wrap(P, "hitEnemy", function (args) {
      var e = args[1] || args[0];
      if (!e || !e.x || FX_BUDGET > FX_MAX * 0.7 * Q().fx) return;
      if (Math.random() > 0.55) return; // 采样，控制密度
      var g = this;
      var f = g.add
        .image(e.x, e.y, glowTex("art-glow-white", 0xffffff, 96))
        .setDepth(30)
        .setBlendMode(Ph.BlendModes.ADD)
        .setScale(0.14)
        .setAlpha(0.85);
      FX_BUDGET++;
      f.once("destroy", function () { FX_BUDGET--; });
      g.tweens.add({ targets: f, scale: 0.3, alpha: 0, duration: 110, onComplete: function () { f.destroy(); } });
    });
    // Boss 阶段转换：大冲击 + 屏幕级闪光
    kit.wrap(P, "announceBossStage", function () {
      var g = this;
      var b = null;
      g.enemies.getChildren().forEach(function (e) {
        if (e.active && e.kind === "boss") b = e;
      });
      if (!b) return;
      burst(g, b.x, b.y, 0xffe2a0, 3);
      var w = g.add
        .circle(b.x, b.y, 20)
        .setDepth(31)
        .setStrokeStyle(3, 0xffd98a, 0.9);
      g.tweens.add({ targets: w, radius: 260, alpha: 0, duration: 620, ease: "Cubic.easeOut", onComplete: function () { w.destroy(); } });
    });
  }

  // ===========================================================================
  // §7 启动
  // ===========================================================================
  function installGameHooks(P) {
    // drawRoom 之后铺材质：此时 roomObjects 已被清空重建，挂进去会随换房一起销毁
    kit.wrap(P, "drawRoom", function () {
      try {
        dressRoom(this);
      } catch (e) {
        console.warn("[art] dressRoom failed", e);
      }
    });
    // 锻炉是 deep-content 在 enterRoom 的 after 钩子里建的；
    // art.js 排在 deep-content 之后加载，所以这里的 after 钩子一定跑在它后面。
    kit.wrap(P, "enterRoom", function () {
      var g = this;
      g.__artForged = null;
      g.time.delayedCall(0, function () {
        try {
          redressForge(g);
        } catch (e) {
          console.warn("[art] redressForge failed", e);
        }
      });
    });
    installFxHooks(P);
  }

  function boot() {
    GAME = window.__phaserGame;
    kit = window.__abyssKit;
    Ph = (window.__deep && window.__deep.phaser) || window.Phaser;
    if (!Ph) {
      console.warn("[art] 拿不到 Phaser 命名空间，美术层未启用");
      return;
    }
    var g = GAME.scene.getScene("game");
    if (g) installGameHooks(Object.getPrototypeOf(g));

    window.__abyssArt = {
      version: VERSION,
      panel: panel,
      glowTex: glowTex,
      panelTex: panelTex,
      stoneTile: stoneTile,
      burst: burst,
      tone: toneOf,
      fxBudget: function () {
        return FX_BUDGET;
      },
      cached: function () {
        return Object.keys(TEXCACHE);
      },
    };
    console.log("[art] ready " + VERSION);
  }

  var tries = 0;
  (function wait() {
    if (window.__phaserGame && window.__abyssKit && window.__phaserGame.scene.getScene("game")) {
      boot();
      return;
    }
    if (tries++ > 400) {
      console.warn("[art] 等待主包超时，美术层未启用");
      return;
    }
    setTimeout(wait, 60);
  })();
})();
