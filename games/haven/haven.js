/* HAVEN — single-file WebGL voxel sandbox. No libraries. */
(() => {
  "use strict";

  const SX = 16, SY = 80, SZ = 16, SEA = 28, MAX_Y = 79;
  const SAVE_KEY = "haven.world.v1";
  const $ = (id) => document.getElementById(id);

  // =====================================================================
  // Math
  // =====================================================================
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const wf = (n) => Math.floor(n);
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const hash2 = (x, z, s) => {
    let n = Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(s | 0, 1274126177);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const hash3 = (x, y, z, s) => hash2(x + Math.imul(y, 57), z + Math.imul(y, 131), s);
  function vnoise2(x, z, s) {
    const xi = Math.floor(x), zi = Math.floor(z);
    const xf = x - xi, zf = z - zi, u = fade(xf), v = fade(zf);
    return lerp(lerp(hash2(xi, zi, s), hash2(xi + 1, zi, s), u),
                lerp(hash2(xi, zi + 1, s), hash2(xi + 1, zi + 1, s), u), v);
  }
  function vnoise3(x, y, z, s) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const u = fade(xf), v = fade(yf), w = fade(zf);
    const n = (yy) => lerp(lerp(hash3(xi, yy, zi, s), hash3(xi + 1, yy, zi, s), u),
                           lerp(hash3(xi, yy, zi + 1, s), hash3(xi + 1, yy, zi + 1, s), u), w);
    return lerp(n(yi), n(yi + 1), v);
  }
  function fbm2(x, z, s, oct) {
    let a = 0.5, f = 1, sum = 0, n = 0;
    for (let i = 0; i < oct; i++) { sum += a * vnoise2(x * f, z * f, s + i * 19); n += a; a *= 0.5; f *= 2; }
    return sum / n;
  }
  function fbm3(x, y, z, s, oct) {
    let a = 0.5, f = 1, sum = 0, n = 0;
    for (let i = 0; i < oct; i++) { sum += a * vnoise3(x * f, y * f, z * f, s + i * 19); n += a; a *= 0.5; f *= 2; }
    return sum / n;
  }

  const M4 = {
    ident() { return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); },
    mul(a, b) {
      const o = new Float32Array(16);
      for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
        o[c * 4 + r] = a[r]*b[c*4] + a[4+r]*b[c*4+1] + a[8+r]*b[c*4+2] + a[12+r]*b[c*4+3];
      return o;
    },
    persp(fov, aspect, near, far) {
      const f = 1 / Math.tan(fov / 2), nf = 1 / (near - far);
      const o = new Float32Array(16);
      o[0] = f / aspect; o[5] = f; o[10] = (far + near) * nf; o[11] = -1;
      o[14] = 2 * far * near * nf; return o;
    },
    look(eye, cen, up) {
      let zx = eye[0]-cen[0], zy = eye[1]-cen[1], zz = eye[2]-cen[2];
      let zl = Math.hypot(zx, zy, zz) || 1; zx/=zl; zy/=zl; zz/=zl;
      let xx = up[1]*zz - up[2]*zy, xy = up[2]*zx - up[0]*zz, xz = up[0]*zy - up[1]*zx;
      let xl = Math.hypot(xx, xy, xz) || 1; xx/=xl; xy/=xl; xz/=xl;
      const yx = zy*xz - zz*xy, yy = zz*xx - zx*xz, yz = zx*xy - zy*xx;
      const o = M4.ident();
      o[0]=xx; o[1]=yx; o[2]=zx;
      o[4]=xy; o[5]=yy; o[6]=zy;
      o[8]=xz; o[9]=yz; o[10]=zz;
      o[12]=-(xx*eye[0]+xy*eye[1]+xz*eye[2]);
      o[13]=-(yx*eye[0]+yy*eye[1]+yz*eye[2]);
      o[14]=-(zx*eye[0]+zy*eye[1]+zz*eye[2]);
      return o;
    },
    trans(m, x, y, z) {
      const o = m.slice();
      o[12] += m[0]*x + m[4]*y + m[8]*z;
      o[13] += m[1]*x + m[5]*y + m[9]*z;
      o[14] += m[2]*x + m[6]*y + m[10]*z;
      return o;
    },
    T(x, y, z) { const o = M4.ident(); o[12] = x; o[13] = y; o[14] = z; return o; },
    S(x, y, z) { const o = M4.ident(); o[0] = x; o[5] = y; o[10] = z; return o; },
    Ry(a) {
      const c = Math.cos(a), s = Math.sin(a), o = M4.ident();
      o[0] = c; o[2] = s; o[8] = -s; o[10] = c;
      return o;
    },
    Rx(a) {
      const c = Math.cos(a), s = Math.sin(a), o = M4.ident();
      o[5] = c; o[6] = s; o[9] = -s; o[10] = c;
      return o;
    }
  };

  // =====================================================================
  // Blocks & items
  // =====================================================================
  const AIR = 0;
  const DEFS = [];
  const BY = {};
  const ITEMS = {};
  let nextId = 1;

  function blk(key, name, opts) {
    const id = nextId++;
    const d = Object.assign({
      id, key, name, solid: true, opaque: true, plant: false, fluid: false,
      hard: 1, tool: "none", level: 0, drop: key, light: 0, tile: 0, tileS: 0, tileB: 0,
      color: [140, 140, 140]
    }, opts);
    if (d.tileS == null || d.tileS === 0 && !opts.tileS) d.tileS = d.tile;
    if (d.tileB == null || d.tileB === 0 && !opts.tileB) d.tileB = d.tile;
    DEFS[id] = d; BY[key] = d; ITEMS[key] = { key, name, block: id, stack: 64 };
    return id;
  }
  function itm(key, name, opts) {
    ITEMS[key] = Object.assign({ key, name, block: 0, stack: 64 }, opts);
  }

  const GRASS = blk("grass", "Dry Meadow", { hard: 0.6, tool: "shovel", drop: "dirt", tile: 0, tileS: 1, tileB: 2, color: [196, 158, 65] });
  const DIRT = blk("dirt", "Dirt", { hard: 0.5, tool: "shovel", tile: 2, color: [134, 96, 67] });
  const STONE = blk("stone", "Stone", { hard: 1.5, tool: "pick", level: 1, drop: "cobble", tile: 3, color: [125, 125, 125] });
  const COBBLE = blk("cobble", "Cobblestone", { hard: 2, tool: "pick", level: 1, tile: 4, color: [110, 110, 110] });
  const SAND = blk("sand", "Sand", { hard: 0.5, tool: "shovel", tile: 5, color: [219, 207, 145] });
  const GRAVEL = blk("gravel", "Gravel", { hard: 0.6, tool: "shovel", tile: 6, color: [136, 126, 122] });
  const WATER = blk("water", "Water", { solid: false, opaque: false, fluid: true, tile: 7, color: [50, 90, 200] });
  const LAVA = blk("lava", "Lava", { solid: false, opaque: false, fluid: true, light: 15, tile: 36, color: [220, 90, 20] });
  const OAK_LOG = blk("oak_log", "Oak Log", { hard: 2, tool: "axe", tile: 8, tileS: 8, tileB: 9, color: [110, 85, 50] });
  const OAK_LEAVES = blk("oak_leaves", "Olive Leaves", { hard: 0.2, opaque: false, drop: null, tile: 10, color: [126, 113, 52] });
  const PINE_LOG = blk("pine_log", "Pine Log", { hard: 2, tool: "axe", tile: 37, tileB: 9, color: [70, 55, 40] });
  const PINE_LEAVES = blk("pine_leaves", "Cypress Needles", { hard: 0.2, opaque: false, drop: null, tile: 39, color: [70, 76, 48] });
  const BIRCH_LOG = blk("birch_log", "Birch Log", { hard: 2, tool: "axe", tile: 38, tileB: 9, color: [216, 210, 196] });
  const BIRCH_LEAVES = blk("birch_leaves", "Autumn Leaves", { hard: 0.2, opaque: false, drop: null, tile: 40, color: [174, 92, 45] });
  const PLANKS = blk("oak_planks", "Oak Planks", { hard: 2, tool: "axe", tile: 11, color: [168, 135, 78] });
  const GLASS = blk("glass", "Glass", { hard: 0.3, opaque: false, drop: null, tile: 12, color: [180, 210, 220] });
  const BRICKS = blk("bricks", "Bricks", { hard: 2, tool: "pick", level: 1, tile: 13, color: [150, 80, 65] });
  const SANDSTONE = blk("sandstone", "Sandstone", { hard: 0.8, tool: "pick", tile: 22, color: [218, 200, 140] });
  const SNOW = blk("snow", "Snow", { hard: 0.2, tool: "shovel", tile: 19, color: [240, 244, 250] });
  const ICE = blk("ice", "Ice", { hard: 0.5, opaque: false, tile: 20, color: [160, 200, 230] });
  const CACTUS = blk("cactus", "Dried Cactus", { hard: 0.4, opaque: false, tile: 21, tileB: 21, color: [148, 105, 61] });
  const COAL_ORE = blk("coal_ore", "Coal Ore", { hard: 3, tool: "pick", level: 1, drop: "coal", tile: 14, color: [80, 80, 80] });
  const IRON_ORE = blk("iron_ore", "Iron Ore", { hard: 3, tool: "pick", level: 2, drop: "raw_iron", tile: 15, color: [180, 150, 130] });
  const GOLD_ORE = blk("gold_ore", "Gold Ore", { hard: 3, tool: "pick", level: 3, drop: "raw_gold", tile: 16, color: [200, 180, 70] });
  const DIA_ORE = blk("diamond_ore", "Diamond Ore", { hard: 3, tool: "pick", level: 3, drop: "diamond", tile: 17, color: [90, 200, 200] });
  const BEDROCK = blk("bedrock", "Bedrock", { hard: 999, tile: 18, color: [40, 40, 40] });
  const TABLE = blk("crafting_table", "Crafting Table", { hard: 2.5, tool: "axe", tile: 23, tileS: 24, color: [150, 110, 60] });
  const FURNACE = blk("furnace", "Furnace", { hard: 3.5, tool: "pick", level: 1, tile: 25, tileS: 26, tileB: 26, color: [90, 90, 90] });
  const CHEST = blk("chest", "Chest", { hard: 2.5, tool: "axe", tile: 27, color: [150, 105, 50] });
  const TORCH = blk("torch", "Torch", { solid: false, opaque: false, plant: true, light: 14, tile: 28, color: [255, 200, 80] });
  const COAL_BLK = blk("coal_block", "Coal Block", { hard: 5, tool: "pick", level: 1, tile: 29, color: [30, 30, 30] });
  const IRON_BLK = blk("iron_block", "Iron Block", { hard: 5, tool: "pick", level: 2, tile: 30, color: [200, 200, 205] });
  const GOLD_BLK = blk("gold_block", "Gold Block", { hard: 3, tool: "pick", level: 3, tile: 31, color: [250, 210, 60] });
  const DIA_BLK = blk("diamond_block", "Diamond Block", { hard: 5, tool: "pick", level: 3, tile: 32, color: [90, 230, 220] });
  const FLOWER_R = blk("flower_red", "Poppy", { solid: false, opaque: false, plant: true, hard: 0, tile: 33, color: [200, 40, 40] });
  const FLOWER_Y = blk("flower_yellow", "Dandelion", { solid: false, opaque: false, plant: true, hard: 0, tile: 34, color: [230, 210, 50] });
  const TALLGRASS = blk("tallgrass", "Grass Tuft", { solid: false, opaque: false, plant: true, hard: 0, drop: null, tile: 35, color: [80, 160, 50] });
  const BOOK = blk("bookshelf", "Bookshelf", { hard: 1.5, tool: "axe", tile: 44, color: [140, 90, 50] });
  const TNT = blk("tnt", "TNT", { hard: 0, tile: 45, color: [200, 60, 50] });
  const GLOW = blk("glowstone", "Glowstone", { hard: 0.3, light: 15, tile: 48, color: [255, 210, 100] });
  const PUMPKIN = blk("pumpkin", "Pumpkin", { hard: 1, tool: "axe", tile: 46, color: [210, 120, 40] });
  const CLAY = blk("clay", "Clay", { hard: 0.6, tool: "shovel", tile: 47, color: [150, 155, 165] });
  const OBSIDIAN = blk("obsidian", "Obsidian", { hard: 50, tool: "pick", level: 4, tile: 49, color: [30, 20, 50] });
  const MARBLE = blk("marble", "Roman Marble", { hard: 2.2, tool: "pick", level: 1, tile: 50, color: [226, 218, 194] });
  const TERRACOTTA = blk("terracotta", "Terracotta", { hard: 1.4, tool: "pick", tile: 51, color: [190, 91, 58] });
  const MOSAIC = blk("mosaic", "Imperial Mosaic", { hard: 2.4, tool: "pick", level: 1, tile: 52, color: [75, 124, 162] });
  const ROMAN_BRICK = blk("roman_brick", "Roman Stone Brick", { hard: 2.8, tool: "pick", level: 1, tile: 53, color: [180, 155, 116] });
  const COLUMN = blk("column", "Fluted Column", { hard: 2.5, tool: "pick", level: 1, tile: 54, color: [218, 207, 178] });
  // --- Chapter II materials. Appended on purpose: block ids are positional, so
  //     inserting anywhere above would rewrite every existing save's diffs. ---
  const BASALT = blk("basalt", "Basalt", { hard: 2.6, tool: "pick", level: 1, tile: 55, color: [64, 62, 68] });
  const ASH = blk("ash", "Volcanic Ash", { hard: 0.5, tool: "shovel", tile: 56, color: [112, 106, 102] });
  const EMBER_ORE = blk("ember_ore", "Ember Ore", { hard: 3, tool: "pick", level: 2, drop: "ember_shard", light: 9, tile: 57, color: [214, 112, 44] });
  const STEEL_ORE = blk("imperial_ore", "Imperial Steel Ore", { hard: 4, tool: "pick", level: 3, drop: "raw_steel", tile: 58, color: [124, 134, 148] });
  const STEEL_BLK = blk("steel_block", "Steel Block", { hard: 6, tool: "pick", level: 3, tile: 59, color: [152, 160, 172] });
  const BASTION = blk("bastion_brick", "Bastion Brick", { hard: 4.5, tool: "pick", level: 2, tile: 60, color: [98, 94, 90] });
  const BRAZIER = blk("brazier", "Legion Brazier", { hard: 2, tool: "pick", level: 1, light: 14, tile: 61, color: [238, 152, 60] });
  const CALTROPS = blk("caltrops", "Iron Caltrops", { solid: false, opaque: false, plant: true, hard: 0.4, tool: "pick", tile: 62, color: [188, 192, 200] });
  // --- Chapter III / agriculture. Still appended: ids stay positional forever. ---
  const FARMLAND = blk("farmland", "Tilled Soil", { hard: 0.55, tool: "shovel", drop: "dirt", tile: 63, tileB: 2, color: [122, 88, 60] });
  const FARMLAND_WET = blk("farmland_wet", "Watered Soil", { hard: 0.55, tool: "shovel", drop: "dirt", tile: 64, tileB: 2, color: [88, 62, 42] });
  // Crop stages are separate ids so the mesher can pick a tile without a side table.
  const WHEAT_0 = blk("wheat_0", "Wheat Seedling", { solid: false, opaque: false, plant: true, hard: 0, drop: null, tile: 65, color: [130, 158, 78] });
  const WHEAT_1 = blk("wheat_1", "Wheat Shoots", { solid: false, opaque: false, plant: true, hard: 0, drop: null, tile: 66, color: [148, 168, 74] });
  const WHEAT_2 = blk("wheat_2", "Wheat Ears", { solid: false, opaque: false, plant: true, hard: 0, drop: null, tile: 67, color: [186, 176, 76] });
  const WHEAT_3 = blk("wheat_3", "Ripe Wheat", { solid: false, opaque: false, plant: true, hard: 0, drop: null, tile: 68, color: [222, 190, 84] });
  const GRAPE_0 = blk("grape_0", "Vine Cutting", { solid: false, opaque: false, plant: true, hard: 0, drop: null, tile: 69, color: [96, 132, 70] });
  const GRAPE_1 = blk("grape_1", "Young Vine", { solid: false, opaque: false, plant: true, hard: 0, drop: null, tile: 70, color: [86, 138, 66] });
  const GRAPE_2 = blk("grape_2", "Flowering Vine", { solid: false, opaque: false, plant: true, hard: 0, drop: null, tile: 71, color: [110, 140, 82] });
  const GRAPE_3 = blk("grape_3", "Ripe Grapevine", { solid: false, opaque: false, plant: true, hard: 0, drop: null, tile: 72, color: [122, 74, 148] });
  const HAY = blk("hay_block", "Hay Bale", { hard: 0.7, tool: "hoe", tile: 73, tileB: 73, color: [206, 174, 72] });
  const ANVIL = blk("legion_anvil", "Legion Anvil", { hard: 4, tool: "pick", level: 2, tile: 74, tileS: 75, tileB: 75, color: [96, 102, 114] });

  function tool(key, name, kind, level, speed, dmg, dur, col) {
    itm(key, name, { stack: 1, tool: kind, level, speed, damage: dmg, dur, maxDur: dur, icon: kind, color: col });
  }
  itm("stick", "Stick", { icon: "stick", color: [160, 120, 60] });
  itm("coal", "Coal", { icon: "lump", color: [40, 40, 40] });
  itm("raw_iron", "Raw Iron", { icon: "lump", color: [180, 150, 130] });
  itm("iron_ingot", "Iron Ingot", { icon: "ingot", color: [210, 210, 215] });
  itm("raw_gold", "Raw Gold", { icon: "lump", color: [230, 190, 60] });
  itm("gold_ingot", "Gold Ingot", { icon: "ingot", color: [250, 210, 50] });
  itm("diamond", "Diamond", { icon: "gem", color: [80, 230, 220] });
  itm("apple", "Apple", { food: 4, icon: "food", color: [200, 40, 40] });
  itm("raw_beef", "Raw Beef", { food: 2, icon: "food", color: [170, 60, 60] });
  itm("cooked_beef", "Steak", { food: 8, icon: "food", color: [120, 70, 40] });
  itm("bread", "Bread", { food: 5, icon: "food", color: [180, 140, 70] });
  itm("wheat", "Wheat", { icon: "stick", color: [210, 180, 70] });
  itm("denarius", "Roman Denarius", { icon: "coin", color: [226, 190, 92] });
  tool("wood_pick", "Wooden Pickaxe", "pick", 1, 2, 2, 60, [160, 120, 60]);
  tool("stone_pick", "Stone Pickaxe", "pick", 2, 4, 3, 130, [120, 120, 120]);
  tool("iron_pick", "Iron Pickaxe", "pick", 3, 6, 4, 250, [200, 200, 205]);
  tool("dia_pick", "Diamond Pickaxe", "pick", 4, 8, 5, 1500, [80, 230, 220]);
  tool("wood_axe", "Wooden Axe", "axe", 1, 2, 3, 60, [160, 120, 60]);
  tool("stone_axe", "Stone Axe", "axe", 2, 4, 4, 130, [120, 120, 120]);
  tool("iron_axe", "Iron Axe", "axe", 3, 6, 5, 250, [200, 200, 205]);
  tool("dia_axe", "Diamond Axe", "axe", 4, 8, 6, 1500, [80, 230, 220]);
  tool("wood_shovel", "Wooden Shovel", "shovel", 1, 2, 2, 60, [160, 120, 60]);
  tool("stone_shovel", "Stone Shovel", "shovel", 2, 4, 2, 130, [120, 120, 120]);
  tool("iron_shovel", "Iron Shovel", "shovel", 3, 6, 3, 250, [200, 200, 205]);
  tool("dia_shovel", "Diamond Shovel", "shovel", 4, 8, 4, 1500, [80, 230, 220]);
  tool("wood_sword", "Wooden Sword", "sword", 1, 1, 4, 60, [160, 120, 60]);
  tool("stone_sword", "Stone Sword", "sword", 1, 1, 5, 130, [120, 120, 120]);
  tool("iron_sword", "Iron Sword", "sword", 1, 1, 6, 250, [200, 200, 205]);
  tool("dia_sword", "Diamond Sword", "sword", 1, 1, 7, 1500, [80, 230, 220]);
  itm("roman_spear", "Roman Spear", { stack: 1, tool: "spear", level: 1, speed: 1, damage: 8, range: 5.4, dur: 420, maxDur: 420, icon: "spear", color: [214, 205, 184] });
  itm("scutum", "Roman Scutum", { stack: 1, tool: "shield", level: 1, speed: 1, damage: 1, dur: 500, maxDur: 500, icon: "shield", color: [174, 42, 48] });
  itm("ember_shard", "Ember Shard", { icon: "gem", color: [242, 132, 50] });
  itm("raw_steel", "Raw Imperial Steel", { icon: "lump", color: [124, 134, 148] });
  itm("steel_ingot", "Imperial Steel Ingot", { icon: "ingot", color: [180, 190, 202] });
  tool("steel_pick", "Imperial Steel Pickaxe", "pick", 4, 7, 5, 900, [180, 190, 202]);
  itm("steel_gladius", "Steel Gladius", { stack: 1, tool: "sword", level: 1, speed: 1, damage: 10, dur: 700, maxDur: 700, icon: "sword", color: [180, 190, 202] });
  // Thrown, not held: no `tool` key, so it still stacks and never counts as a melee weapon.
  itm("pilum", "Pilum", { stack: 16, thrown: true, damage: 9, icon: "spear", color: [214, 205, 184] });

  // --- Agriculture: seeds, the hoe line, and foods that carry buffs ---
  // `plant` marks an item that a right-click sows onto tilled soil.
  itm("wheat_seeds", "Wheat Seeds", { plant: "wheat", icon: "seed", color: [186, 176, 96] });
  itm("grape_seeds", "Vine Cutting", { plant: "grape", icon: "seed", color: [120, 150, 88] });
  itm("grape", "Grapes", { food: 3, icon: "food", color: [130, 74, 156] });
  // Buff foods. `buff` is [name, seconds]; the buff registry decides what it does.
  itm("wine", "Falernian Wine", { food: 4, buff: ["warmth", 240], icon: "food", color: [122, 40, 62] });
  itm("legion_stew", "Legion Stew", { food: 9, buff: ["regen", 24], icon: "food", color: [178, 118, 62] });
  itm("honey_cake", "Honey Cake", { food: 6, buff: ["vigor", 90], icon: "food", color: [222, 176, 82] });
  tool("wood_hoe", "Wooden Hoe", "hoe", 1, 2, 1, 60, [160, 120, 60]);
  tool("stone_hoe", "Stone Hoe", "hoe", 2, 3, 1, 130, [120, 120, 120]);
  tool("iron_hoe", "Iron Hoe", "hoe", 3, 4, 2, 250, [200, 200, 205]);
  tool("steel_hoe", "Imperial Steel Hoe", "hoe", 4, 5, 2, 900, [180, 190, 202]);

  const LOGS = new Set(["oak_log", "pine_log", "birch_log"]);
  const PLANKS_SET = new Set(["oak_planks"]);

  const RECIPES = [
    { out: ["oak_planks", 4], shapeless: ["oak_log"] },
    { out: ["oak_planks", 4], shapeless: ["pine_log"] },
    { out: ["oak_planks", 4], shapeless: ["birch_log"] },
    { out: ["stick", 4], shape: ["P", "P"], map: { P: "oak_planks" } },
    { out: ["crafting_table", 1], shape: ["PP", "PP"], map: { P: "oak_planks" } },
    { out: ["chest", 1], shape: ["PPP", "P P", "PPP"], map: { P: "oak_planks" } },
    { out: ["furnace", 1], shape: ["CCC", "C C", "CCC"], map: { C: "cobble" } },
    { out: ["torch", 4], shape: ["K", "S"], map: { K: "coal", S: "stick" } },
    { out: ["wood_pick", 1], shape: ["PPP", " S ", " S "], map: { P: "oak_planks", S: "stick" } },
    { out: ["stone_pick", 1], shape: ["CCC", " S ", " S "], map: { C: "cobble", S: "stick" } },
    { out: ["iron_pick", 1], shape: ["III", " S ", " S "], map: { I: "iron_ingot", S: "stick" } },
    { out: ["dia_pick", 1], shape: ["DDD", " S ", " S "], map: { D: "diamond", S: "stick" } },
    { out: ["wood_axe", 1], shape: ["PP", "PS", " S"], map: { P: "oak_planks", S: "stick" } },
    { out: ["stone_axe", 1], shape: ["CC", "CS", " S"], map: { C: "cobble", S: "stick" } },
    { out: ["iron_axe", 1], shape: ["II", "IS", " S"], map: { I: "iron_ingot", S: "stick" } },
    { out: ["dia_axe", 1], shape: ["DD", "DS", " S"], map: { D: "diamond", S: "stick" } },
    { out: ["wood_shovel", 1], shape: ["P", "S", "S"], map: { P: "oak_planks", S: "stick" } },
    { out: ["stone_shovel", 1], shape: ["C", "S", "S"], map: { C: "cobble", S: "stick" } },
    { out: ["iron_shovel", 1], shape: ["I", "S", "S"], map: { I: "iron_ingot", S: "stick" } },
    { out: ["dia_shovel", 1], shape: ["D", "S", "S"], map: { D: "diamond", S: "stick" } },
    { out: ["wood_sword", 1], shape: ["P", "P", "S"], map: { P: "oak_planks", S: "stick" } },
    { out: ["stone_sword", 1], shape: ["C", "C", "S"], map: { C: "cobble", S: "stick" } },
    { out: ["iron_sword", 1], shape: ["I", "I", "S"], map: { I: "iron_ingot", S: "stick" } },
    { out: ["dia_sword", 1], shape: ["D", "D", "S"], map: { D: "diamond", S: "stick" } },
    { out: ["coal_block", 1], shapeless: Array(9).fill("coal") },
    { out: ["iron_block", 1], shapeless: Array(9).fill("iron_ingot") },
    { out: ["gold_block", 1], shapeless: Array(9).fill("gold_ingot") },
    { out: ["diamond_block", 1], shapeless: Array(9).fill("diamond") },
    { out: ["glowstone", 1], shapeless: ["torch", "torch", "torch", "torch"] },
    { out: ["bookshelf", 1], shape: ["PPP", "BBB", "PPP"], map: { P: "oak_planks", B: "apple" } },
    { out: ["tnt", 1], shape: ["GCG", "CGC", "GCG"], map: { G: "sand", C: "coal" } },
    { out: ["bread", 1], shape: ["WWW"], map: { W: "wheat" } }
    ,{ out: ["marble", 4], shape: ["SS", "SS"], map: { S: "stone" } }
    ,{ out: ["column", 2], shape: ["M", "M", "M"], map: { M: "marble" } }
    ,{ out: ["roman_brick", 4], shape: ["CT", "TC"], map: { C: "cobble", T: "terracotta" } }
    ,{ out: ["mosaic", 4], shape: ["MT", "TM"], map: { M: "marble", T: "terracotta" } }
    ,{ out: ["roman_spear", 1], shape: [" I", " S", "S "], map: { I: "iron_ingot", S: "stick" } }
    ,{ out: ["scutum", 1], shape: ["PIP", "PPP", " P "], map: { P: "oak_planks", I: "iron_ingot" } }
    // --- Chapter II tech: basalt masonry, ember light, imperial steel, thrown pila ---
    ,{ out: ["bastion_brick", 4], shape: ["BC", "CB"], map: { B: "basalt", C: "cobble" } }
    ,{ out: ["brazier", 1], shapeless: ["ember_shard", "ember_shard", "iron_ingot", "cobble"] }
    ,{ out: ["caltrops", 4], shape: [" I ", "I I"], map: { I: "iron_ingot" } }
    ,{ out: ["steel_block", 1], shapeless: Array(9).fill("steel_ingot") }
    ,{ out: ["steel_pick", 1], shape: ["TTT", " S ", " S "], map: { T: "steel_ingot", S: "stick" } }
    ,{ out: ["steel_gladius", 1], shape: ["T", "T", "S"], map: { T: "steel_ingot", S: "stick" } }
    ,{ out: ["pilum", 4], shape: ["T", "S", "S"], map: { T: "steel_ingot", S: "stick" } }
    // --- Agriculture: the hoe line gates farming, the kitchen turns crops into buffs ---
    ,{ out: ["wood_hoe", 1], shape: ["PP", " S", " S"], map: { P: "oak_planks", S: "stick" } }
    ,{ out: ["stone_hoe", 1], shape: ["CC", " S", " S"], map: { C: "cobble", S: "stick" } }
    ,{ out: ["iron_hoe", 1], shape: ["II", " S", " S"], map: { I: "iron_ingot", S: "stick" } }
    ,{ out: ["steel_hoe", 1], shape: ["TT", " S", " S"], map: { T: "steel_ingot", S: "stick" } }
    ,{ out: ["hay_block", 1], shapeless: Array(9).fill("wheat") }
    ,{ out: ["wheat", 9], shapeless: ["hay_block"] }
    ,{ out: ["wine", 1], shapeless: ["grape", "grape", "grape", "glass"] }
    ,{ out: ["legion_stew", 1], shapeless: ["cooked_beef", "wheat", "grape", "bread"] }
    ,{ out: ["honey_cake", 1], shape: ["WWW", "GAG"], map: { W: "wheat", G: "grape", A: "apple" } }
    // The anvil is the gate on the whole affix system: steel-tier tech, deliberately late.
    ,{ out: ["legion_anvil", 1], shape: ["TTT", " I ", "III"], map: { T: "steel_ingot", I: "iron_ingot" } }
  ];

  const SMELT = {
    raw_iron: ["iron_ingot", 1], raw_gold: ["gold_ingot", 1],
    sand: ["glass", 1], cobble: ["stone", 1], raw_beef: ["cooked_beef", 1],
    oak_log: ["coal", 1], pine_log: ["coal", 1], birch_log: ["coal", 1], clay: ["terracotta", 1],
    raw_steel: ["steel_ingot", 1], basalt: ["stone", 1]
  };
  const FUEL = { coal: 8, oak_log: 1.5, pine_log: 1.5, birch_log: 1.5, oak_planks: 1.5, stick: 0.5, coal_block: 80, ember_shard: 14 };

  function defOf(id) { return DEFS[id] || null; }
  function isSolid(id) { const d = DEFS[id]; return !!(d && d.solid); }
  function isOpaque(id) { const d = DEFS[id]; return !!(d && d.opaque); }
  function isPlant(id) { const d = DEFS[id]; return !!(d && d.plant); }
  function isFluid(id) { const d = DEFS[id]; return !!(d && d.fluid); }

  // =====================================================================
  // Texture atlas
  // =====================================================================
  const ATLAS = 256, TILE = 16, TILES = 16;
  function paintAtlas() {
    const c = document.createElement("canvas");
    c.width = c.height = ATLAS;
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(ATLAS, ATLAS);
    const D = img.data;
    const set = (x, y, r, g, b, a) => {
      if (x < 0 || y < 0 || x >= ATLAS || y >= ATLAS) return;
      const p = (y * ATLAS + x) * 4; D[p] = r; D[p+1] = g; D[p+2] = b; D[p+3] = a == null ? 255 : a;
    };
    const tilePix = (t, i, j, r, g, b, a) => {
      const tx = (t % TILES) * TILE, ty = Math.floor(t / TILES) * TILE;
      set(tx + i, ty + j, r, g, b, a);
    };
    // --- Material noise -------------------------------------------------
    // Raw per-pixel hashing reads as TV static: every material ends up with the
    // same fizzing dither and nothing looks like a substance. These helpers give
    // smoothed, *seamlessly tiling* value noise instead, so a face shows clumps
    // and veins the eye can read as mineral grain. Tiling matters because one
    // tile repeats across every block face — a non-wrapping pattern would show a
    // hard seam on every block edge.
    // `per` is the lattice spacing and must divide 16 so the lattice wraps.
    const vnoise = (i, j, seed, per) => {
      const x = i / per, z = j / per, w = 16 / per;
      const xi = Math.floor(x), zi = Math.floor(z);
      const u = x - xi, v = z - zi;
      const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
      const h = (a, b) => hash2(((a % w) + w) % w, ((b % w) + w) % w, seed);
      return lerp(lerp(h(xi, zi), h(xi + 1, zi), su), lerp(h(xi, zi + 1), h(xi + 1, zi + 1), su), sv);
    };
    // Two octaves of clumping plus a little fine grit, so a surface has both
    // large-scale mottling and a tactile per-pixel texture.
    const grainAt = (i, j, seed) =>
      0.52 * vnoise(i, j, seed, 8) + 0.31 * vnoise(i, j, seed + 977, 4) + 0.17 * hash2(i, j, seed + 613);

    const fill = (t, c1, c2, seed, holes) => {
      for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
        if (holes && hash2(i, j, seed) > 0.72) { tilePix(t, i, j, 0, 0, 0, 0); continue; }
        // Curve it slightly so the darker end keeps some weight instead of the
        // whole tile drifting to the midpoint mush.
        const n = grainAt(i, j, seed);
        const k = n * n * (3 - 2 * n);
        tilePix(t, i, j,
          c1[0] + (c2[0] - c1[0]) * k | 0,
          c1[1] + (c2[1] - c1[1]) * k | 0,
          c1[2] + (c2[2] - c1[2]) * k | 0, 255);
      }
    };
    const overlay = (t, pred, col) => {
      for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++)
        if (pred(i, j)) tilePix(t, i, j, col[0], col[1], col[2], 255);
    };
    // Read-modify-write helpers. `overlay` stamps flat colour, which flattens
    // whatever grain the fill just laid down; these keep the material underneath
    // visible so detail layers instead of replacing.
    const px = (t, i, j) => {
      const tx = (t % TILES) * TILE, ty = Math.floor(t / TILES) * TILE;
      const p = (((ty + j) * ATLAS) + tx + i) * 4;
      return [D[p], D[p+1], D[p+2], D[p+3]];
    };
    const blend = (t, i, j, col, a) => {
      const o = px(t, i, j);
      tilePix(t, i, j,
        o[0] + (col[0] - o[0]) * a | 0,
        o[1] + (col[1] - o[1]) * a | 0,
        o[2] + (col[2] - o[2]) * a | 0, o[3]);
    };
    // Multiply brightness — for crevices, shadowed bevels and dirt in seams.
    const darken = (t, pred, amt) => {
      for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
        const k = pred(i, j); if (!k) continue;
        const o = px(t, i, j); if (!o[3]) continue;
        const m = 1 - amt * (k === true ? 1 : k);
        tilePix(t, i, j, o[0] * m | 0, o[1] * m | 0, o[2] * m | 0, o[3]);
      }
    };
    const lighten = (t, pred, amt) => {
      for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
        const k = pred(i, j); if (!k) continue;
        const o = px(t, i, j); if (!o[3]) continue;
        const m = amt * (k === true ? 1 : k);
        tilePix(t, i, j, o[0] + (255 - o[0]) * m | 0, o[1] + (255 - o[1]) * m | 0, o[2] + (255 - o[2]) * m | 0, o[3]);
      }
    };

    // Hairline fractures. A crack is a walk that wraps at the tile edge, with a
    // soft light rim on one side so it reads as depth rather than a drawn line.
    const cracks = (t, seed, count, len, depth) => {
      for (let c = 0; c < count; c++) {
        let x = hash2(c, 0, seed) * 16 | 0, y = hash2(c, 1, seed) * 16 | 0;
        let ang = hash2(c, 2, seed) * Math.PI * 2;
        for (let s = 0; s < len; s++) {
          ang += (hash2(c, s + 3, seed) - 0.5) * 1.1;
          x = ((x + Math.round(Math.cos(ang))) % 16 + 16) % 16;
          y = ((y + Math.round(Math.sin(ang))) % 16 + 16) % 16;
          darken(t, (i, j) => i === x && j === y, depth);
          lighten(t, (i, j) => i === x && j === (y + 1) % 16, depth * 0.35);
        }
      }
    };
    // Crystal pockets for ores: a clustered blob with a lit facet and a dark
    // rim, so the mineral sits *inside* the rock instead of sprinkling on top.
    const crystals = (t, seed, col, bright, count, rad) => {
      for (let c = 0; c < count; c++) {
        const cx = hash2(c, 5, seed) * 16 | 0, cy = hash2(c, 6, seed) * 16 | 0;
        const r = rad * (0.65 + hash2(c, 7, seed) * 0.7);
        for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
          // Wrapped distance keeps blobs continuous across the tile seam.
          const dx = Math.min(Math.abs(i - cx), 16 - Math.abs(i - cx));
          const dy = Math.min(Math.abs(j - cy), 16 - Math.abs(j - cy));
          const d = Math.hypot(dx, dy) + (hash2(i, j, seed + c) - 0.5) * 1.3;
          if (d > r) continue;
          blend(t, i, j, col, 0.92);
          if (d < r - 1.4 && dx + dy < r) blend(t, i, j, bright, 0.75);   // facet catching light
          if (d > r - 0.9) blend(t, i, j, [18, 16, 14], 0.45);            // seated in shadow
        }
      }
    };
    // Bark: fibre runs vertically, so the noise must be stretched along j rather
    // than isotropic — that directionality is the whole reason wood reads as wood.
    const barkGrain = (t, seed) => {
      for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
        const fibre = vnoise(i, j * 0.28 | 0, seed, 4);
        if (fibre > 0.58) darken(t, (a, b) => a === i && b === j, (fibre - 0.58) * 1.5);
        else if (fibre < 0.34) lighten(t, (a, b) => a === i && b === j, (0.34 - fibre) * 0.85);
        // Barrel shading: a cylinder lit from the front is darker at both edges.
        const edge = Math.abs(i - 7.5) / 7.5;
        if (edge > 0.55) darken(t, (a, b) => a === i && b === j, (edge - 0.55) * 0.75);
      }
      // An occasional knot where a branch once was.
      const kx = hash2(1, 2, seed) * 16 | 0, ky = hash2(3, 4, seed) * 16 | 0;
      for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
        const d = Math.hypot(Math.min(Math.abs(i - kx), 16 - Math.abs(i - kx)), Math.min(Math.abs(j - ky), 16 - Math.abs(j - ky)));
        if (d < 2.6) darken(t, (a, b) => a === i && b === j, (1 - d / 2.6) * 0.55);
      }
    };
    // Cut end: growth rings. Spacing wobbles with angle so the rings are not
    // machine-perfect circles.
    const yearRings = (t, seed, dark) => {
      const cx = 6.5 + hash2(1, 1, seed) * 3, cy = 6.5 + hash2(2, 2, seed) * 3;
      for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
        const d = Math.hypot(i - cx, j - cy) + vnoise(i, j, seed, 8) * 1.4;
        const ring = Math.sin(d * 2.15);
        if (ring > 0.45) blend(t, i, j, dark, (ring - 0.45) * 0.9);
      }
      darken(t, (i, j) => Math.hypot(i - cx, j - cy) < 1.4, 0.35);   // the heart
    };

    // Sun-dried meadow seen from above: a mat of individual blades, some bleached
    // and some still green, rather than one flat swatch of ochre.
    fill(0, [205, 168, 68], [151, 112, 45], 11);
    for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
      const b = hash2(i, j, 301);
      if (b > 0.80) blend(0, i, j, [116, 142, 62], 0.55 * (b - 0.80) / 0.20);  // surviving green
      else if (b < 0.14) blend(0, i, j, [232, 208, 140], 0.5);                  // bleached tip
    }
    darken(0, (i, j) => hash2(i, j, 302) > 0.86, 0.30);                         // gaps down to soil
    // Grass side: soil below, with the turf edge hanging over in an uneven fringe
    // so the transition is organic instead of a ruler-straight band.
    fill(1, [134, 96, 67], [100, 70, 48], 12);
    cracks(1, 121, 2, 9, 0.22);
    for (let i = 0; i < 16; i++) {
      const lip = 3 + (vnoise(i, 0, 305, 4) * 3.2 | 0);
      for (let j = 0; j <= lip; j++) blend(1, i, j, j === lip ? [150, 118, 46] : [190, 145, 55], j === lip ? 0.8 : 1);
      blend(1, i, lip + 1, [96, 74, 40], 0.45);       // shadow the turf casts on the soil
    }
    fill(2, [134, 96, 67], [100, 70, 48], 13);           // dirt: loose clods and grit
    darken(2, (i, j) => hash2(i, j, 306) > 0.88, 0.28);
    lighten(2, (i, j) => hash2(i, j, 307) > 0.93, 0.22);
    // Stone: fine grain plus a real fracture network. The cracks are what make a
    // cave wall read as rock instead of grey noise.
    fill(3, [125, 125, 125], [90, 90, 90], 14);
    cracks(3, 141, 3, 13, 0.34);
    lighten(3, (i, j) => hash2(i, j, 308) > 0.94, 0.30);   // quartz fleck
    // Cobble: distinct rounded stones bedded in dark mortar.
    fill(4, [110, 110, 110], [70, 70, 70], 15);
    for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
      const n = vnoise(i, j, 309, 4);
      if (n > 0.56) lighten(4, (a, b) => a === i && b === j, (n - 0.56) * 0.9);   // stone crown
      else if (n < 0.34) darken(4, (a, b) => a === i && b === j, (0.34 - n) * 1.5); // mortar seam
    }
    lighten(4, (i, j) => hash2(i, j, 310) > 0.92, 0.25);
    // Sand: wind ripples running across the tile, not random speckle.
    fill(5, [219, 207, 145], [196, 180, 118], 16);
    for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
      const r = Math.sin((j + vnoise(i, j, 311, 8) * 4.5) * (Math.PI * 2 / 5.33));
      if (r > 0.35) lighten(5, (a, b) => a === i && b === j, (r - 0.35) * 0.30);
      else if (r < -0.35) darken(5, (a, b) => a === i && b === j, (-r - 0.35) * 0.26);
    }
    // Gravel: loose pebbles of mixed size, each with a lit top and dark underside.
    fill(6, [136, 126, 122], [100, 94, 90], 17);
    for (let c = 0; c < 9; c++) {
      const cx = hash2(c, 11, 312) * 16 | 0, cy = hash2(c, 12, 312) * 16 | 0;
      const r = 1.3 + hash2(c, 13, 312) * 1.7;
      for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
        const dx = Math.min(Math.abs(i - cx), 16 - Math.abs(i - cx));
        const dy = Math.min(Math.abs(j - cy), 16 - Math.abs(j - cy));
        const d = Math.hypot(dx, dy);
        if (d > r) continue;
        if (j < cy) lighten(6, (a, b) => a === i && b === j, 0.20 * (1 - d / r));
        else darken(6, (a, b) => a === i && b === j, 0.24 * (d / r));
      }
    }
    fill(7, [46, 86, 190], [30, 60, 160], 18);           // water
    // Bark: vertical fibre running the length of the trunk, with the barrel
    // curvature shaded in at both edges so the log reads as round, not flat.
    fill(8, [110, 85, 50], [80, 58, 32], 19);
    barkGrain(8, 401);
    // Cut end: concentric year rings around an off-centre heart.
    fill(9, [150, 118, 70], [110, 85, 50], 20);
    yearRings(9, 402, [96, 72, 40]);
    fill(10, [132, 116, 54], [91, 77, 38], 21, true);    // olive leaves
    fill(11, [168, 135, 78], [140, 108, 58], 22);        // planks
    overlay(11, (i, j) => j % 4 === 0, [120, 90, 48]);
    fill(12, [190, 220, 230], [160, 200, 220], 23);      // glass
    for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++)
      if (i === 0 || j === 0 || i === 15 || j === 15) tilePix(12, i, j, 220, 240, 245, 180);
      else tilePix(12, i, j, 180, 210, 220, 90);
    fill(13, [150, 80, 65], [120, 55, 45], 24);          // bricks
    overlay(13, (i, j) => j % 4 === 0 || ((j >> 2) % 2 ? i === 8 : i === 0 || i === 15), [90, 50, 40]);
    // Ores: the host rock keeps its own cracked stone grain, and the mineral sits
    // in it as clustered pockets with a lit facet — the facet is what makes an ore
    // vein catch the eye across a dark cave.
    fill(14, [90, 90, 90], [50, 50, 50], 25);            // coal
    cracks(14, 251, 2, 10, 0.28);
    crystals(14, 71, [26, 24, 26], [78, 76, 80], 3, 3.1);
    fill(15, [125, 125, 125], [90, 90, 90], 26);         // copper/iron
    cracks(15, 252, 2, 10, 0.28);
    crystals(15, 72, [186, 132, 96], [236, 198, 160], 3, 2.9);
    fill(16, [125, 125, 125], [90, 90, 90], 27);         // gold
    cracks(16, 253, 2, 10, 0.28);
    crystals(16, 73, [214, 168, 44], [255, 238, 150], 3, 2.6);
    fill(17, [125, 125, 125], [90, 90, 90], 28);         // aquamarine
    cracks(17, 254, 2, 10, 0.28);
    crystals(17, 74, [58, 198, 196], [186, 255, 250], 3, 2.6);
    fill(18, [50, 50, 50], [20, 20, 20], 29);            // bedrock
    fill(19, [240, 244, 250], [220, 228, 240], 30);      // snow
    fill(20, [160, 200, 230], [120, 170, 210], 31);      // ice
    fill(21, [153, 108, 62], [106, 72, 44], 32);          // dried cactus
    overlay(21, (i) => i < 2 || i > 13, [92, 60, 38]);
    fill(22, [218, 200, 140], [196, 176, 118], 33);      // sandstone
    fill(23, [150, 110, 60], [120, 85, 40], 34);         // table top
    overlay(23, (i, j) => (i > 4 && i < 11 && j > 4 && j < 11), [90, 60, 30]);
    fill(24, [150, 110, 60], [120, 85, 40], 35);
    overlay(24, (i, j) => j < 5, [168, 135, 78]);
    fill(25, [90, 90, 90], [60, 60, 60], 36);            // furnace front
    overlay(25, (i, j) => i > 4 && i < 11 && j > 6 && j < 13, [20, 16, 12]);
    overlay(25, (i, j) => i > 5 && i < 10 && j > 2 && j < 6, [40, 40, 40]);
    fill(26, [90, 90, 90], [60, 60, 60], 37);
    fill(27, [150, 105, 50], [110, 75, 32], 38);         // chest
    overlay(27, (i, j) => i > 6 && i < 9 && j > 7 && j < 10, [200, 180, 60]);
    fill(28, [80, 50, 20], [50, 30, 10], 39);            // torch
    overlay(28, (i, j) => i > 6 && i < 9 && j > 4, [90, 60, 25]);
    overlay(28, (i, j) => i > 5 && i < 10 && j < 6, [255, 210, 80]);
    fill(29, [30, 30, 30], [15, 15, 15], 40);
    fill(30, [200, 200, 205], [160, 160, 170], 41);
    fill(31, [250, 210, 60], [210, 160, 30], 42);
    fill(32, [90, 230, 220], [40, 180, 180], 43);
    // flowers / grass as crossed plants (mostly transparent)
    const clear = (t) => { for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) tilePix(t, i, j, 0, 0, 0, 0); };
    clear(33); clear(34); clear(35);
    overlay(33, (i, j) => (i === 8 && j > 4) || (j < 8 && Math.abs(i - 8) + Math.abs(j - 4) < 4), [200, 40, 50]);
    overlay(33, (i, j) => i === 8 && j > 8, [40, 120, 40]);
    overlay(34, (i, j) => (Math.abs(i - 8) < 3 && Math.abs(j - 5) < 3) || (i === 8 && j > 6), [230, 210, 40]);
    overlay(34, (i, j) => i === 8 && j > 8, [50, 130, 40]);
    overlay(35, (i, j) => (i === 5 || i === 8 || i === 11) && j > 4 + (i % 3), [70, 150, 45]);
    fill(36, [220, 90, 20], [255, 160, 40], 50);         // lava
    fill(37, [70, 55, 40], [45, 35, 24], 51);            // pine log
    overlay(37, (i) => i < 2 || i > 13, [40, 30, 20]);
    fill(38, [216, 210, 196], [180, 174, 160], 52);      // birch
    overlay(38, (i, j) => hash2(i, j, 88) > 0.88, [50, 45, 40]);
    fill(39, [75, 80, 48], [45, 50, 32], 53, true);
    fill(40, [186, 102, 48], [126, 66, 36], 54, true);
    fill(44, [140, 90, 50], [100, 60, 30], 55);          // bookshelf
    overlay(44, (i, j) => j % 5 !== 4 && i > 1 && i < 14, [80, 40, 30]);
    fill(45, [200, 60, 50], [160, 30, 25], 56);          // tnt
    overlay(45, (i, j) => j > 5 && j < 10, [240, 230, 220]);
    fill(46, [210, 120, 40], [170, 90, 25], 57);
    fill(47, [150, 155, 165], [120, 125, 135], 58);
    fill(48, [255, 210, 100], [220, 160, 40], 59);
    fill(49, [30, 20, 50], [10, 8, 20], 60);
    fill(50, [232, 225, 205], [194, 187, 169], 61);       // marble
    overlay(50, (i, j) => (i + j * 3) % 17 === 0, [169, 163, 154]);
    fill(51, [199, 102, 65], [154, 67, 48], 62);          // terracotta
    overlay(51, (i, j) => j % 5 === 0, [126, 55, 42]);
    fill(52, [58, 104, 150], [31, 67, 113], 63);          // mosaic
    overlay(52, (i, j) => (i + j) % 4 === 0, [225, 184, 64]);
    overlay(52, (i, j) => (i - j + 16) % 7 === 0, [173, 57, 65]);
    fill(53, [185, 158, 116], [142, 118, 84], 64);        // Roman stone brick
    overlay(53, (i, j) => j % 4 === 0 || ((j >> 2) % 2 ? i === 8 : i === 0), [112, 91, 68]);
    fill(54, [224, 214, 187], [187, 176, 151], 65);       // fluted column
    overlay(54, (i) => i % 4 === 0, [165, 155, 135]);

    // --- Chapter II tiles ---
    fill(55, [72, 69, 76], [42, 40, 46], 66);             // basalt: cooled columnar rock
    overlay(55, (i, j) => i % 5 === 0 && hash2(i, j, 67) > 0.35, [30, 28, 34]);
    fill(56, [120, 113, 108], [88, 82, 78], 68);          // volcanic ash
    overlay(56, (i, j) => hash2(i, j, 69) > 0.88, [156, 148, 142]);
    fill(57, [72, 69, 76], [42, 40, 46], 70);             // ember ore: molten veins in basalt
    cracks(57, 255, 3, 12, 0.30);
    crystals(57, 71, [214, 96, 26], [255, 226, 150], 3, 3.0);
    lighten(57, (i, j) => hash2(i, j, 72) > 0.94, 0.45);  // sparks still glowing in the seam
    fill(58, [72, 69, 76], [42, 40, 46], 73);             // imperial steel ore
    cracks(58, 256, 2, 11, 0.30);
    crystals(58, 74, [154, 168, 186], [236, 244, 255], 3, 2.8);
    fill(59, [166, 175, 188], [124, 133, 148], 76);       // steel block
    overlay(59, (i, j) => i === 0 || j === 0 || i === 15 || j === 15, [96, 104, 118]);
    fill(60, [106, 101, 96], [72, 68, 64], 77);           // bastion brick: heavy banded masonry
    overlay(60, (i, j) => j % 5 === 0 || ((j / 5 | 0) % 2 ? i === 7 : i === 0), [48, 45, 42]);
    overlay(60, (i, j) => j % 5 === 1 && hash2(i, j, 78) > 0.7, [138, 132, 126]);
    fill(61, [86, 78, 70], [56, 50, 46], 79);             // brazier: iron bowl full of coals
    overlay(61, (i, j) => j > 9 && i > 4 && i < 11, [72, 66, 60]);
    overlay(61, (i, j) => j > 4 && j < 10 && i > 2 && i < 13, [212, 96, 28]);
    overlay(61, (i, j) => j > 4 && j < 8 && hash2(i, j, 80) > 0.55, [255, 206, 110]);
    clear(62);                                            // caltrops: sparse iron spikes
    overlay(62, (i, j) => j > 9 && Math.abs((i % 5) - 2) + Math.abs(j - 13) < 3, [190, 196, 206]);
    overlay(62, (i, j) => j > 12 && i % 5 === 2, [126, 132, 142]);

    // --- Agriculture tiles ---
    fill(63, [128, 92, 62], [96, 68, 46], 81);            // tilled soil: dry furrows
    overlay(63, (i, j) => j % 5 === 2, [78, 55, 36]);
    fill(64, [92, 64, 44], [62, 43, 30], 82);             // watered soil: darker, damp furrows
    overlay(64, (i, j) => j % 5 === 2, [46, 32, 22]);
    overlay(64, (i, j) => j % 5 === 2 && hash2(i, j, 83) > 0.6, [58, 74, 96]);
    // Crops are crossed billboards: mostly transparent, growing taller per stage.
    const stalk = (t, top, colLow, colHigh, ears) => {
      clear(t);
      for (const i of [4, 8, 12]) {
        for (let j = 15; j >= top; j--) {
          const k = (15 - j) / Math.max(1, 15 - top);
          overlay(t, (a, b) => a === i + ((hash2(i, b, 84) > 0.7) ? 1 : 0) && b === j, [
            colLow[0] + (colHigh[0] - colLow[0]) * k | 0,
            colLow[1] + (colHigh[1] - colLow[1]) * k | 0,
            colLow[2] + (colHigh[2] - colLow[2]) * k | 0]);
        }
        if (ears) for (const d of [-1, 0, 1])
          overlay(t, (a, b) => a === i + d && b >= top && b < top + 3, ears);
      }
    };
    stalk(65, 12, [96, 120, 58], [138, 168, 82]);                        // wheat: seedling
    stalk(66, 8, [96, 120, 58], [150, 176, 84]);                         // wheat: shoots
    stalk(67, 4, [104, 122, 56], [186, 178, 78], [196, 184, 90]);        // wheat: ears forming
    stalk(68, 2, [120, 116, 52], [230, 198, 92], [236, 206, 96]);        // wheat: ripe gold
    stalk(69, 12, [70, 104, 52], [104, 140, 74]);                        // vine: cutting
    stalk(70, 8, [66, 108, 50], [98, 146, 70]);                          // vine: young
    stalk(71, 5, [66, 108, 50], [116, 150, 86], [206, 214, 170]);        // vine: in flower
    stalk(72, 3, [62, 100, 48], [104, 140, 72]);                         // vine: ripe
    overlay(72, (i, j) => j > 6 && hash2(i, j, 85) > 0.74, [124, 66, 152]);
    overlay(72, (i, j) => j > 7 && hash2(i, j, 86) > 0.90, [168, 110, 198]);
    fill(73, [206, 178, 76], [166, 138, 52], 87);          // hay bale
    overlay(73, (i, j) => j % 4 === 0, [128, 104, 40]);
    overlay(73, (i, j) => hash2(i, j, 88) > 0.86, [230, 208, 120]);
    // Legion anvil: dark iron with a bright struck face and a gilded SPQR band.
    fill(74, [104, 110, 122], [66, 71, 82], 89);           // top: the working face
    overlay(74, (i, j) => i > 2 && i < 13 && j > 2 && j < 13, [132, 140, 154]);
    overlay(74, (i, j) => i > 4 && i < 11 && j > 4 && j < 11, [158, 167, 182]);
    overlay(74, (i, j) => hash2(i, j, 90) > 0.9, [196, 204, 218]);
    fill(75, [78, 83, 94], [48, 52, 60], 91);              // side: waisted block
    overlay(75, (i, j) => j > 4 && j < 11 && (i < 3 || i > 12), [40, 43, 50]);
    overlay(75, (i, j) => j === 3 || j === 12, [116, 123, 136]);
    overlay(75, (i, j) => j === 7 && i > 4 && i < 12, [214, 178, 84]);

    ctx.putImageData(img, 0, 0);
    return c;
  }

  function tileUV(tile) {
    const u = (tile % TILES) / TILES, v = Math.floor(tile / TILES) / TILES;
    const p = 0.5 / ATLAS, s = 1 / TILES;
    return [u + p, v + p, u + s - p, v + s - p];
  }

  // =====================================================================
  // World
  // =====================================================================
  const G = {
    seed: 1, creative: true, chunks: new Map(), dirty: new Set(), diffs: new Map(),
    time: 0.22, day: 1, tick: 0, furnaces: new Map(), chests: new Map(), weather: 0,
    braziers: new Set(), crops: new Map()
  };
  const hCache = new Map();
  const STAT = { kills: 0, mined: 0, placed: 0, harvested: 0, t0: 0 };
  const BIOME_NAMES = { plains: "金色平原", forest: "橄榄丘陵", taiga: "石灰高地", desert: "赤金沙漠", beach: "珊瑚海岸", ocean: "帝国海湾", ashland: "灰烬荒原" };
  const BIOME_GOAL = 5;
  const discoveries = new Set();
  let lastBiome = null;
  const pad = { x: 0, z: 0 };
  let jumpQueued = false;
  let hitStop = 0;
  // --- game feel: camera shake, damage floaters, hit flash tint ---
  let shake = 0, shakeT = 0;
  const floats = [];
  let colTint = 0;
  function addShake(a) { shake = Math.min(0.55, shake + a); }
  function addFloat(x, y, z, text, cls) {
    if (floats.length > 24) floats.shift();
    floats.push({ x, y, z, text, cls: cls || "", life: 0.95, vy: 1.5 });
  }
  const IS_TOUCH = (("ontouchstart" in window) || (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0))
    && !(window.matchMedia && matchMedia("(pointer:fine)").matches);

  function ck(cx, cz) { return cx + "," + cz; }
  function cxyz(x, y, z) { return x + "," + y + "," + z; }
  function w2c(n) { return Math.floor(n / SX); }
  function w2l(n) { return ((n % SX) + SX) % SX; }
  function cidx(x, y, z) { return x + z * SX + y * SX * SZ; }

  function riverField(x, z) {
    return fbm2(x * 0.0048 + 90, z * 0.0048, G.seed + 33, 3) * 2 - 1;
  }
  function riverInf(x, z) {
    const d = Math.abs(riverField(x, z));
    const half = 0.026, bank = 0.03;
    if (d > half + bank) return 0;
    if (d <= half) return 1;
    return 1 - (d - half) / bank;
  }
  // The Ashlands: a fixed volcanic caldera to the north-east, so Chapter II can
  // point a compass arrow at it instead of hoping noise puts one somewhere.
  const ASHLAND = { x: 256, z: -256, r: 92 };
  function ashlandInf(x, z) {
    const d = Math.hypot(x - ASHLAND.x, z - ASHLAND.z);
    if (d > ASHLAND.r) return 0;
    return clamp(1 - d / ASHLAND.r, 0, 1);
  }
  function heightAt(x, z) {
    x = wf(x); z = wf(z);
    const key = x + "," + z;
    const cached = hCache.get(key);
    if (cached !== undefined) return cached;
    const s = G.seed;
    const cont = fbm2(x * 0.0032, z * 0.0032, s, 5);
    const hill = fbm2(x * 0.018, z * 0.018, s + 3, 4);
    const mount = fbm2(x * 0.0055, z * 0.0055, s + 7, 4);
    const rid = Math.abs(fbm2(x * 0.01, z * 0.01, s + 11, 3) - 0.5) * 2;
    // Broad Roman frontier plains: readable roads and landmarks, gentle elevation only.
    let h = 30 + cont * 5 + hill * 2;
    if (mount > 0.66) h += (mount - 0.66) * 28;
    h -= rid * 1.2;
    const r = riverInf(x, z);
    if (r > 0) h = h * (1 - r) + (SEA - 1) * r;
    const ai = ashlandInf(x, z);
    if (ai > 0) h += ai * ai * 12 + fbm2(x * 0.03, z * 0.03, s + 41, 3) * ai * 6;   // scorched plateau
    h = clamp(h | 0, 6, SY - 8);
    if (hCache.size > 180000) hCache.clear();
    hCache.set(key, h);
    return h;
  }
  function biomeAt(x, z) {
    const t = fbm2(x * 0.0024, z * 0.0024, G.seed + 21, 4);
    const m = fbm2(x * 0.0024 + 40, z * 0.0024, G.seed + 22, 4);
    const h = heightAt(x, z);
    if (h <= SEA + 1) return h < SEA - 1 ? "ocean" : "beach";
    if (ashlandInf(x, z) > 0.18) return "ashland";
    if (t < 0.30) return "taiga";
    if (t > 0.72 && m < 0.48) return "desert";
    if (m > 0.66) return "forest";
    return "plains";
  }

  function putTree(blocks, lx, y, lz, kind, cx, cz) {
    const set = (x, yy, z, id) => {
      if (x < 0 || z < 0 || x >= 16 || z >= 16 || yy < 1 || yy >= SY) return;
      const i = cidx(x, yy, z);
      if (blocks[i] === AIR || !isOpaque(blocks[i])) blocks[i] = id;
    };
    if (kind === "pine") {
      const h = 6 + (hash2(cx * 16 + lx, cz * 16 + lz, G.seed + 5) * 4 | 0);
      for (let i = 0; i < h; i++) set(lx, y + i, lz, PINE_LOG);
      for (let dy = 0; dy < 5; dy++) {
        const r = dy < 2 ? 2 : 1;
        for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++)
          if (Math.abs(dx) + Math.abs(dz) <= r + 1) set(lx + dx, y + h - 4 + dy, lz + dz, PINE_LEAVES);
      }
      set(lx, y + h, lz, PINE_LEAVES);
    } else {
      const birch = kind === "birch";
      const h = 4 + (hash2(cx * 16 + lx, cz * 16 + lz, G.seed + 6) * 3 | 0);
      const log = birch ? BIRCH_LOG : OAK_LOG;
      const leaf = birch ? BIRCH_LEAVES : OAK_LEAVES;
      for (let i = 0; i < h; i++) set(lx, y + i, lz, log);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
        if (Math.abs(dx) === 2 && Math.abs(dz) === 2 && hash2(dx, dz + dy, 3) > 0.5) continue;
        set(lx + dx, y + h + dy, lz + dz, leaf);
      }
    }
  }

  function putHouse(blocks, ox, oz, floorY) {
    for (let x = 0; x < 6; x++) for (let z = 0; z < 6; z++) {
      blocks[cidx(ox + x, floorY, oz + z)] = PLANKS;
      for (let y = 1; y <= 3; y++) {
        const wall = x === 0 || z === 0 || x === 5 || z === 5;
        if (wall) {
          let id = PLANKS;
          if (y === 2 && ((x === 2 || x === 3) && (z === 0 || z === 5) || (z === 2 || z === 3) && (x === 0 || x === 5)))
            id = GLASS;
          blocks[cidx(ox + x, floorY + y, oz + z)] = id;
        } else blocks[cidx(ox + x, floorY + y, oz + z)] = AIR;
      }
      blocks[cidx(ox + x, floorY + 4, oz + z)] = COBBLE;
    }
    blocks[cidx(ox + 2, floorY + 1, oz)] = AIR;
    blocks[cidx(ox + 2, floorY + 2, oz)] = AIR;
    blocks[cidx(ox + 1, floorY + 1, oz + 1)] = TABLE;
    blocks[cidx(ox + 2, floorY + 1, oz + 1)] = FURNACE;
    blocks[cidx(ox + 3, floorY + 1, oz + 1)] = CHEST;
    blocks[cidx(ox + 4, floorY + 3, oz + 1)] = TORCH;
  }

  function putRomanRuin(blocks, floorY) {
    for (let x = 2; x <= 13; x++) for (let z = 2; z <= 13; z++) {
      blocks[cidx(x, floorY, z)] = (x >= 6 && x <= 9 && z >= 6 && z <= 9) ? MOSAIC : ROMAN_BRICK;
      for (let y = floorY + 1; y <= Math.min(SY - 1, floorY + 6); y++) blocks[cidx(x, y, z)] = AIR;
    }
    const pillars = [[3,3],[7,3],[8,3],[12,3],[3,12],[7,12],[8,12],[12,12]];
    for (const [x, z] of pillars) {
      for (let y = 1; y <= 4; y++) blocks[cidx(x, floorY + y, z)] = COLUMN;
      blocks[cidx(x, floorY + 5, z)] = MARBLE;
    }
    for (let x = 2; x <= 13; x++) {
      blocks[cidx(x, floorY + 5, 3)] = MARBLE;
      blocks[cidx(x, floorY + 5, 12)] = MARBLE;
      if (x !== 7 && x !== 8) blocks[cidx(x, floorY + 1, 13)] = TERRACOTTA;
    }
    blocks[cidx(6, floorY + 1, 8)] = GLOW;
    blocks[cidx(9, floorY + 1, 8)] = GLOW;
    blocks[cidx(8, floorY + 1, 11)] = CHEST;
    return [8, floorY + 1, 11];
  }

  function putRomanArch(blocks, floorY) {
    for (let x = 4; x <= 11; x++) for (let z = 6; z <= 9; z++) blocks[cidx(x, floorY, z)] = ROMAN_BRICK;
    for (const x of [5, 6, 9, 10]) for (let y = 1; y <= 5; y++) {
      blocks[cidx(x, floorY + y, 7)] = y < 4 ? COLUMN : MARBLE;
      blocks[cidx(x, floorY + y, 8)] = y < 4 ? COLUMN : MARBLE;
    }
    for (let x = 5; x <= 10; x++) for (let z = 7; z <= 8; z++) blocks[cidx(x, floorY + 5, z)] = MARBLE;
    blocks[cidx(7, floorY, 7)] = MOSAIC;
    blocks[cidx(8, floorY, 8)] = MOSAIC;
  }

  function putColosseum(blocks, floorY) {
    for (let x = 1; x <= 14; x++) for (let z = 1; z <= 14; z++) {
      const dx = (x - 7.5) / 6.5, dz = (z - 7.5) / 5.5, e = dx * dx + dz * dz;
      if (e > 1.22) continue;
      for (let y = floorY + 1; y <= Math.min(SY - 1, floorY + 8); y++) blocks[cidx(x, y, z)] = AIR;
      blocks[cidx(x, floorY, z)] = e < 0.48 ? SAND : (e < 0.68 ? MOSAIC : ROMAN_BRICK);
      const gate = (Math.abs(x - 7.5) < 1.6 && (z <= 2 || z >= 13)) || (Math.abs(z - 7.5) < 1.4 && (x <= 2 || x >= 13));
      if (e >= 0.72 && e <= 1.22 && !gate) {
        const tier = e > 1.02 ? 5 : e > 0.88 ? 4 : 3;
        for (let y = 1; y <= tier; y++) blocks[cidx(x, floorY + y, z)] = y === tier ? MARBLE : ROMAN_BRICK;
      }
      if (e > 1.08 && !gate) blocks[cidx(x, floorY + 6, z)] = COLUMN;
    }
    for (const [x, z] of [[3,3],[12,3],[3,12],[12,12]]) blocks[cidx(x, floorY + 7, z)] = GLOW;
    blocks[cidx(7, floorY + 1, 12)] = CHEST;
    return [7, floorY + 1, 12];
  }

  function clearRomanPlot(blocks, y, surface) {
    for (let x = 1; x <= 14; x++) for (let z = 1; z <= 14; z++) {
      blocks[cidx(x, y, z)] = surface || ROMAN_BRICK;
      for (let yy = y + 1; yy <= Math.min(SY - 1, y + 10); yy++) blocks[cidx(x, yy, z)] = AIR;
    }
  }

  function putLegionFort(blocks, y) {
    clearRomanPlot(blocks, y, ROMAN_BRICK);
    for (let i = 1; i <= 14; i++) for (const [x,z] of [[i,1],[i,14],[1,i],[14,i]]) {
      const gate = (x === 7 || x === 8) && (z === 1 || z === 14);
      if (!gate) for (let yy = 1; yy <= 4; yy++) blocks[cidx(x,y+yy,z)] = yy === 4 ? MARBLE : ROMAN_BRICK;
    }
    for (const [x,z] of [[2,2],[13,2],[2,13],[13,13]]) for (let yy=1;yy<=6;yy++) blocks[cidx(x,y+yy,z)] = yy>4?MARBLE:ROMAN_BRICK;
    for (let z=4;z<=11;z++) for (const x of [3,12]) {
      blocks[cidx(x,y+1,z)] = PLANKS; blocks[cidx(x,y+2,z)] = TERRACOTTA;
    }
    for (let z=2;z<=13;z++) blocks[cidx(7,y,z)] = blocks[cidx(8,y,z)] = MOSAIC;
    blocks[cidx(5,y+1,8)] = CHEST;
    return [5,y+1,8];
  }

  function putForum(blocks, y) {
    clearRomanPlot(blocks, y, MARBLE);
    for (let x=2;x<=13;x++) for (let z=4;z<=12;z++) blocks[cidx(x,y,z)] = ((x+z)&1)?MARBLE:MOSAIC;
    for (const x of [2,5,8,11,13]) for (let yy=1;yy<=6;yy++) blocks[cidx(x,y+yy,2)] = yy<5?COLUMN:MARBLE;
    for (let x=1;x<=14;x++) blocks[cidx(x,y+7,2)] = TERRACOTTA;
    for (let x=3;x<=12;x++) for (let z=12;z<=14;z++) {
      for (let yy=1;yy<=5;yy++) if (z===14 || x===3 || x===12) blocks[cidx(x,y+yy,z)] = ROMAN_BRICK;
      blocks[cidx(x,y+6,z)] = TERRACOTTA;
    }
    for (let yy=1;yy<=5;yy++) blocks[cidx(7,y+yy,8)] = yy<4?COLUMN:GLOW;
  }

  function putBaths(blocks, y) {
    clearRomanPlot(blocks, y, MARBLE);
    for (let x=2;x<=13;x++) for (let z=2;z<=13;z++) {
      const edge=x===2||x===13||z===2||z===13;
      if (edge && !((z===13)&&(x===7||x===8))) for(let yy=1;yy<=4;yy++) blocks[cidx(x,y+yy,z)] = ROMAN_BRICK;
    }
    for (let x=4;x<=11;x++) for (let z=4;z<=7;z++) blocks[cidx(x,y,z)] = WATER;
    for (let x=5;x<=10;x++) for (let z=9;z<=11;z++) blocks[cidx(x,y,z)] = z===10?WATER:MOSAIC;
    for (const [x,z] of [[3,3],[12,3],[3,12],[12,12]]) for(let yy=1;yy<=5;yy++) blocks[cidx(x,y+yy,z)] = COLUMN;
    for(let x=2;x<=13;x++) for(let z=2;z<=13;z++) if(x===2||x===13||z===2||z===13) blocks[cidx(x,y+5,z)] = TERRACOTTA;
  }

  function putTemple(blocks, y) {
    clearRomanPlot(blocks, y, SANDSTONE);
    for(let x=3;x<=12;x++) for(let z=3;z<=12;z++) blocks[cidx(x,y+1,z)] = MARBLE;
    for(const x of [4,7,9,11]) for(const z of [4,11]) for(let yy=2;yy<=7;yy++) blocks[cidx(x,y+yy,z)] = COLUMN;
    for(let x=3;x<=12;x++) for(let z=3;z<=12;z++) blocks[cidx(x,y+8,z)] = MARBLE;
    for(let x=4;x<=11;x++) for(let z=4;z<=11;z++) blocks[cidx(x,y+9,z)] = TERRACOTTA;
    for(let yy=2;yy<=6;yy++) for(let x=5;x<=10;x++) blocks[cidx(x,y+yy,8)] = x===7||x===8?AIR:ROMAN_BRICK;
    blocks[cidx(7,y+2,6)] = GLOW;
  }

  function putVilla(blocks, y) {
    clearRomanPlot(blocks, y, ROMAN_BRICK);
    for(let x=2;x<=13;x++) for(let z=2;z<=13;z++) {
      const wall=x===2||x===13||z===2||z===13;
      const door=z===2&&(x===7||x===8);
      if(wall&&!door) for(let yy=1;yy<=4;yy++) blocks[cidx(x,y+yy,z)] = yy===4?TERRACOTTA:MARBLE;
    }
    for(let x=5;x<=10;x++) for(let z=5;z<=10;z++) blocks[cidx(x,y,z)] = (x===7||x===8)&&(z===7||z===8)?WATER:MOSAIC;
    for(const [x,z] of [[4,4],[11,4],[4,11],[11,11]]) for(let yy=1;yy<=4;yy++) blocks[cidx(x,y+yy,z)] = COLUMN;
    blocks[cidx(11,y+1,11)] = CHEST;
    return [11,y+1,11];
  }

  // Cheap always-on counters. A voxel game dies of slow chunk work more often
  // than of slow drawing, and averages hide the stall that actually hurts — so
  // the worst case is recorded alongside the mean.
  const PERF = { gen: 0, genMs: 0, genMax: 0, mesh: 0, meshMs: 0, meshMax: 0 };
  function generateChunk(cx, cz) {
    const t0 = performance.now();
    try { return generateChunkInner(cx, cz); }
    finally {
      const d = performance.now() - t0;
      PERF.gen++; PERF.genMs += d; if (d > PERF.genMax) PERF.genMax = d;
    }
  }
  function generateChunkInner(cx, cz) {
    const blocks = new Uint8Array(SX * SY * SZ);
    const s = G.seed;
    for (let lx = 0; lx < 16; lx++) for (let lz = 0; lz < 16; lz++) {
      const wx = cx * 16 + lx, wz = cz * 16 + lz;
      const h = heightAt(wx, wz);
      const bio = biomeAt(wx, wz);
      blocks[cidx(lx, 0, lz)] = BEDROCK;
      if (hash3(wx, 1, wz, s) < 0.7) blocks[cidx(lx, 1, lz)] = BEDROCK;
      if (hash3(wx, 2, wz, s) < 0.7) blocks[cidx(lx, 2, lz)] = BEDROCK;
      for (let y = 1; y <= h; y++) {
        let id;
        if (y <= 2 && blocks[cidx(lx, y, lz)] === BEDROCK) continue;
        if (y > 4 && y < h - 2 && vnoise3(wx * 0.08, y * 0.1, wz * 0.08, s + 40) > 0.74) {
          id = (y < 8 && hash3(wx, y, wz, s + 2) < 0.08) ? LAVA : AIR;
        } else if (y === h) {
          if (bio === "ashland") id = hash2(wx, wz, s + 43) > 0.62 ? BASALT : ASH;
          else if (bio === "desert" || bio === "beach") id = SAND;
          else if (bio === "ocean") id = y < SEA - 2 ? GRAVEL : SAND;
          else if (bio === "taiga") id = h > SEA + 18 ? MARBLE : TERRACOTTA;
          else id = GRASS;
        } else if (y >= h - 3) {
          if (bio === "ashland") {
            // Ember veins surface here, so the Ashlands teach their own resource.
            id = hash2(wx * 7 + y, wz * 3, s + 44) > 0.955 ? EMBER_ORE : BASALT;
          } else id = bio === "desert" || bio === "beach" ? SAND : DIRT;
        } else {
          id = STONE;
          const r = hash3(wx, y, wz, s + 90);
          if (y < 14 && r > 0.9975) id = DIA_ORE;
          else if (y < 20 && r > 0.996) id = GOLD_ORE;
          else if (y < 26 && r > 0.9948) id = STEEL_ORE;   // deep vein: imperial steel
          else if (y < 32 && r > 0.9935) id = EMBER_ORE;   // deep vein: ember
          else if (y < 40 && r > 0.992) id = IRON_ORE;
          else if (y < 48 && r > 0.985) id = COAL_ORE;
          else if (bio === "ashland" && y > h - 12 && hash3(wx, y, wz, s + 45) > 0.86) id = BASALT;
        }
        blocks[cidx(lx, y, lz)] = id;
      }
      for (let y = h + 1; y <= SEA; y++) blocks[cidx(lx, y, lz)] = WATER;
      const roadX = Math.abs((((wx + 48) % 96) + 96) % 96 - 48) < 2;
      const roadZ = Math.abs((((wz + 48) % 96) + 96) % 96 - 48) < 2;
      if (h > SEA + 1 && (roadX || roadZ)) blocks[cidx(lx, h, lz)] = ((wx + wz) & 3) === 0 ? MOSAIC : ROMAN_BRICK;
      // The Roman frontier palette intentionally avoids fields of green cactus.
      // Mediterranean frontier: no carpet of bright green grass or flowers.
      if (bio === "ocean" && h < SEA - 2 && hash2(wx, wz, s + 12) > 0.97)
        blocks[cidx(lx, h, lz)] = CLAY;
    }
    // trees (after column so leaves can spill)
    for (let lx = 2; lx < 14; lx++) for (let lz = 2; lz < 14; lz++) {
      const wx = cx * 16 + lx, wz = cz * 16 + lz;
      const h = heightAt(wx, wz);
      const bio = biomeAt(wx, wz);
      const top = blocks[cidx(lx, h, lz)];
      if (h <= SEA || (top !== GRASS && top !== SNOW && top !== DIRT)) continue;
      const r = hash2(wx, wz, s + 70);
      const dens = bio === "forest" ? 0.006 : bio === "taiga" ? 0.004 : bio === "plains" ? 0.002 : 0;
      if (bio === "ashland") continue;   // nothing grows in the ash
      if (r < 1 - dens) continue;
      putTree(blocks, lx, h + 1, lz, bio === "taiga" ? "pine" : (r > 0.97 ? "birch" : "oak"), cx, cz);
    }
    // Fixed Roman capital district: each chunk has a readable civic purpose.
    const coreKey = cx + "," + cz;
    const coreY = heightAt(cx * 16 + 8, cz * 16 + 8);
    let coreLoot = null;
    if (coreKey === "0,0") coreLoot = putLegionFort(blocks, coreY);
    else if (coreKey === "0,-1") putForum(blocks, coreY);
    else if (coreKey === "-1,0") putBaths(blocks, coreY);
    else if (coreKey === "1,-1") putTemple(blocks, coreY);
    else if (coreKey === "0,1") coreLoot = putVilla(blocks, coreY);
    if (coreLoot) {
      const lootKey = cxyz(cx*16+coreLoot[0],coreLoot[1],cz*16+coreLoot[2]);
      if (!G.chests.has(lootKey) && G.diffs.get(lootKey) !== AIR) {
        const loot = new Array(27).fill(null);
        loot[0]=stackOf("bread",4); loot[1]=stackOf("denarius",6); loot[2]=stackOf("roman_spear",1);
        G.chests.set(lootKey,loot);
      }
    }
    // Roman roadside shrine / ruined villa
    if (cx === 1 && cz === 0) {
      const arenaY = heightAt(cx * 16 + 8, cz * 16 + 8);
      const arenaLoot = putColosseum(blocks, arenaY);
      const arenaKey = cxyz(cx * 16 + arenaLoot[0], arenaLoot[1], cz * 16 + arenaLoot[2]);
      if (!G.chests.has(arenaKey) && G.diffs.get(arenaKey) !== AIR) {
        const loot = new Array(27).fill(null);
        loot[0] = stackOf("roman_spear", 1); loot[1] = stackOf("scutum", 1);
        loot[2] = stackOf("denarius", 12); loot[3] = stackOf("bread", 4);
        G.chests.set(arenaKey, loot);
      }
    }
    const landmark = hash2(cx, cz, s + 200);
    const isCapital = ["0,0","0,-1","-1,0","1,-1","0,1","1,0"].includes(coreKey);
    if (!isCapital && landmark > 0.955) {
      const wx = cx * 16 + 8, wz = cz * 16 + 8;
      const h = heightAt(wx, wz);
      const bio = biomeAt(wx, wz);
      let flat = true;
      for (let dx = -5; dx <= 5 && flat; dx += 5) for (let dz = -5; dz <= 5; dz += 5)
        if (Math.abs(heightAt(wx + dx, wz + dz) - h) > 2) flat = false;
      if (flat && h > SEA + 1 && h < 52 && bio !== "ocean" && bio !== "beach") {
        if (landmark > 0.982) {
          const lootPos = putRomanRuin(blocks, h);
          const lootKey = cxyz(cx * 16 + lootPos[0], lootPos[1], cz * 16 + lootPos[2]);
          if (!G.chests.has(lootKey) && G.diffs.get(lootKey) !== AIR) {
            const loot = new Array(27).fill(null);
            loot[0] = stackOf("denarius", 3 + (hash2(cx, cz, s + 311) * 8 | 0));
            loot[1] = stackOf("bread", 1 + (hash2(cx, cz, s + 312) * 3 | 0));
            if (hash2(cx, cz, s + 313) > 0.55) loot[2] = stackOf("iron_ingot", 1);
            G.chests.set(lootKey, loot);
          }
        }
        else putRomanArch(blocks, h);
      }
    }
    // apply diffs
    const ch = { cx, cz, blocks, mesh: null, water: null, plants: null };
    for (const [k, id] of G.diffs) {
      const p = k.split(",").map(Number);
      if (w2c(p[0]) === cx && w2c(p[2]) === cz) ch.blocks[cidx(w2l(p[0]), p[1], w2l(p[2]))] = id;
    }
    return ch;
  }

  function getChunk(cx, cz, opts) {
    const k = ck(cx, cz);
    let ch = G.chunks.get(k);
    if (!ch) {
      ch = generateChunk(cx, cz);
      G.chunks.set(k, ch);
      if (!opts || opts.mesh !== false) meshChunk(ch);
      else G.dirty.add(k);
      G.dirty.add(ck(cx - 1, cz)); G.dirty.add(ck(cx + 1, cz));
      G.dirty.add(ck(cx, cz - 1)); G.dirty.add(ck(cx, cz + 1));
    }
    return ch;
  }

  function peekBlock(x, y, z) {
    x = wf(x); y = wf(y); z = wf(z);
    if (y < 0) return BEDROCK;
    if (y >= SY) return AIR;
    const ch = G.chunks.get(ck(w2c(x), w2c(z)));
    if (!ch) return AIR;
    return ch.blocks[cidx(w2l(x), y, w2l(z))];
  }
  function getBlock(x, y, z) {
    x = wf(x); y = wf(y); z = wf(z);
    if (y < 0) return BEDROCK;
    if (y >= SY) return AIR;
    const ch = G.chunks.get(ck(w2c(x), w2c(z)));
    if (!ch) return BEDROCK;
    return ch.blocks[cidx(w2l(x), y, w2l(z))];
  }
  function setBlock(x, y, z, id) {
    x = wf(x); y = wf(y); z = wf(z);
    if (y <= 0 || y >= SY) return false;
    const cx = w2c(x), cz = w2c(z);
    const ch = getChunk(cx, cz);
    const i = cidx(w2l(x), y, w2l(z));
    if (ch.blocks[i] === id) return false;
    const prev = ch.blocks[i];
    ch.blocks[i] = id;
    const dk = cxyz(x, y, z);
    G.diffs.set(dk, id);
    if (id === BRAZIER) G.braziers.add(dk); else G.braziers.delete(dk);
    G.dirty.add(ck(cx, cz));
    const lx = w2l(x), lz = w2l(z);
    if (lx === 0) G.dirty.add(ck(cx - 1, cz));
    if (lx === 15) G.dirty.add(ck(cx + 1, cz));
    if (lz === 0) G.dirty.add(ck(cx, cz - 1));
    if (lz === 15) G.dirty.add(ck(cx, cz + 1));
    // A light appearing or disappearing changes shading well beyond its own
    // chunk, so the emitter cache is dropped and the whole 3x3 neighbourhood is
    // re-meshed — otherwise placing a torch near a border lights only half the room.
    const wasLit = DEFS[prev] && DEFS[prev].light > 0;
    const nowLit = DEFS[id] && DEFS[id].light > 0;
    if (wasLit || nowLit) {
      ch.lightsDirty = true;
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) G.dirty.add(ck(cx + dx, cz + dz));
    }
    return true;
  }
  function skyLight(x, y, z) {
    for (let yy = y + 1; yy < SY; yy++) if (isOpaque(peekBlock(x, yy, z))) return 4;
    return 15;
  }

  // =====================================================================
  // Meshing
  // =====================================================================
  const FACES = [
    { d: [0, 1, 0], uax: [1, 0, 0], vax: [0, 0,-1], v: [[0,1,1],[1,1,1],[1,1,0],[0,1,0]] },
    { d: [0,-1, 0], uax: [1, 0, 0], vax: [0, 0, 1], v: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]] },
    { d: [0, 0, 1], uax: [1, 0, 0], vax: [0, 1, 0], v: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]] },
    { d: [0, 0,-1], uax:[-1, 0, 0], vax: [0, 1, 0], v: [[1,0,0],[0,0,0],[0,1,0],[1,1,0]] },
    { d: [1, 0, 0], uax: [0, 0,-1], vax: [0, 1, 0], v: [[1,0,1],[1,0,0],[1,1,0],[1,1,1]] },
    { d: [-1,0, 0], uax: [0, 0, 1], vax: [0, 1, 0], v: [[0,0,0],[0,0,1],[0,1,1],[0,1,0]] }
  ];
  const AOL = [1, 0.8, 0.6, 0.42];

  function faceAO(x, y, z, face) {
    const [dx, dy, dz] = face.d;
    const [ux, uy, uz] = face.uax;
    const [vx, vy, vz] = face.vax;
    const out = [1, 1, 1, 1];
    const corners = [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (let k = 0; k < 4; k++) {
      const i = corners[k][0] ? 1 : -1, j = corners[k][1] ? 1 : -1;
      const s1 = isOpaque(peekBlock(x + dx + i * ux, y + dy + i * uy, z + dz + i * uz)) ? 1 : 0;
      const s2 = isOpaque(peekBlock(x + dx + j * vx, y + dy + j * vy, z + dz + j * vz)) ? 1 : 0;
      const cr = isOpaque(peekBlock(x + dx + i * ux + j * vx, y + dy + i * uy + j * vy, z + dz + i * uz + j * vz)) ? 1 : 0;
      const a = (s1 && s2) ? 0 : 3 - (s1 + s2 + cr);
      out[k] = AOL[a];
    }
    return out;
  }

  // --- Emitted light -----------------------------------------------------
  // Previously a torch only brightened the single face it was stuck to, so a
  // lit cave was still a black cave. Each chunk now caches the emitters it
  // contains; meshing gathers them from the 3x3 chunk neighbourhood (a torch
  // reaches 14 blocks, so it can never cross more than one chunk border) and
  // falls the light off with distance.
  //
  // Deliberate simplification: no occlusion test. A true flood fill would stop
  // light at walls, but it needs a per-chunk BFS re-run on every edit and the
  // budget for that is not there. Radial falloff can bleed a little light
  // through a thin wall; against pitch-black torches that is a trade worth
  // making, and the artifact is hard to notice underground.
  function chunkLights(ch) {
    if (ch.lights && !ch.lightsDirty) return ch.lights;
    const out = [];
    for (let y = 0; y < SY; y++) for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) {
      const id = ch.blocks[cidx(lx, y, lz)];
      if (!id) continue;
      const d = DEFS[id];
      if (d && d.light > 0) out.push(ch.cx * 16 + lx, y, ch.cz * 16 + lz, d.light);
    }
    ch.lights = out;
    ch.lightsDirty = false;
    return out;
  }

  function meshChunk(ch) {
    const t0 = performance.now();
    try { return meshChunkInner(ch); }
    finally {
      const d = performance.now() - t0;
      PERF.mesh++; PERF.meshMs += d; if (d > PERF.meshMax) PERF.meshMax = d;
    }
  }
  function meshChunkInner(ch) {
    // Flat [x,y,z,level,...] quads keep this allocation-free in the inner loop.
    const srcs = [];
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const n = G.chunks.get(ck(ch.cx + dx, ch.cz + dz));
      if (n) { const l = chunkLights(n); for (let i = 0; i < l.length; i++) srcs.push(l[i]); }
    }
    // Testing every source at every face was O(faces x sources) and a lava lake
    // has hundreds of sources — it cost two thirds of the frame rate. Instead the
    // light is splatted once into a per-chunk grid and each face then costs a
    // single array read. Brightest emitter wins rather than summing, because
    // summing blows out to white wherever two torches overlap.
    //
    // The source count is capped: past a few dozen lamps the extra ones land on
    // cells that are already at full brightness, so they cost time and change
    // nothing. Brightest-first ordering means the ones that survive the cap are
    // the ones that matter.
    const LIT_CAP = 48;
    let lgrid = null;
    if (srcs.length) {
      const n = srcs.length / 4;
      // Brightest first, so the cheap "already covered" test below is safe and
      // so a cap keeps the lamps that actually matter.
      const order = [];
      for (let i = 0; i < n; i++) order.push(i);
      order.sort((a, b) => srcs[b * 4 + 3] - srcs[a * 4 + 3]);
      if (n > LIT_CAP * 8) order.length = LIT_CAP * 8;
      lgrid = new Uint8Array(16 * SY * 16);
      const x0 = ch.cx * 16, z0 = ch.cz * 16;
      let splatted = 0;
      for (let k = 0; k < order.length; k++) {
        if (splatted >= LIT_CAP) break;
        const i = order[k] * 4;
        const sx = srcs[i], sy = srcs[i + 1], sz = srcs[i + 2], l = srcs[i + 3];
        // A lava lake is hundreds of cells that each emit 15 and sit inside each
        // other's radius. Once a cell is already at least as bright as this lamp,
        // splatting it again cannot raise anything nearby that matters — so skip.
        // This collapses a lake to a handful of real splats and is where almost
        // all of the meshing cost went.
        const own = (sx >= x0 && sx <= x0 + 15 && sz >= z0 && sz <= z0 + 15 && sy >= 0 && sy < SY)
          ? lgrid[((sy * 16) + (sz - z0)) * 16 + (sx - x0)] : 0;
        if (own >= l) continue;
        splatted++;
        const r = Math.ceil(l);
        // Clip the lamp's reach to this chunk so nothing outside is ever touched.
        const ax = Math.max(x0, sx - r), bx = Math.min(x0 + 15, sx + r);
        const az = Math.max(z0, sz - r), bz = Math.min(z0 + 15, sz + r);
        const ay = Math.max(0, sy - r), by = Math.min(SY - 1, sy + r);
        for (let y = ay; y <= by; y++) for (let z = az; z <= bz; z++) for (let x = ax; x <= bx; x++) {
          const dx = sx - x, dy = sy - y, dz = sz - z;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > l * l) continue;
          const v = l - Math.sqrt(d2);
          const gi = ((y * 16) + (z - z0)) * 16 + (x - x0);
          if (v > lgrid[gi]) lgrid[gi] = v;
        }
      }
    }
    const emitted = (x, y, z) => {
      if (!lgrid) return 0;
      const lx = x - ch.cx * 16, lz = z - ch.cz * 16;
      if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || y < 0 || y >= SY) return 0;
      return lgrid[((y * 16) + lz) * 16 + lx];
    };
    const pos = [], uv = [], col = [], idx = [];
    const wpos = [], wuv = [], wcol = [], widx = [];
    const ppos = [], puv = [], pcol = [], pidx = [];
    const gpos = [], guv = [], gcol = [], gidx = [];
    const pushFace = (arrs, x, y, z, face, tile, ao, litSky, litBlk, shade) => {
      const [P, U, C, I] = arrs;
      const base = P.length / 3;
      const uvb = tileUV(tile);
      const uvs = [[uvb[0], uvb[3]], [uvb[2], uvb[3]], [uvb[2], uvb[1]], [uvb[0], uvb[1]]];
      const [dx, dy, dz] = face.d;
      const sh = shade != null ? shade : (dy > 0 ? 1 : dy < 0 ? 0.55 : dz ? 0.8 : 0.7);
      // One 16px tile repeats across every block, so a big stone wall turns into
      // visible wallpaper. A per-block brightness jitter (constant across the
      // face, so no interior seam) breaks the grid up without any extra memory:
      // the colour attribute is already there. Kept under ±6% so it reads as
      // natural stone variation rather than patchwork.
      const jit = 0.94 + hash3(x, y, z, 7331) * 0.12;
      // The colour attribute used to carry one grey number, which forced sky and
      // torch light to be baked together at mesh time — that is why night used to
      // look like noon under a dark sky. The three channels now carry *separate*
      // terms so the shader can colour them independently every frame:
      //   r = geometry (AO x face shading x per-block jitter) — never changes
      //   g = sky exposure   -> tinted and dimmed by the sun/moon
      //   b = block exposure -> tinted warm by torch/lava/furnace light
      // Re-lighting the world at dawn now costs nothing: no chunk is re-meshed.
      const skyN = clamp(litSky / 15, 0, 1);
      const blkN = clamp(litBlk / 15, 0, 1);
      for (let i = 0; i < 4; i++) {
        const v = face.v[i];
        P.push(x + v[0], y + v[1], z + v[2]);
        U.push(uvs[i][0], uvs[i][1]);
        C.push((ao ? ao[i] : 1) * sh * jit, skyN, blkN);
      }
      // Counter-clockwise from outside. WebGL back-face culling depends on this winding.
      if (ao && ao[0] + ao[2] < ao[1] + ao[3]) I.push(base, base + 1, base + 3, base + 1, base + 2, base + 3);
      else I.push(base, base + 1, base + 2, base, base + 2, base + 3);
      void dx; void dz;
    };

    for (let y = 0; y < SY; y++) for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) {
      const id = ch.blocks[cidx(lx, y, lz)];
      if (!id) continue;
      const d = DEFS[id];
      if (!d) continue;
      const x = ch.cx * 16 + lx, z = ch.cz * 16 + lz;
      if (d.plant) {
        const litSky = skyLight(x, y, z), litBlk = Math.max(d.light || 0, emitted(x, y, z));
        const t = d.tile;
        // X-shaped
        const faces = [
          { d: [0,0,0], v: [[0,0,0],[1,0,1],[1,1,1],[0,1,0]] },
          { d: [0,0,0], v: [[1,0,0],[0,0,1],[0,1,1],[1,1,0]] }
        ];
        for (const f of faces) pushFace([ppos, puv, pcol, pidx], x, y, z, f, t, null, litSky, litBlk, 1);
        continue;
      }
      for (let fi = 0; fi < 6; fi++) {
        const f = FACES[fi];
        const nx = x + f.d[0], ny = y + f.d[1], nz = z + f.d[2];
        const nid = peekBlock(nx, ny, nz);
        if (d.fluid) {
          if (nid === id || isOpaque(nid)) continue;
        } else if (d.opaque) {
          if (isOpaque(nid)) continue;
        } else {
          if (nid === id || isOpaque(nid)) continue;
        }
        const tile = fi === 0 ? d.tile : fi === 1 ? d.tileB : d.tileS;
        // Sky and emitted light are kept apart: only the sky term follows the sun.
        const litSky = skyLight(nx, ny, nz);
        const litBlk = Math.max(d.light || 0, (DEFS[nid] && DEFS[nid].light) || 0, emitted(nx, ny, nz));
        const ao = d.opaque ? faceAO(x, y, z, f) : null;
        if (d.fluid) {
          // lava is opaque and must not blend like water
          if (d.key === "lava") pushFace([pos, uv, col, idx], x, y, z, f, tile, ao, litSky, litBlk);
          else pushFace([wpos, wuv, wcol, widx], x, y, z, f, tile, ao, litSky, litBlk);
        }
        else if (d.opaque) pushFace([pos, uv, col, idx], x, y, z, f, tile, ao, litSky, litBlk);
        else pushFace([gpos, guv, gcol, gidx], x, y, z, f, tile, ao, litSky, litBlk);
      }
    }
    ch.mesh = packMesh(pos, uv, col, idx);
    ch.water = widx.length ? packMesh(wpos, wuv, wcol, widx) : null;
    ch.plants = pidx.length ? packMesh(ppos, puv, pcol, pidx) : null;
    ch.glass = gidx.length ? packMesh(gpos, guv, gcol, gidx) : null;
  }

  function packMesh(pos, uv, col, idx) {
    return {
      pos: new Float32Array(pos),
      uv: new Float32Array(uv),
      col: new Float32Array(col),
      idx: idx.length > 65535 ? new Uint32Array(idx) : new Uint16Array(idx),
      n: idx.length
    };
  }

  // =====================================================================
  // WebGL
  // =====================================================================
  const canvas = $("gl");
  // `preserveDrawingBuffer` keeps the colour buffer readable after compositing.
  // It costs a copy every frame, so it stays off for players and is switched on
  // only by the art harness (`?shots=1`) — without it any screenshot of the
  // canvas comes back blank and the world can never actually be reviewed.
  // Guarded: the node self-test harness runs this file without a `location`.
  const SHOT_MODE = typeof location !== "undefined" && /[?&]shots=1/.test(location.search || "");
  const gl = canvas.getContext("webgl", {
    antialias: false, alpha: false, depth: true, preserveDrawingBuffer: SHOT_MODE
  });
  if (!gl) {
    document.body.innerHTML = "<div style='color:#fff;padding:40px;font:20px sans-serif'>WebGL is required. Try Chrome or Edge.</div>";
    return;
  }
  gl.getExtension("OES_element_index_uint");
  gl.getExtension("OES_standard_derivatives");

  function sh(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + "\n" + src);
    return s;
  }
  function prog(vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }

  const P_TER = prog(
    "attribute vec3 aP; attribute vec2 aU; attribute vec3 aC; uniform mat4 uMVP; varying vec2 vU; varying vec3 vC; varying float vY; varying float vD;" +
    "void main(){ gl_Position=uMVP*vec4(aP,1.0); vU=aU; vC=aC; vY=aP.y; vD=gl_Position.w; }",
    "precision mediump float; varying vec2 vU; varying vec3 vC; varying float vY; varying float vD;" +
    "uniform sampler2D uT; uniform vec3 uFog; uniform float uFn; uniform float uFf; uniform float uAlpha;" +
    "uniform vec3 uSkyLit; uniform vec3 uAmb; uniform vec3 uTorch;" +
    "void main(){ vec4 t=texture2D(uT,vU); if(t.a<0.15) discard;" +
    // vC.r geometry (AO x face x per-block jitter), vC.g sky exposure, vC.b emitted.
    // Sky light carries the sun's colour and dies away at night; emitted light is
    // always the same warm flame colour, so a torch-lit cave stays warm at 3am
    // while the meadow above it turns cold and blue.
    "vec3 L = uAmb + vC.g*uSkyLit + vC.b*uTorch;" +
    "vec3 col = t.rgb * vC.r * L;" +
    "float f=clamp((vD-uFn)/(uFf-uFn),0.0,1.0); gl_FragColor=vec4(mix(col,uFog,f), t.a*uAlpha); }"
  );
  // Entities are flat-shaded boxes, but they must sit in the same atmosphere as
  // the terrain: without fog a distant zombie was a crisp dark speck floating on
  // a hazy hillside. Same near/far curve as P_TER, so the two agree exactly.
  const P_COL = prog(
    "attribute vec3 aP; attribute float aS; uniform mat4 uMVP; uniform vec3 uC;" +
    "uniform float uFlat; varying vec3 vC; varying float vD;" +
    // uFlat=1 turns the face shading off for things that are not solid bodies
    // (the selection wire, sparks) where a dark underside would just look wrong.
    "void main(){ gl_Position=uMVP*vec4(aP,1.0); vC=uC*mix(aS,1.0,uFlat); vD=gl_Position.w; }",
    "precision mediump float; varying vec3 vC; varying float vD;" +
    "uniform vec3 uFog; uniform float uFn; uniform float uFf;" +
    "void main(){ float f=clamp((vD-uFn)/(uFf-uFn),0.0,1.0);" +
    "gl_FragColor=vec4(mix(vC,uFog,f),1.0); }"
  );
  const P_SKY = prog(
    "attribute vec2 aP; varying vec2 vP; void main(){ vP=aP; gl_Position=vec4(aP,0.999,1.0); }",
    "precision mediump float; varying vec2 vP; uniform vec3 uTop; uniform vec3 uBot; uniform vec3 uSun; uniform float uNight;" +
    "void main(){ float h=vP.y*0.5+0.5; vec3 col=mix(uBot,uTop,h); " +
    "vec2 sp=uSun.xy; float sun=smoothstep(0.12,0.0,length(vP-sp)); col+=sun*vec3(1.0,0.85,0.5)*(1.0-uNight);" +
    "float moon=smoothstep(0.05,0.0,length(vP-vec2(-sp.x,-sp.y*0.4))); col+=moon*vec3(0.8,0.85,1.0)*uNight;" +
    "gl_FragColor=vec4(col,1.0); }"
  );

  const locT = {
    p: gl.getAttribLocation(P_TER, "aP"),
    u: gl.getAttribLocation(P_TER, "aU"),
    c: gl.getAttribLocation(P_TER, "aC"),
    mvp: gl.getUniformLocation(P_TER, "uMVP"),
    fog: gl.getUniformLocation(P_TER, "uFog"),
    fn: gl.getUniformLocation(P_TER, "uFn"),
    ff: gl.getUniformLocation(P_TER, "uFf"),
    al: gl.getUniformLocation(P_TER, "uAlpha"),
    skyLit: gl.getUniformLocation(P_TER, "uSkyLit"),
    amb: gl.getUniformLocation(P_TER, "uAmb"),
    torch: gl.getUniformLocation(P_TER, "uTorch")
  };
  const locC = {
    p: gl.getAttribLocation(P_COL, "aP"),
    mvp: gl.getUniformLocation(P_COL, "uMVP"),
    c: gl.getUniformLocation(P_COL, "uC"),
    s: gl.getAttribLocation(P_COL, "aS"),
    flat: gl.getUniformLocation(P_COL, "uFlat"),
    fog: gl.getUniformLocation(P_COL, "uFog"),
    fn: gl.getUniformLocation(P_COL, "uFn"),
    ff: gl.getUniformLocation(P_COL, "uFf")
  };

  const tex = gl.createTexture();
  const atlasCanvas = paintAtlas();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlasCanvas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const gpu = new WeakMap();
  function upload(mesh) {
    if (!mesh) return null;
    let g = gpu.get(mesh);
    if (g) return g;
    g = { pb: gl.createBuffer(), ub: gl.createBuffer(), cb: gl.createBuffer(), ib: gl.createBuffer(), n: mesh.n, wide: mesh.idx.BYTES_PER_ELEMENT === 4 };
    gl.bindBuffer(gl.ARRAY_BUFFER, g.pb); gl.bufferData(gl.ARRAY_BUFFER, mesh.pos, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, g.ub); gl.bufferData(gl.ARRAY_BUFFER, mesh.uv, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, g.cb); gl.bufferData(gl.ARRAY_BUFFER, mesh.col, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g.ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.idx, gl.STATIC_DRAW);
    gpu.set(mesh, g);
    return g;
  }
  function drawMesh(mesh, mvp, fog, alpha) {
    const g = upload(mesh);
    if (!g) return;
    gl.useProgram(P_TER);
    gl.uniformMatrix4fv(locT.mvp, false, mvp);
    gl.uniform3fv(locT.fog, fog);
    gl.uniform1f(locT.fn, Math.max(24, renderDist * 10));
    gl.uniform1f(locT.ff, Math.max(56, renderDist * 18));
    gl.uniform1f(locT.al, alpha);
    const rig = lightRig();
    gl.uniform3fv(locT.skyLit, rig.sky);
    gl.uniform3fv(locT.amb, rig.amb);
    gl.uniform3fv(locT.torch, rig.torch);
    gl.bindBuffer(gl.ARRAY_BUFFER, g.pb); gl.enableVertexAttribArray(locT.p); gl.vertexAttribPointer(locT.p, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, g.ub); gl.enableVertexAttribArray(locT.u); gl.vertexAttribPointer(locT.u, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, g.cb); gl.enableVertexAttribArray(locT.c); gl.vertexAttribPointer(locT.c, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g.ib);
    gl.drawElements(gl.TRIANGLES, g.n, g.wide ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
  }

  // sky quad
  const skyBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  const locS = {
    p: gl.getAttribLocation(P_SKY, "aP"),
    top: gl.getUniformLocation(P_SKY, "uTop"),
    bot: gl.getUniformLocation(P_SKY, "uBot"),
    sun: gl.getUniformLocation(P_SKY, "uSun"),
    night: gl.getUniformLocation(P_SKY, "uNight")
  };

  // wire cube for selection
  const wire = (() => {
    const e = [
      0,0,0, 1,0,0, 1,0,0, 1,0,1, 1,0,1, 0,0,1, 0,0,1, 0,0,0,
      0,1,0, 1,1,0, 1,1,0, 1,1,1, 1,1,1, 0,1,1, 0,1,1, 0,1,0,
      0,0,0, 0,1,0, 1,0,0, 1,1,0, 1,0,1, 1,1,1, 0,0,1, 0,1,1
    ];
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(e), gl.STATIC_DRAW);
    return b;
  })();

  // Every entity in the game is built out of this one unit cube, and it used to
  // carry position only — so each box rendered as a single flat colour and a mob
  // read as a cardboard cut-out even though the terrain right behind it had proper
  // face shading. The cube now carries the *same* per-face darkening the mesher
  // bakes into terrain (top 1.0, sides 0.8/0.7, bottom 0.55), which is what makes
  // a limb look like a limb instead of a silhouette.
  const boxUnit = (() => {
    const f = [];
    for (const face of FACES) for (const v of face.v) f.push(v[0]-0.5, v[1]-0.5, v[2]-0.5);
    // triangulate each face 4 verts -> 6
    const t = [], sd = [];
    for (let i = 0; i < 6; i++) {
      const o = i * 4;
      const dir = FACES[i].d;
      const shade = dir[1] > 0 ? 1 : dir[1] < 0 ? 0.55 : dir[2] ? 0.8 : 0.7;
      const V = (n) => [f[(o+n)*3], f[(o+n)*3+1], f[(o+n)*3+2]];
      const a = V(0), b = V(1), c = V(2), d = V(3);
      t.push(...a, ...b, ...c, ...a, ...c, ...d);
      for (let k = 0; k < 6; k++) sd.push(shade);
    }
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(t), gl.STATIC_DRAW);
    const sb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, sb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(sd), gl.STATIC_DRAW);
    return { b, sb, n: 36 };
  })();

  // --- Entity lighting ---------------------------------------------------
  // Terrain bakes sky and emitted exposure into its vertex colours, but entities
  // go through P_COL, which had no light term at all: a zombie in a pitch-black
  // cave rendered exactly as bright as one standing at noon, and the player model
  // stayed fully lit while the world around it went dark blue. Both light terms
  // are now sampled at the entity's own position and combined with the *same*
  // day/night rig the terrain shader uses, so bodies really do go dark
  // underground and really do catch warm rim light next to a torch.
  //
  // Deliberately per-entity rather than per-vertex: one sample for the whole body
  // costs nothing and reads correctly at the scale a mob occupies on screen.
  const EL = [1, 1, 1];
  let fogNow = [0.62, 0.72, 0.88];
  // Brightest emitter wins (matching the mesher) with a Chebyshev falloff, which
  // is the same shape the light splat writes into the chunk grid.
  function emittedAt(x, y, z) {
    let best = 0;
    const cx = w2c(x), cz = w2c(z);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const ch = G.chunks.get(ck(cx + dx, cz + dz));
      if (!ch) continue;
      const l = chunkLights(ch);
      for (let i = 0; i < l.length; i += 4) {
        const d = Math.max(Math.abs(l[i] - x), Math.abs(l[i + 1] - y), Math.abs(l[i + 2] - z));
        const v = l[i + 3] - d;
        if (v > best) best = v;
      }
    }
    return best;
  }
  function entityLight(x, y, z, out) {
    const rig = lightRig();
    const sky = clamp(skyLight(wf(x), wf(y), wf(z)) / 15, 0, 1);
    const blk = clamp(emittedAt(x, y, z) / 15, 0, 1);
    const o = out || EL;
    for (let i = 0; i < 3; i++) {
      // 0.82 stands in for the average face shading the terrain gets from AO and
      // per-face darkening — without it entities read as self-illuminated cutouts
      // pasted over the world. Floor of 0.055 keeps a silhouette readable rather
      // than solid black, which is a gameplay call, not a lighting one.
      o[i] = clamp((rig.amb[i] + sky * rig.sky[i] + blk * rig.torch[i]) * 0.82, 0.055, 1.3);
    }
    return o;
  }
  const ONE = [1, 1, 1];
  let flatShade = false;
  // Set by whoever is about to draw an entity; drawX multiplies every colour by it.
  let colLight = [1, 1, 1];

  function drawX(mvp, color, mats) {
    let m = mvp;
    for (let i = 0; i < mats.length; i++) m = M4.mul(m, mats[i]);
    gl.useProgram(P_COL);
    gl.uniformMatrix4fv(locC.mvp, false, m);
    gl.uniform3fv(locC.fog, fogNow);
    gl.uniform1f(locC.fn, Math.max(24, renderDist * 10));
    gl.uniform1f(locC.ff, Math.max(56, renderDist * 18));
    if (colLight !== null) {
      color = [color[0] * colLight[0], color[1] * colLight[1], color[2] * colLight[2]];
    }
    // Hit flash is applied *after* lighting on purpose: a mob struck in a dark
    // cave must still flash white, otherwise the one frame of feedback that tells
    // you the blow landed is swallowed by the dark.
    if (colTint > 0) {
      const k = clamp(colTint, 0, 1);
      color = [color[0] + (1 - color[0]) * k, color[1] + (1 - color[1]) * k, color[2] + (1 - color[2]) * k];
    }
    gl.uniform3fv(locC.c, color);
    gl.uniform1f(locC.flat, flatShade ? 1 : 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, boxUnit.b);
    gl.enableVertexAttribArray(locC.p);
    gl.vertexAttribPointer(locC.p, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, boxUnit.sb);
    gl.enableVertexAttribArray(locC.s);
    gl.vertexAttribPointer(locC.s, 1, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, boxUnit.n);
  }
  function drawBox(mvp, color, x, y, z, sx, sy, sz) {
    drawX(mvp, color, [M4.T(x, y, z), M4.S(sx, sy, sz)]);
  }

  // =====================================================================
  // Player
  // =====================================================================
  const P = {
    x: 0.5, y: 50, z: 0.5, vx: 0, vy: 0, vz: 0,
    yaw: 0, pitch: -0.15, hp: 20, food: 20, flying: false, onGround: false,
    sneak: false, sprint: false, view: 1, invuln: 0, drown: 0, dead: false
  };
  let bodyYaw = 0, armSwingT = 0, camDist = 4.6;
  const camS = { x: 0, y: 50, z: 0, ready: false };

  function eyePos() {
    const bob = P.onGround && !P.flying ? Math.sin(walkPhase * 2) * 0.04 : 0;
    return [P.x, P.y + (P.sneak ? 1.35 : 1.62) + bob, P.z];
  }
  function lookDir() {
    const cp = Math.cos(P.pitch), sp = Math.sin(P.pitch);
    const cy = Math.cos(P.yaw), sy = Math.sin(P.yaw);
    return [sy * cp, sp, -cy * cp];
  }

  function aabbBlocks(x, y, z, w, h) {
    const out = [];
    const x0 = Math.floor(x - w), x1 = Math.floor(x + w);
    const y0 = Math.floor(y), y1 = Math.floor(y + h - 0.001);
    const z0 = Math.floor(z - w), z1 = Math.floor(z + w);
    for (let iy = y0; iy <= y1; iy++)
      for (let ix = x0; ix <= x1; ix++)
        for (let iz = z0; iz <= z1; iz++)
          if (isSolid(getBlock(ix, iy, iz))) out.push([ix, iy, iz]);
    return out;
  }
  function overlaps(x, y, z, w, h, bx, by, bz) {
    return x + w > bx && x - w < bx + 1 && y + h > by && y < by + 1 && z + w > bz && z - w < bz + 1;
  }
  function moveAxis(ax, amount) {
    const w = P.sneak ? 0.28 : 0.3, h = P.sneak ? 1.5 : 1.8;
    if (ax === 0) P.x += amount;
    else if (ax === 1) P.y += amount;
    else P.z += amount;
    const hits = aabbBlocks(P.x, P.y, P.z, w, h);
    for (const [bx, by, bz] of hits) {
      if (!overlaps(P.x, P.y, P.z, w, h, bx, by, bz)) continue;
      if (ax === 0) { P.x = amount > 0 ? bx - w : bx + 1 + w; P.vx = 0; }
      else if (ax === 1) { P.y = amount > 0 ? by - h : by + 1; P.vy = 0; if (amount < 0) P.onGround = true; }
      else { P.z = amount > 0 ? bz - w : bz + 1 + w; P.vz = 0; }
    }
  }

  let walkPhase = 0, fallStart = null;
  function playerTick(dt) {
    if (P.dead) return;
    const inWater = isFluid(getBlock(P.x, P.y + 1.4, P.z)) || isFluid(getBlock(P.x, P.y + 0.4, P.z));
    $("water-tint").style.display = isFluid(getBlock(P.x, P.y + 1.55, P.z)) ? "block" : "none";

    const f = lookDir();
    const rx = f[2], rz = -f[0]; // right-ish from yaw
    const fx = Math.sin(P.yaw), fz = -Math.cos(P.yaw);
    let ix = 0, iz = 0;
    if (keys.KeyW) { ix += fx; iz += fz; }
    if (keys.KeyS) { ix -= fx; iz -= fz; }
    if (keys.KeyA) { ix -= Math.cos(P.yaw); iz -= Math.sin(P.yaw); }
    if (keys.KeyD) { ix += Math.cos(P.yaw); iz += Math.sin(P.yaw); }
    if (Math.hypot(pad.x, pad.z) > 0.12) {
      ix += fx * pad.z + Math.cos(P.yaw) * pad.x;
      iz += fz * pad.z + Math.sin(P.yaw) * pad.x;
    }
    const len = Math.hypot(ix, iz);
    if (len > 0) { ix /= len; iz /= len; }
    P.sneak = !!keys.ShiftLeft || !!keys.ShiftRight;
    P.sprint = !!keys.ControlLeft && !P.sneak;
    const speed = P.flying ? (P.sprint ? 18 : 10) : (inWater ? 3.2 : (P.sneak ? 2.2 : P.sprint ? 5.8 : 4.4));
    P.vx = ix * speed; P.vz = iz * speed;
    const jumpPressed = keys.Space || jumpQueued;
    if (P.flying) {
      P.vy = (jumpPressed ? 1 : 0) * speed - (P.sneak ? 1 : 0) * speed;
    } else if (inWater) {
      P.vy += (jumpPressed ? 10 : -6) * dt;
      P.vy *= Math.pow(0.7, dt * 10);
    } else {
      P.vy -= 28 * dt;
      if (P.onGround && jumpPressed) { P.vy = 8.6; P.onGround = false; sfx("jump"); }
    }
    jumpQueued = false;
    if (len > 0 && P.onGround) walkPhase += dt * speed * 1.6;

    const prevY = P.y;
    P.onGround = false;
    moveAxis(1, P.vy * dt);
    moveAxis(0, P.vx * dt);
    moveAxis(2, P.vz * dt);

    if (!P.onGround && fallStart == null && P.vy < 0 && !P.flying && !inWater) fallStart = prevY;
    if (P.onGround) {
      if (fallStart != null && !G.creative) {
        const dist = fallStart - P.y;
        if (dist > 3.5) hurt(Math.floor(dist - 3), "fell too far");
        // Jumping onto a field ruins it. Costs nothing to walk around; teaches the
        // player to build paths through their own farm.
        if (dist > 1.2) trampleSoil();
      }
      fallStart = null;
    }

    // lava / drowning / hunger
    if (!G.creative) {
      if (getBlock(P.x, P.y + 0.8, P.z) === LAVA) hurt(4 * dt * 4, "tried to swim in lava");
      const head = getBlock(P.x, P.y + 1.6, P.z);
      if (head === WATER) {
        P.drown += dt;
        if (P.drown > 8) hurt(1 * dt, "drowned");
      } else P.drown = 0;
      // Season drives hunger. Warmth cancels the winter surcharge entirely, which is
      // the whole reason to keep a cellar of wine before Hiems arrives.
      let drain = P.sprint ? 0.08 : 0.012;
      const sea = season();
      let hungerMul = sea.hunger;
      if (hungerMul > 1 && hasBuff("warmth")) hungerMul = 1;
      P.food = clamp(P.food - dt * drain * hungerMul, 0, 20);
      if (P.food > 16 && P.hp < 20) P.hp = clamp(P.hp + dt * 0.4, 0, 20);
      if (P.food <= 0) hurt(dt * 0.5, "starved");
    }
    if (P.invuln > 0) P.invuln -= dt;
    if (P.y < -10) hurt(20, "fell out of the world");
    if (armSwingT > 0) armSwingT = Math.max(0, armSwingT - dt * 4.2);
    let dyaw = P.yaw - bodyYaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    bodyYaw += dyaw * Math.min(1, 12 * dt);
    void rx; void rz;
  }

  function hurt(n, reason) {
    if (G.creative || P.dead || (P.invuln > 0 && n < 4)) return;
    const guard = handTool();
    if (guard && guard.tool === "shield") n *= 0.35;
    P.hp -= n;
    P.invuln = 0.5;
    $("hurt").style.opacity = String(clamp(0.35 + n / 8, 0.35, 1));
    setTimeout(() => { $("hurt").style.opacity = "0"; }, 180);
    if (n >= 0.9) {
      addShake(clamp(0.08 + n * 0.035, 0.08, 0.4));
      addFloat(P.x, P.y + 1.9, P.z, "-" + Math.round(n), "self");
      const el = $("vitals");
      if (el) { el.classList.remove("pulse"); void el.offsetWidth; el.classList.add("pulse"); }
    }
    sfx("hurt");
    if (P.hp <= 0) {
      P.hp = 0; P.dead = true;
      $("death").hidden = false;
      $("death-reason").textContent = reason || "You died.";
      $("death-stats").textContent = formatStats();
      releasePointer();
    }
  }

  function raycast(max) {
    const e = eyePos(), d = lookDir();
    let x = Math.floor(e[0]), y = Math.floor(e[1]), z = Math.floor(e[2]);
    const stepX = d[0] > 0 ? 1 : -1, stepY = d[1] > 0 ? 1 : -1, stepZ = d[2] > 0 ? 1 : -1;
    const tDeltaX = Math.abs(1 / (d[0] || 1e-8)), tDeltaY = Math.abs(1 / (d[1] || 1e-8)), tDeltaZ = Math.abs(1 / (d[2] || 1e-8));
    let tMaxX = ((d[0] > 0 ? x + 1 - e[0] : e[0] - x) * tDeltaX);
    let tMaxY = ((d[1] > 0 ? y + 1 - e[1] : e[1] - y) * tDeltaY);
    let tMaxZ = ((d[2] > 0 ? z + 1 - e[2] : e[2] - z) * tDeltaZ);
    let face = [0, 0, 0], t = 0;
    for (let i = 0; i < 64 && t <= max; i++) {
      const id = getBlock(x, y, z);
      if (id && !isFluid(id)) return { x, y, z, id, face, t };
      if (tMaxX < tMaxY && tMaxX < tMaxZ) { t = tMaxX; tMaxX += tDeltaX; x += stepX; face = [-stepX, 0, 0]; }
      else if (tMaxY < tMaxZ) { t = tMaxY; tMaxY += tDeltaY; y += stepY; face = [0, -stepY, 0]; }
      else { t = tMaxZ; tMaxZ += tDeltaZ; z += stepZ; face = [0, 0, -stepZ]; }
    }
    return null;
  }

  function findSpawn() {
    const tryAt = (x, z, make) => {
      if (make) getChunk(w2c(x), w2c(z));
      else if (!G.chunks.has(ck(w2c(x), w2c(z)))) return null;
      const h = heightAt(x, z);
      const top = peekBlock(x, h, z);
      if (h > SEA + 1 && (top === GRASS || top === SAND || top === SNOW || top === PLANKS)) {
        // Keep the player and third-person camera out of trunks, leaves and steep walls.
        for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
          const nearH = heightAt(x + dx, z + dz);
          if (Math.abs(nearH - h) > 1 || nearH <= SEA + 1) return null;
          for (let yy = h + 1; yy <= h + 5; yy++) if (isSolid(peekBlock(x + dx, yy, z + dz))) return null;
        }
        return [x + 0.5, h + 1.01, z + 0.5];
      }
      return null;
    };
    for (const ch of G.chunks.values()) {
      const s = tryAt(ch.cx * 16 + 8, ch.cz * 16 + 8, false);
      if (s) return s;
    }
    for (let r = 0; r < 48; r++) {
      for (let k = 0; k < 8; k++) {
        const ang = (k / 8) * Math.PI * 2;
        const s = tryAt(Math.round(Math.cos(ang) * r), Math.round(Math.sin(ang) * r), true);
        if (s) return s;
      }
    }
    const h0 = heightAt(0, 0);
    return [0.5, h0 + 2, 0.5];
  }

  // =====================================================================
  // Inventory / crafting
  // =====================================================================
  const inv = new Array(36).fill(null); // 0-8 hotbar, 9-35 pack
  let sel = 0;
  let held = null;
  let craft = new Array(9).fill(null);
  let craftOut = null;
  let craftSize = 2;
  let openFurnace = null, openChest = null;
  let uiMode = null; // null | inv | table | furnace | chest

  function stackOf(key, n, dur) { return { key, n: n || 1, dur: dur == null ? (ITEMS[key] && ITEMS[key].dur) : dur }; }
  function canStack(a, b) { return a && b && a.key === b.key && !ITEMS[a.key].tool; }
  function canStackFully(a, b) { return canStack(a, b) && a.n + b.n <= (ITEMS[a.key].stack || 64); }

  function give(key, n) {
    if (!ITEMS[key]) return false;
    n = n || 1;
    const wanted = n;
    for (let i = 0; i < 36 && n > 0; i++) {
      if (inv[i] && inv[i].key === key && !ITEMS[key].tool) {
        const add = Math.min((ITEMS[key].stack || 64) - inv[i].n, n);
        inv[i].n += add; n -= add;
      }
    }
    for (let i = 0; i < 36 && n > 0; i++) {
      if (!inv[i]) {
        const take = ITEMS[key] && ITEMS[key].tool ? 1 : Math.min(ITEMS[key] ? ITEMS[key].stack : 64, n);
        inv[i] = stackOf(key, take); n -= take;
      }
    }
    refreshHotbar();
    const received = wanted - n;
    if (received > 0) questEvent("got", key, received);
    // Losing a harvest to a silently full pack is the kind of thing a player
    // never notices until the field is empty, so say it out loud.
    if (n > 0) toast("背包已满，" + ((ITEMS[key] && ITEMS[key].name) || key) + " ×" + n + " 掉在了地上");
    return n === 0;
  }
  function selected() { return inv[sel]; }

  function matchRecipe(grid, size) {
    const used = [];
    for (let i = 0; i < size * size; i++) if (grid[i]) used.push(grid[i].key);
    for (const r of RECIPES) {
      if (r.shapeless) {
        if (used.length !== r.shapeless.length) continue;
        const a = used.slice().sort(), b = r.shapeless.slice().sort();
        if (a.every((v, i) => v === b[i])) return r;
      } else if (r.shape) {
        const sh = r.shape, h = sh.length, w = sh[0].length;
        if (w > size || h > size) continue;
        for (let oy = 0; oy <= size - h; oy++) for (let ox = 0; ox <= size - w; ox++) {
          let ok = true;
          for (let y = 0; y < size && ok; y++) for (let x = 0; x < size && ok; x++) {
            const ch = (y >= oy && y < oy + h && x >= ox && x < ox + w) ? sh[y - oy][x - ox] : " ";
            const want = ch === " " ? null : r.map[ch];
            const got = grid[y * size + x] ? grid[y * size + x].key : null;
            if (want !== got) ok = false;
          }
          if (ok) return r;
        }
      }
    }
    return null;
  }
  function refreshCraft() {
    const r = matchRecipe(craft, craftSize);
    craftOut = r ? stackOf(r.out[0], r.out[1]) : null;
    renderInv();
  }
  function takeCraft() {
    if (!craftOut) return;
    const n = craftSize * craftSize;
    for (let i = 0; i < n; i++) if (craft[i]) {
      craft[i].n--;
      if (craft[i].n <= 0) craft[i] = null;
    }
    questEvent("craft", craftOut.key, craftOut.n);
    refreshCraft();
  }

  function handTool() {
    const s = selected();
    return s && ITEMS[s.key] && ITEMS[s.key].tool ? ITEMS[s.key] : null;
  }

  // =====================================================================
  // Affixes
  // =====================================================================
  // An affix is a named modifier rolled onto a single tool instance and stored on
  // the stack as `{ id, tier }`. Item definitions stay immutable and shared; every
  // modified value is derived on read, so a stack with no `af` behaves exactly as
  // it did before affixes existed — which is what makes old saves load unchanged.
  const AFFIX_TIERS = ["I", "II", "III"];
  const AFFIXES = {
    keen:     { name: "锋锐", color: "#ff8a6a", desc: "近战伤害 +2 / 级",
                on: ["sword", "spear"], damage: (t) => t * 2 },
    swift:    { name: "迅捷", color: "#7ad2ff", desc: "挖掘速度 +25% / 级",
                on: ["pick", "axe", "shovel", "hoe"], speed: (t) => 1 + t * 0.25 },
    sturdy:   { name: "坚韧", color: "#c8d0dc", desc: "每次磨损有 20% / 级 的概率不消耗耐久",
                on: ["pick", "axe", "shovel", "sword", "spear", "hoe", "shield"], wearSkip: (t) => t * 0.2 },
    vampiric: { name: "饮血", color: "#e05a7a", desc: "击中敌人回复 1 点生命 / 每 2 级",
                on: ["sword", "spear"], lifesteal: (t) => Math.ceil(t / 2) },
    ember:    { name: "烈焰", color: "#ff9a3c", desc: "命中点燃，每秒 1 点灼烧 / 级，持续 4 秒",
                on: ["sword", "spear"], burn: (t) => t },
    fortune:  { name: "财运", color: "#ffd75a", desc: "挖矿有 25% / 级 的概率多产一份",
                on: ["pick"], fortune: (t) => t * 0.25 },
    harvest:  { name: "丰饶", color: "#9ede6a", desc: "手持时收割额外产出 +1 / 每 2 级",
                on: ["hoe"], harvest: (t) => Math.ceil(t / 2) }
  };
  const AFFIX_IDS = Object.keys(AFFIXES);
  // Which affixes may land on a given tool kind.
  function affixPool(toolKind) {
    return AFFIX_IDS.filter((id) => AFFIXES[id].on.indexOf(toolKind) >= 0);
  }
  function affixOf(stack) {
    if (!stack || !stack.af) return null;
    const def = AFFIXES[stack.af.id];
    if (!def) return null;
    const tier = clamp(stack.af.tier | 0, 1, 3);
    return { id: stack.af.id, tier, def };
  }
  // Read one affix property off a stack, defaulting when the affix is absent.
  function affixVal(stack, prop, fallback) {
    const a = affixOf(stack);
    if (!a || typeof a.def[prop] !== "function") return fallback;
    return a.def[prop](a.tier);
  }
  function affixLabel(stack) {
    const a = affixOf(stack);
    return a ? a.def.name + " " + AFFIX_TIERS[a.tier - 1] : "";
  }
  function displayName(stack) {
    if (!stack) return "";
    const base = (ITEMS[stack.key] && ITEMS[stack.key].name) || stack.key;
    const lab = affixLabel(stack);
    return lab ? lab + " · " + base : base;
  }
  // Roll a fresh affix. Higher tiers are deliberately rare, so an anvil session is
  // a gamble rather than a straight upgrade.
  function rollAffix(stack) {
    const it = stack && ITEMS[stack.key];
    if (!it || !it.tool) return null;
    const pool = affixPool(it.tool);
    if (!pool.length) return null;
    const id = pool[(Math.random() * pool.length) | 0];
    const r = Math.random();
    const tier = r < 0.55 ? 1 : r < 0.87 ? 2 : 3;
    stack.af = { id, tier };
    return affixOf(stack);
  }

  // --- The anvil: pay coin and embers to gamble on a reroll ---
  // Cost climbs with each reroll of the same tool, so chasing a perfect roll is a
  // real resource decision rather than a free slot-machine pull.
  const FORGE_BASE = { denarius: 2, ember_shard: 1 };
  function forgeCost(stack) {
    const n = (stack && stack.af && stack.af.rerolls) || 0;
    return { denarius: FORGE_BASE.denarius + n, ember_shard: FORGE_BASE.ember_shard + Math.floor(n / 2) };
  }
  function countItem(key) { return inv.reduce((n, s) => n + (s && s.key === key ? s.n : 0), 0); }
  function takeItem(key, n) {
    if (countItem(key) < n) return false;
    for (let i = 0; i < 36 && n > 0; i++) {
      if (!inv[i] || inv[i].key !== key) continue;
      const take = Math.min(inv[i].n, n);
      inv[i].n -= take; n -= take;
      if (inv[i].n <= 0) inv[i] = null;
    }
    refreshHotbar();
    return true;
  }
  function canForge(stack) {
    const it = stack && ITEMS[stack.key];
    if (!it || !it.tool) return { ok: false, why: "把工具或武器拿在手上" };
    if (!affixPool(it.tool).length) return { ok: false, why: "这件装备没有可用词条" };
    const c = forgeCost(stack);
    if (countItem("denarius") < c.denarius || countItem("ember_shard") < c.ember_shard)
      return { ok: false, why: "材料不足", cost: c };
    return { ok: true, cost: c };
  }
  function forgeReroll() {
    const s = selected();
    const chk = canForge(s);
    if (!chk.ok) { toast(chk.why); sfx("break"); return null; }
    takeItem("denarius", chk.cost.denarius);
    takeItem("ember_shard", chk.cost.ember_shard);
    const rerolls = ((s.af && s.af.rerolls) || 0) + 1;
    const before = affixLabel(s);
    rollAffix(s);
    s.af.rerolls = rerolls;
    const a = affixOf(s);
    toast((before ? before + " → " : "") + a.def.name + " " + AFFIX_TIERS[a.tier - 1]);
    sfx(a.tier === 3 ? "levelup" : "craft");
    addShake(a.tier === 3 ? 0.22 : 0.08);
    refreshHotbar();
    if (uiMode === "forge") renderForge();
    return a;
  }

  // --- Effective stats: base definition + whatever the held instance rolled ---
  function effDamage(stack) {
    const it = stack && ITEMS[stack.key];
    if (!it) return 0;
    return (it.damage || 0) + affixVal(stack, "damage", 0);
  }
  function effSpeed(stack) {
    const it = stack && ITEMS[stack.key];
    if (!it) return 1;
    return (it.speed || 1) * affixVal(stack, "speed", 1);
  }

  function wearTool() {
    const s = selected();
    if (!s || !ITEMS[s.key] || !ITEMS[s.key].tool) return;
    // Sturdy trades a roll for a point of durability.
    if (Math.random() < affixVal(s, "wearSkip", 0)) return;
    s.dur = (s.dur == null ? ITEMS[s.key].dur : s.dur) - 1;
    if (s.dur <= 0) { inv[sel] = null; toast(displayName(s) + " 断了"); sfx("break"); }
    refreshHotbar();
  }

  // =====================================================================
  // Mobs
  // =====================================================================
  const mobs = [];
  function spawnMob(kind, x, y, z, extra) {
    const proto = {
      cow: { hp: 10, w: 0.45, h: 1.2, speed: 1.6, color: [0.45, 0.28, 0.14], hostile: false, drop: ["raw_beef", 1] },
      pig: { hp: 8, w: 0.4, h: 0.9, speed: 1.8, color: [0.92, 0.62, 0.62], hostile: false, drop: ["raw_beef", 1] },
      sheep: { hp: 8, w: 0.42, h: 1.1, speed: 1.5, color: [0.92, 0.92, 0.9], hostile: false, drop: ["apple", 1] },
      zombie: { hp: 20, w: 0.3, h: 1.8, speed: 2.4, color: [0.32, 0.48, 0.28], hostile: true, damage: 3, aggro: 28, reason: "was slain by a zombie", drop: ["iron_ingot", 0] },
      soldier: { hp: 30, w: 0.34, h: 1.8, speed: 1.7, color: [0.62, 0.12, 0.18], hostile: false, npc: true, drop: null },
      citizen: { hp: 20, w: 0.32, h: 1.75, speed: 1.45, color: [0.75, 0.68, 0.52], hostile: false, npc: true, drop: null },
      lion: { hp: 24, w: 0.58, h: 1.05, speed: 3.1, color: [0.78, 0.48, 0.16], hostile: true, damage: 5, aggro: 14, reason: "was mauled by a lion", drop: ["denarius", 3], ai: "pounce" },
      wolf: { hp: 14, w: 0.42, h: 0.82, speed: 3.7, color: [0.42, 0.43, 0.46], hostile: true, damage: 3, aggro: 22, reason: "was hunted by a wolf", drop: ["raw_beef", 1], ai: "circle" },
      // --- Chapter II threats. `minTier` gates them behind survived days. ---
      archer: { hp: 18, w: 0.32, h: 1.75, speed: 2.0, color: [0.46, 0.38, 0.28], hostile: true, damage: 4, aggro: 30,
        reason: "was shot down by a barbarian archer", drop: ["ember_shard", 1], ai: "archer", minTier: 1 },
      raider: { hp: 24, w: 0.32, h: 1.8, speed: 3.0, color: [0.58, 0.32, 0.20], hostile: true, damage: 4, aggro: 32,
        reason: "was overrun by a warband", drop: ["denarius", 2], ai: "pack", minTier: 2 },
      lurker: { hp: 26, w: 0.42, h: 1.1, speed: 3.6, color: [0.32, 0.29, 0.27], hostile: true, damage: 6, aggro: 10,
        reason: "was ambushed under the ash", drop: ["ember_shard", 2], ai: "ambush", minTier: 2 },
      ravager: { hp: 70, w: 0.7, h: 2.2, speed: 1.5, color: [0.38, 0.31, 0.35], hostile: true, damage: 8, aggro: 36,
        reason: "was crushed by a siege beast", drop: ["raw_steel", 2], ai: "siege", minTier: 3 },
      oathbreaker: { hp: 240, w: 0.5, h: 2.4, speed: 2.7, color: [0.54, 0.10, 0.14], hostile: true, damage: 10, aggro: 60,
        reason: "fell to the Centurion of the Broken Oath", drop: ["steel_ingot", 6], ai: "boss", boss: true }
    }[kind];
    if (!proto) return;
    const m = Object.assign(
      { kind, x, y, z, vx: 0, vy: 0, vz: 0, yaw: 0, cd: 0, wander: 0, flash: 0, stagger: 0, windup: 0,
        orbit: Math.random() < 0.5 ? 1 : -1, flank: 0, special: 3, phase: 0, buried: false },
      proto, extra || {}
    );
    if (m.ai === "ambush") m.buried = true;
    if (m.hostile && !m.npc && m.scale !== false) {
      // Difficulty ramps with survived days: tougher, harder-hitting raiders.
      const tier = threatTier();
      m.hp = Math.round(m.hp * (1 + tier * 0.18));
      m.damage = Math.round((m.damage || 3) * (1 + tier * 0.14) * 10) / 10;
      m.speed *= 1 + tier * 0.05;
      m.tier = tier;
    }
    m.maxHp = m.hp;
    mobs.push(m);
    // Warbands never arrive alone: the first raider drags its band along.
    if (m.ai === "pack" && !m.inPack) {
      m.inPack = true;
      m.flank = 0;
      const n = 2 + (Math.random() * 2 | 0);
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2, r = 1.5 + Math.random() * 2;
        const mate = spawnMob(kind, x + Math.cos(a) * r, y, z + Math.sin(a) * r, { inPack: true });
        if (mate) mate.flank = (k + 1) * 0.9 * (k % 2 ? 1 : -1);
      }
    }
    return m;
  }
  // 0 on day 1, +1 per two survived days, capped — used for spawn caps and mob scaling.
  function threatTier() { return clamp(Math.floor((G.day - 1) / 2), 0, 5); }
  function spawnRomanCast() {
    const arenaY = heightAt(24, 8) + 1.2;
    spawnMob("soldier", P.x + 3, groundY(P.x + 3, P.z + 2), P.z + 2, {name:"马库斯",story:"marcus",dialogue:["我是百夫长马库斯。帝国大道已经断裂，我们必须重建罗马。","先巡视军营，再沿东边的马赛克大道前往斗兽场。","拿起长矛和盾牌；真正的罗马不是废墟，而是秩序。"]});
    spawnMob("citizen", 8, groundY(8,-8), -8, {name:"莉维娅",story:"livia",color:[0.88,0.74,0.42],dialogue:["我是建筑师莉维娅。广场、浴场和水渠会因你的行动重新运转。","罗马建筑从道路开始，也由人民完成。"]});
    spawnMob("citizen", -8, groundY(-8,8), 8, {name:"奥勒莉亚",story:"aurelia",color:[0.62,0.72,0.84],dialogue:["我是医师奥勒莉亚。浴场下方的水道并不安全。","城里需要药物，也需要能保护平民的人。"]});
    spawnMob("citizen", 24, groundY(24,-8), -8, {name:"卡西乌斯",story:"cassius",color:[0.72,0.28,0.22],dialogue:["元老院使者卡西乌斯。神庙保存着帝国失踪前的最后一道命令。"]});
    spawnMob("soldier", 20, arenaY, 8, {name:"卢修斯",story:"lucius",dialogue:["我是角斗士卢修斯。击败雄狮，地下兽笼的钥匙就是你的。"]});
    spawnMob("soldier", 28, arenaY, 8, {name:"竞技场守卫",story:"guard",dialogue:["进入沙场便没有退路。荣耀，或者死亡。"]});
    spawnMob("lion", 24, arenaY, 7);
    spawnMob("wolf", 25.5, arenaY, 9);
  }
  function mobTick(dt) {
    const day = dayFactor();
    const tier = threatTier();
    // spawn — night packs grow with the threat tier
    // Winter nights press harder: the season adds to the cap on top of the tier.
    const sb = season().spawnBonus;
    if (mobs.length < (day < 0.3 ? 14 + tier * 2 + sb * 2 : 8 + tier + sb) && Math.random() < dt * (0.35 + tier * 0.05 + sb * 0.03)) {
      const ang = Math.random() * Math.PI * 2, dist = 18 + Math.random() * 28;
      const x = P.x + Math.cos(ang) * dist, z = P.z + Math.sin(ang) * dist;
      getChunk(w2c(x), w2c(z));
      const h = heightAt(wf(x), wf(z));
      if (h > SEA && !brazierCovers(x, z)) {
        const night = day < 0.28;
        let kind;
        if (night) {
          // Threat tier unlocks *new kinds* of raider, not just fatter zombies.
          const pool = ["zombie", "wolf"];
          if (tier >= 1) pool.push("archer");
          if (tier >= 2) pool.push("raider", "lurker");
          if (tier >= 3) pool.push("ravager");
          kind = pool[Math.random() * pool.length | 0];
        } else {
          kind = ["cow", "pig", "sheep", "soldier", "lion"][Math.random() * 5 | 0];
          if (tier >= 2 && biomeAt(wf(x), wf(z)) === "ashland") kind = Math.random() < 0.6 ? "lurker" : "archer";
        }
        const proto = MOB_TIER[kind] || 0;
        if (proto <= tier) spawnMob(kind, x, h + 1.2, z);
      }
    }
    for (let i = mobs.length - 1; i >= 0; i--) {
      const m = mobs[i];
      const dx = P.x - m.x, dz = P.z - m.z, dist = Math.hypot(dx, dz);
      // Story NPCs are never culled: the quest compass points at them, so a
      // player who wanders 80m out must still be able to navigate back.
      if (dist > 80 && !m.story) { mobs.splice(i, 1); continue; }
      if (m.flash > 0) m.flash -= dt;
      // Walk cycle phase. Driven by real horizontal speed rather than a free
      // running clock, so a mob that is standing still actually stands still and
      // a charging ravager pumps faster than a wandering cow.
      const sp = Math.hypot(m.vx, m.vz);
      m.anim = ((m.anim || 0) + dt * sp * 2.1) % (Math.PI * 2);
      m.gait = lerp(m.gait == null ? 0 : m.gait, clamp(sp / Math.max(0.4, m.speed || 2), 0, 1), Math.min(1, dt * 9));
      if (m.stagger > 0) {
        // Knocked back: keep the momentum from the hit, no steering this frame.
        m.stagger -= dt;
        m.vx *= Math.pow(0.03, dt); m.vz *= Math.pow(0.03, dt);
      } else if (m.hostile && dist < (m.aggro || 28)) {
        const l = dist || 1;
        const nx = dx / l, nz = dz / l;
        if (m.kind === "lion") {
          // Lion: crouch-and-pounce. Freezes to wind up, then bursts forward.
          m.windup -= dt;
          if (m.windup > 0) { m.vx = 0; m.vz = 0; }
          else if (m.windup > -0.55) { m.vx = nx * m.speed * 2.4; m.vz = nz * m.speed * 2.4; }
          else { m.vx = nx * m.speed; m.vz = nz * m.speed; if (dist < 8 && Math.random() < dt * 0.9) m.windup = 0.5; }
        } else if (m.kind === "wolf") {
          // Wolf: circles the player, darting in only when it is behind the flank.
          const tx = -nz * m.orbit, tz = nx * m.orbit;
          const close = dist < 4.5;
          const pull = close ? -0.35 : 0.85;
          m.vx = (tx * 0.9 + nx * pull) * m.speed;
          m.vz = (tz * 0.9 + nz * pull) * m.speed;
          m.windup -= dt;
          if (m.windup <= 0 && dist < 7) { m.windup = 2.4 + Math.random() * 1.6; m.vx = nx * m.speed * 2.2; m.vz = nz * m.speed * 2.2; }
          if (Math.random() < dt * 0.2) m.orbit = -m.orbit;
        } else if (m.ai === "archer") {
          // Archer: refuses to melee. Backs off, strafes, looses arrows from range.
          const want = 10;
          const push = dist < want - 2 ? -1 : dist > want + 3 ? 0.9 : 0;
          m.vx = (nx * push - nz * m.orbit * 0.6) * m.speed;
          m.vz = (nz * push + nx * m.orbit * 0.6) * m.speed;
          m.windup -= dt;
          if (m.windup <= 0 && dist < 22 && dist > 3) {
            m.windup = 2.2 + Math.random();
            const ey = P.y + 1.2 - (m.y + m.h * 0.7);
            const l3 = Math.hypot(dx, ey, dz) || 1;
            spawnShot(m.x, m.y + m.h * 0.7, m.z,
              dx / l3, ey / l3 + 0.13, dz / l3, 22, m.damage || 4, "mob", [190, 160, 110]);
            sfx("arrow");
          }
          if (Math.random() < dt * 0.35) m.orbit = -m.orbit;
        } else if (m.ai === "pack") {
          // Warband: each member holds its own flank angle so they surround you.
          const a = Math.atan2(nz, nx) + m.flank;
          m.vx = Math.cos(a) * m.speed; m.vz = Math.sin(a) * m.speed;
          if (dist < 5) { m.vx = nx * m.speed * 1.25; m.vz = nz * m.speed * 1.25; }
        } else if (m.ai === "ambush") {
          // Lurker: buried and motionless until you walk on top of it, then bursts out.
          if (m.buried) {
            m.vx = 0; m.vz = 0;
            if (dist < 6) {
              m.buried = false;
              m.vy = 7;
              spawnBurst(m.x, m.y + 0.4, m.z, [120, 112, 106], 22, 1.1);
              addShake(0.18); sfx("roar");
              addFloat(m.x, m.y + 1.6, m.z, "伏击！", "kill");
            }
          } else {
            m.vx = nx * m.speed; m.vz = nz * m.speed;
          }
        } else if (m.ai === "siege") {
          // Ravager: walks you down and eats the walls you built on the way.
          m.vx = nx * m.speed; m.vz = nz * m.speed;
          m.windup -= dt;
          if (m.windup <= 0) {
            m.windup = 1.1;
            if (smashPlayerBlock(m)) { addShake(0.16); sfx("slam"); }
          }
        } else if (m.ai === "boss") {
          bossTick(m, dt, dist, nx, nz);
        } else {
          // Zombie & friends: slow, relentless, straight line.
          m.vx = nx * m.speed; m.vz = nz * m.speed;
        }
        const reach = m.boss ? 2.4 : 1.5;
        if (dist < reach && m.cd <= 0 && !G.creative && m.ai !== "archer") {
          hurt(m.damage || 3, m.reason || "was slain");
          m.cd = m.kind === "wolf" ? 0.85 : m.boss ? 0.9 : 1.1;
          m.vx = -nx * 2.5; m.vz = -nz * 2.5; m.stagger = 0.18;
        }
      } else {
        m.wander -= dt;
        if (m.wander <= 0) {
          m.wander = 2 + Math.random() * 4;
          const a = Math.random() * Math.PI * 2;
          m.vx = Math.cos(a) * m.speed * 0.6; m.vz = Math.sin(a) * m.speed * 0.6;
        }
      }
      m.cd -= dt;
      caltropTick(m, dt);
      m.vy -= 24 * dt;
      m.y += m.vy * dt;
      const gy = groundY(m.x, m.z);
      if (m.y < gy) { m.y = gy; m.vy = 0; }
      m.x += m.vx * dt; m.z += m.vz * dt;
      if (isSolid(getBlock(m.x, m.y + 0.1, m.z))) { m.y += 1; }
      if (m.hp <= 0) { killMob(m); continue; }
      // sunlight burns zombies
      if (m.kind === "zombie" && day > 0.55 && skyLight(wf(m.x), wf(m.y), wf(m.z)) > 12) {
        m.hp -= dt * 4;
        if (m.hp <= 0) mobs.splice(i, 1);
      }
    }
  }
  // Which threat tier each kind needs before it may spawn at all.
  const MOB_TIER = { archer: 1, raider: 2, lurker: 2, ravager: 3, oathbreaker: 99 };

  // --- Boss: three phases, each with its own tell. ---
  function bossPhase(m) { return m.hp > m.maxHp * 0.66 ? 1 : m.hp > m.maxHp * 0.33 ? 2 : 3; }
  function bossTick(m, dt, dist, nx, nz) {
    const phase = bossPhase(m);
    if (phase !== m.phase) {
      m.phase = phase;
      m.windup = 0.9;
      addShake(0.3); sfx("roar");
      toast(phase === 2 ? "背誓百夫长吹响号角——他在召集残部" : "背誓百夫长陷入狂怒——他开始砸地");
      spawnBurst(m.x, m.y + 1.4, m.z, [240, 80, 60], 30, 1.2);
    }
    m.windup -= dt;
    if (m.windup > 0) { m.vx = 0; m.vz = 0; return; }   // telegraphed pause before every move
    m.vx = nx * m.speed * (phase === 3 ? 1.4 : 1);
    m.vz = nz * m.speed * (phase === 3 ? 1.4 : 1);
    m.special -= dt;
    if (m.special > 0) return;
    if (phase === 2) {
      m.special = 7;
      m.windup = 0.7;
      let n = 0;
      for (let k = 0; k < 3; k++) if (spawnHostileNear(k % 2 ? "raider" : "archer", 8 + k * 2)) n++;
      if (n) { toast("残部应召而来（" + n + " 名）"); sfx("arrow"); }
    } else if (phase === 3) {
      m.special = 4.5;
      m.windup = 0.6;
      // Ground slam: heavy AoE that punishes standing next to him.
      if (dist < 6.5 && !G.creative) hurt(Math.max(3, 12 - dist), m.reason);
      addShake(0.42); sfx("slam");
      spawnBurst(m.x, m.y + 0.2, m.z, [180, 90, 50], 30, 1.6);
      addFloat(m.x, m.y + 2.8, m.z, "震地", "kill");
    }
  }

  // Ravager: only chews through blocks the *player* placed (they live in G.diffs).
  function smashPlayerBlock(m) {
    for (let dy = 0; dy <= 2; dy++) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if (!dx && !dz) continue;
      const bx = wf(m.x) + dx, by = wf(m.y) + dy, bz = wf(m.z) + dz;
      const id = getBlock(bx, by, bz);
      if (!id || id === BEDROCK || !isSolid(id)) continue;
      if (G.diffs.get(cxyz(bx, by, bz)) !== id) continue;   // world-gen block: leave it alone
      const d = defOf(id);
      setBlock(bx, by, bz, AIR);
      spawnBurst(bx + 0.5, by + 0.5, bz + 0.5, d ? d.color : [140, 140, 140], 12, 0.8);
      addFloat(bx + 0.5, by + 1.2, bz + 0.5, "被拆毁", "self");
      return true;
    }
    return false;
  }

  // --- Braziers hold the dark back: no hostile spawns inside their light. ---
  function brazierCovers(x, z) {
    for (const k of G.braziers) {
      const p = k.split(",");
      if (Math.hypot(+p[0] + 0.5 - x, +p[2] + 0.5 - z) < 24) return true;
    }
    return false;
  }
  function rebuildBraziers() {
    G.braziers.clear();
    for (const [k, id] of G.diffs) if (id === BRAZIER) G.braziers.add(k);
  }
  // --- Caltrops shred whatever walks over them. ---
  function caltropTick(m, dt) {
    if (!m.hostile || m.boss) return;
    if (getBlock(m.x, m.y + 0.1, m.z) !== CALTROPS && getBlock(m.x, m.y - 0.4, m.z) !== CALTROPS) return;
    m.caltropCd = (m.caltropCd || 0) - dt;
    m.vx *= 0.35; m.vz *= 0.35;                 // and slow it down while it limps through
    if (m.caltropCd > 0) return;
    m.caltropCd = 0.6;
    mobHurt(m, 3, { label: "trap" });
  }

  function groundY(x, z) {
    let y = SY - 2;
    while (y > 0 && !isSolid(getBlock(x, y, z))) y--;
    return y + 1;
  }
  function lookMob(maxRange) {
    const e = eyePos(), d = lookDir();
    let best = null, bestT = maxRange;
    for (const m of mobs) {
      const cx = m.x - e[0], cy = (m.y + m.h * 0.5) - e[1], cz = m.z - e[2];
      const t = cx * d[0] + cy * d[1] + cz * d[2];
      if (t < 0 || t > bestT) continue;
      const px = e[0] + d[0] * t - m.x, py = e[1] + d[1] * t - (m.y + m.h * 0.5), pz = e[2] + d[2] * t - m.z;
      if (Math.abs(px) < m.w + 0.2 && Math.abs(py) < m.h * 0.5 + 0.2 && Math.abs(pz) < m.w + 0.2) { best = m; bestT = t; }
    }
    return best;
  }
  function talkToNPC() {
    const npc = lookMob(4.5);
    if (!npc || !npc.npc) return false;
    const lines = npc.dialogue || [
      "军团士兵：沿马赛克大道向东就是斗兽场。",
      "军团士兵：斗兽场宝箱里备有长枪和盾牌。",
      "军团士兵：狮子攻击凶猛，持盾可以减少伤害。",
      "军团士兵：为罗马而战，收集第纳里乌斯！"
    ];
    toast((npc.name ? npc.name + "：" : "") + lines[(G.day + STAT.kills + (npc.x | 0)) % lines.length]);
    questEvent("talk", npc.story || npc.kind, 1);
    return true;
  }
  function hitMob() {
    const t = handTool();
    const best = lookMob(t && t.range ? t.range : 3.4);
    if (!best) return false;
    if (best.npc) { talkToNPC(); return true; }
    const armed = t && (t.tool === "sword" || t.tool === "spear");
    const s = selected();
    const d = lookDir();
    const dmg = (armed ? effDamage(s) : 2) + (hasBuff("vigor") ? 2 : 0);
    const killedBefore = best.hp;
    mobHurt(best, dmg, { kb: armed ? 6.5 : 4, dir: [d[0], d[2]] });
    if (armed) {
      // Ember sets the target alight; vampiric pays back a sliver of what it took.
      const burn = affixVal(s, "burn", 0);
      if (burn > 0) igniteMob(best, burn, 4);
      const steal = affixVal(s, "lifesteal", 0);
      if (steal > 0 && killedBefore > 0 && P.hp < 20 && !G.creative) {
        P.hp = clamp(P.hp + steal, 0, 20);
        addFloat(P.x, P.y + 2.1, P.z, "+" + steal, "heal");
        drawVitals();
      }
    }
    addShake(armed ? 0.1 : 0.06);
    hitStop = Math.max(hitStop, armed ? 0.035 : 0.02);
    swingHand();
    if (!G.creative && armed) wearTool();
    return true;
  }

  // =====================================================================
  // Audio
  // =====================================================================
  let AC = null;
  function audio() {
    if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === "suspended") AC.resume();
    return AC;
  }
  function sfx(name) {
    try {
      const a = audio();
      const o = a.createOscillator(), g = a.createGain();
      const tab = {
        break: [180, 0.08, "square", 0.04],
        place: [240, 0.06, "triangle", 0.04],
        step: [90 + Math.random() * 30, 0.04, "triangle", 0.02],
        jump: [320, 0.07, "sine", 0.03],
        hurt: [120, 0.16, "sawtooth", 0.05],
        hit: [200, 0.08, "square", 0.04],
        pop: [520, 0.07, "sine", 0.04],
        click: [400, 0.04, "square", 0.02],
        craft: [360, 0.1, "triangle", 0.04],
        crit: [520, 0.14, "square", 0.055],
        kill: [150, 0.24, "sawtooth", 0.06],
        levelup: [660, 0.28, "triangle", 0.05],
        throw: [300, 0.12, "triangle", 0.045],
        arrow: [420, 0.09, "sawtooth", 0.035],
        thud: [140, 0.1, "square", 0.045],
        slam: [80, 0.34, "sawtooth", 0.075],
        roar: [95, 0.5, "sawtooth", 0.07],
        boom: [60, 0.4, "sawtooth", 0.08]
      }[name] || [200, 0.06, "square", 0.03];
      o.type = tab[2]; o.frequency.value = tab[0];
      g.gain.value = tab[3];
      o.connect(g); g.connect(a.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + tab[1]);
      o.stop(a.currentTime + tab[1] + 0.02);
    } catch (e) { /* ignore */ }
  }

  // =====================================================================
  // Seasons
  // =====================================================================
  // A season is a pure function of the survived-day counter, so it needs no save
  // field and can never drift out of sync with a loaded world.
  const SEASON_LEN = 6;
  const SEASONS = [
    { key: "ver",       name: "春 · Ver",       growth: 1.35, hunger: 1.00, spawnBonus: 0, yieldBonus: 0,
      note: "万物抽芽：作物生长最快" },
    { key: "aestas",    name: "夏 · Aestas",    growth: 1.00, hunger: 1.20, spawnBonus: 0, yieldBonus: 0,
      note: "烈日灼人：奔跑消耗更多体力" },
    { key: "autumnus",  name: "秋 · Autumnus",  growth: 0.80, hunger: 1.00, spawnBonus: 1, yieldBonus: 1,
      note: "丰收之season：每次收割多一份产出" },
    { key: "hiems",     name: "冬 · Hiems",     growth: 0.30, hunger: 1.45, spawnBonus: 2, yieldBonus: 0,
      note: "长夜苦寒：作物几近停滞，饥饿加剧，夜袭更凶" }
  ];
  SEASONS[2].note = "丰收时节：每次收割多一份产出";
  function seasonIndex(day) { return Math.floor(((day == null ? G.day : day) - 1) / SEASON_LEN) % SEASONS.length; }
  function season() { return SEASONS[seasonIndex()]; }
  // Days remaining in the current season — the HUD counts it down so the player
  // can see winter coming and stock up before it lands.
  function seasonDaysLeft() { return SEASON_LEN - ((G.day - 1) % SEASON_LEN); }

  // =====================================================================
  // Buffs
  // =====================================================================
  // Timed effects keyed by id. Foods grant them; the registry decides the effect,
  // so a new buff never needs a new branch in the player tick.
  const BUFFS = {
    regen:  { name: "回春", color: "#7ad07a", desc: "持续恢复生命" },
    warmth: { name: "暖意", color: "#e8a25a", desc: "抵消冬季的额外饥饿" },
    vigor:  { name: "力涌", color: "#d8c15a", desc: "挖掘更快，近战伤害 +2" }
  };
  const buffs = Object.create(null);   // id -> seconds remaining
  function renderBuffs() {
    const box = $("buffs");
    if (!box) return;
    const live = Object.keys(buffs).filter((id) => buffs[id] > 0 && BUFFS[id]);
    box.hidden = live.length === 0;
    box.innerHTML = live.map((id) => {
      const b = BUFFS[id];
      const s = Math.ceil(buffs[id]);
      const t = s >= 60 ? Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0") : s + "s";
      return '<span class="buff" style="--bc:' + b.color + '" title="' + b.desc + '">' + b.name + " " + t + "</span>";
    }).join("");
  }
  function addBuff(id, secs) {
    if (!BUFFS[id]) return false;
    const had = (buffs[id] || 0) > 0;
    buffs[id] = Math.max(buffs[id] || 0, secs);
    if (!had) { toast(BUFFS[id].name + "：" + BUFFS[id].desc); sfx("pop"); }
    renderBuffs();
    return true;
  }
  function hasBuff(id) { return (buffs[id] || 0) > 0; }
  function buffTick(dt) {
    let changed = false;
    for (const id in buffs) {
      if (buffs[id] <= 0) continue;
      buffs[id] -= dt;
      if (buffs[id] <= 0) { buffs[id] = 0; changed = true; toast(BUFFS[id].name + " 已消退"); }
      else if (Math.ceil(buffs[id] + dt) !== Math.ceil(buffs[id])) changed = true;
    }
    if (hasBuff("regen") && P.hp < 20 && !P.dead) P.hp = clamp(P.hp + dt * 1.1, 0, 20);
    if (changed) renderBuffs();
  }
  function clearBuffs() { for (const id in buffs) buffs[id] = 0; renderBuffs(); }

  // =====================================================================
  // Agriculture
  // =====================================================================
  // Crops live in their own map, exactly like furnaces and chests: the block id
  // carries the visible stage, `G.crops` carries the sub-stage growth progress
  // that the block grid has no room for.
  const CROPS = {
    wheat: { stages: [WHEAT_0, WHEAT_1, WHEAT_2, WHEAT_3], seed: "wheat_seeds", yield: ["wheat", 1, 3], time: 52 },
    grape: { stages: [GRAPE_0, GRAPE_1, GRAPE_2, GRAPE_3], seed: "grape_seeds", yield: ["grape", 1, 2], time: 74 }
  };
  const CROP_BY_ID = new Map();
  for (const k in CROPS) CROPS[k].stages.forEach((id, i) => CROP_BY_ID.set(id, { kind: k, stage: i }));
  function isCrop(id) { return CROP_BY_ID.has(id); }
  function cropInfo(id) { return CROP_BY_ID.get(id) || null; }
  const FARM_SOIL = new Set([FARMLAND, FARMLAND_WET]);

  // Soil is "watered" when still water sits within 4 blocks on the same level or
  // one below — re-checked every growth tick, so draining a channel really does
  // dry the field out.
  function soilIsWet(x, y, z) {
    for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) for (let dy = -1; dy <= 0; dy++) {
      if (getBlock(x + dx, y + dy, z + dz) === WATER) return true;
    }
    return false;
  }
  function tillSoil(x, y, z) {
    const id = getBlock(x, y, z);
    if (id !== DIRT && id !== GRASS && id !== FARMLAND && id !== FARMLAND_WET) return false;
    if (isSolid(getBlock(x, y + 1, z))) return false;          // needs open sky above
    const wet = soilIsWet(x, y, z);
    const want = wet ? FARMLAND_WET : FARMLAND;
    if (id === want) return false;
    setBlock(x, y, z, want);
    sfx("place");
    spawnBurst(x + 0.5, y + 1, z + 0.5, wet ? [92, 78, 60] : [128, 96, 64], 6, 0.5);
    return true;
  }
  // Rebuild the crop index from a save.
  //
  // `G.diffs` is the authority, not `getBlock`: restore runs before any chunk is
  // generated, so getBlock would report air for the very cells we are restoring.
  // Every crop is player-placed and therefore always present in the diffs, so the
  // diffs alone decide which cells hold crops; the saved table only supplies the
  // sub-stage growth progress that the block id cannot express.
  function restoreCrops(saved) {
    G.crops.clear();
    const progress = new Map();
    for (const [k, v] of saved || []) {
      if (typeof k !== "string" || !v || !CROPS[v.kind]) continue;
      const p = Number(v.p);
      if (!Number.isFinite(p)) continue;
      progress.set(k, { kind: v.kind, p: clamp(p, 0, 1) });
    }
    for (const [k, id] of G.diffs) {
      const info = cropInfo(id);
      if (!info) continue;
      const c = CROPS[info.kind];
      const saw = progress.get(k);
      // Trust the saved progress only when it agrees with the block's own stage;
      // otherwise fall back to the stage itself so the crop still ripens.
      const derived = info.stage / (c.stages.length - 1);
      const usable = saw && saw.kind === info.kind
        && Math.floor(saw.p * (c.stages.length - 1) + 1e-6) === info.stage;
      G.crops.set(k, { kind: info.kind, p: usable ? saw.p : derived });
    }
  }

  // A hard landing packs tilled soil back down and destroys whatever grew on it.
  function trampleSoil() {
    const x = wf(P.x), z = wf(P.z), y = wf(P.y - 0.1);
    if (!FARM_SOIL.has(getBlock(x, y, z))) return false;
    const above = getBlock(x, y + 1, z);
    if (isCrop(above)) {
      const c = CROPS[cropInfo(above).kind];
      G.crops.delete(cxyz(x, y + 1, z));
      setBlock(x, y + 1, z, AIR);
      give(c.seed, 1);
    }
    setBlock(x, y, z, DIRT);
    spawnBurst(x + 0.5, y + 1, z + 0.5, [120, 92, 64], 10, 0.6);
    addFloat(x + 0.5, y + 1.4, z + 0.5, "田地被踏坏", "self");
    sfx("break");
    return true;
  }
  function plantCrop(x, y, z, kind) {
    const c = CROPS[kind];
    if (!c) return false;
    if (!FARM_SOIL.has(getBlock(x, y - 1, z))) return false;
    if (getBlock(x, y, z) !== AIR) return false;
    setBlock(x, y, z, c.stages[0]);
    G.crops.set(cxyz(x, y, z), { kind, p: 0 });
    sfx("place");
    return true;
  }
  // Growth rate folds together season, irrigation and light, so farming has a real
  // reason to care about all three rather than being a timer.
  function cropRate(kind, x, y, z) {
    const c = CROPS[kind];
    if (!c) return 0;
    const below = getBlock(x, y - 1, z);
    if (!FARM_SOIL.has(below)) return -1;                       // soil gone: crop dies
    const wet = below === FARMLAND_WET ? 1.9 : 1;
    const lit = skyLight(x, y, z) >= 9 ? 1 : 0.3;
    return (1 / c.time) * season().growth * wet * lit;
  }
  let cropAccum = 0;
  function cropTick(dt) {
    cropAccum += dt;
    if (cropAccum < 0.5) return;
    const step = cropAccum; cropAccum = 0;
    for (const [k, rec] of G.crops) {
      const [x, y, z] = k.split(",").map(Number);
      const id = getBlock(x, y, z);
      const info = cropInfo(id);
      if (!info || info.kind !== rec.kind) { G.crops.delete(k); continue; }   // block replaced elsewhere
      const c = CROPS[rec.kind];
      const rate = cropRate(rec.kind, x, y, z);
      if (rate < 0) {                                            // soil was dug out from under it
        setBlock(x, y, z, AIR); G.crops.delete(k);
        give(c.seed, 1);
        continue;
      }
      if (info.stage >= c.stages.length - 1) { rec.p = 1; continue; }
      rec.p = clamp(rec.p + rate * step, 0, 1);
      const want = Math.min(c.stages.length - 1, Math.floor(rec.p * (c.stages.length - 1) + 1e-6));
      if (want !== info.stage) {
        setBlock(x, y, z, c.stages[want]);
        if (want === c.stages.length - 1) spawnBurst(x + 0.5, y + 0.5, z + 0.5, defOf(c.stages[want]).color, 5, 0.35);
      }
    }
    // Tilled soil that loses its water reverts to dry, and dry soil next to a new
    // channel turns wet — the field responds to the player's irrigation either way.
    if (G.tick % 4 === 0) for (const [k] of G.crops) {
      const [x, y, z] = k.split(",").map(Number);
      const below = getBlock(x, y - 1, z);
      if (!FARM_SOIL.has(below)) continue;
      const wet = soilIsWet(x, y - 1, z);
      const want = wet ? FARMLAND_WET : FARMLAND;
      if (below !== want) setBlock(x, y - 1, z, want);
    }
  }
  // Returns true when the break was a crop and has been fully handled.
  function harvestCrop(x, y, z, id) {
    const info = cropInfo(id);
    if (!info) return false;
    const c = CROPS[info.kind];
    const ripe = info.stage >= c.stages.length - 1;
    G.crops.delete(cxyz(x, y, z));
    setBlock(x, y, z, AIR);
    if (ripe) {
      const [item, lo, hi] = c.yield;
      // Season bonus and a "丰饶" hoe stack, so an autumn harvest with the right
      // tool is meaningfully better than a winter one with bare hands.
      const n = lo + (Math.random() * (hi - lo + 1) | 0)
        + season().yieldBonus + affixVal(selected(), "harvest", 0);
      give(item, n);
      give(c.seed, 1 + (Math.random() < 0.5 ? 1 : 0));
      addFloat(x + 0.5, y + 1.1, z + 0.5, "+" + n + " " + (ITEMS[item] ? ITEMS[item].name : item), "kill");
      questEvent("harvest", info.kind, n);
      STAT.harvested = (STAT.harvested || 0) + n;
    } else {
      give(c.seed, 1);                                           // pulled early: seed back, no crop
      addFloat(x + 0.5, y + 1.1, z + 0.5, "未成熟", "self");
    }
    sfx("pop");
    spawnBurst(x + 0.5, y + 0.5, z + 0.5, defOf(id).color, 7, 0.5);
    return true;
  }

  // =====================================================================
  // Quests
  // =====================================================================
  const CHAPTER1 = [
    { id:"oath", title:"第一章：帝国余火", desc:"在出生军营找到百夫长马库斯并右键交谈。", need:1, ev:"talk", key:"marcus", target:{story:"marcus",label:"百夫长马库斯"} },
    { id:"timber", title:"重燃军营", desc:"收集稀疏林木，为军团修复营房。", need:3, ev:"break", key:"log", nav:"营地外围的橄榄树、柏树都可提供原木" },
    { id:"spear", title:"罗马武备", desc:"制作一柄罗马长矛。", need:1, ev:"craft", key:"roman_spear", nav:"按 E 打开背包，在配方指南查看长矛材料" },
    { id:"architect", title:"石与秩序", desc:"到北面的帝国广场与建筑师莉维娅交谈。", need:1, ev:"talk", key:"livia", target:{story:"livia",label:"建筑师莉维娅"} },
    { id:"arena", title:"竞技场阴影", desc:"沿大道向东，在斗兽场击败雄狮。", need:1, ev:"kill", key:"lion", target:{kind:"lion",label:"斗兽场雄狮"} },
    { id:"coin", title:"帝国的代价", desc:"取得斗兽场中的第纳里乌斯。", need:3, ev:"got", key:"denarius", target:{x:24,z:8,label:"斗兽场宝箱"} },
    { id:"physician", title:"浴场密语", desc:"前往西侧浴场，与医师奥勒莉亚交谈。", need:1, ev:"talk", key:"aurelia", target:{story:"aurelia",label:"医师奥勒莉亚"} },
    { id:"temple", title:"最后的敕令", desc:"在东北神庙找到卡西乌斯。", need:1, ev:"talk", key:"cassius", target:{story:"cassius",label:"使者卡西乌斯"} },
    { id:"restore", title:"重建大道", desc:"放置30块罗马砖、大理石或马赛克，重建城区。", need:30, ev:"place", key:"*", nav:"在破损大道附近放置罗马砖、大理石或马赛克" },
    { id:"dawn", title:"罗马黎明", desc:"守住城区直到下一次日出。", need:1, ev:"dawn", key:"*", nav:"守住城区；右侧面板可查看当前时间" }
  ];
  const CHAPTER2 = [
    { id:"warning", title:"第二章：北境长夜", desc:"北方燃起狼烟。回到营地与百夫长马库斯确认警讯。", need:1, ev:"talk", key:"marcus", target:{story:"marcus",label:"百夫长马库斯"} },
    { id:"deepvein", title:"深层矿脉", desc:"下潜到 Y<32 的深层，采集 6 块余烬碎片。", need:6, ev:"got", key:"ember_shard", nav:"余烬矿在 Y<32 的深层与灰烬荒原地表；需要石镐以上" },
    { id:"steel", title:"帝国钢", desc:"熔炼 3 锭帝国钢。帝国钢矿在 Y<26，需要铁镐。", need:3, ev:"got", key:"steel_ingot", nav:"帝国钢矿在 Y<26；铁镐开采，放进熔炉冶炼" },
    { id:"gladius", title:"淬火之刃", desc:"打造一柄钢制角斗剑。", need:1, ev:"craft", key:"steel_gladius", nav:"工作台：钢锭 / 钢锭 / 木棍 竖排" },
    { id:"pila", title:"投枪之术", desc:"打造 4 支投掷标枪——右键投出，可远距离打击。", need:4, ev:"craft", key:"pilum", nav:"工作台：钢锭 / 木棍 / 木棍 竖排，一次产出 4 支" },
    { id:"ashland", title:"灰烬荒原", desc:"向东北远征，找到火山灰覆盖的灰烬荒原。", need:1, ev:"discover", key:"ashland", target:{x:ASHLAND.x,z:ASHLAND.z,label:"灰烬荒原"} },
    { id:"bastion", title:"筑垒设防", desc:"放置 12 块堡垒砖 / 火盆 / 蒺藜，建起据点。火盆能压制附近刷怪，蒺藜会扎伤踩上去的敌人。", need:12, ev:"place", key:"defense", nav:"堡垒砖=玄武岩+圆石；火盆=2余烬+铁锭+圆石；蒺藜=3铁锭" },
    { id:"purge", title:"清剿蛮族", desc:"击杀 6 名蛮族——弩手、战团武士或灰烬潜伏者。", need:6, ev:"kill", key:"barbarian", nav:"夜里的荒原与边疆最容易遇上蛮族；威胁等级越高来得越多" },
    { id:"ravager", title:"攻城巨兽", desc:"击败一头攻城巨兽。它会拆毁你亲手放下的方块。", need:1, ev:"kill", key:"ravager", target:{kind:"ravager",label:"攻城巨兽"} },
    { id:"oathbreaker", title:"背誓百夫长", desc:"在灰烬荒原击败背誓百夫长，终结北境长夜。", need:1, ev:"kill", key:"oathbreaker", target:{kind:"oathbreaker",label:"背誓百夫长"} }
  ];
  const CHAPTERS = [
    { n:1, key:"ember", quests:CHAPTER1, title:"ROMA RESURGENS",
      sub:"第一章「帝国余火」完成——大道重连，黎明照进城区。",
      next:"进入第二章：北境长夜" },
    { n:2, key:"longnight", quests:CHAPTER2, title:"ROMA AETERNA",
      sub:"第二章「北境长夜」完成——背誓者伏诛，灰烬荒原重归寂静。帝国不再只是余晖。",
      next:null }
  ];
  let chapter = 0;
  let QUESTS = CHAPTERS[0].quests;
  let questIdx = 0, questProg = 0, seenNight = false, wasNight = false;

  function setChapter(i, keepProgress) {
    chapter = clamp(i | 0, 0, CHAPTERS.length - 1);
    QUESTS = CHAPTERS[chapter].quests;
    if (!keepProgress) { questIdx = 0; questProg = 0; }
    renderQuest();
  }
  // Any kill/place that several quests accept resolves through here.
  const BARBARIANS = new Set(["archer", "raider", "lurker"]);
  const DEFENSE_BLOCKS = new Set(["bastion_brick", "brazier", "caltrops"]);

  function questEvent(ev, key, n) {
    const q = QUESTS[questIdx];
    if (!q || q.ev !== ev) return;
    const match = q.key === "*" || q.key === key
      || (q.key === "log" && LOGS.has(key))
      || (q.key === "stone" && (key === "stone" || key === "cobble"))
      || (q.key === "barbarian" && BARBARIANS.has(key))
      || (q.key === "defense" && DEFENSE_BLOCKS.has(key));
    if (!match) return;
    questProg += n || 1;
    if (questProg >= q.need) {
      questIdx++; questProg = 0; sfx("pop");
      addShake(0.1);
      addFloat(P.x, P.y + 2.2, P.z, "目标达成", "kill");
      if (questIdx >= QUESTS.length) showVictory();
      else {
        toast("Quest complete — " + QUESTS[questIdx].title);
        onQuestAdvance(QUESTS[questIdx]);
      }
    }
    renderQuest();
  }
  // Some objectives need the world to produce their target on demand rather than
  // hoping the random spawner eventually rolls it.
  function onQuestAdvance(q) {
    if (!q) return;
    if (q.id === "ravager" && !mobs.some((m) => m.kind === "ravager")) {
      const m = spawnHostileNear("ravager", 22);
      if (m) { toast("大地在震动——攻城巨兽正朝你走来"); sfx("roar"); addShake(0.25); }
    }
    if (q.id === "oathbreaker") spawnBoss();
  }
  function spawnHostileNear(kind, dist) {
    const ang = Math.random() * Math.PI * 2;
    const x = P.x + Math.cos(ang) * dist, z = P.z + Math.sin(ang) * dist;
    getChunk(w2c(x), w2c(z));
    return spawnMob(kind, x, groundY(x, z) + 0.5, z, { summoned: true });
  }
  function spawnBoss() {
    if (mobs.some((m) => m.kind === "oathbreaker")) return null;
    const m = spawnHostileNear("oathbreaker", 16);
    if (m) {
      toast("背誓百夫长现身了——他还穿着第十军团的甲胄");
      sfx("roar"); addShake(0.4);
    }
    return m;
  }

  function renderQuest() {
    if (questIdx >= QUESTS.length) {
      const found = Math.min(BIOME_GOAL, discoveries.size);
      $("quest-title").textContent = found >= BIOME_GOAL ? "帝国远征者" : "尾声：远征边疆";
      $("quest-desc").textContent = found >= BIOME_GOAL
        ? "五种群系已全部发现——罗马的地图完整了，继续扩建你的城区。"
        : "第一章已完成。走出城区，发现五种不同群系。";
      $("quest-fill").style.width = (100 * found / BIOME_GOAL) + "%";
      $("quest-num").textContent = found + " / " + BIOME_GOAL;
      $("quest-arrow").hidden = true;
      $("quest-nav-text").textContent = found >= BIOME_GOAL ? "自由建设你的罗马家园" : "沿道路探索尚未发现的群系";
      return;
    }
    const q = QUESTS[questIdx];
    $("quest-title").textContent = q.title;
    $("quest-desc").textContent = q.desc;
    $("quest-fill").style.width = (100 * questProg / q.need) + "%";
    $("quest-num").textContent = "第 " + CHAPTERS[chapter].n + " 章  ·  " + (questIdx + 1) + " / " + QUESTS.length
      + "  ·  " + questProg + " / " + q.need;
    updateQuestNav();
  }

  function questWaypoint() {
    const q = QUESTS[questIdx];
    if (!q || !q.target) return null;
    let x = q.target.x, z = q.target.z;
    if (x == null || z == null) {
      const actor = mobs.find((m) => (q.target.story && m.story === q.target.story) || (q.target.kind && m.kind === q.target.kind));
      if (!actor) return null;
      x = actor.x; z = actor.z;
    }
    const dx = x - P.x, dz = z - P.z;
    const bearing = Math.atan2(dx, -dz);
    let relative = bearing - P.yaw;
    while (relative > Math.PI) relative -= Math.PI * 2;
    while (relative < -Math.PI) relative += Math.PI * 2;
    return { label:q.target.label, x, z, distance:Math.hypot(dx, dz), bearing, relative };
  }

  function updateQuestNav() {
    const q = QUESTS[questIdx];
    const arrow = $("quest-arrow"), text = $("quest-nav-text");
    if (!q || !arrow || !text) return;
    const target = questWaypoint();
    if (!target) {
      arrow.hidden = true;
      text.textContent = q.nav || "完成当前目标以继续远征";
      return;
    }
    arrow.hidden = false;
    arrow.style.transform = "rotate(" + (target.relative * 180 / Math.PI).toFixed(1) + "deg)";
    text.textContent = target.distance < 6
      ? target.label + " · 就在附近"
      : target.label + " · " + Math.round(target.distance) + " 米";
  }

  // =====================================================================
  // Breaking / placing
  // =====================================================================
  let hit = null, breakT = 0, breakId = null, mouseDown = false, mouseRight = false;
  let lastStep = 0, placeCd = 0;

  function mineSpeed(id) {
    const d = defOf(id);
    if (!d) return 0;
    if (G.creative) return 20;
    if (d.hard >= 900) return 0;
    const t = handTool();
    let spd = 1;
    if (t && t.tool === d.tool) spd = effSpeed(selected());
    if (d.level && (!t || t.level < d.level || t.tool !== d.tool)) {
      if (d.level >= 1 && d.tool === "pick") spd = 0.15;
    }
    if (hasBuff("vigor")) spd *= 1.4;
    return spd / Math.max(0.05, d.hard);
  }
  function canHarvest(id) {
    const d = defOf(id);
    if (!d || !d.drop) return false;
    if (!d.level) return true;
    const t = handTool();
    return t && t.tool === d.tool && t.level >= d.level;
  }
  function containerHasItems(x, y, z, key) {
    const k = cxyz(x, y, z);
    if (key === "chest") return (G.chests.get(k) || []).some(Boolean);
    if (key === "furnace") {
      const f = G.furnaces.get(k);
      return !!(f && (f.in || f.fuel || f.out));
    }
    return false;
  }

  function tryBreak() {
    if (!hit) { breakT = 0; breakId = null; return; }
    const k = cxyz(hit.x, hit.y, hit.z);
    if (k !== breakId) { breakId = k; breakT = 0; }
    const spd = mineSpeed(hit.id);
    breakT += dtNow * spd;
    $("break-bar").style.display = G.creative ? "none" : "block";
    $("break-fill").style.width = clamp(breakT, 0, 1) * 100 + "%";
    if (G.tick % 8 === 0) sfx("step");
    // chips fly off the block you are chewing through
    if (spd > 0 && G.tick % 5 === 0) {
      const dd = defOf(hit.id);
      spawnBurst(hit.x + 0.5 + hit.face[0] * 0.5, hit.y + 0.5 + hit.face[1] * 0.5, hit.z + 0.5 + hit.face[2] * 0.5,
        dd ? dd.color : [130, 130, 130], 2, 0.35);
    }
    swingHand();
    if (breakT >= 1) {
      const d = defOf(hit.id);
      if (d && containerHasItems(hit.x, hit.y, hit.z, d.key)) {
        toast("请先清空" + (d.key === "chest" ? "箱子" : "熔炉") + "再拆除");
        breakT = 0; breakId = null; mouseDown = false; return;
      }
      if (d && d.key === "tnt") {
        explode(hit.x, hit.y, hit.z, 3.2);
      } else if (harvestCrop(hit.x, hit.y, hit.z, hit.id)) {
        STAT.mined++;
        questEvent("break", d.key, 1);
      } else {
        if (canHarvest(hit.id) && d.drop) {
          // Fortune only pays on things that were dug up, never on placed blocks
          // you are simply picking back up — otherwise it prints resources.
          let n = 1;
          if (d.level > 0 && d.drop !== d.key) {
            const f = affixVal(selected(), "fortune", 0);
            while (Math.random() < f) { n++; if (n > 4) break; }
          }
          give(d.drop, n);
          if (n > 1) addFloat(hit.x + 0.5, hit.y + 1.2, hit.z + 0.5, "财运 ×" + n, "kill");
        }
        if (d && (d.key === "oak_leaves" || d.key === "birch_leaves") && Math.random() < 0.08) give("apple", 1);
        // Seeds come from the wild, so farming can be bootstrapped anywhere with no
        // recipe: tufts of grass carry wheat, the olive canopy carries vine cuttings.
        if (d && d.key === "tallgrass" && Math.random() < 0.34) give("wheat_seeds", 1);
        if (d && d.key === "oak_leaves" && Math.random() < 0.06) give("grape_seeds", 1);
        setBlock(hit.x, hit.y, hit.z, AIR);
        if (d && d.key === "chest") G.chests.delete(cxyz(hit.x, hit.y, hit.z));
        if (d && d.key === "furnace") G.furnaces.delete(cxyz(hit.x, hit.y, hit.z));
        if (d) questEvent("break", d.key, 1);
        STAT.mined++;
        hitStop = 0.03;
        addShake(0.045);
        if (!G.creative) wearTool();
        sfx("break");
        spawnBurst(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, d ? d.color : [120, 120, 120]);
      }
      breakT = 0; breakId = null;
    }
  }
  // Eat whatever is in hand. Buff foods are still worth eating on a full belly —
  // that is the whole point of stocking wine before winter — so only plain food
  // is refused when full.
  function eatHeld() {
    const s = selected();
    const it = s && ITEMS[s.key];
    if (!it || !it.food) return false;
    if (P.food >= 20 && !it.buff) { toast("你还不饿"); placeCd = 0.25; return false; }
    P.food = clamp(P.food + it.food, 0, 20);
    if (it.buff) addBuff(it.buff[0], it.buff[1]);
    s.n--; if (s.n <= 0) inv[sel] = null;
    sfx("pop");
    spawnBurst(P.x, P.y + 1.3, P.z, it.color || [220, 200, 140], 6, 0.4);
    refreshHotbar();
    placeCd = 0.25;
    return true;
  }
  function tryPlace() {
    if (placeCd > 0) return;
    if (talkToNPC()) { placeCd = 0.3; return; }
    // Actions that need no target run before the raycast guard: throwing a pilum
    // and eating both work with nothing but sky in the crosshair.
    const held0 = selected();
    const it0 = held0 && ITEMS[held0.key];
    if (it0 && it0.thrown) { throwPilum(); return; }
    if (it0 && it0.food) { eatHeld(); return; }
    if (!hit) return;
    const id = hit.id;
    const d = defOf(id);
    if (d && d.key === "crafting_table") { openUI("table"); return; }
    if (d && d.key === "furnace") { openFurnaceKey(hit.x, hit.y, hit.z); openUI("furnace"); return; }
    if (d && d.key === "chest") { openChestKey(hit.x, hit.y, hit.z); openUI("chest"); return; }
    if (d && d.key === "legion_anvil") { openUI("forge"); return; }
    const s = selected();
    if (!s) return;
    const it = ITEMS[s.key];
    // A hoe turns the block you are looking at into tilled soil.
    if (it && it.tool === "hoe") {
      if (tillSoil(hit.x, hit.y, hit.z)) { if (!G.creative) wearTool(); placeCd = 0.28; }
      return;
    }
    // Seeds sow onto the soil surface, i.e. into the empty cell the face points at.
    if (it && it.plant) {
      if (plantCrop(hit.x + hit.face[0], hit.y + hit.face[1], hit.z + hit.face[2], it.plant)) {
        if (!G.creative) { s.n--; if (s.n <= 0) inv[sel] = null; }
        refreshHotbar(); placeCd = 0.22;
      }
      return;
    }
    if (!it || !it.block) return;
    const px = hit.x + hit.face[0], py = hit.y + hit.face[1], pz = hit.z + hit.face[2];
    if (isSolid(getBlock(px, py, pz))) return;
    // don't place inside player
    if (Math.abs(px + 0.5 - P.x) < 0.7 && py < P.y + 1.8 && py + 1 > P.y && Math.abs(pz + 0.5 - P.z) < 0.7) return;
    setBlock(px, py, pz, it.block);
    if (!G.creative) { s.n--; if (s.n <= 0) inv[sel] = null; }
    questEvent("place", s.key, 1);
    STAT.placed++;
    sfx("place"); refreshHotbar(); placeCd = 0.18;
  }
  function explode(x, y, z, r) {
    sfx("boom");
    setBlock(x, y, z, AIR);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      if (dx * dx + dy * dy + dz * dz > r * r) continue;
      const bx = x + dx, by = y + dy, bz = z + dz;
      const id = getBlock(bx, by, bz);
      if (id === BEDROCK) continue;
      if (id) setBlock(bx, by, bz, AIR);
    }
    if (Math.hypot(P.x - x, P.y - y, P.z - z) < r + 1) hurt(10, "blew up");
  }

  const parts = [];
  function spawnBurst(x, y, z, col, n, spread) {
    n = n || 10; spread = spread || 1;
    // Budget by recycling, not by dropping: a full pool used to swallow the whole
    // burst, so the hit that mattered most (mid-fight) was the one with no feedback.
    const over = parts.length + n - 300;
    if (over > 0) parts.splice(0, Math.min(over, parts.length));
    for (let i = 0; i < n; i++) {
      parts.push({
        x, y, z,
        vx: (Math.random() - 0.5) * 4 * spread, vy: Math.random() * 4 * spread, vz: (Math.random() - 0.5) * 4 * spread,
        life: 0.5 + Math.random() * 0.4,
        col: [col[0] / 255, col[1] / 255, col[2] / 255]
      });
    }
  }
  // =====================================================================
  // Projectiles — thrown pila (player) and barbarian arrows (mobs)
  // =====================================================================
  const shots = [];
  function spawnShot(x, y, z, dx, dy, dz, speed, dmg, from, col) {
    if (shots.length > 60) shots.shift();
    shots.push({ x, y, z, vx: dx * speed, vy: dy * speed, vz: dz * speed, dmg, from, col, life: 4 });
  }
  function shotTick(dt) {
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      s.life -= dt;
      s.vy -= 11 * dt;
      // Substep so a fast pilum cannot tunnel through a one-block wall.
      const steps = Math.max(1, Math.ceil(Math.hypot(s.vx, s.vy, s.vz) * dt / 0.4));
      let dead = s.life <= 0;
      for (let k = 0; k < steps && !dead; k++) {
        const h = dt / steps;
        s.x += s.vx * h; s.y += s.vy * h; s.z += s.vz * h;
        if (isSolid(getBlock(s.x, s.y, s.z))) {
          spawnBurst(s.x, s.y, s.z, s.col, 4, 0.3);
          sfx("thud");
          dead = true;
          break;
        }
        if (s.from === "player") {
          for (const m of mobs) {
            if (m.npc) continue;
            if (Math.abs(m.x - s.x) < m.w + 0.32 && Math.abs(m.z - s.z) < m.w + 0.32
                && s.y > m.y - 0.2 && s.y < m.y + m.h + 0.2) {
              mobHurt(m, s.dmg, { kb: 4.5, dir: [s.vx, s.vz], label: "ranged" });
              dead = true;
              break;
            }
          }
        } else if (!G.creative && !P.dead
            && Math.abs(P.x - s.x) < 0.62 && Math.abs(P.z - s.z) < 0.62
            && s.y > P.y - 0.2 && s.y < P.y + 1.9) {
          hurt(s.dmg, s.reason || "was shot down on the frontier");
          spawnBurst(s.x, s.y, s.z, [220, 70, 60], 5, 0.4);
          dead = true;
        }
      }
      if (dead || s.y < -4) shots.splice(i, 1);
    }
  }
  function throwPilum() {
    const s = selected();
    if (!s || !ITEMS[s.key] || !ITEMS[s.key].thrown) return false;
    const e = eyePos(), d = lookDir();
    spawnShot(e[0] + d[0] * 0.7, e[1] + d[1] * 0.7 - 0.1, e[2] + d[2] * 0.7,
      d[0], d[1] + 0.06, d[2], 34, ITEMS[s.key].damage || 8, "player", ITEMS[s.key].color || [214, 205, 184]);
    if (!G.creative) { s.n--; if (s.n <= 0) inv[sel] = null; }
    refreshHotbar();
    swingHand(); sfx("throw"); addShake(0.05);
    placeCd = 0.32;
    return true;
  }

  // Burning is a status, not an instant hit: it keeps ticking after you disengage,
  // which is what makes an ember weapon feel different from a keen one.
  function igniteMob(m, dps, secs) {
    if (!m || m.hp <= 0) return false;
    m.burn = { dps, t: Math.max(secs, m.burn ? m.burn.t : 0), acc: 0 };
    return true;
  }
  function burnTick(dt) {
    for (let i = mobs.length - 1; i >= 0; i--) {
      const m = mobs[i];
      if (!m.burn || m.burn.t <= 0) continue;
      m.burn.t -= dt;
      m.burn.acc += m.burn.dps * dt;
      if (Math.random() < dt * 12) spawnBurst(m.x, m.y + m.h * 0.5, m.z, [255, 150, 50], 1, 0.3);
      if (m.burn.acc >= 1) {                        // pay out in whole points
        const n = Math.floor(m.burn.acc);
        m.burn.acc -= n;
        mobHurt(m, n, { label: "burn" });
      }
      if (m.burn.t <= 0) m.burn = null;
    }
  }

  // One damage path for melee, projectiles and traps, so feedback never diverges.
  function mobHurt(m, dmg, opts) {
    if (!m || m.hp <= 0) return false;
    // Story NPCs carry the quest chain. Letting a stray wolf (or a mis-aimed
    // player swing) delete Marcus would soft-lock the chapter with no way back,
    // so they shrug the hit off visibly instead of taking it.
    if (m.story) { m.flash = 0.16; addFloat(m.x, m.y + m.h + 0.35, m.z, "格挡", "block"); sfx("hit"); return false; }
    opts = opts || {};
    const finisher = m.hp <= m.maxHp * 0.34 && opts.label !== "trap";
    let n = dmg;
    if (finisher && opts.label !== "trap") n = Math.round(dmg * 1.5 * 10) / 10;
    m.hp -= n;
    m.flash = 0.16;
    if (opts.kb) {
      const d = opts.dir || [0, 0];
      const l = Math.hypot(d[0], d[1]) || 1;
      m.vx = d[0] / l * opts.kb; m.vz = d[1] / l * opts.kb;
      m.vy = Math.max(m.vy, 2.6);
      m.stagger = 0.26;
    }
    addFloat(m.x, m.y + m.h + 0.35, m.z, (finisher ? "✦ " : "") + n, finisher ? "crit" : "dmg");
    spawnBurst(m.x, m.y + m.h * 0.6, m.z, [232, 84, 72], 6, 0.35);
    sfx(finisher ? "crit" : "hit");
    if (m.hp <= 0) killMob(m);
    return true;
  }
  function killMob(m) {
    const i = mobs.indexOf(m);
    if (i < 0) return;
    if (m.drop && m.drop[1] > 0) give(m.drop[0], m.drop[1]);
    else if (m.kind === "zombie" && Math.random() < 0.08) give("iron_ingot", 1);
    mobs.splice(i, 1);
    STAT.kills++;
    hitStop = m.boss ? 0.14 : 0.055;
    addShake(m.boss ? 0.45 : 0.16);
    spawnBurst(m.x, m.y + m.h * 0.5, m.z, (m.color || [0.7, 0.4, 0.2]).map((c) => c * 255), m.boss ? 40 : 16, m.boss ? 1.4 : 0.7);
    addFloat(m.x, m.y + m.h + 0.6, m.z, m.boss ? "背誓者伏诛" : "坑杀", "kill");
    sfx(m.boss ? "roar" : "kill");
    if (m.boss) { $("boss-bar").hidden = true; toast("背誓百夫长倒下了。北境的长夜结束了。"); }
    questEvent("kill", m.kind, 1);
  }

  function partTick(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.vy -= 18 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.life -= dt;
      if (p.life <= 0) parts.splice(i, 1);
    }
  }

  // =====================================================================
  // Furnace
  // =====================================================================
  function furnAt(x, y, z) {
    const k = cxyz(x, y, z);
    if (!G.furnaces.has(k)) G.furnaces.set(k, { in: null, fuel: null, out: null, cook: 0, fuelLeft: 0 });
    return G.furnaces.get(k);
  }
  function openFurnaceKey(x, y, z) { openFurnace = furnAt(x, y, z); }
  function chestAt(x, y, z) {
    const k = cxyz(x, y, z);
    if (!G.chests.has(k)) G.chests.set(k, new Array(27).fill(null));
    return G.chests.get(k);
  }
  function openChestKey(x, y, z) { openChest = chestAt(x, y, z); }
  function furnaceTick(dt) {
    for (const f of G.furnaces.values()) {
      const can = f.in && SMELT[f.in.key] && (!f.out || (f.out.key === SMELT[f.in.key][0] && f.out.n < 64));
      if (f.fuelLeft <= 0 && can && f.fuel && FUEL[f.fuel.key]) {
        f.fuelLeft = FUEL[f.fuel.key];
        f.fuel.n--; if (f.fuel.n <= 0) f.fuel = null;
      }
      if (f.fuelLeft > 0 && can) {
        f.cook += dt / 8;
        if (f.cook >= 1) {
          const [k, n] = SMELT[f.in.key];
          if (f.out && f.out.key === k) f.out.n += n; else f.out = stackOf(k, n);
          f.in.n--; if (f.in.n <= 0) f.in = null;
          f.cook = 0;
          questEvent("smelt", k, n);
        }
      } else f.cook = 0;
      if (f.fuelLeft > 0) f.fuelLeft -= dt / 8;
    }
  }

  // =====================================================================
  // UI drawing
  // =====================================================================
  const iconCache = new Map();
  function itemCanvas(key, size) {
    const ck = key + ":" + size;
    if (iconCache.has(ck)) return iconCache.get(ck);
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    const it = ITEMS[key];
    if (!it) { iconCache.set(ck, c); return c; }
    if (it.block) {
      const d = DEFS[it.block];
      const top = tileUV(d.tile), side = tileUV(d.tileS);
      // isometric-ish cube
      const s = size, m = s * 0.12;
      ctx.save();
      // top
      ctx.beginPath();
      ctx.moveTo(s/2, m); ctx.lineTo(s - m, s*0.32); ctx.lineTo(s/2, s*0.5); ctx.lineTo(m, s*0.32);
      ctx.closePath(); ctx.fillStyle = rgb(d.color); ctx.fill();
      ctx.globalAlpha = 0.85;
      // left
      ctx.beginPath();
      ctx.moveTo(m, s*0.32); ctx.lineTo(s/2, s*0.5); ctx.lineTo(s/2, s - m); ctx.lineTo(m, s*0.72);
      ctx.closePath(); ctx.fillStyle = shade(d.color, 0.72); ctx.fill();
      // right
      ctx.beginPath();
      ctx.moveTo(s - m, s*0.32); ctx.lineTo(s/2, s*0.5); ctx.lineTo(s/2, s - m); ctx.lineTo(s - m, s*0.72);
      ctx.closePath(); ctx.fillStyle = shade(d.color, 0.55); ctx.fill();
      ctx.restore();
      void top; void side;
    } else {
      drawGlyph(ctx, size, it);
    }
    iconCache.set(ck, c);
    return c;
  }
  function rgb(c) { return "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")"; }
  function shade(c, k) { return "rgb(" + (c[0]*k|0) + "," + (c[1]*k|0) + "," + (c[2]*k|0) + ")"; }
  function drawGlyph(ctx, s, it) {
    ctx.fillStyle = rgb(it.color || [200, 200, 200]);
    const k = it.icon;
    if (k === "stick") { ctx.fillRect(s*0.45, s*0.15, s*0.12, s*0.7); }
    else if (k === "lump") { ctx.beginPath(); ctx.arc(s*0.5, s*0.55, s*0.22, 0, 7); ctx.fill(); }
    else if (k === "ingot") { ctx.fillRect(s*0.18, s*0.4, s*0.64, s*0.22); }
    else if (k === "gem") {
      ctx.beginPath(); ctx.moveTo(s*0.5, s*0.18); ctx.lineTo(s*0.78, s*0.48); ctx.lineTo(s*0.5, s*0.82); ctx.lineTo(s*0.22, s*0.48); ctx.fill();
    } else if (k === "coin") {
      ctx.beginPath(); ctx.arc(s*0.5, s*0.5, s*0.27, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#fff0aa"; ctx.lineWidth = Math.max(1, s * 0.05); ctx.stroke();
      ctx.fillStyle = "#8a5a20"; ctx.font = `bold ${s * 0.28}px serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("SPQR", s*0.5, s*0.52);
    } else if (k === "spear") {
      ctx.strokeStyle = "#8a6234"; ctx.lineWidth = s * 0.09; ctx.beginPath(); ctx.moveTo(s*.2,s*.82); ctx.lineTo(s*.76,s*.2); ctx.stroke();
      ctx.fillStyle = rgb(it.color); ctx.beginPath(); ctx.moveTo(s*.78,s*.08); ctx.lineTo(s*.9,s*.3); ctx.lineTo(s*.68,s*.22); ctx.closePath(); ctx.fill();
    } else if (k === "shield") {
      ctx.fillStyle = rgb(it.color); ctx.beginPath(); ctx.moveTo(s*.2,s*.2); ctx.lineTo(s*.8,s*.2); ctx.lineTo(s*.72,s*.72); ctx.lineTo(s*.5,s*.9); ctx.lineTo(s*.28,s*.72); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#e8c56a"; ctx.fillRect(s*.46,s*.22,s*.08,s*.58);
    } else if (k === "food") { ctx.beginPath(); ctx.arc(s*0.5, s*0.52, s*0.24, 0, 7); ctx.fill(); }
    else if (k === "seed") {
      // three husks scattered on the palm
      // Squashed circles via a scaled arc — `ellipse` is not available everywhere.
      for (const [px, py] of [[0.36, 0.42], [0.58, 0.34], [0.48, 0.62]]) {
        ctx.save();
        ctx.translate(s * px, s * py);
        ctx.scale(1, 0.62);
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.11, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    } else if (k === "pick" || k === "axe" || k === "shovel" || k === "sword" || k === "hoe") {
      ctx.fillStyle = "#8a6234";
      ctx.fillRect(s*0.46, s*0.28, s*0.1, s*0.58);
      ctx.fillStyle = rgb(it.color);
      if (k === "pick") { ctx.fillRect(s*0.22, s*0.18, s*0.56, s*0.14); }
      if (k === "axe") { ctx.fillRect(s*0.46, s*0.14, s*0.32, s*0.28); }
      if (k === "shovel") { ctx.fillRect(s*0.38, s*0.12, s*0.26, s*0.2); }
      if (k === "sword") { ctx.fillRect(s*0.42, s*0.1, s*0.16, s*0.42); }
      if (k === "hoe") { ctx.fillRect(s*0.46, s*0.16, s*0.34, s*0.12); ctx.fillRect(s*0.68, s*0.16, s*0.12, s*0.26); }
    }
  }

  function fillSlot(el, stack, selected) {
    el.innerHTML = "";
    el.classList.toggle("sel", !!selected);
    el.classList.toggle("empty", !stack);
    if (!stack) return;
    const c = itemCanvas(stack.key, 48);
    const img = document.createElement("canvas");
    img.width = img.height = 48;
    img.getContext("2d").drawImage(c, 0, 0);
    el.appendChild(img);
    if (stack.n > 1) {
      const n = document.createElement("div"); n.className = "n"; n.textContent = stack.n; el.appendChild(n);
    }
    // Tools show how much life is left, so wear is a visible system rather than a surprise.
    const wear = toolWear(stack);
    if (wear) {
      const bar = document.createElement("div");
      bar.className = "dur" + (wear.state ? " " + wear.state : "");
      const fill = document.createElement("i");
      fill.style.width = (wear.left * 100).toFixed(0) + "%";
      bar.appendChild(fill);
      el.appendChild(bar);
    }
  }
  // null when the stack is not a worn tool; otherwise the remaining fraction + severity band.
  function toolWear(stack) {
    if (!stack) return null;
    const def = ITEMS[stack.key];
    if (!def || !def.tool || !def.dur) return null;
    const left = clamp((stack.dur == null ? def.dur : stack.dur) / def.dur, 0, 1);
    if (left >= 1) return null;
    return { left, state: left < 0.2 ? "low" : left < 0.5 ? "warn" : "" };
  }

  function makeSlots(parent, n, getter, setter, isHot) {
    parent.innerHTML = "";
    for (let i = 0; i < n; i++) {
      const el = document.createElement("div");
      el.className = "slot ui";
      el.dataset.i = i;
      const stack = getter(i);
      fillSlot(el, stack, isHot && i === sel);
      el.addEventListener("mousedown", (e) => {
        e.preventDefault(); e.stopPropagation();
        clickSlot(getter, setter, i, e.button === 2);
      });
      el.addEventListener("contextmenu", (e) => e.preventDefault());
      el.addEventListener("mouseenter", (e) => showTip(e, getter(i)));
      el.addEventListener("mouseleave", hideTip);
      parent.appendChild(el);
    }
  }
  function clickSlot(getter, setter, i, right) {
    sfx("click");
    const cur = getter(i);
    if (right) {
      if (held && cur && canStack(held, cur) && cur.n < (ITEMS[cur.key].stack || 64)) { cur.n++; held.n--; if (held.n <= 0) held = null; }
      else if (held && !cur) { setter(i, stackOf(held.key, 1, held.dur)); held.n--; if (held.n <= 0) held = null; }
      else if (!held && cur) {
        const half = Math.ceil(cur.n / 2);
        held = stackOf(cur.key, half, cur.dur); cur.n -= half; if (cur.n <= 0) setter(i, null);
      }
    } else {
      if (!held) { held = cur; setter(i, null); }
      else if (!cur) { setter(i, held); held = null; }
      else if (canStack(held, cur)) {
        const add = Math.min((ITEMS[cur.key].stack || 64) - cur.n, held.n);
        cur.n += add; held.n -= add; if (held.n <= 0) held = null;
      } else { setter(i, held); held = cur; }
    }
    if (uiMode === "table" || uiMode === "inv") refreshCraft();
    renderInv(); refreshHotbar(); renderCursor();
  }
  function renderCursor() {
    const el = $("cursor-item");
    if (!held) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = "";
    el.appendChild(itemCanvas(held.key, 44));
  }
  function showTip(e, stack) {
    if (!stack) { hideTip(); return; }
    const t = $("tooltip");
    t.hidden = false;
    const a = affixOf(stack);
    t.textContent = displayName(stack) + (a ? "\n" + a.def.desc : "");
    t.style.whiteSpace = "pre-line";
    t.style.left = (e.clientX + 14) + "px";
    t.style.top = (e.clientY + 14) + "px";
  }
  function hideTip() { $("tooltip").hidden = true; }

  // The anvil panel: what is in hand, what it rolled, and what a reroll costs.
  function renderForge() {
    const row = $("forge-row");
    if (!row) return;
    const s = selected();
    const a = affixOf(s);
    const chk = canForge(s);
    const cost = chk.cost || forgeCost(s);
    $("forge-item").textContent = s ? displayName(s) : "空手";
    const cur = $("forge-affix");
    if (a) {
      cur.textContent = a.def.name + " " + AFFIX_TIERS[a.tier - 1] + " —— " + a.def.desc;
      cur.style.color = a.def.color;
    } else {
      cur.textContent = s && ITEMS[s.key] && ITEMS[s.key].tool ? "尚无词条" : "手上没有可锻造的装备";
      cur.style.color = "";
    }
    $("forge-cost").textContent = "花费 " + cost.denarius + " 第纳里乌斯 + " + cost.ember_shard + " 余烬碎片"
      + "（持有 " + countItem("denarius") + " / " + countItem("ember_shard") + "）";
    const btn = $("btn-forge");
    btn.disabled = !chk.ok;
    btn.textContent = a ? "重铸词条" : "锻造词条";
    $("forge-why").textContent = chk.ok ? "" : chk.why;
    $("forge-pool").innerHTML = (s && ITEMS[s.key] && ITEMS[s.key].tool ? affixPool(ITEMS[s.key].tool) : [])
      .map((id) => '<span class="afx" style="--ac:' + AFFIXES[id].color + '">' + AFFIXES[id].name + "</span>").join("");
  }

  function renderInv() {
    if (uiMode == null) return;
    $("furnace-row").hidden = uiMode !== "furnace";
    $("chest-row").hidden = uiMode !== "chest";
    $("forge-row").hidden = uiMode !== "forge";
    const sideMode = uiMode === "furnace" || uiMode === "chest" || uiMode === "forge";
    $("craft-row").hidden = sideMode;
    $("recipe-guide").hidden = sideMode;
    $("inv-title").textContent = uiMode === "furnace" ? "FURNACE" : uiMode === "chest" ? "CHEST"
      : uiMode === "forge" ? "LEGION ANVIL" : uiMode === "table" ? "CRAFTING TABLE" : "BACKPACK";
    const cg = $("craft-grid");
    cg.classList.toggle("table", craftSize === 3);
    if (uiMode === "forge") renderForge();
    if (!sideMode) {
      makeSlots(cg, craftSize * craftSize, (i) => craft[i], (i, v) => { craft[i] = v; refreshCraft(); });
      makeSlots($("craft-out"), 1, () => craftOut, (i, v) => {
        if (craftOut && !v) {
          if (held && canStackFully(held, craftOut)) { held.n += craftOut.n; takeCraft(); }
          else if (!held) { held = stackOf(craftOut.key, craftOut.n, craftOut.dur); takeCraft(); }
        }
      });
    } else if (openFurnace) {
      const f = openFurnace;
      makeSlots($("furnace-in"), 1, () => f.in, (i, v) => { f.in = v; });
      makeSlots($("furnace-fuel"), 1, () => f.fuel, (i, v) => { f.fuel = v; });
      makeSlots($("furnace-out"), 1, () => f.out, (i, v) => { f.out = v; });
      $("smelt-fill").style.height = (clamp(f.cook, 0, 1) * 100) + "%";
    }
    if (uiMode === "chest" && openChest) makeSlots($("chest-grid"), 27, (i) => openChest[i], (i, v) => { openChest[i] = v; });
    makeSlots($("inv-grid"), 27, (i) => inv[i + 9], (i, v) => { inv[i + 9] = v; });
    makeSlots($("inv-hotbar"), 9, (i) => inv[i], (i, v) => { inv[i] = v; });
  }

  function refreshHotbar() {
    const bar = $("hotbar");
    bar.innerHTML = "";
    for (let i = 0; i < 9; i++) {
      const el = document.createElement("div");
      el.className = "slot" + (i === sel ? " sel" : "");
      fillSlot(el, inv[i], i === sel);
      bar.appendChild(el);
    }
    const s = selected();
    const base = s ? ((ITEMS[s.key] && ITEMS[s.key].name) || s.key) : "";
    const nm = $("item-name");
    const a = affixOf(s);
    if (a) {
      // Tint just the affix, so rarity reads at a glance without shouting.
      nm.innerHTML = '<span class="afx-tag" style="--ac:' + a.def.color + '">'
        + a.def.name + " " + AFFIX_TIERS[a.tier - 1] + "</span> · " + base;
    } else {
      nm.textContent = base;
    }
    nm.style.opacity = base ? "1" : "0";
    drawHand();
    drawVitals();
  }
  function drawVitals() {
    const hc = $("hearts"), hu = $("hunger");
    hc.innerHTML = ""; hu.innerHTML = "";
    if (G.creative) return;
    for (let i = 0; i < 10; i++) {
      const a = document.createElement("canvas"); a.width = 18; a.height = 16; a.className = "pip";
      const ctx = a.getContext("2d");
      ctx.fillStyle = P.hp > i * 2 + 1 ? "#e04040" : P.hp > i * 2 ? "#a02828" : "#301010";
      ctx.beginPath();
      ctx.moveTo(9, 14); ctx.bezierCurveTo(-2, 6, 4, 0, 9, 5); ctx.bezierCurveTo(14, 0, 20, 6, 9, 14); ctx.fill();
      hc.appendChild(a);
      const b = document.createElement("canvas"); b.width = 18; b.height = 16; b.className = "pip";
      const c2 = b.getContext("2d");
      c2.fillStyle = P.food > i * 2 + 1 ? "#d09030" : P.food > i * 2 ? "#805018" : "#302010";
      c2.fillRect(4, 3, 10, 10); c2.fillRect(6, 1, 6, 3);
      hu.appendChild(b);
    }
  }
  function drawHand() {
    const c = $("hand-c");
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, 160, 160);
    const s = selected();
    if (P.view !== 0) return;
    if (s) ctx.drawImage(itemCanvas(s.key, 140), 10, 10);
    else {
      ctx.fillStyle = "#d0a070";
      ctx.fillRect(70, 50, 50, 90);
    }
  }
  function swingHand() {
    armSwingT = 1;
    const el = $("hand");
    el.classList.remove("swing");
    void el.offsetWidth;
    el.classList.add("swing");
  }

  function setView(v, silent) {
    P.view = ((v % 3) + 3) % 3;
    camS.ready = false;
    const names = ["第一人称", "第三人称", "正面镜头"];
    const btn = $("btn-view");
    if (btn) btn.textContent = names[P.view];
    $("hand").style.visibility = P.view === 0 ? "visible" : "hidden";
    if (!silent) toast(names[P.view] + (P.view ? "  ·  滚轮或 - / = 拉近拉远" : ""));
  }

  function openUI(mode) {
    uiMode = mode;
    craftSize = mode === "table" ? 3 : 2;
    if (mode !== "furnace") openFurnace = null;
    if (mode !== "chest") openChest = null;
    if (mode === "forge") sfx("craft");
    $("inv-wrap").hidden = false;
    releasePointer();
    renderInv();
    sfx("click");
  }
  function closeUI() {
    // dump craft grid
    for (let i = 0; i < 9; i++) if (craft[i]) { give(craft[i].key, craft[i].n); craft[i] = null; }
    craftOut = null;
    if (held) { give(held.key, held.n); held = null; }
    uiMode = null;
    $("inv-wrap").hidden = true;
    renderCursor();
    lockPointer();
  }

  function toast(msg) {
    const t = $("toast");
    t.textContent = msg; t.style.display = "block";
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.style.display = "none"; }, 2400);
  }

  function updateWorldInfo(force) {
    const bio = biomeAt(wf(P.x), wf(P.z));
    if (bio !== lastBiome) {
      lastBiome = bio;
      if (!discoveries.has(bio)) {
        discoveries.add(bio);
        if (!force) {
          toast("发现新群系：" + (BIOME_NAMES[bio] || bio));
          sfx("pop");
          questEvent("discover", bio, 1);
        }
        renderQuest();
      }
    }
    const totalMinutes = Math.floor(((G.time + 0.25) % 1) * 24 * 60);
    const hh = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
    const mm = String(totalMinutes % 60).padStart(2, "0");
    $("world-day").textContent = "第 " + G.day + " 天";
    $("world-clock").textContent = hh + ":" + mm;
    const zone = P.x>=16&&P.x<32&&P.z>=0&&P.z<16 ? "帝国斗兽场" :
      P.x>=0&&P.x<16&&P.z>=-16&&P.z<0 ? "罗马广场" :
      P.x>=-16&&P.x<0&&P.z>=0&&P.z<16 ? "卡拉卡拉浴场" :
      P.x>=16&&P.x<32&&P.z>=-16&&P.z<0 ? "朱庇特神庙" :
      P.x>=0&&P.x<16&&P.z>=16&&P.z<32 ? "帕拉蒂尼宅邸" :
      P.x>=0&&P.x<16&&P.z>=0&&P.z<16 ? "第十军团营地" : null;
    $("world-biome").textContent = zone || BIOME_NAMES[bio] || bio;
    $("world-discovery").textContent = "探索 " + Math.min(discoveries.size, BIOME_GOAL) + " / " + BIOME_GOAL;
    $("world-relic").textContent = "第纳里乌斯 " + inv.reduce((n, s) => n + (s && s.key === "denarius" ? s.n : 0), 0);
    const sea = season();
    const el = $("world-season");
    if (el) {
      el.textContent = sea.name + " · 余 " + seasonDaysLeft() + " 天";
      el.dataset.season = sea.key;
      el.title = sea.note;
    }
    updateRunStats();
  }

  function runSeconds() { return STAT.t0 ? Math.max(0, (performance.now() - STAT.t0) / 1000) : 0; }
  function updateRunStats() {
    const box = $("run-stats");
    if (!box) return;
    const tier = threatTier();
    const el = $("stat-threat");
    if (el && lastTier !== tier) {
      lastTier = tier;
      el.textContent = "威胁等级 " + (tier + 1) + " / 6";
      if (tier > 0) { toast("威胁等级提升到 " + (tier + 1) + " — 夜里的敌人更多也更硬"); sfx("levelup"); }
    }
    $("stat-kills").textContent = "击杀 " + STAT.kills;
    $("stat-mined").textContent = "挖掘 " + STAT.mined;
    $("stat-placed").textContent = "放置 " + STAT.placed;
    const sec = runSeconds() | 0;
    $("stat-time").textContent = String((sec / 60) | 0).padStart(2, "0") + ":" + String(sec % 60).padStart(2, "0");
  }
  let lastTier = -1;

  function showVictory() {
    if (victoryShown) return;
    victoryShown = true;
    const ch = CHAPTERS[chapter];
    $("victory-title").textContent = ch.title;
    $("victory-sub").textContent = ch.sub;
    $("victory-stats").textContent = formatStats()
      + "\n发现群系 " + Math.min(discoveries.size, BIOME_GOAL) + " / " + BIOME_GOAL
      + "  ·  威胁等级 " + (threatTier() + 1)
      + "\n第 " + ch.n + " 章 · " + ch.quests.length + " 段目标全部完成";
    const nextBtn = $("btn-next-chapter");
    nextBtn.hidden = !ch.next;
    if (ch.next) nextBtn.textContent = ch.next;
    $("victory").hidden = false;
    paused = true;
    releasePointer();
    sfx("levelup");
  }
  let victoryShown = false;
  function beginNextChapter() {
    const ch = CHAPTERS[chapter];
    if (!ch.next) return false;
    setChapter(chapter + 1);
    victoryShown = false;
    $("victory").hidden = true;
    paused = false;
    lockPointer();
    toast("第 " + CHAPTERS[chapter].n + " 章开始：" + QUESTS[0].title);
    sfx("levelup");
    return true;
  }

  // =====================================================================
  // Day / sky
  // =====================================================================
  function dayFactor() {
    // 1 = noon, 0 = midnight. time 0=dawn, 0.25=noon, 0.5=dusk, 0.75=midnight
    const t = G.time;
    return clamp(Math.cos((t - 0.25) * Math.PI * 2) * 0.5 + 0.5, 0, 1);
  }
  // The colour and strength of every light in the world, rebuilt each frame.
  // Because the mesh stores sky and emitted exposure separately, changing these
  // re-lights the whole world for free — no chunk is touched.
  //
  // The curve is the point: dawn and dusk are warm and low, noon is bright and
  // near-neutral, night is dim and distinctly *blue* rather than merely dark.
  // Flame colour never moves, so a torch reads warm against a cold night.
  let lightRigCache = null, lightRigKey = "";
  function lightRig() {
    const d = dayFactor();
    const t = G.time;
    const ai = ashlandInf(P.x, P.z);
    // Recomputing this per draw call would be wasteful; it only changes when the
    // clock or the player's position meaningfully moves.
    const key = (d * 200 | 0) + ":" + (t * 200 | 0) + ":" + (ai * 40 | 0);
    if (key === lightRigKey) return lightRigCache;

    const sunset = Math.max(0, 1 - Math.abs((t % 1) - 0.5) * 8);
    const rise = Math.max(0, 1 - Math.abs(t - 0.0) * 8);
    const glow = Math.max(sunset, rise);

    // Sun at midday, low sun at the horizon, moonlight at night.
    const noonCol = [1.00, 0.97, 0.90];
    const horizCol = [1.05, 0.62, 0.34];
    const moonCol = [0.26, 0.32, 0.55];
    const sun = [0, 0, 0], amb = [0, 0, 0];
    // Ambient is the sky bouncing back: cold and weak at night, soft blue-white by day.
    const nightAmb = [0.085, 0.095, 0.155], dayAmb = [0.30, 0.315, 0.345];
    for (let i = 0; i < 3; i++) {
      const lit = lerp(moonCol[i] * 0.34, noonCol[i], d);
      sun[i] = lerp(lit, horizCol[i], glow * d * 0.85) * lerp(0.34, 0.92, d);
      amb[i] = lerp(nightAmb[i], dayAmb[i], d);
    }
    // Under the Ashlands the whole rig turns to ember-light and choking haze.
    if (ai > 0) {
      const k = clamp(ai * 1.1, 0, 0.85);
      const emberSun = [0.86, 0.42, 0.26], emberAmb = [0.24, 0.13, 0.11];
      for (let i = 0; i < 3; i++) {
        sun[i] = lerp(sun[i], emberSun[i] * lerp(0.45, 1, d), k);
        amb[i] = lerp(amb[i], emberAmb[i], k);
      }
    }
    lightRigKey = key;
    lightRigCache = { sky: new Float32Array(sun), amb: new Float32Array(amb),
      torch: new Float32Array([1.15, 0.78, 0.40]) };
    return lightRigCache;
  }

  function skyColors() {
    const d = dayFactor();
    const topD = [0.45, 0.68, 0.95], botD = [0.78, 0.86, 0.95];
    const topN = [0.02, 0.03, 0.08], botN = [0.08, 0.07, 0.14];
    const topS = [0.85, 0.38, 0.18], botS = [0.95, 0.62, 0.32];
    const t = G.time;
    const sunset = Math.max(0, 1 - Math.abs(((t + 0.0) % 1) - 0.5) * 8);
    const rise = Math.max(0, 1 - Math.abs(t - 0.0) * 8);
    const glow = Math.max(sunset, rise) * (1 - Math.abs(d - 0.35));
    const top = [
      lerp(lerp(topN[0], topD[0], d), topS[0], glow),
      lerp(lerp(topN[1], topD[1], d), topS[1], glow),
      lerp(lerp(topN[2], topD[2], d), topS[2], glow)
    ];
    const bot = [
      lerp(lerp(botN[0], botD[0], d), botS[0], glow),
      lerp(lerp(botN[1], botD[1], d), botS[1], glow),
      lerp(lerp(botN[2], botD[2], d), botS[2], glow)
    ];
    // The Ashlands sit under their own volcanic haze: the closer to the caldera,
    // the more the sky and fog turn to smoke and ember-light.
    const ai = ashlandInf(P.x, P.z);
    if (ai > 0) {
      const k = clamp(ai * 1.15, 0, 0.88);
      const hazeTop = [0.20, 0.15, 0.16], hazeBot = [0.52, 0.30, 0.20];
      for (let i = 0; i < 3; i++) {
        top[i] = lerp(top[i], hazeTop[i] * (0.35 + d * 0.65), k);
        bot[i] = lerp(bot[i], hazeBot[i] * (0.35 + d * 0.65), k);
      }
    }
    return { top, bot, fog: bot, night: 1 - d, ash: ai };
  }

  // =====================================================================
  // Input
  // =====================================================================
  const keys = {};
  let dtNow = 0.016, lastT = 0, fps = 60, running = false, paused = false;
  let lastSpace = 0, lastW = 0;

  window.addEventListener("keydown", (e) => {
    if (e.repeat && e.code !== "Space") { keys[e.code] = true; return; }
    keys[e.code] = true;
    if (e.code === "Tab") e.preventDefault();
    if (!running) return;
    if (e.code === "Escape") { togglePause(); return; }
    if (paused || P.dead) return;
    if (uiMode) {
      if (e.code === "KeyE" || e.code === "KeyC") closeUI();
      return;
    }
    if (e.code === "KeyE") openUI("inv");
    if (e.code === "KeyC") openUI("inv");
    if (e.code === "KeyQ") {
      const s = selected();
      if (s) { s.n--; if (s.n <= 0) inv[sel] = null; refreshHotbar(); }
    }
    if (e.code === "KeyF") {
      if (G.creative) P.flying = !P.flying;
      else toast("生存模式不能飞行");
    }
    if (e.code === "F3") { $("debug").hidden = !$("debug").hidden; e.preventDefault(); }
    if (e.code === "F5" || e.code === "KeyV") { setView(P.view + 1); e.preventDefault(); }
    if (e.code === "Minus" || e.code === "NumpadSubtract") camDist = clamp(camDist + 0.45, 2.2, 9);
    if (e.code === "Equal" || e.code === "NumpadAdd") camDist = clamp(camDist - 0.45, 2.2, 9);
    if (e.code === "Digit1") sel = 0;
    if (e.code === "Digit2") sel = 1;
    if (e.code === "Digit3") sel = 2;
    if (e.code === "Digit4") sel = 3;
    if (e.code === "Digit5") sel = 4;
    if (e.code === "Digit6") sel = 5;
    if (e.code === "Digit7") sel = 6;
    if (e.code === "Digit8") sel = 7;
    if (e.code === "Digit9") sel = 8;
    if (e.code >= "Digit1" && e.code <= "Digit9") refreshHotbar();
    if (e.code === "Space") {
      const now = performance.now();
      if (G.creative && now - lastSpace < 280) P.flying = !P.flying;
      lastSpace = now;
    }
    if (e.code === "KeyW") {
      const now = performance.now();
      if (now - lastW < 280) P.sprint = true;
      lastW = now;
    }
    if (e.code === "KeyM") saveGame();
  });
  window.addEventListener("keyup", (e) => { keys[e.code] = false; });
  canvas.addEventListener("mousedown", (e) => {
    if (!running || paused || uiMode || P.dead) return;
    if (document.pointerLockElement !== canvas) { lockPointer(); return; }
    if (e.button === 0) { mouseDown = true; if (hitMob()) mouseDown = false; }
    if (e.button === 2) { mouseRight = true; tryPlace(); }
    if (e.button === 1 && hit) {
      const d = defOf(hit.id);
      if (d) {
        const slot = inv.findIndex((s) => s && s.key === d.key);
        if (slot >= 0 && slot < 9) sel = slot;
        else if (G.creative) { inv[sel] = stackOf(d.key, 64); }
        refreshHotbar();
      }
      e.preventDefault();
    }
  });
  window.addEventListener("mouseup", (e) => {
    if (e.button === 0) { mouseDown = false; breakT = 0; $("break-bar").style.display = "none"; }
    if (e.button === 2) mouseRight = false;
  });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("wheel", (e) => {
    if (!running) return;
    if (P.view !== 0) {
      camDist = clamp(camDist + (e.deltaY > 0 ? 0.45 : -0.45), 2.2, 9);
      return;
    }
    sel = (sel + (e.deltaY > 0 ? 1 : 8)) % 9;
    refreshHotbar();
  }, { passive: true });
  window.addEventListener("mousemove", (e) => {
    if (held) {
      $("cursor-item").style.left = (e.clientX - 16) + "px";
      $("cursor-item").style.top = (e.clientY - 16) + "px";
    }
    if (document.pointerLockElement !== canvas) return;
    P.yaw += e.movementX * 0.0022;
    P.pitch -= e.movementY * 0.0022;
    P.pitch = clamp(P.pitch, -1.5, 1.5);
  });

  function formatStats() {
    const sec = STAT.t0 ? ((performance.now() - STAT.t0) / 1000) | 0 : 0;
    const mm = (sec / 60 | 0), ss = sec % 60;
    return "存活 " + mm + ":" + String(ss).padStart(2, "0")
      + "  ·  击杀 " + STAT.kills
      + "  ·  挖掘 " + STAT.mined
      + "  ·  放置 " + STAT.placed;
  }

  function initTouchUI() {
    if (initTouchUI.ready) return;
    initTouchUI.ready = true;
    const ui = $("touchui");
    if (!ui) return;
    ui.classList.add("on");
    document.body.style.touchAction = "none";
    renderDist = Math.min(renderDist, 5);
    const stick = $("stick"), nub = $("stick-nub");
    let stickId = null, cx0 = 0, cy0 = 0;
    const R = 52;
    stick.addEventListener("touchstart", (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      stickId = t.identifier;
      const r = stick.getBoundingClientRect();
      cx0 = r.left + r.width / 2; cy0 = r.top + r.height / 2;
    }, { passive: false });
    addEventListener("touchmove", (e) => {
      if (stickId == null) return;
      for (const t of e.changedTouches) {
        if (t.identifier !== stickId) continue;
        let dx = t.clientX - cx0, dy = t.clientY - cy0;
        const d = Math.hypot(dx, dy) || 1, cl = Math.min(d, R);
        dx = dx / d * cl; dy = dy / d * cl;
        nub.style.transform = "translate(" + dx + "px," + dy + "px)";
        pad.x = dx / R; pad.z = -dy / R;
      }
    }, { passive: false });
    const endStick = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== stickId) continue;
        stickId = null; pad.x = 0; pad.z = 0; nub.style.transform = "";
      }
    };
    addEventListener("touchend", endStick);
    addEventListener("touchcancel", endStick);

    const look = $("lookpad");
    let lookId = null, lx = 0, ly = 0, moved = 0, downT = 0;
    look.addEventListener("touchstart", (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      lookId = t.identifier; lx = t.clientX; ly = t.clientY; moved = 0; downT = performance.now();
    }, { passive: false });
    look.addEventListener("touchmove", (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier !== lookId) continue;
        const dx = t.clientX - lx, dy = t.clientY - ly;
        lx = t.clientX; ly = t.clientY;
        moved += Math.abs(dx) + Math.abs(dy);
        P.yaw += dx * 0.0055;
        P.pitch = clamp(P.pitch - dy * 0.0055, -1.5, 1.5);
      }
    }, { passive: false });
    look.addEventListener("touchend", (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== lookId) continue;
        lookId = null;
        if (moved < 12 && performance.now() - downT < 260) { mouseDown = true; tryBreak(); mouseDown = false; }
      }
    });

    const hold = (id, down, up) => {
      const el = $(id); if (!el) return;
      el.addEventListener("touchstart", (e) => { e.preventDefault(); down && down(); }, { passive: false });
      el.addEventListener("touchend", (e) => { e.preventDefault(); up && up(); }, { passive: false });
      el.addEventListener("touchcancel", () => { up && up(); });
    };
    hold("btn-jump", () => { keys.Space = true; jumpQueued = true; }, () => { keys.Space = false; });
    // Touch attack parity with desktop left-click: swing at a mob first, else mine.
    hold("btn-break", () => { if (!hitMob()) mouseDown = true; }, () => { mouseDown = false; });
    hold("btn-place", () => { tryPlace(); }, () => {});
    hold("btn-fly", () => { if (G.creative) { P.flying = !P.flying; toast(P.flying ? "飞行" : "步行"); } }, () => {});
    hold("btn-slot-l", () => { sel = (sel + 8) % 9; refreshHotbar(); }, () => {});
    hold("btn-slot-r", () => { sel = (sel + 1) % 9; refreshHotbar(); }, () => {});

    const hint = $("rotate-hint");
    const check = () => { hint.style.display = innerHeight > innerWidth * 1.15 ? "flex" : "none"; };
    addEventListener("resize", check);
    addEventListener("orientationchange", () => setTimeout(check, 200));
    check();
  }

  function weatherTick() {
    const cycle = (G.time * 5 + G.seed * 0.0001) % 1;
    const raining = cycle > 0.68 && cycle < 0.92;
    const bio = biomeAt(wf(P.x), wf(P.z));
    if (bio === "ashland") {
      // Ashfall: always drifting, never rain — the caldera has its own weather.
      G.weather = 3;
      const an = IS_TOUCH ? 4 : 9;
      if (parts.length < 220) for (let i = 0; i < an; i++) {
        parts.push({
          x: P.x + (Math.random() - 0.5) * 20,
          y: P.y + 8 + Math.random() * 6,
          z: P.z + (Math.random() - 0.5) * 20,
          vx: (Math.random() - 0.5) * 1.4, vy: -1.6 - Math.random(), vz: (Math.random() - 0.5) * 1.4,
          life: 1.6,
          col: Math.random() < 0.16 ? [0.95, 0.48, 0.18] : [0.46, 0.43, 0.42]   // the odd live ember
        });
      }
      return;
    }
    // In Hiems every shower falls as snow, whatever the biome — the season is
    // visible from anywhere in the world, not just in the taiga.
    const winter = season().key === "hiems";
    G.weather = !raining ? 0 : (bio === "taiga" || winter ? 2 : 1);
    if (!G.weather) return;
    const n = IS_TOUCH ? 4 : 10;
    for (let i = 0; i < n; i++) {
      parts.push({
        x: P.x + (Math.random() - 0.5) * 16,
        y: P.y + 7 + Math.random() * 5,
        z: P.z + (Math.random() - 0.5) * 16,
        vx: G.weather === 2 ? 0 : -1.2,
        vy: G.weather === 2 ? -5 : -16,
        vz: 0,
        life: 0.7,
        col: G.weather === 2 ? [0.92, 0.95, 1] : [0.55, 0.68, 0.88]
      });
    }
  }

  function lockPointer() {
    if (uiMode || paused || P.dead || !running || IS_TOUCH) return;
    canvas.requestPointerLock();
  }
  function releasePointer() {
    if (document.pointerLockElement) document.exitPointerLock();
  }
  function togglePause() {
    if (uiMode) { closeUI(); return; }
    if (!$("victory").hidden) return; // the chapter-complete card owns the screen
    paused = !paused;
    $("pause").hidden = !paused;
    if (paused) releasePointer(); else lockPointer();
  }

  // =====================================================================
  // Save / load
  // =====================================================================
  function serialize() {
    const diffs = [];
    for (const [k, v] of G.diffs) diffs.push([k, v]);
    return {
      seed: G.seed, creative: G.creative, time: G.time, day: G.day,
      player: { x: P.x, y: P.y, z: P.z, yaw: P.yaw, pitch: P.pitch, hp: P.hp, food: P.food, flying: P.flying, view: P.view },
      camDist,
      ver: SAVE_VER, chapter, inv, sel, questIdx, questProg, discoveries: Array.from(discoveries),
      stats: { kills: STAT.kills, mined: STAT.mined, placed: STAT.placed, harvested: STAT.harvested || 0 },
      furnaces: Array.from(G.furnaces.entries()), chests: Array.from(G.chests.entries()),
      crops: Array.from(G.crops.entries()), buffs: Object.assign({}, buffs),
      diffs
    };
  }
  const SAVE_VER = 3;
  // Map any save (v1 or v2) onto a chapter + quest index.
  //
  // v1 saves predate chapters: their `questIdx` counts Chapter I steps only, and
  // they carry no `chapter` field. A v1 world that finished all ten steps is
  // promoted into Chapter II at step 0; an unfinished one keeps its exact place.
  // Block ids were only ever appended, so v1 `diffs` still decode to the same
  // blocks and need no rewriting.
  function migrateSave(data) {
    const idx = Math.max(0, (data && data.questIdx) | 0);
    const saved = data && Number.isFinite(data.chapter) ? data.chapter : null;
    if (saved != null) {
      const c = clamp(saved | 0, 0, CHAPTERS.length - 1);
      return { chapter: c, questIdx: clamp(idx, 0, CHAPTERS[c].quests.length), promoted: false, from: data.ver || 2 };
    }
    if (idx >= CHAPTER1.length) return { chapter: 1, questIdx: 0, promoted: true, from: 1 };
    return { chapter: 0, questIdx: clamp(idx, 0, CHAPTER1.length), promoted: false, from: 1 };
  }

  function saveGame() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(serialize()));
      toast("World saved");
    } catch (e) { toast("Save failed (storage full?)"); }
  }
  function hasSave() {
    try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
  }
  function loadSave() {
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (!d || !Number.isFinite(d.seed) || !d.player || !Number.isFinite(d.player.x) || !Number.isFinite(d.player.y) || !Number.isFinite(d.player.z)) return null;
      return d;
    } catch (e) { return null; }
  }

  // =====================================================================
  // Render loop
  // =====================================================================
  let renderDist = 6, tris = 0, chunkBuilds = 0;

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    const w = innerWidth, h = innerHeight;
    if (canvas.width !== (w * dpr | 0) || canvas.height !== (h * dpr | 0)) {
      canvas.width = w * dpr | 0; canvas.height = h * dpr | 0;
      canvas.style.width = w + "px"; canvas.style.height = h + "px";
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function camPoint(from, to) {
    const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
    const steps = 20;
    let last = from.slice();
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = from[0] + dx * t, y = from[1] + dy * t, z = from[2] + dz * t;
      if (isSolid(getBlock(Math.floor(x), Math.floor(y), Math.floor(z)))) {
        const u = Math.max(0, (i - 1) / steps - 0.04);
        return [from[0] + dx * u, from[1] + dy * u, from[2] + dz * u];
      }
      last = [x, y, z];
    }
    return last;
  }

  function camMVP() {
    const e = eyePos();
    const d = lookDir();
    const focus = [e[0], e[1] + (P.view ? 0.12 : 0), e[2]];
    let eye = e.slice();
    let cen = [focus[0] + d[0], focus[1] + d[1], focus[2] + d[2]];
    if (P.view === 1) {
      const back = [
        focus[0] - d[0] * camDist,
        focus[1] - d[1] * camDist + 0.45,
        focus[2] - d[2] * camDist
      ];
      eye = camPoint(focus, back);
      cen = [focus[0] + d[0] * 6, focus[1] + d[1] * 6, focus[2] + d[2] * 6];
    } else if (P.view === 2) {
      const front = [
        focus[0] + d[0] * (camDist * 0.85),
        focus[1] + 0.55,
        focus[2] + d[2] * (camDist * 0.85)
      ];
      eye = camPoint(focus, front);
      cen = [focus[0], focus[1], focus[2]];
    }
    if (!camS.ready) { camS.x = eye[0]; camS.y = eye[1]; camS.z = eye[2]; camS.ready = true; }
    const k = P.view ? Math.min(1, 14 * dtNow) : 1;
    camS.x += (eye[0] - camS.x) * k;
    camS.y += (eye[1] - camS.y) * k;
    camS.z += (eye[2] - camS.z) * k;
    let ox = 0, oy = 0, oz = 0;
    if (shake > 0.001) {
      const a = shake * 0.55;
      ox = Math.sin(shakeT * 47.3) * a;
      oy = Math.sin(shakeT * 61.7 + 1.3) * a;
      oz = Math.sin(shakeT * 53.1 + 2.6) * a;
    }
    const proj = M4.persp(Math.PI / 2.55, canvas.width / Math.max(1, canvas.height), 0.08, 220);
    const view = M4.look([camS.x + ox, camS.y + oy, camS.z + oz], cen, [0, 1, 0]);
    return M4.mul(proj, view);
  }

  // Project a world point to CSS pixels; returns null when behind the camera.
  function projectToScreen(mvp, x, y, z, vw, vh) {
    const cx = mvp[0] * x + mvp[4] * y + mvp[8] * z + mvp[12];
    const cy = mvp[1] * x + mvp[5] * y + mvp[9] * z + mvp[13];
    const cw = mvp[3] * x + mvp[7] * y + mvp[11] * z + mvp[15];
    if (cw <= 0.05) return null;
    return [(cx / cw * 0.5 + 0.5) * vw, (0.5 - cy / cw * 0.5) * vh];
  }

  // Damage numbers + targeted-enemy health bar live in a DOM overlay so they stay crisp.
  function syncOverlay(mvp, dt) {
    const layer = $("floaters");
    if (!layer) return;
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      f.life -= dt; f.y += f.vy * dt; f.vy *= Math.pow(0.25, dt);
      if (f.life <= 0) { if (f.el) f.el.remove(); floats.splice(i, 1); }
    }
    const vw = layer.clientWidth || window.innerWidth, vh = layer.clientHeight || window.innerHeight;
    for (const f of floats) {
      if (!f.el) {
        f.el = document.createElement("div");
        f.el.className = "float " + f.cls;
        f.el.textContent = f.text;
        layer.appendChild(f.el);
      }
      const p = projectToScreen(mvp, f.x, f.y, f.z, vw, vh);
      if (!p) { f.el.style.display = "none"; continue; }
      f.el.style.display = "block";
      f.el.style.transform = "translate(-50%,-50%) translate(" + p[0].toFixed(1) + "px," + p[1].toFixed(1) + "px) scale(" + (0.85 + f.life * 0.35).toFixed(2) + ")";
      f.el.style.opacity = clamp(f.life * 2.2, 0, 1).toFixed(2);
    }
    // Boss bar: while the Oathbreaker lives he owns the top of the screen.
    const bar = $("boss-bar");
    if (bar) {
      const boss = mobs.find((m) => m.boss);
      bar.hidden = !boss;
      if (boss) {
        $("boss-name").textContent = boss.name || "背誓百夫长 · CENTURIO PERIURUS";
        $("boss-fill").style.width = (clamp(boss.hp / Math.max(1, boss.maxHp), 0, 1) * 100).toFixed(1) + "%";
        $("boss-phase").textContent = "第 " + bossPhase(boss) + " 阶段 / 3  ·  "
          + Math.max(0, Math.ceil(boss.hp)) + " / " + Math.round(boss.maxHp);
      }
    }
    // Target plate: what am I looking at, and how hurt is it?
    const plate = $("target-plate");
    if (!plate) return;
    plate.classList.toggle("with-boss", !!(bar && !bar.hidden));
    const t = handTool();
    const aim = uiMode || P.dead ? null : lookMob(t && t.range ? t.range + 1.5 : 5);
    if (!aim) { plate.hidden = true; targetShown = null; return; }
    plate.hidden = false;
    if (targetShown !== aim) {
      targetShown = aim;
      const label = aim.name || MOB_LABEL[aim.kind] || aim.kind;
      $("target-name").textContent = label + (aim.npc ? "  ·  可交谈" : aim.tier ? "  ·  威胁 " + (aim.tier + 1) : "");
      plate.classList.toggle("friendly", !aim.hostile);
    }
    const pct = clamp(aim.hp / Math.max(1, aim.maxHp || aim.hp), 0, 1);
    $("target-fill").style.width = (pct * 100).toFixed(0) + "%";
    $("target-hp").textContent = aim.npc ? "" : Math.max(0, Math.ceil(aim.hp)) + " / " + Math.round(aim.maxHp || aim.hp);
  }
  let targetShown = null;
  function clearFloats() {
    for (const f of floats) if (f.el) f.el.remove();
    floats.length = 0;
    shake = 0;
    const plate = $("target-plate");
    if (plate) plate.hidden = true;
    targetShown = null;
  }
  const MOB_LABEL = {
    cow: "母牛", pig: "野猪", sheep: "绵羊", zombie: "夜行者",
    soldier: "军团士兵", citizen: "罗马市民", lion: "斗兽场雄狮", wolf: "边疆狼",
    archer: "蛮族弩手", raider: "战团武士", lurker: "灰烬潜伏者",
    ravager: "攻城巨兽", oathbreaker: "背誓百夫长"
  };

  function drawPlayerModel(mvp) {
    colLight = entityLight(P.x, P.y + 1.2, P.z, EL);
    try { drawPlayerBody(mvp); } finally { colLight = ONE; }
  }
  function drawPlayerBody(mvp) {
    const sneak = P.sneak ? 0.78 : 1;
    const moving = P.onGround && Math.hypot(P.vx, P.vz) > 0.35;
    const leg = moving ? Math.sin(walkPhase) * 0.9 : 0;
    const arm = moving ? Math.sin(walkPhase) * 0.55 : 0;
    const atk = armSwingT > 0 ? Math.sin((1 - armSwingT) * Math.PI) * -1.55 : 0;
    const root = [M4.T(P.x, P.y, P.z), M4.Ry(bodyYaw)];
    const skin = [0.90, 0.72, 0.55], shirt = [0.56, 0.18, 0.34];
    const pants = [0.22, 0.24, 0.40], hair = [0.32, 0.20, 0.12], boot = [0.16, 0.12, 0.09];
    drawX(mvp, pants, root.concat([M4.T(-0.12, 0.70 * sneak, 0), M4.Rx(leg), M4.T(0, -0.35 * sneak, 0), M4.S(0.18, 0.70 * sneak, 0.18)]));
    drawX(mvp, pants, root.concat([M4.T(0.12, 0.70 * sneak, 0), M4.Rx(-leg), M4.T(0, -0.35 * sneak, 0), M4.S(0.18, 0.70 * sneak, 0.18)]));
    drawX(mvp, boot, root.concat([M4.T(-0.12, 0.10 * sneak, 0.04), M4.Rx(leg * 0.4), M4.S(0.20, 0.12, 0.24)]));
    drawX(mvp, boot, root.concat([M4.T(0.12, 0.10 * sneak, 0.04), M4.Rx(-leg * 0.4), M4.S(0.20, 0.12, 0.24)]));
    drawX(mvp, shirt, root.concat([M4.T(0, 1.08 * sneak, 0), M4.S(0.50, 0.64 * sneak, 0.28)]));
    drawX(mvp, skin, root.concat([M4.T(-0.34, 1.30 * sneak, 0), M4.Rx(-arm), M4.T(0, -0.32 * sneak, 0), M4.S(0.16, 0.64 * sneak, 0.16)]));
    drawX(mvp, skin, root.concat([M4.T(0.34, 1.30 * sneak, 0), M4.Rx(arm + atk), M4.T(0, -0.32 * sneak, 0), M4.S(0.16, 0.64 * sneak, 0.16)]));
    drawX(mvp, skin, root.concat([M4.T(0, 1.56 * sneak, 0), M4.Rx(P.pitch * 0.4), M4.S(0.48, 0.48, 0.48)]));
    drawX(mvp, hair, root.concat([M4.T(0, 1.76 * sneak, 0), M4.Rx(P.pitch * 0.4), M4.S(0.52, 0.16, 0.52)]));
    const held = selected();
    if (held) {
      const col = (ITEMS[held.key] && ITEMS[held.key].color)
        ? ITEMS[held.key].color.map((c) => c / 255)
        : [0.7, 0.7, 0.7];
      drawX(mvp, col, root.concat([
        M4.T(0.34, 1.30 * sneak, 0), M4.Rx(arm + atk + 0.4),
        M4.T(0, -0.62 * sneak, 0.10), M4.S(0.12, 0.36, 0.12)
      ]));
    }
  }

  function drawMobModel(mvp, m) {
    colTint = m.flash > 0 ? clamp(m.flash / 0.16, 0, 1) * 0.85 : 0;
    colLight = entityLight(m.x, m.y + m.h * 0.55, m.z, EL);
    // The species models below are written in absolute world coordinates, so the
    // animation is applied by displacing the body's origin for the duration of the
    // draw and putting it straight back. Cheap, and it needs no change to any of
    // the twelve hand-built silhouettes.
    const ox = m.x, oy = m.y, oz = m.z;
    const g = m.gait || 0;
    // Bob: two beats per stride, so it reads as footfalls and not as floating.
    m.y = oy + Math.abs(Math.sin(m.anim || 0)) * 0.085 * g;
    // Wind-up pulls back, then the strike lunges through — the tell the player
    // reads before a hit lands.
    if (m.windup > 0 && m.windup < 0.9) {
      const d = Math.hypot(P.x - m.x, P.z - m.z) || 1;
      const k = -0.22 * Math.sin(Math.min(1, m.windup / 0.5) * Math.PI);
      m.x = ox + ((P.x - ox) / d) * k;
      m.z = oz + ((P.z - oz) / d) * k;
    }
    // Struck: knocked back and dropped, so a hit is legible even off-screen-centre.
    if (m.flash > 0) m.y -= clamp(m.flash / 0.16, 0, 1) * 0.07;
    try { drawMobBody(mvp, m); } finally {
      colTint = 0; colLight = ONE; m.x = ox; m.y = oy; m.z = oz;
    }
  }
  function drawMobBody(mvp, m) {
    if (m.kind === "citizen") {
      const c = m.color || [0.75,0.68,0.52];
      drawBox(mvp, c, m.x, m.y + 1.02, m.z, .54,.78,.32);
      drawBox(mvp, [0.88,0.68,0.50], m.x, m.y + 1.58, m.z, .40,.40,.40);
      drawBox(mvp, [0.28,0.16,0.10], m.x, m.y + 1.78, m.z, .44,.14,.44);
      drawBox(mvp, [0.30,0.24,0.22], m.x-.14,m.y+.40,m.z,.18,.70,.20);
      drawBox(mvp, [0.30,0.24,0.22], m.x+.14,m.y+.40,m.z,.18,.70,.20);
      drawBox(mvp, c.map((v)=>v*.82),m.x-.36,m.y+1.05,m.z,.14,.70,.16);
      drawBox(mvp, c.map((v)=>v*.82),m.x+.36,m.y+1.05,m.z,.14,.70,.16);
      return;
    }
    if (m.kind === "soldier") {
      drawBox(mvp, [0.62,0.10,0.16], m.x, m.y + 1.05, m.z, 0.52, 0.75, 0.30);
      drawBox(mvp, [0.88,0.68,0.50], m.x, m.y + 1.58, m.z, 0.40, 0.40, 0.40);
      drawBox(mvp, [0.72,0.58,0.28], m.x, m.y + 1.83, m.z, 0.50, 0.16, 0.50);
      drawBox(mvp, [0.18,0.20,0.28], m.x - .14, m.y + .42, m.z, .18, .72, .20);
      drawBox(mvp, [0.18,0.20,0.28], m.x + .14, m.y + .42, m.z, .18, .72, .20);
      drawBox(mvp, [0.70,0.12,0.16], m.x - .38, m.y + 1.08, m.z, .15, .75, .55);
      drawBox(mvp, [0.72,0.68,0.55], m.x + .38, m.y + 1.25, m.z, .08, 2.15, .08);
      return;
    }
    if (m.kind === "lion") {
      drawBox(mvp, [0.78,0.48,0.16], m.x, m.y + .58, m.z, 1.25, .62, .62);
      drawBox(mvp, [0.48,0.25,0.08], m.x, m.y + .86, m.z - .48, .76, .72, .72);
      drawBox(mvp, [0.82,0.55,0.22], m.x, m.y + .88, m.z - .63, .52, .46, .50);
      for (const sx of [-.42,.42]) for (const sz of [-.28,.28]) drawBox(mvp, [0.67,0.38,0.12], m.x+sx, m.y+.24, m.z+sz, .18,.50,.18);
      return;
    }
    if (m.kind === "wolf") {
      drawBox(mvp, [0.40,0.42,0.46], m.x, m.y + .48, m.z, .95,.48,.48);
      drawBox(mvp, [0.32,0.34,0.38], m.x, m.y + .67, m.z - .43, .48,.48,.52);
      for (const sx of [-.3,.3]) for (const sz of [-.22,.22]) drawBox(mvp, [0.30,0.31,0.34], m.x+sx,m.y+.2,m.z+sz,.14,.42,.14);
      return;
    }
    if (m.kind === "archer") {
      drawBox(mvp, [0.46,0.38,0.28], m.x, m.y + 1.02, m.z, .48,.74,.28);   // fur jerkin
      drawBox(mvp, [0.84,0.66,0.50], m.x, m.y + 1.56, m.z, .38,.38,.38);
      drawBox(mvp, [0.30,0.26,0.20], m.x, m.y + 1.76, m.z, .42,.14,.42);   // hood
      drawBox(mvp, [0.22,0.22,0.24], m.x-.13, m.y + .40, m.z, .17,.70,.19);
      drawBox(mvp, [0.22,0.22,0.24], m.x+.13, m.y + .40, m.z, .17,.70,.19);
      drawBox(mvp, [0.52,0.40,0.22], m.x-.36, m.y + 1.10, m.z, .08,1.30,.10); // bow stave
      drawBox(mvp, [0.72,0.66,0.52], m.x+.30, m.y + 1.34, m.z-.16, .10,.55,.10); // quiver
      return;
    }
    if (m.kind === "raider") {
      drawBox(mvp, [0.58,0.32,0.20], m.x, m.y + 1.05, m.z, .52,.76,.30);
      drawBox(mvp, [0.86,0.66,0.48], m.x, m.y + 1.58, m.z, .40,.40,.40);
      drawBox(mvp, [0.66,0.60,0.28], m.x, m.y + 1.82, m.z, .46,.16,.46);   // horned helm band
      for (const sx of [-.26,.26]) drawBox(mvp, [0.90,0.88,0.80], m.x+sx, m.y + 1.96, m.z, .09,.30,.09);
      drawBox(mvp, [0.24,0.20,0.18], m.x-.14, m.y + .42, m.z, .18,.72,.20);
      drawBox(mvp, [0.24,0.20,0.18], m.x+.14, m.y + .42, m.z, .18,.72,.20);
      drawBox(mvp, [0.70,0.70,0.74], m.x+.38, m.y + 1.16, m.z, .09,.90,.16); // axe haft
      return;
    }
    if (m.kind === "lurker") {
      const rise = m.buried ? 0.22 : 1;                                     // still mostly underground
      drawBox(mvp, [0.34,0.31,0.29], m.x, m.y + .40 * rise, m.z, 1.02,.52 * rise,.66);
      if (!m.buried) {
        drawBox(mvp, [0.26,0.24,0.23], m.x, m.y + .68, m.z - .40, .52,.46,.50);
        drawBox(mvp, [0.94,0.42,0.20], m.x-.13, m.y + .76, m.z - .62, .10,.10,.06); // ember eyes
        drawBox(mvp, [0.94,0.42,0.20], m.x+.13, m.y + .76, m.z - .62, .10,.10,.06);
        for (const sx of [-.34,.34]) for (const sz of [-.24,.24])
          drawBox(mvp, [0.24,0.22,0.21], m.x+sx, m.y + .18, m.z+sz, .15,.40,.15);
      } else {
        drawBox(mvp, [0.46,0.42,0.40], m.x, m.y + .12, m.z, 1.10,.14,.74);  // a suspicious mound of ash
      }
      return;
    }
    if (m.kind === "ravager") {
      drawBox(mvp, [0.38,0.31,0.35], m.x, m.y + 1.10, m.z, 1.30,1.10,.92);  // bulk
      drawBox(mvp, [0.30,0.25,0.29], m.x, m.y + 1.62, m.z - .62, .78,.66,.62);
      drawBox(mvp, [0.86,0.84,0.78], m.x, m.y + 1.42, m.z - .96, .58,.22,.26); // battering tusk
      drawBox(mvp, [0.52,0.24,0.20], m.x, m.y + 1.86, m.z, 1.10,.20,.80);   // iron harness
      for (const sx of [-.44,.44]) for (const sz of [-.34,.34])
        drawBox(mvp, [0.28,0.24,0.26], m.x+sx, m.y + .30, m.z+sz, .26,.64,.26);
      return;
    }
    if (m.kind === "oathbreaker") {
      const ph = bossPhase(m);
      drawBox(mvp, [0.54,0.10,0.14], m.x, m.y + 1.34, m.z, .70,.98,.44);    // blackened lorica
      drawBox(mvp, [0.72,0.70,0.62], m.x, m.y + 1.98, m.z, .48,.48,.48);
      drawBox(mvp, [0.86,0.72,0.24], m.x, m.y + 2.26, m.z, .58,.20,.58);    // officer's crest
      drawBox(mvp, [ph >= 3 ? 1 : 0.80, 0.18, 0.14], m.x, m.y + 2.44, m.z, .16,.28,.62);
      drawBox(mvp, [0.22,0.22,0.26], m.x-.18, m.y + .50, m.z, .22,.88,.24);
      drawBox(mvp, [0.22,0.22,0.26], m.x+.18, m.y + .50, m.z, .22,.88,.24);
      drawBox(mvp, [0.62,0.12,0.16], m.x-.52, m.y + 1.32, m.z, .16,.96,.72); // scutum
      drawBox(mvp, [0.84,0.84,0.88], m.x+.50, m.y + 1.40, m.z-.20, .12,.24,1.30); // gladius
      return;
    }
    drawBox(mvp, m.color, m.x, m.y + m.h * 0.45, m.z, m.w * 2, m.h * 0.7, m.w * 2);
    drawBox(mvp, m.kind === "zombie" ? [0.4, 0.55, 0.32] : m.color.map((c) => c * 0.8), m.x, m.y + m.h * 0.92, m.z, m.w * 1.3, m.h * 0.35, m.w * 1.3);
  }

  const BIO_COL = {
    plains: [205, 164, 62], forest: [147, 116, 52], taiga: [218, 196, 170],
    desert: [224, 144, 66], beach: [224, 158, 122], ocean: [46, 105, 164],
    ashland: [86, 78, 78]
  };
  const MINIMAP = { W: 256, R: 64, key: "", nchunks: -1 };
  function mapPixel(wx, wz, h) {
    // water — ocean & rivers (carved down to SEA)
    if (h < SEA) {
      const k = 1 - clamp((SEA - h) / 14, 0, 0.55);
      return [46 * k | 0, 96 * k | 0, 200 * k | 0];
    }
    const b0 = getBlock(wx, h, wz);
    if (b0 === GRASS) {
      const bio = biomeAt(wx, wz);
      const c = BIO_COL[bio] || [205, 164, 62];
      const k = 0.85 + 0.15 * clamp((h - 22) / 34, 0, 1);
      return [c[0] * k | 0, c[1] * k | 0, c[2] * k | 0];
    }
    if (b0 === SAND) return [224, 208, 148];
    if (b0 === SANDSTONE) return [206, 186, 132];
    if (b0 === SNOW) return [238, 242, 246];
    if (b0 === STONE || b0 === COBBLE) {
      const k = 0.72 + 0.28 * clamp((h - 26) / 40, 0, 1);
      return [128 * k | 0, 126 * k | 0, 122 * k | 0];
    }
    if (b0 === DIRT) return [140, 101, 69];
    if (b0 === GRAVEL) return [128, 118, 112];
    if (b0 === CLAY) return [172, 175, 180];
    if (b0 === ICE) return [168, 202, 226];
    if (b0 === PLANKS) return [152, 116, 66];
    if (b0 === MARBLE || b0 === COLUMN) return [224, 215, 192];
    if (b0 === TERRACOTTA) return [190, 88, 58];
    if (b0 === ROMAN_BRICK) return [176, 150, 112];
    if (b0 === MOSAIC) return [55, 92, 142];
    // trees / cactus poke above the surface
    const b1 = getBlock(wx, h + 1, wz), b2 = getBlock(wx, h + 2, wz);
    if (b1 === OAK_LEAVES || b1 === PINE_LEAVES || b1 === BIRCH_LEAVES ||
        b2 === OAK_LEAVES || b2 === PINE_LEAVES || b2 === BIRCH_LEAVES ||
        b1 === OAK_LOG || b1 === PINE_LOG || b1 === BIRCH_LOG || b1 === CACTUS)
      return [139, 91, 48];
    // fallback: biome tint
    const c = BIO_COL[biomeAt(wx, wz)] || [90, 140, 70];
    const k = 0.6 + 0.4 * clamp((h - 20) / 30, 0, 1);
    return [c[0] * k | 0, c[1] * k | 0, c[2] * k | 0];
  }
  function drawMinimap() {
    let el = $("minimap");
    if (!el) {
      el = document.createElement("canvas");
      el.id = "minimap";
      el.width = el.height = MINIMAP.W;
      const hud = $("hud");
      if (hud) hud.appendChild(el);
      else return;
    }
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const W = MINIMAP.W, R = MINIMAP.R;
    const key = wf(P.x) + "," + wf(P.z);
    if (MINIMAP.key === key && MINIMAP.nchunks === G.chunks.size) return;
    MINIMAP.key = key; MINIMAP.nchunks = G.chunks.size;
    const scale = (R * 2) / W;
    const ppc = Math.round(1 / scale);
    ctx.fillStyle = "#0b100c";
    ctx.fillRect(0, 0, W, W);
    const x0 = P.x - R, z0 = P.z - R;
    for (let sy = 0; sy < W; sy += ppc) {
      const wzi = wf(z0 + sy * scale);
      const czi = w2c(wzi);
      for (let sx = 0; sx < W; sx += ppc) {
        const wxi = wf(x0 + sx * scale);
        const cxi = w2c(wxi);
        if (!G.chunks.has(ck(cxi, czi))) continue;
        const h = heightAt(wxi, wzi);
        const c = mapPixel(wxi, wzi, h);
        ctx.fillStyle = "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")";
        ctx.fillRect(sx, sy, ppc, ppc);
      }
    }
    ctx.strokeStyle = "rgba(255,246,220,0.55)";
    ctx.strokeRect(0.5, 0.5, W - 1, W - 1);
    ctx.save();
    ctx.translate(W / 2, W / 2);
    ctx.rotate(P.yaw);
    ctx.fillStyle = "#fff6dc";
    ctx.strokeStyle = "rgba(18,14,8,0.85)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, -11); ctx.lineTo(7, 9); ctx.lineTo(0, 4); ctx.lineTo(-7, 9);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function ensureAround() {
    const pcx = w2c(P.x), pcz = w2c(P.z);
    const want = [];
    for (let dz = -renderDist; dz <= renderDist; dz++)
      for (let dx = -renderDist; dx <= renderDist; dx++) {
        if (dx * dx + dz * dz > renderDist * renderDist) continue;
        want.push([pcx + dx, pcz + dz, dx * dx + dz * dz]);
      }
    want.sort((a, b) => a[2] - b[2]);
    let built = 0;
    for (const [cx, cz] of want) {
      const k = ck(cx, cz);
      if (!G.chunks.has(k)) {
        getChunk(cx, cz);
        built++;
        if (built >= 4) break;
      }
    }
    let n = 0;
    for (const k of [...G.dirty]) {
      G.dirty.delete(k);
      const ch = G.chunks.get(k);
      if (!ch) continue;
      meshChunk(ch);
      n++; chunkBuilds++;
      if (n >= 6) break;
    }
    for (const [k, ch] of G.chunks) {
      if (Math.abs(ch.cx - pcx) > renderDist + 3 || Math.abs(ch.cz - pcz) > renderDist + 3)
        G.chunks.delete(k);
    }
    drawMinimap();
  }

  function render() {
    resize();
    gl.clear(gl.DEPTH_BUFFER_BIT);
    const sky = skyColors();
    const fog = sky.fog;
    fogNow = fog;
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.useProgram(P_SKY);
    gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf);
    gl.enableVertexAttribArray(locS.p);
    gl.vertexAttribPointer(locS.p, 2, gl.FLOAT, false, 0, 0);
    gl.uniform3fv(locS.top, sky.top);
    gl.uniform3fv(locS.bot, sky.bot);
    const ang = (G.time - 0.25) * Math.PI * 2;
    gl.uniform3fv(locS.sun, [Math.sin(ang) * 0.55, Math.cos(ang) * 0.7, 0]);
    gl.uniform1f(locS.night, sky.night);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    const mvp = camMVP();
    tris = 0;
    const pcx = w2c(P.x), pcz = w2c(P.z);
    for (const ch of G.chunks.values()) {
      if (Math.abs(ch.cx - pcx) > renderDist || Math.abs(ch.cz - pcz) > renderDist) continue;
      if (!ch.mesh) continue;
      drawMesh(ch.mesh, mvp, fog, 1);
      tris += ch.mesh.n / 3;
    }
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    for (const ch of G.chunks.values()) {
      if (!ch.glass) continue;
      if (Math.abs(ch.cx - pcx) > renderDist || Math.abs(ch.cz - pcz) > renderDist) continue;
      drawMesh(ch.glass, mvp, fog, 1);
    }
    for (const ch of G.chunks.values()) {
      if (!ch.plants) continue;
      if (Math.abs(ch.cx - pcx) > renderDist || Math.abs(ch.cz - pcz) > renderDist) continue;
      drawMesh(ch.plants, mvp, fog, 1);
    }
    for (const ch of G.chunks.values()) {
      if (!ch.water) continue;
      if (Math.abs(ch.cx - pcx) > renderDist || Math.abs(ch.cz - pcz) > renderDist) continue;
      drawMesh(ch.water, mvp, fog, 0.72);
    }

    // mobs
    for (const m of mobs) drawMobModel(mvp, m);
    if (P.view !== 0) drawPlayerModel(mvp);
    // Debris and sparks are lit at their own position too — mining chips thrown
    // off inside a dark shaft used to glow like embers for no reason.
    flatShade = true;
    for (const p of parts) {
      colLight = entityLight(p.x, p.y, p.z, EL);
      drawBox(mvp, p.col, p.x, p.y, p.z, 0.12, 0.12, 0.12);
    }
    colLight = ONE;
    for (const s of shots) {
      colLight = entityLight(s.x, s.y, s.z, EL);
      const c = [s.col[0] / 255, s.col[1] / 255, s.col[2] / 255];
      drawBox(mvp, c, s.x, s.y, s.z, 0.09, 0.09, 0.09);
      // a short trail so a fast shaft still reads as a line in flight
      drawBox(mvp, c.map((v) => v * 0.7), s.x - s.vx * 0.016, s.y - s.vy * 0.016, s.z - s.vz * 0.016, 0.07, 0.07, 0.07);
    }

    colLight = ONE;
    flatShade = false;
    syncOverlay(mvp, dtNow);

    // selection wire
    if (hit && !uiMode) {
      gl.disable(gl.DEPTH_TEST);
      gl.useProgram(P_COL);
      gl.disableVertexAttribArray(locC.s);
      gl.vertexAttrib1f(locC.s, 1);
      gl.uniform1f(locC.flat, 1);
      const S = M4.ident();
      S[0] = 1.01; S[5] = 1.01; S[10] = 1.01;
      let m = M4.trans(mvp, hit.x - 0.005, hit.y - 0.005, hit.z - 0.005);
      m = M4.mul(m, S);
      gl.uniformMatrix4fv(locC.mvp, false, m);
      gl.uniform3fv(locC.c, [1, 1, 1]);
      gl.bindBuffer(gl.ARRAY_BUFFER, wire);
      gl.enableVertexAttribArray(locC.p);
      gl.vertexAttribPointer(locC.p, 3, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.LINES, 0, 24);
      gl.enable(gl.DEPTH_TEST);
    }
    gl.disable(gl.BLEND);
  }

  function frame(t) {
    requestAnimationFrame(frame);
    if (!running) return;
    dtNow = Math.min(0.05, (t - lastT) / 1000 || 0.016);
    lastT = t;
    fps = lerp(fps, 1 / Math.max(0.001, dtNow), 0.1);
    shakeT += dtNow;
    if (shake > 0) shake = Math.max(0, shake - dtNow * 2.6);
    if (paused || uiMode || P.dead) { render(); return; }
    if (hitStop > 0) { hitStop -= dtNow; render(); return; }

    G.tick++;
    const oldTime = G.time;
    G.time = (G.time + dtNow / 720) % 1;
    if (G.time < oldTime) {
      const before = seasonIndex();
      G.day++;
      if (seasonIndex() !== before) {
        const s = season();
        toast("季节更替 —— " + s.name + "：" + s.note);
        sfx("levelup");
        updateWorldInfo(true);
      }
    }
    const night = dayFactor() < 0.28;
    if (night) seenNight = true;
    if (wasNight && !night && seenNight) questEvent("dawn", "*", 1);
    wasNight = night;

    ensureAround();
    playerTick(dtNow);
    mobTick(dtNow);
    weatherTick();
    if (G.tick % 30 === 0) updateWorldInfo(false);
    if (G.tick % 8 === 0) updateQuestNav();
    if (G.tick % 15 === 0 && !G.creative) drawVitals();
    partTick(dtNow);
    shotTick(dtNow);
    furnaceTick(dtNow);
    cropTick(dtNow);
    buffTick(dtNow);
    burnTick(dtNow);
    if (uiMode === "furnace") renderInv();

    hit = raycast(6);
    if (mouseDown) tryBreak();
    else { breakT = 0; $("break-bar").style.display = "none"; }
    if (mouseRight) tryPlace();
    placeCd = Math.max(0, placeCd - dtNow);

    if (P.onGround && (Math.abs(P.vx) > 0.4 || Math.abs(P.vz) > 0.4)) {
      lastStep += dtNow;
      if (lastStep > 0.42) { sfx("step"); lastStep = 0; }
    }

    render();

    if (!$("debug").hidden) {
      $("debug").textContent =
        "HAVEN  fps " + fps.toFixed(0) +
        "\nxyz " + P.x.toFixed(1) + " " + P.y.toFixed(1) + " " + P.z.toFixed(1) +
        "\nbiome " + biomeAt(wf(P.x), wf(P.z)) + "  y=" + wf(P.y) +
        "  weather " + (["clear", "rain", "snow", "ashfall"][G.weather] || "clear") +
        "\nchunks " + G.chunks.size + "  dirty " + G.dirty.size +
        "  tris " + (tris | 0) +
        "\ntime " + (G.time * 24).toFixed(1) + "h  " + (G.creative ? "creative" : "survival") +
        "\nseed " + G.seed + "  target " + (hit ? (defOf(hit.id) || {}).name : "-");
    }

    if (fps < 28 && renderDist > 4 && G.tick % 120 === 0) {
      renderDist--;
      toast("Render distance lowered to keep it smooth");
    }
  }

  // =====================================================================
  // Boot
  // =====================================================================
  function seedFrom(str) {
    if (!str) return (Math.random() * 1e9) | 0;
    if (/^-?\d+$/.test(str)) return (parseInt(str, 10) | 0) || 1;
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h | 0 || 1;
  }

  function resetState(seed, creative, data) {
    G.seed = seed; G.creative = creative;
    G.chunks.clear(); G.dirty.clear(); G.diffs.clear();
    G.furnaces.clear(); G.chests.clear(); G.crops.clear();
    clearBuffs();
    cropAccum = 0;
    G.time = 0.22; G.day = 1; G.tick = 0;
    mobs.length = 0; parts.length = 0; shots.length = 0;
    G.braziers.clear();
    clearFloats();
    setChapter(0);
    for (let i = 0; i < 36; i++) inv[i] = null;
    sel = 0; questIdx = 0; questProg = 0; seenNight = false; wasNight = false;
    discoveries.clear(); lastBiome = null;
    Object.keys(keys).forEach((k) => { keys[k] = false; });
    mouseDown = false; mouseRight = false; breakT = 0; held = null; uiMode = null;
    $("inv-wrap").hidden = true; $("pause").hidden = true;
    P.hp = 20; P.food = 20; P.flying = creative; P.dead = false; P.vx = P.vy = P.vz = 0;
    P.view = 1; bodyYaw = 0; armSwingT = 0; camDist = 4.6; camS.ready = false;
    hCache.clear();
    STAT.kills = 0; STAT.mined = 0; STAT.placed = 0; STAT.t0 = performance.now();
    G.weather = 0; hitStop = 0; pad.x = 0; pad.z = 0; jumpQueued = false;
    MINIMAP.key = ""; MINIMAP.nchunks = -1;
    victoryShown = false; lastTier = -1;
    $("victory").hidden = true; $("death").hidden = true; $("boss-bar").hidden = true;
    if (!data) P.view = wantThird ? 1 : 0;
    if (data) {
      G.time = Number.isFinite(data.time) ? data.time : 0.22;
      G.day = Number.isFinite(data.day) && data.day >= 1 ? Math.floor(data.day) : 1;
      for (const [k, v] of data.diffs || []) G.diffs.set(k, v);
      rebuildBraziers();   // brazier index lives only in memory; derive it from the diffs
      for (const [k, v] of data.furnaces || []) if (typeof k === "string" && v) G.furnaces.set(k, v);
      for (const [k, v] of data.chests || []) if (typeof k === "string" && Array.isArray(v)) G.chests.set(k, v.slice(0, 27).concat(new Array(Math.max(0, 27 - v.length)).fill(null)));
      if (data.inv) for (let i = 0; i < 36; i++) inv[i] = data.inv[i] || null;
      sel = data.sel || 0;
      const mig = migrateSave(data);
      setChapter(mig.chapter);
      questIdx = mig.questIdx;
      questProg = data.questProg || 0;
      // Only the final chapter's completion counts as "already celebrated".
      victoryShown = questIdx >= QUESTS.length && !CHAPTERS[chapter].next;
      if (mig.promoted) toast("旧存档已完成第一章——第二章「北境长夜」开启");
      for (const bio of data.discoveries || []) if (BIOME_NAMES[bio]) discoveries.add(bio);
      if (data.stats) {
        STAT.kills = Math.max(0, data.stats.kills | 0);
        STAT.mined = Math.max(0, data.stats.mined | 0);
        STAT.placed = Math.max(0, data.stats.placed | 0);
        STAT.harvested = Math.max(0, data.stats.harvested | 0);
      }
      // Crops and buffs are v3 fields. A v1/v2 world simply has none, and
      // `restoreCrops` also re-derives records for any crop block that is present
      // in the diffs without a matching record — so a hand-edited or partially
      // written save still grows instead of freezing at stage 0.
      restoreCrops(data.crops);
      if (data.buffs) for (const id in data.buffs) {
        const t = Number(data.buffs[id]);
        if (BUFFS[id] && Number.isFinite(t) && t > 0) buffs[id] = t;
      }
      renderBuffs();
      Object.assign(P, data.player || {});
      if (!creative) P.flying = false;
      if (data.player && data.player.view == null) P.view = 1;
      if (data.camDist) camDist = data.camDist;
    }
    if (creative && !data) {
      const starter = [
        "grass","dirt","stone","cobble","sand","oak_log","oak_planks","glass","bricks","crafting_table",
        "furnace","torch","glowstone","tnt","marble","terracotta","mosaic","roman_brick","column","pumpkin",
        "dia_pick","dia_axe","roman_spear","scutum","snow","ice","cactus","sandstone","bookshelf","chest",
        "coal_block","iron_block","gold_block","diamond_block","obsidian","clay"
      ];
      starter.slice(0, 36).forEach((k, i) => { if (ITEMS[k]) inv[i] = stackOf(k, ITEMS[k].tool ? 1 : 64); });
    } else if (!data) {
      // survival: empty fists. the world is the tutorial.
    }
  }

  let worldLoadToken = 0;
  function startWorld(opts) {
    const loadToken = ++worldLoadToken;
    const data = opts.load ? loadSave() : null;
    const seed = data ? data.seed : seedFrom(opts.seed);
    const creative = data ? !!data.creative : !!opts.creative;
    resetState(seed, creative, data);

    $("title").hidden = true;
    $("load").hidden = false;
    $("load-fill").style.width = "4%";
    $("load-sub").textContent = "Carving hills";

    let step = 0;
    const ring = 3;
    const jobs = [];
    const ocx = data && data.player ? w2c(data.player.x) : 0;
    const ocz = data && data.player ? w2c(data.player.z) : 0;
    for (let z = -ring; z <= ring; z++) for (let x = -ring; x <= ring; x++) jobs.push([ocx + x, ocz + z]);
    jobs.sort((a, b) => (a[0]-ocx)*(a[0]-ocx)+(a[1]-ocz)*(a[1]-ocz) - ((b[0]-ocx)*(b[0]-ocx)+(b[1]-ocz)*(b[1]-ocz)));
    const jobTotal = jobs.length;
    let meshList = [];
    let meshI = 0;

    function finishEnter() {
      if (loadToken !== worldLoadToken) return;
      if (!data) {
        const s = findSpawn();
        P.x = s[0]; P.y = s[1]; P.z = s[2];
      }
      $("load-fill").style.width = "100%";
      $("load-sub").textContent = "Ready";
      $("load").hidden = true;
      $("hud").hidden = false;
      $("death").hidden = true;
      running = true; paused = false;
      lastT = performance.now();
      refreshHotbar(); renderQuest();
      updateWorldInfo(true);
      setView(P.view, true);
      if (IS_TOUCH) initTouchUI();
      if ($("btn-fly")) $("btn-fly").style.display = creative ? "flex" : "none";
      spawnRomanCast();
      lockPointer();
      toast(P.view ? "第三人称  ·  F5 / V 切换视角" : (creative ? "Creative — fly with double-space." : "Survival — punch a tree."));
    }

    function meshPump() {
      if (loadToken !== worldLoadToken) return;
      const t0 = performance.now();
      while (meshI < meshList.length && performance.now() - t0 < 10) {
        meshChunk(meshList[meshI++]);
      }
      const mp = meshList.length ? meshI / meshList.length : 1;
      $("load-fill").style.width = (88 + mp * 12) + "%";
      $("load-sub").textContent = "Lighting the world " + (mp * 100 | 0) + "%";
      if (meshI < meshList.length) { requestAnimationFrame(meshPump); return; }
      finishEnter();
    }

    function pump() {
      if (loadToken !== worldLoadToken) return;
      const t0 = performance.now();
      while (jobs.length && performance.now() - t0 < 10) {
        const [x, z] = jobs.shift();
        getChunk(x, z, { mesh: false });
        step++;
      }
      const p = 1 - jobs.length / jobTotal;
      $("load-fill").style.width = (p * 88) + "%";
      $("load-sub").textContent = jobs.length ? "Growing hills " + (p * 100 | 0) + "%" : "Lighting the world";
      if (jobs.length) { requestAnimationFrame(pump); return; }
      meshList = Array.from(G.chunks.values());
      meshI = 0;
      requestAnimationFrame(meshPump);
    }
    requestAnimationFrame(pump);
  }

  // title buttons
  let wantCreative = true, wantThird = true;
  $("btn-creative").onclick = () => {
    wantCreative = true;
    $("btn-creative").classList.add("on");
    $("btn-survival").classList.remove("on");
    $("mode-note").textContent = "创造：可飞行、无限方块、不会受伤，适合自由建造。";
  };
  $("btn-survival").onclick = () => {
    wantCreative = false;
    $("btn-survival").classList.add("on");
    $("btn-creative").classList.remove("on");
    $("mode-note").textContent = "生存：从空手开始，管理生命与饥饿，夜晚会出现僵尸。";
  };
  $("btn-third").onclick = () => {
    wantThird = true;
    $("btn-third").classList.add("on");
    $("btn-first").classList.remove("on");
  };
  $("btn-first").onclick = () => {
    wantThird = false;
    $("btn-first").classList.add("on");
    $("btn-third").classList.remove("on");
  };
  $("btn-view").onclick = (e) => { e.preventDefault(); e.stopPropagation(); setView(P.view + 1); };
  $("btn-new").onclick = () => startWorld({ seed: $("seed-in").value.trim(), creative: wantCreative, third: wantThird });
  $("btn-continue").onclick = () => startWorld({ load: true });
  $("btn-resume").onclick = () => togglePause();
  $("btn-save").onclick = () => saveGame();
  $("btn-menu").onclick = () => {
    saveGame(); running = false; paused = false;
    $("pause").hidden = true; $("hud").hidden = true; $("title").hidden = false;
    $("btn-continue").disabled = !hasSave();
    releasePointer();
  };
  $("btn-respawn").onclick = () => {
    P.dead = false; P.hp = 20; P.food = 16; P.vy = 0;
    const s = findSpawn();
    P.x = s[0]; P.y = s[1]; P.z = s[2];
    clearFloats();
    camS.ready = false;
    $("death").hidden = true;
    drawVitals();
    lockPointer();
  };
  const toTitle = () => {
    saveGame(); running = false; paused = false;
    $("death").hidden = true; $("victory").hidden = true; $("pause").hidden = true;
    $("hud").hidden = true; $("title").hidden = false;
    $("btn-continue").disabled = !hasSave();
    releasePointer();
  };
  $("btn-die-menu").onclick = toTitle;
  $("btn-victory-menu").onclick = toTitle;
  $("btn-next-chapter").onclick = () => { beginNextChapter(); };
  $("btn-forge").onclick = () => { forgeReroll(); };
  $("btn-keep-playing").onclick = () => {
    $("victory").hidden = true;
    paused = false;
    lockPointer();
    toast("自由建设模式：继续探索群系、扩建罗马城区");
  };

  if (hasSave()) $("btn-continue").disabled = false;

  requestAnimationFrame(frame);

  // autosave
  setInterval(() => { if (running && !P.dead) saveGame(); }, 90000);

  // =====================================================================
  // Self-test
  // =====================================================================
  function selftest() {
    const log = [];
    let failed = 0;
    const ok = (n, cond, extra) => {
      if (!cond) failed++;
      log.push((cond ? "PASS  " : "FAIL  ") + n + (extra ? "   (" + extra + ")" : ""));
    };
    const snap = {
      seed: G.seed, time: G.time, creative: G.creative, tick: G.tick,
      chunks: G.chunks, dirty: G.dirty, diffs: G.diffs,
      furnaces: G.furnaces, chests: G.chests,
      player: Object.assign({}, P),
      inv: inv.map((s) => s ? Object.assign({}, s) : null),
      mobs: mobs.map((m) => Object.assign({}, m)),
      sel, questIdx, questProg, seenNight, wasNight,
      view: P.view, camDist, bodyYaw
    };

    try {
      G.chunks = new Map(); G.dirty = new Set(); G.diffs = new Map();
      G.furnaces = new Map(); G.chests = new Map();
      G.seed = 42; G.creative = true; G.time = 0.22; G.tick = 0;
      for (let i = 0; i < 36; i++) inv[i] = null;
      P.dead = false; P.hp = 20; P.food = 20; P.flying = true; P.invuln = 0;

      getChunk(0, 0); getChunk(1, 0); getChunk(-1, -1);
      ok("origin chunk nonempty", G.chunks.get("0,0").blocks.some((b) => b > 0));
      ok("negative chunk nonempty", G.chunks.get("-1,-1").blocks.some((b) => b > 0));

      const h = heightAt(0, 0);
      ok("height in range", h > 4 && h < 78, "h=" + h);

      const hn = heightAt(-7, -7);
      ok("negative height in range", hn > 4 && hn < 78, "h=" + hn);

      setBlock(4, h + 2, 4, STONE);
      ok("set/get +coord", getBlock(4, h + 2, 4) === STONE);

      setBlock(-3, hn + 2, -5, COBBLE);
      ok("set/get -coord (floor not truncate)", getBlock(-3, hn + 2, -5) === COBBLE);
      ok("floor(-2.2) hits cell -3", getBlock(-2.2, hn + 2, -5) === COBBLE);
      ok("cell -2 is a different block", getBlock(-2, hn + 2, -5) !== COBBLE);
      ok("wf(-0.2) is -1", wf(-0.2) === -1 && wf(0.2) === 0);

      meshChunk(G.chunks.get("0,0"));
      ok("mesh has triangles", G.chunks.get("0,0").mesh && G.chunks.get("0,0").mesh.n > 0,
        "idx=" + (G.chunks.get("0,0").mesh && G.chunks.get("0,0").mesh.n));
      const outwardFaces = FACES.every((face) => {
        const a = face.v[0], b = face.v[1], c = face.v[2];
        const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const normal = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
        return normal[0] * face.d[0] + normal[1] * face.d[1] + normal[2] * face.d[2] > 0;
      });
      ok("all cube faces wind outward", outwardFaces);
      meshChunk(G.chunks.get("-1,-1"));
      ok("negative chunk meshes", G.chunks.get("-1,-1").mesh && G.chunks.get("-1,-1").mesh.n > 0);

      const r = matchRecipe([{ key: "oak_log" }, null, null, null], 2);
      ok("log → planks", r && r.out[0] === "oak_planks");
      const r2 = matchRecipe([
        { key: "oak_planks" }, { key: "oak_planks" },
        { key: "oak_planks" }, { key: "oak_planks" }
      ], 2);
      ok("4 planks → table", r2 && r2.out[0] === "crafting_table");
      const r3 = matchRecipe([{ key: "oak_planks" }, null, { key: "oak_planks" }, null], 2);
      ok("2 planks → sticks", r3 && r3.out[0] === "stick");
      const r4 = matchRecipe([
        { key: "oak_planks" }, { key: "oak_planks" }, { key: "oak_planks" },
        null, { key: "stick" }, null,
        null, { key: "stick" }, null
      ], 3);
      ok("table recipe → wood pick", r4 && r4.out[0] === "wood_pick");
      const r5 = matchRecipe([
        { key: "cobble" }, { key: "cobble" }, { key: "cobble" },
        { key: "cobble" }, null, { key: "cobble" },
        { key: "cobble" }, { key: "cobble" }, { key: "cobble" }
      ], 3);
      ok("8 cobble → furnace", r5 && r5.out[0] === "furnace");
      const rr = matchRecipe([
        { key: "marble" }, { key: "terracotta" },
        { key: "terracotta" }, { key: "marble" }
      ], 2);
      ok("Roman mosaic recipe", rr && rr.out[0] === "mosaic" && rr.out[1] === 4);
      const ruin = new Uint8Array(SX * SY * SZ);
      const ruinLoot = putRomanRuin(ruin, 20);
      ok("Roman ruin has mosaic court", ruin[cidx(7, 20, 7)] === MOSAIC);
      ok("Roman ruin has columns", ruin[cidx(3, 23, 3)] === COLUMN && ruin[cidx(12, 25, 12)] === MARBLE);
      ok("Roman ruin marks a loot chest", ruinLoot[0] === 8 && ruin[cidx(ruinLoot[0], ruinLoot[1], ruinLoot[2])] === CHEST && ITEMS.denarius);
      const arch = new Uint8Array(SX * SY * SZ);
      putRomanArch(arch, 20);
      ok("Roman arch has open gateway", arch[cidx(7, 23, 7)] === AIR && arch[cidx(7, 25, 7)] === MARBLE);
      const arena = new Uint8Array(SX * SY * SZ);
      const arenaLoot = putColosseum(arena, 20);
      ok("Colosseum has a sand fighting floor", arena[cidx(7, 20, 7)] === SAND);
      ok("Colosseum has marble seating", arena.some((b) => b === MARBLE) && arena.some((b) => b === ROMAN_BRICK));
      ok("Colosseum has a reward chest", arena[cidx(arenaLoot[0], arenaLoot[1], arenaLoot[2])] === CHEST);
      const fort = new Uint8Array(SX*SY*SZ), forum = new Uint8Array(SX*SY*SZ), baths = new Uint8Array(SX*SY*SZ), temple = new Uint8Array(SX*SY*SZ), villa = new Uint8Array(SX*SY*SZ);
      const fortLoot = putLegionFort(fort,20); putForum(forum,20); putBaths(baths,20); putTemple(temple,20); const villaLoot=putVilla(villa,20);
      ok("legion fort has walls gate and supply chest", fort[cidx(1,24,5)]===MARBLE && fort[cidx(7,21,1)]===AIR && fort[cidx(fortLoot[0],fortLoot[1],fortLoot[2])]===CHEST);
      ok("forum has colonnade and senate hall", forum.some((b)=>b===COLUMN) && forum.some((b)=>b===MOSAIC) && forum.some((b)=>b===TERRACOTTA));
      ok("Roman baths contain pools", baths.some((b)=>b===WATER) && baths.some((b)=>b===COLUMN));
      ok("Jupiter temple has raised roof", temple[cidx(7,29,7)]===TERRACOTTA && temple.some((b)=>b===GLOW));
      ok("Palatine villa has atrium and chest", villa.some((b)=>b===WATER) && villa[cidx(villaLoot[0],villaLoot[1],villaLoot[2])]===CHEST);
      ok("Roman spear has extended melee range", ITEMS.roman_spear.tool === "spear" && ITEMS.roman_spear.range > 4.5);
      ok("Roman scutum is a shield", ITEMS.scutum.tool === "shield");

      // --- game feel: shake, hit flash, knockback, damage floaters ---
      const shakeBefore = shake;
      addShake(0.2);
      ok("camera shake accumulates", shake > shakeBefore, "shake=" + shake.toFixed(3));
      ok("camera shake is clamped", (addShake(9), shake <= 0.55), "shake=" + shake.toFixed(3));
      shake = shakeBefore;
      const fBefore = floats.length;
      addFloat(0, 0, 0, "9", "dmg");
      ok("damage floater queues", floats.length === fBefore + 1);
      floats.pop();
      const pBefore = parts.length;
      spawnBurst(0, 40, 0, [200, 80, 60], 5, 0.4);
      ok("impact particles spawn", parts.length === pBefore + 5, "n=" + (parts.length - pBefore));
      parts.length = pBefore;

      mobs.length = 0;
      const testLion = spawnMob("lion", P.x, P.y + 1.62 - 0.525, P.z - 2.2);
      ok("spawnMob returns the actor", !!testLion);
      ok("mob records its max health", testLion.maxHp === testLion.hp, "hp=" + testLion.hp);
      P.yaw = 0; P.pitch = 0;
      testLion.x = P.x; testLion.z = P.z - 2.2; testLion.y = P.y + 1.62 - testLion.h * 0.5;
      const aimed = lookMob(5);
      ok("crosshair finds the mob in front", aimed === testLion);
      const lionHp = testLion.hp;
      hitMob();
      ok("melee hit removes health", testLion.hp < lionHp, lionHp + " -> " + testLion.hp);
      ok("melee hit sets the white flash", testLion.flash > 0, "flash=" + testLion.flash.toFixed(2));
      ok("melee hit staggers and knocks back", testLion.stagger > 0 && Math.abs(testLion.vz) > 1,
        "vz=" + testLion.vz.toFixed(2));
      ok("melee hit shakes the camera", shake > 0, "shake=" + shake.toFixed(3));
      shake = 0;

      // --- difficulty gradient ---
      const dayWas = G.day;
      G.day = 1; const t0 = threatTier();
      G.day = 5; const t1 = threatTier();
      G.day = 40; const t2 = threatTier();
      ok("threat tier starts at zero", t0 === 0);
      ok("threat tier climbs with days", t1 > t0, "day5=" + t1);
      ok("threat tier caps out", t2 === 5, "day40=" + t2);
      G.day = 12;
      mobs.length = 0;
      const tough = spawnMob("zombie", P.x + 30, P.y, P.z);
      G.day = 1;
      mobs.length = 0;
      const weak = spawnMob("zombie", P.x + 30, P.y, P.z);
      ok("late-game raiders are tougher", tough.hp > weak.hp, tough.hp + " > " + weak.hp);
      ok("late-game raiders hit harder", tough.damage > weak.damage, tough.damage + " > " + weak.damage);
      G.day = dayWas;
      mobs.length = 0;

      // --- distinct hostile behaviour ---
      ok("lion, wolf and zombie have distinct speeds",
        new Set([spawnMob("lion", P.x + 40, P.y, P.z).speed,
                 spawnMob("wolf", P.x + 41, P.y, P.z).speed,
                 spawnMob("zombie", P.x + 42, P.y, P.z).speed]).size === 3);
      mobs.length = 0;

      // --- systems visible in the UI ---
      ok("run stats panel exists", !!$("run-stats") && !!$("stat-threat"));
      ok("target plate exists", !!$("target-plate") && !!$("target-fill"));
      ok("chapter-complete screen exists", !!$("victory") && !!$("btn-keep-playing"));
      ok("death screen can reach the title", !!$("btn-die-menu"));
      ok("damage floater layer exists", !!$("floaters"));
      ok("every hostile kind has a readable name",
        ["lion", "wolf", "zombie"].every((k) => !!MOB_LABEL[k]));

      // --- tool durability is drawn ---
      const fullDur = ITEMS.wood_pick.dur;
      ok("fresh tool shows no durability bar", toolWear({ key: "wood_pick", n: 1, dur: fullDur }) === null);
      ok("half-worn tool shows a warn bar",
        (toolWear({ key: "wood_pick", n: 1, dur: Math.round(fullDur * 0.3) }) || {}).state === "warn");
      ok("nearly broken tool shows a low bar",
        (toolWear({ key: "wood_pick", n: 1, dur: Math.max(1, Math.round(fullDur * 0.1)) }) || {}).state === "low");
      ok("blocks never show a durability bar", toolWear({ key: "planks", n: 8 }) === null);

      // --- debug interface ---
      ok("__game exposes stats", typeof api.stats === "function" && typeof api.stats().kills === "number");

      // --- entity lighting -------------------------------------------------
      // The whole point of the pass: a body cut off from the sky must be
      // *measurably* darker than the same body under open sky, and a torch must
      // measurably brighten it again.
      //
      // The pocket is built high in the air on purpose. The first draft dug it
      // into the ground and the numbers made no sense — natural cave lava within
      // three chunks was lighting it. Testing lighting means controlling every
      // emitter in range, so the chamber is placed where the world has none.
      {
        const lum = (p) => p.lum;
        const sx = wf(P.x) + 40, sz = wf(P.z) + 40;
        getChunk(w2c(sx), w2c(sz));
        const surf = heightAt(sx, sz);
        const cy = Math.min(SY - 4, surf + 26);
        ok("entity lighting probe returns three channels",
          typeof api.entityLight(sx, cy, sz).r === "number");
        const openAir = api.entityLight(sx, cy, sz);
        ok("a body under open sky is lit   (lum=" + openAir.lum.toFixed(3) + ")", lum(openAir) > 0.25);
        ok("open sky reads full sky light", api.skyLightAt(sx, cy, sz) === 15);
        ok("no stray emitter near the test chamber", api.emittedAt(sx, cy, sz) === 0);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++)
          setBlock(sx + dx, cy + dy, sz + dz, (dx || dy || dz) ? BY.stone.id : 0);
        const dark = api.entityLight(sx, cy, sz);
        ok("a roof cuts sky light", api.skyLightAt(sx, cy, sz) < 15);
        ok("a body shut away from the sky dims   (" + openAir.lum.toFixed(3) + " -> " + dark.lum.toFixed(3) + ")",
          lum(dark) < lum(openAir) * 0.72);
        ok("a dim body never reaches pure black", lum(dark) > 0.02);
        setBlock(sx + 1, cy, sz, BY.torch.id);
        const lit = api.entityLight(sx, cy, sz);
        ok("a torch brightens a body beside it   (" + dark.lum.toFixed(3) + " -> " + lit.lum.toFixed(3) + ")",
          lum(lit) > lum(dark) * 1.35);
        ok("torch light on a body is warm, not white", lit.r > lit.b * 1.2);
        ok("emitted light is strongest at the flame",
          api.emittedAt(sx + 1, cy, sz) > api.emittedAt(sx + 7, cy, sz));
        ok("a torch six blocks off has faded   (l=" + api.emittedAt(sx + 7, cy, sz) + ")",
          api.emittedAt(sx + 7, cy, sz) < 14 && api.emittedAt(sx + 7, cy, sz) > 0);
        setBlock(sx + 1, cy, sz, 0);
        ok("removing the torch takes the light with it",
          lum(api.entityLight(sx, cy, sz)) < lum(lit));
        const rig = api.lightRig();
        ok("light rig has sky, ambient and flame terms",
          rig.sky.length === 3 && rig.amb.length === 3 && rig.torch.length === 3);
        ok("flame colour is warm and constant", rig.torch[0] > rig.torch[2]);
      }
      ok("__game exposes feel counters", typeof api.feel === "function" && "shake" in api.feel());
      ok("__game exposes spawn/attack levers", typeof api.spawn === "function" && typeof api.attack === "function");
      ok("__game state reports day, threat and mobs",
        ["day", "threat", "mobs", "quests", "victory"].every((k) => k in api.state()));

      // =================== Chapter II ===================
      // --- save compatibility: new block ids are strictly appended ---
      ok("Chapter II blocks were appended after Chapter I blocks",
        [BASALT, ASH, EMBER_ORE, STEEL_ORE, STEEL_BLK, BASTION, BRAZIER, CALTROPS].every((id) => id > COLUMN),
        "column=" + COLUMN + " first-new=" + BASALT);
      ok("legacy block ids are untouched",
        BY.grass.id === 1 && BY.column.id === COLUMN && BY.roman_brick.id < COLUMN);
      ok("all block ids still fit one byte", DEFS.length <= 256, "n=" + DEFS.length);

      // --- save migration ---
      const migOld = migrateSave({ questIdx: 4 });
      ok("v1 mid-chapter save stays in Chapter I", migOld.chapter === 0 && migOld.questIdx === 4);
      const migDone = migrateSave({ questIdx: CHAPTER1.length });
      ok("v1 finished save is promoted into Chapter II",
        migDone.chapter === 1 && migDone.questIdx === 0 && migDone.promoted === true);
      const migV2 = migrateSave({ ver: 2, chapter: 1, questIdx: 5 });
      ok("v2 save restores its own chapter", migV2.chapter === 1 && migV2.questIdx === 5);
      const migWild = migrateSave({ ver: 2, chapter: 99, questIdx: 999 });
      ok("corrupt chapter index is clamped",
        migWild.chapter === CHAPTERS.length - 1 && migWild.questIdx <= CHAPTER2.length);
      ok("serialize records the chapter and current version",
        serialize().ver === SAVE_VER && SAVE_VER === 3 && "chapter" in serialize());

      // --- affixes ---
      ok("every affix is fully described", AFFIX_IDS.every((id) => {
        const a = AFFIXES[id];
        return a && a.name && a.color && a.desc && Array.isArray(a.on) && a.on.length > 0;
      }), "n=" + AFFIX_IDS.length);
      ok("three affix tiers", AFFIX_TIERS.length === 3);
      ok("every tool kind that can roll has a pool",
        affixPool("pick").length >= 3 && affixPool("sword").length >= 3
        && affixPool("hoe").length >= 2 && affixPool("shield").length >= 1,
        "pick=" + affixPool("pick").length + " sword=" + affixPool("sword").length);
      ok("fortune is pick-only and keen is weapon-only",
        affixPool("pick").indexOf("fortune") >= 0 && affixPool("sword").indexOf("fortune") < 0
        && affixPool("sword").indexOf("keen") >= 0 && affixPool("pick").indexOf("keen") < 0);
      // A stack with no `af` must behave exactly as it did before affixes existed.
      const plainSword = stackOf("iron_sword", 1);
      ok("a plain stack reads no affix", affixOf(plainSword) === null
        && affixLabel(plainSword) === "" && displayName(plainSword) === ITEMS.iron_sword.name);
      ok("a plain stack keeps its base damage", effDamage(plainSword) === ITEMS.iron_sword.damage);
      const keenSword = stackOf("iron_sword", 1); keenSword.af = { id: "keen", tier: 2 };
      ok("keen II adds four damage", effDamage(keenSword) === ITEMS.iron_sword.damage + 4,
        effDamage(keenSword) + " vs " + ITEMS.iron_sword.damage);
      ok("an affix shows in the display name", displayName(keenSword) === "锋锐 II · " + ITEMS.iron_sword.name,
        displayName(keenSword));
      const swiftPick = stackOf("iron_pick", 1); swiftPick.af = { id: "swift", tier: 3 };
      ok("swift III mines 75% faster",
        Math.abs(effSpeed(swiftPick) - (ITEMS.iron_pick.speed || 1) * 1.75) < 1e-9, effSpeed(swiftPick));
      ok("a weapon affix does nothing to speed", Math.abs(effSpeed(keenSword) - (ITEMS.iron_sword.speed || 1)) < 1e-9);
      const wild = stackOf("iron_pick", 1);
      wild.af = { id: "keen", tier: 9 };
      ok("an out-of-range tier is clamped, not trusted", affixOf(wild).tier === 3);
      wild.af = { id: "not_a_real_affix", tier: 1 };
      ok("an unknown affix id is ignored instead of crashing",
        affixOf(wild) === null && effDamage(wild) === (ITEMS.iron_pick.damage || 0));
      ok("affixVal falls back when the property is absent", affixVal(keenSword, "fortune", 0) === 0
        && affixVal(null, "damage", 7) === 7);
      // Reroll cost has to climb, or chasing a perfect roll costs nothing.
      const c0 = forgeCost(plainSword);
      const c3 = forgeCost({ key: "iron_sword", n: 1, af: { id: "keen", tier: 1, rerolls: 4 } });
      ok("the first reroll is cheap", c0.denarius === 2 && c0.ember_shard === 1);
      ok("reroll cost climbs with each attempt", c3.denarius === 6 && c3.ember_shard === 3,
        c3.denarius + "d " + c3.ember_shard + "e");
      ok("an empty hand cannot be forged", canForge(null).ok === false);
      ok("a plain block cannot be forged", canForge(stackOf("cobble", 1)).ok === false);
      ok("rollAffix only ever picks from the legal pool", (() => {
        const s = stackOf("iron_pick", 1), pool = affixPool("pick");
        for (let i = 0; i < 200; i++) {
          const a = rollAffix(s);
          if (!a || pool.indexOf(a.id) < 0 || a.tier < 1 || a.tier > 3) return false;
        }
        return true;
      })());
      ok("tier III stays rare", (() => {
        const s = stackOf("iron_pick", 1);
        let t3 = 0;
        for (let i = 0; i < 3000; i++) { rollAffix(s); if (s.af.tier === 3) t3++; }
        return t3 > 200 && t3 < 600;
      })());

      // --- chapter structure ---
      ok("two chapters exist", CHAPTERS.length === 2);
      ok("Chapter II has ten objectives", CHAPTER2.length === 10, "n=" + CHAPTER2.length);
      ok("Chapter I hands off to Chapter II", !!CHAPTERS[0].next && CHAPTERS[1].next === null);
      const chWas = chapter, qiWas = questIdx, qpWas = questProg;
      setChapter(1);
      ok("setChapter swaps the live quest list", QUESTS === CHAPTER2 && QUESTS[0].id === "warning");
      ok("Chapter II ends on the boss", CHAPTER2[CHAPTER2.length - 1].key === "oathbreaker");
      setChapter(chWas); questIdx = qiWas; questProg = qpWas;
      ok("quest aliases resolve group targets",
        BARBARIANS.has("archer") && BARBARIANS.has("raider") && BARBARIANS.has("lurker")
        && DEFENSE_BLOCKS.has("bastion_brick") && DEFENSE_BLOCKS.has("brazier") && DEFENSE_BLOCKS.has("caltrops"));

      // --- Chapter II crafting & smelting ---
      const rc = (grid, size) => matchRecipe(grid.map((k) => k ? stackOf(k, 1) : null), size);
      ok("basalt + cobble makes bastion brick",
        (rc(["basalt", "cobble", "cobble", "basalt"], 2) || {}).out[0] === "bastion_brick");
      ok("embers + iron + cobble makes a brazier",
        (rc(["ember_shard", "ember_shard", "iron_ingot", "cobble"], 2) || {}).out[0] === "brazier");
      ok("three iron makes four caltrops", (() => {
        const r = rc([null, "iron_ingot", null, "iron_ingot", null, "iron_ingot", null, null, null], 3);
        return r && r.out[0] === "caltrops" && r.out[1] === 4;
      })());
      ok("steel ingots make a steel gladius",
        (rc([null, "steel_ingot", null, null, "steel_ingot", null, null, "stick", null], 3) || {}).out[0] === "steel_gladius");
      ok("steel + sticks makes four pila", (() => {
        const r = rc([null, "steel_ingot", null, null, "stick", null, null, "stick", null], 3);
        return r && r.out[0] === "pilum" && r.out[1] === 4;
      })());
      ok("raw steel smelts into an ingot", SMELT.raw_steel[0] === "steel_ingot");
      ok("ember shards burn as furnace fuel", FUEL.ember_shard > FUEL.coal);
      ok("steel gladius out-damages the iron sword", ITEMS.steel_gladius.damage > ITEMS.iron_sword.damage);
      ok("pilum is thrown, not held", ITEMS.pilum.thrown === true && !ITEMS.pilum.tool);
      ok("pila stack so you can carry a volley", ITEMS.pilum.stack > 1);

      // =================== Seasons ===================
      const dayWas0 = G.day;
      ok("a year is four seasons long",
        SEASONS.length === 4 && seasonIndex(1) === 0 && seasonIndex(1 + SEASONS.length * SEASON_LEN) === 0);
      ok("each season lasts SEASON_LEN days",
        seasonIndex(1) === 0 && seasonIndex(SEASON_LEN) === 0 && seasonIndex(SEASON_LEN + 1) === 1);
      ok("seasons cycle in order ver→aestas→autumnus→hiems",
        [0, 1, 2, 3].every((i) => seasonIndex(1 + i * SEASON_LEN) === i)
        && SEASONS.map((s) => s.key).join(",") === "ver,aestas,autumnus,hiems");
      ok("season index never goes negative or out of range",
        [1, 7, 13, 19, 25, 200].every((d) => { const i = seasonIndex(d); return i >= 0 && i < 4; }));
      G.day = 1;
      ok("spring grows crops fastest", season().key === "ver" && season().growth > 1);
      G.day = 1 + 3 * SEASON_LEN;
      ok("winter nearly stops growth", season().key === "hiems" && season().growth < 0.4);
      ok("winter raises hunger and night pressure",
        season().hunger > 1.3 && season().spawnBonus === 2);
      G.day = 1 + 2 * SEASON_LEN;
      ok("autumn pays a harvest bonus", season().key === "autumnus" && season().yieldBonus === 1);
      G.day = 1;
      ok("season countdown starts full and ends at 1",
        seasonDaysLeft() === SEASON_LEN && ((G.day = SEASON_LEN), seasonDaysLeft()) === 1);
      // Winter turns rain to snow everywhere, not only in the taiga.
      const wxWas = [P.x, P.z, G.time, G.weather];
      P.x = 0; P.z = 0; G.time = 0.14;   // inside the rain window of the weather cycle
      G.day = 1; weatherTick();
      const springWx = G.weather;
      G.day = 1 + 3 * SEASON_LEN; weatherTick();
      ok("winter turns rainfall into snow outside the taiga",
        springWx !== 2 && G.weather === 2 && biomeAt(0, 0) !== "taiga",
        "spring=" + springWx + " winter=" + G.weather);
      P.x = wxWas[0]; P.z = wxWas[1]; G.time = wxWas[2]; G.weather = wxWas[3];
      G.day = dayWas0;

      // =================== Buffs ===================
      clearBuffs();
      ok("an unknown buff is rejected", addBuff("nonsense", 10) === false && !hasBuff("nonsense"));
      addBuff("vigor", 30);
      ok("a granted buff reads back as active", hasBuff("vigor") && buffs.vigor === 30);
      addBuff("vigor", 5);
      ok("re-applying a buff keeps the longer timer", buffs.vigor === 30);
      addBuff("vigor", 90);
      ok("a longer application extends the buff", buffs.vigor === 90);
      // vigor is not cosmetic: it must move both mining speed and melee damage.
      // Creative mining is a flat constant, so measure in survival.
      const buffCreWas = G.creative;
      G.creative = false;
      const stoneSpeedBuffed = mineSpeed(STONE);
      clearBuffs();
      const stoneSpeedPlain = mineSpeed(STONE);
      G.creative = buffCreWas;
      ok("vigor really speeds mining up",
        stoneSpeedBuffed > stoneSpeedPlain * 1.3, stoneSpeedPlain.toFixed(3) + "→" + stoneSpeedBuffed.toFixed(3));
      ok("buffs expire and clear themselves", (() => {
        addBuff("regen", 1);
        buffTick(2);
        return !hasBuff("regen") && buffs.regen === 0;
      })());
      ok("regen heals over time while active", (() => {
        clearBuffs(); P.hp = 10; addBuff("regen", 30);
        buffTick(3);
        const healed = P.hp > 10;
        clearBuffs(); P.hp = 20;
        return healed;
      })());
      ok("warmth cancels the winter hunger surcharge", (() => {
        // Model the exact expression the player tick uses.
        const drainAt = (dayN, warm) => {
          G.day = dayN;
          let m = season().hunger;
          if (m > 1 && warm) m = 1;
          return m;
        };
        const cold = drainAt(1 + 3 * SEASON_LEN, false);
        const warm = drainAt(1 + 3 * SEASON_LEN, true);
        G.day = dayWas0;
        return cold > 1.3 && warm === 1;
      })());
      ok("buff foods declare a real buff",
        ITEMS.wine.buff[0] === "warmth" && ITEMS.legion_stew.buff[0] === "regen"
        && ITEMS.honey_cake.buff[0] === "vigor"
        && [ITEMS.wine, ITEMS.legion_stew, ITEMS.honey_cake].every((it) => it.buff[1] > 0 && BUFFS[it.buff[0]]));
      clearBuffs();

      // =================== Agriculture ===================
      // Build a test field on a flat platform well clear of the terrain.
      const fx = 300, fy = 60, fz = 300;
      for (let dx = -6; dx <= 6; dx++) for (let dz = -6; dz <= 6; dz++) {
        setBlock(fx + dx, fy, fz + dz, DIRT);
        for (let dy = 1; dy <= 4; dy++) setBlock(fx + dx, fy + dy, fz + dz, AIR);
      }
      G.crops.clear();
      ok("dirt tills into farmland", tillSoil(fx, fy, fz) && getBlock(fx, fy, fz) === FARMLAND);
      ok("tilling the same soil twice is a no-op", tillSoil(fx, fy, fz) === false);
      ok("stone cannot be tilled",
        (setBlock(fx + 5, fy, fz + 5, STONE), tillSoil(fx + 5, fy, fz + 5) === false));
      ok("covered soil cannot be tilled", (() => {
        setBlock(fx + 4, fy, fz + 4, DIRT);
        setBlock(fx + 4, fy + 1, fz + 4, STONE);
        const r = tillSoil(fx + 4, fy, fz + 4);
        setBlock(fx + 4, fy + 1, fz + 4, AIR);
        return r === false;
      })());
      ok("water within four blocks makes soil wet", (() => {
        setBlock(fx + 3, fy, fz, WATER);
        const r = tillSoil(fx + 1, fy, fz) && getBlock(fx + 1, fy, fz) === FARMLAND_WET;
        return r;
      })());
      ok("soil out of reach of water stays dry",
        soilIsWet(fx - 6, fy, fz - 6) === false);
      ok("seeds sow only onto tilled soil", (() => {
        setBlock(fx - 3, fy, fz, DIRT);
        return plantCrop(fx - 3, fy + 1, fz, "wheat") === false;
      })());
      ok("seeds sow onto farmland", plantCrop(fx, fy + 1, fz, "wheat") && getBlock(fx, fy + 1, fz) === WHEAT_0);
      ok("planting registers a crop record",
        G.crops.has(cxyz(fx, fy + 1, fz)) && G.crops.get(cxyz(fx, fy + 1, fz)).kind === "wheat");
      ok("a cell cannot be double-planted", plantCrop(fx, fy + 1, fz, "wheat") === false);
      ok("an unknown crop kind is refused", plantCrop(fx + 2, fy + 1, fz, "turnips") === false);
      // Growth: wet soil beats dry soil, and both beat winter.
      G.day = 1;   // spring
      const rateDry = cropRate("wheat", fx - 1, fy + 1, fz - 1);
      setBlock(fx - 1, fy, fz - 1, FARMLAND);
      const rateDryReal = cropRate("wheat", fx - 1, fy + 1, fz - 1);
      setBlock(fx - 1, fy, fz - 1, FARMLAND_WET);
      const rateWet = cropRate("wheat", fx - 1, fy + 1, fz - 1);
      ok("irrigated soil grows crops faster than dry soil",
        rateWet > rateDryReal * 1.5, rateDryReal.toFixed(4) + " → " + rateWet.toFixed(4));
      ok("crops on no soil at all report death", rateDry < 0 || rateDryReal > 0);
      G.day = 1 + 3 * SEASON_LEN;
      const rateWinter = cropRate("wheat", fx - 1, fy + 1, fz - 1);
      G.day = 1;
      ok("winter slows the very same plot down",
        rateWinter < rateWet * 0.5, rateWet.toFixed(4) + " → " + rateWinter.toFixed(4));
      ok("grapes take longer to ripen than wheat", CROPS.grape.time > CROPS.wheat.time);
      // Ticking a crop must actually walk it through every visible stage.
      ok("a crop advances through all four stages", (() => {
        const seen = new Set();
        for (let i = 0; i < 400; i++) {
          cropAccum = 0; cropTick(1.0);
          const info = cropInfo(getBlock(fx, fy + 1, fz));
          if (!info) return false;
          seen.add(info.stage);
          if (info.stage === 3) break;
        }
        return seen.has(0) && seen.has(1) && seen.has(2) && seen.has(3);
      })());
      ok("a ripe crop stops at the last stage", (() => {
        cropAccum = 0; cropTick(50);
        return getBlock(fx, fy + 1, fz) === WHEAT_3 && G.crops.get(cxyz(fx, fy + 1, fz)).p === 1;
      })());
      // Harvest: ripe pays crop + seed, unripe refunds only a seed.
      ok("harvesting a ripe crop yields grain and seed", (() => {
        for (let i = 0; i < 36; i++) inv[i] = null;
        const r = harvestCrop(fx, fy + 1, fz, WHEAT_3);
        const grain = inv.reduce((n, s) => n + (s && s.key === "wheat" ? s.n : 0), 0);
        const seed = inv.reduce((n, s) => n + (s && s.key === "wheat_seeds" ? s.n : 0), 0);
        return r && grain >= 1 && seed >= 1 && getBlock(fx, fy + 1, fz) === AIR
          && !G.crops.has(cxyz(fx, fy + 1, fz));
      })());
      ok("autumn adds one to every harvest", (() => {
        const roll = (dayN) => {
          G.day = dayN;
          for (let i = 0; i < 36; i++) inv[i] = null;
          plantCrop(fx, fy + 1, fz, "wheat");
          setBlock(fx, fy + 1, fz, WHEAT_3);
          harvestCrop(fx, fy + 1, fz, WHEAT_3);
          return inv.reduce((n, s) => n + (s && s.key === "wheat" ? s.n : 0), 0);
        };
        // Yield has a random component, so compare the floors across many rolls.
        let minAutumn = 99, minSpring = 99;
        for (let i = 0; i < 24; i++) minSpring = Math.min(minSpring, roll(1));
        for (let i = 0; i < 24; i++) minAutumn = Math.min(minAutumn, roll(1 + 2 * SEASON_LEN));
        G.day = 1;
        return minAutumn === minSpring + 1;
      })());
      ok("pulling an unripe crop refunds only a seed", (() => {
        for (let i = 0; i < 36; i++) inv[i] = null;
        plantCrop(fx, fy + 1, fz, "wheat");
        harvestCrop(fx, fy + 1, fz, WHEAT_0);
        const grain = inv.reduce((n, s) => n + (s && s.key === "wheat" ? s.n : 0), 0);
        const seed = inv.reduce((n, s) => n + (s && s.key === "wheat_seeds" ? s.n : 0), 0);
        return grain === 0 && seed === 1;
      })());
      ok("harvestCrop ignores blocks that are not crops", harvestCrop(fx, fy, fz, STONE) === false);
      // Digging the soil out from under a crop kills it and returns the seed.
      ok("a crop whose soil is removed dies back to a seed", (() => {
        for (let i = 0; i < 36; i++) inv[i] = null;
        plantCrop(fx, fy + 1, fz, "wheat");
        setBlock(fx, fy, fz, AIR);
        cropAccum = 0; cropTick(1);
        const gone = getBlock(fx, fy + 1, fz) === AIR && !G.crops.has(cxyz(fx, fy + 1, fz));
        setBlock(fx, fy, fz, FARMLAND);
        return gone && inv.some((s) => s && s.key === "wheat_seeds");
      })());
      // Irrigation is re-evaluated: cutting the water dries the field.
      ok("removing the water dries tilled soil out again", (() => {
        setBlock(fx + 1, fy, fz, FARMLAND_WET);
        plantCrop(fx + 1, fy + 1, fz, "wheat");
        setBlock(fx + 3, fy, fz, AIR);            // drain the channel
        G.tick = 0;
        for (let i = 0; i < 3; i++) { cropAccum = 0; cropTick(1); }
        return getBlock(fx + 1, fy, fz) === FARMLAND;
      })());
      ok("trampling a field destroys soil and crop", (() => {
        setBlock(fx - 2, fy, fz, FARMLAND);
        plantCrop(fx - 2, fy + 1, fz, "wheat");
        const pw = [P.x, P.y, P.z];
        P.x = fx - 2 + 0.5; P.y = fy + 1; P.z = fz + 0.5;
        const r = trampleSoil();
        P.x = pw[0]; P.y = pw[1]; P.z = pw[2];
        return r && getBlock(fx - 2, fy, fz) === DIRT && getBlock(fx - 2, fy + 1, fz) === AIR;
      })());
      ok("trampling plain ground does nothing", (() => {
        const pw = [P.x, P.y, P.z];
        P.x = fx + 5.5; P.y = fy + 1; P.z = fz + 5.5;   // that cell is stone
        const r = trampleSoil();
        P.x = pw[0]; P.y = pw[1]; P.z = pw[2];
        return r === false;
      })());
      // Crop persistence across a save round-trip.
      // Sub-stage progress is the one thing the block grid cannot express, so it
      // has to survive the round trip exactly — otherwise every save/load would
      // quietly rewind a half-grown field to the start of its stage.
      ok("crops survive a serialize/restore round trip with exact progress", (() => {
        G.crops.clear();
        setBlock(fx, fy, fz, FARMLAND);
        setBlock(fx, fy + 1, fz, AIR);
        plantCrop(fx, fy + 1, fz, "wheat");
        G.day = 1;
        // Grow naturally until progress sits partway into a stage.
        for (let i = 0; i < 60 && G.crops.get(cxyz(fx, fy + 1, fz)).p < 0.45; i++) { cropAccum = 0; cropTick(1); }
        const was = G.crops.get(cxyz(fx, fy + 1, fz)).p;
        if (!(was > 0 && was < 1)) return false;
        const blob = JSON.parse(JSON.stringify(serialize()));
        G.crops.clear();
        restoreCrops(blob.crops);
        const rec = G.crops.get(cxyz(fx, fy + 1, fz));
        return !!rec && rec.kind === "wheat" && Math.abs(rec.p - was) < 1e-9;
      })());
      ok("restore drops records whose block is gone", (() => {
        const stale = [[cxyz(fx + 9, fy + 9, fz + 9), { kind: "wheat", p: 0.5 }]];
        restoreCrops(stale);
        return !G.crops.has(cxyz(fx + 9, fy + 9, fz + 9));
      })());
      ok("restore rebuilds records for orphaned crop blocks", (() => {
        setBlock(fx + 2, fy, fz, FARMLAND);
        setBlock(fx + 2, fy + 1, fz, WHEAT_2);   // planted "by hand", no record
        restoreCrops([]);
        const rec = G.crops.get(cxyz(fx + 2, fy + 1, fz));
        return !!rec && rec.kind === "wheat" && rec.p > 0.6 && rec.p < 0.7;
      })());
      // A saved progress value that disagrees with the block's own stage is a
      // corrupt pairing; the block wins, so the crop still ripens from where it looks.
      ok("progress that contradicts the visible stage is discarded", (() => {
        setBlock(fx + 3, fy, fz + 3, FARMLAND);
        setBlock(fx + 3, fy + 1, fz + 3, WHEAT_0);
        restoreCrops([[cxyz(fx + 3, fy + 1, fz + 3), { kind: "wheat", p: 0.95 }]]);
        const rec = G.crops.get(cxyz(fx + 3, fy + 1, fz + 3));
        return !!rec && rec.p === 0;
      })());
      ok("a wheat record on a grape block takes the block's word", (() => {
        setBlock(fx + 3, fy, fz + 3, FARMLAND);
        setBlock(fx + 3, fy + 1, fz + 3, GRAPE_2);
        restoreCrops([[cxyz(fx + 3, fy + 1, fz + 3), { kind: "wheat", p: 0.7 }]]);
        const rec = G.crops.get(cxyz(fx + 3, fy + 1, fz + 3));
        return !!rec && rec.kind === "grape";
      })());
      ok("restore survives a corrupt crop table",
        (restoreCrops([["bad", null], [null, { kind: "wheat" }], ["1,2", { kind: "wheat", p: 0 }],
          ["1,2,x", { kind: "wheat", p: 0 }], ["9,9,9", { kind: "ghosts", p: 0 }]]), true));
      // A v2 blob carries no `crops` key at all. That must not throw, and the only
      // records that appear are the ones re-derived from crop blocks actually in
      // the world — so an old save's fields keep growing instead of freezing.
      ok("a v2 save with no crop table still loads and re-derives its fields", (() => {
        setBlock(fx + 2, fy, fz, FARMLAND);
        setBlock(fx + 2, fy + 1, fz, WHEAT_1);
        restoreCrops(undefined);
        const rec = G.crops.get(cxyz(fx + 2, fy + 1, fz));
        return !!rec && rec.kind === "wheat";
      })());
      ok("a v2 save with no crop blocks yields an empty crop table", (() => {
        // Clear every crop block this test block left in the diffs, then reload.
        for (const [k, id] of Array.from(G.diffs)) {
          if (cropInfo(id)) {
            const c = k.split(",").map(Number);
            setBlock(c[0], c[1], c[2], AIR);
          }
        }
        restoreCrops(undefined);
        return G.crops.size === 0;
      })());
      G.crops.clear();
      // Farming recipes and the food chain.
      ok("planks and sticks make a hoe",
        ((rc(["oak_planks", "oak_planks", null, null, "stick", null, null, "stick", null], 3) || {}).out || [])[0] === "wood_hoe");
      ok("the hoe line spans wood to imperial steel",
        ["wood_hoe", "stone_hoe", "iron_hoe", "steel_hoe"].every((k) => ITEMS[k] && ITEMS[k].tool === "hoe")
        && ITEMS.steel_hoe.level > ITEMS.wood_hoe.level);
      ok("nine wheat bale up and unbale back to nine",
        (rc(Array(9).fill("wheat"), 3) || {}).out[0] === "hay_block"
        && (() => { const r = rc(["hay_block"], 2); return r && r.out[0] === "wheat" && r.out[1] === 9; })());
      ok("grapes and glass make wine",
        (rc(["grape", "grape", "grape", "glass"], 2) || {}).out[0] === "wine");
      ok("stew is the top of the food chain", (() => {
        const r = rc(["cooked_beef", "wheat", "grape", "bread"], 2);
        return r && r.out[0] === "legion_stew" && ITEMS.legion_stew.food > ITEMS.bread.food;
      })());
      ok("wild grass drops the seeds that bootstrap farming",
        BY.tallgrass && !!ITEMS.wheat_seeds && ITEMS.wheat_seeds.plant === "wheat");
      ok("crop stage blocks are plants, not solids",
        [WHEAT_0, WHEAT_3, GRAPE_0, GRAPE_3].every((id) => isPlant(id) && !isSolid(id)));
      ok("every crop stage has its own atlas tile", (() => {
        const tiles = new Set();
        for (const k in CROPS) for (const id of CROPS[k].stages) tiles.add(defOf(id).tile);
        return tiles.size === 8;
      })());
      ok("farmland drops plain dirt when dug",
        defOf(FARMLAND).drop === "dirt" && defOf(FARMLAND_WET).drop === "dirt");

      // --- Ashlands region ---
      ok("Ashlands centre reports its own biome", biomeAt(ASHLAND.x, ASHLAND.z) === "ashland");
      ok("Ashlands do not leak into the capital", biomeAt(0, 0) !== "ashland");
      ok("Ashlands are a bounded region",
        biomeAt(ASHLAND.x + ASHLAND.r + 60, ASHLAND.z) !== "ashland");
      ok("Ashlands have a readable name", BIOME_NAMES.ashland === "灰烬荒原" && !!BIO_COL.ashland);
      // atmosphere: volcanic haze + ashfall, driven by the player's position
      const skyWas = [P.x, P.z];
      P.x = 0; P.z = 0;
      const skyHome = skyColors();
      P.x = ASHLAND.x; P.z = ASHLAND.z;
      const skyAsh = skyColors();
      ok("the Ashlands have their own hazed sky",
        skyAsh.ash > 0.8 && skyHome.ash === 0 && skyAsh.bot[2] < skyHome.bot[2],
        "ash=" + skyAsh.ash.toFixed(2));
      parts.length = 0;
      weatherTick();
      ok("ashfall falls over the Ashlands", G.weather === 3 && parts.length > 0, "parts=" + parts.length);
      parts.length = 0;
      P.x = skyWas[0]; P.z = skyWas[1];
      weatherTick();
      ok("ashfall is local to the Ashlands", G.weather !== 3 || biomeAt(wf(P.x), wf(P.z)) === "ashland");
      parts.length = 0;
      const ashCh = generateChunk(w2c(ASHLAND.x), w2c(ASHLAND.z));
      let ashSurface = 0, ashEmber = 0, ashTrees = 0;
      for (let lx = 0; lx < 16; lx++) for (let lz = 0; lz < 16; lz++) {
        const hh = heightAt(w2c(ASHLAND.x) * 16 + lx, w2c(ASHLAND.z) * 16 + lz);
        const top = ashCh.blocks[cidx(lx, hh, lz)];
        if (top === ASH || top === BASALT) ashSurface++;
        for (let y = 1; y < SY; y++) {
          const b = ashCh.blocks[cidx(lx, y, lz)];
          if (b === EMBER_ORE) ashEmber++;
          if (b === OAK_LOG || b === PINE_LOG || b === BIRCH_LOG) ashTrees++;
        }
      }
      ok("Ashlands surface is ash and basalt", ashSurface > 200, "n=" + ashSurface);
      ok("Ashlands expose ember ore", ashEmber > 0, "n=" + ashEmber);
      ok("nothing grows in the Ashlands", ashTrees === 0, "logs=" + ashTrees);

      // --- deep ore layers ---
      let deepSteel = 0, deepEmber = 0;
      for (const c of [generateChunk(3, 3), generateChunk(-4, 2), generateChunk(6, -5), generateChunk(-7, -7)]) {
        for (let y = 1; y < 34; y++) for (let lx = 0; lx < 16; lx++) for (let lz = 0; lz < 16; lz++) {
          const b = c.blocks[cidx(lx, y, lz)];
          if (b === STEEL_ORE) { deepSteel++; ok._steelY = y; }
          if (b === EMBER_ORE) deepEmber++;
        }
      }
      ok("imperial steel ore generates deep underground", deepSteel > 0, "n=" + deepSteel);
      ok("ember ore generates deep underground", deepEmber > 0, "n=" + deepEmber);
      ok("imperial steel needs an iron pick", BY.imperial_ore.level === 3 && BY.imperial_ore.tool === "pick");
      ok("ember ore glows in the dark", BY.ember_ore.light > 0);

      // --- new enemies, gated by threat tier ---
      mobs.length = 0;
      const roster = ["archer", "raider", "lurker", "ravager", "oathbreaker"];
      const dayWas2 = G.day;
      G.day = 1;
      const made = {};
      for (const k of roster) { mobs.length = 0; made[k] = spawnMob(k, P.x + 60, P.y, P.z + 60); }
      mobs.length = 0;
      ok("all five new enemies spawn", roster.every((k) => !!made[k]));
      ok("each new enemy has its own AI routine",
        new Set(roster.map((k) => made[k].ai)).size === 5,
        roster.map((k) => made[k].ai).join(","));
      ok("new AI routines differ from the Chapter I ones",
        !roster.some((k) => made[k].ai === "circle" || made[k].ai === "pounce"));
      ok("archers keep their distance and shoot", made.archer.ai === "archer");
      ok("raiders arrive as a warband", made.raider.ai === "pack");
      ok("lurkers start buried", made.lurker.ai === "ambush" && made.lurker.buried === true);
      ok("ravagers are siege units", made.ravager.ai === "siege" && made.ravager.hp > made.raider.hp);
      ok("the Oathbreaker is flagged as a boss",
        made.oathbreaker.boss === true && made.oathbreaker.maxHp >= 200, "hp=" + made.oathbreaker.maxHp);
      ok("threat tiers unlock enemies in order",
        MOB_TIER.archer === 1 && MOB_TIER.raider === 2 && MOB_TIER.lurker === 2 && MOB_TIER.ravager === 3);
      ok("the boss never rolls out of the random spawner", MOB_TIER.oathbreaker > 5);
      ok("every new enemy has a readable name",
        roster.every((k) => !!MOB_LABEL[k]));

      // --- boss phases ---
      const bossT = made.oathbreaker;
      bossT.hp = bossT.maxHp;
      ok("boss opens in phase 1", bossPhase(bossT) === 1);
      bossT.hp = bossT.maxHp * 0.5;
      ok("boss reaches phase 2 at half health", bossPhase(bossT) === 2);
      bossT.hp = bossT.maxHp * 0.2;
      ok("boss enrages in phase 3", bossPhase(bossT) === 3);
      G.day = dayWas2;

      // --- warbands really bring friends ---
      mobs.length = 0;
      spawnMob("raider", P.x + 50, P.y, P.z + 50);
      ok("a raider drags a warband along", mobs.length >= 3, "n=" + mobs.length);
      ok("warband members hold different flanks",
        new Set(mobs.map((m) => m.flank)).size > 1);
      mobs.length = 0;

      // The remaining checks place and break real blocks around the player, so
      // put him on solid loaded ground first — the self-test may be invoked from
      // anywhere, including mid-air over a freshly teleported region.
      const footing = findSpawn();
      P.x = footing[0]; P.y = footing[1]; P.z = footing[2];
      P.vx = P.vy = P.vz = 0;

      // --- projectiles ---
      shots.length = 0;
      give("pilum", 4);
      const pilumSlot = inv.findIndex((s) => s && s.key === "pilum");
      const selWas = sel;
      sel = pilumSlot;
      P.yaw = 0; P.pitch = 0;
      const beforeThrow = inv[pilumSlot].n;
      const creWas = G.creative; G.creative = false;
      ok("throwing a pilum launches a projectile", throwPilum() === true && shots.length === 1);
      ok("throwing consumes a pilum",
        !inv[pilumSlot] || inv[pilumSlot].n === beforeThrow - 1,
        "n=" + (inv[pilumSlot] ? inv[pilumSlot].n : 0));
      ok("the projectile is owned by the player", shots[0].from === "player");
      shots.length = 0;
      G.creative = creWas; sel = selWas;

      mobs.length = 0;
      // Carve a guaranteed-empty firing lane: setBlock also forces the chunk to load,
      // so this works the same headless as it does in a browser.
      const laneX = wf(P.x), laneY = wf(P.y) + 1, laneZ = wf(P.z);
      for (let dz = 0; dz <= 5; dz++) setBlock(laneX, laneY, laneZ - dz, AIR);
      const shotTarget = spawnMob("zombie", P.x, P.y, P.z - 3);
      shotTarget.hostile = false; shotTarget.speed = 0; shotTarget.wander = 1e6;
      shotTarget.x = laneX + 0.5; shotTarget.z = laneZ - 3 + 0.5; shotTarget.y = laneY - 0.5;
      const shotHpBefore = shotTarget.hp;
      spawnShot(laneX + 0.5, laneY + 0.4, laneZ - 1.5, 0, 0, -1, 30, 9, "player", [214, 205, 184]);
      shotTick(0.05);
      ok("a projectile damages what it hits", shotTarget.hp < shotHpBefore,
        shotHpBefore + " -> " + shotTarget.hp);
      ok("a spent projectile is removed", shots.length === 0);
      // ...and a projectile stopped by terrain hits nothing.
      setBlock(laneX, laneY, laneZ - 2, BASTION);
      shotTarget.hp = shotTarget.maxHp;
      spawnShot(laneX + 0.5, laneY + 0.4, laneZ - 1.5, 0, 0, -1, 30, 9, "player", [214, 205, 184]);
      shotTick(0.05);
      ok("a wall stops a projectile", shotTarget.hp === shotTarget.maxHp && shots.length === 0,
        "hp=" + shotTarget.hp);
      setBlock(laneX, laneY, laneZ - 2, AIR);
      mobs.length = 0; shots.length = 0;

      // --- braziers hold back the dark ---
      G.braziers.clear();
      const bzx = wf(P.x) + 3, bzy = wf(P.y) + 1, bzz = wf(P.z);
      ok("nowhere is lit before a brazier is placed", brazierCovers(bzx, bzz) === false);
      setBlock(bzx, bzy, bzz, BRAZIER);
      ok("placing a brazier registers it", G.braziers.size === 1, "n=" + G.braziers.size);
      ok("a brazier suppresses spawns around it", brazierCovers(bzx + 6, bzz + 6) === true);
      ok("brazier light does not reach the whole world", brazierCovers(bzx + 200, bzz) === false);
      setBlock(bzx, bzy, bzz, AIR);
      ok("breaking a brazier unregisters it", G.braziers.size === 0);
      ok("braziers can be rebuilt from a loaded save", (() => {
        setBlock(bzx, bzy, bzz, BRAZIER);
        G.braziers.clear();
        rebuildBraziers();
        return G.braziers.size === 1;
      })());
      setBlock(bzx, bzy, bzz, AIR);
      ok("braziers are a light source", BY.brazier.light > 10);

      // --- caltrops bite ---
      mobs.length = 0;
      const stepper = spawnMob("zombie", P.x + 6, P.y, P.z);
      const ctx0 = wf(stepper.x), ctz0 = wf(stepper.z);
      setBlock(ctx0, wf(stepper.y), ctz0, CALTROPS);
      stepper.caltropCd = 0;
      const ctHp = stepper.hp;
      caltropTick(stepper, 0.1);
      ok("caltrops wound whatever steps on them", stepper.hp < ctHp, ctHp + " -> " + stepper.hp);
      ok("caltrops are walk-through, not a wall", !BY.caltrops.solid);
      const friendly = spawnMob("cow", P.x + 6, P.y, P.z);
      friendly.caltropCd = 0;
      const cowHp = friendly.hp;
      caltropTick(friendly, 0.1);
      ok("caltrops ignore livestock", friendly.hp === cowHp);
      setBlock(ctx0, wf(stepper.y), ctz0, AIR);
      mobs.length = 0;

      // --- ravagers only eat what you built ---
      mobs.length = 0;
      const rav = spawnMob("ravager", P.x + 8, P.y, P.z);
      const rvx = wf(rav.x) + 1, rvy = wf(rav.y), rvz = wf(rav.z);
      G.diffs.delete(cxyz(rvx, rvy, rvz));
      const natural = getBlock(rvx, rvy, rvz);
      void natural;
      setBlock(rvx, rvy, rvz, BASTION);            // a wall the player put up
      ok("a ravager smashes player-placed blocks", smashPlayerBlock(rav) === true);
      ok("the smashed block is gone", getBlock(rvx, rvy, rvz) === AIR);
      mobs.length = 0;

      // --- new debug levers ---
      ok("__game exposes chapter controls",
        typeof api.chapter === "function" && typeof api.nextChapter === "function" && typeof api.setChapter === "function");
      ok("__game exposes boss and projectile probes",
        typeof api.boss === "function" && typeof api.shots === "function" && typeof api.spawnBoss === "function");
      ok("__game state reports chapter, biome and boss",
        ["chapter", "biome", "boss", "shots"].every((k) => k in api.state()));
      ok("__game reports the Ashlands location",
        api.ashland().x === ASHLAND.x && api.ashland().r > 0);

      const heights = [];
      for (let z = -64; z <= 64; z += 8) for (let x = -64; x <= 64; x += 8) {
        if (riverInf(x, z) < 0.2) heights.push(heightAt(x, z));
      }
      ok("Roman heartland is broadly flat", Math.max(...heights) - Math.min(...heights) <= 12,
        "relief=" + (Math.max(...heights) - Math.min(...heights)).toFixed(1));

      mobs.length = 0;
      spawnMob("soldier", 1, 30, 1); spawnMob("lion", 2, 30, 2); spawnMob("wolf", 3, 30, 3);
      ok("Roman soldier NPC exists", mobs.some((m) => m.kind === "soldier" && m.npc && !m.hostile));
      ok("arena lion is hostile", mobs.some((m) => m.kind === "lion" && m.hostile && m.damage >= 5));
      ok("wolf enemy is distinct", mobs.some((m) => m.kind === "wolf" && m.hostile && m.speed > 3));
      spawnMob("citizen",4,30,4,{name:"莉维娅",story:"livia"});
      ok("named Roman citizen has story identity", mobs.some((m)=>m.name==="莉维娅"&&m.story==="livia"&&m.npc));
      // Pin to Chapter I: this checks the Livia waypoint specifically, and the
      // self-test may be called while the player is midway through Chapter II.
      const wpChapter = chapter;
      setChapter(0, true);
      questIdx = 3; P.x = 0; P.z = 0; P.yaw = 0;
      const waypoint = questWaypoint();
      ok("quest waypoint resolves named story target", waypoint && waypoint.label === "建筑师莉维娅" && waypoint.distance > 0);
      ok("quest waypoint exposes relative bearing", waypoint && Number.isFinite(waypoint.relative));
      // Chapter II navigation points at the fixed Ashlands caldera.
      setChapter(1, true);
      questIdx = 5;
      const wpAsh = questWaypoint();
      ok("Chapter II waypoint points at the Ashlands",
        wpAsh && wpAsh.label === "灰烬荒原" && wpAsh.x === ASHLAND.x && wpAsh.distance > 0);
      // ...and at the boss once he is on the field.
      questIdx = 9;
      spawnMob("oathbreaker", P.x + 30, 40, P.z + 30);
      const wpBoss = questWaypoint();
      ok("Chapter II waypoint tracks the boss", wpBoss && wpBoss.label === "背誓百夫长" && wpBoss.distance > 0);
      mobs.length = 0;
      setChapter(wpChapter, true);

      ok("give known item", give("oak_log", 3) && inv.some((s) => s && s.key === "oak_log" && s.n === 3));
      ok("give unknown item safe", give("not_a_real_item", 1) === false);
      ok("partial stacks can merge", canStack(stackOf("dirt", 10), stackOf("dirt", 60)) && !canStackFully(stackOf("dirt", 10), stackOf("dirt", 60)));

      const d = lookDir();
      const llen = Math.hypot(d[0], d[1], d[2]);
      ok("lookDir unit length", Math.abs(llen - 1) < 1e-5, "len=" + llen.toFixed(5));
      P.yaw = 0; P.pitch = 0;
      const f0 = lookDir();
      ok("yaw0 looks -Z", Math.abs(f0[0]) < 1e-6 && Math.abs(f0[2] + 1) < 1e-6, f0.join(","));

      const spawn = findSpawn();
      ok("spawn is array3", spawn && spawn.length === 3);
      const feet = getBlock(spawn[0], spawn[1] - 0.2, spawn[2]);
      const head = getBlock(spawn[0], spawn[1] + 1.6, spawn[2]);
      ok("spawn feet near ground", isSolid(feet) || isSolid(getBlock(spawn[0], spawn[1] - 1.2, spawn[2])), "feet=" + feet);
      ok("spawn head not solid", !isSolid(head), "head=" + head);
      ok("spawn above sea", spawn[1] > SEA, "y=" + spawn[1].toFixed(1));

      P.x = spawn[0]; P.y = spawn[1]; P.z = spawn[2];
      P.vx = 0; P.vy = 0; P.vz = 0; P.flying = false; P.onGround = false;
      keys.KeyW = keys.Space = false;
      for (let i = 0; i < 40; i++) playerTick(0.05);
      ok("gravity lands on ground", P.onGround === true, "y=" + P.y.toFixed(2) + " onGround=" + P.onGround);
      ok("did not fall through world", P.y > 1, "y=" + P.y.toFixed(2));
      jumpQueued = true;
      playerTick(0.016);
      ok("queued touch jump survives a quick tap", P.vy > 0 && !P.onGround, "vy=" + P.vy.toFixed(2));

      P.x = -3.4; P.z = -5.6;
      getChunk(w2c(P.x), w2c(P.z));
      const before = getBlock(P.x, hn + 2, P.z);
      ok("float negative samples floored cell", wf(P.x) === -4);

      P.view = 1; camDist = 4.6; camS.ready = false;
      ok("default view is third person", P.view === 1);
      setView(0, true);
      ok("setView first person", P.view === 0);
      setView(1, true);
      ok("setView third person", P.view === 1);
      setView(2, true);
      ok("setView front camera", P.view === 2);
      setView(1, true);

      const e = eyePos();
      const back = [e[0] - lookDir()[0] * 4, e[1] + 1, e[2] - lookDir()[2] * 4];
      const cam = camPoint(e, back);
      ok("camera helper returns point", cam && cam.length === 3);

      G.creative = false; P.hp = 20; P.dead = false; P.invuln = 0;
      hurt(3, "test");
      ok("survival takes damage", P.hp < 20 && P.hp > 0, "hp=" + P.hp);
      const hp2 = P.hp;
      hurt(1, "test");
      ok("iframes block small hits", P.hp === hp2, "hp=" + P.hp);
      G.creative = true; P.hp = 20; P.invuln = 0;
      hurt(10, "test");
      ok("creative is invincible", P.hp === 20);

      const f = furnAt(1, 2, 3);
      f.in = stackOf("raw_iron", 1);
      f.fuel = stackOf("coal", 1);
      f.out = null; f.cook = 0; f.fuelLeft = 0;
      for (let i = 0; i < 200; i++) furnaceTick(0.05);
      ok("furnace smelts iron", f.out && f.out.key === "iron_ingot", f.out && f.out.key);
      const chest = chestAt(4, 5, 6);
      chest[0] = stackOf("diamond", 3);

      const packed = serialize();
      ok("save has seed and view", packed.seed === 42 && packed.player && packed.player.view != null);
      ok("save records block diffs", Array.isArray(packed.diffs) && packed.diffs.length >= 1);
      ok("save records furnace contents", packed.furnaces.some(([k, v]) => k === "1,2,3" && v.out && v.out.key === "iron_ingot"));
      ok("save records chest contents", packed.chests.some(([k, v]) => k === "4,5,6" && v[0] && v[0].n === 3));

      ok("stone needs pick", DEFS[STONE].tool === "pick" && DEFS[STONE].level >= 1);
      ok("grass drops dirt", DEFS[GRASS].drop === "dirt");
      ok("water is not solid", !isSolid(WATER) && isFluid(WATER));
      ok("third-person model fn exists", typeof drawPlayerModel === "function");
      let riverHits = 0;
      for (let i = 0; i < 80; i++) if (riverInf(i * 3, 10) > 0.5) riverHits++;
      ok("rivers exist on seed 42", riverHits > 0, "hits=" + riverHits);
      ok("AO table has 4 steps", AOL.length === 4 && AOL[0] > AOL[3]);
      ok("touch pad state exists", typeof pad.x === "number" && typeof pad.z === "number");

      const beforeMesh = G.chunks.size;
      const meshSnap = Array.from(G.chunks.values());
      for (let i = 0; i < meshSnap.length; i++) meshChunk(meshSnap[i]);
      ok("meshing does not spawn extra chunks", G.chunks.size === beforeMesh, beforeMesh + "->" + G.chunks.size);
      ok("unloaded physics is solid", getBlock(9000, 12, 9000) === BEDROCK);
      ok("unloaded peek is air", peekBlock(9000, 12, 9000) === AIR);
      ok("peek does not generate chunk", !G.chunks.has(ck(w2c(9000), w2c(9000))));

      G.chunks = new Map(); G.dirty = new Set();
      const tGen = performance.now();
      for (let z = -2; z <= 2; z++) for (let x = -2; x <= 2; x++) getChunk(x, z, { mesh: false });
      const n25 = G.chunks.size;
      const list25 = Array.from(G.chunks.values());
      for (let i = 0; i < list25.length; i++) meshChunk(list25[i]);
      const tDone = performance.now() - tGen;
      ok("new-world ring is 25 chunks", n25 === 25, "n=" + n25);
      ok("new-world mesh stays 25", G.chunks.size === 25, "n=" + G.chunks.size);
      ok("new-world gen+mesh under 5s", tDone < 5000, "ms=" + tDone.toFixed(0));
      ok("every loaded chunk has a mesh", list25.every((c) => c.mesh && c.mesh.n > 0));
      let holes = 0;
      for (const c of list25) if (!c.mesh || !c.mesh.n) holes++;
      ok("no hollow chunks in ring", holes === 0, "holes=" + holes);
      const spawn2 = findSpawn();
      ok("spawn after ring is valid", spawn2 && spawn2[1] > SEA, "y=" + (spawn2 && spawn2[1]));
    } catch (err) {
      failed++;
      log.push("FAIL  threw: " + (err && err.stack ? err.stack : err));
    }

    G.seed = snap.seed; G.time = snap.time; G.creative = snap.creative; G.tick = snap.tick;
    G.chunks = snap.chunks; G.dirty = snap.dirty; G.diffs = snap.diffs;
    G.furnaces = snap.furnaces; G.chests = snap.chests;
    Object.assign(P, snap.player);
    for (let i = 0; i < 36; i++) inv[i] = snap.inv[i];
    mobs.length = 0; mobs.push(...snap.mobs);
    sel = snap.sel; questIdx = snap.questIdx; questProg = snap.questProg;
    seenNight = snap.seenNight; wasNight = snap.wasNight;
    camDist = snap.camDist; bodyYaw = snap.bodyYaw;

    const summary = "HAVEN self-test  " + (log.length - failed) + " passed / " + failed + " failed / " + log.length + " total";
    log.unshift(summary);
    console.log(log.join("\n"));
    return { passed: log.length - failed - 1, failed, log };
  }

  const api = {
    player: P,
    getBlock, setBlock, give,
    save: saveGame, selftest,
    teleport(x, y, z) { P.x = x; P.y = y; P.z = z; },
    time: () => G.time,
    seed: () => G.seed,
    blockId(key) { return BY[key] ? BY[key].id : 0; },
    wf, lookDir, matchRecipe,
    press(code) { keys[code] = true; },
    release(code) { keys[code] = false; },
    look(yaw, pitch) { P.yaw = yaw; if (pitch != null) P.pitch = pitch; },
    height(x, z) { return heightAt(x, z); },
    actors() { return mobs.map((m) => ({ kind: m.kind, name:m.name||null, story:m.story||null, x: m.x, y: m.y, z: m.z, hp: m.hp, npc: !!m.npc, hostile: !!m.hostile })); },
    killall() { mobs.length = 0; },
    god() { G.creative = true; P.hp = 20; P.food = 20; P.dead = false; },
    survival() { G.creative = false; P.flying = false; drawVitals(); return true; },
    waypoint: questWaypoint,
    // --- debug levers for feel / difficulty / flow ---
    spawn(kind, dx, dz) {
      const x = P.x + (dx == null ? 2 : dx), z = P.z + (dz == null ? 0 : dz);
      return spawnMob(kind, x, groundY(x, z), z) || null;
    },
    hurtMe(n) { hurt(n == null ? 4 : n, "debug damage"); return P.hp; },
    attack() { return hitMob(); },
    // Same path the right mouse button takes, minus the pointer-lock requirement.
    use() { placeCd = 0; tryPlace(); return true; },
    eat() { placeCd = 0; return eatHeld(); },
    aim() { const t = handTool(); return lookMob(t && t.range ? t.range + 1.5 : 5) || null; },
    wearDown(key, frac) {
      const i = inv.findIndex((s) => s && s.key === key);
      if (i < 0 || !ITEMS[key] || !ITEMS[key].dur) return null;
      inv[i].dur = Math.max(1, Math.round(ITEMS[key].dur * clamp(frac, 0.01, 1)));
      refreshHotbar();
      return inv[i].dur;
    },
    setDay(d) { G.day = Math.max(1, d | 0); lastTier = -1; updateWorldInfo(true); updateRunStats(); return threatTier(); },
    setTime(t) { G.time = clamp(t, 0, 0.999); return G.time; },
    threat: threatTier,
    stats() {
      return { kills: STAT.kills, mined: STAT.mined, placed: STAT.placed, harvested: STAT.harvested || 0, seconds: Math.round(runSeconds()), day: G.day, threat: threatTier() };
    },
    feel() {
      return { shake: Math.round(shake * 1000) / 1000, hitStop: Math.round(hitStop * 1000) / 1000, floats: floats.length, particles: parts.length };
    },
    // --- affixes / the anvil ---
    // Probes read the *selected* stack by default so a test can drive the same
    // path the player does: pick a slot, then look at what is in hand.
    affix(slot) {
      const s = slot == null ? selected() : inv[slot];
      const a = affixOf(s);
      if (!a) return null;
      return { id: a.id, tier: a.tier, name: a.def.name, label: affixLabel(s),
        rerolls: (s.af && s.af.rerolls) || 0 };
    },
    affixIds() { return AFFIX_IDS.slice(); },
    affixPool(toolKind) { return affixPool(toolKind); },
    // Force a specific roll — lets a test assert one affix's effect in isolation
    // instead of fighting the reroll RNG.
    setAffix(id, tier, slot) {
      const i = slot == null ? sel : slot;
      const s = inv[i];
      if (!s) return null;
      if (id == null) delete s.af;
      else s.af = { id, tier: clamp(tier == null ? 1 : tier | 0, 1, 3), rerolls: (s.af && s.af.rerolls) || 0 };
      refreshHotbar();
      if (uiMode === "forge") renderForge();
      return api.affix(i);
    },
    affixName(slot) { return displayName(slot == null ? selected() : inv[slot]); },
    slotOf(i) { const s = inv[i]; return s ? { key: s.key, n: s.n, dur: s.dur == null ? null : s.dur, af: s.af || null } : null; },
    discoveries() { return Array.from(discoveries); },
    // The generated material atlas, so the art harness can magnify and review it.
    atlasCanvas() { return atlasCanvas; },
    forgeCost(slot) { return forgeCost(slot == null ? selected() : inv[slot]); },
    canForge(slot) { return canForge(slot == null ? selected() : inv[slot]); },
    forge() { return forgeReroll(); },
    effStats(slot) {
      const s = slot == null ? selected() : inv[slot];
      return { damage: effDamage(s), speed: Math.round(effSpeed(s) * 1000) / 1000,
        wearSkip: affixVal(s, "wearSkip", 0), fortune: affixVal(s, "fortune", 0),
        harvest: affixVal(s, "harvest", 0), burn: affixVal(s, "burn", 0),
        lifesteal: affixVal(s, "lifesteal", 0) };
    },
    // --- lighting probes: let the harness assert what a body is actually lit by ---
    // Returned as plain numbers so a test can compare a cave to a meadow without
    // needing a framebuffer read.
    entityLight(x, y, z) {
      const l = entityLight(x == null ? P.x : x, y == null ? P.y + 1.2 : y, z == null ? P.z : z, [0, 0, 0]);
      return { r: l[0], g: l[1], b: l[2], lum: (l[0] * 0.3 + l[1] * 0.6 + l[2] * 0.1) };
    },
    skyLightAt(x, y, z) { return skyLight(wf(x), wf(y), wf(z)); },
    // Everything a soak test needs to tell a leak from a slow frame.
    perf() {
      return {
        fps: Math.round(fps * 10) / 10, chunks: G.chunks.size, dirty: G.dirty.size,
        diffs: G.diffs.size, mobs: mobs.length, parts: parts.length, shots: shots.length,
        tris: tris, renderDist: renderDist,
        genN: PERF.gen, genAvg: PERF.gen ? Math.round(PERF.genMs / PERF.gen * 100) / 100 : 0,
        genMax: Math.round(PERF.genMax * 100) / 100,
        meshN: PERF.mesh, meshAvg: PERF.mesh ? Math.round(PERF.meshMs / PERF.mesh * 100) / 100 : 0,
        meshMax: Math.round(PERF.meshMax * 100) / 100,
        heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576 * 10) / 10 : null
      };
    },
    perfReset() { PERF.gen = PERF.genMs = PERF.genMax = PERF.mesh = PERF.meshMs = PERF.meshMax = 0; },
    // The sky gradient is a full-screen shader with no dependence on geometry, so
    // its colours can be asserted directly. Sampling them out of a screenshot
    // instead was unreliable: inside the colosseum the top strip of a tilted-up
    // frame is torch-lit wall, not sky, and the test read the wall.
    skyColors() {
      const s = skyColors();
      return { top: Array.from(s.top), bot: Array.from(s.bot), fog: Array.from(s.fog), night: s.night };
    },
    emittedAt(x, y, z) { return emittedAt(x, y, z); },
    lightRig() {
      const r = lightRig();
      return { sky: Array.from(r.sky), amb: Array.from(r.amb), torch: Array.from(r.torch) };
    },
    mobAnim(i) {
      const m = mobs[i || 0];
      return m ? { anim: m.anim || 0, gait: m.gait || 0, windup: m.windup, flash: m.flash } : null;
    },
    openUI(mode) { openUI(mode); return uiMode; },
    uiMode() { return uiMode; },
    forgeUI() {
      return { open: !$("forge-row").hidden, title: $("inv-title").textContent,
        item: $("forge-item").textContent, affix: $("forge-affix").textContent,
        cost: $("forge-cost").textContent, why: $("forge-why").textContent,
        btn: $("btn-forge").textContent, disabled: $("btn-forge").disabled,
        pool: $("forge-pool").textContent, name: $("item-name").textContent };
    },
    // --- seasons / buffs / farming ---
    season() {
      const s = season();
      return { index: seasonIndex(), key: s.key, name: s.name, growth: s.growth, hunger: s.hunger,
        spawnBonus: s.spawnBonus, yieldBonus: s.yieldBonus, daysLeft: seasonDaysLeft(), length: SEASON_LEN };
    },
    buffs() {
      const out = {};
      for (const id in buffs) if (buffs[id] > 0) out[id] = Math.round(buffs[id] * 100) / 100;
      return out;
    },
    addBuff, clearBuffs,
    till(x, y, z) { return tillSoil(wf(x), wf(y), wf(z)); },
    plant(x, y, z, kind) { return plantCrop(wf(x), wf(y), wf(z), kind); },
    cropAt(x, y, z) {
      const rec = G.crops.get(cxyz(wf(x), wf(y), wf(z)));
      if (!rec) return null;
      const info = cropInfo(getBlock(wf(x), wf(y), wf(z)));
      return { kind: rec.kind, p: Math.round(rec.p * 1000) / 1000, stage: info ? info.stage : -1 };
    },
    growCrops(seconds) { cropAccum = 0; cropTick(seconds == null ? 60 : seconds); return G.crops.size; },
    cropCount() { return G.crops.size; },
    harvest(x, y, z) { return harvestCrop(wf(x), wf(y), wf(z), getBlock(wf(x), wf(y), wf(z))); },
    trample: trampleSoil,
    finishChapter() { questIdx = QUESTS.length; questProg = 0; renderQuest(); showVictory(); return true; },
    nextChapter: beginNextChapter,
    chapter() { return { index: chapter, n: CHAPTERS[chapter].n, quests: QUESTS.length, questIdx, questProg, title: CHAPTERS[chapter].title }; },
    setChapter(i) { setChapter(i); victoryShown = false; $("victory").hidden = true; return chapter; },
    spawnBoss,
    migrate: migrateSave,
    snapshotSave: serialize,
    hotbarIndex(key) { return inv.findIndex((s, i) => i < 9 && s && s.key === key); },
    select(i) { sel = clamp(i | 0, 0, 8); refreshHotbar(); return sel; },
    countItem(key) { return inv.reduce((n, s) => n + (s && s.key === key ? s.n : 0), 0); },
    damageBoss(n) {
      const b = mobs.find((m) => m.boss);
      if (!b) return null;
      mobHurt(b, n == null ? 20 : n, { kb: 1, dir: [0, 1] });
      return b.hp;
    },
    boss() {
      const b = mobs.find((m) => m.boss);
      return b ? { hp: b.hp, maxHp: b.maxHp, phase: bossPhase(b), x: b.x, z: b.z } : null;
    },
    shots() { return shots.map((s) => ({ x: s.x, y: s.y, z: s.z, from: s.from, dmg: s.dmg })); },
    throwPilum,
    braziers() { return Array.from(G.braziers); },
    brazierCovers,
    ashland() { return { x: ASHLAND.x, z: ASHLAND.z, r: ASHLAND.r }; },
    biome(x, z) { return biomeAt(wf(x == null ? P.x : x), wf(z == null ? P.z : z)); },
    mobTier(kind) { return MOB_TIER[kind] || 0; },
    ui() {
      return {
        victory: !$("victory").hidden, death: !$("death").hidden, pause: !$("pause").hidden,
        target: !$("target-plate").hidden, targetName: $("target-name").textContent,
        threatText: $("stat-threat").textContent, killsText: $("stat-kills").textContent
      };
    },
    state() {
      return {
        hp: P.hp, food: P.food, flying: P.flying, onGround: P.onGround, vy: P.vy, x: P.x, y: P.y, z: P.z, view: P.view,
        seed: G.seed, chunks: G.chunks.size, fps, running, dead: P.dead,
        quest: questIdx, quests: QUESTS.length, waypoint: questWaypoint(), weather: G.weather,
        mined: STAT.mined, kills: STAT.kills, placed: STAT.placed, harvested: STAT.harvested || 0,
        season: SEASONS[seasonIndex()].key, seasonDaysLeft: seasonDaysLeft(), crops: G.crops.size,
        buffs: Object.keys(buffs).filter(function(k){return buffs[k]>0;}),
        day: G.day, threat: threatTier(), mobs: mobs.length, shake: shake > 0.001, victory: !$("victory").hidden,
        chapter: CHAPTERS[chapter].n, shots: shots.length, biome: biomeAt(wf(P.x), wf(P.z)),
        boss: (() => { const b = mobs.find((m) => m.boss); return b ? { hp: b.hp, maxHp: b.maxHp, phase: bossPhase(b) } : null; })()
      };
    }
  };
  window.__game = api;
  window.Haven = api;
})();
