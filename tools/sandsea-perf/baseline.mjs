#!/usr/bin/env node
/**
 * Sandsea reproducible headless performance sampler (Node >= 22, no npm deps).
 * Runs the repo's existing tools/headless.mjs against a clean Chromium profile.
 * IMPORTANT: headless.mjs forces SwiftShader; this is a regression signal, not
 * a real-GPU/device performance result. Use sandsea-device-monitor.js on-device.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir, platform, arch } from "node:os";
import { dirname, extname, join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const sleep = ms => new Promise(r => setTimeout(r, ms));

function parseArgs(argv) {
  const out = { repo: process.cwd(), seed: "424242", gfx: 1, scenario: "idle", matrix: false,
    warmup: 10, duration: 30, repeat: 3, size: "1280x720", out: null, compare: null,
    device: "headless-automation", maxRegression: 10 };
  const valued = new Set(["repo","seed","gfx","scenario","warmup","duration","repeat","size","out","compare","device","max-p95-regression"]);
  for (let i=0;i<argv.length;i++) {
    const a=argv[i];
    if (a==="--help" || a==="-h") { out.help=true; continue; }
    if (a==="--matrix") { out.matrix=true; continue; }
    if (!a.startsWith("--") || !valued.has(a.slice(2))) throw new Error(`Unknown option: ${a}`);
    const k=a.slice(2), v=argv[++i]; if (v==null || v.startsWith("--")) throw new Error(`Missing value for ${a}`);
    const key=k==="max-p95-regression"?"maxRegression":k; out[key]=["gfx","warmup","duration","repeat","maxRegression"].includes(key)?Number(v):v;
  }
  return out;
}
function usage() {
  return `Usage:
  node sandsea-perf-baseline.mjs --repo /path/to/alex-games --scenario charge3 --gfx 1
  node sandsea-perf-baseline.mjs --repo /path/to/alex-games --matrix --warmup 10 --duration 30 --repeat 3

Options:
  --repo PATH               Repository checkout containing tools/headless.mjs (default: cwd)
  --scenario idle|charge1|charge3|charge6   One controlled scenario (default: idle)
  --matrix                  Run idle/charge1/charge3/charge6 at graphics 0/1/2
  --gfx 0|1|2|3             Graphics level for one scenario (Low/Mid/High/Extreme)
  --seed N                  Deterministic world seed (default: 424242)
  --warmup SEC              Warmup before measuring (default: 10)
  --duration SEC            RAF sample duration (default: 30)
  --repeat N                Fresh-browser repeats per cell (default: 3)
  --size WxH                Viewport (default: 1280x720)
  --device LABEL            Human-readable device label in report (default: headless-automation)
  --out FILE.json           Output JSON; a sibling CSV is also written
  --compare FILE.json       Compare one matching cell with a prior JSON baseline
  --max-p95-regression PCT  Proposed p95 regression ceiling (default: 10)

Controlled charge scenarios insert 1/3/6 scarab entities into an open seeded scene
and force visibility to exercise the real update/render/particle path. They do not
measure natural spawn logic, real-device GPU utilization, temperature, or touch feel.`;
}
function percentile(xs,p) {
  if (!xs.length) return null;
  const s=[...xs].sort((a,b)=>a-b), x=(s.length-1)*p, lo=Math.floor(x), hi=Math.ceil(x);
  return +(s[lo]+(s[hi]-s[lo])*(x-lo)).toFixed(3);
}
function median(xs) { return percentile(xs,0.5); }
function csvEscape(v) { const s=String(v??""); return /[",\n]/.test(s)?`"${s.replaceAll('"','""')}"`:s; }
function writeCsv(path,runs) {
  const cols=["scenario","gfxLevel","gfxName","repeat","seed","renderer","rafFrames","p50FrameMs","p95FrameMs","meanFrameMs","fpsFromRaf","engineFpsMean","framesOver16_7Pct","framesOver33_3Pct","longestSlowStreakMs","particleStart","particleP95","particlePeak","particleEnd","particleCap","maxTelegraph","maxLunge","maxRecover","longTaskCount","longTaskMaxMs","heapStartMB","heapEndMB","autoScaleStart","autoScaleEnd","runtimeErrors"];
  const lines=[cols.join(","),...runs.map(r=>cols.map(c=>csvEscape(r[c])).join(","))];
  writeFileSync(path,lines.join("\n")+"\n");
}
function gitValue(repo,args) { try { return execFileSync("git",args,{cwd:repo,encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim(); } catch { return null; } }

const opt=parseArgs(process.argv.slice(2));
if(opt.help){ console.log(usage()); process.exit(0); }
if(!Number.isInteger(opt.gfx)||opt.gfx<0||opt.gfx>3) throw new Error("--gfx must be 0, 1, 2, or 3");
if(!Number.isFinite(opt.warmup)||opt.warmup<0||opt.warmup>120) throw new Error("--warmup must be 0–120 seconds");
if(!Number.isFinite(opt.duration)||opt.duration<1||opt.duration>600) throw new Error("--duration must be 1–600 seconds");
if(!Number.isInteger(opt.repeat)||opt.repeat<1||opt.repeat>20) throw new Error("--repeat must be 1–20");
if(!Number.isFinite(opt.maxRegression)||opt.maxRegression<0||opt.maxRegression>100) throw new Error("--max-p95-regression must be 0–100 percent");
if(!/^\d+x\d+$/.test(opt.size)) throw new Error("--size must be WxH, e.g. 1280x720");
const repo=resolve(opt.repo), runner=join(repo,"tools","headless.mjs");
try { readFileSync(runner); } catch { throw new Error(`Cannot read ${runner}; pass --repo pointing at alex-games`); }
const pageTemplate=readFileSync(join(HERE,"sandsea-perf-page.js"),"utf8");
const scenarios=opt.matrix?["idle","charge1","charge3","charge6"]:[opt.scenario];
const graphics=opt.matrix?[0,1,2]:[opt.gfx];
const allowed=new Set(["idle","charge1","charge3","charge6"]);
if(scenarios.some(s=>!allowed.has(s))) throw new Error("--scenario must be idle, charge1, charge3, or charge6");
const countFor={idle:0,charge1:1,charge3:3,charge6:6};
const temp=mkdtempSync(join(tmpdir(),"sandsea-perf-"));
const runs=[];
try {
  for (const scenario of scenarios) for (const gfx of graphics) for (let repeat=1;repeat<=opt.repeat;repeat++) {
    const cfg={seed:String(opt.seed),gfx,scenario,count:countFor[scenario],warmupSeconds:opt.warmup,durationSeconds:opt.duration,size:opt.size,repeat};
    const pageScript=join(temp,`page-${scenario}-${gfx}-${repeat}.js`);
    writeFileSync(pageScript,`globalThis.__sandseaPerfConfig=${JSON.stringify(cfg)};\n${pageTemplate}`);
    const page=`games/minecraft/?seed=${encodeURIComponent(opt.seed)}`;
    const timeout=Math.max(180,opt.warmup+opt.duration+60);
    const cmd=spawnSync(process.execPath,[runner,"eval",page,pageScript,"--size",opt.size,"--timeout",String(timeout)],{cwd:repo,encoding:"utf8",timeout:(timeout+60)*1000,maxBuffer:16*1024*1024});
    if(cmd.error) throw cmd.error;
    if(cmd.status!==0) throw new Error(`headless runner failed (${cmd.status}) for ${scenario}/gfx${gfx}/repeat${repeat}:\n${cmd.stderr||cmd.stdout}`);
    let raw=cmd.stdout.trim(); const jsonAt=raw.indexOf("{");
    if(jsonAt<0) throw new Error(`Could not parse runner JSON for ${scenario}/gfx${gfx}:\n${raw.slice(-1500)}`);
    const result=JSON.parse(raw.slice(jsonAt));
    runs.push({...result,scenario,gfxLevel:gfx,repeat,seed:String(opt.seed),deviceLabel:opt.device});
    console.error(`Finished ${scenario} · gfx ${gfx} · repeat ${repeat}/${opt.repeat} · p95 ${result.p95FrameMs} ms · particle peak ${result.particlePeak}`);
    await sleep(150);
  }
} finally { rmSync(temp,{recursive:true,force:true}); }

const groups=new Map();
for(const r of runs){ const k=`${r.scenario}|${r.gfxLevel}`; if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r); }
const summary=[...groups.entries()].map(([key,rs])=>({
  scenario:rs[0].scenario,gfxLevel:rs[0].gfxLevel,gfxName:rs[0].gfxName,
  repeats:rs.length,medianP50FrameMs:median(rs.map(r=>r.p50FrameMs)),medianP95FrameMs:median(rs.map(r=>r.p95FrameMs)),
  medianFpsFromRaf:median(rs.map(r=>r.fpsFromRaf)),maxParticlePeak:Math.max(...rs.map(r=>r.particlePeak??0)),
  medianParticleP95:median(rs.map(r=>r.particleP95)),medianParticleEnd:median(rs.map(r=>r.particleEnd)),
  particleCap:rs[0].particleCap,maxLongTaskMs:Math.max(...rs.map(r=>r.longTaskMaxMs??0)),
  maxSlowStreakMs:Math.max(...rs.map(r=>r.longestSlowStreakMs??0)),
  autoScaleChanged:rs.some(r=>r.autoScaleStart!==r.autoScaleEnd)
}));
const report={schemaVersion:1,generatedAt:new Date().toISOString(),repo,commit:gitValue(repo,["rev-parse","HEAD"]),baseCommit:gitValue(repo,["rev-parse","origin/main"]),
  device:{label:opt.device,hostPlatform:platform(),hostArch:arch(),node:process.version,measurementClass:"headless + SwiftShader; not real hardware"},
  method:{runner:"tools/headless.mjs eval",seed:String(opt.seed),size:opt.size,warmupSeconds:opt.warmup,durationSeconds:opt.duration,repeatsPerCell:opt.repeat,
    scenarios,graphicsLevels:graphics,scenarioNote:"controlled synthetic scarabs force line-of-sight, raise HP, disable natural spawning, and suppress auto graphics downgrade ONLY inside an isolated test page to hold fixed load. Game AI/update/render/particle paths run, but natural encounters, auto-scale efficacy, and real GPU utilization are NOT measured"},
  summary,runs};
if(opt.compare){
  const baseline=JSON.parse(readFileSync(resolve(opt.compare),"utf8"));
  if(opt.matrix||summary.length!==1) throw new Error("--compare requires one scenario/gfx cell; repeat it at least 3 times");
  const cur=summary[0], ref=(baseline.summary||[]).find(s=>s.scenario===cur.scenario&&s.gfxLevel===cur.gfxLevel);
  const method=baseline.method||{};
  const refRuns=(baseline.runs||[]).filter(r=>r.scenario===cur.scenario&&r.gfxLevel===cur.gfxLevel);
  const cellRuns=runs.filter(r=>r.scenario===cur.scenario&&r.gfxLevel===cur.gfxLevel);
  const allRuns=[...cellRuns,...refRuns],gpu=allRuns[0]?.renderer,dpr=allRuns[0]?.dpr;
  const envMatch=!!ref&&String(method.seed)===String(opt.seed)&&method.size===opt.size&&method.warmupSeconds===opt.warmup&&
    method.durationSeconds===opt.duration&&method.repeatsPerCell===opt.repeat&&baseline.device?.label===opt.device&&
    baseline.device?.hostPlatform===platform()&&baseline.device?.hostArch===arch()&&ref.gfxName===cur.gfxName&&
    refRuns.length===opt.repeat&&allRuns.every(r=>r.renderer===gpu&&r.dpr===dpr&&r.size===opt.size&&r.gfxName===cur.gfxName);
  const baseP95=ref?.medianP95FrameMs??null,curP95=cur.medianP95FrameMs;
  const delta=baseP95>0&&curP95!=null?+((curP95-baseP95)/baseP95*100).toFixed(2):null;
  const protocolOk=opt.warmup>=10&&opt.duration>=30&&opt.repeat>=3&&method.warmupSeconds>=10&&method.durationSeconds>=30&&method.repeatsPerCell>=3;
  const runtimeOk=allRuns.every(r=>(r.runtimeErrors||[]).length===0&&r.visibilityState==="visible"&&r.visibilityStateEnd==="visible"&&
    r.rafFrames>=30&&r.hpEnd>0&&r.mobCountEnd===({idle:0,charge1:1,charge3:3,charge6:6}[cur.scenario]));
  const stableSettings=allRuns.every(r=>r.autoScaleSuppressed===true&&r.gfxName===r.graphicsNameFinal&&r.autoScaleCount===0);
  const particleOk=allRuns.every(r=>r.particleCap!=null&&r.particlePeak!=null&&r.particlePeak<=r.particleCap);
  const gate=!envMatch||!protocolOk||delta===null||!stableSettings?"NOT_COMPARABLE":!runtimeOk?"FAIL_RUNTIME":!particleOk?"FAIL_PARTICLE_CAP":delta<=opt.maxRegression?"HEADLESS_WITHIN_P95_CEILING":"REVIEW_REGRESSION";
  report.comparison={baseline:resolve(opt.compare),matched:!!ref,environmentComparable:envMatch,protocolMeetsMinimum:protocolOk,
    baselineMedianP95Ms:baseP95,currentMedianP95Ms:curP95,regressionPercent:delta,ceilingPercent:opt.maxRegression,
    runtimeSampleValid:runtimeOk,stableSettings,particleCapRespected:particleOk,deviceAcceptance:"NOT_ESTABLISHED_BY_HEADLESS_SWIFTSHADER",gate};
}
let out=opt.out?resolve(opt.out):resolve(`sandsea-perf-${new Date().toISOString().replaceAll(":","-")}.json`);
if(extname(out).toLowerCase()!==".json") out += ".json";
mkdirSync(dirname(out),{recursive:true});
writeFileSync(out,JSON.stringify(report,null,2)+"\n");
const csv=out.slice(0,-5)+".csv";writeCsv(csv,runs);
console.log(JSON.stringify({json:out,csv,commit:report.commit,summary:report.summary,comparison:report.comparison??null},null,2));
