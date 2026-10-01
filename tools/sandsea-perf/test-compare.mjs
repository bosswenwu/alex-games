#!/usr/bin/env node
// Synthetic fixtures test comparator logic ONLY; no real-device performance claim.
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const dir=mkdtempSync(join(tmpdir(),"sandsea-device-compare-test-"));
const script=join(dirname(fileURLToPath(import.meta.url)),"compare-device.mjs");
const measurementClass="real browser/device page-side timing; not GPU utilization";
function series(revision,p95,overrides={}){
  return {schemaVersion:1,measurementClass,runs:[0,1,2].map((i)=>({schemaVersion:1,measurementClass,
    metadata:{label:"synthetic-test",scenario:"charge3",revision,seed:"424242",userAgent:"Fixture Browser",platform:"Fixture OS",
      renderer:"Fixture GPU",graphicsLevel:0,graphicsName:"低",renderDist:4,screen:{innerWidth:844,innerHeight:390,width:844,height:390,dpr:1}},
    stopReason:"duration",requestedSeconds:30,actualSeconds:30.1,rafFrames:1800,hiddenDuringRun:false,runtimeErrors:[],
    p95FrameMs:p95+i*0.1,longestSlowStreakMs:100,particlePeak:10,particleCapExceeded:false,
    graphicsNameEnd:"低",renderDistEnd:4,...overrides}))};
}
function check(name,candidate,expected,exit,flags=[]){
  const a=join(dir,"base.json"),b=join(dir,"candidate.json");
  writeFileSync(a,JSON.stringify(series("before",16.5)));writeFileSync(b,JSON.stringify(candidate));
  const run=spawnSync(process.execPath,[script,"--baseline",a,"--candidate",b,...flags],{encoding:"utf8"});
  assert.equal(run.status,exit,`${name} exit: ${run.stderr}`);assert.equal(JSON.parse(run.stdout).gate,expected,name);
  console.log(`${name}: ${expected} (exit ${exit})`);
}
try{
  check("within ceiling",series("after",17),"PASS_PROVISIONAL_REAL_DEVICE",0);
  check("p95 regression",series("after",20),"REVIEW_P95_REGRESSION",2);
  check("hidden page",series("after",17,{hiddenDuringRun:true}),"NOT_COMPARABLE",3);
  check("changed renderer",series("after",17,{metadata:{...series("after",17).runs[0].metadata,renderer:"Other GPU"}}),"NOT_COMPARABLE",3);
  check("sustained slow frames",series("after",17,{longestSlowStreakMs:5200}),"REVIEW_SUSTAINED_SLOW_FRAMES",2,["--require-30fps"]);
  check("dynamic particle cap",series("after",17,{particleCapExceeded:true}),"REVIEW_PARTICLE_CAP",2);
  console.log("6 synthetic comparator fixtures passed; no real-device samples were measured.");
}finally{rmSync(dir,{recursive:true,force:true});}
