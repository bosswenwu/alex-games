/*
 * Sandsea real-device passive monitor. Paste into DevTools Console on the running
 * game page, then call: await window.__sandseaPerf.start({seconds:30,label:"mobile-low"})
 * It does not change gameplay. Browser APIs cannot expose GPU utilization, GPU
 * temperature, or complete OS memory; collect those separately with OS tools.
 */
(()=>{
  const g=window.__game;
  if(!g) throw new Error("Open the running Sandsea game page first (window.__game missing)");
  const particleCount=()=>{try{if(typeof particles!=="undefined")return particles.length;}catch{}return null;};
  const particleCap=()=>{try{if(typeof partCap==="function")return partCap();}catch{}return null;};
  const renderer=()=>{try{const c=document.querySelector("canvas"),gl=c?.getContext("webgl2")||c?.getContext("webgl"),ext=gl?.getExtension("WEBGL_debug_renderer_info");return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl?.getParameter(gl.RENDERER)||"unknown";}catch{return "unknown";}};
  const percentile=(a,p)=>{if(!a.length)return null;const s=[...a].sort((x,y)=>x-y),i=(s.length-1)*p,l=Math.floor(i),h=Math.ceil(i);return +(s[l]+(s[h]-s[l])*(i-l)).toFixed(3);};
  let active=null,lastResult=null,history=[];
  const download=()=>{
    if(!lastResult)throw new Error("No completed sample; call start() first");
    const blob=new Blob([JSON.stringify(lastResult,null,2)+"\n"],{type:"application/json"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`sandsea-device-${Date.now()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),30000);
    return a.download;
  };
  const downloadAll=()=>{
    if(!history.length)throw new Error("No completed samples yet");
    const blob=new Blob([JSON.stringify({schemaVersion:1,measurementClass:"real browser/device page-side timing; not GPU utilization",runs:history},null,2)+"\n"],{type:"application/json"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`sandsea-device-series-${Date.now()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),30000);
    return a.download;
  };
  const start=({seconds=30,label="manual",scenario="natural encounter",revision="not-recorded"}={})=>{
    if(active)throw new Error("A sample is already running");
    if(!Number.isFinite(seconds)||seconds<1||seconds>600)throw new Error("seconds must be 1–600");
    const errors=[],frames=[],particles=[],particleCaps=[],engineFps=[],phases=[],heap=[],longTasks=[];
    let wasHidden=document.visibilityState!=="visible";
    const onVisibility=()=>{if(document.visibilityState!=="visible")wasHidden=true;};
    document.addEventListener("visibilitychange",onVisibility);
    const onError=e=>errors.push(String(e.message||e.error||"window error"));
    const onReject=e=>errors.push(String(e.reason||"unhandled rejection"));
    window.addEventListener("error",onError);window.addEventListener("unhandledrejection",onReject);
    const originalConsoleError=console.error;
    console.error=(...xs)=>{errors.push(xs.map(String).join(" "));originalConsoleError.apply(console,xs);};
    let observer=null,longTaskSupported=false;
    try{if("PerformanceObserver"in window&&PerformanceObserver.supportedEntryTypes?.includes("longtask")){observer=new PerformanceObserver(list=>{for(const e of list.getEntries())longTasks.push(+e.duration.toFixed(3));});observer.observe({type:"longtask"});longTaskSupported=true;}}catch{}
    const settings=g.settings||{},canvas=document.querySelector("canvas");
    const metadata={label,scenario,revision,seed:String(g.seed??"unknown"),startedAt:new Date().toISOString(),userAgent:navigator.userAgent,platform:navigator.platform,
      hardwareConcurrency:navigator.hardwareConcurrency??null,deviceMemoryGB:navigator.deviceMemory??null,
      screen:{width:screen.width,height:screen.height,dpr:devicePixelRatio,innerWidth,innerHeight},
      visibilityStart:document.visibilityState,renderer:renderer(),graphicsLevel:settings.gfx??null,graphicsName:settings.gfxName??null,
      renderDist:g.renderDist??null,gameFpsStart:g.fps??null,particleCap:particleCap(),canvas:{width:canvas?.width??null,height:canvas?.height??null}};
    const heapAtStart=performance.memory?.usedJSHeapSize??null;
    const started=performance.now();let prev=null,lastMetric=0,settled=false;
    const cleanup=()=>{window.removeEventListener("error",onError);window.removeEventListener("unhandledrejection",onReject);document.removeEventListener("visibilitychange",onVisibility);console.error=originalConsoleError;observer?.disconnect();active=null;};
    let resolvePromise;
    const promise=new Promise(resolve=>resolvePromise=resolve);
    const finish=reason=>{
      if(settled)return;settled=true;
      const sorted=[...frames].sort((a,b)=>a-b),mean=frames.length?frames.reduce((a,b)=>a+b,0)/frames.length:null;
      const phaseMax=k=>phases.length?Math.max(...phases.map(x=>x[k])):0;
      const heapMB=heap.length?+(heap[heap.length-1]/1048576).toFixed(2):null;
      let slowRun=0,longestSlowStreakMs=0;for(const ms of frames){if(ms>33.3){slowRun+=ms;longestSlowStreakMs=Math.max(longestSlowStreakMs,slowRun);}else slowRun=0;}
      const result={schemaVersion:1,measurementClass:"real browser/device page-side timing; not GPU utilization",metadata,
        endedAt:new Date().toISOString(),stopReason:reason,requestedSeconds:seconds,actualSeconds:+((performance.now()-started)/1000).toFixed(2),
        rafFrames:frames.length,p50FrameMs:percentile(sorted,.5),p95FrameMs:percentile(sorted,.95),meanFrameMs:mean?+mean.toFixed(3):null,
        maxFrameMs:frames.length?+Math.max(...frames).toFixed(3):null,fpsFromRaf:mean?+(1000/mean).toFixed(2):null,
        framesOver16_7Pct:frames.length?+(frames.filter(x=>x>16.7).length/frames.length*100).toFixed(2):null,
        framesOver33_3Pct:frames.length?+(frames.filter(x=>x>33.3).length/frames.length*100).toFixed(2):null,
        gameFpsMean:engineFps.length?+(engineFps.reduce((a,b)=>a+b,0)/engineFps.length).toFixed(2):null,
        particleStart:particles.length?particles[0]:null,particleP95:percentile(particles,.95),particlePeak:particles.length?Math.max(...particles):null,
        particleEnd:particles.length?particles[particles.length-1]:null,particleCap:particleCap(),
        particleCapStart:particleCaps.length?particleCaps[0]:null,
        particleCapExceeded:particleCaps.some((cap,i)=>cap!=null&&particles[i]>cap),
        maxScarabTelegraph:phaseMax("telegraph"),maxScarabLunge:phaseMax("lunge"),maxScarabRecover:phaseMax("recover"),
        longTaskSupported,longTaskCount:longTaskSupported?longTasks.length:null,longTaskMaxMs:longTaskSupported&&longTasks.length?Math.max(...longTasks):null,
        heapStartMB:heapAtStart===null?null:+(heapAtStart/1048576).toFixed(2),heapEndMB:heapMB,
        longestSlowStreakMs:+longestSlowStreakMs.toFixed(3),graphicsNameEnd:g.settings?.gfxName??null,renderDistEnd:g.renderDist??null,gameFpsEnd:g.fps??null,
        visibilityEnd:document.visibilityState,hiddenDuringRun:wasHidden||document.visibilityState!=="visible",runtimeErrors:errors};
      lastResult=result;history.push(result);cleanup();console.group("Sandsea device performance sample");console.table({label,scenario,renderer:result.metadata.renderer,gfx:result.metadata.graphicsName,
        p50FrameMs:result.p50FrameMs,p95FrameMs:result.p95FrameMs,fpsFromRaf:result.fpsFromRaf,gameFpsMean:result.gameFpsMean,
        longestSlowStreakMs:result.longestSlowStreakMs,particlePeak:result.particlePeak,particleCap:result.particleCap,longTaskCount:result.longTaskCount,errors:errors.length,hidden:result.hiddenDuringRun});
      console.log("Full JSON (also saved as window.__sandseaPerf.last)",result);console.groupEnd();resolvePromise(result);
    };
    active={finish};
    const tick=now=>{
      if(settled)return;if(prev!==null)frames.push(now-prev);prev=now;
      if(now-lastMetric>=250){lastMetric=now;const pc=particleCount();if(pc!==null){particles.push(pc);particleCaps.push(particleCap());}const f=Number(g.fps);if(Number.isFinite(f))engineFps.push(f);
        const ms=g.mobs||[];phases.push({telegraph:ms.filter(m=>m.type==="scarab"&&m.chargeState==="telegraph").length,
          lunge:ms.filter(m=>m.type==="scarab"&&m.chargeState==="lunge").length,recover:ms.filter(m=>m.type==="scarab"&&m.chargeState==="recover").length});
        const h=performance.memory?.usedJSHeapSize;if(Number.isFinite(h))heap.push(h);}
      if(now-started>=seconds*1000){finish("duration");return;}requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const timer=setTimeout(()=>finish("timeout-fallback"),(seconds+5)*1000);
    promise.finally(()=>clearTimeout(timer));
    console.info(`Sampling ${seconds}s. Keep this tab visible; perform the labelled scenario now. Call __sandseaPerf.download() after completion.`);
    return promise;
  };
  window.__sandseaPerf={start,stop:()=>active?.finish("manual-stop"),download,downloadAll,get history(){return history.slice();},get last(){return lastResult;}};
  console.info("Sandsea monitor ready. Run __sandseaPerf.start({seconds:30,label:'desktop-medium',scenario:'3 scarab charges',revision:'git-sha'}) three times; then __sandseaPerf.downloadAll() to export the series.");
})();
