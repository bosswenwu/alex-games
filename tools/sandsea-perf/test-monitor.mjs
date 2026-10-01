#!/usr/bin/env node
// Deterministic browser-shim tests for device-monitor.js. These are NOT real-GPU measurements.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const source=readFileSync(join(dirname(fileURLToPath(import.meta.url)),"device-monitor.js"),"utf8");
async function runSample(pattern,{hide=false}={}) {
  let now=0,hidden=false,events=new Map();
  const queue=[];
  const doc={visibilityState:"visible",querySelector:()=>({width:844,height:390,getContext:()=>null}),
    addEventListener:(type,fn)=>events.set(type,fn),removeEventListener:(type)=>events.delete(type)};
  const silent={error(){},group(){},table(){},log(){},groupEnd(){},info(){}};
  const game={seed:"424242",fps:60,mobs:[],settings:{gfx:0,gfxName:"低"},renderDist:4};
  const win={__game:game,addEventListener(){},removeEventListener(){}};
  const ctx={window:win,document:doc,console:silent,performance:{now:()=>now},
    navigator:{userAgent:"fixture",platform:"test"},screen:{width:844,height:390},
    devicePixelRatio:1,innerWidth:844,innerHeight:390,particles:[],partCap:()=>90,
    requestAnimationFrame:fn=>queue.push(fn),setTimeout,clearTimeout,Date,Math};
  runInNewContext(source,ctx,{filename:"device-monitor.js"});
  const pending=win.__sandseaPerf.start({seconds:1,label:"fixture",scenario:"unit",revision:"fixture-sha"});
  let i=0;
  while(queue.length&&now<1000&&i<200) {
    const next=queue.shift();
    now+=pattern[i++%pattern.length];
    if(hide&&i===3){doc.visibilityState="hidden";events.get("visibilitychange")?.();
      doc.visibilityState="visible";events.get("visibilitychange")?.();}
    next(now);
  }
  assert.ok(now>=1000,"sample should finish in simulated time");
  const result=await pending;
  assert.equal(win.__sandseaPerf.last,result);
  assert.equal(win.__sandseaPerf.history.length,1);
  assert.equal(result.stopReason,"duration");
  assert.equal(result.particleCapExceeded,false);
  return result;
}

const alternating=await runSample([16,40]);
assert.equal(alternating.longestSlowStreakMs,40,"separated slow frames must not be treated as consecutive");
assert.equal(alternating.p95FrameMs,40,"percentiles must still use sorted samples");
const consecutive=await runSample([16,40,45,16]);
assert.equal(consecutive.longestSlowStreakMs,85,"adjacent slow intervals must be accumulated in chronological order");
const hidden=await runSample([16,40],{hide:true});
assert.equal(hidden.hiddenDuringRun,true,"a temporarily hidden page cannot yield a valid device sample");
console.log("3 deterministic device-monitor cases passed (alternating, consecutive, hidden); no real GPU was measured.");
