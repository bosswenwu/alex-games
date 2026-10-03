// Injected by sandsea-perf-baseline.mjs through tools/headless.mjs eval.
const cfg=globalThis.__sandseaPerfConfig||{};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const errors=[];
window.addEventListener("error",e=>errors.push(String(e.message||e.error||"window error")));
window.addEventListener("unhandledrejection",e=>errors.push(String(e.reason||"unhandled rejection")));
const originalConsoleError=console.error;
console.error=(...args)=>{errors.push(args.map(String).join(" "));originalConsoleError.apply(console,args);};
const game=window.__game;
if(!game) throw new Error("window.__game is unavailable; runner did not reach the game page");
if(typeof enterGame==="function") enterGame(); else document.getElementById("startbtn")?.click();
await sleep(150);
if(typeof tut!=="undefined"&&tut.active&&typeof endTutorial==="function") endTutorial("skipped");
if(typeof game.setGfx==="function") game.setGfx(cfg.gfx??1);
if(typeof game.mobs?.splice==="function") game.mobs.splice(0,game.mobs.length);
// Isolated browser only: keep the game loop alive for full 30s and exclude
// uncontrolled natural spawns. This is intentionally NOT a natural encounter.
if(typeof hp!=="undefined") hp=999;
if(typeof spawnMob==="function") spawnMob=()=>false;
// Software rendering would otherwise step through several graphics presets
// mid-run, invalidating a fixed-gfx comparison. The real-device monitor does
// not suppress this production behavior and records its effect instead.
let autoScaleSuppressed=false;
if(typeof autoScalePerf==="function"){autoScalePerf=()=>{};autoScaleSuppressed=true;}
const p=game.player;
const desiredX=Math.floor(p.x)+20.5, desiredZ=Math.floor(p.z)+0.5;
let ground=game.groundY(Math.floor(desiredX),Math.floor(desiredZ)), px=desiredX,pz=desiredZ;
if(ground<0){
  let found=null;
  for(let r=1;r<=24&&!found;r++) for(let dx=-r;dx<=r&&!found;dx++) for(let dz=-r;dz<=r&&!found;dz++){
    if(Math.max(Math.abs(dx),Math.abs(dz))!==r) continue;
    const x=Math.floor(desiredX)+dx,z=Math.floor(desiredZ)+dz,y=game.groundY(x,z);
    if(y>0) found={x:x+0.5,z:z+0.5,y};
  }
  if(!found) throw new Error("No generated ground cell found near the deterministic test area");
  px=found.x;pz=found.z;ground=found.y;
}
game.teleport(px,ground,pz);
await sleep(450);
p.yaw=0;p.pitch=0.03;
if(typeof softLock!=="undefined") softLock=true;
if(typeof hud!=="undefined") hud.style.display="block";
if(typeof overlay!=="undefined") overlay.style.display="none";
const scenario=cfg.scenario||"idle", count=cfg.count|0;
let forcedVisibility=false;
const syntheticMobs=new Set();
if(scenario!=="idle"){
  if(typeof MOB_DEFS==="undefined"||!MOB_DEFS.scarab) throw new Error("MOB_DEFS.scarab is unavailable");
  if(typeof mobs==="undefined") throw new Error("mobs collection is unavailable");
  const spots=[];
  for(let dz=4;dz<=10;dz++) for(let dx=-10;dx<=10;dx++){
    const x=Math.floor(px)+dx,z=Math.floor(pz)+dz,y=game.groundY(x,z);
    if(y>0) spots.push({x:x+0.5,y,z:z+0.5,dx,dz});
  }
  spots.sort((a,b)=>Math.abs(a.dx)-Math.abs(b.dx)||a.dz-b.dz);
  if(spots.length<count) throw new Error(`Only ${spots.length} safe scarab spawn cells available; requested ${count}`);
  const chosen=[];
  for(const s of spots){
    if(chosen.every(q=>Math.hypot(q.x-s.x,q.z-s.z)>=1.45)) chosen.push(s);
    if(chosen.length===count) break;
  }
  if(chosen.length<count) throw new Error(`Could not find ${count} separated scarab spawn cells`);
  for(const s of chosen){
    const yaw=Math.atan2(px-s.x,-(pz-s.z));
    const testMob={type:"scarab",def:MOB_DEFS.scarab,x:s.x,y:s.y,z:s.z,vx:0,vy:0,vz:0,kbx:0,kbz:0,
      yaw,tgtYaw:yaw,hp:MOB_DEFS.scarab.hp,maxHp:MOB_DEFS.scarab.hp,hurtT:0,animT:0,t:0,atkCd:0,burnT:0,
      swingT:0,groanT:0,fleeT:0,onGround:true,pause:false,burning:false,held:null,
      chargeCd:0,chargeState:"idle",chargeWarnT:0,chargeRecoverT:0,chargeFxT:0,chargeHit:false,chargeYaw:yaw};
    syntheticMobs.add(testMob);mobs.push(testMob);
  }
  // Hold the scene in a repeatable, clear-line-of-sight stress condition.
  // This deliberately bypasses LOS variability; it is not a natural-AI test.
  if(typeof mobCanSeePlayer==="function"){mobCanSeePlayer=()=>true;forcedVisibility=true;}
}
const canvas=document.querySelector("canvas");
let gl=null,renderer="unknown";
try{
  gl=canvas?.getContext("webgl2")||canvas?.getContext("webgl");
  const ext=gl?.getExtension("WEBGL_debug_renderer_info");
  if(ext) renderer=gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
  else if(gl) renderer=gl.getParameter(gl.RENDERER);
}catch{}
const cell={scenario,count,size:cfg.size,gfxLevel:game.settings?.gfx??cfg.gfx,gfxName:game.settings?.gfxName??"unknown",seed:game.seed,
  innerWidth,innerHeight,dpr:devicePixelRatio,renderer,forcedVisibility,autoScaleSuppressed,visibilityState:document.visibilityState};
const getParticleCount=()=>{try{if(typeof particles!=="undefined")return particles.length;}catch{}return null;};
const getParticleCap=()=>{try{if(typeof partCap==="function")return partCap();}catch{}return null;};
const getPerfDowngrades=()=>{try{if(typeof perfDowngrades!=="undefined")return perfDowngrades;}catch{}return null;};
let unexpectedSpawnsRemoved=0;
const removeAmbient=()=>{for(let i=game.mobs.length-1;i>=0;i--)if(!syntheticMobs.has(game.mobs[i])){game.mobs.splice(i,1);unexpectedSpawnsRemoved++;}};
await new Promise(resolve=>{const until=performance.now()+(cfg.warmupSeconds||0)*1000;const wait=()=>{removeAmbient();performance.now()>=until?resolve():requestAnimationFrame(wait);};requestAnimationFrame(wait);});
const longTasks=[];
let observer=null,longTaskSupported=false;
try{if("PerformanceObserver"in window&&PerformanceObserver.supportedEntryTypes?.includes("longtask")){observer=new PerformanceObserver(list=>{for(const e of list.getEntries())longTasks.push(+e.duration.toFixed(3));});observer.observe({type:"longtask"});longTaskSupported=true;}}catch{}
const frameDeltas=[],particleSamples=[],engineFpsSamples=[],phaseSamples=[],heapSamples=[];
const particleStart=getParticleCount();
let last=null,lastMetric=0;
const measureStart=performance.now(),durationMs=(cfg.durationSeconds||30)*1000;
await new Promise(resolve=>{
  const tick=now=>{
    removeAmbient();
    if(last!==null) frameDeltas.push(now-last);
    last=now;
    if(now-lastMetric>=250){
      lastMetric=now;
      const pc=getParticleCount();if(pc!==null)particleSamples.push(pc);
      const f=Number(game.fps);if(Number.isFinite(f))engineFpsSamples.push(f);
      const current=game.mobs||[];
      phaseSamples.push({
        telegraph:current.filter(m=>m.type==="scarab"&&m.chargeState==="telegraph").length,
        lunge:current.filter(m=>m.type==="scarab"&&m.chargeState==="lunge").length,
        recover:current.filter(m=>m.type==="scarab"&&m.chargeState==="recover").length
      });
      const used=performance.memory?.usedJSHeapSize;if(Number.isFinite(used))heapSamples.push(used);
    }
    if(now-measureStart>=durationMs){resolve();return;}
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
observer?.disconnect();
console.error=originalConsoleError;
const sorted=[...frameDeltas].sort((a,b)=>a-b);
const quantile=q=>{if(!sorted.length)return null;const x=(sorted.length-1)*q,lo=Math.floor(x),hi=Math.ceil(x);return +(sorted[lo]+(sorted[hi]-sorted[lo])*(x-lo)).toFixed(3);};
const mean=xs=>xs.length?+(xs.reduce((a,b)=>a+b,0)/xs.length).toFixed(3):null;
const max=xs=>xs.length?+Math.max(...xs).toFixed(3):null;
const quantileValues=(xs,q)=>{if(!xs.length)return null;const s=[...xs].sort((a,b)=>a-b),x=(s.length-1)*q,lo=Math.floor(x),hi=Math.ceil(x);return +(s[lo]+(s[hi]-s[lo])*(x-lo)).toFixed(3);};
const phaseMax=key=>phaseSamples.length?Math.max(...phaseSamples.map(x=>x[key])):0;
const memMB=xs=>xs.length?+(xs[xs.length-1]/1048576).toFixed(2):null;
let slowRun=0,longestSlowStreakMs=0;for(const ms of frameDeltas){if(ms>33.3){slowRun+=ms;longestSlowStreakMs=Math.max(longestSlowStreakMs,slowRun);}else slowRun=0;}
const after=game.settings||{};
return {
  ...cell,graphicsNameFinal:after.gfxName??null,renderDist:game.renderDist,
  warmupSeconds:cfg.warmupSeconds,durationSeconds:cfg.durationSeconds,rafFrames:frameDeltas.length,
  p50FrameMs:quantile(0.50),p95FrameMs:quantile(0.95),meanFrameMs:mean(frameDeltas),maxFrameMs:max(frameDeltas),
  fpsFromRaf:mean(frameDeltas)?+(1000/mean(frameDeltas)).toFixed(2):null,
  framesOver16_7Pct:frameDeltas.length?+(frameDeltas.filter(x=>x>16.7).length/frameDeltas.length*100).toFixed(2):null,
  framesOver33_3Pct:frameDeltas.length?+(frameDeltas.filter(x=>x>33.3).length/frameDeltas.length*100).toFixed(2):null,
  longestSlowStreakMs:+longestSlowStreakMs.toFixed(3),
  engineFpsMean:mean(engineFpsSamples),engineFpsMin:engineFpsSamples.length?Math.min(...engineFpsSamples):null,
  particleStart,particleP95:quantileValues(particleSamples,.95),particlePeak:particleSamples.length?Math.max(...particleSamples):null,
  particleEnd:particleSamples.length?particleSamples[particleSamples.length-1]:particleStart,particleCap:getParticleCap(),
  maxTelegraph:phaseMax("telegraph"),maxLunge:phaseMax("lunge"),maxRecover:phaseMax("recover"),
  longTaskSupported,longTaskCount:longTaskSupported?longTasks.length:null,longTaskMaxMs:longTaskSupported?max(longTasks):null,
  heapStartMB:heapSamples.length?+(heapSamples[0]/1048576).toFixed(2):null,heapEndMB:memMB(heapSamples),
  autoScaleStart:cell.gfxName,autoScaleEnd:after.gfxName??null,autoScaleCount:getPerfDowngrades(),
  runtimeErrors:errors,visibilityStateEnd:document.visibilityState,hpEnd:game.hp,mobCountEnd:game.mobs?.length??null,
  unexpectedSpawnsRemoved
};
