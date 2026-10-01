// Scripted browser smoke for tools/headless.mjs eval/shot, not a real-touch acceptance test.
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const errors=[];
window.addEventListener('error',e=>errors.push(e.message));
window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
enterGame(); await wait(120);
if(tut.active) endTutorial('skipped');
softLock=true; overlay.style.display='none'; hud.style.display='block';
const query=new URLSearchParams(location.search);
const touch=query.get('touch')==='1';
if(touch){ initTouchUI(); document.getElementById('touchui').classList.add('on'); }
const rect=el=>{const r=el.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height};};
const checks={};
// Exercise existing help key entry and closing path.
document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyH',bubbles:true}));
checks.helpOpened=document.getElementById('fullhelp').style.display==='flex';
checks.guidePresent=document.querySelectorAll('.combat-steps > div').length===3;
document.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape',bubbles:true}));
checks.helpClosed=document.getElementById('fullhelp').style.display==='none';
// Actual touch listener path, with a synthetic joystick gesture and dodge-button touch.
if(touch){
  const stick=document.getElementById('stick');
  const sr=stick.getBoundingClientRect();
  const event=(el,type,id,x,y,end=false)=>{
    const t=new Touch({identifier:id,target:el,clientX:x,clientY:y,pageX:x,pageY:y});
    el.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches:end?[]:[t],targetTouches:end?[]:[t],changedTouches:[t]}));
  };
  event(stick,'touchstart',1,sr.x+sr.width/2,sr.y+sr.height/2);
  event(stick,'touchmove',1,sr.x+sr.width,sr.y+sr.height/2);
  const dir=sandStepDirection();
  checks.joystickDirection=touchState.active&&Math.abs(dir[0]-Math.cos(player.yaw))<.001&&Math.abs(dir[1]-Math.sin(player.yaw))<.001;
  document.getElementById('fullhelp').style.display='flex';
  const p0={x:player.x,z:player.z,cd:sandStepState.cd};
  const btn=document.getElementById('btnDodge'),br=btn.getBoundingClientRect();
  event(btn,'touchstart',2,br.x+br.width/2,br.y+br.height/2);
  event(btn,'touchend',2,br.x+br.width/2,br.y+br.height/2,true);
  checks.helpBlocksTouchDodge=player.x===p0.x&&player.z===p0.z&&sandStepState.cd===p0.cd;
  document.getElementById('fullhelp').style.display='none';
  let spot=null;
  for(let x=Math.floor(player.x)-10;x<=Math.floor(player.x)+10&&!spot;x++){
    for(let z=Math.floor(player.z)-10;z<=Math.floor(player.z)+10&&!spot;z++){
      const y=groundY(x,z);
      if(y>0&&aabbFits(x+.5,y,z+.5,PW,PH)&&sandStepLanding(x+.5,y,z+.5,1,0)&&getBlock(x,y,z)!==WATER&&getBlock(x,y,z)!==LAVA) spot={x:x+.5,y,z:z+.5};
    }
  }
  if(!spot) throw new Error('No suitable touch dodge fixture');
  Object.assign(player,spot,{yaw:0,onGround:true,flying:false}); riding=null; grappleTarget=null; sandStepState.cd=0;
  event(btn,'touchstart',2,br.x+br.width/2,br.y+br.height/2);
  event(btn,'touchend',2,br.x+br.width/2,br.y+br.height/2,true);
  checks.touchButtonMovesSideways=player.x>spot.x+.39&&Math.abs(player.z-spot.z)<.001&&sandStepState.cd>0;
  event(stick,'touchend',1,sr.x+sr.width,sr.y+sr.height/2,true);
  checks.joystickReleased=!touchState.active&&touchState.moveX===0&&touchState.moveY===0;
}
// Stable staged enemy used only to inspect the presentation of an existing counter window.
const sc={type:'scarab',def:MOB_DEFS.scarab,x:player.x,y:player.y,z:player.z-4,hp:10};
mobs.push(sc);
sandStepState.counterT=1.6; sandStepState.counterTarget=sc; sandStepState.counterHitT=0;
refreshRiposteCue();
checks.counterVisible=!document.getElementById('riposteCue').hidden;
sandStepState.counterT=0; sandStepState.counterTarget=null; mobs.splice(mobs.indexOf(sc),1);
refreshRiposteCue(); checks.counterExpires=document.getElementById('riposteCue').hidden;
if(Object.values(checks).some(v=>!v)||errors.length) throw new Error(JSON.stringify({checks,errors}));
if(query.get('view')==='help'){
  document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyH',bubbles:true}));
}else{
  // Freeze only gameplay updates for a reproducible screenshot. Rendering continues.
  mobs.push(sc); sc.def={...MOB_DEFS.scarab,hostile:false};
  sc.vx=sc.vy=sc.vz=sc.kbx=sc.kbz=0; sc.yaw=sc.tgtYaw=sc.animT=sc.t=sc.hurtT=sc.swingT=sc.burnT=0;
  sandStepState.counterT=1.6; sandStepState.counterTarget=sc;
  refreshSandStepButton(); updateStatsHUD(); refreshRiposteCue();
  const originalFrame=frame;
  frame=function(now){const prior=softLock; softLock=false; originalFrame(now); softLock=prior; refreshRiposteCue();};
}
await wait(120);
const card=document.querySelector('#fullhelp .fh-card'), cue=document.getElementById('riposteCue');
return {checks,errors,viewport:[innerWidth,innerHeight],guide:rect(card),counter:rect(cue),counterText:cue.textContent,stagedScreenshot:true};
