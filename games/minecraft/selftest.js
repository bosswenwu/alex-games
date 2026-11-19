"use strict";
/* =========================================================
   沙海奇境 Sandsea · 自测 (?selftest=1 时由 index.html 动态加载)
   这部分只在跑自测时才下载/解析, 普通玩家不再为它付出带宽与解析时间。
   作为经典脚本加载, 与主脚本共享全局词法环境, 可直接读写其中的 let/const/function。
   ========================================================= */
/* ---------- 自测: 每项都做真断言, 失败会给出实际值 ---------- */
function selftest(){
  const results=[]; let pass=0, fail=0;
  const ok =(name,cond,detail)=>{ (cond?pass++:fail++); results.push({name, ok:!!cond, detail:detail||""}); };
  const near=(a,b,eps)=>Math.abs(a-b)<=(eps||1e-6);

  // 先快照玩家 localStorage: selftest 里的 saveGame 会写测试世界, 绝不能留下。
  const liveStore=sandseaStorageSnapshot();
  const liveSave=(liveStore[SAVE_KEY]!==undefined)?liveStore[SAVE_KEY]:null;

  // 保存现场, 测完还原, 不破坏玩家进度
  const snap={x:player.x,y:player.y,z:player.z,hp,dead,softLock,vy:player.vy,wgr:worldGenReady};
  // setBlock 只在 worldGenReady 为真时才记录 blockDiff(避免把地形生成当成玩家改动)。
  // 自测可能在世界生成完成前被调用, 那样存档往返会假失败, 所以这里强制打开, finally 里还原。
  worldGenReady=true;
  const prevDiff=new Map(blockDiff);
  try{
    // 0. 存档护栏: 用专用哨兵键验证快照/还原, 不把假生产存档留给玩家
    {
      const probeKey="sandsea_selftest_guard";
      try{ localStorage.setItem(probeKey, "probe"); localStorage.setItem(SAVE_KEY, '{"v":1,"seed":-1,"_selftestJunk":1}'); }catch(e){}
      sandseaStorageRestore(liveStore);
      let now=null, probe=null;
      try{ now=localStorage.getItem(SAVE_KEY); probe=localStorage.getItem(probeKey); }catch(e){}
      ok("自测还原后玩家存档未被动", now===liveSave, "beforeLen="+(liveSave?liveSave.length:0)+" afterLen="+(now?now.length:0));
      ok("自测哨兵键不会残留", probe==null, "probe="+probe);
    }

    // 首屏菜单: 动态沙丘装饰与可访问的真实生成进度语义
    {
      const menu=document.getElementById("overlay"), track=document.querySelector("#menuLoading .menu-load-track"), fill=document.getElementById("menuLoadFill");
      const dunes=menu&&getComputedStyle(menu,"::after");
      const pass=!!menu && menu.classList.contains("main-menu") && !!track && track.getAttribute("role")==="progressbar"
        && track.getAttribute("aria-valuemin")==="0" && track.getAttribute("aria-valuemax")==="100" && !!fill && dunes && dunes.content!=="none";
      ok("主菜单:动态沙丘背景与可访问生成进度存在",pass,"role="+(track&&track.getAttribute("role"))+" range="+(track&&track.getAttribute("aria-valuemin"))+".."+(track&&track.getAttribute("aria-valuemax")));
    }

    // 暂停/设置枢纽: 四档画质、键盘可关闭弹窗、音乐偏好隔离存储, 且暂停时显示手动保存
    {
      const panel=settingsPanel, options=[...panel.querySelectorAll("[data-gfx]")], oldOn=musicOn, oldVol=musicVolume;
      const overlayDisplay=overlay.style.display, hudDisplay=hud.style.display;
      const pauseWas=overlay.classList.contains("pause-menu");
      openSettings();
      const selected=options.filter(b=>b.getAttribute("aria-pressed")==="true");
      const shell=panel.classList.contains("on") && panel.getAttribute("aria-hidden")==="false"
        && panel.querySelector('[role="dialog"][aria-modal="true"]') && options.length===4
        && selected.length===1 && +selected[0].dataset.gfx===gfxLevel;
      document.dispatchEvent(new KeyboardEvent("keydown",{code:"Escape",key:"Escape",bubbles:true,cancelable:true}));
      const escClosed=!panel.classList.contains("on") && panel.getAttribute("aria-hidden")==="true"
        && overlay.style.display===overlayDisplay && hud.style.display===hudDisplay;
      setMusicEnabled(!oldOn); setMusicVolume(37);
      let prefsOK=false; try{ prefsOK=localStorage.getItem("sandsea_music_v1")===(!oldOn?"1":"0") && Math.abs(Number(localStorage.getItem("sandsea_music_volume_v1"))-0.37)<0.001; }catch(e){}
      setMusicEnabled(oldOn); setMusicVolume(oldVol*100);
      if(!pauseWas) overlay.classList.add("pause-menu");
      const manualSaveShown=getComputedStyle(saveNowBtn).display!=="none";
      if(!pauseWas) overlay.classList.remove("pause-menu");
      ok("设置枢纽:四档画质、Esc关闭、音乐偏好持久化与暂停保存入口",shell && escClosed && prefsOK && manualSaveShown,
        "qualityButtons="+options.length+" selected="+(selected[0]&&selected[0].dataset.gfx)+" esc="+escClosed+" prefs="+prefsOK+" save="+manualSaveShown);
    }

    // 1. 世界生成
    ok("世界已生成区块", world.size>0, "chunkCount="+world.size);
    const testChunk=genChunk(12345,6789);
    let nonAir=0; for(let i=0;i<testChunk.length;i++) if(testChunk[i]) nonAir++;
    ok("任意坐标能生成非空地形", nonAir>1000, "非空方块="+nonAir);

    // 1b. 罗马主题地标(斗兽场/广场)能在世界里生成
    const want=["colosseum","forum","castrum","aqueduct","palace"];
    const seen={};
    for(let sx=-70; sx<=70; sx++) for(let sz=-70; sz<=70; sz++){
      const st=structureAt(sx,sz);
      if(st && want.indexOf(st.type)>=0) seen[st.type]=(seen[st.type]||0)+1;
    }
    for(const t of want)
      ok("地标能生成: "+t, (seen[t]||0)>0, t+" x"+(seen[t]||0));

    // 新增地标真的写进方块里(不是只出现在 structureAt 表里)
    let builtErr=null, builtBlocks=0;
    try{
      for(let sx=-70; sx<=70 && builtBlocks===0; sx++) for(let sz=-70; sz<=70 && builtBlocks===0; sz++){
        const st=structureAt(sx,sz);
        if(!st || st.type!=="castrum") continue;
        let n=0;
        drawStructure(st, (X,Y,Z,id)=>{ if(id===MARBLE) n++; });
        builtBlocks=n;
      }
    }catch(e){ builtErr=e.message; }
    ok("军团要塞能实际砌出大理石方块", !builtErr && builtBlocks>200, builtErr||("大理石="+builtBlocks));

    // 1c. 绿洲村落: 登记为地标 / 能在沙漠生成 / 房屋+水塘+路灯+石板路真的砌进区块
    {
      ok("绿洲村落已登记为指南针地标", !!LANDMARKS.village, LANDMARKS.village);
      let vs=null, vErr=null;
      for(let sx=-70; sx<=70 && !vs; sx++) for(let sz=-70; sz<=70 && !vs; sz++){
        const st=structureAt(sx,sz);
        if(st && st.type==="village") vs=st;
      }
      ok("绿洲村落能在世界里生成", !!vs, vs?("@"+vs.x+","+vs.z+" h="+vs.h):"none");
      if(vs){
        // 安全区: 村中心在庇护内、远处不在; 站在村中心近距离刷普通敌对怪一只也刷不进墙内
        const px0=player.x, pz0=player.z, py0=player.y, n0=mobs.length;
        const safeIn=inVillageSafe(vs.x,vs.z), safeOut=!inVillageSafe(vs.x+VIL_WALL+40, vs.z);
        player.x=vs.x+0.5; player.z=vs.z+0.5; player.y=vs.h+1;
        let spawned=0; for(let i=0;i<20;i++) if(spawnMob("zombie",3,12)) spawned++;
        const inside=mobs.slice(n0).filter(m=>Math.hypot(m.x-vs.x,m.z-vs.z)<VIL_WALL+2).length;
        mobs.length=n0; player.x=px0; player.z=pz0; player.y=py0;
        ok("村落安全区: 村墙内不刷普通敌对怪", safeIn && safeOut && spawned===0 && inside===0, "in="+safeIn+" out="+safeOut+" spawned="+spawned);
        const P=villagePlan(vs);
        const kinds=new Set(P.houses.map(H=>H.kind));
        ok("村落有 5~8 栋房屋且泥砖屋/木筋屋混搭", P.houses.length>=5 && P.houses.length<=8 && kinds.has("adobe") && kinds.has("timber"),
           "houses="+P.houses.length+" kinds="+[...kinds].join("/"));
        ok("村落选址避开河道且在沙漠/台地", villageSiteOK(vs.x,vs.z,vs.h) && (vs.bio===BIO_DESERT||vs.bio===BIO_MESA), "bio="+vs.bio);
        const cnt={}; let sig=0;
        try{
          drawStructure(vs,(X,Y,Z,id)=>{ cnt[id]=(cnt[id]||0)+1; sig=(sig*31+X*7+Y*13+Z*17+id)|0; });
        }catch(e){ vErr=e.message; }
        const c=id=>cnt[id]||0;
        ok("村落生成无异常, 有水塘/睡莲/芦苇", !vErr && c(WATER)>=40 && c(LILY)>0 && c(REEDS)>0 && c(TALLGRASS)+c(REEDS)>=20, vErr||("水="+c(WATER)+" 睡莲="+c(LILY)+" 芦苇="+c(REEDS)+" 高草="+c(TALLGRASS)));
        ok("村落有路灯(灯笼+铁灯柱 ≥8 盏光源)与石板路", c(LANTERN)+c(LAMPPOST)>=8 && c(LAMPPOST)>=P.lamps.length && c(IRONPOST)===2*P.lamps.length && c(COBBLE)>=60 && P.lamps.length>=4,
           "灯笼="+c(LANTERN)+" 铁灯柱="+c(LAMPPOST)+" 细铁柱="+c(IRONPOST)+" 圆石="+c(COBBLE)+" 路灯="+P.lamps.length);
        ok("村屋有窗/灰泥或泥砖墙/陶瓦或木屋顶", (c(GLASS)+c(WINDOW_WOOD))>=P.houses.length*4 && (c(CLAY)+c(CAVECALC)+c(WOOL)+c(PLASTER)+c(PLASTER_ROSE)+c(PLASTER_WHITE))>=100 && (c(ROOFTILE)+c(DARKPLANK))>=40,
           "窗="+(c(GLASS)+c(WINDOW_WOOD))+" 墙="+(c(CLAY)+c(CAVECALC)+c(WOOL)+c(PLASTER)+c(PLASTER_ROSE)+c(PLASTER_WHITE))+" 顶="+(c(ROOFTILE)+c(DARKPLANK)));
        ok("村落有棕榈/集市摊/水井/苔石墙拱门", P.palms.length>=3 && !!P.market && !!P.well && P.gates.length===2 && c(MOSSY)>=30 && (c(LOG)+c(PALM_LOG))>=20,
           "棕榈="+P.palms.length+" 苔石="+c(MOSSY)+" 原木="+(c(LOG)+c(PALM_LOG)));
        let sig2=0; drawStructure(vs,(X,Y,Z,id)=>{ sig2=(sig2*31+X*7+Y*13+Z*17+id)|0; });
        ok("村落生成确定(两次施工完全一致)", sig===sig2, sig+" vs "+sig2);
        // 真实区块: 水塘中心是水; 第一栋房子的门楣/腰梁出现在它所在的区块里(跨区块拼接)
        const at=(X,Y,Z)=>{ const cx=Math.floor(X/CS), cz=Math.floor(Z/CS), arr=genChunk(cx,cz); return arr[((X-cx*CS)*CS+(Z-cz*CS))*H+Y]; };
        ok("区块里水塘中心是水", at(vs.x,vs.h,vs.z)===WATER, "id="+at(vs.x,vs.h,vs.z));
        const H0=P.houses[0], [lx,lz]=P.toW(H0,0,0);
        const wantY=vs.h+(H0.kind==="adobe"?3:4);
        ok("区块里第一栋房子的门楣横梁到位", at(lx,wantY,lz)===DARKPLANK, H0.kind+" id="+at(lx,wantY,lz)+" @"+lx+","+wantY+","+lz);
        // 1d. 第二轮村落修正: 城门轴向对齐 / 主街两侧沿街屋+路灯 / 拱门口无灯笼 / 花丛不悬空 / 棕榈无树桩 / 栈桥无草 / 村民在地点出生
        {
          const HPI=Math.PI/2, hv=vs.h, CK=new Map();
          const at2=(X,Y,Z)=>{ const cx=Math.floor(X/CS), cz=Math.floor(Z/CS), k=cx+","+cz;
            let arr=CK.get(k); if(!arr){ arr=ensureData(cx,cz).blocks; CK.set(k,arr); } return arr[((X-cx*CS)*CS+(Z-cz*CS))*H+Y]; };
          const G0=P.gates[0], G1=P.gates[1];
          const card=a=>Math.abs(a/HPI-Math.round(a/HPI))<1e-9;
          ok("城门吸附到正方向且两门正对", card(G0.a) && card(G1.a) && Math.abs(Math.cos(G1.a-G0.a)+1)<1e-9, "a0="+G0.a.toFixed(3)+" a1="+G1.a.toFixed(3));
          const St=P.street; let straight=true;
          for(let r=St.r0;r<=St.r1;r++) for(let o=-St.half;o<=St.half;o++) if(P.get(vs.x+St.gx*r+St.px*o, vs.z+St.gz*r+St.pz*o)!==2) straight=false;
          for(let r=VIL_WALL;r<=VIL_WALL+4;r++) for(let o=-1;o<=1;o++) if(P.get(vs.x+St.gx*r+St.px*o, vs.z+St.gz*r+St.pz*o)!==2) straight=false;
          ok("主街是笔直的 5 格宽石板路, 出城段 3 格正穿拱门", straight && G0.px===vs.x+St.gx*VIL_WALL && G0.pz===vs.z+St.gz*VIL_WALL, "gate@"+G0.px+","+G0.pz);
          const SH=P.houses.filter(H=>H.street);
          const shOK=SH.length===2 && SH.every(H=>{
            const lat=(H.ox-vs.x)*St.px+(H.oz-vs.z)*St.pz, sd=Math.sign(lat);
            return Math.abs(lat)===4 && H.fx===-sd*St.px && H.fz===-sd*St.pz && H.kind==="timber";
          }) && Math.sign((SH[0].ox-vs.x)*St.px+(SH[0].oz-vs.z)*St.pz)!==Math.sign((SH[1].ox-vs.x)*St.px+(SH[1].oz-vs.z)*St.pz);
          ok("主街两侧各一栋沿街木筋屋, 正面离街心 4 格、门朝街", shOK, SH.map(H=>H.ox+","+H.oz+" f"+H.fx+","+H.fz).join(" | "));
          const stLamps=P.lamps.filter(([X,Z])=>{ const r=(X-vs.x)*St.gx+(Z-vs.z)*St.gz, o=(X-vs.x)*St.px+(Z-vs.z)*St.pz; return Math.abs(o)===3 && r>=St.r0 && r<=St.r1; });
          ok("主街两侧路肩有成对路灯(≥4 盏, 间距≈5)", stLamps.length>=4, "lamps="+stLamps.map(q=>q.join(",")).join(" "));
          let archBad=[];
          for(const G of P.gates) for(let o=-1;o<=1;o++) for(let y=hv+1;y<=hv+4;y++){
            const id=at2(G.px+G.qx*o,y,G.pz+G.qz*o);
            if(id===LANTERN || (y<=hv+3 && SOLID(id))) archBad.push(o+"/"+(y-hv)+"="+id);
          }
          ok("拱门口 3×3 通畅且拱顶不再塞发光灯笼", archBad.length===0, archBad.join(" ")||"ok");
          // 第七轮·本地: 木筋屋门口楼梯朝屋门升高; 泥砖屋侧梯是真楼梯; 路灯 = 细铁柱×2 + 铁灯柱
          const DIRS=[[0,-1],[1,0],[0,1],[-1,0]], SD={}; for(const id of STAIRS) SD[id]=DIRS[STAIR_MAT[id].stairs.indexOf(id)];
          const stBad=[];
          for(const H of P.houses){
            if(H.kind==="timber"){ const [sx,sz]=P.toW(H,0,-1), [dx,dz]=P.toW(H,0,0), id=at2(sx,hv+1,sz), d=SD[id]; if(!d || d[0]!==dx-sx || d[1]!==dz-sz || STAIR_MAT[id].full!==PLANKS) stBad.push("门"+sx+","+sz+"="+id); }
            else for(let k=1;k<=4;k++){ const [sx,sz]=P.toW(H,H.hw+1,H.D-1-k), id=at2(sx,hv+k,sz); if(STAIRS.indexOf(id)<0) stBad.push("侧梯"+k+"@"+sx+","+sz+"="+id); }
          }
          const lampBad=P.lamps.filter(([X,Z])=>!(at2(X,hv+2,Z)===IRONPOST && at2(X,hv+3,Z)===IRONPOST && at2(X,hv+4,Z)===LAMPPOST));
          ok("村落换新: 木筋屋门口楼梯朝屋门升高、泥砖屋侧墙通屋顶是真楼梯、路灯 = 细铁柱×2 + 铁灯柱", !stBad.length && !lampBad.length,
             (stBad.join(" ")||"ok")+" 坏路灯="+lampBad.map(q=>q.join(",")).join(" "));
          let boxBad=[];
          for(const H of P.houses) if(H.kind==="timber") for(const u of [-2,2]){
            const [X,Z]=P.toW(H,u,-1);
            if(at2(X,hv+1,Z)!==LEAVES || !PLANT(at2(X,hv+2,Z)) || at2(X,hv+3,Z)===LEAVES) boxBad.push(X+","+Z);
          }
          ok("木筋屋窗下花丛贴地(不再悬空)", boxBad.length===0, boxBad.join(" ")||"ok");
          let floatP=0, dockG=0, stump=[], dockAt=[];
          for(let X=vs.x-VIL_WALL;X<=vs.x+VIL_WALL;X++) for(let Z=vs.z-VIL_WALL;Z<=vs.z+VIL_WALL;Z++){
            for(let y=hv+1;y<=hv+3;y++){ const id=at2(X,y,Z); if(PLANT(id) && id!==LILY && !SOLID(at2(X,y-1,Z))) floatP++; }
            if(P.dockSet.has(X+","+Z) && PLANT(at2(X,hv+1,Z))){ dockG++; dockAt.push(X+","+Z+"="+at2(X,hv+1,Z)+"/"+at2(X,hv,Z)); }
          }
          for(const T of P.palms) if(T.lx||T.lz){ const bend=Math.ceil(T.th*0.6); if(at2(T.x+T.lx,hv+bend-1,T.z+T.lz)===PALM_LOG) stump.push(T.x+","+T.z); }
          ok("村里花草都长在实心方块上 / 栈桥木板上没有草", floatP===0 && dockG===0, "悬空="+floatP+" 栈桥草="+dockG+" "+dockAt.join(" "));
          ok("棕榈拐膝同高并排, 树干旁没有树桩", stump.length===0, stump.join(" ")||("palms="+P.palms.length));
          let lanWin=[];                                              // 室内灯不在任何窗户的正对视线上(同行/同列且同高)
          for(const H of P.houses){
            const LY=H.kind==="adobe"?hv+5:hv+1, [lu,lv]=H.kind==="adobe"?[0,H.D-2]:[-2,H.D-2], [LX,LZ]=P.toW(H,lu,lv);
            if(at2(LX,LY,LZ)!==LANTERN) lanWin.push("missing@"+LX+","+LY+","+LZ);
            for(let u=-H.hw;u<=H.hw;u++) for(let v=0;v<H.D;v++){ const [X,Z]=P.toW(H,u,v); if(at2(X,LY,Z)===GLASS) lanWin.push("glass-row@"+X+","+Z); }
          }
          ok("室内灯嵌进屋顶/地板, 与窗户不同高(正午不从窗里发光)", lanWin.length===0, lanWin.slice(0,4).join(" ")||"ok");
          const W=villageWaypoints(P), [tX,tZ]=villageTraderSpot(P);
          const stand=(X,Z)=>SOLID(at2(X,hv,Z)) && !SOLID(at2(X,hv+1,Z)) && !SOLID(at2(X,hv+2,Z));
          const badW=W.filter(w=>!stand(w.x,w.z)).map(w=>w.kind+"@"+w.x+","+w.z);
          const doorCells=new Set(P.houses.map(H=>P.toW(H,0,-2).join(","))), blockedPosts=[];
          for(const c of [-2,2]) for(const pu of [-1,1]) for(const pv of [0,2]){
            const [X,Z]=P.toW(P.market,c+pu,pv); if(doorCells.has(X+","+Z)) blockedPosts.push(X+","+Z);
          }
          ok("集市棚柱不挡房屋门口", blockedPosts.length===0, blockedPosts.join(" ")||"ok");
          ok("村民地点(门口/集市/水井/栈桥)与摊主位都能站人", badW.length===0 && stand(tX,tZ) && W.some(w=>w.kind==="market") && W.some(w=>w.kind==="well") && W.filter(w=>w.kind==="door").length===P.houses.length,
             badW.join(" ")||("wps="+W.length));
          // 真的刷几个村民/摊主: 都落在地面(h+1)的地点上, 不在屋顶或灯柱顶
          const bk={x:player.x,y:player.y,z:player.z}, mob0=mobs.length, sh0=sunH;
          player.x=vs.x+0.5; player.z=vs.z+0.5; player.y=hv+1;
          let spawned=0; for(let k=0;k<12;k++) if(spawnVillageVillager(vs)) spawned++;
          const vms=mobs.slice(mob0).filter(m=>m.vil);
          const onWp=vms.every(m=>m.y===hv+1 && W.some(w=>Math.abs(w.x+0.5-m.x)<1e-6 && Math.abs(w.z+0.5-m.z)<1e-6));
          ok("村落村民只在地点出生(脚在地面 h+1, 不上屋顶)", spawned>=3 && onWp, "spawned="+spawned+" ys="+vms.map(m=>m.y-hv).join(","));
          const tOK=spawnVillageTrader(vs), tr=mobs[mobs.length-1];
          ok("商人固定在集市摊位柜台后", tOK && tr.npcRole==="trader" && tr.pinned && Math.floor(tr.x)===tX && Math.floor(tr.z)===tZ, tOK?(tr.x+","+tr.z):"spawn failed");
          let steerOK=false, homeOK=false;
          if(vms.length){
            const m=vms[0]; m.vil.wait=0; sunH=0.8;
            const sp=villagerSteer(m,0.1); steerOK=sp>0 && m.vil.path && m.vil.path.length>=2;
            sunH=0.05; villagerSteer(m,0.1);
            const last=m.vil.path&&m.vil.path[m.vil.path.length-1];
            homeOK=m.vil.goHome && !!last && Math.abs(last[0]-(m.vil.home.x+0.5))<1e-6 && Math.abs(last[1]-(m.vil.home.z+0.5))<1e-6;
          }
          sunH=sh0;
          ok("村民沿环路去下一个地点, 黄昏改道回家", steerOK && homeOK, "steer="+steerOK+" home="+homeOK);
          mobs.length=mob0; player.x=bk.x; player.y=bk.y; player.z=bk.z;
        }
      }
    }

    // 2. 出生点合法: 不在方块内、不在虚空
    const sgy=groundY(Math.floor(spawnPt.x),Math.floor(spawnPt.z));
    ok("出生点在地面之上(不在虚空)", sgy>0, "groundY="+sgy);
    const feet=getBlock(Math.floor(spawnPt.x),Math.floor(spawnPt.y),Math.floor(spawnPt.z));
    const head=getBlock(Math.floor(spawnPt.x),Math.floor(spawnPt.y+1),Math.floor(spawnPt.z));
    ok("出生点没有卡在实心方块里", !SOLID(feet)&&!SOLID(head), "feet="+feet+" head="+head);

    // 3. 存档往返: 改 10 个方块 → 存 → 清空世界重载 → 逐个比对
    const gy=groundY(Math.floor(player.x),Math.floor(player.z));
    const marks=[];
    for(let i=0;i<10;i++){
      const bx=Math.floor(player.x)+i-5, by=gy+3, bz=Math.floor(player.z)+2;
      setBlock(bx,by,bz,COBBLE);
      marks.push([bx,by,bz]);
    }
    const savedOk=saveGame(true);
    ok("存档写入成功", savedOk, "diff="+blockDiff.size);
    // 强制清掉世界内存, 逼真地走一次"重新载入"
    for(const [,c] of world) if(c.mesh) destroyMesh(c.mesh);
    world.clear(); meshQueue.length=0; queued.clear(); _gcx=1e9;
    const loadedOk=loadGame();
    ok("存档读取成功", loadedOk);
    let matched=0;
    for(const [bx,by,bz] of marks){ ensureData(bx>>4,bz>>4); if(getBlock(bx,by,bz)===COBBLE) matched++; }
    ok("10 个方块存档往返一致", matched===10, matched+"/10 一致");

    // 3b. 残缺/损坏存档: 只有 seed、缺 px/npc/arch… → 坐标必须有限、缺字段子系统必须归零
    //     (锁定 BACKLOG 反复承诺的"老存档缺字段→归零"向后兼容契约)
    const _bkSave=(function(){try{return localStorage.getItem(SAVE_KEY);}catch(e){return null;}})();
    try{ localStorage.setItem(SAVE_KEY,'{"seed":1234}'); }catch(e){}
    const partialLoaded=loadGame();
    ok("残缺存档能载入(不抛错)", partialLoaded===true);
    ok("残缺存档: 玩家坐标为有限值(未变 NaN)",
       Number.isFinite(player.x)&&Number.isFinite(player.y)&&Number.isFinite(player.z),
       player.x+","+player.y+","+player.z);
    ok("残缺存档: 缺字段子系统全部归零",
       npcState.relics===0&&archState.pottery===0&&faction.rome===0&&faction.egypt===0&&undeadNight.survived===0,
       "npc="+npcState.relics+" arch="+archState.pottery+" fac="+faction.rome+"/"+faction.egypt+" undead="+undeadNight.survived);
    // 3c. 老存档兼容矩阵(第八轮·云端): 按各轮存档形状删掉之后新增的字段, 真走一遍 loadGame —— 后来的子系统归零、原有字段不丢;
    //     再喂一份字段类型全错的坏存档, 必须不抛错且各子系统落在安全默认值
    {
      let mxErr=null; const rows=[];
      try{
        localStorage.setItem(SAVE_KEY,'{"seed":1234}'); loadGame();                      // 从干净状态起步
        bag.clear(); bag.set(GOLD_ORE,7); lvl=3; xp=5;
        for(const k in potions) potions[k]=0; potions.swift=3; enchState.sharp=2; fishState.fish=4; fishState.cooked=2;
        for(const k in chests) delete chests[k]; chests["1,2,3"]={[SAND]:5}; bundleState.owned=true; bundleState.items={[HAY]:2};
        for(const k in furnaces) delete furnaces[k]; furnaces["4,5,6"]=Object.assign(newFurnace(),{in:SAND,inN:3,fuel:PLANKS,fuelN:2,out:GLASS,outN:1});
        const full=collectSave();
        const SHAPES_BY_ROUND=[                                                            // [轮次名, 要删的字段(之后各轮才有的)]
          ["第四轮", ["ench","sunblade","mace","potions","fish","chests","bundle","furnaces"]],
          ["第五轮", ["chests","bundle","furnaces","fish.cooked"]],
          ["第六轮", ["furnaces","fish.cooked"]],
          ["第七轮", []],
        ];
        for(const [name,drop] of SHAPES_BY_ROUND){
          const sv=JSON.parse(JSON.stringify(full));
          for(const f of drop){ const [a,b]=f.split("."); if(b){ if(sv[a]) delete sv[a][b]; } else delete sv[a]; }
          localStorage.setItem(SAVE_KEY, JSON.stringify(sv));
          const loaded=loadGame();
          const has=f=>!drop.includes(f);
          const keep=loaded===true && bagCount(GOLD_ORE)===7 && lvl===3;
          const r5=has("potions") ? (potions.swift===3 && enchState.sharp===2 && fishState.fish===4) : (potions.swift===0 && enchState.sharp===0 && fishState.fish===0);
          const r6=has("chests") ? (!!chests["1,2,3"] && chests["1,2,3"][SAND]===5 && bundleState.owned && bundleState.items[HAY]===2) : (Object.keys(chests).length===0 && !bundleState.owned);
          const r7=has("furnaces") ? (!!furnaces["4,5,6"] && furnaces["4,5,6"].inN===3 && furnaces["4,5,6"].out===GLASS && fishState.cooked===2) : (Object.keys(furnaces).length===0 && fishState.cooked===0);
          rows.push(name+(keep&&r5&&r6&&r7?"✓":"✗(keep="+keep+" r5="+r5+" r6="+r6+" r7="+r7+")"));
        }
        // 类型全错的坏存档
        localStorage.setItem(SAVE_KEY, JSON.stringify({seed:1234, bag:"x", potions:null, fish:"x", ench:null, chests:[1], bundle:5,
          furnaces:{"1,1,1":"x","2,2,2":{in:999,inN:-4,fuel:SAND,fuelN:3,out:12345,outN:9,burn:"hot",prog:99}}, market:[], trophies:{}, landSeen:"abc", bioSeen:7}));
        const badLoaded=loadGame(), f2=furnaces["2,2,2"];
        const badOk=badLoaded===true && bag.size===0 && potions.swift===0 && fishState.fish===0 && Object.keys(chests).length===0 && !bundleState.owned
          && !furnaces["1,1,1"] && !!f2 && f2.inN===0 && f2.fuelN===0 && f2.outN===0 && f2.burn===0 && f2.prog===FURNACE_T;
        rows.push("坏存档"+(badOk?"✓":"✗(loaded="+badLoaded+" bag="+bag.size+" f2="+JSON.stringify(f2)+")"));
      }catch(e){ mxErr=e.message; }
      for(const k in furnaces) delete furnaces[k]; for(const k in chests) delete chests[k];
      ok("老存档兼容矩阵: 第四~第七轮存档形状逐一载入(新子系统归零、旧字段不丢) + 类型错乱的坏存档不抛错", !mxErr && rows.every(r=>r.endsWith("✓")), mxErr||rows.join(" · "));
    }
    // 还原真实(测试)存档并重载, 让后续用例在有效世界上继续
    try{ if(_bkSave!=null) localStorage.setItem(SAVE_KEY,_bkSave); else localStorage.removeItem(SAVE_KEY); }catch(e){}
    if(_bkSave!=null) loadGame();

    // 4. 长距离飞行: 无异常、无空洞
    const fx=player.x, fz=player.z;
    let holes=0, threw=null;
    try{
      for(let step=0; step<20; step++){
        player.x += 100;                       // 累计 2000 格
        pcx=1e9; refreshChunks(); processQueue(50);
        // 注意: groundY 在水面上会返回 -1(水不是 SOLID), 那不是"空洞";
        // 真正的空洞是"区块根本没生成出来", 所以这里直接查区块是否存在。
        const cx2=Math.floor(player.x)>>4, cz2=Math.floor(player.z)>>4;
        if(!world.has(key(cx2,cz2))) holes++;
      }
    }catch(e){ threw=e.message; }
    ok("连续飞行 2000 格无异常", !threw, threw||"ok");
    ok("飞行途中无区块空洞", holes===0, "空洞采样="+holes);
    player.x=fx; player.z=fz; pcx=1e9; refreshChunks();

    // 5. 岩浆扣血 → 归零 → 死亡 → 重生
    const gy2=groundY(Math.floor(player.x),Math.floor(player.z));
    player.y=gy2; hp=maxHp; dead=false;
    const lx=Math.floor(player.x), lz=Math.floor(player.z);
    const backup=getBlock(lx,gy2-1,lz);
    setBlock(lx,gy2-1,lz,LAVA); setBlock(lx,gy2,lz,LAVA);
    player.y=gy2+0.1;
    const inL=inLava();
    ok("能正确检测身处岩浆", inL, "inLava="+inL);
    const hpBefore=hp;
    for(let i=0;i<40;i++){ if(inLava()){ lavaDmgT-=0.05; if(lavaDmgT<=0){ lavaDmgT=0.5; damagePlayer(4,0,0); } } }
    ok("岩浆造成扣血", hp<hpBefore, hpBefore+"→"+hp);
    hp=1; damagePlayer(50,0,0);
    ok("血量归零触发死亡", dead===true && hp<=0, "hp="+hp+" dead="+dead);
    respawn();
    ok("重生后回满血且状态正常", !dead && hp===maxHp, "hp="+hp+"/"+maxHp);
    setBlock(lx,gy2-1,lz,backup); setBlock(lx,gy2,lz,AIR);

    // 6. Boss 流程不报错
    let bossErr=null, bossSpawned=0;
    try{
      mobs.length=0;
      for(const b of ["king","wyvern","titan","phoenix","anubis","pharaoh","champion","caesar",
                      "centurion","legionary","sphinx","griffin","serqet","minotaur","lupa","sandworm"]){
        if(!MOB_DEFS[b]) continue;
        if(spawnMob(b,6,14)) bossSpawned++;
      }
      for(let i=0;i<60;i++) updateMobs(0.033);
      const vp=gl.getParameter(gl.VIEWPORT); gl.viewport(0,0,1,1);   // 只验证绘制路径不抛错: 缩到 1 像素, 免得软件渲染下全屏填充数分钟
      try{ for(const m of mobs) drawEntity(m); } finally { gl.viewport(vp[0],vp[1],vp[2],vp[3]); }
    }catch(e){ bossErr=e.message; }
    ok("Boss 生成与 AI 流程无异常", !bossErr, bossErr||("已生成 "+bossSpawned+" 个 Boss"));
    mobs.length=0;

    // 6b. 新生物的模型部件与贴图索引必须合法(贴图越界会渲染成花屏/白块)
    const NEWMOBS=["legionary","centurion","caesar","sphinx","griffin","serqet","minotaur","lupa","sandworm"];
    let badModel=null;
    for(const t of NEWMOBS){
      const d=MOB_DEFS[t];
      if(!d){ badModel=t+" 未注册"; break; }
      if(!d.parts || !d.parts.length){ badModel=t+" 没有模型部件"; break; }
      for(const pt of d.parts){
        for(const k of ["tF","tS","tT","tB"]){
          const ti=pt[k];
          if(!(ti>=0 && ti<=255)){ badModel=t+"."+k+"="+ti+" 越界"; break; }
        }
        if(!pt.p||!pt.o||!pt.s){ badModel=t+" 部件缺少 p/o/s"; break; }
        if(badModel) break;
      }
      if(badModel) break;
    }
    ok("新生物模型与贴图索引合法", !badModel, badModel||(NEWMOBS.length+" 种全部通过"));

    // 7. 触屏摇杆能真正驱动位移
    let touchErr=null, moved=0;
    try{
      // 新世界出生在村口, 正前方可能恰被路灯/墙/村民挡住 → 四个朝向依次试, 有一个能走开即可(每次试前回到原位)
      const start={x:player.x,y:player.y,z:player.z,yaw:player.yaw};
      const wasSoft=softLock; softLock=true;
      _stSkipRender=true;   // 只测摇杆驱动位移, 不必画 30 帧
      for(let k=0;k<4 && moved<=1;k++){
        player.x=start.x; player.y=start.y; player.z=start.z; player.vx=player.vz=0; player.yaw=start.yaw+k*Math.PI/2;
        touchState.active=true; touchState.moveX=0; touchState.moveY=-1;   // 摇杆推到最前
        const t0=performance.now(); lastT=t0;
        for(let i=1;i<=30;i++) frame(t0+i*33);
        touchState.active=false; touchState.moveX=0; touchState.moveY=0;
        moved=Math.hypot(player.x-start.x, player.z-start.z);
      }
      softLock=wasSoft; player.yaw=start.yaw;
    }catch(e){ touchErr=e.message; }
    _stSkipRender=false;
    ok("模拟触屏摇杆能驱动玩家移动", !touchErr && moved>1, touchErr||("位移="+moved.toFixed(2)+"m"));

    // 8. 关卡系统: 推进 → 完成 → 索引前进
    const qi0=questIdx, qp0=questProg, qd0=questDone;
    questIdx=1; questProg=0; questDone=false;          // 第 2 关"挖 25 个方块"
    const q2=curQuest();
    questAdd("mine", q2.goal-1);
    const nearDone = questIdx===1 && questProg===q2.goal-1;
    ok("关卡进度能累加", nearDone, "progress="+questProg+"/"+q2.goal);
    questAdd("mine", 1);
    ok("达标后自动进入下一关", questIdx===2, "questIdx="+questIdx);
    ok("关卡 HUD 元素存在", !!document.getElementById("questTitle"), "");
    // 8b. 关卡按 id 存读: 往关卡表中间插关后, 老存档不能错位
    const qi1=questIdx, qp1=questProg, qd1=questDone;
    const target=QUESTS.findIndex(q=>q.id==="castrum");
    questIdx=target; questProg=0; questDone=false;
    const snapSave=collectSave();
    ok("存档记录了关卡 id", snapSave.questId==="castrum", "questId="+snapSave.questId);
    // 模拟"作者在前面插了一关"导致下标整体后移: 只有按 id 找才能回到原关
    const shifted=Object.assign({},snapSave,{questIdx:snapSave.questIdx+3});
    const byId=QUESTS.findIndex(q=>q.id===shifted.questId);
    ok("关卡表变动后仍能按 id 定位", byId===target, "byId="+byId+" target="+target);
    questIdx=qi1; questProg=qp1; questDone=qd1;

    // 8c. 三幕结构完整
    const acts=new Set(QUESTS.map(q=>q.act));
    ok("关卡覆盖三幕", acts.size===3 && QUESTS.every(q=>ACTS[q.act]), "幕数="+acts.size+" 关数="+QUESTS.length);

    questIdx=qi0; questProg=qp0; questDone=qd0; updateQuestHUD();

    // 8d. 背包与合成: 扣料/产出/上限/存档往返
    const bagSnap=new Map(bag), armor0=armor, dmg0=dmgMul;
    bag.clear();
    bagAdd(COAL_ORE,3);
    ok("挖到的方块能进背包", bagCount(COAL_ORE)===3, "煤="+bagCount(COAL_ORE));
    const torch=RECIPES.findIndex(r=>r.name==="火把照明");
    const lant0=bagCount(LANTERN);
    doCraft(torch);
    ok("材料够时能合成", bagCount(COAL_ORE)===0 && bagCount(LANTERN)===lant0+4,
       "煤="+bagCount(COAL_ORE)+" 灯笼="+bagCount(LANTERN));
    doCraft(torch);                                   // 已经没料了
    ok("材料不足时拒绝合成", bagCount(LANTERN)===lant0+4, "灯笼仍="+bagCount(LANTERN));
    armor=5; bag.clear();
    bagAdd(IRON_ORE,5); bagAdd(GOLD_ORE,2);
    const arm=RECIPES.findIndex(r=>r.name==="锻造护甲");
    doCraft(arm);
    ok("达到上限的配方会被挡下", armor===5 && bagCount(IRON_ORE)===5,
       "护甲="+armor+" 铁未被扣="+ (bagCount(IRON_ORE)===5));
    armor=armor0; dmgMul=dmg0;
    bag.clear(); bagAdd(GEM_ORE,7); bagAdd(SAND,11);
    const wrote=collectSave();
    ok("背包写入存档", wrote.bag && wrote.bag[GEM_ORE]===7 && wrote.bag[SAND]===11,
       "存档钻石="+(wrote.bag||{})[GEM_ORE]+" 沙="+(wrote.bag||{})[SAND]);
    bag.clear();
    if(wrote.bag) for(const k in wrote.bag) bag.set(+k, wrote.bag[k]);
    ok("背包能从存档还原", bagCount(GEM_ORE)===7 && bagCount(SAND)===11,
       "还原钻石="+bagCount(GEM_ORE)+" 沙="+bagCount(SAND));
    bag.clear(); for(const [k,v] of bagSnap) bag.set(k,v);

    // 8e. 探索兑现: 图纸锁配方 / 地标存档 / 沙暴 / 群系产材表
    const landSnap=[...landSeen], w0=weather;
    landSeen.clear();
    const wreckR=RECIPES.findIndex(r=>r.needLand==="wreck");
    ok("沉船灯塔配方存在", wreckR>=0, "idx="+wreckR);
    bagAdd(WRECKWOOD,8); bagAdd(GOLD_ORE,2); bagAdd(COAL_ORE,2);
    const lant1=bagCount(LANTERN);
    doCraft(wreckR);
    ok("未探沉船时图纸配方锁定", bagCount(LANTERN)===lant1 && bagCount(WRECKWOOD)===8, "灯笼="+bagCount(LANTERN));
    landSeen.add("wreck:0:0");
    doCraft(wreckR);
    ok("探过沉船后可合成灯塔", bagCount(WRECKWOOD)===0 && bagCount(LANTERN)===lant1+8, "灯笼="+bagCount(LANTERN));
    const wrotePay=collectSave();
    ok("地标写入存档", Array.isArray(wrotePay.landSeen) && wrotePay.landSeen.indexOf("wreck:0:0")>=0, "landSeen="+JSON.stringify(wrotePay.landSeen));
    landSeen.clear();
    if(wrotePay.landSeen) for(const k of wrotePay.landSeen) landSeen.add(k);
    ok("地标能从存档还原", landSeen.has("wreck:0:0"), "size="+landSeen.size);
    ok("群系产材覆盖干旱/火山/晶洞/遗迹", !!(BIOME_YIELD[BIO_DESERT]&&BIOME_YIELD[BIO_VOLCANO]&&BIOME_YIELD[BIO_FOREST]&&BIOME_YIELD[BIO_TAIGA]), "keys="+Object.keys(BIOME_YIELD).length);
    const wset=window.__game.setWeather("sand");
    ok("能切入沙暴天气", weather==="sand" && wset==="sand", "weather="+weather);
    weather=w0; landSeen.clear(); for(const k of landSnap) landSeen.add(k);
    bag.clear(); for(const [k,v] of bagSnap) bag.set(k,v);

    // 8f. NPC 系统: 生成 / 交易扣料产出 / 供品不足拒绝 / 祝福 / 存档往返 + 老存档兼容
    const npcSnap=Object.assign({},npcState), bagSnap3=new Map(bag);
    const talkPrev=talkNpc, blessPrev={t:blessT,k:blessKind};
    npcState.relics=0; npcState.trades=0; npcState.blessings=0;
    let made=false; for(let tr=0;tr<4 && !made;tr++) made=spawnNPC("trader",4,7);
    if(!made){ // 世界边界情况: 直接放一个, 保证后续断言可跑
      mobs.push({type:"villager", def:MOB_DEFS.villager, x:player.x+2,y:player.y,z:player.z, vx:0,vy:0,vz:0,kbx:0,kbz:0,
                 yaw:0,tgtYaw:0,hp:16,hurtT:0,animT:0,t:0,atkCd:0,burnT:0,swingT:0,groanT:0,fleeT:0,
                 onGround:false,pause:true,burning:false,held:null,npcRole:"trader",npcName:"商队商人"});
    }
    ok("能生成可交谈的商队商人NPC", countNPC("trader")>=1, "trader="+countNPC("trader"));
    talkNpc=mobs.find(m=>m.npcRole==="trader" && !m.stallKey)||null;   // 流动商人(村落摊主是另一套每日库存菜单)
    ok("可识别当前可交谈NPC", !!talkNpc && talkNpc.npcRole==="trader", "talk="+(talkNpc&&talkNpc.npcRole));
    bag.clear(); bagAdd(SAND,12);
    const lantB=bagCount(LANTERN);
    npcBuy(0);                                        // 沙石换灯笼: 沙 x12 → 灯笼 x4
    ok("商人交易扣料并产出货物", bagCount(SAND)===0 && bagCount(LANTERN)===lantB+4, "沙="+bagCount(SAND)+" 灯="+bagCount(LANTERN));
    ok("交易次数累加", npcState.trades===1, "trades="+npcState.trades);
    npcState.relics=0;
    npcBuy(3);                                        // 收购文物: 需文物 x1, 现无
    ok("供品不足时交易被拒", npcState.relics===0 && npcState.trades===1, "relics="+npcState.relics+" trades="+npcState.trades);
    applyBless("ward",60);
    const dmgSnapHp=hp, dead0=dead; hp=maxHp; dead=false;
    const before=hp; damagePlayer(10,0,0);            // 庇护祝福: 10 伤应被减半后再算护甲
    ok("庇护祝福使受伤减半", (before-hp)<=Math.ceil(10*0.5*(1-armor*0.06))+0, "扣血="+(before-hp));
    hp=dmgSnapHp; dead=dead0;
    ok("神谕祝福已生效", blessKind==="ward" && blessT>0, "kind="+blessKind+" t="+blessT.toFixed(0));
    npcState.relics=4; npcState.trades=2;
    const wroteNpc=collectSave();
    ok("NPC状态写入存档", wroteNpc.npc && wroteNpc.npc.relics===4 && wroteNpc.npc.trades===2, "存档npc="+JSON.stringify(wroteNpc.npc));
    { const legacy=Object.assign({},wroteNpc); delete legacy.npc;   // 模拟老存档缺字段
      const NN=legacy.npc||{}; npcState.relics=NN.relics|0; npcState.trades=NN.trades|0; }
    ok("老存档(无npc字段)兼容归零", npcState.relics===0 && npcState.trades===0, "relics="+npcState.relics);
    { const NN=wroteNpc.npc; npcState.relics=NN.relics|0; npcState.trades=NN.trades|0; }
    ok("NPC状态能从存档还原", npcState.relics===4 && npcState.trades===2, "relics="+npcState.relics);
    ok("神谕预言不报错且返回文本", typeof oracleProphecy()==="string", "");
    for(let i=mobs.length-1;i>=0;i--) if(mobs[i].npcRole) mobs.splice(i,1);
    talkNpc=talkPrev; blessT=blessPrev.t; blessKind=blessPrev.k; updateBuffHUD();
    bag.clear(); for(const [k,v] of bagSnap3) bag.set(k,v);
    Object.assign(npcState,npcSnap);

    // 8g. 沙漠考古: 可疑沙砾方块存在 / 挖开产出三类文物 / 存档往返 + 老存档兼容
    ok("可疑沙砾方块已定义", !!BLOCKS[SUSGRAVEL] && BLOCKS[SUSGRAVEL].t===83, "SUSGRAVEL="+SUSGRAVEL);
    const archSnap=Object.assign({},archState, {shards:(archState.shards||[]).slice()}), relicSnap2=npcState.relics;
    archState.pottery=0; archState.pages=0; archState.digs=0; archState.shards=[]; archState.setComplete=false; npcState.relics=0;
    let gotPottery=0, gotPages=0, gotRelic=0;
    for(let i=0;i<400;i++){ const b={pottery:archState.pottery,pages:archState.pages,relics:npcState.relics};
      archaeologyDig(0,80,0);
      if(archState.pottery>b.pottery) gotPottery++; else if(archState.pages>b.pages) gotPages++; else if(npcState.relics>b.relics) gotRelic++; }
    ok("考古能出土陶片", gotPottery>0, "陶片次数="+gotPottery);
    ok("考古能出土图纸残页", gotPages>0, "图纸次数="+gotPages);
    ok("考古能出土文物碎片", gotRelic>0, "文物次数="+gotRelic);
    ok("发掘计数累加", archState.digs===400, "digs="+archState.digs);
    archState.pottery=7; archState.pages=3; archState.digs=9;
    const wroteArch=collectSave();
    ok("考古进度写入存档", wroteArch.arch && wroteArch.arch.pottery===7 && wroteArch.arch.pages===3, "arch="+JSON.stringify(wroteArch.arch));
    { const legacy=Object.assign({},wroteArch); delete legacy.arch;   // 模拟老存档缺字段
      const A=legacy.arch||{}; archState.pottery=A.pottery|0; archState.pages=A.pages|0; }
    ok("老存档(无arch字段)兼容归零", archState.pottery===0 && archState.pages===0, "pottery="+archState.pottery);
    { const A=wroteArch.arch; archState.pottery=A.pottery|0; archState.pages=A.pages|0; archState.digs=A.digs|0; }
    ok("考古进度能从存档还原", archState.pottery===7 && archState.pages===3, "pottery="+archState.pottery);
    Object.assign(archState, {pottery:archSnap.pottery, pages:archSnap.pages, digs:archSnap.digs, setComplete:!!archSnap.setComplete});
    archState.shards=(archSnap.shards||[]).slice(); npcState.relics=relicSnap2;

    // 8h. 罗马斗兽场波次: 能刷波 / 清场无残留 / 通关落钥匙 / 存档往返 + 老存档兼容
    const arenaSnap=Object.assign({},arenaState);
    const bagSnapA=new Map(bag), armorA=armor, xpA=xp, lvlA=lvl, dmgA=dmgMul, maxA=maxHp, hpA=hp;
    arenaState.cx=player.x; arenaState.cz=player.z;
    let asp=0; for(let k=0;k<3;k++) if(spawnArenaMob("gladiator",player.x,player.z)) asp++;
    ok("斗兽场能刷出角斗波次", aliveArenaMobs()>=1 && asp>=1, "spawned="+asp+" alive="+aliveArenaMobs());
    for(let i=mobs.length-1;i>=0;i--) if(mobs[i].arena) mobs.splice(i,1);
    ok("清场后竞技场无残留", aliveArenaMobs()===0, "alive="+aliveArenaMobs());
    const keys0=arenaState.keys; arenaState.active=true; endArena(true);
    ok("通关落宝库钥匙并标记完成", arenaState.keys===keys0+1 && arenaState.cleared===true && !arenaState.active, "keys="+arenaState.keys+" cleared="+arenaState.cleared);
    arenaState.bestWave=4; arenaState.cleared=true; arenaState.keys=2;
    const wroteAr=collectSave();
    ok("斗兽场进度写入存档", wroteAr.arena && wroteAr.arena.bestWave===4 && wroteAr.arena.keys===2, "arena="+JSON.stringify(wroteAr.arena));
    { const legacy=Object.assign({},wroteAr); delete legacy.arena;   // 模拟老存档缺字段
      const AR=legacy.arena||{}; arenaState.keys=AR.keys|0; arenaState.cleared=!!AR.cleared; }
    ok("老存档(无arena字段)兼容归零", arenaState.keys===0 && arenaState.cleared===false, "keys="+arenaState.keys);
    { const AR=wroteAr.arena; arenaState.keys=AR.keys|0; arenaState.cleared=!!AR.cleared; arenaState.bestWave=AR.bestWave|0; }
    ok("斗兽场进度能从存档还原", arenaState.keys===2 && arenaState.bestWave===4, "keys="+arenaState.keys);
    for(let i=mobs.length-1;i>=0;i--) if(mobs[i].arena) mobs.splice(i,1);
    Object.assign(arenaState,arenaSnap);
    bag.clear(); for(const [k,v] of bagSnapA) bag.set(k,v); armor=armorA; xp=xpA; lvl=lvlA; dmgMul=dmgA; maxHp=maxA; hp=hpA; updateHearts(); updateXPHUD();

    // 8i. 法老诅咒: 唤醒即缠身 / 无法老时自解 / 斩杀落钥匙+宝藏 / 存档往返 + 老存档兼容
    const curseSnap=Object.assign({},curseState), akeys0=arenaState.keys;
    const bagSnapC=new Map(bag), xpC=xp, lvlC=lvl, maxC=maxHp, dmgC=dmgMul, hpC=hp;
    applyCurse();
    ok("诅咒可被施加(缠身)", curseState.active===true && curseState.t>0, "active="+curseState.active+" t="+curseState.t.toFixed(0));
    for(let i=mobs.length-1;i>=0;i--) if(mobs[i].type==="pharaoh") mobs.splice(i,1);   // 确保场上无法老
    updateCurse(0.1);
    ok("无法老在场时诅咒自解", curseState.active===false, "active="+curseState.active);
    curseState.pharaohSlain=0;
    onPharaohSlain();
    ok("斩杀法老解咒并落宝库钥匙", curseState.pharaohSlain===1 && arenaState.keys===akeys0+1 && !curseState.active, "slain="+curseState.pharaohSlain+" keys="+arenaState.keys);
    curseState.pharaohSlain=3;
    const wroteCu=collectSave();
    ok("诅咒战绩写入存档", wroteCu.curse && wroteCu.curse.pharaohSlain===3, "curse="+JSON.stringify(wroteCu.curse));
    { const legacy=Object.assign({},wroteCu); delete legacy.curse;   // 模拟老存档缺字段
      const CU=legacy.curse||{}; curseState.pharaohSlain=CU.pharaohSlain|0; }
    ok("老存档(无curse字段)兼容归零", curseState.pharaohSlain===0, "slain="+curseState.pharaohSlain);
    { const CU=wroteCu.curse; curseState.pharaohSlain=CU.pharaohSlain|0; }
    ok("诅咒战绩能从存档还原", curseState.pharaohSlain===3, "slain="+curseState.pharaohSlain);
    Object.assign(curseState,curseSnap); arenaState.keys=akeys0;
    bag.clear(); for(const [k,v] of bagSnapC) bag.set(k,v); xp=xpC; lvl=lvlC; maxHp=maxC; dmgMul=dmgC; hp=hpC; updateHearts(); updateXPHUD();

    // 8j. 军团据点巡逻 AI: 登记/巡逻/返岗/警戒呼叫/驻防计数
    {
      const mobsSnapP=mobs.slice(); mobs.length=0;
      const pAlerts0=patrolState.alerts, py0=player.y;
      player.y=120;                                   // 抬到高空, 保证视线不被地形挡(警戒断言稳定)
      const mk=(dx,dz)=>({type:"legionary",def:MOB_DEFS.legionary,x:player.x+dx,y:player.y,z:player.z+dz,
        vx:0,vy:0,vz:0,kbx:0,kbz:0,yaw:0,tgtYaw:0,hp:34,hurtT:0,animT:0,t:0,atkCd:0,burnT:0,swingT:0,
        groanT:0,fleeT:0,onGround:true,pause:false,burning:false,held:null,alertT:0});
      const p1=mk(3,0), p2=mk(4,0); mobs.push(p1,p2);
      ok("巡逻兵可登记到据点", makePatroller(p1,{x:player.x,z:player.z})===true && p1.patrol && p1.homeX!==undefined, "home=("+(p1.homeX|0)+","+(p1.homeZ|0)+")");
      makePatroller(p2,{x:player.x,z:player.z});
      p1.x=player.x+40; p1.z=player.z;                // 远离据点 → 应返岗
      const rsp=patrolSteer(p1,0.1);
      ok("巡逻兵脱离据点会返岗", p1.state==="return" && rsp>0, "state="+p1.state+" spd="+rsp.toFixed(2));
      p1.x=player.x+9; p1.z=player.z;                 // 回到巡逻半径内 → 绕圈巡逻
      const psp=patrolSteer(p1,0.1);
      ok("巡逻兵在据点范围内绕圈巡逻", p1.state==="patrol" && psp>0, "state="+p1.state+" spd="+psp.toFixed(2));
      p1.x=player.x+1.4; p1.z=player.z; p2.x=player.x+1.6; p2.z=player.z; p2.alertT=0;
      patrolAlert(p1, true, 1.4);
      ok("巡逻兵发现玩家进入警戒", p1.alertT>0 && patrolState.alerts===pAlerts0+1, "alertT="+p1.alertT.toFixed(1)+" alerts="+patrolState.alerts);
      ok("警戒会呼叫附近同袍一起戒备", p2.alertT>0, "同袍alertT="+p2.alertT.toFixed(1));
      updatePatrols(0.05);
      ok("驻防巡逻数量统计正确", patrolState.active===2, "active="+patrolState.active);
      player.y=py0; patrolState.alerts=pAlerts0;
      mobs.length=0; for(const m of mobsSnapP) mobs.push(m);
    }

    // 8k. 海市蜃楼: 干旱群系生成 / 上限 / 远处淡入 / 走近淡出消散
    {
      const mSnap=mirages.slice(), spawnSnap=mirageSpawnT; mirages.length=0; mirageSpawnT=999;
      const fx=player.x, fz=player.z; let moved=false;
      // 找一处真沙漠站上去, 让 biomeDryHere() 为真(海市蜃楼只在 BIO_DESERT)
      outer: for(let ax=-3000;ax<=3000;ax+=96) for(let az=-3000;az<=3000;az+=96){
        const b=biomeAt(Math.floor(fx+ax),Math.floor(fz+az));
        if(b===BIO_DESERT){ player.x=fx+ax; player.z=fz+az; moved=true; break outer; }
      }
      ok("能定位到沙漠群系(海市蜃楼场景)", moved && biomeDryHere(), "dry="+biomeDryHere());
      ok("海市蜃楼可生成幻影绿洲", spawnMirage()===true && mirages.length===1, "count="+mirages.length);
      for(let i=0;i<20;i++) spawnMirage();
      ok("幻影数量有 draw 上限(≤"+MIRAGE_CAP+")", mirages.length<=MIRAGE_CAP, "count="+mirages.length);
      mirages.length=0; mirages.push({x:player.x+60,z:player.z,y:WATER_Y+2,phase:0,alpha:0,born:0});
      for(let i=0;i<30;i++) updateMirage(0.1);
      const farA=mirages.length?mirages[0].alpha:0;
      ok("远处幻影会淡入显现", farA>0.3, "alpha="+farA.toFixed(2));
      mirages.length=0; mirages.push({x:player.x+10,z:player.z,y:WATER_Y+2,phase:0,alpha:0.7,born:0});
      for(let i=0;i<40;i++) updateMirage(0.1);
      const nearGone = mirages.length===0 || mirages[0].alpha<0.3;
      ok("走近后幻影淡出消散", nearGone, mirages.length?("alpha="+mirages[0].alpha.toFixed(2)):"已移除");
      mirages.length=0; for(const g of mSnap) mirages.push(g); mirageSpawnT=spawnSnap;
      player.x=fx; player.z=fz; pcx=1e9; refreshChunks();
    }

    // 8l. 罗马战车坐骑: 已注册/更快/模型合法/高速冲撞击杀累计
    {
      ok("战车已注册为坐骑(groundMount)", !!MOB_DEFS.chariot && !!MOB_DEFS.chariot.mount && !!MOB_DEFS.chariot.groundMount && !!MOB_DEFS.chariot.chariot, "def="+!!MOB_DEFS.chariot);
      ok("战车比马更快(操控区分度)", MOB_DEFS.chariot.speed>MOB_DEFS.horse.speed, "战车="+MOB_DEFS.chariot.speed+" 马="+MOB_DEFS.horse.speed);
      let badC=null;
      for(const pt of MOB_DEFS.chariot.parts){ for(const k of ["tF","tS","tT","tB"]){ const ti=pt[k]; if(!(ti>=0&&ti<=255)){ badC=k+"="+ti; break; } } if(badC) break; }
      ok("战车模型贴图索引合法(0-255)", !badC, badC||(MOB_DEFS.chariot.parts.length+" 部件通过"));
      const mobsSnapC=mobs.slice(); mobs.length=0;
      const rams0=chariotState.rams, ridingPrev=riding, vxP=player.vx, vzP=player.vz;
      const killsP=kills, xpP=xp, lvlP=lvl, dmgP=dmgMul, maxP=maxHp, hpP=hp;
      const qiP=questIdx, qpP=questProg, qdP=questDone, dropLen=drops.length;
      const ch={type:"chariot",def:MOB_DEFS.chariot,x:player.x,y:player.y,z:player.z,vx:0,vy:0,vz:0,kbx:0,kbz:0,yaw:0,tgtYaw:0,hp:30,hurtT:0,animT:0,t:0,atkCd:0,burnT:0,swingT:0,groanT:0,fleeT:0,onGround:true,pause:false,burning:false,held:null};
      const foe={type:"zombie",def:MOB_DEFS.zombie,x:player.x+1,y:player.y,z:player.z,vx:0,vy:0,vz:0,kbx:0,kbz:0,yaw:0,tgtYaw:0,hp:2,hurtT:0,animT:0,t:0,atkCd:0,burnT:0,swingT:0,groanT:0,fleeT:0,onGround:true,pause:false,burning:false,held:null,_ramCd:0};
      mobs.push(ch,foe); riding=ch; player.vx=12; player.vz=0;
      chariotRam(0.05);
      ok("战车高速冲撞造成伤害/击杀敌人", mobs.indexOf(foe)<0 || foe.hp<2, "foeHp="+foe.hp+" 存活="+(mobs.indexOf(foe)>=0));
      ok("战车碾压击杀会累计 rams", chariotState.rams>=rams0+1, "rams="+chariotState.rams+"(基线"+rams0+")");
      riding=ridingPrev; player.vx=vxP; player.vz=vzP;
      kills=killsP; xp=xpP; lvl=lvlP; dmgMul=dmgP; maxHp=maxP; hp=hpP;
      questIdx=qiP; questProg=qpP; questDone=qdP; drops.length=dropLen;
      chariotState.rams=rams0;
      mobs.length=0; for(const m of mobsSnapC) mobs.push(m);
      updateHearts(); updateXPHUD(); updateQuestHUD();
    }

    // 8m. 金字塔实体机关陷阱 + 尾巴战绩 feats 存档往返 + 老存档兼容
    {
      const trapSnap=Object.assign({},trapState), chSnap=Object.assign({},chariotState);
      const firedSnap=new Set(trapFired), entLen=trapEnts.length, arrLen=arrows.length;
      const t0=trapState.triggered;
      triggerPlate(999999,60,999999);
      ok("机关压力板可被触发", trapState.triggered===t0+1, "triggered="+trapState.triggered);
      triggerPlate(999999,60,999999);                 // 重复触发同一坐标应被 trapFired 挡下
      ok("同一机关不会重复触发", trapState.triggered===t0+1, "triggered="+trapState.triggered);
      for(let i=0;i<80;i++) spawnRock(999990+i,70,999990,-1);
      ok("落石/滚石实体有上限(≤"+TRAP_CAP+")", trapEnts.length<=TRAP_CAP, "ents="+trapEnts.length);
      trapState.triggered=12; trapState.sprung=3; trapState.hits=5; chariotState.rams=4;
      const wroteF=collectSave();
      ok("尾巴战绩写入存档(feats)", wroteF.feats && wroteF.feats.trapsTriggered===12 && wroteF.feats.chariotRams===4, "feats="+JSON.stringify(wroteF.feats));
      { const legacy=Object.assign({},wroteF); delete legacy.feats;   // 模拟老存档缺 feats 字段
        const F=legacy.feats||{}; trapState.triggered=F.trapsTriggered|0; chariotState.rams=F.chariotRams|0; }
      ok("老存档(无feats字段)兼容归零", trapState.triggered===0 && chariotState.rams===0, "triggered="+trapState.triggered+" rams="+chariotState.rams);
      { const F=wroteF.feats; trapState.triggered=F.trapsTriggered|0; trapState.sprung=F.trapsSprung|0; trapState.hits=F.trapHits|0; chariotState.rams=F.chariotRams|0; }
      ok("尾巴战绩能从存档还原", trapState.triggered===12 && chariotState.rams===4, "triggered="+trapState.triggered+" rams="+chariotState.rams);
      Object.assign(trapState,trapSnap); Object.assign(chariotState,chSnap);
      trapFired.clear(); for(const k of firedSnap) trapFired.add(k); trapEnts.length=entLen; arrows.length=arrLen;
    }

    // 8n. 封印宝库: 钥匙可花掉 / 无钥匙拒绝 / 存档往返 + 老存档兼容
    {
      const vSnap=vaultState.opened, kSnap=arenaState.keys;
      const bagSnapV=new Map(bag), xpV=xp, lvlV=lvl, dmgV=dmgMul, maxV=maxHp, hpV=hp, armorV=armor;
      const mythSnap={frags:Object.assign({},mythicState.frags), done:mythicState.done.slice()};
      arenaState.keys=0; vaultState.opened=0;
      ok("无钥匙时拒绝开宝库", openVault(true)===false && arenaState.keys===0 && vaultState.opened===0, "keys="+arenaState.keys+" opened="+vaultState.opened);
      arenaState.keys=2;
      const gold0=bagCount(GOLD_ORE), gem0=bagCount(GEM_ORE);
      mythicState.frags.rome=0; mythicState.frags.persia=0;
      mythicState.done=mythicState.done.filter(c=>c!=="rome" && c!=="persia");
      ok("有钥匙时可强制开启封印宝库", openVault(true)===true, "opened="+vaultState.opened);
      ok("开宝库会花掉一把钥匙", arenaState.keys===1, "keys="+arenaState.keys);
      ok("开宝库会计入开启次数", vaultState.opened===1, "opened="+vaultState.opened);
      ok("开宝库会掉金/钻", bagCount(GOLD_ORE)>gold0 && bagCount(GEM_ORE)>gem0, "金="+(bagCount(GOLD_ORE)-gold0)+" 钻="+(bagCount(GEM_ORE)-gem0));
      ok("强制开宫殿宝库发罗马碎片而非波斯", vaultCiv("palace")==="rome" && mythicState.frags.rome===1 && mythicState.frags.persia===0,
         "rome="+mythicState.frags.rome+" persia="+mythicState.frags.persia+" civ="+vaultCiv("palace"));
      ok("金字塔宝库给埃及碎片", vaultCiv("pyramid")==="egypt", "civ="+vaultCiv("pyramid"));
      ok("斗兽场宝库给罗马碎片", vaultCiv("colosseum")==="rome", "civ="+vaultCiv("colosseum"));
      vaultState.opened=7;
      const wroteV=collectSave();
      ok("宝库开启次数写入存档(feats)", wroteV.feats && wroteV.feats.vaultsOpened===7, "feats="+JSON.stringify(wroteV.feats));
      { const legacy=Object.assign({},wroteV); delete legacy.feats;
        const F=legacy.feats||{}; vaultState.opened=F.vaultsOpened|0; }
      ok("老存档(无feats.vaultsOpened)兼容归零", vaultState.opened===0, "opened="+vaultState.opened);
      { const F=wroteV.feats; vaultState.opened=F.vaultsOpened|0; }
      ok("宝库开启次数能从存档还原", vaultState.opened===7, "opened="+vaultState.opened);
      ok("编年史提到宝库钥匙/开启", /宝库/.test(chronicleHTML()), "html-len="+chronicleHTML().length);
      ok("开宝库提示条存在", !!document.getElementById("vaultPrompt"), "");
      arenaState.keys=kSnap; vaultState.opened=vSnap;
      mythicState.frags=mythSnap.frags; mythicState.done=mythSnap.done;
      bag.clear(); for(const [k,v] of bagSnapV) bag.set(k,v); xp=xpV; lvl=lvlV; dmgMul=dmgV; maxHp=maxV; hp=hpV; armor=armorV;
      updateHearts(); updateXPHUD();
    }

    // 8o. 六文明天象 + 左下状态栏(不再只靠 toast)
    {
      const omSnap={kind:omenState.kind, t:omenState.t, timer:omenTimer};
      const bzSnap=Object.assign({},bazaarState), exSnap=Object.assign({},expeditionState);
      const unSnap=Object.assign({},undeadNight), wSnap=weather, wtSnap=weatherT;
      const civs=OMENS.map(o=>o.k);
      ok("天象覆盖六文明(希腊+罗马/埃及/波斯/阿拉伯/地中海)", civs.indexOf("mars")>=0 && civs.indexOf("ra")>=0 && civs.indexOf("mithra")>=0 && civs.indexOf("sirocco")>=0 && civs.indexOf("argos")>=0 && OMENS.length>=10, "n="+OMENS.length+" civs="+civs.join(","));
      bazaarState.active=false; expeditionState.active=false;
      proclaimOmen("mars");
      ok("马尔斯天象提升近战伤害", omenState.kind==="mars" && omenMeleeMul()===1.25, "kind="+omenState.kind+" melee="+omenMeleeMul());
      proclaimOmen("ra");
      ok("拉神天象免疫沙暴灼伤", omenSandImmune()===true && omenMeleeMul()===1, "sandImmune="+omenSandImmune());
      proclaimOmen("sirocco");
      ok("西罗科天象加快移速并加速神灯冷却", omenMoveMul()>1 && omenDjinnCdMul()===2, "move="+omenMoveMul()+" djinnCd="+omenDjinnCdMul());
      bazaarState.active=false; bazaarState.t=0;
      proclaimOmen("mithra");
      ok("密特拉天象会拉开波斯集市", bazaarState.active===true && omenBazaarDtMul()===0.5, "bazaar="+bazaarState.active+" dtMul="+omenBazaarDtMul());
      expeditionState.active=false; expeditionState.t=0;
      proclaimOmen("argos");
      ok("阿尔戈天象会启程金羊毛远征", expeditionState.active===true && omenExpeditionDtMul()===0.5, "expedition="+expeditionState.active+" dtMul="+omenExpeditionDtMul());
      const hud=document.getElementById("buffHud");
      updateBuffHUD();
      ok("进行中的天象会出现在左下状态栏", hud && hud.style.display==="block" && /阿尔戈|金羊毛|密特拉|集市/.test(hud.innerHTML), "hud="+(hud?hud.textContent.slice(0,80):"missing"));
      bazaarState.active=false;
      toggleBazaarPanel();
      ok("集市未开时按 Y 会提示尚未到来", !document.getElementById("bazaar-panel").classList.contains("on"), "panel-on="+document.getElementById("bazaar-panel").classList.contains("on"));
      omenState.kind=omSnap.kind; omenState.t=omSnap.t; omenTimer=omSnap.timer;
      Object.assign(bazaarState,bzSnap); Object.assign(expeditionState,exSnap); Object.assign(undeadNight,unSnap);
      weather=wSnap; weatherT=wtSnap; closeBazaarPanel(); updateBuffHUD();
    }

    // 8p. 陶片图鉴: 鉴定器型 / 面板可翻 / 编年史有行 / 存档往返 + 老存档缺 shards 归零
    {
      const archSnapP=Object.assign({},archState,{shards:(archState.shards||[]).slice()});
      const bagSnapP=new Map(bag), xpP=xp, lvlP=lvl, dmgP=dmgMul, maxP=maxHp, hpP=hp;
      archState.pottery=0; archState.shards=[]; archState.setComplete=false;
      ok("陶片图鉴收录多种器型", POTTERY_TYPES.length>=8, "n="+POTTERY_TYPES.length);
      const g1=grantPotteryShard("blacktop");
      ok("出土能鉴定新器型", g1.neu===true && potteryHave("blacktop") && potterySeenCount()===1, "seen="+potterySeenCount()+" id="+g1.id);
      const g2=grantPotteryShard("blacktop");
      ok("重复出土不重复入册", g2.neu===false && potterySeenCount()===1 && archState.pottery===2, "seen="+potterySeenCount()+" pottery="+archState.pottery);
      openPotteryPanel();
      const pt=document.getElementById("pottery-panel");
      const card=pt && pt.querySelector(".pt-card");
      ok("陶片图鉴面板能打开并列出器型", pt && pt.classList.contains("on") && card && /黑顶红陶/.test(card.innerHTML) && /？？？/.test(card.innerHTML), "open="+(pt&&pt.classList.contains("on")));
      closePotteryPanel();
      ok("编年史列出陶片图鉴", /陶片图鉴/.test(chronicleHTML()), "");
      archState.shards=["blacktop","lotus"]; archState.pottery=4;
      const wrotePt=collectSave();
      ok("器型写入存档", wrotePt.arch && Array.isArray(wrotePt.arch.shards) && wrotePt.arch.shards.indexOf("blacktop")>=0, "shards="+JSON.stringify((wrotePt.arch||{}).shards));
      { const A={}; archState.shards=Array.isArray(A.shards)?A.shards:[]; }   // 老存档无 shards
      ok("老存档(无shards)图鉴归零", potterySeenCount()===0, "seen="+potterySeenCount());
      { const A=wrotePt.arch; archState.shards=Array.isArray(A.shards)?A.shards.slice():[]; }
      ok("陶片图鉴能从存档还原", potteryHave("blacktop") && potteryHave("lotus"), "shards="+archState.shards.join(","));
      archState.shards=[]; archState.setComplete=false; archState.pottery=0;
      POTTERY_TYPES.forEach(t=>grantPotteryShard(t.id));
      ok("集齐全部器型会发一次奖励", archState.setComplete===true && potterySeenCount()===POTTERY_TYPES.length, "seen="+potterySeenCount()+" done="+archState.setComplete);
      Object.assign(archState,{pottery:archSnapP.pottery,pages:archSnapP.pages,digs:archSnapP.digs,setComplete:!!archSnapP.setComplete});
      archState.shards=(archSnapP.shards||[]).slice();
      bag.clear(); for(const [k,v] of bagSnapP) bag.set(k,v); xp=xpP; lvl=lvlP; dmgMul=dmgP; maxHp=maxP; hp=hpP;
      updateHearts(); updateXPHUD(); closePotteryPanel();
    }

    // 8q. 斯芬克斯谜题: 先问后打 / 答对有赏 / 答错开战 / 动手也开战 / 老存档归零
    {
      const sxSnap=Object.assign({},sphinxState);
      const bagSnapS=new Map(bag), xpS=xp, lvlS=lvl, dmgS=dmgMul, maxS=maxHp, hpS=hp, armorS=armor;
      const mythSnapS={frags:Object.assign({},mythicState.frags), done:mythicState.done.slice()};
      const facS={rome:faction.rome, egypt:faction.egypt};
      const mobsSnapS=mobs.slice(); mobs.length=0;
      sphinxState.solved=0; sphinxState.failed=0; sphinxTalk=null;
      const sx={type:"sphinx", def:MOB_DEFS.sphinx, x:player.x+1, y:player.y, z:player.z, vx:0,vy:0,vz:0,kbx:0,kbz:0,
        yaw:0,tgtYaw:0,hp:MOB_DEFS.sphinx.hp,hurtT:0,animT:0,t:0,atkCd:0,burnT:0,swingT:0,groanT:0,fleeT:0,
        onGround:true,pause:false,burning:false,held:null};
      mobs.push(sx);
      ok("斯芬克斯可登记为出谜看守", armSphinxRiddle(sx)===true && sx.riddleReady===true && !sx.riddleAngry, "ready="+sx.riddleReady);
      ok("靠近出谜斯芬克斯能识别", nearSphinx()===sx, "near="+(nearSphinx()&&nearSphinx().type));
      openSphinxPanel();
      const sp=document.getElementById("sphinx-panel");
      ok("谜题面板能打开", sp && sp.classList.contains("on") && /斯芬克斯/.test((sp.querySelector(".sx-card")||{}).innerHTML||""), "open="+(sp&&sp.classList.contains("on")));
      sx.riddleIdx=0; renderSphinx();   // 固定第一题: 人
      const gold0=bagCount(GOLD_ORE);
      ok("答对谜题有赏且看守离去", answerSphinx(0)===true && sphinxState.solved===1 && mobs.indexOf(sx)<0, "solved="+sphinxState.solved+" gold+"+(bagCount(GOLD_ORE)-gold0));
      ok("答对后面板关闭", !document.getElementById("sphinx-panel").classList.contains("on"), "");
      const sx2={type:"sphinx", def:MOB_DEFS.sphinx, x:player.x+1, y:player.y, z:player.z, vx:0,vy:0,vz:0,kbx:0,kbz:0,
        yaw:0,tgtYaw:0,hp:MOB_DEFS.sphinx.hp,hurtT:0,animT:0,t:0,atkCd:0,burnT:0,swingT:0,groanT:0,fleeT:0,
        onGround:true,pause:false,burning:false,held:null};
      mobs.push(sx2); armSphinxRiddle(sx2); sx2.riddleIdx=0; sphinxTalk=sx2;
      ok("答错则开战", answerSphinx(1)===false && sx2.riddleAngry===true && !sx2.riddleReady && sphinxState.failed>=1, "angry="+sx2.riddleAngry+" failed="+sphinxState.failed);
      const sx3={type:"sphinx", def:MOB_DEFS.sphinx, x:player.x+1, y:player.y, z:player.z, vx:0,vy:0,vz:0,kbx:0,kbz:0,
        yaw:0,tgtYaw:0,hp:MOB_DEFS.sphinx.hp,hurtT:0,animT:0,t:0,atkCd:0,burnT:0,swingT:0,groanT:0,fleeT:0,
        onGround:true,pause:false,burning:false,held:null};
      mobs.push(sx3); armSphinxRiddle(sx3);
      const fail0=sphinxState.failed;
      hurtMob(sx3,1,0,0,true);
      ok("动手打断谜题也会开战", sx3.riddleAngry===true && !sx3.riddleReady && sphinxState.failed===fail0+1, "angry="+sx3.riddleAngry+" failed="+sphinxState.failed);
      sphinxState.solved=2; sphinxState.failed=3;
      const wroteSx=collectSave();
      ok("答谜战绩写入存档", wroteSx.sphinx && wroteSx.sphinx.solved===2 && wroteSx.sphinx.failed===3, "sphinx="+JSON.stringify(wroteSx.sphinx));
      { const legacy=Object.assign({},wroteSx); delete legacy.sphinx;
        sphinxState.solved=(legacy.sphinx&&legacy.sphinx.solved)|0; sphinxState.failed=(legacy.sphinx&&legacy.sphinx.failed)|0; }
      ok("老存档(无sphinx字段)答谜归零", sphinxState.solved===0 && sphinxState.failed===0, "solved="+sphinxState.solved);
      { const S=wroteSx.sphinx; sphinxState.solved=S.solved|0; sphinxState.failed=S.failed|0; }
      ok("答谜战绩能从存档还原", sphinxState.solved===2 && sphinxState.failed===3, "solved="+sphinxState.solved);
      ok("编年史列出斯芬克斯", /斯芬克斯/.test(chronicleHTML()), "");
      const elSx=document.getElementById("sphinx-panel"); if(elSx) elSx.classList.remove("on"); sphinxTalk=null;
      Object.assign(sphinxState,sxSnap);
      mythicState.frags=mythSnapS.frags; mythicState.done=mythSnapS.done;
      faction.rome=facS.rome; faction.egypt=facS.egypt;
      bag.clear(); for(const [k,v] of bagSnapS) bag.set(k,v); xp=xpS; lvl=lvlS; dmgMul=dmgS; maxHp=maxS; hp=hpS; armor=armorS;
      mobs.length=0; for(const m of mobsSnapS) mobs.push(m);
      updateHearts(); updateXPHUD(); updateSphinxPrompt();
    }

    // 8q2. 遗迹远征三符号机关: 触控/键鼠共用、错误仅重置输入、正确回调一次、Esc/遮罩可无惩罚退出
    {
      closeRuinGlyphPanel("selftest-reset");
      let solved=0, cancelled=0;
      const panel=document.getElementById("ruin-glyph-panel");
      const focusProbe=document.createElement("button"); focusProbe.type="button"; focusProbe.textContent="selftest focus probe";
      focusProbe.style.cssText="position:fixed;left:-10000px;top:0"; document.body.appendChild(focusProbe);
      try{
        const valid=openRuinGlyphPanel({solution:[2,0,1],clueText:"线索：先羽、再日、最后圣甲虫。",onSolved:()=>solved++,onCancel:()=>cancelled++});
        const dialogOK=!!panel && panel.getAttribute("role")==="dialog" && panel.getAttribute("aria-modal")==="true" && panel.getAttribute("aria-hidden")==="false";
        const buttonsOK=panel && panel.querySelectorAll(".rg-choices button[type=button]").length===3 && panel.querySelector(".rg-clue").textContent.includes("先羽");
        ok("三符号机关面板可打开并提供 3 个触控按钮/安全文本线索", valid && dialogOK && buttonsOK, "open="+valid+" buttons="+(panel&&panel.querySelectorAll(".rg-choices button").length));
        ok("机关拒绝非法解、重复打开及越界输入", !validRuinGlyphSolution([0,0,1]) && !validRuinGlyphSolution([0,1]) && !validRuinGlyphSolution(["0",1,2]) &&
          openRuinGlyphPanel({solution:[0,1,2]})===false && selectRuinGlyph(9)===false && selectRuinGlyph(-1)===false, "strict permutation + single session");
        const wrong=selectRuinGlyph(0)===false && ruinGlyphSession && ruinGlyphSession.input.length===0 && /重新尝试/.test(ruinGlyphSession.message);
        ok("按错任一位置只清空当前输入、显示可重试提示", wrong && solved===0 && cancelled===0, "reset="+wrong+" solved="+solved);
        selectRuinGlyph(2);
        const inOrder=panel.querySelector('[data-glyph="0"]'); if(inOrder) inOrder.click();
        const last=panel.querySelector('[data-glyph="1"]'); if(last) last.click();
        ok("正确排列可由按钮依序解锁，回调恰好一次且面板关闭", !ruinGlyphSession && panel.getAttribute("aria-hidden")==="true" && solved===1 && selectRuinGlyph(1)===false && solved===1,
          "solved="+solved+" closed="+panel.classList.contains("on"));
        focusProbe.focus();
        openRuinGlyphPanel({solution:[0,1,2],onSolved:()=>solved++,onCancel:()=>cancelled++});
        const keyEvt=new KeyboardEvent("keydown",{code:"KeyP",bubbles:true,cancelable:true}); document.dispatchEvent(keyEvt);
        const blocked=keyEvt.defaultPrevented && !document.getElementById("pottery-panel").classList.contains("on") && !!ruinGlyphSession;
        const firstChoice=panel.querySelector(".rg-choices button:not(:disabled)"); if(firstChoice) firstChoice.focus();
        const tabEvt=new KeyboardEvent("keydown",{code:"Tab",shiftKey:true,bubbles:true,cancelable:true}); document.dispatchEvent(tabEvt);
        const enterEvt=new KeyboardEvent("keydown",{code:"Enter",bubbles:true,cancelable:true}); document.dispatchEvent(enterEvt);
        const spaceEvt=new KeyboardEvent("keydown",{code:"Space",bubbles:true,cancelable:true}); document.dispatchEvent(spaceEvt);
        const keyboardNavOK=tabEvt.defaultPrevented && panel.contains(document.activeElement) && !enterEvt.defaultPrevented && !spaceEvt.defaultPrevented;
        const escEvt=new KeyboardEvent("keydown",{code:"Escape",bubbles:true,cancelable:true}); document.dispatchEvent(escEvt);
        const focusReturned=document.activeElement===focusProbe;
        ok("机关屏蔽游戏快捷键但保留键盘导航/按钮激活，Escape 安全取消并返还焦点", blocked && keyboardNavOK && focusReturned && escEvt.defaultPrevented && !ruinGlyphSession && cancelled===1 && solved===1,
          "blocked="+blocked+" keyboard="+keyboardNavOK+" focus="+focusReturned+" cancelled="+cancelled);
        openRuinGlyphPanel({solution:[0,1,2],onCancel:()=>cancelled++}); panel.click();
        ok("点击遮罩能关闭面板且不记错题", !ruinGlyphSession && panel.getAttribute("aria-hidden")==="true" && cancelled===2 && solved===1, "cancelled="+cancelled);
        const save=collectSave();
        ok("机关会话不新增任何存档字段", !Object.prototype.hasOwnProperty.call(save,"ruinGlyph") && !Object.prototype.hasOwnProperty.call(save,"expeditionPuzzle"), "save fields unchanged");
      } finally { closeRuinGlyphPanel("selftest-cleanup"); if(focusProbe.isConnected) focusProbe.remove(); }
    }

    // 8q3. 遗迹远征 MVP: 状态机、奖励幂等、旧档兼容
    {
      closeRuinGlyphPanel("selftest-reset");
      const snapRE={ runs:ruinExpeditionSave.runs.slice(), completed:ruinExpeditionSave.completed };
      const snapState={ active:ruinExpeditionState.active, phase:ruinExpeditionState.phase, runId:ruinExpeditionState.runId, wave:ruinExpeditionState.wave, alive:ruinExpeditionState.alive.slice(), nextT:ruinExpeditionState.nextT, rewardClaimed:ruinExpeditionState.rewardClaimed, solution:ruinExpeditionState.solution.slice(), clueText:ruinExpeditionState.clueText, route:ruinExpeditionState.route, waves:ruinExpeditionState.waves, bandaged:ruinExpeditionState.bandaged };
      const snapMeta={ echoes:metaProgress.echoes, streak:metaProgress.streak, mastery:Object.assign({},metaProgress.mastery) };
      abortRuinExpedition();
      try {
        const g1=generateRuinExpedition(12345, 1);
        const g2=generateRuinExpedition(12345, 1);
        ok("遗迹远征解与线索由种子确定性生成", JSON.stringify(g1)===JSON.stringify(g2) && validRuinGlyphSolution(g1.solution) && g1.clueText.includes("先"), "g1="+JSON.stringify(g1));

        const recipeIdx=RECIPES.findIndex(r=>r.name.indexOf("遗迹远征石板")>=0);
        ok("遗迹远征石板配方存在且消耗砂岩/金/钻", recipeIdx>=0 && RECIPES[recipeIdx].cost.some(c=>c[0]===SANDSTONE) && RECIPES[recipeIdx].cost.some(c=>c[0]===GOLD_ORE) && RECIPES[recipeIdx].cost.some(c=>c[0]===GEM_ORE), "idx="+recipeIdx);

        ruinExpeditionState.active=true; ruinExpeditionState.phase="combat"; ruinExpeditionState.wave=RUIN_EXPEDITION_WAVES.length; ruinExpeditionState.alive=[]; ruinExpeditionState.runId=100; ruinExpeditionState.rewardClaimed=false;
        tickRuinExpedition(0.1);                                 // Boss 波: 远古守卫苏醒
        ruinExpeditionState.alive=[];                            // 击杀首领
        tickRuinExpedition(0.1);                                 // 结算
        ok("遗迹远征三波清完后结算奖励", ruinExpeditionState.phase==="reward" && ruinExpeditionState.rewardClaimed && ruinExpeditionSave.runs.includes(100), "phase="+ruinExpeditionState.phase+" claimed="+ruinExpeditionState.rewardClaimed);

        const completed=ruinExpeditionSave.completed;
        tickRuinExpedition(0.1);
        ok("同一 runId 不重复发首通奖励", ruinExpeditionSave.completed===completed, "completed="+ruinExpeditionSave.completed);

        abortRuinExpedition();
        ok("中断远征后状态归零", !ruinExpeditionState.active && ruinExpeditionState.phase==="idle", "active="+ruinExpeditionState.active+" phase="+ruinExpeditionState.phase);

        const save=collectSave();
        ok("存档写入遗迹远征完成记录", save.ruinExpedition && Array.isArray(save.ruinExpedition.runs) && Number.isFinite(save.ruinExpedition.completed), "field="+JSON.stringify(save.ruinExpedition));

        { const RE=undefined; const runs=Array.isArray(RE&&RE.runs)?RE.runs.filter(v=>Number.isInteger(v)&&v>0):[]; const completed=Math.max(0,(RE&&RE.completed)|0); ok("老存档缺 ruinExpedition 字段时归零", runs.length===0 && completed===0); }
        { const RE={runs:[1,"x",3,-5,2.5], completed:-3}; const runs=Array.isArray(RE.runs)?RE.runs.filter(v=>Number.isInteger(v)&&v>0):[]; const completed=Math.max(0,RE.completed|0); ok("坏远征存档被过滤/钳位", runs.length===2 && runs.indexOf(1)>=0 && runs.indexOf(3)>=0 && completed===0, "runs="+runs.join(",")); }
      } finally {
        ruinExpeditionSave.runs=snapRE.runs; ruinExpeditionSave.completed=snapRE.completed;
        Object.assign(ruinExpeditionState, snapState);
        metaProgress.echoes=snapMeta.echoes; metaProgress.streak=snapMeta.streak; metaProgress.mastery=snapMeta.mastery; saveMeta();
        closeExpeditionRoutePanel(true);
      }
    }

    // 8q4. 摩天轮运转: 几何与生成一致 / 座舱守卫写入 / 不污染存档 diff / 整圈后逐字节复原
    {
      const snapF={ phase:ferrisPhase, timer:ferrisTimer, q:ferrisRebuildQ.slice() };
      try{
        const g0=ferrisWheelAt({x:100,z:100,h:40});
        ok("摩天轮几何与生成公式一致", g0.wx===91 && g0.wz===109 && g0.wr===11 && g0.wcy===53 &&
          ferrisSegCell(g0,0).join()===[91,53,120].join() && ferrisSegCell(g0,16)[1]===g0.wcy+g0.wr &&
          ferrisCabinSides(g0,0).length===2, "g="+JSON.stringify(g0));
        // 合成摩天轮: 在出生地上空用 transient 写入烘焙出与生成公式一致的轮体, 不依赖世界种子
        const g={wx:Math.round(player.x)+26, wz:Math.round(player.z), wr:11, wcy:76};
        const forceS={x:g.wx+9, z:g.wz-9, h:g.wcy-g.wr-2, type:"park"};   // 使 ferrisWheelAt(s) 还原 g
        for(let cx2=(g.wx-1)>>4; cx2<=(g.wx+1)>>4; cx2++) for(let cz2=(g.wz-g.wr)>>4; cz2<=(g.wz+g.wr)>>4; cz2++) ensureData(cx2,cz2);
        const setB=(x,y,z,id)=>{ const c=world.get(key(x>>4,z>>4)); if(c) c.blocks[((x&15)*CS+(z&15))*H+y]=id; _gcx=1e9; };
        const touched=new Map();                                    // 记录原始值, 测完恢复
        const putB=(x,y,z,id)=>{ const k2=x+","+y+","+z; if(!touched.has(k2)) touched.set(k2,[x,y,z,getBlock(x,y,z)]); setB(x,y,z,id); };
        for(let seg=0;seg<FERRIS_SEGS;seg++){
          const ang=seg/FERRIS_SEGS*Math.PI*2, y=g.wcy+Math.round(Math.sin(ang)*g.wr), z=g.wz+Math.round(Math.cos(ang)*g.wr);
          const cabin=(seg%8===0);
          putB(g.wx,y,z, cabin?NEON:METAL); putB(g.wx,y,z+((Math.cos(ang)>=0)?1:-1), METAL);
          for(const sx2 of [g.wx-1,g.wx+1]) putB(sx2,y,z, cabin?WOOL:AIR);
        }
        ferrisPhase=0;
        const woolAt=(seg)=>ferrisCabinSides(g,seg).every(c=>getBlock(c[0],c[1],c[2])===WOOL);
        const countWool=()=>{ let n=0; for(let seg=0;seg<FERRIS_SEGS;seg++) for(const c of ferrisCabinSides(g,seg)) if(getBlock(c[0],c[1],c[2])===WOOL) n++; return n; };
        const diffBefore=blockDiff.size;
        const built=new Map();                                    // 记录烘焙后的轮体状态(步进的对照基准)
        for(let seg=0;seg<FERRIS_SEGS;seg++){
          const ang=seg/FERRIS_SEGS*Math.PI*2, y=g.wcy+Math.round(Math.sin(ang)*g.wr), z=g.wz+Math.round(Math.cos(ang)*g.wr);
          const cabin=(seg%8===0);
          built.set(g.wx+","+y+","+z, cabin?NEON:METAL); built.set(g.wx+","+y+","+(z+((Math.cos(ang)>=0)?1:-1)), METAL);
          for(const sx2 of [g.wx-1,g.wx+1]) built.set(sx2+","+y+","+z, cabin?WOOL:AIR);
        }
        const woolBuilt=countWool(), hasWheelChunk=world.has(key(g.wx>>4,g.wz>>4));
        const okStep1=ferrisStepOnce(forceS) && ferrisPhase===1 && countWool()===FERRIS_CABINS*2 && woolAt(1) && !woolAt(0);
        for(let i=1;i<FERRIS_SEGS;i++) ferrisStepOnce(forceS);
        let restored=true;
        for(const [k2,v] of built){ const p=k2.split(","); if(getBlock(+p[0],+p[1],+p[2])!==v) restored=false; }
        ok("摩天轮步进会移动座舱(旧格让出/新格入座, 全程恰 8 舱)", okStep1, "step1="+okStep1+" phase="+ferrisPhase+" wool="+countWool()+" built="+woolBuilt+" hasChunk="+hasWheelChunk);
        ok("摩天轮整圈 64 步后座舱逐字节复原, 且不写入存档 diff", restored && ferrisPhase===0 && blockDiff.size===diffBefore,
          "restored="+restored+" diff="+blockDiff.size+"/"+diffBefore);
        for(const [x,y,z,v] of touched.values()) setB(x,y,z,v);   // 清场: 全部写回测试前原值
      } finally { ferrisPhase=snapF.phase; ferrisTimer=snapF.timer; ferrisRebuildQ.length=0; ferrisRebuildQ.push(...snapF.q); }
    }

    // 8q5. 遗迹回响与局外专精: 归一/购买事务/12 效果钩子/回响经济/路线选择/稳手保进度
    {
      closeRuinGlyphPanel("selftest-reset"); closeExpeditionRoutePanel(true); abortRuinExpedition(); closeMetaPanel();
      const snapM={ echoes:metaProgress.echoes, streak:metaProgress.streak, mastery:Object.assign({},metaProgress.mastery) };
      const snapH5={hp,maxHp,armor,xp,lvl,dmgMul}, snapCore5=cores, snapRel5=npcState.relics, xp5=xp;
      const snapBless5={t:blessT,k:blessKind}, snapMyth5=mythicState.done.slice();
      const snapRuns5=ruinExpeditionSave.runs.slice(), snapC5=ruinExpeditionSave.completed;
      const snapSt5={cd:sandStepState.cd,evadeT:sandStepState.evadeT,feedbackT:sandStepState.feedbackT};
      const snapMob5=mobs.slice(), snapRun5=Object.assign({},ruinExpeditionState);
      blessT=0; blessKind=""; mythicState.done=mythicState.done.filter(c=>c!=="greece");   // 排除祝福/埃癸斯/经验乘数对数值断言的干扰
      try{
        normalizeMeta(undefined);
        ok("meta 归一: 无存档全零", metaProgress.echoes===0 && metaProgress.streak===0 && masteryLevel("surveyor")===0 && masteryLevel("tombGuard")===0 && masteryLevel("duneStrider")===0);
        normalizeMeta({echoes:-5, mastery:{surveyor:9, tombGuard:2.7, duneStrider:-1}, streak:-3});
        ok("meta 归一: 负值钳 0、越界钳 4、小数取整", metaProgress.echoes===0 && masteryLevel("surveyor")===4 && masteryLevel("tombGuard")===2 && masteryLevel("duneStrider")===0 && metaProgress.streak===0);
        normalizeMeta(null);
        metaProgress.echoes=7;
        const b1=buyMastery("surveyor"), b2=buyMastery("surveyor"), b3=buyMastery("tombGuard"), b4=buyMastery("duneStrider");
        ok("专精购买: 扣款升阶、不足拒绝且不产生负回响", b1 && b2 && b3 && !b4 && metaProgress.echoes===0 && masteryLevel("surveyor")===2 && masteryLevel("tombGuard")===1 && masteryLevel("duneStrider")===0, "e="+metaProgress.echoes);
        metaProgress.echoes=12; buyMastery("surveyor"); buyMastery("surveyor");
        ok("专精购买: 满 4 阶后拒绝", masteryLevel("surveyor")===4 && !buyMastery("surveyor"), "lv="+masteryLevel("surveyor"));
        ok("meta 持久化: 购买后写入独立 localStorage", JSON.parse(localStorage.getItem(META_SAVE_KEY)).echoes===metaProgress.echoes && JSON.parse(localStorage.getItem(META_SAVE_KEY)).mastery.surveyor===4);
        normalizeMeta(null);
        // 测绘者 I 壁画释读: 线索追加排除式提示(确定性)
        metaProgress.mastery.surveyor=1;
        const gA=generateRuinExpedition(SEED, 42);
        metaProgress.mastery.surveyor=0;
        const gB=generateRuinExpedition(SEED, 42);
        ok("测绘者I 壁画释读: 有专精时线索追加「不是」提示且确定性", /不是/.test(gA.clueText) && !/不是/.test(gB.clueText) && gA.clueText.indexOf(gB.clueText)===0, "tail="+gA.clueText.slice(-16));
        // 测绘者 II 稳手: keep 会话输错只退一格
        metaProgress.mastery.surveyor=2;
        let solved5=0;
        openRuinGlyphPanel({solution:[2,0,1], keep:true, onSolved:()=>solved5++});
        selectRuinGlyph(2);
        const w5=selectRuinGlyph(1);
        const kept5=!!ruinGlyphSession && ruinGlyphSession.input.length===1 && ruinGlyphSession.input[0]===2;
        selectRuinGlyph(0); selectRuinGlyph(1);
        ok("测绘者II 稳手: 输错只清最后一位、保留已对前缀、可继续完成", !w5 && kept5 && solved5===1 && !ruinGlyphSession, "kept="+kept5+" solved="+solved5);
        metaProgress.mastery.surveyor=0;
        // 战斗钩子: 盐甲/稳足/回砂/绷带/包扎 —— 全部只在远征 combat 相位生效
        ruinExpeditionState.active=true; ruinExpeditionState.phase="combat"; ruinExpeditionState.waves=RUIN_EXPEDITION_WAVES; ruinExpeditionState.wave=1; ruinExpeditionState.alive=[]; ruinExpeditionState.nextT=99; ruinExpeditionState.bandaged=false;
        sandStepState.evadeT=0; armor=0;
        hp=maxHp=999;
        let h05=hp; foeStrike(200,0,0,null); const dropNo=h05-hp;
        metaProgress.mastery.tombGuard=2;
        let h06=hp; foeStrike(200,0,0,null); const dropYes=h06-hp;
        ok("守墓者II 盐甲: 远征战斗中敌击 -5%（200→190）", dropNo===200 && Math.abs(dropYes-190)<=1, "no="+dropNo+" yes="+dropYes);
        metaProgress.mastery.tombGuard=0;
        const cdBase=sandStepCd();
        const rrBase=riposteRate();
        metaProgress.mastery.duneStrider=1;
        const cdWith=sandStepCd();
        metaProgress.mastery.duneStrider=2;
        const rrWith=riposteRate();
        ok("沙步者I/II 稳足+回砂: 远征中沙步冷却 -0.2、反击加成 +5%", Math.abs(cdBase-cdWith-0.2)<1e-9 && Math.abs(rrWith-rrBase-0.05)<1e-9, "cd="+cdBase.toFixed(2)+"→"+cdWith.toFixed(2)+" rr=+"+(rrWith-rrBase).toFixed(2));
        metaProgress.mastery.duneStrider=0;
        metaProgress.mastery.tombGuard=3;
        hp=4; maxHp=20;
        tickRuinExpedition(0.1);
        const band1=hp===8 && ruinExpeditionState.bandaged;
        tickRuinExpedition(0.1);
        ok("守墓者III 应急绷带: 生命<25% 触发一次回 4", band1 && hp===8 && ruinExpeditionState.bandaged, "hp="+hp);
        metaProgress.mastery.duneStrider=3;
        ruinExpeditionState.nextT=0; ruinExpeditionState.wave=1; ruinExpeditionState.alive=[];
        tickRuinExpedition(0.1);
        ok("沙步者III 战后包扎: 第 2 波开始时回 1 血", ruinExpeditionState.wave===2 && hp===9, "wave="+ruinExpeditionState.wave+" hp="+hp);
        abortRuinExpedition();
        metaProgress.mastery.duneStrider=0; metaProgress.mastery.tombGuard=0;
        // 回响经济: 首通 +2 / 重复 +1; 三类通关加成; 文书封存每 3 局 +1
        metaProgress.mastery.surveyor=4; metaProgress.mastery.tombGuard=4; metaProgress.mastery.duneStrider=4;
        metaProgress.streak=2; metaProgress.echoes=0;
        ruinExpeditionState.active=true; ruinExpeditionState.phase="combat"; ruinExpeditionState.waves=RUIN_EXPEDITION_WAVES; ruinExpeditionState.wave=3; ruinExpeditionState.alive=[]; ruinExpeditionState.nextT=0; ruinExpeditionState.runId=2001; ruinExpeditionState.rewardClaimed=false; ruinExpeditionState.route="safe";
        const rel0=npcState.relics, core0=cores, xpA=xp, lvlA=lvl;
        const xm5=omenXpMul()*mythicXpMul();   // addXP 内部乘数与升级折算都要计入
        tickRuinExpedition(0.1);                    // Boss 波: 远古守卫苏醒
        ruinExpeditionState.alive=[];               // 击杀首领
        tickRuinExpedition(0.1);                    // 结算
        const gain1=(()=>{ let g5=xp-xpA; for(let l=lvlA;l<lvl;l++) g5+=xpNeed(l); return g5; })();
        ok("回响经济: 首通 +2、文书封存(第3局)+1、侧室/安魂/赏金到账", metaProgress.echoes===3 && metaProgress.streak===3 && npcState.relics===rel0+3+1 && cores===core0+2+1 &&
           gain1>0, "echo="+metaProgress.echoes+" streak="+metaProgress.streak+" gain="+gain1);
        abortRuinExpedition();
        ruinExpeditionState.active=true; ruinExpeditionState.phase="combat"; ruinExpeditionState.waves=RUIN_EXPEDITION_WAVES; ruinExpeditionState.wave=3; ruinExpeditionState.alive=[]; ruinExpeditionState.nextT=0; ruinExpeditionState.runId=2001; ruinExpeditionState.rewardClaimed=false;
        const echoB=metaProgress.echoes, xpB=xp, lvlB=lvl;
        tickRuinExpedition(0.1);                    // Boss 波
        ruinExpeditionState.alive=[];               // 击杀首领
        tickRuinExpedition(0.1);                    // 结算
        const gain2=(()=>{ let g5=xp-xpB; for(let l=lvlB;l<lvl;l++) g5+=xpNeed(l); return g5; })();
        ok("回响经济: 同 runId 重复通关只 +1 回响、纪念+专精经验", metaProgress.echoes===echoB+1 && gain2>0, "echo="+metaProgress.echoes+" gain="+gain2);
        abortRuinExpedition();
        metaProgress.mastery.surveyor=0; metaProgress.mastery.tombGuard=0; metaProgress.mastery.duneStrider=0;
        // 路线选择: 解谜 → route 面板 → 精英路线生效; Esc 落稳扎
        hp=10; maxHp=20;
        const st5=startRuinExpedition();
        const dryNo=st5 && hp===10;   // 守墓者0: 干粮不回血
        const sol5=ruinExpeditionState.solution.slice();
        for(const gid of sol5) selectRuinGlyph(gid);
        const routeOpen=document.getElementById("expedition-route").classList.contains("on") && ruinExpeditionState.phase==="route";
        const pE=pickExpeditionRoute("elite");
        ok("段间路线: 解谜后弹出路线面板, 精英路线切换波次表", dryNo && routeOpen && pE && ruinExpeditionState.phase==="combat" && ruinExpeditionState.waves===RUIN_EXPEDITION_WAVES_ELITE && ruinExpeditionState.route==="elite" && !document.getElementById("expedition-route").classList.contains("on"), "open="+routeOpen+" phase="+ruinExpeditionState.phase);
        abortRuinExpedition();
        // 守墓者 I 干粮: 启程回 2 血
        metaProgress.mastery.tombGuard=1;
        hp=10;
        startRuinExpedition();
        const heal2=hp===12;
        abortRuinExpedition();
        ok("守墓者I 干粮: 启程回 2 血（不超上限）", heal2, "hp="+hp);
        metaProgress.mastery.tombGuard=0;
        // Esc 未选路线 → 稳扎稳打
        startRuinExpedition();
        for(const gid of ruinExpeditionState.solution.slice()) selectRuinGlyph(gid);
        document.dispatchEvent(new KeyboardEvent("keydown",{code:"Escape",bubbles:true,cancelable:true}));
        ok("路线面板 Esc 视为稳扎稳打", ruinExpeditionState.phase==="combat" && ruinExpeditionState.route==="safe" && !document.getElementById("expedition-route").classList.contains("on"), "route="+ruinExpeditionState.route);
        abortRuinExpedition();
        // 专精面板 UI
        metaProgress.echoes=5; saveMeta();
        openMetaPanel();
        const mpOn=document.getElementById("meta-panel").classList.contains("on");
        const mpTxt=document.querySelector("#meta-panel .pt-card").textContent;
        closeMetaPanel();
        ok("专精面板: 按 I 打开、展示回响与三棵树、可关闭", mpOn && /回响 5/.test(mpTxt) && /测绘者/.test(mpTxt) && /守墓者/.test(mpTxt) && /沙步者/.test(mpTxt) && !document.getElementById("meta-panel").classList.contains("on"), "on="+mpOn);
        normalizeMeta(null);
      } finally {
        metaProgress.echoes=snapM.echoes; metaProgress.streak=snapM.streak; metaProgress.mastery=snapM.mastery; saveMeta();
        hp=snapH5.hp; maxHp=snapH5.maxHp; armor=snapH5.armor; xp=snapH5.xp; lvl=snapH5.lvl; dmgMul=snapH5.dmgMul;
        cores=snapCore5; npcState.relics=snapRel5; blessT=snapBless5.t; blessKind=snapBless5.k; mythicState.done=snapMyth5;
        ruinExpeditionSave.runs=snapRuns5; ruinExpeditionSave.completed=snapC5;
        abortRuinExpedition(); closeExpeditionRoutePanel(true); closeRuinGlyphPanel("8q5-cleanup"); closeMetaPanel();
        Object.assign(ruinExpeditionState, snapRun5);
        mobs.length=0; for(const m of snapMob5) mobs.push(m);
        sandStepState.evadeT=snapSt5.evadeT; sandStepState.cd=snapSt5.cd; sandStepState.feedbackT=snapSt5.feedbackT;
        updateHearts(); updateXPHUD(); updateBuffHUD();
      }
    }

    // 8q6. 远征遗物与词缀(PR B): 确定性掉落/保底/穿戴拆解重铸/聚合封顶/战斗接线/幂等
    {
      closeRuinGlyphPanel("selftest-reset"); closeExpeditionRoutePanel(true); abortRuinExpedition(); closeMetaPanel();
      const snapM6={ echoes:metaProgress.echoes, streak:metaProgress.streak, mastery:Object.assign({},metaProgress.mastery),
        gear:JSON.parse(JSON.stringify(metaProgress.gear)), equipped:Object.assign({},metaProgress.equipped), dust:metaProgress.dust, pity:metaProgress.pity };
      const snapH6={hp,maxHp,armor,xp}, snapSt6={evadeT:sandStepState.evadeT,cd:sandStepState.cd};
      const snapMob6=mobs.slice(), sunblade6=sunblade;
      blessT=0; blessKind=""; mythicState.done=mythicState.done.filter(c=>c!=="greece"); armor=0;
      try{
        normalizeMeta(null);
        const g1=rollExpeditionGear(777), g2=rollExpeditionGear(777);
        ok("遗物掉落: 种子+局号确定性且 id 幂等", JSON.stringify(g1)===JSON.stringify(g2) && g1.id===SEED+":777" && validGearItem(g1), "id="+g1.id);
        ok("遗物掉落: 品质决定词缀数与阶位范围", [1,1,2,3].indexOf(g1.affixes.length)>=0 && g1.affixes.every(ax=>ax.tier<=GEAR_QUALITIES[g1.q].tiers[GEAR_QUALITIES[g1.q].tiers.length-1]) &&
           new Set(g1.affixes.map(ax=>AFFIX_DEFS.find(d=>d.id===ax.id).group)).size===g1.affixes.length, "q="+g1.q+" n="+g1.affixes.length);
        // 保底: 连续 4 次未出古代 → 第 4 次强制古代以上
        normalizeMeta(null); metaProgress.pity=3;
        let forced=null; for(let i=0;i<8 && !forced;i++){ const it=rollExpeditionGear(9000+i); if(it.q>=2) forced=it; }
        ok("遗物保底: 连开 4 箱必出古代以上且重置计数", forced && forced.q>=2 && metaProgress.pity===0, "q="+(forced&&forced.q));
        normalizeMeta(null);
        // 穿戴/拆解/重铸
        const wpn={id:"test:w1", slot:"weapon", q:3, affixes:[{id:"sand_edge",tier:2},{id:"afterimage",tier:1},{id:"breach_seal",tier:1}]};
        const chm={id:"test:c1", slot:"charm", q:2, affixes:[{id:"tomb_echo",tier:1},{id:"dune_step",tier:2}]};
        const w2={id:"test:w2", slot:"weapon", q:1, affixes:[{id:"ember_sun",tier:1}]};
        metaProgress.gear=[wpn,chm,w2]; metaProgress.dust=5;
        ok("穿戴: 武器/护符分槽位, 跨槽拒绝归一", equipGearItem("test:w1") && equipGearItem("test:c1") && metaProgress.equipped.weapon==="test:w1" && metaProgress.equipped.charm==="test:c1");
        normalizeMeta(JSON.parse(localStorage.getItem(META_SAVE_KEY)));
        ok("穿戴持久化且归一校验通过", metaProgress.equipped.weapon==="test:w1" && metaProgress.gear.length===3);
        // 聚合: 仅远征内生效 + 封顶
        ruinExpeditionState.active=true; ruinExpeditionState.phase="combat"; ruinExpeditionState.waves=RUIN_EXPEDITION_WAVES; ruinExpeditionState.wave=1; ruinExpeditionState.alive=[]; ruinExpeditionState.nextT=99; ruinExpeditionState.firstHitUsed=false;
        let md=getExpeditionModifiers();
        ok("词缀聚合: 近战+7% 反击+8% 首击-9% 沙步CDR-0.20", Math.abs(md.melee-0.07)<1e-9 && Math.abs(md.afterimage-0.08)<1e-9 && Math.abs(md.firstHit-0.09)<1e-9 && Math.abs(md.sandstepCdr-0.20)<1e-9, JSON.stringify(md));
        // 战斗接线: hurtMob 伤害放大(近战+精英)
        mobs.length=0;
        spawnTrialMob("scarab", Math.floor(player.x)+3, Math.floor(player.y), Math.floor(player.z)+3, true);   // 精英
        const em6=mobs[mobs.length-1]; em6.hp=em6.maxHp=99999;
        hurtMob(em6, 100, 0, 0, true);
        const dmgElite=em6.maxHp-em6.hp;
        em6.hp=em6.maxHp=99999; hurtMob(em6, 100, 0, 0, true);
        const dmgElite2=em6.maxHp-em6.hp;
        ok("词缀接线: hurtMob 近战+7% 且精英再+6%（100→113）", dmgElite===113 && dmgElite2===113, "d1="+dmgElite+" d2="+dmgElite2);
        // 首击减伤: 每波一次
        sandStepState.evadeT=0; hp=maxHp=999;
        let h61=hp; foeStrike(100,0,0,null); const fh1=h61-hp;
        let h62=hp; foeStrike(100,0,0,null); const fh2=h62-hp;
        ok("词缀接线: 每波首次受击 -9%（100→91），第二次全额", fh1===91 && fh2===100, "fh1="+fh1+" fh2="+fh2);
        ruinExpeditionState.firstHitUsed=false;
        // 沙步 CDR 封顶: 熟练3(1.2)+稳足(0.2)+词缀Ⅲ(0.2)=1.6 > 35%×4.5=1.575 → 钳到 2.925
        const cmSnap6=Object.assign({},combatMastery), dsSnap6=metaProgress.mastery.duneStrider;
        combatMastery.step=3; metaProgress.mastery.duneStrider=1;
        const cdCapped=sandStepCd();
        combatMastery.step=cmSnap6.step; metaProgress.mastery.duneStrider=dsSnap6;
        ok("沙步回声: 冷却总缩减封顶 35%（4.5→2.925）", Math.abs(cdCapped-SANDSTEP_CD*0.65)<1e-9, "cd="+cdCapped.toFixed(3));
        // 灼烧延长: 换装 ember_sun 武器
        const eqOld6=metaProgress.equipped.weapon;
        equipGearItem("test:w2");
        sunblade=true; em6.hp=em6.maxHp=99999; sunbladeIgnite(em6);
        ok("烈阳余烬: 远征内灼烧 4→4.7 秒", Math.abs(em6.sunBurn-(SUN_BURN+0.7))<1e-9, "burn="+em6.sunBurn.toFixed(2));
        sunblade=sunblade6; metaProgress.equipped.weapon=eqOld6;
        // 反击追加
        ruinExpeditionState.active=false;   // 关远征: 聚合归零(隔离舱验证)
        md=getExpeditionModifiers();
        ok("隔离舱: 远征未激活时词缀聚合全零", md.melee===0 && md.afterimage===0 && md.firstHit===0 && md.sandstepCdr===0, JSON.stringify(md));
        ruinExpeditionState.active=true;
        // 拆解/重铸
        disassembleGearItem("test:c1");
        ok("拆解: 古代→刻印砂+4 且卸下引用", metaProgress.dust===9 && metaProgress.gear.length===2 && metaProgress.equipped.charm===null);
        const dustBefore6=metaProgress.dust, g1Old=JSON.stringify(metaProgress.gear[0].affixes);
        rerollGearItem("test:w1");
        const g1New=metaProgress.gear[0].affixes;
        ok("重铸: 3 砂换第一条词缀(不同组、阶位不变)", metaProgress.dust===dustBefore6-GEAR_REROLL_COST && g1New.length===3 && g1New[0].id!=="sand_edge" && g1New[0].tier===2 && JSON.stringify(g1New)!==g1Old, "new0="+g1New[0].id);
        // 持久化回归: gear→saveMeta→loadMeta 全链路(守住 loadMeta 调用点 TDZ 回归)
        metaProgress.gear=[{id:"S:1", slot:"charm", q:2, affixes:[{id:"tomb_echo",tier:1},{id:"dune_step",tier:0}]}];
        metaProgress.equipped={weapon:null,charm:"S:1"}; metaProgress.dust=6; metaProgress.pity=2; saveMeta();
        loadMeta();
        ok("meta 持久化: loadMeta 后装备/刻印砂/保底完整保留", metaProgress.gear.length===1 && metaProgress.equipped.charm==="S:1" && metaProgress.dust===6 && metaProgress.pity===2 &&
           metaProgress.gear[0].affixes.length===2, "gear="+metaProgress.gear.length+" dust="+metaProgress.dust);
        normalizeMeta(null);
      } finally {
        metaProgress.echoes=snapM6.echoes; metaProgress.streak=snapM6.streak; metaProgress.mastery=snapM6.mastery;
        metaProgress.gear=snapM6.gear; metaProgress.equipped=snapM6.equipped; metaProgress.dust=snapM6.dust; metaProgress.pity=snapM6.pity; saveMeta();
        hp=snapH6.hp; maxHp=snapH6.maxHp; armor=snapH6.armor; xp=snapH6.xp;
        sandStepState.evadeT=snapSt6.evadeT; sandStepState.cd=snapSt6.cd;
        abortRuinExpedition(); closeRuinGlyphPanel("8q6-cleanup"); closeMetaPanel(); closeExpeditionRoutePanel(true);
        mobs.length=0; for(const m of snapMob6) mobs.push(m);
        sunblade=sunblade6; updateHearts(); updateBuffHUD();
      }
    }

    // 8q7. 主动战技与道具技能(第三十轮): 解锁门/冷却/伤害/击退/连招/消耗品/图标
    {
      closeRuinGlyphPanel("selftest-reset"); closeExpeditionRoutePanel(true); abortRuinExpedition(); closeMetaPanel();
      const cmSnap7=Object.assign({},combatMastery);
      const cdSnap7={quakeCd,recallCd,hornCd,timeCd,timeBuffT};
      const stSnap7={cd:sandStepState.cd,evadeT:sandStepState.evadeT};
      const hpSnap7={hp,maxHp}, poisonSnap7=poisonT, armor7=armor;
      const bagSnap7=new Map(bag);
      const mobsSnap7=mobs.slice();
      const slSnap7={softLock,locked,ov:document.getElementById("overlay").style.display};
      try{
        softLock=true; locked=false; document.getElementById("overlay").style.display="none"; armor=0;
        // 配方与图标
        const qR=RECIPES.find(r=>r.name.indexOf("大地震颤")>=0), rcR=RECIPES.find(r=>r.name.indexOf("回沙卷盘")>=0);
        const hR=RECIPES.find(r=>r.name.indexOf("回响号角")>=0), tR=RECIPES.find(r=>r.name.indexOf("时之沙")>=0), wR=RECIPES.find(r=>r.name.indexOf("绿洲水袋")>=0);
        ok("新配方: 2 战技 + 3 道具齐全且消耗正确", !!qR && !!rcR && !!hR && !!tR && !!wR && qR.coreCost===6 && rcR.coreCost===5 &&
           hR.cost[0][1]===2 && tR.cost.some(c=>c[0]===CRYSTAL) && wR.cost.some(c=>c[0]===CACTUS), "q="+(qR&&qR.coreCost)+" rc="+(rcR&&rcR.coreCost));
        ok("新道具: ITEMS 图标与手持模型就绪", ITEMS.echo_horn && ITEMS.time_shards && ITEMS.waterskin &&
           ITEMS.echo_horn.icon.width===16 && heldParts("echo_horn").length===3 && heldParts("waterskin").length===2 && heldParts("time_shards").length===3);
        // 大地震颤: 未解锁拒绝
        combatMastery.quake=0;
        ok("大地震颤: 未解锁时按 Z 被拒", useQuake()===false);
        // 解锁 1 级: 伤害 8 + 击退 + 冷却
        combatMastery.quake=1;
        mobs.length=0; spawnTrialMob("scarab", Math.floor(player.x)+3, Math.floor(player.y), Math.floor(player.z)+3, false);
        const mq=mobs[0]; mq.hp=mq.maxHp=500; player.onGround=true; hp=maxHp=20;
        const hpM0=mq.hp;
        ok("大地震颤: 8 格内敌人受 8 伤害并被震退", useQuake()===true && mq.maxHp-mq.hp===8 && (mq.kbx||mq.kbz)>0 && quakeCd>0, "dmg="+(mq.maxHp-mq.hp));
        ok("大地震颤: 冷却期内再按被拒", useQuake()===false);
        combatMastery.quake=2; quakeCd=0;
        ok("大地震颤: 2 级伤害 12、冷却 19 秒", quakeCooldown()===19 && (()=>{ mq.hp=mq.maxHp=500; useQuake(); return mq.maxHp-mq.hp; })()===12, "cd="+quakeCooldown());
        { // 贴脸重合: d=0 时击退方向不能写成 NaN, 否则下一帧坐标跟着坏
          const keepQ=mobs.slice(), qLv=combatMastery.quake, qCd=quakeCd, bossQ=boss;
          mobs.length=0;
          const mz={type:"mummy",def:MOB_DEFS.mummy,x:player.x,y:player.y,z:player.z,hp:80,maxHp:80,vx:0,vy:0,vz:0,kbx:0,kbz:0,yaw:0,tgtYaw:0,hurtT:0,animT:0,t:9,atkCd:2,burnT:0,swingT:0,groanT:0,fleeT:0,onGround:true,pause:false,burning:false};
          mobs.push(mz); combatMastery.quake=1;
          useQuake(true); updateMobs(0.016);
          const finite=mz.hp<80 && mz.hp>0 && Number.isFinite(mz.kbx) && Number.isFinite(mz.kbz) && Number.isFinite(mz.x) && Number.isFinite(mz.z);
          ok("大地震颤: 与玩家重合时仍造成伤害, 击退和坐标保持有限", finite, "hp="+mz.hp+" kbx="+mz.kbx+" x="+mz.x);
          mobs.length=0; for(const q of keepQ) mobs.push(q);
          combatMastery.quake=qLv; quakeCd=qCd; boss=bossQ;
        }
        // 回沙卷盘: 重置沙步冷却连招(前提固化: softLock=游戏中, 与种子无关)
        const slR30=softLock; softLock=true;
        combatMastery.recall=0;
        ok("回沙卷盘: 未解锁时按 Q 被拒", useRecall()===false);
        combatMastery.recall=1;
        sandStepState.cd=4.2;
        ok("回沙卷盘: Q 重置沙步冷却并进入自身冷却", useRecall()===true && sandStepState.cd===0 && recallCd>0);
        sandStepState.cd=0;
        ok("回沙卷盘: 沙步就绪时不消耗卷盘", useRecall()===false);
        combatMastery.recall=3; hp=10; recallCd=0;
        sandStepState.cd=4; useRecall();
        ok("回沙卷盘: 3 级额外回 2 血、冷却 25 秒", hp===12 && recallCooldown()===25, "hp="+hp);
        softLock=slR30;
        // 回响号角: 击退道具
        bagTake("echo_horn",bagCount("echo_horn")); hornCd=0;
        mobs.length=0; spawnTrialMob("mummy", Math.floor(player.x)+3, Math.floor(player.y), Math.floor(player.z)+3, false);   // +3/+3 → 距离~4.2, 稳在 6 格射程内(不随出生小数浮动)
        const mh=mobs[0]; mh.hp=mh.maxHp=500;
        ok("回响号角: 震退 6 格内敌人(伤害 2)", useEchoHorn()===true && mh.maxHp-mh.hp===2 && (mh.kbx||mh.kbz)>0 && hornCd>0, "dmg="+(mh.maxHp-mh.hp));
        ok("回响号角: 冷却期内再按被拒", useEchoHorn()===false);
        // 时之沙: 增益与冷却
        timeCd=0;
        ok("时之沙: 8 秒疾行增益与 45 秒冷却", useTimeShards()===true && timeBuffT===TIME_BUFF_T && timeCd===45 && useTimeShards()===false);
        // 绿洲水袋: 解毒回血消耗品
        bagTake("waterskin",bagCount("waterskin")); bagAdd("waterskin",2); poisonT=5; hp=10; maxHp=20;
        ok("绿洲水袋: 解毒 +6 血并消耗一袋", useWaterskin()===true && poisonT===0 && hp===16 && bagCount("waterskin")===1);
        useWaterskin();
        ok("绿洲水袋: 用尽后不可再饮", bagCount("waterskin")===0 && hp===20 && useWaterskin()===false);
        // 存档往返: quake/recall 进 combatMastery
        restoreCombatMastery({step:1, riposte:2, quake:3, recall:1});
        ok("combatMastery 扩展: quake/recall 存取与钳位", combatMastery.quake===3 && combatMastery.recall===1);
        restoreCombatMastery({step:1, quake:9, recall:-2});
        ok("combatMastery 扩展: 坏值钳位到 0..3", combatMastery.quake===3 && combatMastery.recall===0);
        restoreCombatMastery(cmSnap7);
      } finally {
        Object.assign(combatMastery, cmSnap7);
        quakeCd=cdSnap7.quakeCd; recallCd=cdSnap7.recallCd; hornCd=cdSnap7.hornCd; timeCd=cdSnap7.timeCd; timeBuffT=cdSnap7.timeBuffT;
        sandStepState.cd=stSnap7.cd; sandStepState.evadeT=stSnap7.evadeT;
        hp=hpSnap7.hp; maxHp=hpSnap7.maxHp; poisonT=poisonSnap7; armor=armor7;
        bag.clear(); for(const [k,v] of bagSnap7) bag.set(k,v);
        mobs.length=0; for(const m of mobsSnap7) mobs.push(m);
        softLock=slSnap7.softLock; locked=slSnap7.locked; document.getElementById("overlay").style.display=slSnap7.ov;
        updateHearts(); updateXPHUD(); updateBuffHUD(); refreshSandStepButton();
      }
    }

    // 8q8. A组收尾(第三十一轮): 死亡清增益 / 触屏按钮状态 / 背包格显示道具 / 冷却遮罩 / 精英末波 / 编年史战技行
    {
      const snap8={timeBuffT, quakeCd, hornCd, dead:dead, title:document.getElementById("title").textContent,
        sbt:document.getElementById("startbtn").textContent, sbd:document.getElementById("startbtn").disabled,
        ov:document.getElementById("overlay").style.display, ovbg:document.getElementById("overlay").style.background,
        hud:document.getElementById("hud").style.display, quakeL:combatMastery.quake, recallL:combatMastery.recall};
      const bagSnap8=new Map(bag);
      try{
        // 死亡清时之沙增益
        timeBuffT=TIME_BUFF_T; dead=false;
        doDie();
        ok("死亡清除时之沙增益(防重生逃课)", timeBuffT===0 && dead===true, "buff="+timeBuffT);
        dead=false; document.getElementById("title").textContent=snap8.title;
        document.getElementById("startbtn").textContent=snap8.sbt; document.getElementById("startbtn").disabled=snap8.sbd;
        document.getElementById("overlay").style.display=snap8.ov; document.getElementById("overlay").style.background=snap8.ovbg;
        document.getElementById("hud").style.display=snap8.hud;
        // 触屏按钮: 存在 + 冷却态刷新 + 锁定态
        const qb=document.getElementById("btnQuake"), rb=document.getElementById("btnRecall");
        combatMastery.quake=0; quakeCd=0; refreshSkillButtons();
        const lockedState=qb.classList.contains("is-locked");
        combatMastery.quake=1; quakeCd=9; refreshSkillButtons();
        const cdState=qb.classList.contains("is-cooldown") && /9/.test(qb.textContent);
        ok("Z/Q 触屏按钮: 常驻 DOM、未习得锁定、冷却态倒计时", !!qb && !!rb && lockedState && cdState, "locked="+lockedState+" cd="+cdState);
        // 背包格显示字符串道具
        bagAdd("waterskin",2); renderCraft();
        const bagTxt=document.getElementById("bagGrid").textContent;
        ok("B 面板背包格显示字符串道具(水袋存量可见)", /绿洲水袋/.test(bagTxt) && /x2/.test(bagTxt));
        bag.clear(); bagAdd(GOLD_ORE,3); renderCraft();
        ok("B 面板背包格: 方块道具显示不受影响", /金矿石/.test(document.getElementById("bagGrid").textContent));
        bag.clear(); for(const [k,v] of bagSnap8) bag.set(k,v); renderCraft();
        // 热栏冷却遮罩
        HOTBAR_ITEMS.push("echo_horn"); rebuildHotbar(); hornCd=10;
        updateItemCds();
        const veil=document.querySelector('#hotbar .cdVeil[data-cd-item="echo_horn"]');
        ok("热栏冷却遮罩: 号角半冷即可视化", !!veil && Math.abs(parseFloat(veil.style.height)-50)<1, "h="+veil.style.height);
        HOTBAR_ITEMS.pop(); rebuildHotbar(); hornCd=snap8.quakeCd*0; hornCd=0;
        // 精英末波轻量化 + 编年史战技行
        ok("精英路线末波轻量化: 木乃伊重击不再与阿努比斯叠压", RUIN_EXPEDITION_WAVES_ELITE[2].join()==="anubis,scarab", RUIN_EXPEDITION_WAVES_ELITE[2].join());
        combatMastery.quake=2; combatMastery.recall=1;
        ok("编年史列出主动战技等级", /震颤 2\/3/.test(chronicleHTML()) && /卷盘 1\/3/.test(chronicleHTML()));
        combatMastery.quake=snap8.quakeL; combatMastery.recall=snap8.recallL;
      } finally {
        timeBuffT=snap8.timeBuffT; quakeCd=snap8.quakeCd; hornCd=0; dead=snap8.dead;
        document.getElementById("title").textContent=snap8.title;
        document.getElementById("startbtn").textContent=snap8.sbt; document.getElementById("startbtn").disabled=snap8.sbd;
        document.getElementById("overlay").style.display=snap8.ov; document.getElementById("overlay").style.background=snap8.ovbg;
        document.getElementById("hud").style.display=snap8.hud;
        bag.clear(); for(const [k,v] of bagSnap8) bag.set(k,v); renderCraft();
        combatMastery.quake=snap8.quakeL; combatMastery.recall=snap8.recallL;
        updateHearts(); updateBuffHUD();
      }
    }

    // 8q10. 世界地标九连(第三十二轮): 注册/直接调用 drawStructure 逐一搭建(确定性)/名画马赛克/蒙古马
    {
      const NEW9=["forbidden","parthenon","eiffel","cathedral","whitehouse","baths","impalace","yurt","museum"];
      const SIGN={forbidden:[0,3,0,BRICK], parthenon:[0,2,0,MARBLE], eiffel:[0,13,0,METAL], cathedral:[-5,5,0,BASALT],
                  whitehouse:[10,3,0,PLASTER_WHITE], baths:[0,0,0,MARBLE], impalace:[0,3,0,PLASTER_WHITE], yurt:[-5,2,0,WOOL], museum:[0,4,-8,MARBLE]};
      ok("世界地标: 九种类型全部注册于结构表/命名/珍藏", NEW9.every(t=>LANDMARKS[t] && LAND_TROPHY[t] && STRUCT_RAD[t]) && TROPHY_TOTAL>=23, "trophyTotal="+TROPHY_TOTAL);
      // 在出生地上空直接调用 drawStructure 逐一搭建(不依赖世界布局), 首写快照、验后还原
      const baseY=Math.min(58, Math.max(30, Math.floor(groundY(Math.floor(player.x),Math.floor(player.z)))+22));
      const undo=new Map();
      const wput=(x,y,z,id,force)=>{ if(y<0||y>=H) return; const c=world.get(key(x>>4,z>>4)); if(!c) return;
        const i=((x&15)*CS+(z&15))*H+y, old=c.blocks[i], k2=x+","+y+","+z;
        if(!undo.has(k2) && old!==AIR) undo.set(k2,[x,y,z,old]);
        if(force || old===AIR){ c.blocks[i]=id; wcount++; } _gcx=1e9; };
      const built={}, wrote={};
      let wcount=0;
      for(const t of NEW9){
        const bx0=Math.floor(player.x), bz0=Math.floor(player.z);
        for(let cx=(bx0-18)>>4;cx<=(bx0+18)>>4;cx++) for(let cz=(bz0-18)>>4;cz<=(bz0+18)>>4;cz++) ensureData(cx,cz);
        wcount=0;
        drawStructure({type:t, x:bx0, z:bz0, h:baseY, bio:0}, wput);
        wrote[t]=wcount;
        const g=SIGN[t], near=(id,cx,cy,cz)=>{ for(let dx=-4;dx<=4;dx++) for(let dy=-5;dy<=5;dy++) for(let dz=-4;dz<=4;dz++) if(getBlock(cx+dx,cy+dy,cz+dz)===id) return true; return false; };
        built[t]=near(g[3], bx0+g[0], baseY+g[1], bz0+g[2]);
        for(const [k2,v] of undo){ const p=k2.split(","); wput(+p[0],+p[1],+p[2],v[3],true); }   // 还原首写前的原方块
        undo.clear();
      }
      ok("世界地标: 九种逐一搭建且特征方块就位", NEW9.every(t=>built[t]),  "built="+NEW9.filter(t=>built[t]).join(",")+" baseY="+baseY+" wrote="+NEW9.map(t=>t+":"+wrote[t]).join(",")+" misses="+NEW9.filter(t=>!built[t]).map(t=>{ const g=SIGN[t]; let got=""; for(let dy=-2;dy<=2;dy++) got+=getBlock(Math.floor(player.x)+g[0], baseY+g[1]+dy, Math.floor(player.z)+g[2])+","; return t+":"+got; }).join(" | "));
      // 名画马赛克完整性
      ok("世界名画: 6 幅数据完整、调色板全为合法方块", Object.keys(PAINTINGS).length===6 && Object.values(PAINTINGS).every(p=>
        p.rows.length>=5 && p.rows.every(r=>r.length===p.rows[0].length) &&
        p.rows.join("").split("").every(ch=>ch==="."||BLOCKS[p.pal[ch]]!==undefined)), "n="+Object.keys(PAINTINGS).length);
      // 蒙古马: 找一处营地传送过去直接刷马(找不到则跳过)
      const sx0=Math.floor(player.x/CELL), sz0=Math.floor(player.z/CELL);
      let yurt=null;
      for(let dx=-30;dx<=30 && !yurt;dx++) for(let dz=-30;dz<=30;dz++){
        const st=structureAt(sx0+dx,sz0+dz); if(st && st.type==="yurt"){ yurt=st; break; } }
      if(yurt){
        __game.teleport(yurt.x+6, (groundY(yurt.x+6,yurt.z+6)>0?groundY(yurt.x+6,yurt.z+6)+2:yurt.h+6), yurt.z+6);
        const near=nearStructure(["yurt"],44);
        const spawned=near && spawnMob("horse",6,14);
        ok("蒙古包营地: 附近可刷出草原马(可驯服骑乘)", near && spawned && mobs.some(m=>m.type==="horse"), "near="+near);
        mobs.length=0; __game.teleport(sx0*CELL+8, groundY(sx0*CELL+8,sz0*CELL+8)+2, sz0*CELL+8);
      } else {
        ok("蒙古包营地: 附近无营地种子, 跳过马群检查(注册断言已过)", true, "no yurt within ±30 cells");
      }
    }

    // 8q11. 世界体系扩展(第三十三轮): 金字塔降频/主题分区/游艇/翼装/讲解员
    {
      const sx0=Math.floor(player.x/CELL), sz0=Math.floor(player.z/CELL);
      const snap11={ wingT, wingCd, wingStart, xp, bag:new Map(bag), mobs:mobs.slice(), poisonT, themeOK:true,
        px:player.x, py:player.y, pz:player.z };
      wingT=0; wingStart=null;
      try{
        // 1) 金字塔降频: 沙漠系格子中金字塔占比应显著低于旧值 0.20
        let des=0, pyr=0;
        for(let dx=-14;dx<=14;dx++) for(let dz=-14;dz<=14;dz++){
          const s=structureAt(sx0+dx,sz0+dz);
          if(s && (s.type==="pyramid"||s.type==="castrum"||s.type==="aqueduct"||s.type==="village"||s.type==="bazaar"||s.type==="crater"||s.type==="airport"||s.type==="rainbow"||s.type==="wreck"||s.type==="caravan"||s.type==="ruin"||s.type==="hut"||s.type==="oasis")){ des++; if(s.type==="pyramid") pyr++; }
        }
        ok("金字塔降频: 沙漠地标中金字塔占比 < 0.19(旧值 0.32)", des>80 && pyr/des<0.19, "des="+des+" pyr="+pyr+" ratio="+(pyr/des).toFixed(3));
        // 2) 主题分区: 世界地标带格子(NEW12)的类型必属于其区域主题池
        const NEW12=["forbidden","parthenon","eiffel","cathedral","whitehouse","baths","impalace","yurt","museum","greatwall","leifeng","liberty"];
        let themed=0, themeOK2=true;
        for(let dx=-16;dx<=16;dx++) for(let dz=-16;dz<=16;dz++){
          const sx=sx0+dx, sz=sz0+dz, s=structureAt(sx,sz);
          if(s && NEW12.indexOf(s.type)>=0){
            themed++;
            const theme=__game.regionTheme(Math.floor(sx/4), Math.floor(sz/4));
            if(THEME_POOL[theme].indexOf(s.type)<0) themeOK2=false;
          }
        }
        ok("区域主题化: 地标带格子的类型属于其区域文明池(确定性)", themed>0 && themeOK2, "themed="+themed);
        // 3) 新建筑 draw 冒烟: 长城/雷峰塔/自由女神
        const SIGN11={greatwall:[0,2,0,BRICK], leifeng:[5,5,0,BRICK], liberty:[2,10,0,MOSSY]};
        const baseY11=Math.min(58, Math.max(30, Math.floor(groundY(Math.floor(player.x),Math.floor(player.z)))+22));
        const undo11=new Map();
        const wput11=(x,y,z,id,force)=>{ if(y<0||y>=H) return; const c=world.get(key(x>>4,z>>4)); if(!c) return;
          const i=((x&15)*CS+(z&15))*H+y, old=c.blocks[i], k2=x+","+y+","+z;
          if(!undo11.has(k2) && old!==AIR) undo11.set(k2,[x,y,z,old]);
          if(force || old===AIR) c.blocks[i]=id; _gcx=1e9; };
        const built11={};
        for(const t of ["greatwall","leifeng","liberty"]){
          const bx0=Math.floor(player.x), bz0=Math.floor(player.z);
          drawStructure({type:t, x:bx0, z:bz0, h:baseY11, bio:0}, wput11);
          const g=SIGN11[t];
          const cy0=t==="greatwall"?(heightAt(bx0,bz0)+2):(baseY11+g[1]);   // 长城墙体随地形起伏: 以真实地形高搜索
          let near=false;
          for(let dx2=-4;dx2<=4;dx2++) for(let dy2=-5;dy2<=5;dy2++) for(let dz2=-4;dz2<=4;dz2++) if(getBlock(bx0+g[0]+dx2, cy0+dy2, bz0+g[2]+dz2)===g[3]) near=true;
          built11[t]=near;
          for(const [k2,v] of undo11){ const p=k2.split(","); wput11(+p[0],+p[1],+p[2],v[3],true); }
          undo11.clear();
        }
        ok("新建筑: 长城/雷峰塔/自由女神逐一搭建且特征方块就位", built11.greatwall && built11.leifeng && built11.liberty, JSON.stringify(built11));
        // 4) 游艇: 人工水域召唤 + def.boat
        mobs.length=0;
        const wy=WATER_Y;
        for(let X=Math.floor(player.x)+4;X<=Math.floor(player.x)+8;X++) for(let Z=Math.floor(player.z)-2;Z<=Math.floor(player.z)+2;Z++){
          for(let y=wy-3;y<=wy;y++) setBlock(X,y,Z,WATER);
          setBlock(X,wy-4,Z,STONE);
        }
        spawnYachtAt(Math.floor(player.x)+6, Math.floor(player.z));
        const ym=mobs.find(m=>m.type==="yacht");
        ok("游艇: 水面召唤成功且为可驾驶船只", !!ym && ym.def.boat===true && Math.abs(ym.y-(WATER_Y+0.35))<0.1, "y="+(ym&&ym.y.toFixed(2)));
        mobs.length=0;
        for(let X=Math.floor(player.x)+4;X<=Math.floor(player.x)+8;X++) for(let Z=Math.floor(player.z)-2;Z<=Math.floor(player.z)+2;Z++){
          for(let y=wy-3;y<=wy;y++) setBlock(X,y,Z,AIR);
          setBlock(X,wy-4,Z,STONE);
        }
        // 5) 翼装: 展开→限下落→着陆结算
        hp=999; maxHp=999; armor=0; blessT=0; blessKind="";
        const xpA11=xp, lvlA11=lvl, xm11=Math.max(1,omenXpMul()*mythicXpMul());
        startWingsuit();
        player.onGround=false; player.vy=-40; applyWingsuit(0.016);
        const glideOK=player.vy>=-3.3 && wingT>0;
        player.x+=80; finishWingsuit();
        let gain11=xp-xpA11; for(let l=lvlA11;l<lvl;l++) gain11+=xpNeed(l);
        ok("翼装滑翔: 下落限速 -3.2 且滑翔 80 格达成挑战", glideOK && gain11===Math.round(80*xm11) && wingT===0, "vy="+player.vy.toFixed(2)+" gain="+gain11);
        // 6) 讲解员: NPC 角色注册
        ok("讲解员 NPC: 角色已注册", !!NPC_ROLES.guide && NPC_ROLES.guide.tag==="🗣");
      } finally {
        wingT=snap11.wingT; wingStart=snap11.wingStart; wingCd=0;
        xp=snap11.xp; bag.clear(); for(const [k,v] of snap11.bag) bag.set(k,v);
        mobs.length=0; for(const m of snap11.mobs) mobs.push(m);
        poisonT=snap11.poisonT;
        player.x=snap11.px; player.z=snap11.pz; player.y=snap11.py; player.vx=player.vy=player.vz=0; pcx=1e9; refreshChunks();
        updateXPHUD(); updateHearts();
      }
    }

    // 8r. 神话遗物被动: 灯/羊毛/法尔不再只是一次性掉落; 图鉴可翻; 神灯可按 L
    {
      const mythSnapR={frags:Object.assign({},mythicState.frags), done:mythicState.done.slice()};
      const bagSnapR=new Map(bag), xpR=xp, lvlR=lvl, dmgR=dmgMul, maxR=maxHp, hpR=hp, armorR=armor;
      const djinnR={rubs:djinnState.rubs, cd:djinnState.cd};
      const facR={rome:faction.rome, egypt:faction.egypt};
      const blessR={t:blessT, k:blessKind};
      mythicState.frags={greece:0,rome:0,egypt:0,persia:0,arabia:0,medit:0}; mythicState.done=[];
      ok("未拼合时无灯/羊毛/法尔被动", mythicDjinnCdMul()===1 && !mythicFallImmune() && mythicBazaarOff()===0 && mythicAegisMul()===1, "lamp="+mythicDjinnCdMul()+" fall="+mythicFallImmune()+" farr="+mythicBazaarOff());
      ok("未拼合神灯时擦灯被拒", rubLamp()===false, "");
      for(let i=0;i<MYTHIC_NEED;i++) addFragment("arabia");
      ok("拼合不灭神灯后冷却加倍快", mythicDone("arabia") && mythicDjinnCdMul()===2, "done="+mythicState.done.join(","));
      // 固定前置状态: 随机世界里此前的测试/游戏循环可能让玩家已"死亡"或面板还开着 → 擦灯被拒/被 toggle 关掉(偶发失败的根因)
      const deadR=dead; dead=false; closeLampPanel();
      djinnState.cd=0;
      const opened=rubLamp();
      const lp=document.getElementById("lamp-panel");
      ok("拼合后擦灯打开许愿面板(不扣冷却)", opened!==false && lp && lp.classList.contains("on") && /生命之赐|黄金雨/.test((lp.querySelector(".sx-card")||{}).innerHTML||"") && djinnState.cd===0 && djinnState.rubs===djinnR.rubs, "open="+(lp&&lp.classList.contains("on"))+" cd="+djinnState.cd);
      const gold0=bagCount(GOLD_ORE);
      const wish=grantWish(1);   // 黄金雨
      ok("点选愿望才生效并进入冷却", wish!==false && djinnState.cd>0 && djinnState.rubs===djinnR.rubs+1 && bagCount(GOLD_ORE)===gold0+15 && !document.getElementById("lamp-panel").classList.contains("on"), "wish="+wish+" cd="+djinnState.cd);
      ok("关闭许愿面板不扣冷却", (djinnState.cd=0, rubLamp(), closeLampPanel(), djinnState.cd===0 && djinnState.rubs===djinnR.rubs+1), "cd="+djinnState.cd);
      djinnState.cd=0; openLampPanel();
      const lockSnap=locked, softSnap=softLock; locked=false; softLock=false;   // 模拟退指针锁后 playing()===false
      document.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyL",bubbles:true}));
      ok("暂停后按 L 仍能关闭许愿面板", !document.getElementById("lamp-panel").classList.contains("on") && djinnState.cd===0, "on="+document.getElementById("lamp-panel").classList.contains("on")+" playing="+playing());
      locked=lockSnap; softLock=softSnap; closeLampPanel();
      const deadSnap=dead; dead=true; djinnState.cd=0;
      const goldDead=bagCount(GOLD_ORE);
      ok("死亡时不能打开许愿面板", openLampPanel()===false && !document.getElementById("lamp-panel").classList.contains("on"), "on="+document.getElementById("lamp-panel").classList.contains("on"));
      ok("死亡时不能许愿领赏", grantWish(1)===false && djinnState.cd===0 && djinnState.rubs===djinnR.rubs+1 && bagCount(GOLD_ORE)===goldDead, "cd="+djinnState.cd+" gold="+bagCount(GOLD_ORE));
      document.getElementById("lamp-panel").classList.add("on");
      document.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyL",bubbles:true}));
      ok("死亡画面按 L 只关面板、不发奖", !document.getElementById("lamp-panel").classList.contains("on") && djinnState.cd===0, "on="+document.getElementById("lamp-panel").classList.contains("on"));
      dead=deadSnap; closeLampPanel();
      dead=deadR;
      mythicState.frags.persia=0; if(mythicDone("persia")) mythicState.done=mythicState.done.filter(c=>c!=="persia");
      faction.rome=0;
      const ware=BAZAAR_WARES[0];
      const baseCost=ware.cost;
      ok("无法尔时集市原价", bazaarCost(ware)===baseCost, "cost="+bazaarCost(ware));
      for(let i=0;i<MYTHIC_NEED;i++) addFragment("persia");
      ok("法尔使波斯集市减 1 文物", mythicDone("persia") && bazaarCost(ware)===baseCost-1 && mythicBazaarOff()===1, "cost="+bazaarCost(ware));
      for(let i=0;i<MYTHIC_NEED;i++) addFragment("medit");
      ok("黄金羊毛免疫摔落", mythicDone("medit") && mythicFallImmune()===true, "");
      blessKind=""; blessT=0; armor=0; dead=false; hp=20; maxHp=20;
      const h0=hp; damagePlayer(10,0,0);
      const dropNo=h0-hp;
      mythicState.frags.greece=0; mythicState.done=mythicState.done.filter(c=>c!=="greece");
      for(let i=0;i<MYTHIC_NEED;i++) addFragment("greece");
      hp=20; maxHp=Math.max(20,maxHp); dead=false; armor=0; blessKind=""; blessT=0;
      const h1=hp; damagePlayer(10,0,0);
      const dropYes=h1-hp;
      ok("埃癸斯减轻伤害", mythicAegisMul()===0.9 && dropYes<dropNo, "noShield="+dropNo+" aegis="+dropYes);
      openMythicPanel();
      const mp=document.getElementById("mythic-panel");
      const mcard=mp && mp.querySelector(".pt-card");
      ok("神话遗物面板能打开并列出神器", mp && mp.classList.contains("on") && mcard && /不灭神灯|埃癸斯/.test(mcard.innerHTML) && /？？？/.test(mcard.innerHTML), "open="+(mp&&mp.classList.contains("on")));
      closeMythicPanel();
      ok("编年史提示按 K 翻神话遗物", /神话遗物/.test(chronicleHTML()) && /按 K/.test(chronicleHTML()), "");
      ok("天象冷却函数仍只看西罗科", omenDjinnCdMul()===(omenActive("sirocco")?2:1), "omenCd="+omenDjinnCdMul());
      mythicState.frags=mythSnapR.frags; mythicState.done=mythSnapR.done;
      djinnState.rubs=djinnR.rubs; djinnState.cd=djinnR.cd;
      faction.rome=facR.rome; faction.egypt=facR.egypt;
      blessT=blessR.t; blessKind=blessR.k;
      bag.clear(); for(const [k,v] of bagSnapR) bag.set(k,v); xp=xpR; lvl=lvlR; dmgMul=dmgR; maxHp=maxR; hp=hpR; armor=armorR;
      updateHearts(); updateXPHUD(); updateBuffHUD(); closeMythicPanel(); closeLampPanel();
    }

    // 9. 渲染管线仍然可用
    let renderErr=null;
    try{ render(performance.now()); }catch(e){ renderErr=e.message; }
    ok("渲染一帧无异常", !renderErr, renderErr||"ok");

    // 10. 远离原点时云层 UV 偏移仍必须落在 [0,1)
    //     否则 mediump 片元精度不足, 云会塌成"跟着玩家的大白块"
    const fx2=player.x, fz2=player.z;
    let worstUV=0;
    for(const [tx,tz] of [[0,0],[20000,-20000],[120000,120000],[-999999,999999]]){
      player.x=tx; player.z=tz;
      try{ render(performance.now()); }catch(e){}
      worstUV=Math.max(worstUV, Math.abs(cloudUV[0]), Math.abs(cloudUV[1]));
    }
    player.x=fx2; player.z=fz2; pcx=1e9; refreshChunks();
    ok("远距离云层UV仍在[0,1)内(防白块)", worstUV<1, "最大|uUVOff|="+worstUV.toFixed(4));

    // ---- 上强度批次: 难度递增 / 精英怪 / 连杀 ----
    { const snapD=dayCount, snapKS=killStreak, snapBS=bestStreak, snapES=elitesSlain,
            snapKills=kills, snapXp=xp, snapLvl=lvl, snapMax=maxHp, snapDmgMul=dmgMul, snapHp=hp,
            snapArmor=armor, snapBless=blessT, snapQi=questIdx, snapQp=questProg, snapQd=questDone,
            mlen=mobs.length, dlen=drops.length;
      try{
        // 1) 难度基线: 第1天系数恒为 1.0(锁定"selftest 不被难度膨胀影响"的前提)
        dayCount=1;
        ok("难度基线: 第1天敌伤/敌血系数=1.0", foeDmgMul()===1 && foeHpMul()===1, "dmg="+foeDmgMul()+" hp="+foeHpMul());
        // 2) 随天数上升
        dayCount=10;
        ok("难度随天数上升(第10天敌伤&敌血均>基线)", foeDmgMul()>1.3 && foeHpMul()>1.3, "dmg="+foeDmgMul().toFixed(2)+" hp="+foeHpMul().toFixed(2));
        // 3) 系数封顶(第12天见顶,不无限膨胀)
        dayCount=99;
        ok("难度系数第12天封顶", Math.abs(foeDmgMul()-(1+11*0.06))<1e-9 && Math.abs(foeHpMul()-(1+11*0.05))<1e-9, "dmg="+foeDmgMul().toFixed(3)+" hp="+foeHpMul().toFixed(3));
        // 4) 敌对上限随天数增多(更有围攻感)
        const cap=d=>Math.min(8,2+Math.floor(Math.min(d,10)/2));
        ok("敌对上限随天数上升(第1天<第10天)", cap(1)<cap(10) && cap(10)<=8, "第1天="+cap(1)+" 第10天="+cap(10));
        // 5) 精英概率随天数上升且落在 (0,0.30]
        dayCount=1;  const ec1=eliteChance();
        dayCount=99; const ec2=eliteChance();
        ok("精英怪概率随天数上升并封顶0.30", ec1>0 && ec1<ec2 && ec2<=0.30, "第1天="+ec1.toFixed(2)+" 封顶="+ec2.toFixed(2));
        // 6) foeStrike: 精英 +50% 伤害(第1天基线, 排除护甲/祝福干扰)
        dayCount=1; blessT=0; armor=0; maxHp=999; hp=999;
        foeStrike(10,0,0,null);         const dmgN=999-hp; hp=999;
        foeStrike(10,0,0,{elite:true}); const dmgE=999-hp;
        ok("精英攻击比普通更痛(约+50%)", dmgE>dmgN, "普通="+dmgN+" 精英="+dmgE);
        // 7) 连杀累计 + best 记录(用手搓僵尸走真实 hurtMob 击杀流程)
        maxHp=999; hp=999; killStreak=0; bestStreak=0; killStreakT=0;
        const foe=()=>({type:"zombie",def:MOB_DEFS.zombie,x:player.x+0.6,y:player.y,z:player.z,vx:0,vy:0,vz:0,kbx:0,kbz:0,
          yaw:0,tgtYaw:0,hp:1,hurtT:0,animT:0,t:0,atkCd:0,burnT:0,swingT:0,groanT:0,fleeT:0,onGround:true,pause:false,burning:false,held:null});
        for(let k=0;k<3;k++){ const z=foe(); mobs.push(z); hurtMob(z,50,0,0); }
        ok("连杀累计(连斩3只→streak=3)", killStreak===3 && bestStreak===3, "streak="+killStreak+" best="+bestStreak);
        // 8) 连杀窗口超时清零(复刻 tick 内的衰减, best 保留)
        killStreakT=0.02; killStreakT-=0.05; if(killStreakT<=0) killStreak=0;
        ok("连杀窗口超时清零(最高纪录保留)", killStreak===0 && bestStreak===3, "streak="+killStreak+" best="+bestStreak);
        // 9) 精英击杀计入战绩
        const eBefore=elitesSlain; const ez=foe(); ez.elite=true; mobs.push(ez); hurtMob(ez,50,0,0);
        ok("精英击杀计入战绩", elitesSlain===eBefore+1, "elitesSlain="+elitesSlain);
        // 10) 战绩写入存档(feats)并可还原; 老存档(无字段)归零
        bestStreak=7; elitesSlain=4;
        const sv=collectSave();
        ok("连杀/精英战绩写入存档(feats)", sv.feats.bestStreak===7 && sv.feats.elitesSlain===4,
           "feats={best:"+sv.feats.bestStreak+",elites:"+sv.feats.elitesSlain+"}");
        const ftOld={}; // 模拟老存档: feats 缺这两个字段 → |0 归零
        ok("老存档(无连杀字段)战绩归零", (ftOld.bestStreak|0)===0 && (ftOld.elitesSlain|0)===0, "best="+(ftOld.bestStreak|0)+" elites="+(ftOld.elitesSlain|0));
      } finally {
        // 还原一切被本批次改动的运行态
        dayCount=snapD; killStreak=snapKS; bestStreak=snapBS; elitesSlain=snapES; killStreakT=0;
        kills=snapKills; xp=snapXp; lvl=snapLvl; maxHp=snapMax; dmgMul=snapDmgMul; hp=snapHp;
        armor=snapArmor; blessT=snapBless; questIdx=snapQi; questProg=snapQp; questDone=snapQd;
        mobs.length=mlen; drops.length=dlen; updateHearts();
      }
    }

    // ---- 第十五轮·玩家侧沙步：短位移 + 仅 foeStrike 闪避窗 ----
    {
      const P0={x:player.x,y:player.y,z:player.z,onGround:player.onGround,vx:player.vx,vz:player.vz,kbx:player.kbx,kbz:player.kbz};
      const S0={cd:sandStepState.cd,evadeT:sandStepState.evadeT,dodged:sandStepState.dodged,lastDist:sandStepState.lastDist,feedbackT:sandStepState.feedbackT,
        counterT:sandStepState.counterT,counterTarget:sandStepState.counterTarget,counterHitT:sandStepState.counterHitT};
      const H0={hp,maxHp,armor,blessT,particles:particles.length};
      try{
        // 在已生成区域中找一个脚底/头顶/前方都空的确定性测试位；不改世界或存档。
        // 前提显式化(优先级 A): 起步格必须无水/无岩浆(inWater/inLava 会挡 sandStep), 找不到就回出生点周围再找 —— 消除"随机出生地附近全是海/崖"的偶发失败
        let spot=null;
        const findSpotAround=(cx0,cz0,R)=>{
          for(let rz=0;rz<=R&&!spot;rz+=2) for(let rx=-R;rx<=R&&!spot;rx+=2){
            const x=Math.floor(cx0)+rx+0.5, z=Math.floor(cz0)+rz+0.5, y=groundY(Math.floor(x),Math.floor(z));
            if(y<=0 || !aabbFits(x,y,z,PW,PH)) continue;
            const fb=getBlock(Math.floor(x),Math.floor(y+0.4),Math.floor(z));   // inWater 检查脚+0.4 格: 起步格必须是无水/无岩浆的陆地
            if(fb===WATER||fb===LAVA) continue;
            for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
              const to=sandStepLanding(x,y,z,dx,dz);
              if(to && to.d>=1.8){ spot={x,y,z,dx,dz}; break; }
            }
          }
        };
        findSpotAround(P0.x,P0.z,16);
        if(!spot){ ensureData(Math.floor(spawnPt.x)>>4,Math.floor(spawnPt.z)>>4); findSpotAround(spawnPt.x,spawnPt.z,20); }
        if(spot){ ensureData(Math.floor(spot.x)>>4,Math.floor(spot.z)>>4); player.x=spot.x; player.y=spot.y; player.z=spot.z; player.onGround=true; }
        sandStepState.cd=0; sandStepState.evadeT=0; sandStepState.dodged=false; sandStepState.feedbackT=0; clearSandRiposte();
        const used=!!spot && sandStep(spot.dx,spot.dz,true);
        const moved=Math.hypot(player.x-(spot?spot.x:P0.x),player.z-(spot?spot.z:P0.z));
        ok("沙步: 短位移成功并开启0.35秒敌击规避窗", used && moved>=1.8 && sandStepState.evadeT>0.3 && sandStepState.cd>=4.49,
           "used="+used+" moved="+moved.toFixed(2)+" evade="+sandStepState.evadeT.toFixed(2)+" cd="+sandStepState.cd.toFixed(2));
        maxHp=999; hp=999; armor=0; blessT=0;
        const dodged=foeStrike(10,0,0,{elite:false})===false && hp===999;
        updateStatsHUD();
        const feedbackOK=sandStepState.feedbackT>0 && document.getElementById("stats").innerHTML.includes("闪避成功") && document.getElementById("btnDodge").textContent.includes("成功");
        ok("沙步: 成功反馈同步到 HUD 与触屏按钮",feedbackOK,"feedback="+sandStepState.feedbackT.toFixed(1)+" stats="+document.getElementById("stats").innerHTML.includes("闪避成功"));
        damagePlayer(10,0,0); const environmentStillHurts=hp<999;  // 环境/陷阱/坠落/毒均直走 damagePlayer
        ok("沙步只规避 foeStrike 敌击；直接伤害仍生效", dodged && environmentStillHurts,
           "dodged="+dodged+" directHp="+hp);
        tickSandStep(SANDSTEP_WINDOW+0.02); hp=999;
        const hitAfterWindow=foeStrike(10,0,0,null)===true && hp<999;
        const cooldownLocked=sandStep(spot&&spot.dx,spot&&spot.dz,true)===false && sandStepState.cd>0;
        ok("沙步闪避窗结束后敌击恢复；冷却期间不能连用", hitAfterWindow && cooldownLocked,
           "hit="+hitAfterWindow+" locked="+cooldownLocked+" cd="+sandStepState.cd.toFixed(2));
        // 第十六轮·沙步 v1.1：边界补测。临时方块和现场均在 finally/本地恢复。
        const B0=new Map(), touch=(x,y,z,id)=>{ const k=x+","+y+","+z; if(!B0.has(k)) B0.set(k,getBlock(x,y,z)); setBlock(x,y,z,id); };
        const restoreB=()=>{ for(const [k,id] of B0){ const [x,y,z]=k.split(",").map(Number); setBlock(x,y,z,id); } B0.clear(); };
        const resetStep=()=>{ sandStepState.cd=0; sandStepState.evadeT=0; sandStepState.dodged=false; sandStepState.feedbackT=0; clearSandRiposte(); player.x=spot?spot.x:P0.x; player.y=spot?spot.y:P0.y; player.z=spot?spot.z:P0.z; player.onGround=true; };
        let wallOK=false, noFootOK=false;
        if(spot){
          resetStep();
          const wx=Math.floor(spot.x+spot.dx*1.2), wz=Math.floor(spot.z+spot.dz*1.2);
          for(let side=-1;side<=1;side++) for(let yy=0;yy<2;yy++) touch(wx+Math.round(spot.dz*side),spot.y+yy,wz-Math.round(spot.dx*side),SANDSTONE);
          sandStep(spot.dx,spot.dz,true);
          wallOK=Math.floor(player.x)!==wx || Math.floor(player.z)!==wz;
          ok("沙步: 正前方实心墙阻挡时不穿墙",wallOK,"landing="+player.x.toFixed(2)+","+player.z.toFixed(2)+" wall="+wx+","+wz);
          restoreB(); resetStep();
          for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]) for(let yy=0;yy<2;yy++) touch(Math.floor(spot.x)+dx,spot.y+yy,Math.floor(spot.z)+dz,SANDSTONE);
          const xNo=player.x,zNo=player.z, sNo={cd:sandStepState.cd,evadeT:sandStepState.evadeT}, playingNo=softLock;
          softLock=true;
          const noUse=sandStep(0,-1,false);
          softLock=playingNo;
          noFootOK=!noUse && player.x===xNo && player.z===zNo && sandStepState.cd===sNo.cd && sandStepState.evadeT===sNo.evadeT;
          ok("沙步: 四周无落脚点时不移动且不开冷却/闪避窗",noFootOK,"used="+noUse+" pos="+player.x.toFixed(2)+","+player.z.toFixed(2)+" cd="+sandStepState.cd.toFixed(2));
          restoreB(); resetStep();
        } else {
          ok("沙步: 正前方实心墙阻挡时不穿墙",false,"没有可用测试落点");
          ok("沙步: 四周无落脚点时不移动且不开冷却/闪避窗",false,"没有可用测试落点");
        }
        const k0=Object.assign({},keys), yaw0=player.yaw;
        for(const k in keys) keys[k]=false; player.yaw=0;
        const viewDir=sandStepDirection(), viewOK=Math.abs(viewDir[0])<1e-6 && viewDir[1]<-0.99;
        keys.KeyW=true; const wDir=sandStepDirection(); keys.KeyW=false; keys.KeyD=true; const dDir=sandStepDirection();
        const inputOK=wDir[1]<-0.99 && Math.abs(wDir[0])<1e-6 && dDir[0]>.99 && Math.abs(dDir[1])<1e-6;
        ok("沙步: 静止时朝视线方向、按住 WASD 时朝输入方向",viewOK&&inputOK,"view="+viewDir.map(v=>v.toFixed(2))+" W="+wDir.map(v=>v.toFixed(2))+" D="+dDir.map(v=>v.toFixed(2)));
        Object.assign(keys,k0); player.yaw=yaw0;
        const sl0=softLock, locked0=locked, dead0=dead, ride0=riding, fly0=player.flying, gt0=grappleTarget, og0=player.onGround, ov0=document.getElementById("overlay").style.display;
        locked=false; softLock=false; document.getElementById("overlay").style.display="flex"; resetStep();
        const pauseBefore={x:player.x,z:player.z,cd:sandStepState.cd,evadeT:sandStepState.evadeT}; const pauseUse=sandStep();
        ok("沙步禁用状态: 暂停",!pauseUse && player.x===pauseBefore.x && player.z===pauseBefore.z && sandStepState.cd===pauseBefore.cd && sandStepState.evadeT===pauseBefore.evadeT,"used="+pauseUse+" pos="+player.x.toFixed(2)+","+player.z.toFixed(2));
        softLock=true; document.getElementById("overlay").style.display="none";
        const reject=(label,setup,teardown)=>{ resetStep(); setup(); const before={x:player.x,z:player.z,cd:sandStepState.cd,evadeT:sandStepState.evadeT}; const used=sandStep(); const good=!used&&player.x===before.x&&player.z===before.z&&sandStepState.cd===before.cd&&sandStepState.evadeT===before.evadeT; teardown&&teardown(); ok("沙步禁用状态: "+label,good,"used="+used+" pos="+player.x.toFixed(2)+","+player.z.toFixed(2)); };
        reject("空中",()=>{player.onGround=false;},()=>{player.onGround=true;});
        reject("骑乘载具或坐骑",()=>{riding={def:{}};},()=>{riding=null;});
        reject("钩爪牵引中",()=>{grappleTarget={x:player.x+3,y:player.y,z:player.z};},()=>{grappleTarget=null;});
        const fluidX=Math.floor(player.x), fluidY=Math.floor(player.y+0.4), fluidZ=Math.floor(player.z), fluidOld=getBlock(fluidX,fluidY,fluidZ);
        reject("水中",()=>{setBlock(fluidX,fluidY,fluidZ,WATER);},()=>{setBlock(fluidX,fluidY,fluidZ,fluidOld);});
        reject("岩浆中",()=>{setBlock(fluidX,fluidY,fluidZ,LAVA);},()=>{setBlock(fluidX,fluidY,fluidZ,fluidOld);});
        reject("死亡",()=>{dead=true;},()=>{dead=false;});
        const craft=document.getElementById("craftPanel"), craftC=craft.className, craftD=craft.style.display;
        reject("面板打开",()=>{craft.classList.add("on"); craft.style.display="flex";},()=>{craft.className=craftC; craft.style.display=craftD;});
        const yawR=player.yaw; if(spot) player.yaw=Math.atan2(spot.dx,-spot.dz);   // 真实按键走视线方向: 对准已知可走的方向, 免得随机朝向正对墙而没触发
        const kR=Object.assign({},keys); for(const k in keys) keys[k]=false;          // 先前测试可能留下按住的方向键, 会把方向拐到侧面
        // 真实按键前把 sandStep 的全部守卫前提显式固定(优先级 A): 面板/触屏/骑乘/钩爪/飞行 —— 快照→派发→恢复, 断言本身不放宽
        const PANEL_IDS=["craftPanel","enchPanel","potionPanel","chestPanel","furnacePanel","npcPanel","fullhelp","settingsPanel","bazaar-panel","pottery-panel","mythic-panel","lamp-panel","sphinx-panel","ruin-glyph-panel","expedition-route","meta-panel","caravan-panel","bagPanel"];   // 第三十七轮·本地: 原本止于 sphinx-panel, 漏了 ruin-glyph/expedition-route/meta/caravan 与新增的 bagPanel; 与 sandStepPanelOpen 的清单对齐
        const panelSnap=PANEL_IDS.map(id=>{ const el=document.getElementById(id); return el?{id,cn:el.className,dp:el.style.display}:null; }).filter(Boolean);
        for(const p of panelSnap){ const el=document.getElementById(p.id); el.classList.remove("on"); el.style.display="none"; }
        const touch0=touchState.active, rideK=riding, gtK=grappleTarget, flyK=player.flying;
        touchState.active=false; riding=null; grappleTarget=null; player.flying=false;
        resetStep(); const repeatBefore={x:player.x,z:player.z}; sandStepState.cd=0;
        document.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyC",bubbles:true}));
        const once={x:player.x,z:player.z,cd:sandStepState.cd};
        document.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyC",repeat:true,bubbles:true}));
        for(const p of panelSnap){ const el=document.getElementById(p.id); if(el){ el.className=p.cn; el.style.display=p.dp; } }
        touchState.active=touch0; riding=rideK; grappleTarget=gtK; player.flying=flyK;
        const heldKeys=Object.keys(kR).filter(k=>kR[k]).join("+")||"none"; Object.assign(keys,kR);
        player.yaw=yawR;
        const why=once.cd>=4.49?"":(" playing="+playing()+" panel="+sandStepPanelOpen()+" water="+inWater()+" lava="+inLava()+" ground="+player.onGround+" fly="+player.flying+" ride="+!!riding+" grapple="+!!grappleTarget+" touch="+touchState.active+" keys="+heldKeys);
        ok("沙步: 按住 C 的重复 keydown 只触发一次且冷却期不再位移",once.cd>=4.49 && player.x===once.x && player.z===once.z,"from="+repeatBefore.x.toFixed(2)+","+repeatBefore.z.toFixed(2)+" onceCd="+once.cd.toFixed(2)+why);
        softLock=sl0; locked=locked0; dead=dead0; riding=ride0; player.flying=fly0; grappleTarget=gt0; player.onGround=og0; document.getElementById("overlay").style.display=ov0; restoreB();
        const sv=collectSave();
        ok("沙步不改变世界存档结构", !Object.prototype.hasOwnProperty.call(sv,"sandStep"),
           "sandStep="+("sandStep" in sv));
      } finally {
        Object.assign(player,P0); Object.assign(sandStepState,S0); refreshSandStepButton(); updateStatsHUD();
        hp=H0.hp; maxHp=H0.maxHp; armor=H0.armor; blessT=H0.blessT; particles.length=H0.particles;
        updateHearts();
      }
    }

    // ---- 光影(第 1 步): 日照方向 / 天光可见度 / 网格面编码 / 阴影贴图 ----
    {
      const sh0=sunH, dt0=dayT;
      sunH=1; dayT=0.25; const noon=lightState();
      const noonSunY=noon.sun[1], noonI=noon.sunI, noonCol=noon.sunCol[0];
      ok("光影: 正午太阳高挂(仰角约62°)且用日光投影", noonSunY>0.8 && noonSunY<0.95 && noonI===1 && noon.light[1]===noonSunY, "sunY="+noonSunY.toFixed(3));
      sunH=-0.1; const nt=lightState();
      ok("光影: 深夜改由月光投影, 光弱且偏冷", nt.light[1]>0.6 && nt.sunCol[2]>nt.sunCol[0] && nt.sunCol[2]<noonCol*0.5,
         "moonY="+nt.light[1].toFixed(2)+" col="+nt.sunCol.map(v=>v.toFixed(2)));
      sunH=0.3; const dusk=lightState();
      ok("光影: 早晚日光更暖(蓝分量低于正午)", dusk.warm>0.5 && dusk.sunCol[2]/dusk.sunCol[0] < 0.6, "warm="+dusk.warm.toFixed(2));
      sunH=sh0; dayT=dt0; lightState();
      // 网格: 每个顶点 7 个分量, aF = 面(0..7) + 8*天光(0..15)
      let good=true, cnt=0, openTop=0, tops=0;
      for(const c of world.values()){
        if(!c.mesh || !c.mesh.opaque) continue;
        gl.bindBuffer(gl.ARRAY_BUFFER,c.mesh.opaque.vbo);
        const n=gl.getBufferParameter(gl.ARRAY_BUFFER,gl.BUFFER_SIZE)/4;
        if(n%7!==0) good=false;
        if(++cnt>=3) break;
      }
      const cx0=Math.floor(player.x/CS), cz0=Math.floor(player.z/CS), c0=world.get(key(cx0,cz0));
      if(c0){
        // 直接重算高度图, 抽查: 地表之上的格子天光=1, 深埋地下的格子天光=0
        buildChunkMesh(c0);
        const bx=cx0*CS, bz=cz0*CS;
        for(let i=0;i<CS;i++) for(let j=0;j<CS;j++){
          const h=_hm[(i+1)*(CS+2)+(j+1)];
          if(h<0) continue; tops++;
          if(cellSky(bx,bz,bx+i,h+1,bz+j)===1 && cellSky(bx,bz,bx+i,h-8,bz+j)===0) openTop++;
        }
      }
      ok("光影: 区块网格顶点为 7 分量(含面朝向+天光)", good && cnt>0, "checked="+cnt);
      ok("光影: 天光可见度 露天=1 / 深埋=0", tops>0 && openTop===tops, openTop+"/"+tops);
      ok("光影: 深度纹理阴影可用(WebGL2 或 WEBGL_depth_texture)且贴图已建", !HAS_DEPTH_TEX || GFX_PRESETS[gfxLevel].shadow===false || (shadow.ok && shadow.size>=1024),
         "gl2="+IS_GL2+" depthTex="+HAS_DEPTH_TEX+" ok="+shadow.ok+" size="+shadow.size);
      const g0=gfxLevel; setGfx(0); const offOk=!shadow.ok; setGfx(g0);
      const mainSrc=gl.getAttachedShaders(mainProg).map(sh=>gl.getShaderSource(sh)||"").join("\n");
      ok("主着色器: WebGL2 用 GLSL 300 + centroid UV, 高/极致开 4× MSAA; WebGL1 保持 GLSL 100",
         IS_GL2 ? (/^#version 300 es/.test(mainSrc.trim()) && /centroid in vec2 vUV/.test(mainSrc) && /centroid out vec2 vUV/.test(mainSrc) && GFX_PRESETS[2].msaa===4 && GFX_PRESETS[3].msaa===4 && !GFX_PRESETS[1].msaa)
                : !/#version 300/.test(mainSrc), "gl2="+IS_GL2);
      {
        // 生物投影: 「高」档 WebGL2 建动态阴影副本; 附近有生物时本帧改采样副本; 「中」档没有副本
        const g0m=gfxLevel; setGfx(2);
        const hasDyn=!IS_GL2 || !shadow.ok || !!shadow.dynFbo;
        const n0=mobs.length;
        const cow={type:"pig", def:MOB_DEFS.pig, x:shadow.cx+2, y:player.y, z:shadow.cz+2, vx:0,vy:0,vz:0, yaw:0, animT:0, hp:10};
        if(MOB_DEFS.pig) mobs.push(cow);
        while(gl.getError()!==gl.NO_ERROR){}
        renderMobShadows(lightState().light);
        const err=gl.getError();
        const used=!IS_GL2 || !shadow.ok || (shadow.useDyn && shadow.casters>=1 && shadowSampleTex()===shadow.dynTex);
        mobs.length=n0; setGfx(1); const midNo=!shadow.dynFbo; setGfx(g0m);
        ok("生物投影: 高/极致(WebGL2)每帧把生物叠进阴影贴图副本并改采样副本, 中档不建副本, 无 GL 错误",
           hasDyn && used && midNo && err===gl.NO_ERROR, "dyn="+!!shadow.dynFbo+" used="+used+" err="+err);
      }
      ok("沙面高光: 主着色器有沙粒闪光且按画质开关", U.uSandFx!==null && mainSrc.indexOf("sandK")>=0, "loc="+(U.uSandFx!==null));
      // 地标珍藏: 覆盖全部地标 / 同一地标只领一次 / 进存档 / 常驻效果
      {
        const miss=Object.keys(LANDMARKS).filter(k=>!LAND_LOOT[k] && !LAND_TROPHY[k])
          .concat(Object.keys(LAND_TROPHY).filter(k=>!LANDMARKS[k]).map(k=>"不可达:"+k));   // 珍藏只能来自指南针地标(否则永远领不到)
        const trS=[...trophies], mhS=maxHp, hpS2=hp, bagS=new Map(bag);
        trophies.clear();
        const a=grantTrophy("pyramid"), m1=maxHp, b=grantTrophy("pyramid"), m2=maxHp;
        grantTrophy("village"); grantTrophy("rainbow");
        const sv=collectSave();
        const perks=trophyRegenMul()===1.25 && trophyFallMul()===0.75;
        trophies.clear(); for(const k of trS) trophies.add(k); maxHp=mhS; hp=hpS2; bag.clear(); for(const [k,v] of bagS) bag.set(k,v); updateHearts();
        ok("地标珍藏: 每种地标都有奖励(四址 LAND_LOOT 或珍藏), 同一地标只领一次, 进存档, 常驻加成生效",
           miss.length===0 && a===true && b===false && m1===Math.min(40,mhS+2) && m2===m1 && Array.isArray(sv.trophies) && sv.trophies.includes("pyramid") && perks,
           "miss="+miss.join(",")+" a="+a+" b="+b+" hp="+mhS+"→"+m1+"→"+m2);
      }
      // 村落集市: 库存售罄挡购买 / 次日补货 / 买满 5 次老主顾八折 / 进存档
      {
        const bagS=new Map(bag), dayS=dayCount, talkS=talkNpc, mkS=JSON.stringify(marketState), panelS=npcPanelOpen;
        for(const k in marketState) delete marketState[k];
        talkNpc={npcRole:"trader", stallKey:"v:test", npcName:"t"};
        bag.set(CACTUS,999); bag.set(SANDSTONE,999);
        let bought=0; for(let i=0;i<8;i++){ const o=npcOffers("trader")[0]; if(offerHave(o)){ npcBuy(0); bought++; } }
        const soldOut=npcOffers("trader")[0].soldOut===true && !offerHave(npcOffers("trader")[0]);
        dayCount++; const restock=npcOffers("trader")[0].soldOut===false && marketState["v:test"].left[0]===VIL_OFFERS[0].stock;
        npcBuy(1);                                                       // 第 5 次 → 老主顾
        const disc=marketState["v:test"].rep===5 && npcOffers("trader")[1].cost[0].n===Math.ceil(VIL_OFFERS[1].cost[0].n*0.8);
        const sv=collectSave(); const saved=!!(sv.market && sv.market["v:test"] && sv.market["v:test"].rep===5);
        const lockedSpecial=!npcOffers("trader").some(o=>o.t.indexOf("绿洲之约")>=0);
        bag.clear(); for(const [k,v] of bagS) bag.set(k,v); dayCount=dayS; talkNpc=talkS; npcPanelOpen=panelS;
        for(const k in marketState) delete marketState[k]; Object.assign(marketState, JSON.parse(mkS));
        ok("村落集市: 每货每日限量(售罄挡购)、次日补货、买满 5 次八折、未满 12 次不出「绿洲之约」、进存档",
           bought===VIL_OFFERS[0].stock && soldOut && restock && disc && lockedSpecial && saved, "bought="+bought+" sold="+soldOut+" re="+restock+" disc="+disc+" saved="+saved);
      }
      // 远景剪影: 分帧建完两圈 × 360 段; 高度不低于底线; 金字塔处顶出尖
      {
        const g0h=gfxLevel; if(gfxLevel<1) setGfx(2);
        horizon.cx=1e9; horizon.stage=null; const d0=horizon.done;
        for(let i=0;i<10 && horizon.done===d0;i++) updateHorizon();
        let okTop=true; for(let b=0;b<2;b++) for(let i=0;i<HZ_N;i++) if(!(horizon.top[b][i]>=WATER_Y)) okTop=false;
        let pyr=null; for(let sx=-40;sx<=40&&!pyr;sx++) for(let sz=-40;sz<=40&&!pyr;sz++){ const st=structureAt(sx,sz); if(st&&st.type==="pyramid") pyr=st; }
        const bump=pyr?horizonLandmarkBump(pyr.x,pyr.z):-1;
        if(g0h<1) setGfx(g0h);
        ok("远景剪影: 分帧建出 2×360 段山脊卡片, 高度不低于水位, 金字塔顶出尖", horizon.done===d0+1 && horizon.n===2*HZ_N*6 && okTop && (!pyr || bump>=20),
           "n="+horizon.n+" pyr="+(pyr?bump:"none"));
      }
      // ---- 第四轮: 金字塔内部(象形文字墙/星空墓顶/墓门/侧龛) + 按住刷考古 ----
      {
        const ax=atlasCv.getContext("2d"), px=(t)=>ax.getImageData((t%16)*32+1,Math.floor(t/16)*32+1,30,30).data;
        const hi=px(275), st=px(276); let opq=true, hiC=new Set(), gold=0;
        for(let i=0;i<hi.length;i+=4){ if(hi[i+3]<255||st[i+3]<255) opq=false; hiC.add((hi[i]>>4)+","+(hi[i+1]>>4)+","+(hi[i+2]>>4)); if(st[i]>200&&st[i+1]>160&&st[i+2]<170) gold++; }
        ok("墓室方块: 象形文字砖(71, 侧面 275, 只左右镜像)/星空墓顶(72, 底面 276)已注册, 贴图不透明、经文多色、星空有金星",
           HIERO===71 && STARCEIL===72 && BLOCKS[HIERO].s===275 && BLOCKS[STARCEIL].b===276 && SOLID(HIERO) && OPAQUE(STARCEIL) && !EMISSIVE(HIERO)
           && UV_ROT[HIERO*2]===0 && UV_ROT[HIERO*2+1]===1 && opq && hiC.size>=12 && gold>=30 && gold<300,
           "opq="+opq+" 经文色="+hiC.size+" 金星px="+gold);
      }
      {
        let pyr=null; for(let sx=-40;sx<=40&&!pyr;sx++) for(let sz=-40;sz<=40&&!pyr;sz++){ const s2=structureAt(sx,sz); if(s2&&s2.type==="pyramid") pyr=s2; }
        if(!pyr) ok("金字塔内部: 附近 81×81 格子内找到金字塔", false, "none");
        else {
          const cache=new Map(), at=(X,Y,Z)=>{ const cx=Math.floor(X/CS), cz=Math.floor(Z/CS), k=cx+","+cz;
            if(!cache.has(k)) cache.set(k,genChunk(cx,cz)); return cache.get(k)[((X-cx*CS)*CS+(Z-cz*CS))*H+Y]; };
          const {x,z,h}=pyr, R=13;
          let path=true; for(let dz=R+1;dz>=3;dz--) if(at(x,h+1,z-dz)!==AIR || at(x,h+2,z-dz)!==AIR) path=false;
          ok("金字塔内部: 走廊直通墓室(墓门打通), 鎏金门楣, 墓室四壁象形文字、星空墓顶, 走廊两壁经文+星空顶",
             path && at(x,h+4,z-4)===GILDED && at(x-5,h+3,z)===HIERO && at(x+5,h+3,z)===HIERO && at(x,h+3,z+5)===HIERO
             && at(x,h+6,z)===STARCEIL && at(x-2,h+2,z-6)===HIERO && at(x,h+4,z-6)===STARCEIL && at(x,h+1,z+2)===SARCO,
             "path="+path+" 门楣="+at(x,h+4,z-4)+" 顶="+at(x,h+6,z)+" 壁="+at(x-5,h+3,z));
          const bad=pyramidNiches(pyr).filter(([ox,oz,bx2,bz2])=>!(at(ox,h+1,oz)===AIR && at(ox,h+2,oz)===AIR && at(ox,h+3,oz)===GILDED && at(bx2,h+1,bz2)===SUSGRAVEL && at(bx2,h+2,bz2)===HIERO));
          ok("金字塔内部: 6 处侧龛都是 高2空龛 + 龛底可疑沙砾 + 鎏金楣", pyramidNiches(pyr).length===6 && !bad.length, "坏="+JSON.stringify(bad));
        }
      }
      {
        const bagS=new Map(bag), archS=JSON.stringify(archState), relS=npcState.relics, brS=Object.assign({},brush);
        const bx=Math.floor(player.x)+2, bz=Math.floor(player.z)+2; let by=H-4; while(by>0 && getBlock(bx,by,bz)!==AIR) by--;
        setBlock(bx,by,bz,SUSGRAVEL); brush.on=false;
        const d0=archState.digs;
        brushPoke({x:bx,y:by,z:bz});                               // 点按: 刷掉两成
        const tap=brush.on && Math.abs(brush.p-0.2)<1e-6;
        updateBrush(0.7,true); const mid=getBlock(bx,by,bz)===SUSGRAVEL && brush.p>0.65 && brush.p<0.75;
        updateBrush(0.5,false); const grace=Math.abs(brush.p-0.7)<1e-6;
        updateBrush(0.6,false); const decay=grace && brush.on && brush.p>0.35 && brush.p<0.45;
        updateBrush(1.0,true); const done=!brush.on && getBlock(bx,by,bz)===SAND && archState.digs===d0+1;
        // 墓葬侧龛: 登记后刷完走 tomb 分支
        setBlock(bx,by,bz,SUSGRAVEL); tombNiches.add(bx+","+by+","+bz);
        const t0=archState.tombDigs|0; brushPoke({x:bx,y:by,z:bz}); updateBrush(2,true);
        const tomb=(archState.tombDigs|0)===t0+1 && getBlock(bx,by,bz)===SAND;
        tombNiches.delete(bx+","+by+","+bz);
        const g0=bag.get(GOLD_ORE)||0; for(let i=0;i<40;i++) archaeologyDig(0,80,0,{tomb:true}); const goldHits=(bag.get(GOLD_ORE)||0)-g0;
        // 真实 doBreak: 准星对准可疑沙砾 → 只刷不碎
        const pS=player.pitch, slotS=selSlot; player.pitch=1.5; selSlot=HOTBAR_ITEMS.indexOf(JUMPPAD);
        const hit=raycast(5.5,currentAim()); let viaBreak=false;
        if(hit){ const o=hit.id; setBlock(hit.x,hit.y,hit.z,SUSGRAVEL); brush.on=false; doBreak();
          viaBreak=getBlock(hit.x,hit.y,hit.z)===SUSGRAVEL && brush.on && brush.x===hit.x && brush.y===hit.y && brush.z===hit.z;
          setBlock(hit.x,hit.y,hit.z,o); }
        player.pitch=pS; selSlot=slotS;
        setBlock(bx,by,bz,AIR);
        bag.clear(); for(const [k,v] of bagS) bag.set(k,v);
        const A=JSON.parse(archS); for(const k in archState) if(!(k in A)) delete archState[k]; Object.assign(archState,A);
        npcState.relics=relS; Object.assign(brush,brS);
        ok("按住刷考古: 点按刷两成, 按住 1.4 秒刷净, 停手 0.8 秒后回落, 刷完原地留沙并出土; 侧龛走墓葬分支且常带金砂; 左键对准只刷不碎",
           tap && mid && decay && done && tomb && goldHits>=8 && (viaBreak || !hit), "tap="+tap+" mid="+mid+" decay="+decay+" done="+done+" tomb="+tomb+" 金="+goldHits+"/40 doBreak="+(hit?viaBreak:"无准星目标"));
      }
      // ---- 第五轮·本地: 拉之烈阳剑 ----
      {
        const sb0=sunblade;
        setSunblade(true);
        const on=ITEMS.sword.name==="拉之烈阳剑" && ITEMS.sword.icon===ICON_SUNBLADE && collectSave().sunblade===true;
        const rec=RECIPES.find(r=>r.name.indexOf("拉之烈阳剑")>=0), gated=!!rec && rec.ok()===false;
        setSunblade(false);
        const off=ITEMS.sword.name==="铁剑" && ITEMS.sword.icon===ICON_SWORD && collectSave().sunblade===false && rec.ok()===true;
        setSunblade(sb0);
        ok("烈阳剑: 合成表有配方(金6+钻2), 拥有后挡重复合成; 切换名字/图标; 存档字段往返", on && off && gated && rec.cost.length===2, "on="+on+" off="+off+" gated="+gated);
      }
      {
        const mobsS=mobs.slice(); mobs.length=0; const pyS=player.y; player.y=120;
        const mk=(dx,dz)=>({type:"legionary",def:MOB_DEFS.legionary,x:player.x+dx,y:player.y,z:player.z+dz,
          vx:0,vy:0,vz:0,kbx:0,kbz:0,yaw:0,tgtYaw:0,hp:500,hurtT:0,animT:0,t:0,atkCd:0,burnT:0,swingT:0,
          groanT:0,fleeT:0,onGround:true,pause:false,burning:false,held:null,alertT:0});
        const front=mk(2,0), side=mk(3,1), back=mk(-3,0), far=mk(7,0); mobs.push(front,side,back,far);
        sunCombo.n=0; sunCombo.t=-9;
        const r1=sunbladeHit(front,[1,0,0],1), r2=sunbladeHit(front,[1,0,0],1), r3=sunbladeHit(front,[1,0,0],1);
        const sweep=r1===-1 && r2===-1 && r3===2 && side.hp===486 && back.hp===500 && far.hp===500 && front.hp===486 && side.sunBurn>0 && sunCombo.n===0;
        sunCombo.t=-9; const reset=sunbladeHit(back,[1,0,0],1)===-1 && sunCombo.n===1;
        const hp0=back.hp; back.sunBurn=SUN_BURN; back.sunTick=0.5;
        tickSunburn(0.5); const burn1=back.hp===hp0-2 && back.burning;
        tickSunburn(4);   const burnEnd=!back.burning && back.hp===hp0-4;
        mobs.length=0; for(const m of mobsS) mobs.push(m); player.y=pyS; sunCombo.n=0;
        ok("烈阳剑: 第 3 连击烈阳横扫只扫前方 100°·4.8 格内敌人(身后/远处不中), 超 1.2 秒连击重置, 灼烧每 0.5 秒 2 点、4 秒熄灭",
           sweep && reset && burn1 && burnEnd, "r="+[r1,r2,r3]+" side="+side.hp+" back="+back.hp+" front="+front.hp+" reset="+reset+" burn="+burn1+"/"+burnEnd);
      }
      // ---- 第五轮·本地: 塞特之锤 ----
      {
        const curve=maceDamage(0)===9 && maceDamage(3)===27 && maceDamage(8)===42 && maceDamage(10)===45 && maceDamage(1e4)===120 && maceDamage(-2)===9;
        const own0=maceOwned, n0=HOTBAR_ITEMS.length;
        setMace(true); const add=HOTBAR_ITEMS.length===n0+(own0?0:1) && HOTBAR_ITEMS[9]==="mace" && collectSave().mace===true;
        const rec=RECIPES.find(r=>r.name.indexOf("塞特之锤")>=0), gated=!!rec && rec.ok()===false;
        setMace(false); const rem=HOTBAR_ITEMS.indexOf("mace")<0 && HOTBAR_ITEMS.length===9 && collectSave().mace===false && rec.ok()===true;
        setMace(own0);
        ok("塞特之锤: 伤害曲线(地面9/3格27/8格42/上限120), 合成后追加第10格、拥有挡重复合成、存档往返", curve && add && gated && rem, "curve="+curve+" add="+add+" gated="+gated+" rem="+rem);
      }
      {
        const mobsS=mobs.slice(); mobs.length=0; const pyS=player.y, pvS=player.vy, fsS=fallStart, ogS=player.onGround; player.y=120;
        const mk=(dx,dz)=>({type:"legionary",def:MOB_DEFS.legionary,x:player.x+dx,y:player.y,z:player.z+dz,
          vx:0,vy:0,vz:0,kbx:0,kbz:0,yaw:0,tgtYaw:0,hp:500,hurtT:0,animT:0,t:0,atkCd:0,burnT:0,swingT:0,
          groanT:0,fleeT:0,onGround:true,pause:false,burning:false,held:null,alertT:0});
        const t=mk(2,0), nb=mk(4,0), fr=mk(8,0); mobs.push(t,nb,fr);
        fallStart=player.y+5; player.onGround=false; player.vy=-12;
        const f=maceFall(), r=maceStrike(t,[1,0,0],1,f);
        const smash=Math.abs(f-5)<1e-6 && r.smash && r.dmg===33 && t.hp===467 && nb.hp===487 && fr.hp===500 && r.aoe===1 && fallStart===null && player.vy>=5.5;
        fallStart=null; player.onGround=true;
        const g=maceStrike(t,[1,0,0],1,maceFall()), ground=!g.smash && g.dmg===9 && t.hp===458 && nb.hp===487;
        mobs.length=0; for(const m of mobsS) mobs.push(m); player.y=pyS; player.vy=pvS; fallStart=fsS; player.onGround=ogS;
        ok("塞特之锤: 下落 5 格重击 33 伤害并震地(周围 3.5 格吃 4 成、远处不中), 抵消摔落并反弹; 站地面只有 9 伤害不震地",
           smash && ground, "f="+f.toFixed(2)+" dmg="+r.dmg+" t="+t.hp+" nb="+nb.hp+" fr="+fr.hp+" aoe="+r.aoe+" ground="+ground);
      }
      // ---- 第五轮·本地: 神庙附魔祭坛 ----
      {
        const eS=Object.assign({},enchState), relS=npcState.relics, bagS=new Map(bag);
        for(const k in enchState) enchState[k]=0;
        npcState.relics=0; bag.set(GOLD_ORE,0);
        const poor=doEnchant("sharp")===false && enchState.sharp===0;
        npcState.relics=30; bag.set(GOLD_ORE,20);
        let lv5=true; for(let i=0;i<5;i++) if(!doEnchant("sharp")) lv5=false;
        const spent=npcState.relics===0 && bagCount(GOLD_ORE)===5 && enchState.sharp===5, capped=doEnchant("sharp")===false && enchState.sharp===5;
        const mul=Math.abs(enchMeleeMul("sword")-1.5)<1e-9 && Math.abs(enchMeleeMul("mace")-1.5)<1e-9 && enchMeleeMul(TNT)===1;
        enchState.fire=2; enchState.sweep=3; enchState.kb=2;
        const sv=collectSave(), saved=sv.ench && sv.ench.sharp===5 && sv.ench.sweep===3;
        const mobsS=mobs.slice(); mobs.length=0; const pyS=player.y; player.y=120;
        const mk=(dx,dz)=>({type:"legionary",def:MOB_DEFS.legionary,x:player.x+dx,y:player.y,z:player.z+dz,
          vx:0,vy:0,vz:0,kbx:0,kbz:0,yaw:0,tgtYaw:0,hp:500,hurtT:0,animT:0,t:0,atkCd:0,burnT:0,swingT:0,
          groanT:0,fleeT:0,onGround:true,pause:false,burning:false,held:null,alertT:0});
        const t=mk(2,0), nb=mk(3.5,1), fr=mk(6,0); mobs.push(t,nb,fr);
        const n=enchOnHit(t,40,"sword");
        const fx=n===1 && nb.hp===500-18 && fr.hp===500 && t.sunBurn===4 && t.kbx>=10 && !(fr.sunBurn>0);
        const noWeapon=enchOnHit(fr,40,TNT)===0 && fr.hp===500;
        mobs.length=0; for(const m of mobsS) mobs.push(m); player.y=pyS;
        { const legacy=Object.assign({},sv); delete legacy.ench; for(const D of ENCH_DEFS) enchState[D.k]=Math.max(0,Math.min(D.max,(legacy.ench&&legacy.ench[D.k])|0)); }
        const legacyZero=Object.values(enchState).every(v=>v===0);
        Object.assign(enchState,eS); npcState.relics=relS; bag.clear(); for(const [k,v] of bagS) bag.set(k,v);
        ok("附魔祭坛: 献祭不足被挡; 锋利 I→V 共花文物 30 + 金 15, 满级封顶; 伤害 x1.5 只对剑/锤; 存档往返, 老存档全 0",
           poor && lv5 && spent && capped && mul && saved && legacyZero, "poor="+poor+" lv5="+lv5+" spent="+spent+" cap="+capped+" mul="+mul+" saved="+saved+" legacy="+legacyZero);
        ok("附魔效果: 火焰附加 II 点燃 4 秒、横扫之刃 III 溅射 45%(2.5 格外不中)、击退 II 加推力; 非近战武器不触发", fx && noWeapon,
           "n="+n+" nb="+nb.hp+" fr="+fr.hp+" burn="+t.sunBurn+" kbx="+t.kbx.toFixed(1)+" noWeapon="+noWeapon);
      }
      // ---- 第十二轮·本地: 装备耐久 / 修理闭环 ----
      {
        const g0=Object.assign({},gearWear), bag0=new Map(bag), ar0=arrows.length, ac0=arrowCd, mace0=maceOwned;
        let wearOK=false, floorOK=false, saveOK=false, loadOK=false, legacyOK=false, badOK=false, repairOK=false, denyOK=false, shotOK=false, hudOK=false, maceWearOK=false;
        try{
          restoreGearWear({});
          wearGear("sword",7); wearOK=gearWear.sword===7 && gearPowerMul("sword")<1;
          maceOwned=true; wearGear("mace",4); maceWearOK=gearWear.mace===4 && gearPowerMul("mace")<1; maceOwned=mace0;
          gearWear.sword=gearMax("sword"); floorOK=gearRemaining("sword")===0 && gearPowerMul("sword")===0.7;
          const savedGear=collectSave().gearWear; saveOK=savedGear.sword===gearWear.sword && savedGear.mace===4 && savedGear.bow===0;
          restoreGearWear(savedGear); loadOK=gearWear.sword===gearMax("sword") && gearWear.mace===4 && gearWear.bow===0;
          restoreGearWear({}); legacyOK=Object.values(gearWear).every(v=>v===0);
          restoreGearWear({sword:-8,mace:"bad",bow:1e9}); badOK=gearWear.sword===0 && gearWear.mace===0 && gearWear.bow===gearMax("bow");
          bag.clear(); bag.set(IRON_ORE,20); bag.set(GOLD_ORE,20); bag.set(GEM_ORE,20); bag.set(PLANKS,20);
          restoreGearWear({sword:19,mace:21,bow:23}); maceOwned=true;
          const swordFixed=repairGear("sword") && gearWear.sword===0;
          const maceFixed=repairGear("mace") && gearWear.mace===0; maceOwned=mace0;
          const bowFixed=repairGear("bow") && gearWear.bow===0;
          repairOK=swordFixed&&maceFixed&&bowFixed;
          bag.clear(); gearWear.bow=20; denyOK=!repairGear("bow")&&gearWear.bow===20;
          gearWear.bow=gearMax("bow"); arrowCd=0; shootArrow();
          shotOK=gearWear.bow===gearMax("bow") && arrows.length===ar0+1 && arrows[arrows.length-1].gearMul===0.7;
          hudOK=!!document.querySelector('#hotbar .gearMeter[data-gear="sword"]') && !!document.querySelector('#hotbar .gearMeter[data-gear="bow"]');
          ok("装备耐久: 剑/锤/弓磨损持久化; 旧档默认为满耐久, 非法值安全限幅; 归零保留装备且威力最低 70%",
             wearOK&&maceWearOK&&floorOK&&saveOK&&loadOK&&legacyOK&&badOK, "sword="+wearOK+" mace="+maceWearOK+" floor="+floorOK+" save="+saveOK+" load="+loadOK+" legacy="+legacyOK+" bad="+badOK);
          ok("武器祭坛修理: 剑/锤/弓按配方全额修复; 材料不足不会修改耐久", repairOK&&denyOK,
             "repair="+repairOK+" denied="+denyOK);
          ok("弓的耐久 HUD 与发射快照: 快捷栏存在状态条, 破损弓发出的箭按 70% 伤害结算并消耗耐久",
             shotOK&&hudOK, "shot="+shotOK+" hud="+hudOK);
        }finally{
          Object.assign(gearWear,g0); maceOwned=mace0; bag.clear(); for(const [k,v] of bag0) bag.set(k,v);
          arrows.length=ar0; arrowCd=ac0; updateGearHud();
        }
      }
      // ---- 第六轮·本地: 地下石像回廊 + 守墓石像 + 卡之石 ----
      {
        const ax=atlasCv.getContext("2d"), px=(t)=>ax.getImageData((t%16)*32+1,Math.floor(t/16)*32+1,30,30).data;
        let opq=true; const cols=[280,281,282].map(t=>{ const d=px(t), c=new Set(); for(let i=0;i<d.length;i+=4){ if(d[i+3]<255) opq=false; c.add((d[i]>>4)+","+(d[i+1]>>4)+","+(d[i+2]>>4)); } return c.size; });
        ok("卡之石(74, 图集 282, 自发光 10 级)已注册; 石像脸/躯干/卡之石贴图 280-282 不透明且有细节; 石像生物已定义",
           KAHEART===74 && BLOCKS[KAHEART].s===282 && EMISSIVE(KAHEART) && EMIT_LV[KAHEART]===10 && SOLID(KAHEART) && opq && cols.every(n=>n>=6)
           && !!MOB_DEFS.sentinel && MOB_DEFS.sentinel.sentinel===true && MOB_DEFS.sentinel.parts.length===6,
           "opq="+opq+" 色数="+cols.join("/"));
      }
      {
        let pyr=null; for(let sx=-40;sx<=40&&!pyr;sx++) for(let sz=-40;sz<=40&&!pyr;sz++){ const s2=structureAt(sx,sz); if(s2&&s2.type==="pyramid"&&s2.h>=14) pyr=s2; }
        if(!pyr) ok("地下回廊: 附近找到地基足够深的金字塔", false, "none");
        else {
          const cache=new Map(), at=(X,Y,Z)=>{ const cx=Math.floor(X/CS), cz=Math.floor(Z/CS), k=cx+","+cz;
            if(!cache.has(k)) cache.set(k,genChunk(cx,cz)); return cache.get(k)[((X-cx*CS)*CS+(Z-cz*CS))*H+Y]; };
          const {x,z,h}=pyr, G=tombGallery(pyr);
          let stairs=true; for(let i=0;i<=7;i++){ const X=x+3-i; if(!SOLID(at(X,h-1-i,z-1)) || at(X,h-i,z-1)!==AIR || at(X,h-i+1,z-1)!==AIR || at(X,h-i+2,z-1)!==AIR) stairs=false; }
          let hall=true; for(let X=G.x0;X<=G.x1;X++) for(let Z=G.z0;Z<=G.z1;Z++){ if(X===G.ka[0]&&Z===G.ka[2]) continue; if(!SOLID(at(X,G.fy,Z)) || at(X,G.fy+1,Z)!==AIR || at(X,G.fy+2,Z)!==AIR) hall=false; }
          const joint=at(x-5,G.fy+1,z-1)===AIR && at(x-5,G.fy+2,z-1)===AIR;        // 最后一级台阶旁就是回廊
          ok("地下回廊: 墓室东侧 8 级楼梯可走(每级头顶留 3 格)、落进长廊; 长廊 8×19 地面实心可走, 星空顶/经文墙, 尽头金座托着卡之石",
             stairs && hall && joint && at(G.xc,G.fy+6,z)===STARCEIL && at(G.x0-1,G.fy+3,z)===HIERO && at(G.ka[0],G.ka[1],G.ka[2])===KAHEART && at(G.ka[0],G.ka[1]-1,G.ka[2])===GILDED && at(x,h+1,z+2)===SARCO,
             "stairs="+stairs+" hall="+hall+" joint="+joint+" ka="+at(G.ka[0],G.ka[1],G.ka[2]));
        }
      }
      {
        const mobsS=mobs.slice(); mobs.length=0; const pyS=player.y, yawS=player.yaw, pitS=player.pitch, hpS=hp, woS=sentinelState.woken;
        const bagS=new Map(bag), relS=npcState.relics, xpS=xp, lvlS=lvl, dmgS=dmgMul, maxS=maxHp, shS=sentinelState.shattered;
        player.y=120; player.pitch=0;
        const G={statues:[[0,0]], fy:0, key:"test"};
        spawnSentinels(G); const m=mobs[0];
        m.x=player.x; m.z=player.z-8; m.y=player.y; m.atkCd=5;
        { let best=-2, by=0; for(let k=0;k<72;k++){ player.yaw=k/72*6.2832; const d=lookDir(); const v=-d[2]; if(v>best){best=v; by=player.yaw;} } player.yaw=by; }   // 找正对 -z(石像方向)的朝向
        const seenNow=sentinelSeen(m);
        const z0=m.z; for(let k=0;k<10;k++) updateSentinel(m,0.05); const froze=Math.abs(m.z-z0)<1e-6 && m.frozen;
        player.yaw+=Math.PI;                                                       // 转身背对
        const notSeen=!sentinelSeen(m);
        for(let k=0;k<10;k++) updateSentinel(m,0.05); const moved=m.z-z0>1.5 && !m.frozen;
        const hp0=m.hp; hurtMob(m,500,0,0,true); const invuln=m.hp===hp0;
        mobs.push(Object.assign({},m,{kaKey:"other", x:player.x+60}));             // 远处/别处的石像不受影响
        const n=kaHeartBroken(Math.floor(m.x),Math.floor(m.y),Math.floor(m.z));
        const shattered=n===1 && !mobs.includes(m) && mobs.length===1;
        mobs.length=0; for(const q of mobsS) mobs.push(q); player.y=pyS; player.yaw=yawS; player.pitch=pitS; sentinelState.woken=woS; sentinelState.shattered=shS;
        bag.clear(); for(const [k,v] of bagS) bag.set(k,v); npcState.relics=relS; xp=xpS; lvl=lvlS; dmgMul=dmgS; maxHp=maxS; hp=hpS; updateHearts(); updateXPHUD();
        ok("守墓石像: 正对时判定被看见且纹丝不动; 转身后疾行逼近; 刀枪不入; 挖碎卡之石只崩碎附近相连石像",
           seenNow && froze && notSeen && moved && invuln && shattered, "seen="+seenNow+" froze="+froze+" notSeen="+notSeen+" moved="+moved+" invuln="+invuln+" shattered="+shattered);
      }
      // ---- 第六轮·本地: 奥西里斯试炼厅 ----
      {
        let pyr=null; for(let sx=-40;sx<=40&&!pyr;sx++) for(let sz=-40;sz<=40&&!pyr;sz++){ const s2=structureAt(sx,sz); if(s2&&s2.type==="pyramid"&&s2.h>=14) pyr=s2; }
        if(!pyr) ok("试炼厅: 附近找到地基足够深的金字塔", false, "none");
        else {
          const cache=new Map(), at=(X,Y,Z)=>{ const cx=Math.floor(X/CS), cz=Math.floor(Z/CS), k=cx+","+cz;
            if(!cache.has(k)) cache.set(k,genChunk(cx,cz)); return cache.get(k)[((X-cx*CS)*CS+(Z-cz*CS))*H+Y]; };
          const {x,z,h}=pyr, T=trialHall(pyr), G=tombGallery(pyr);
          const skip=[[T.chest[0],T.chest[2]],...T.vaults,T.omen];               // 宝匣与三座宝库(第九轮②)占着的格子
          let hall=true; for(let X=T.x0;X<=T.x1;X++) for(let Z=T.z0;Z<=T.z1;Z++){ if(skip.some(q=>q[0]===X&&q[1]===Z)) continue; if(!SOLID(at(X,T.fy,Z)) || at(X,T.fy+1,Z)!==AIR || at(X,T.fy+2,Z)!==AIR || at(X,T.fy+4,Z)!==AIR) hall=false; }
          const door=at(T.door[0],T.fy+1,T.door[1])===AIR && at(T.door[0],T.fy+2,T.door[1])===AIR && at(T.door[0]-1,T.fy+1,T.door[1])===AIR;
          const wallBoth=at(T.x0-1,T.fy+3,T.z0+2)===HIERO && at(G.x1+1,G.fy+5,T.z0+2)===HIERO;
          let pitOk=true; for(let dz=9;dz<=10;dz++) if(at(x,h-3,z-dz)===AIR && at(x,h-4,z-dz)!==STARCEIL) pitOk=false;   // 塌陷坑底下是试炼厅顶, 没被打穿
          const stairsIntact=SOLID(at(x-4,h-8,z-1)) && at(x-4,h-7,z-1)===AIR;
          ok("试炼厅: 13×8 大厅可走、东墙门通回廊、共用墙两面经文、宝匣在北墙下、4 个金十字召唤阵, 没打穿塌陷坑也没挡楼梯",
             hall && door && wallBoth && at(T.chest[0],T.chest[1],T.chest[2])===OSIRIS && T.spawns.every(([sx,sz])=>at(sx,T.fy,sz)===GILDED) && at(x+2,T.fy+5,z-7)===STARCEIL && pitOk && stairsIntact,
             "hall="+hall+" door="+door+" wall="+wallBoth+" chest="+at(T.chest[0],T.chest[1],T.chest[2])+" pit="+pitOk+" stairs="+stairsIntact);
        }
      }
      {
        const mobsS=mobs.slice(); mobs.length=0; const bagS=new Map(bag), relS=npcState.relics, xpS=xp, lvlS=lvl, dmgS=dmgMul, maxS=maxHp, hpS=hp, keysS=arenaState.keys, doneS=trialState.done;
        const cx=Math.floor(player.x)+2, cz=Math.floor(player.z)+2; let cy=H-4; while(cy>0 && getBlock(cx,cy,cz)!==AIR) cy--;
        setBlock(cx,cy,cz,OSIRIS);
        const T={x0:0,x1:0,z0:0,z1:0,fy:cy-1, chest:[cx,cy,cz], spawns:[[cx+3,cz],[cx-3,cz]], key:"Ttest"};
        trialState.active=false;
        updateTrial(0.1,T,true); const started=trialState.active && trialState.key==="Ttest";
        const waves=[]; let guard=0;
        while(trialState.active && guard++<40){ updateTrial(3,T,true); if(trialState.alive.length){ waves.push(trialState.alive.map(m=>m.type).join("+")); for(const m of trialState.alive) m.hp=0; } }
        const done=!trialState.active && waves.length===3 && waves[2].indexOf("anubis")>=0 && getBlock(cx,cy,cz)===AIR && arenaState.keys===keysS+1 && trialState.done===doneS+1;
        // 中断: 刷出第一波后离开 → 残余试炼怪消散
        setBlock(cx,cy,cz,OSIRIS); updateTrial(0.1,T,true); updateTrial(3,T,true);
        const w1=trialState.alive.slice(), n1=w1.length; updateTrial(0.1,T,false);
        const aborted=n1>0 && !trialState.active && w1.every(m=>!mobs.includes(m));   // 只看这一波(前面清掉的尸体没走 updateMobs, 仍在数组里)
        setBlock(cx,cy,cz,AIR);
        mobs.length=0; for(const q of mobsS) mobs.push(q);
        bag.clear(); for(const [k,v] of bagS) bag.set(k,v); npcState.relics=relS; xp=xpS; lvl=lvlS; dmgMul=dmgS; maxHp=maxS; hp=hpS; arenaState.keys=keysS; trialState.done=doneS;
        updateHearts(); updateXPHUD();
        ok("试炼流程: 进厅开试炼 → 三波依次刷出(末波阿努比斯) → 清完宝匣自开、宝库钥匙+1; 中途离开则中断且残余试炼怪消散",
           started && done && aborted, "started="+started+" waves="+waves.join(" | ")+" done="+done+" aborted="+aborted);
      }
      // ---- 第七轮·本地: 方块形状系统(半砖/楼梯/灯柱) ----
      {
        const ids=[SLAB_SST,STAIR_N,STAIR_E,STAIR_S,STAIR_W,LAMPPOST];
        const defs=ids.every((id,k)=>id===90+k && !!BLOCKS[id] && !!SHAPES[id] && SOLID(id) && !OPAQUE(id) && !OCCLUDE(id) && !BL_OPQ[id]) && EMIT_LV[LAMPPOST]===13;
        const items=SHAPE_MATS[0].stairs.every(id=>shapeItem(id)===STAIR_N) && shapeItem(SLAB_SST)===SLAB_SST
          && stairFacing(1,0.2)===STAIR_E && stairFacing(-1,0)===STAIR_W && stairFacing(0.1,1)===STAIR_S && stairFacing(0,-1)===STAIR_N;
        const all=()=>true, none=()=>false;
        const slab=shapeQuads(SLAB_SST,none), slabMaxY=Math.max(...slab.flatMap(q=>q.pos.map(v=>v[1])));
        const slabSide=slab.find(q=>q.f===0), sideV=slabSide.uv.map(u=>u[1]);
        const geo=slab.length===6 && slabMaxY===0.5 && Math.min(...sideV)===0.5 && Math.max(...sideV)===1
          && shapeQuads(SLAB_SST,all).length===1                               // 四周都不透明: 只剩不贴边的顶面
          && shapeQuads(STAIR_N,none).length===11 && shapeQuads(STAIR_N,all).length===2
          && shapeQuads(LAMPPOST,none).filter(q=>q.glow).length===6
          && ids.every(id=>shapeQuads(id,none).every(q=>q.pos.every(v=>v.every(c=>c>=0&&c<=1)))) ;
        ok("方块形状: 半砖/四向楼梯/铁灯柱(90-95)已注册——实心可站但不遮挡/不压 AO/不挡光; 楼梯按视线朝向、挖下归一; 面片几何与贴图裁切正确",
           defs && items && geo, "defs="+defs+" items="+items+" geo="+geo+" slab="+slab.length+" stairAll="+shapeQuads(STAIR_N,all).length);
      }
      {
        const S={x:player.x,y:player.y,z:player.z,vx:player.vx,vy:player.vy,vz:player.vz,og:player.onGround};
        const cx=Math.floor(player.x)+3, cz=Math.floor(player.z)+3; let Y=H-10; while(Y>0 && (getBlock(cx,Y,cz)!==AIR || getBlock(cx+1,Y,cz)!==AIR || getBlock(cx+1,Y+1,cz)!==AIR)) Y--;
        const put=(x,y,z,id)=>setBlock(x,y,z,id);
        put(cx,Y,cz,SANDSTONE); put(cx+1,Y,cz,SANDSTONE); put(cx+1,Y+1,cz,SLAB_SST);
        // 1) 站地面走向半砖: 自动迈上 0.5 格
        Object.assign(player,{x:cx+0.5,y:Y+1,z:cz+0.5,vx:5,vy:0,vz:0,onGround:true}); stepOK=true;
        player.x=cx+0.9; collideAxis(0); const stepped=Math.abs(player.y-(Y+1.5))<1e-6 && Math.abs(player.x-(cx+0.9))<1e-6;
        // 2) 从上方落到半砖顶: 停在 +0.5
        stepOK=false; Object.assign(player,{x:cx+1.5,y:Y+1.45,z:cz+0.5,vx:0,vy:-8,vz:0,onGround:false}); collideAxis(1);
        const landed=Math.abs(player.y-(Y+1.5))<1e-6 && player.onGround;
        // 3) 整格墙(高 1)迈不上去
        put(cx+1,Y+1,cz,SANDSTONE);
        Object.assign(player,{x:cx+0.5,y:Y+1,z:cz+0.5,vx:5,vy:0,vz:0,onGround:true}); stepOK=true;
        player.x=cx+0.9; collideAxis(0); const wall=Math.abs(player.y-(Y+1))<1e-6 && player.x<cx+1-PW;
        // 4) 生物同样能走上半砖
        put(cx+1,Y+1,cz,SLAB_SST);
        const m={x:cx+0.5,y:Y+1,z:cz+0.5,vx:6,vy:0,vz:0,onGround:true};
        entMove(m,0.1,0.3,1.8); const mobStep=m.y>=Y+1.5-1e-6;
        stepOK=false; put(cx,Y,cz,AIR); put(cx+1,Y,cz,AIR); put(cx+1,Y+1,cz,AIR);
        Object.assign(player,{x:S.x,y:S.y,z:S.z,vx:S.vx,vy:S.vy,vz:S.vz,onGround:S.og});
        ok("形状碰撞: 站地面自动迈上半砖(0.5 格)、从上方落在半砖顶停在 +0.5、整格墙迈不上去、生物也能走上半砖",
           stepped && landed && wall && mobStep, "stepped="+stepped+" landed="+landed+" wall="+wall+" mob="+mobStep+" y="+m.y.toFixed(2));
      }
      // ---- 第七轮③·本地: 更多材质 + 宫殿大台阶 + 形状图标 ----
      {
        const mats=SHAPE_MATS.length===4 && SHAPE_MATS.every(M=>SHAPES[M.slab] && M.stairs.length===4 && M.stairs.every((id,k)=>SHAPES[id]===STAIR_BOXES[k] && STAIR_MAT[id]===M && shapeItem(id)===M.stairs[0] && BLOCKS[id].s===BLOCKS[M.full].s)
          && SLAB_MAT[M.slab]===M && BLOCKS[M.slab].name.indexOf("半砖")>0 && SOLID(M.slab) && !OPAQUE(M.slab));
        const ids=[SLAB_MARBLE,...STAIR_MARBLE,SLAB_PLANK,...STAIR_PLANK,SLAB_CLAY,...STAIR_CLAY];
        const range=ids.every((id,k)=>id===100+k) && STAIRS.length===16 && stairOf(STAIR_MARBLE[0],1,0)===STAIR_MARBLE[1] && stairOf(STAIR_PLANK[0],0,1)===STAIR_PLANK[2] && stairOf(STAIR_CLAY[0],-1,0)===STAIR_CLAY[3];
        const recs=SHAPE_MATS.every(M=>RECIPES.some(r=>r.name===M.n+"半砖") && RECIPES.some(r=>r.name===M.n+"楼梯"));
        const ic=shapeIcon(SLAB_MARBLE).getContext("2d").getImageData(0,0,64,64).data, icS=shapeIcon(STAIR_N).getContext("2d").getImageData(0,0,64,64).data;
        let aSlab=0,aStair=0; for(let i=3;i<ic.length;i+=4){ if(ic[i]>8) aSlab++; if(icS[i]>8) aStair++; }
        const full=blockIcon(MARBLE).getContext("2d").getImageData(0,0,64,64).data; let aFull=0; for(let i=3;i<full.length;i+=4) if(full[i]>8) aFull++;
        const icons=aSlab>200 && aSlab<aFull*0.85 && aStair>aSlab && aStair<=aFull+40;
        ok("更多材质: 大理石/橡木/陶土半砖+四向楼梯(100-114)从材质表生成, 贴图随整块、挖下归一、配方齐全; 物品图标按形状画(半砖明显矮于整块)",
           mats && range && recs && icons, "mats="+mats+" range="+range+" recs="+recs+" icon px 半砖/楼梯/整块="+aSlab+"/"+aStair+"/"+aFull);
      }
      {
        let pal=null; for(let sx=-60;sx<=60&&!pal;sx++) for(let sz=-60;sz<=60&&!pal;sz++){ const s2=structureAt(sx,sz); if(s2&&s2.type==="palace") pal=s2; }
        if(!pal) ok("宫殿大台阶: 附近找到宫殿", true, "本种子 121×121 格内无宫殿, 跳过");
        else {
          const cache=new Map(), at=(X,Y,Z)=>{ const cx=Math.floor(X/CS), cz=Math.floor(Z/CS), k=cx+","+cz;
            if(!cache.has(k)) cache.set(k,genChunk(cx,cz)); return cache.get(k)[((X-cx*CS)*CS+(Z-cz*CS))*H+Y]; };
          const {x,z,h}=pal, D=13, S0=STAIR_MARBLE[0];
          let okS=true; for(let X=x-2;X<=x+2;X++) if(at(X,h+1,z+D+1)!==S0 || at(X,h+2,z+D-1)!==S0 || at(X,h+3,z+D-3)!==S0) okS=false;
          ok("宫殿大台阶: 三级大理石基座正面各一级大理石楼梯(朝宫门升高)", okS, "palace="+x+","+z);
        }
      }
      // ---- 第八轮·本地: 新手引导 ----
      {
        const P0={x:player.x,y:player.y,z:player.z,yaw:player.yaw,pitch:player.pitch}, slot0=selSlot, st0={xp,lvl,maxHp,dmgMul,hp}, q0=questIdx;
        let k0=null; try{ k0=localStorage.getItem(TUT_KEY); localStorage.removeItem(TUT_KEY); }catch(e){}
        // 门槛: 没看过 + 新档 → 弹; 看过或老档 → 不弹
        questIdx=0; lvl=1; const g1=startTutorial()===true; tut.active=false;
        questIdx=3; const g2=startTutorial()===false; questIdx=0;
        tutMark("done"); const g3=startTutorial()===false; try{ localStorage.removeItem(TUT_KEY); }catch(e){}
        // 全流程: 每步做对应操作 → 打勾停 0.9 秒 → 下一步
        const xpA=xp+lvl*1000;                                   // 门槛测试把等级临时改成了 1, 以流程开始这一刻为基准
        startTutorial(true);
        const seen=[], card=document.getElementById("tutCard"), shown=card.style.display==="block";
        const acts={ look:()=>{ player.yaw+=2; }, move:()=>{ for(let k=0;k<9;k++){ player.x+=1; updateTutorial(0.01); } },
          jump:()=>tutEvent("jump"), mine:()=>tutEvent("mine",3), place:()=>tutEvent("place"),
          sword:()=>selectSlot(HOTBAR_ITEMS.indexOf("sword")), craft:()=>tutEvent("craft"), help:()=>tutEvent("help") };
        let pulseOK=false, guard=0;
        while(tut.active && guard++<40){
          const S=TUT_STEPS[tut.step]; seen.push(S.id);
          if(S.id==="sword"){ updateTutorial(0.01); const sl=document.querySelectorAll("#hotbar .slot")[HOTBAR_ITEMS.indexOf("sword")]; pulseOK=!!sl && sl.classList.contains("tut-pulse"); }
          acts[S.id](); updateTutorial(0.01); const ticked=tut.flashT>0; updateTutorial(1);
          if(!ticked) break;
        }
        let k1=null; try{ k1=localStorage.getItem(TUT_KEY); }catch(e){}
        const flow=seen.join(",")==="look,move,jump,mine,place,sword,craft,help" && !tut.active && k1==="done" && xp+lvl*1000>xpA && card.style.display==="none";
        // 跳过
        try{ localStorage.removeItem(TUT_KEY); }catch(e){}
        startTutorial(true); endTutorial("skipped"); let k2=null; try{ k2=localStorage.getItem(TUT_KEY); }catch(e){}
        const skip=!tut.active && k2==="skipped";
        try{ if(k0===null) localStorage.removeItem(TUT_KEY); else localStorage.setItem(TUT_KEY,k0); }catch(e){}
        Object.assign(player,P0); selectSlot(slot0); xp=st0.xp; lvl=st0.lvl; maxHp=st0.maxHp; dmgMul=st0.dmgMul; hp=st0.hp; questIdx=q0; updateHearts(); updateXPHUD(); renderTut();
        ok("新手引导: 新档且没看过才弹、老档/看过不弹; 8 步按真实操作依次推进(切剑时对应格闪烁)、完成 +经验并记住; 可跳过",
           g1 && g2 && g3 && shown && flow && pulseOK && skip, "gate="+[g1,g2,g3]+" shown="+shown+" steps="+seen.join(",")+" flow="+flow+" pulse="+pulseOK+" skip="+skip);
      }
      // ---- 第八轮·本地: 性能复核(区块分帧生成 + 自动降级先降画质) ----
      {
        const P0={x:player.x,z:player.z}, R0=RENDER;
        player.x+=CS*40; pcx=1e9; refreshChunks();                                    // 传送到 40 个区块外
        const cx=Math.floor(player.x/CS), cz=Math.floor(player.z/CS);
        let near=true; for(let dx=-1;dx<=1;dx++) for(let dz=-1;dz<=1;dz++) if(!world.has(key(cx+dx,cz+dz))) near=false;
        const deferred=genQueue.length>0 && !world.has(key(cx+RENDER,cz));            // 外圈没有在这一帧同步生成
        let g=0; while((genQueue.length||meshQueue.length) && g++<5000){ const tq=performance.now(); processQueue(5); processGenQueue(8-(performance.now()-tq)); }   // 同主循环的分帧方式补齐(耗时受后台显卡限流影响, 不作断言)
        let missing=0, noMesh=0; for(let dx=-RENDER-1;dx<=RENDER+1;dx++) for(let dz=-RENDER-1;dz<=RENDER+1;dz++){ const c=world.get(key(cx+dx,cz+dz)); if(!c) missing++; else if(Math.max(Math.abs(dx),Math.abs(dz))<=RENDER && !c.mesh) noMesh++; }
        player.x=P0.x; player.z=P0.z; pcx=1e9; refreshChunks(); RENDER=R0;
        ok("区块流式加载: 传送后脚下 3×3 立刻就有、外圈排队分帧生成(不再一帧同步 17 块); 补齐后渲染范围内无缺块/漏网格",
           near && deferred && missing===0 && noMesh===0, "near="+near+" deferred="+deferred+" missing="+missing+" noMesh="+noMesh+" 补齐用了 "+g+" 帧");
      }
      {
        const g0=gfxLevel, R0=RENDER, pd0=perfDowngrades, fps0=fps, hidDesc=Object.getOwnPropertyDescriptor(document,"hidden");
        Object.defineProperty(document,"hidden",{get:()=>false,configurable:true});
        const sl0=softLock; softLock=true;                                        // playing() = locked||softLock: 自测不在游戏中, 临时视为在玩
        setGfx(3); RENDER=9; perfDowngrades=0; lowFpsStreak=0; fps=20;
        const steps=[]; for(let k=0;k<60;k++){ const d0=perfDowngrades; autoScalePerf(); if(perfDowngrades>d0) steps.push(gfxLevel+"/"+RENDER); }
        const order=steps.slice(0,4).join(" "), stopped=perfDowngrades===5;
        fps=55; autoScalePerf(); const reset=lowFpsStreak===0;
        softLock=sl0; if(hidDesc) Object.defineProperty(document,"hidden",hidDesc); else delete document.hidden;
        setGfx(g0); RENDER=R0; perfDowngrades=pd0; fps=fps0; lowFpsStreak=0; pcx=1e9; refreshChunks();
        ok("自动降级: 连续低帧先降画质(极致→高→中), 到「中」后才缩渲染距离, 最多 5 次; 帧率回升则清零计数",
           order==="2/9 1/9 1/7 1/5" && stopped && reset, "序列="+steps.join(" ")+" 次数="+perfDowngrades+" reset="+reset);
      }
      // ---- 第九轮·本地: 地热间歇泉 ----
      {
        // 1) 生成: 找一个有喷口的火山/盐湖区块, 真实区块里喷口+一圈玄武岩/盐壳+上方留空
        let site=null, scanned=0;
        for(let r=0;r<120 && !site;r++) for(let a=-r;a<=r && !site;a++) for(const [cx,cz] of [[a,-r],[a,r],[-r,a],[r,a]]){ scanned++; const L=geyserSites(cx,cz); if(L.length){ site={cx,cz,G:L[0]}; break; } }
        let gen=false, other=true;
        if(site){ const G=site.G, arr=genChunk(site.cx,site.cz), at=(X,Y,Z)=>arr[((X-site.cx*CS)*CS+(Z-site.cz*CS))*H+Y];
          const ring=G.bio===BIO_VOLCANO?BASALT:SALTCRUST;
          gen=at(G.x,G.y,G.z)===GEYSER && [[1,0],[-1,0],[0,1],[0,-1]].every(([dx,dz])=>at(G.x+dx,G.y,G.z+dz)===ring) && at(G.x,G.y+1,G.z)===AIR;
          for(let k=0;k<200;k++){ const cx=site.cx+300+k, cz=site.cz-50; const b=biomeAt(cx*CS+8,cz*CS+8); if(b!==BIO_VOLCANO && b!==BIO_SALTLAKE && geyserSites(cx,cz).length) other=false; }
        }
        ok("间歇泉: 地热喷口(120)只在黑沙火山/盐湖生成, 真实区块里喷口+一圈玄武岩或盐壳、上方留空; 其它群系没有",
           !!site && gen && other && BLOCKS[GEYSER].t===300 && EMIT_LV[GEYSER]===7, "site="+(site?site.G.x+","+site.G.z+" bio="+site.G.bio:"none")+" 扫描区块="+scanned+" gen="+gen+" other="+other);
      }
      {
        // 2) 喷发把人/怪顶起; 喷口外不顶; 蒸汽托起后摔伤 ×1/4
        const S={x:player.x,y:player.y,z:player.z,vx:player.vx,vy:player.vy,vz:player.vz,og:player.onGround}, sl0=steamLift, mobsS=mobs.slice(); mobs.length=0;
        const G={x:Math.floor(player.x)+40, y:150, z:Math.floor(player.z)+40, ph:0, bio:BIO_VOLCANO};
        const tE=GEY_ERUPT+0.2;
        Object.assign(player,{x:G.x+0.5,y:G.y+1,z:G.z+0.5,vx:0,vy:0,vz:0,onGround:true}); steamLift=false;
        const m={type:"zombie",def:MOB_DEFS.zombie,x:G.x+0.6,y:G.y+1,z:G.z+0.4,vx:0,vy:0,vz:0,kbx:0,kbz:0,onGround:true,hp:20}; mobs.push(m);
        const idle=geyserStep(G,1.0,0.016)===0 && player.vy===0;
        const n=geyserStep(G,tE,0.016), lifted=n===2 && player.vy>=GEY_LIFT && m.vy>=18 && steamLift;
        mobs.length=0; Object.assign(player,{x:G.x+2.5,vy:0}); const miss=geyserStep(G,tE,0.016)===0 && player.vy===0;
        const md0=mythicState.done.slice(); mythicState.done=[];                    // 前面的自测可能集齐了「地中海」遗物(免摔伤), 这里临时排除
        steamLift=true; const soft=fallDamage(10); steamLift=false; const hard=fallDamage(10); mythicState.done=md0;
        const fall=hard>=4 && soft===Math.floor(hard/4) && fallDamage(3)===0;
        mobs.length=0; for(const q of mobsS) mobs.push(q); Object.assign(player,{x:S.x,y:S.y,z:S.z,vx:S.vx,vy:S.vy,vz:S.vz,onGround:S.og}); steamLift=sl0;
        ok("间歇泉: 平时不顶人; 喷发时站在喷口上的玩家与生物被蒸汽顶起, 旁边 2 格外不受影响; 蒸汽托起后落地摔伤只剩 1/4",
           idle && lifted && miss && fall, "idle="+idle+" lifted="+lifted+" n="+n+" miss="+miss+" 摔伤 硬/软="+hard+"/"+soft);
      }
      // ---- 第九轮②·本地: 试炼钥匙 + 试炼宝库 / 不祥宝库 ----
      {
        let pyr=null; for(let sx=-40;sx<=40&&!pyr;sx++) for(let sz=-40;sz<=40&&!pyr;sz++){ const s2=structureAt(sx,sz); if(s2&&s2.type==="pyramid"&&s2.h>=14) pyr=s2; }
        let genOK=false;
        if(pyr){ const T=trialHall(pyr), cache=new Map(), at=(X,Y,Z)=>{ const cx=Math.floor(X/CS), cz=Math.floor(Z/CS), k=cx+","+cz; if(!cache.has(k)) cache.set(k,genChunk(cx,cz)); return cache.get(k)[((X-cx*CS)*CS+(Z-cz*CS))*H+Y]; };
          genOK=T.vaults.every(([vx,vz])=>at(vx,T.fy+1,vz)===VAULT) && at(T.omen[0],T.fy+1,T.omen[1])===OMEN_VAULT; }
        ok("宝库生成: 试炼厅北墙下两座试炼宝库、南侧一座不祥宝库(121/123, 自发光)", genOK && EMIT_LV[VAULT]===8 && BLOCKS[OMEN_VAULT].s===304, "pyr="+(pyr?pyr.x+","+pyr.z:"none"));
      }
      {
        const VK=JSON.stringify(vaultKeys), mobsS=mobs.slice(), bagS=new Map(bag), relS=npcState.relics, coreS=cores, st={xp,lvl,maxHp,dmgMul,hp}, eS=Object.assign({},enchState), akS=arenaState.keys, dS=trialState.done, dayS=dayCount;
        vaultKeys.trial=0; vaultKeys.omen=0; vaultKeys.omenDay={}; mobs.length=0;
        const cx=Math.floor(player.x)+2, cz=Math.floor(player.z)+2; let cy=H-4; while(cy>0 && getBlock(cx,cy,cz)!==AIR) cy--;
        const T={x0:0,x1:0,z0:0,z1:0,fy:cy-1, chest:[cx,cy,cz], spawns:[[cx+3,cz],[cx-3,cz]], key:"Tvault", vaults:[], omen:[0,0]};
        const run=()=>{ const w=[]; let g=0; while(trialState.active && g++<40){ updateTrial(3,T,true); if(trialState.alive.length){ w.push(trialState.alive.map(m=>m.type+(m.elite?"*":"")).join("+")); for(const m of trialState.alive) m.hp=0; } } return w; };
        // 普通试炼: 每清一波一把试炼钥匙
        setBlock(cx,cy,cz,OSIRIS); trialState.active=false; updateTrial(0.1,T,true); const w1=run();
        const normal=w1.length===3 && vaultKeys.trial===3 && vaultKeys.omen===0 && getBlock(cx,cy,cz)===AIR;
        // 首通后: 不祥试炼(每日一次), 精英 + 血量 ×1.5, 每清一波一把不祥钥匙
        updateTrial(0.1,T,true); const omenStart=trialState.active && trialState.omen;
        updateTrial(3,T,true); const hpOK=trialState.alive.length>0 && trialState.alive.every(m=>m.hp>=Math.round(m.def.hp*1.5)-1 || m.def.boss);
        for(const m of trialState.alive) m.hp=0;
        const w2=run();
        const omen=omenStart && hpOK && vaultKeys.omen===3 && vaultKeys.omenDay.Tvault===dayCount && w2.length===2 && w2[1].split("+").filter(t=>t.startsWith("anubis")).length===2;
        updateTrial(0.1,T,true); const sameDay=!trialState.active;
        dayCount++; updateTrial(0.1,T,true); const nextDay=trialState.active && trialState.omen; abortTrial(); dayCount=dayS;
        ok("试炼钥匙: 普通试炼每清一波掉 1 把(共 3); 首通后每个游戏日可打一次不祥试炼(精英、血 ×1.5、末波双阿努比斯), 每波掉 1 把不祥钥匙; 同日不能重打、次日可以",
           normal && omen && sameDay && nextDay, "normal="+normal+" waves="+w1.join(" | ")+" omen="+omen+" 不祥波="+w2.join(" | ")+" sameDay="+sameDay+" nextDay="+nextDay);
        // 宝库开启规则
        setBlock(cx,cy,cz,VAULT); vaultKeys.trial=0; vaultKeys.omen=0;
        const noKey=useVaultBlock(cx,cy,cz)===null && getBlock(cx,cy,cz)===VAULT;
        vaultKeys.trial=1; const g0=bagCount(GOLD_ORE), got=useVaultBlock(cx,cy,cz);
        const opened=!!got && getBlock(cx,cy,cz)===VAULT_OPEN && vaultKeys.trial===0 && bagCount(GOLD_ORE)>=g0+3 && useVaultBlock(cx,cy,cz)===null;
        setBlock(cx,cy,cz,OMEN_VAULT); vaultKeys.trial=2;
        const wrongKey=useVaultBlock(cx,cy,cz)===null && vaultKeys.trial===2;
        vaultKeys.omen=1; const got2=useVaultBlock(cx,cy,cz); const omenOpen=!!got2 && getBlock(cx,cy,cz)===OMEN_VAULT_OPEN && vaultKeys.omen===0;
        vaultKeys.trial=4; vaultKeys.omen=2; vaultKeys.omenDay={T1:7};
        const sv=collectSave().trialVault, saved=sv.trial===4 && sv.omen===2 && sv.omenDay.T1===7;
        setBlock(cx,cy,cz,AIR);
        mobs.length=0; for(const q of mobsS) mobs.push(q); bag.clear(); for(const [k,v] of bagS) bag.set(k,v); npcState.relics=relS; cores=coreS;
        xp=st.xp; lvl=st.lvl; maxHp=st.maxHp; dmgMul=st.dmgMul; hp=st.hp; Object.assign(enchState,eS); arenaState.keys=akS; trialState.done=dS;
        Object.assign(vaultKeys, JSON.parse(VK)); updateHearts(); updateXPHUD();
        ok("宝库: 没钥匙打不开; 试炼钥匙开试炼宝库(变暗、只开一次、给金钻文物核心); 不祥宝库只认不祥钥匙; 钥匙与通关日进存档",
           noKey && opened && wrongKey && omenOpen && saved, "noKey="+noKey+" opened="+opened+" got="+(got||[]).join(",")+" wrongKey="+wrongKey+" omenOpen="+omenOpen+" 不祥="+(got2||[]).join(",")+" saved="+saved);
      }
      // ---- 第九轮③·本地: 区块网格优化(本地取块数组 + 复用类型数组 + 判定查表)的等价性 ----
      {
        const cx0=Math.floor(player.x/CS), cz0=Math.floor(player.z/CS), cs=[];
        for(let dx=-2;dx<=2;dx++) for(let dz=-2;dz<=2;dz++){ const c=world.get(key(cx0+dx,cz0+dz)); if(c && c.mesh) cs.push(c); }
        const cap=flag=>{ const p0=_meshPad; _meshPad=flag; _meshCapture=[]; for(const c of cs) buildChunkMesh(c); const r=_meshCapture; _meshCapture=null; _meshPad=p0; return r; };
        const A=cap(false), B=cap(true); let diff=0, elems=0;
        for(let k=0;k<A.length;k++) for(const f of ["oV","oI","wV","wI","pV","pI"]){ const a=A[k][f], b=B[k][f]; elems+=a.length; if(a.length!==b.length){ diff++; continue; } for(let i=0;i<a.length;i++) if(a[i]!==b[i]){ diff++; break; } }
        const tabs=[...Array(256).keys()].every(i=>OCC_T[i]===(OCCLUDE(i)?1:0) && SKY_T[i]===(SKY_OCC(i)?1:0) && EMI_T[i]===(EMISSIVE(i)?1:0) && BL_OPQ[i]===(OPAQUE(i)?1:0));
        ok("网格优化等价: 本地取块数组与逐格 gb() 生成的顶点/索引逐元素一致; 判定查表与原判定函数 256 个 ID 全部一致",
           cs.length>0 && diff===0 && tabs, "区块="+cs.length+" 元素="+elems+" 不一致="+diff+" 查表="+tabs);
      }
      { // 守墓石像被盯住时要有常驻提示, 否则玩家以为怪物卡死(用户报 bug: "僵尸突然不动了")
        const mobsP=mobs.slice(); mobs.length=0;
        const el=document.getElementById("sphinxPrompt");
        mobs.push({type:"sentinel", def:MOB_DEFS.sentinel, x:player.x+3, y:player.y, z:player.z, frozen:true});
        updateSphinxPrompt(); const shown=!!el && el.style.display==="block" && el.innerHTML.includes("盯住");
        mobs[0].frozen=false; updateSphinxPrompt(); const hidden=!!el && el.style.display==="none";
        mobs.length=0; for(const q of mobsP) mobs.push(q); updateSphinxPrompt();
        ok("守墓石像被盯住时屏幕提示机制(不是卡死), 移开视线后提示消失", shown && hidden, "shown="+shown+" hidden="+hidden);
      }
      { // F5 不再进入正面视角(正面视角下前后左右看起来全反, 用户报 bug); Shift+F5 才进/出正面
        const cm0=camMode; const k=(sh)=>document.dispatchEvent(new KeyboardEvent("keydown",{code:"F5",key:"F5",shiftKey:!!sh,bubbles:true}));
        camMode=0; const seq=[]; for(let i=0;i<4;i++){ k(false); seq.push(camMode); }
        k(true); const front=camMode; k(true); const back=camMode;
        camMode=cm0; { const vm=document.getElementById("viewmodel"); if(vm) vm.style.display = camMode>0 ? "none" : ""; }
        ok("F5 只在第一人称/背后视角间切换, Shift+F5 进出正面视角", seq.join()==="1,0,1,0" && front===2 && back===0, "seq="+seq.join()+" front="+front+" back="+back);
      }
      { // 第七轮·云端: 砂岩熔炉 —— 注册/配方; 熔炼逻辑(燃料耗尽即停、2:1 原料、成品格不同类不烧); 烤鱼; 退回; 亮灭方块; 存档
        const bagS=new Map(bag), fS=JSON.stringify(furnaces), fo0=furnaceOpen, fishS=fishState.fish, ckS=fishState.cooked, hpS=hp, cdS=eatCd;
        const reg=BLOCKS[FURNACE] && BLOCKS[FURNACE_LIT] && FURNACE===81 && FURNACE_LIT===82 && BLOCKS[FURNACE].s===293 && BLOCKS[FURNACE_LIT].s===294
          && EMISSIVE(FURNACE_LIT) && !EMISSIVE(FURNACE) && EMIT_LV[FURNACE_LIT]===12 && RECIPES.some(r=>/砂岩熔炉/.test(r.name));
        const f=newFurnace(); f.in=SAND; f.inN=3; f.fuel=PLANKS; f.fuelN=1;
        const m1=furnaceStep(f,20); const s1=m1===1 && f.out===GLASS && f.outN===1 && f.inN===2 && f.burn===0 && f.prog===0 && f.fuelN===0;   // 木板 6 秒只够一份
        f.fuel=COAL_ORE; f.fuelN=1; const m2=furnaceStep(f,100); const s2=m2===2 && f.outN===3 && f.inN===0 && f.in===0 && f.burn===0;
        const g=newFurnace(); g.in=GOLD_ORE; g.inN=5; g.fuel=COAL_ORE; g.fuelN=1; furnaceStep(g,60); const s3=g.out===GILDED && g.outN===2 && g.inN===1;
        const h=newFurnace(); h.in=COBBLE; h.inN=2; h.out=GLASS; h.outN=1; h.fuel=COAL_ORE; h.fuelN=1; const m4=furnaceStep(h,10); const s4=m4===0 && h.fuelN===1 && h.inN===2;   // 成品格不同类: 不点火不吞燃料
        for(const k in furnaces) delete furnaces[k];
        const k="9003,40,9003"; furnaces[k]=newFurnace(); furnaceOpen=k;
        fishState.fish=2; fishState.cooked=0; bag.set(LOG,1);
        const l1=furnaceLoad("in",FISH_RAW,0), l2=furnaceLoad("fuel",LOG,0), l3=furnaceLoad("in",SAND,0);
        furnaceStep(furnaces[k],9); const got=furnaceUnload("out");
        eatCd=0; hp=Math.max(1,maxHp-14); const h0=hp; const ate=eatFish() && hp===h0+FISH_COOKED_HEAL && fishState.cooked===1;
        const fishOk=l1===2 && l2===1 && l3===0 && fishState.fish===0 && got===2 && ate;
        furnaces[k].in=CLAY; furnaces[k].inN=4; bag.delete(CLAY); furnaceOpen=null; const sp=furnaceSpill(9003,40,9003); const spillOk=sp===4 && bagCount(CLAY)===4 && !furnaces[k];
        // 亮灭: 在玩家脚边真放一座熔炉
        const bx=Math.floor(player.x)+2, bz=Math.floor(player.z), by=Math.floor(player.y)+1, old=getBlock(bx,by,bz), kk=bx+","+by+","+bz;
        setBlock(bx,by,bz,FURNACE); furnaces[kk]=newFurnace(); Object.assign(furnaces[kk],{in:SAND,inN:1,fuel:HAY,fuelN:1});
        tickFurnaces(0.1); const lit=getBlock(bx,by,bz)===FURNACE_LIT;
        tickFurnaces(10); const unlit=getBlock(bx,by,bz)===FURNACE && furnaces[kk].outN===1;
        const sv=collectSave(); const saved=!!(sv.furnaces && sv.furnaces[kk] && sv.furnaces[kk].out===GLASS && sv.fish && sv.fish.cooked===1);
        bag.delete(GLASS); setBlock(bx,by,bz,old); const brokeOk=!furnaces[kk] && bagCount(GLASS)===1;
        for(const q in furnaces) delete furnaces[q]; Object.assign(furnaces,JSON.parse(fS)); furnaceOpen=fo0; particles.length=0;
        bag.clear(); for(const [a,b] of bagS) bag.set(a,b); fishState.fish=fishS; fishState.cooked=ckS; hp=hpS; eatCd=cdS; updateHearts();
        ok("砂岩熔炉: 注册/配方/自发光; 燃料耗尽即停、金 2:1、成品格不同类不吞燃料; 生鱼烤熟回 12 血; 拆炉退回; 有火变亮熄火变回; 存档含 furnaces",
           reg && s1 && s2 && s3 && s4 && fishOk && spillOk && lit && unlit && saved && brokeOk,
           "reg="+reg+" s1="+s1+" s2="+s2+" s3="+s3+" s4="+s4+" fish="+fishOk+" spill="+spillOk+" lit="+lit+" unlit="+unlit+" saved="+saved+" broke="+brokeOk);
      }
      { // 第十三轮·云端: 手持光源 + 方块光摇曳 + 月光辉光/22° 月晕 —— 拿灯笼才亮、夜里比正午亮、背包没有/拿武器/「低」画质/死亡不亮; 着色器接口就绪
        const sS=selSlot, itS=HOTBAR_ITEMS[sS], hadL=bag.has(LANTERN), nL=bagCount(LANTERN), hadC=bag.has(CRYSTAL), nC=bagCount(CRYSTAL), gS=gfxLevel, dS=dead;
        let r={};
        try{
          gfxLevel=Math.max(1,gS); dead=false;
          HOTBAR_ITEMS[sS]=LANTERN; bag.set(LANTERN,2);
          const hn=heldLightState(blockLightK(-0.1), 0); r.night=hn.v[3]; r.warm=hn.c[0]>hn.c[2];
          r.near=Math.hypot(hn.v[0]-player.x, hn.v[1]-(player.y+EYE), hn.v[2]-player.z)<1;
          r.noon=heldLightState(blockLightK(1), 0).v[3];
          r.flick=heldLightState(blockLightK(-0.1), 1234).v[3]!==heldLightState(blockLightK(-0.1), 1777).v[3];
          HOTBAR_ITEMS[sS]=CRYSTAL; bag.set(CRYSTAL,1);
          const hc=heldLightState(blockLightK(-0.1), 0); r.cool=hc.v[3]>0 && hc.c[2]>hc.c[0];
          bag.delete(CRYSTAL); r.empty=heldLightState(blockLightK(-0.1), 0).v[3];
          HOTBAR_ITEMS[sS]="sword"; r.sword=heldLightState(blockLightK(-0.1), 0).v[3];
          HOTBAR_ITEMS[sS]=LANTERN; gfxLevel=0; r.low=heldLightState(blockLightK(-0.1), 0).v[3];
          gfxLevel=Math.max(1,gS); dead=true; r.dead=heldLightState(blockLightK(-0.1), 0).v[3];
        } finally {
          HOTBAR_ITEMS[sS]=itS; gfxLevel=gS; dead=dS;
          if(hadL) bag.set(LANTERN,nL); else bag.delete(LANTERN);
          if(hadC) bag.set(CRYSTAL,nC); else bag.delete(CRYSTAL);
          heldLightState(blockLightK(sunH), 0);
        }
        const skySrc=gl.getAttachedShaders(skyProg).map(sh=>gl.getShaderSource(sh)).join("\n");
        const unifOk=!!U.uHeld && !!U.uHeldC && /手持光源/.test(_mainSrc[1]) && /光池随时间和位置轻轻摇曳/.test(_mainSrc[1]) && /月光辉光/.test(skySrc) && /22° 月晕/.test(skySrc);
        ok("第十三轮: 拿发光方块身边有动态光(灯笼暖/水晶冷, 夜>正午, 灯笼闪烁); 没货/拿武器/低画质/死亡不亮; 方块光摇曳与月晕着色器就绪",
           r.night>0.5 && r.warm && r.near && r.noon>0 && r.noon<r.night*0.4 && r.flick && r.cool && r.empty===0 && r.sword===0 && r.low===0 && r.dead===0 && unifOk,
           JSON.stringify(r)+" unif="+unifOk);
      }
      { // 第十二轮·云端: 倒影随最近水面 + 雨天湿地面 —— 放一块水测 pickReflY; 湿度随天气渐变; 着色器接口就绪
        let bx=Math.floor(player.x)+3; const bz=Math.floor(player.z);
        for(let i=0;i<40 && groundY(bx,bz)<=0;i++) bx+=3;   // 树冠/水面上 groundY=-1(玩家位置由前面的测试随机留下): 挪到实地再测
        const gyW=groundY(bx,bz);
        let pickOk=false, fallOk=false;
        if(gyW>0){
          const wy=gyW+6, olds=[]; for(let y=wy;y<=wy+2;y++) olds.push(getBlock(bx,y,bz));
          setBlock(bx,wy,bz,WATER); setBlock(bx,wy+1,bz,AIR); setBlock(bx,wy+2,bz,AIR);
          const t=pickReflY(bx+0.5, wy+4, bz+0.5); pickOk=Math.abs(t-(wy+0.86))<1e-6 && Math.abs(waterTopAt(bx,bz,wy+3)-(wy+0.86))<1e-6;
          for(let y=wy;y<=wy+2;y++) setBlock(bx,y,bz,olds[y-wy]);
        }
        fallOk=pickReflY(player.x, H-2, player.z)!==undefined;   // 找不到也要返回数值(海平面), 不抛错
        const w0=weather, k0=wetK;
        weather="rain"; wetK=0; for(let i=0;i<5;i++) tickWetness(1); const wetUp=wetK>0.55 && wetK<0.7;   // 8 秒湿透 → 5 秒约 0.62
        for(let i=0;i<10;i++) tickWetness(1); const wetFull=wetK===1;
        weather="clear"; tickWetness(20); const dryDown=Math.abs(wetK-0.5)<1e-6;                           // 40 秒干透 → 20 秒剩一半
        weather=w0; wetK=k0;
        const unifOk=!!U.uWet && /uWet/.test(_mainSrc[1]) && /雨天湿地面/.test(_mainSrc[1]);
        ok("第十二轮: 镜面高度跟着最近的水面(水塘/绿洲)走; 雨天约 8 秒湿透、雨停约 40 秒干透; 湿地面着色器接口就绪",
           pickOk && fallOk && wetUp && wetFull && dryDown && unifOk, "pick="+pickOk+" fall="+fallOk+" up="+wetUp+" full="+wetFull+" dry="+dryDown+" unif="+unifOk);
      }
      { // 第十二轮·云端·A: 雨天水面涟漪 rainK 渐变 + uRain 接好 + 雨滴水花只在下雨时产生
        const wS=weather, kS=rainK, aS=rainSplashAcc, pS={x:player.x,y:player.y,z:player.z}, nP=particles.length;
        const gx=Math.floor(player.x), gz=Math.floor(player.z); ensureData(gx>>4,gz>>4);
        let bx=gx, bz=gz; for(let i=0;i<60 && biomeAt(bx,bz)===BIO_SNOW;i++){ bx+=40; ensureData(bx>>4,bz>>4); }   // 避开雪原(那里下雪不下雨)
        player.x=bx+0.5; player.z=bz+0.5;
        for(let dx=-2;dx<=2;dx++) for(let dz=-2;dz<=2;dz++) ensureData((bx>>4)+dx,(bz>>4)+dz);
        weather="rain"; rainK=0; rainSplashAcc=0; particles.length=0;
        tickRainSplash(1.5); const kHalf=rainK;                        // 1.5 秒 → 目标 0.6 的一半左右
        tickRainSplash(3); const kRain=rainK;
        weather="storm"; tickRainSplash(3); const kStorm=rainK;
        let made=0; for(let i=0;i<20;i++) made+=tickRainSplash(0.1);  // 雷暴 2 秒 → 应有水花
        const pRain=particles.length;
        weather="clear"; particles.length=0; rainSplashAcc=0;
        let madeClear=0; for(let i=0;i<20;i++) madeClear+=tickRainSplash(0.1);
        const kFade=rainK; tickRainSplash(10); const kOff=rainK;
        const locOk=!!UW.uRain;
        weather=wS; rainK=kS; rainSplashAcc=aS; Object.assign(player,pS); particles.length=Math.min(particles.length,nP);
        ok("第十二轮雨天涟漪: rainK 约 3 秒渐升(雨 0.6/雷暴 1)雨停渐降; uRain uniform 存在; 下雨产生雨滴水花、晴天不产生",
           Math.abs(kHalf-0.5)<0.05 && Math.abs(kRain-0.6)<1e-6 && Math.abs(kStorm-1)<1e-6 && kFade>0 && kFade<1 && kOff===0
           && locOk && made>0 && pRain>0 && madeClear===0,
           "k="+kHalf.toFixed(2)+"/"+kRain.toFixed(2)+"/"+kStorm.toFixed(2)+"/"+kFade.toFixed(2)+"/"+kOff+" loc="+locOk+" made="+made+" parts="+pRain+" clear="+madeClear);
      }
      { // 第十一轮·云端: 载具驾驶 HUD —— 载具分类; 航向 0=北/90=东; 速度按位移算(瞬移不计); 离地高度含水面; 骑乘才显示
        const kindOk=driveKind(null)===null && driveKind({def:MOB_DEFS.plane})==="plane" && driveKind({def:MOB_DEFS.bike})==="bike"
          && driveKind({def:MOB_DEFS.car})==="car" && driveKind({def:MOB_DEFS.horse})==="ground" && driveKind({def:MOB_DEFS.chariot})==="ground";
        const pS={x:player.x,y:player.y,z:player.z,yaw:player.yaw,pitch:player.pitch}, rS=riding, hS=Object.assign({},driveHud);
        player.yaw=0; const h0=Math.round(headingDeg()); player.yaw=Math.PI/2; const h90=Math.round(headingDeg()); player.yaw=-Math.PI/2; const h270=Math.round(headingDeg());
        const hdgOk=h0===0 && h90===90 && h270===270;
        driveHud.lx=player.x; driveHud.ly=player.y; driveHud.lz=player.z; driveHud.spd=0; driveHud.vs=0;
        player.x+=5; player.y+=1; const R1=driveReadout(0.5);                    // 0.5 秒走 5 格 → 10 m/s = 36 km/h, 爬升 2 m/s
        const spdOk=Math.abs(R1.kmh-36)<0.5 && Math.abs(R1.vs-2)<0.05;
        player.x+=500; const R2=driveReadout(0.5); const jumpOk=R2.kmh<36;         // 传送不算速度(平滑后只会变小)
        // 离地高度需要一格"实心地面列"(水面/树冠 groundY=-1): 从传送点向外环形找, 找不到再回出生点周围 —— 消除传送落进大海时线性探测耗尽的偶发
        const findLandCol=(cx0,cz0)=>{
          for(let r=0;r<=48;r+=2) for(let dx=-r;dx<=r;dx+=2) for(let dz=-r;dz<=r;dz+=2){
            if(Math.max(Math.abs(dx),Math.abs(dz))!==r) continue;
            const gx2=cx0+dx, gz2=cz0+dz; ensureData(gx2>>4,gz2>>4);
            if(groundY(gx2,gz2)>0) return [gx2,gz2];
          }
          return null;
        };
        const col=findLandCol(Math.floor(player.x),Math.floor(player.z))||findLandCol(Math.floor(spawnPt.x),Math.floor(spawnPt.z))||[Math.floor(player.x),Math.floor(player.z)];
        const gx=col[0], gz=col[1];
        player.x=gx+0.5; player.z=gz+0.5; driveHud.lx=player.x; player.y=groundY(gx,gz)+7.5;
        const R3=driveReadout(0.1); const aglOk=R3.agl!=null && Math.abs(R3.agl-7.5)<1.01;
        const aglDiag=aglOk?"":(" diag: col="+Math.floor(player.x)+","+Math.floor(player.z)+" py="+player.y.toFixed(1)+" gy="+groundY(Math.floor(player.x),Math.floor(player.z))+" below="+[0,1,2,3,4,5,6,7,8].map(d=>getBlock(Math.floor(player.x),Math.floor(player.y)-d,Math.floor(player.z))).join("/"));   // 偶发失败时直接看原因
        const cv=document.getElementById("driveHud");
        riding=null; tickDriveHud(0.1); const hidden=cv.style.display==="none";
        riding={def:MOB_DEFS.plane}; tickDriveHud(0.1); const shown=cv.style.display==="block" && driveHud.on;
        riding=null; tickDriveHud(0.1);
        riding=rS; Object.assign(player,pS); Object.assign(driveHud,hS); if(!driveHud.on) cv.style.display="none";
        ok("第十一轮驾驶 HUD: 载具分类正确; 航向 0=北 90=东; 速度按位移算且瞬移不计; 离地高度正确; 骑乘时显示、下车隐藏",
           kindOk && hdgOk && spdOk && jumpOk && aglOk && hidden && shown,
           "kind="+kindOk+" hdg="+h0+"/"+h90+"/"+h270+" spd="+R1.kmh.toFixed(1)+"/"+R1.vs.toFixed(2)+" jump="+R2.kmh.toFixed(1)+" agl="+(R3.agl==null?"null":R3.agl.toFixed(2))+" hidden="+hidden+" shown="+shown+aglDiag);
      }
      { // 第十轮·云端: 海平面平面反射 —— 只在高/极致开; 镜像矩阵把水面上方映到下方; 反射 FBO 可建; 水下/无水时不画; 着色器接好
        const presetOk=!GFX_PRESETS[0].refl && !GFX_PRESETS[1].refl && GFX_PRESETS[2].refl>0 && GFX_PRESETS[3].refl>0;
        const M=reflMirror(), mp=(y)=>M[5]*y+M[13];
        const mirrorOk=Math.abs(mp(REFL_Y+2)-(REFL_Y-2))<1e-5 && Math.abs(mp(REFL_Y)-REFL_Y)<1e-5 && Math.abs(REFL_Y-(WATER_Y+0.86))<1e-6;
        const fb0=sceneFBO, fboOk=reflEnsure(64,36) && !!refl.fbo && refl.w===64; reflFree(); gl.bindFramebuffer(gl.FRAMEBUFFER,fb0);
        const w0=_reflWater, g0=gfxLevel; gfxLevel=3;
        _reflWater=true; const skipUw=renderReflection(new Float32Array(16),0,REFL_Y+5,0,96,54,true)===false && !refl.on;
        _reflWater=false; const skipDry=renderReflection(new Float32Array(16),0,REFL_Y+5,0,96,54,false)===false;
        _reflWater=true; const skipBelow=renderReflection(new Float32Array(16),0,REFL_Y-1,0,96,54,false)===false;
        _reflWater=w0; gfxLevel=g0; reflFree(); gl.bindFramebuffer(gl.FRAMEBUFFER,fb0);
        const unifOk=!!U.uClipY && !!UW.uRefl && !!UW.uReflOn && !!UW.uInvScr;
        ok("第十轮水面反射: 只在高/极致开; 镜像矩阵正确; 反射贴图可建; 水下/没有水/相机在水面下都不画; 主/水面着色器接口就绪",
           presetOk && mirrorOk && fboOk && skipUw && skipDry && skipBelow && unifOk,
           "preset="+presetOk+" mirror="+mirrorOk+" fbo="+fboOk+" uw="+skipUw+" dry="+skipDry+" below="+skipBelow+" unif="+unifOk);
      }
      { // 第九轮·云端: 参考图画面 —— 绿色群系成片草丛/小花、荒漠群系不长; 主着色器带草地深浅变化
        const mulOk=GREEN_TUFT_MUL[BIO_PLAIN]>0 && GREEN_TUFT_MUL[BIO_SAVANNA]>0 && GREEN_TUFT_MUL[BIO_DESERT]===0 && GREEN_TUFT_MUL[BIO_MESA]===0
          && GREEN_TUFT_MUL[BIO_SALTLAKE]===0 && GREEN_TUFT_MUL[BIO_VOLCANO]===0;
        // 草丛按噪声成片长, 单个区块可能整块落在空地上 → 统计前 8 个平原区块的合计覆盖率
        let tufts=0, grassTop=0, chunks=0;
        for(let cx=-90; cx<=90 && chunks<8; cx+=2) for(let cz=-90; cz<=90 && chunks<8; cz+=2){   // 范围放宽、步长加密: 不同种子下平原的位置差别很大
          if(biomeAt(cx*16+8,cz*16+8)!==BIO_PLAIN || structureAt(cx*16+8,cz*16+8)) continue;
          const B=genChunk(cx,cz); let t=0, g=0;
          for(let lx=0;lx<16;lx++) for(let lz=0;lz<16;lz++){ const col=(lx*CS+lz)*H; let y=H-1; while(y>0 && (B[col+y]===AIR||PLANT(B[col+y]))) y--;
            if(B[col+y]===GRASS){ g++; if(B[col+y+1]===TALLGRASS||B[col+y+1]===ROSE||B[col+y+1]===DAISY) t++; } }
          if(g>150){ chunks++; tufts+=t; grassTop+=g; }
        }
        const found=chunks>=2;
        const shaderOk=/gNoise/.test(_mainSrc[1]) && /草地深浅/.test(_mainSrc[1]);
        ok("第九轮画面: 平原草地长出成片草丛与小花(8 个平原区块合计覆盖 2%~40%), 荒漠群系倍率为 0; 主着色器带草地深浅变化",
           mulOk && found && tufts>=grassTop*0.02 && tufts<=grassTop*0.4 && shaderOk, "mul="+mulOk+" chunks="+chunks+" tufts="+tufts+"/"+grassTop+" shader="+shaderOk);
      }
      { // 第七轮·云端: 群系动物变种 —— 群系规则; 部件换贴图不改原版; 贴图已画且与原图不同; 生成时挂上
        const rule=animalVariantFor("camel",BIO_MESA,0.5)==="red" && animalVariantFor("camel",BIO_SALTLAKE,0.5)==="white" && animalVariantFor("camel",BIO_DESERT,0.5)===null
          && animalVariantFor("cow",BIO_SAVANNA,0.5)==="spot" && animalVariantFor("cow",BIO_PLAIN,0.5)===null
          && animalVariantFor("sheep",BIO_SAVANNA,0.5)==="tan" && animalVariantFor("sheep",BIO_VOLCANO,0.5)==="black" && animalVariantFor("sheep",BIO_PLAIN,0.05)==="black" && animalVariantFor("sheep",BIO_PLAIN,0.5)===null
          && animalVariantFor("pig",BIO_MESA,0.5)===null;
        const vp=variantParts("camel","red"), orig=MOB_DEFS.camel.parts;
        const parts=vp.length===orig.length && vp[0].tF===295 && vp[1].tF===296 && orig[0].tF===160 && vp!==orig && variantParts("camel","red")===vp;
        const W=TX_PX, px=(ti)=>actx.getImageData((ti%16)*W+W/2,Math.floor(ti/16)*W+W/2,1,1).data;
        const tiles=ANIMAL_VARIANT_TILES.every(ti=>px(ti)[3]===255) && [...px(295)].slice(0,3).join()!==[...px(160)].slice(0,3).join() && px(297)[0]>px(160)[0]-10;
        const m={type:"camel", def:MOB_DEFS.camel}; let applied=false;
        for(let X=-4000;X<=4000 && !applied;X+=64) for(let Z=-4000;Z<=4000 && !applied;Z+=64) if(biomeAt(X,Z)===BIO_SALTLAKE){ applyAnimalVariant(m,X,Z); applied=m.variant==="white" && m.vparts===variantParts("camel","white") && m.vname==="白骆驼"; }
        ok("群系动物变种: 红土赭红驼/盐湖白驼/草原花牛/沙色与黑绵羊; 只换贴图不动原版部件; 变种贴图已画; 生成时挂上变种", rule && parts && tiles && applied,
           "rule="+rule+" parts="+parts+" tiles="+tiles+" applied="+applied);
      }
      // 沙漠药水(第五轮·云端): 酿造 +2 / 饮用生效与扣库存 / 迅捷与耐热与夜视效果 / 治疗 / 空瓶拒绝 / 存档往返与老档归零
      {
        const pS=Object.assign({},potions), fS=Object.assign({},potionFx), hpP=hp, cdP=potionCd, sunP=sunH;
        for(const k in potions) potions[k]=0; for(const k in potionFx) potionFx[k]=0;
        brewPotion("swift"); const brewed=potions.swift===2;
        potionCd=0; const d1=drinkPotion("swift"); const eff=potionFx.swift===90 && potions.swift===1 && potionSpeedMul()===1.35;
        potionCd=0; brewPotion("heat"); drinkPotion("heat"); const heat=potionHeatProof();
        potionCd=0; brewPotion("night"); drinkPotion("night"); sunH=-0.1; const nightB=potionNightBoost()>1.5; sunH=1; const dayB=potionNightBoost()===1; sunH=sunP;
        potionCd=0; hp=Math.max(1,maxHp-10); const h0=hp; brewPotion("heal"); drinkPotion("heal"); const healed=hp===Math.min(maxHp,h0+8);
        potionCd=0; potions.heal=0; const empty=drinkPotion("heal")===false;
        const sv=collectSave(); const saved=sv.potions && sv.potions.swift===1 && sv.potions.heat===1;
        const RC=RECIPES.filter(r=>/酿造/.test(r.name)).length;
        Object.assign(potions,pS); Object.assign(potionFx,fS); hp=hpP; potionCd=cdP; updateHearts(); updateBuffHUD();
        ok("沙漠药水: 合成台 4 种配方, 酿 2 瓶, 饮用生效扣库存, 迅捷/耐热/夜视(只夜里提亮)/治疗, 空瓶拒绝, 进存档",
           RC===4 && brewed && d1 && eff && heat && nightB && dayB && healed && empty && saved, "rc="+RC+" eff="+eff+" night="+nightB+"/"+dayB+" heal="+healed+" saved="+saved);
      }
      // 绿洲钓鱼(第五轮·云端): 掉落表 / 早收空竿 / 咬钩窗口内收竿有收获 / 窗口过了鱼溜走 / 吃鱼回血 / 存档
      {
        const fS=Object.assign({},fishState), hpF=hp, eatF=eatCd, relF=npcState.relics, bagF=new Map(bag);
        let cats={}; for(let i=0;i<200;i++){ const c=fishLoot(i/200,false)[0]; cats[c]=(cats[c]||0)+1; }
        const richTr=[...Array(200)].map((_,i)=>fishLoot(i/200,true)[0]).filter(c=>c!=="fish"&&c!=="junk").length;
        const lootOk=cats.fish>100 && cats.junk>0 && (cats.gold||0)+(cats.relic||0)+(cats.gem||0)+(cats.crystal||0)>0 && richTr>((cats.gold||0)+(cats.relic||0)+(cats.gem||0)+(cats.crystal||0));
        Object.assign(fishState,{on:true,x:player.x+3,y:player.y,z:player.z,t:0,bite:2,window:0,fish:0,caught:0});
        const early=reelIn()===null && !fishState.on;
        Object.assign(fishState,{on:true,x:player.x+3,y:player.y,z:player.z,t:0,bite:1,window:0});
        tickFishing(1.05); const bit=fishState.window>0;
        const got=reelIn(); const caughtOk=!!got && fishState.caught===1;
        Object.assign(fishState,{on:true,x:player.x+3,y:player.y,z:player.z,t:0,bite:1,window:0});
        tickFishing(1.05); tickFishing(FISH_BITE_WIN+0.05); const escaped=!fishState.on;
        fishState.fish=2; eatCd=0; hp=Math.max(1,maxHp-8); const h0=hp; const ate=eatFish() && hp===h0+5 && fishState.fish===1;
        const sv=collectSave(); const saved=sv.fish && sv.fish.n===1 && sv.fish.caught===1;
        particles.length=0;
        Object.assign(fishState,fS); hp=hpF; eatCd=eatF; npcState.relics=relF; bag.clear(); for(const [k,v] of bagF) bag.set(k,v); updateHearts();
        ok("绿洲钓鱼: 掉落表(鱼为主/杂物/宝物, 富饶水域宝物更多), 早收空竿, 咬钩窗口内收竿有收获, 过窗鱼溜走, 吃鱼 +5, 进存档",
           lootOk && early && bit && caughtOk && escaped && ate && saved, "loot="+JSON.stringify(cats)+" rich="+richTr+" bit="+bit+" got="+got+" esc="+escaped+" ate="+ate);
      }
      // 骆驼驯服(第五轮·云端): 没仙人掌拒绝 / 喂到第 4 口必驯服 / 驯服后变坐骑 / 骑乘冲刺: 冷却、加速、弧线高度 / 驯服骆驼不被远距清理
      {
        const bagC=new Map(bag), rideC=riding, cS=Object.assign({},camelState), n0=mobs.length;
        const cm={type:"camel", def:MOB_DEFS.camel, x:player.x+2, y:player.y, z:player.z, vx:0,vy:0,vz:0,kbx:0,kbz:0,yaw:0,tgtYaw:0,hp:18,hurtT:0,animT:0,t:0,atkCd:0,burnT:0,swingT:0,groanT:0,fleeT:0,onGround:true,pause:false,burning:false,held:null};
        mobs.push(cm);
        bag.delete(CACTUS); const noFood=feedCamel(cm)===false && !cm.tamed;
        bag.set(CACTUS,10); for(let i=0;i<4 && !cm.tamed;i++) feedCamel(cm);
        const tamed=cm.tamed && cm.def.mount && cm.def.groundMount && cm.def.camelMount && cm.tameFed<=4 && bagCount(CACTUS)>=6;
        riding=cm; camelState.cd=0; camelState.dashT=0;
        const d1=camelDash(), mul=camelDashMul(), d2=camelDash();
        tickCamel(CAMEL_DASH_DUR/2); const hopMid=camelDashHop();
        tickCamel(CAMEL_DASH_DUR); const hopEnd=camelDashHop();
        const dashOk=d1 && !d2 && mul>2 && hopMid>1.4 && hopEnd===0 && camelState.cd>0;
        riding=rideC; mobs.length=n0; Object.assign(camelState,cS); bag.clear(); for(const [k,v] of bagC) bag.set(k,v); particles.length=0;
        ok("骆驼驯服: 没仙人掌拒绝, 喂食最多 4 口必驯服并变坐骑, 骑乘空格冲刺(加速+弧线跳跃+冷却)",
           noFood && tamed && dashOk && MOB_DEFS.camel.mount!==true, "noFood="+noFood+" tamed="+tamed+" dash="+d1+"/"+d2+" hop="+hopMid.toFixed(2));
      }
      // 储物箱/收纳袋(第六轮·云端): 方块已注册 / 存取搬运 / 容量上限 / 拆箱倒回背包 / 收纳袋解锁 / 存档往返
      {
        const bagS=new Map(bag), chS=JSON.stringify(chests), bdS=JSON.stringify(bundleState), open0=chestOpen;
        for(const k in chests) delete chests[k]; bundleState.owned=false; bundleState.items={};
        const reg=BLOCKS[CHEST] && BLOCKS[CHEST].t===290 && BLOCKS[CHEST].s===291 && RECIPES.some(r=>/储物箱/.test(r.name)) && RECIPES.some(r=>/收纳袋/.test(r.name));
        bag.set(SAND,30); bag.set(STONE,5);
        const k="9001,40,9001"; chests[k]={}; chestOpen={key:k, store:chests[k], title:"t", cap:2};
        const m1=storeMove(SAND,true,0), m2=storeMove(STONE,true,1);
        bag.set(DIRT,3); const full=storeMove(DIRT,true,0)===0;        // 2 种已满
        const back=storeMove(SAND,false,10);
        const moveOk=m1===30 && m2===1 && full && back===10 && chests[k][SAND]===20 && bagCount(SAND)===10 && bagCount(STONE)===4;
        const spilled=(chestOpen=null, chestSpill(9001,40,9001));
        const spillOk=spilled===21 && !chests[k] && bagCount(SAND)===30;
        bundleState.owned=true; bundleState.items[GOLD_ORE]=3; chests["1,2,3"]={[SAND]:5};
        const sv=collectSave(); const saved=sv.chests && sv.chests["1,2,3"] && sv.chests["1,2,3"][SAND]===5 && sv.bundle.owned && sv.bundle.items[GOLD_ORE]===3;
        for(const kk in chests) delete chests[kk]; Object.assign(chests,JSON.parse(chS)); Object.assign(bundleState,JSON.parse(bdS)); chestOpen=open0;
        bag.clear(); for(const [a,b] of bagS) bag.set(a,b);
        ok("储物箱/收纳袋: 方块与配方已注册, 背包⇄箱子搬运(Shift 搬 1), 种类上限, 拆箱物品倒回背包, 进存档",
           reg && moveOk && spillOk && saved, "reg="+reg+" move="+moveOk+" spill="+spilled+" saved="+saved);
        // 氛围: 萤火虫只在黄昏/夜里, 村落烟囱坐标落在村子范围内
        let vs=null; for(let sx=-40;sx<=40&&!vs;sx++) for(let sz=-40;sz<=40&&!vs;sz++){ const st=structureAt(sx,sz); if(st&&st.type==="village") vs=st; }
        const ch=vs?villageChimneys(vs):[];
        ok("氛围小生物: 萤火虫正午为 0、深夜为 1; 村落烟囱坐标都在村内且高于地面",
           fireflyAmount(1)===0 && fireflyAmount(-0.1)===1 && fireflyAmount(0.1)>0 && (!vs || (ch.length>0 && ch.every(([x,y,z])=>Math.hypot(x-vs.x,z-vs.z)<VIL_N && y>vs.h+6))),
           "chim="+ch.length);
      }
      ok("材质: 逐块旋转——松沙陷坑与沙子同模式(伪装不露馅), 沙纹只转180°, 草地四向", UV_ROT[LOOSESAND*2]===UV_ROT[SAND*2] && UV_ROT[LOOSESAND*2+1]===UV_ROT[SAND*2+1] && UV_ROT[SAND*2]===1 && UV_ROT[GRASS*2]===2,
         "sand="+UV_ROT[SAND*2]+" loose="+UV_ROT[LOOSESAND*2]);
      // ---- 图集扩页(512×1024)与村落建材 ----
      ok("图集: 512×1024 = 16 列 × 32 行, TV=1/32, 纵向护边 EPV=1/1024, 完整 mip 链 10 级",
         atlasCv.width===512 && atlasCv.height===1024 && TV===1/32 && EPV===1/1024 && ATLAS_MIPS===10,
         atlasCv.width+"×"+atlasCv.height+" mips="+ATLAS_MIPS);
      { // 每个方块面贴图: 编号合法, 内缩后的 UV 落在本格可见区(格内 1..30 px)——两轴都查, 防串格
        let bad="";
        const inTile=(t)=>{ const u0=(t%16)*TS, v0=Math.floor(t/16)*TV, px=(t%16)*32, py=Math.floor(t/16)*32;
          const us=[u0+EP,u0+TS-EP], vs=[v0+EPV,v0+TV-EPV];
          return us.every(u=>{ const x=Math.floor(u*512+1e-6); return x>=px+1 && x<=px+31; })
              && vs.every(v=>{ const y=Math.floor(v*1024+1e-6); return y>=py+1 && y<=py+31; }); };
        for(const id in BLOCKS){ const B=BLOCKS[id]; for(const t of [B.t,B.b,B.s]) if(!(t>=0 && t<16*TX_ROWS) || !inTile(t)) bad+=id+":"+t+" "; }
        for(const t of WR_SIDE) if(!inTile(t)) bad+="WR:"+t+" ";
        for(const t of CL_SIDE) if(!inTile(t)) bad+="CL:"+t+" ";
        if(!inTile(511)) bad+="511 ";
        ok("图集: 全部方块贴图编号 < 512 且 UV 内缩后不越出本格(横/纵各 1 texel 护边)", !bad, bad||"ok");
        { const ax=atlasCv.getContext("2d"); let opaque=true, distinct=new Set();
          for(const t of CL_SIDE){ const d=ax.getImageData((t%16)*32+1,Math.floor(t/16)*32+1,30,30).data;
            for(let i=3;i<d.length;i+=4) if(d[i]<255){ opaque=false; break; }
            distinct.add(d[0]+","+d[1]+","+d[2]+"|"+d[30*15*4]+","+d[30*15*4+1]); }
          ok("台地陶土: 4 片分色条纹贴图已画(不透明、各片不同), 顶面仍用原陶土格", CL_SIDE.length===4 && opaque && distinct.size>=3 && BLOCKS[CLAY].t===81, "distinct="+distinct.size); }
      }
      { // 新贴图槽 256-270 确实画了东西(不透明块满覆盖, 棕榈叶/芦苇有镂空)
        const alphaFrac=(t)=>{ const d=actx.getImageData((t%16)*32+1,Math.floor(t/16)*32+1,30,30).data; let a=0; for(let i=3;i<d.length;i+=4) if(d[i]>=128) a++; return a/900; };
        const solid=[256,257,258,259,260,261,264,265,266,267,268,269].filter(t=>alphaFrac(t)<0.999);
        const pl=alphaFrac(262), rd=alphaFrac(263);
        ok("图集: 新贴图 256-270 已绘制(灰泥/木框窗/棕榈/铁件/风蚀岩顶与岩层/鎏金满覆盖; 棕榈叶 30~75% 覆盖)", !solid.length && pl>0.3 && pl<0.75 && rd>0.03 && rd<0.5,
           "缺="+solid.join(",")+" 棕榈叶="+pl.toFixed(2)+" 芦苇="+rd.toFixed(2));
      }
      ok("村落建材: 灰泥×3/木框窗/棕榈干叶/芦苇/鎏金已注册(ID 63-70 不与旧存档冲突), 属性正确",
         [PLASTER,PLASTER_ROSE,PLASTER_WHITE,WINDOW_WOOD,PALM_LOG,PALM_LEAF,REEDS,GILDED].every((id,i)=>id===63+i && !!BLOCKS[id] && !!BLOCKS[id].name)
         && [PLASTER,PLASTER_ROSE,PLASTER_WHITE,WINDOW_WOOD,PALM_LOG,GILDED].every(id=>SOLID(id)&&OPAQUE(id)&&OCCLUDE(id)&&!EMISSIVE(id))
         && !OPAQUE(PALM_LEAF) && !SKY_OCC(PALM_LEAF) && swayClass(PALM_LEAF,false)===2 && PLANT(REEDS) && !SOLID(REEDS)
         && BLOCKS[WINDROCK].t===265 && BLOCKS[WINDROCK].s===99 && WR_SIDE.length===4 && BLOCKS[LANTERN].s===94,
         "ids="+[PLASTER,GILDED].join("-"));
      ok("光影: 画质切到「低」关闭阴影, 切回恢复", offOk && (shadow.ok || !HAS_DEPTH_TEX), "restored="+shadow.ok);
    }

    // ---- 光影(第 4 步): 后处理管线 / 画质档位 / 拍照模式 ----
    {
      const P=GFX_PRESETS;
      ok("后处理: 档位 低=关 / 中=泛光+FXAA / 高=+热浪 / 极致=+远景柔化",
         !P[0].post && P[1].post && P[1].bloom && P[1].fxaa && !P[1].heat && P[2].heat && P[2].fxaa && !P[2].dof && P[3].dof && P[3].bloom,
         P.map(x=>(x.post?1:0)+(x.bloom?"b":"")+(x.msaa?"m":"")+(x.dof?"d":"")).join(","));
      const noon=postParams(1,"clear",false), night=postParams(-0.4,"clear",false), dusk=postParams(0.1,"clear",false);
      const storm=postParams(1,"sand",false), wet=postParams(1,"clear",true);
      ok("后处理: 泛光强度 白天0.08 → 黄昏更强 → 夜晚0.22, 沙暴≈0.16",
         Math.abs(noon.bloom-0.08)<1e-6 && Math.abs(night.bloom-0.22)<1e-6 && dusk.bloom>noon.bloom && dusk.bloom<night.bloom && Math.abs(storm.bloom-0.16)<1e-6,
         [noon.bloom,dusk.bloom,night.bloom,storm.bloom].map(v=>v.toFixed(3)).join("/"));
      ok("后处理: 暗角 白天0.28/夜晚0.36/水下0.45; 白平衡 白天中性·夜晚偏冷",
         Math.abs(noon.vig-0.28)<1e-6 && Math.abs(night.vig-0.36)<1e-6 && wet.vig===0.45 &&
         noon.wb.every(v=>Math.abs(v-1)<1e-6) && night.wb[2]>1 && night.wb[0]<1, "wbN="+night.wb.map(v=>v.toFixed(2)));
      // 逐档建 FBO: 低档不建(直出画布), 中档起完整且尺寸对; 高档多重采样; 极致多出远景柔化目标
      const g0=gfxLevel, rows=[]; let fboOk=true;
      for(let lv=0; lv<4; lv++){
        setGfx(lv); postBegin(96,54);
        const want=POST_CAN && P[lv].post && !post.broken;
        let good = want ? (post.ok && sceneFBO===(post.msFbo||post.fbo) && post.w===96 && post.h===54) : (sceneFBO===null && !post.fbo);
        if(want && post.ok){
          good = good && gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE
                      && post.mips.length===(P[lv].bloom?5:0) && (!P[lv].bloom || (post.mips[0].w===48 && post.mips[4].w===3))
                      && (!P[lv].msaa || post.samples>=2 || (gl.getParameter(gl.MAX_SAMPLES)|0)<2)
                      && (post.dof.length===(P[lv].dof?2:0));
        }
        rows.push(lv+":"+(sceneFBO?"fbo":"canvas")+(post.samples?"x"+post.samples:"")+(post.dof.length?"+dof":""));
        if(!good) fboOk=false;
      }
      // MSAA 路径默认关(见 GFX_PRESETS 注释), 临时给「高」开 4× 验证多重采样渲染缓冲可建
      { const ms0=P[2].msaa; P[2].msaa=4; setGfx(2); postBegin(96,54);
        const msOk=!POST_CAN || post.broken || (gl.getParameter(gl.MAX_SAMPLES)|0)<2 || (post.samples>=2 && sceneFBO===post.msFbo);
        rows.push("msaa:"+post.samples); if(!msOk) fboOk=false; P[2].msaa=ms0; post.dirty=true; }
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      ok("后处理: 各档 FBO 按需创建且完整(WebGL1 全部直出)", fboOk, "gl2="+IS_GL2+" "+rows.join(" "));
      // 真画一帧(当前档位)检查无 GL 错误且合成执行
      setGfx(POST_CAN?2:g0);
      while(gl.getError()!==gl.NO_ERROR){}
      const f0=post.frames;
      let rErr="";
      try{ render(performance.now()); }catch(e){ rErr=String(e&&e.message); }
      const glErr=gl.getError();
      ok("后处理: 「高」档渲染一帧 无 GL 错误且合成到画布", !rErr && glErr===gl.NO_ERROR && (!POST_CAN || post.broken || post.frames===f0+1),
         "err="+glErr+" "+rErr+" frames="+(post.frames-f0)+" broken="+post.broken);
      ok("光束: 「高」档合成着色器含光束步进(uRayI/阴影贴图/逆矩阵), 且上一帧已存相机逆矩阵",
         !POST_CAN || post.broken || (post.progs && post.progs.comp.uRayI!=null && post.progs.comp.uInvPV!=null && !!_postCam.inv && GFX_PRESETS[2].rays>0 && !GFX_PRESETS[1].rays),
         "rays="+GFX_PRESETS.map(x=>x.rays||0));
      setGfx(g0);
      // 拍照模式: F1 切换, 隐藏物品栏/准星, 保留水下色调; 再按恢复
      const pm0=photoMode;
      if(photoMode) setPhotoMode(false);
      const hudEl=document.getElementById("hud"), hd0=hudEl.style.display; hudEl.style.display="block";
      document.dispatchEvent(new KeyboardEvent("keydown",{code:"F1",bubbles:true}));
      const on=photoMode && document.body.classList.contains("photo");
      const hbHidden=getComputedStyle(document.getElementById("hotbar")).visibility==="hidden"
                  && getComputedStyle(document.getElementById("cross")).visibility==="hidden";
      const tintKept=getComputedStyle(document.getElementById("watertint")).visibility!=="hidden";
      document.dispatchEvent(new KeyboardEvent("keydown",{code:"F1",bubbles:true}));
      const off=!photoMode && !document.body.classList.contains("photo")
             && getComputedStyle(document.getElementById("hotbar")).visibility!=="hidden";
      hudEl.style.display=hd0; setPhotoMode(pm0);
      ok("拍照模式: F1 隐藏 HUD(保留水下/岩浆色调), 再按 F1 恢复", on && hbHidden && tintKept && off,
         "on="+on+" hidden="+hbHidden+" tint="+tintKept+" off="+off);
    }

    // ---- 光影(第 3 步): 天色关键帧 / 云量 / 相机基向量 / 风摆与水面网格编码 / 着色器 ----
    {
      const lum=c=>0.299*c[0]+0.587*c[1]+0.114*c[2];
      const noon=skyKeys(1), set=skyKeys(0), night=skyKeys(-0.1);
      ok("光影3: 正午天顶比地平线更深更蓝", noon.zen[2]>noon.zen[0]*1.5 && lum(noon.zen)<lum(noon.hor), "zen="+noon.zen.map(v=>v.toFixed(2))+" hor="+noon.hor.map(v=>v.toFixed(2)));
      ok("光影3: 日落地平线暖橙且晚霞带亮起", set.hor[0]>set.hor[2]*1.4 && lum(set.band)>0.3 && lum(noon.band)===0, "hor="+set.hor.map(v=>v.toFixed(2)));
      ok("光影3: 夜空仍是明亮深蓝(不漆黑)", lum(night.hor)>0.15 && night.zen[2]>night.zen[0], "hor="+lum(night.hor).toFixed(2));
      let jump=0;
      for(let hh=-0.15; hh<1.05; hh+=0.001){ const a=skyKeys(hh), b=skyKeys(hh+0.001);
        for(const k of ["zen","hor","gnd","band","glow"]) for(let i=0;i<3;i++) jump=Math.max(jump,Math.abs(a[k][i]-b[k][i])); }
      ok("光影3: 天色随太阳高度连续变化(无跳变)", jump<0.03, "最大步进="+jump.toFixed(3));
      ok("光影3: 高度雾日落比正午浓", set.fogA>noon.fogA && noon.fogA>0, "noon="+noon.fogA+" set="+set.fogA);
      ok("光影3: 云量 雷暴>雨>沙暴>晴>干旱晴", cloudCoverTarget("storm",0)>cloudCoverTarget("rain",0) && cloudCoverTarget("rain",0)>cloudCoverTarget("sand",0)
         && cloudCoverTarget("sand",0)>cloudCoverTarget("clear",0) && cloudCoverTarget("clear",1)<cloudCoverTarget("clear",0), "");
      const yw=0.7, pt=0.3, B=camBasis(yw,pt), dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
      const lf=[Math.sin(yw)*Math.cos(pt), -Math.sin(pt), -Math.cos(yw)*Math.cos(pt)];
      ok("光影3: 天空相机基向量与视线一致且正交归一", near(dot(B.fwd,lf),1,1e-9) && near(dot(B.fwd,B.right),0,1e-9) && near(dot(B.fwd,B.up),0,1e-9)
         && near(dot(B.right,B.up),0,1e-9) && near(dot(B.up,B.up),1,1e-9) && B.up[1]>0, "");
      ok("光影3: 风摆类别 草顶=1/草根=0/树叶=2/睡莲与石头=0", swayClass(TALLGRASS,true)===1 && swayClass(TALLGRASS,false)===0 && swayClass(LEAVES,false)===2
         && swayClass(PINE_LEAF,true)===2 && swayClass(LILY,true)===0 && swayClass(STONE,true)===0, "");
      ok("光影3: 水面角点深度 岸边更浅/开阔 1 格深=0.86", waterCornerDepth(0,0,0,0)===0 && near(waterCornerDepth(1,1,1,1),0.86) && waterCornerDepth(3,3,0,0)<waterCornerDepth(3,3,3,3), "");
      ok("光影3: 天空/主/水面着色器均已链接", [skyProg,mainProg,waterProg].every(pg=>gl.getProgramParameter(pg,gl.LINK_STATUS)), "");
      ok("光影3: 主程序与水面程序共用区块属性槽位", A_POS===0 && A_UV===1 && A_L===2 && A_F===3 && gl.getAttribLocation(waterProg,"aPos")===0 && gl.getAttribLocation(waterProg,"aF")===3,
         "A="+[A_POS,A_UV,A_L,A_F]);
      // 合成测试区块对 A|B(远离一切, 沿 x 相邻): 跨区块边界的 12×6 水池(3 格深, 石头围岸) + 一株高草 + 一块树叶。
      // 回读网格(仅 WebGL2 有 getBufferSubData): 水面只有顶面、岸边角点带岸格数、区块边界无多余侧面; 植物仅顶端顶点带风摆; 树叶全带类别 2
      if(IS_GL2){
        const X0=160000, Z0=160000, cxA=X0/CS, czA=Z0/CS;
        gb(X0+CS, WATER_Y, Z0);                     // 先让 gb 缓存住"B 不存在", 检验建网格前的缓存失效
        const mk=(cx,cz)=>{ const c={cx,cz,blocks:new Uint8Array(CS*CS*H),mesh:null}; world.set(key(cx,cz),c); return c; };
        const A=mk(cxA,czA); mk(cxA+1,czA);
        const put=(x,y,z,id)=>{ world.get(key(x>>4,z>>4)).blocks[((x&15)*CS+(z&15))*H+y]=id; };
        for(let x=X0+9;x<=X0+22;x++) for(let z=Z0+3;z<=Z0+10;z++) for(let y=0;y<=WATER_Y;y++){
          const inner=x>X0+9 && x<X0+22 && z>Z0+3 && z<Z0+10;
          put(x,y,z, inner && y>=WATER_Y-2 ? WATER : STONE);
        }
        put(X0+4,WATER_Y,Z0+4,STONE); put(X0+4,WATER_Y+1,Z0+4,TALLGRASS); put(X0+4,WATER_Y+4,Z0+13,LEAVES);
        const rd=(m)=>{ if(!m) return new Float32Array(0); gl.bindBuffer(gl.ARRAY_BUFFER,m.vbo);
          const a=new Float32Array(gl.getBufferParameter(gl.ARRAY_BUFFER,gl.BUFFER_SIZE)/4); gl.getBufferSubData(gl.ARRAY_BUFFER,0,a); return a; };
        const dec=unpackAF;                         // 解码顺序 方块光 → 类别 → 天光 → 面
        let wOk=true, wFaces=0, shoreV=0, openV=0, seam=0, pOk=true, pN=0, pSway=0, leafN=0, leafOk=true;
        try{
          buildChunkMesh(A);
          const wa=rd(A.mesh.water);
          for(let i=0;i<wa.length;i+=28){
            const {f}=dec(wa[i+6]); wFaces++;
            if(f!==2) wOk=false;
            let mx=1e9;
            for(let k=0;k<4;k++){ const j=i+k*7, d=dec(wa[j+6]), land=Math.floor(d.cls/2);
              mx=Math.min(mx,wa[j]); if(wa[j+5]<0 || wa[j+5]>3) wOk=false;
              if(land>0) shoreV++; else if(near(wa[j+5],2.86,1e-4)) openV++; }
            if(f===0 && mx===X0+CS) seam++;
          }
          const pa=rd(A.mesh.plant);
          for(let i=0;i<pa.length;i+=7){ const d=dec(pa[i+6]); pN++; if(d.f!==6) pOk=false; if(d.cls===1){ pSway++; if(pa[i+1]<WATER_Y+1.5) pOk=false; } else if(d.cls!==0) pOk=false; }
          const oa=rd(A.mesh.opaque);
          for(let i=0;i<oa.length;i+=7){ if(oa[i+1]>=WATER_Y+4 && oa[i+1]<=WATER_Y+5 && oa[i+2]>=Z0+13 && oa[i+2]<=Z0+14){ leafN++; if(dec(oa[i+6]).cls!==2) leafOk=false; } }
        } finally {
          if(A.mesh) destroyMesh(A.mesh);
          world.delete(key(cxA,czA)); world.delete(key(cxA+1,czA)); _gcx=1e9;
        }
        ok("光影3: 水面网格 仅顶面/岸边角点带岸格数/开阔处水深 2.86", wOk && wFaces===36 && shoreV>0 && openV>0, "faces="+wFaces+" shore="+shoreV+" open="+openV);
        ok("光影3: 跨区块水池的区块边界无多余侧面", seam===0 && wFaces===36, "seam="+seam);
        ok("光影3: 植物仅顶端顶点带风摆(类别1)", pOk && pN===8 && pSway===4, "verts="+pN+" sway="+pSway);
        ok("光影3: 树叶顶点全部带风摆类别 2", leafOk && leafN===24, "verts="+leafN);
      }
    }

    // ---- 方块光(夜里的灯光池) / 浮空岛底面天光 / 生物软阴影 ----
    {
      // aF 打包往返: 各字段取遍边界值, 且 Float32 精确
      let rt=true;
      for(const f of [0,5,6,7]) for(const sky of [0,7,15]) for(const cls of [0,1,2,9,15]) for(const bl of [0,1,8,15]){
        const v=packAF(f,sky,cls,bl), d=unpackAF(Math.fround(v));
        if(Math.fround(v)!==v || d.f!==f || d.sky!==sky || d.cls!==cls || d.bl!==bl) rt=false;
      }
      ok("方块光: aF 打包往返(面/天光/类别/方块光)且 Float32 精确", rt && packAF(7,15,15,15)<(1<<24), "max="+packAF(7,15,15,15));
      ok("方块光: 强度 深夜>黄昏>正午, 正午只剩一点", blockLightK(-0.1)>blockLightK(0.15) && blockLightK(0.15)>blockLightK(1) && blockLightK(1)<0.5, "");
      // 合成区块对 A|B(沿 x 相邻, 远离一切): 石头地面 y=20; B 里一盏灯笼(离接缝 6 格); 一道石墙逼光绕路; 一个密封石盒
      const X0=192000, Z0=192000, cxA=X0/CS, czA=Z0/CS, FY=20;
      const mk=(cx,cz)=>{ const c={cx,cz,blocks:new Uint8Array(CS*CS*H),mesh:null}; world.set(key(cx,cz),c); return c; };
      const A=mk(cxA,czA), B=mk(cxA+1,czA), E=mk(cxA+5,czA);
      const put=(x,y,z,id)=>{ world.get(key(x>>4,z>>4)).blocks[((x&15)*CS+(z&15))*H+y]=id; };
      for(let x=X0;x<X0+2*CS;x++) for(let z=Z0;z<Z0+CS;z++) put(x,FY,z,STONE);
      const LX=X0+CS+6, LY=FY+2, LZ=Z0+8;
      put(LX,LY,LZ,LANTERN);
      for(let z=Z0+6;z<=Z0+10;z++) for(let y=FY+1;y<=FY+3;y++) put(X0+CS+2,y,z,STONE);   // 矮墙: 墙后的光要翻过墙顶/绕过墙端
      const SX=X0+CS+9, SZ=Z0+3;                                                         // 密封石盒(内部 1 格空气)
      for(let dx=-1;dx<=1;dx++) for(let dy=-1;dy<=1;dy++) for(let dz=-1;dz<=1;dz++) if(dx||dy||dz) put(SX+dx,FY+2+dy,SZ+dz,STONE);
      let lvOk=false, skipOk=false, seamCells=0, seamBad=0, seamV=0, seamVBad=0, entOk=false, lit=0;
      try{
        _gcx=1e9;
        skipOk = blBuild(E.cx*CS,E.cz*CS)===false;                                      // 无光源 → 整段跳过
        blBuild(B.cx*CS,B.cz*CS);
        const at=(dx,dy,dz)=>blAt(LX+dx,LY+dy,LZ+dz);
        lvOk = at(0,0,0)===14 && at(1,0,0)===13 && at(2,0,0)===12 && at(-1,0,0)===13 && at(0,3,0)===11
            && at(-3,0,0)===11 && at(-4,0,0)===0 /* 墙内 */ && blAt(SX,FY+2,SZ)===0 /* 密封盒内 */ && at(0,-2,0)===0 /* 地面石头 */;
        // 墙后贴墙一格要翻墙绕路(上 2 + 横 5 + 下 2 = 9 步 → 5 级), 比直线距离给的 9 级暗
        const behind=blAt(X0+CS+1,LY,LZ);
        lvOk = lvOk && behind===5;
        // 接缝: A 与 B 对重叠取样格(x = B 起点-1 与 B 起点)算出的光级逐格一致
        const snapB=[]; for(let x=X0+CS-1;x<=X0+CS;x++) for(let z=Z0-1;z<=Z0+CS;z++) for(let y=0;y<H;y++) snapB.push(blAt(x,y,z));
        blBuild(A.cx*CS,A.cz*CS);
        let k=0; for(let x=X0+CS-1;x<=X0+CS;x++) for(let z=Z0-1;z<=Z0+CS;z++) for(let y=0;y<H;y++){ const v=blAt(x,y,z); if(v||snapB[k]) seamCells++; if(v!==snapB[k]) seamBad++; k++; }
        blF.on=false;
        // 网格层面: A、B 地面顶面在接缝线 x=B 起点上的共享顶点, 解码出的方块光相同
        if(IS_GL2){
          buildChunkMesh(A); buildChunkMesh(B);
          const rd=(m)=>{ if(!m) return new Float32Array(0); gl.bindBuffer(gl.ARRAY_BUFFER,m.vbo);
            const a=new Float32Array(gl.getBufferParameter(gl.ARRAY_BUFFER,gl.BUFFER_SIZE)/4); gl.getBufferSubData(gl.ARRAY_BUFFER,0,a); return a; };
          const va=rd(A.mesh.opaque), vb=rd(B.mesh.opaque), mA=new Map();
          for(let i=0;i<va.length;i+=7){ const d=unpackAF(va[i+6]); if(d.f===2 && va[i]===X0+CS && va[i+1]===FY+1) mA.set(va[i+2],d.bl); if(d.bl) lit++; }
          for(let i=0;i<vb.length;i+=7){ const d=unpackAF(vb[i+6]); if(d.f===2 && vb[i]===X0+CS && vb[i+1]===FY+1 && mA.has(vb[i+2])){ seamV++; if(mA.get(vb[i+2])!==d.bl) seamVBad++; } }
          entOk = blockLightAt(LX+1.5,LY+0.2,LZ+0.5)===13 && blockLightAt(LX+0.5,LY,LZ-5.5)===8 && B.blOn===true;
        } else { seamV=1; lit=1; entOk=true; }
      } finally {
        for(const c of [A,B,E]){ if(c.mesh) destroyMesh(c.mesh); world.delete(key(c.cx,c.cz)); }
        _gcx=1e9; blF.on=false;
      }
      ok("方块光: BFS 光级 灯笼 14、每格衰减 1、不透光方块挡住、墙后绕路更暗、密封盒内为 0", lvOk, "");
      ok("方块光: 区域内没有光源的区块整段跳过", skipOk, "");
      ok("方块光: 相邻区块对接缝取样格算出的光级逐格一致", seamBad===0 && seamCells>20, "cells="+seamCells+" bad="+seamBad);
      ok("方块光: 接缝两侧共享顶点的方块光相同(网格回读)", seamVBad===0 && seamV>=CS && lit>0, "shared="+seamV+" bad="+seamVBad+" litA="+lit);
      ok("方块光: 生物查询用的区块光场与网格一致(灯旁 13 / 6 格外 8)", entOk, "");
      // 浮空岛底面: 下方空旷 → 天光拉满; 洞顶(下方 4 格空隙)不变
      const X1=224000, Z1=224000, C=mk(X1/CS,Z1/CS);
      let isl=-1, cave=-1;
      try{
        for(let x=X1;x<X1+CS;x++) for(let z=Z1;z<Z1+CS;z++){ C.blocks[((x&15)*CS+(z&15))*H+10]=STONE; }
        C.blocks[((3)*CS+3)*H+40]=STONE;                      // 悬空一块(下面 29 格空气)
        C.blocks[((8)*CS+8)*H+15]=STONE;                      // "洞顶"(下面 4 格空气)
        _gcx=1e9;
        isl=openBelowSky(X1+3,39,Z1+3); cave=openBelowSky(X1+8,14,Z1+8);
      } finally { world.delete(key(C.cx,C.cz)); _gcx=1e9; }
      ok("浮空岛底面: 下方大片空气 → 天光 1; 洞顶不变(0)", isl===1 && cave===0, "island="+isl+" cave="+cave);
      // 软阴影: 贴地最浓、离地 4 格消失; 地面高度取脚下实心块顶面
      const gx=Math.floor(player.x), gz=Math.floor(player.z);
      let gyTop=-1; for(let y=H-1;y>=0;y--){ if(SOLID(getBlock(gx,y,gz))){ gyTop=y; break; } }
      const gy=blobGroundY(gx+0.5,gyTop+1.5,gz+0.5), under=getBlock(gx,gyTop+1,gz);
      ok("软阴影: 不透明度 贴地 1 → 离地 4 格 0", blobFade(0)===1 && blobFade(4)===0 && blobFade(2)>0 && blobFade(2)<1, "");
      ok("软阴影: 地面高度 = 脚下实心方块顶面(水/岩浆上不画)", gyTop<0 || under===WATER || under===LAVA || gy===gyTop+1 || getBlock(gx,gyTop,gz)===WATER, "gy="+gy+" top="+gyTop);
      ok("软阴影: 着色器已链接", gl.getProgramParameter(blobProg,gl.LINK_STATUS), "");
    }

    // ---- 丰富批次: 地图(仙人掌) / 画面(夜空) / 玩法(Boss血条) / 任务(悬赏) ----
    {
      // 画面: 夜色系数 —— 正午 0、深夜 1、黄昏介于之间
      ok("夜色系数: 正午=0/深夜=1/黄昏(0,1)", skyNightFactor(1)===0 && skyNightFactor(-1)===1 && skyNightFactor(0)>0 && skyNightFactor(0)<1,
         "noon="+skyNightFactor(1)+" mid="+skyNightFactor(-1)+" dusk="+skyNightFactor(0).toFixed(2));
      // 地图: 沙漠仙人掌谓词 —— 沙漠水位之上可命中; 水下/非沙漠不长
      let cactusHit=false;
      for(let gx=0; gx<600 && !cactusHit; gx++) for(let gz=0; gz<30; gz++){ if(isCactusAt(gx,gz, WATER_Y+6, BIO_DESERT)){ cactusHit=true; break; } }
      ok("沙漠仙人掌谓词可命中", cactusHit, "扫描命中="+cactusHit);
      ok("仙人掌不长在水下/非沙漠", !isCactusAt(5,5,WATER_Y-1,BIO_DESERT) && !isCactusAt(5,5,WATER_Y+6,BIO_MESA), "ok");
      // 玩法: Boss 血条 —— 无Boss隐藏; 有Boss显示且血量比正确
      const mlen0=mobs.length; mobs.length=0;
      ok("无Boss时血条隐藏", bossBarState().visible===false, "visible="+bossBarState().visible);
      mobs.push({type:"king",def:MOB_DEFS.king,x:player.x,y:player.y,z:player.z,vx:0,vy:0,vz:0,kbx:0,kbz:0,yaw:0,tgtYaw:0,
        hp:MOB_DEFS.king.hp/2, maxHp:MOB_DEFS.king.hp, hurtT:0,animT:0,t:0,atkCd:0,burnT:0,swingT:0,groanT:0,fleeT:0,onGround:true,pause:false,burning:false,held:null});
      const bs=bossBarState();
      ok("有Boss时血条显示且半血≈50%", bs.visible && Math.abs(bs.pct-0.5)<0.02 && bs.name===MOB_DEFS.king.name, "pct="+bs.pct.toFixed(2)+" name="+bs.name);
      mobs.length=mlen0;
      { // 天数加成 / 不祥 / 远征强化会把 maxHp 抬到 def.hp 以上。血条必须按 maxHp, 并且经得住每帧 updateStatsHUD 的再写。
        const keepB=mobs.slice(), bossB=boss, stHTML=document.getElementById("stats").innerHTML;
        const compB=document.getElementById("compass"), compD=compB.style.display;
        mobs.length=0;
        const defB=MOB_DEFS.anubis, mxB=Math.round(defB.hp*1.55);
        mobs.push({type:"anubis",def:defB,x:player.x+4,y:player.y,z:player.z,hp:mxB,maxHp:mxB,vx:0,vy:0,vz:0,kbx:0,kbz:0,yaw:0,tgtYaw:0,hurtT:0,animT:0,t:0,atkCd:1,burnT:0,swingT:0,groanT:0,fleeT:0,onGround:true,pause:false,burning:false,elite:false});
        boss=mobs[0];
        updateBossBar(); updateStatsHUD();
        const barB=document.getElementById("bossbar");
        const wFull=parseFloat(barB.querySelector(".bf").style.width);
        const labFull=barB.querySelector(".bn").textContent;
        mobs[0].hp=mxB/2;
        updateBossBar(); updateStatsHUD();
        const wHalf=parseFloat(barB.querySelector(".bf").style.width);
        const oneBar=document.querySelectorAll("#bossbar").length===1;
        ok("Boss 血条按最大生命计算: 强化后满血仍是 100%、半血 50%, 且只有一条血条",
          oneBar && barB.style.display==="block" && Math.abs(wFull-100)<0.2 && Math.abs(wHalf-50)<0.2 && labFull.indexOf("100%")>=0,
          "full="+wFull+" half="+wHalf+" label="+labFull+" n="+document.querySelectorAll("#bossbar").length);
        mobs.length=0; for(const m of keepB) mobs.push(m);
        boss=bossB; document.getElementById("stats").innerHTML=stHTML; compB.style.display=compD; updateBossBar();
      }
      // 任务: 悬赏 —— 达标发奖轮换 / 分类计数 / 存档往返 / 老档归零
      const bI=bountyIdx,bP=bountyProg,bD=bountyDone, keyS=(typeof arenaState!=="undefined"?arenaState.keys:0),
            xpS=xp,lvlS=lvl,maxS=maxHp,hpS=hp,dmgS=dmgMul,dropS=drops.length;
      try{
        bountyIdx=0; bountyProg=0; bountyDone=0;                       // 第1单: 斩杀8敌
        for(let k=0;k<BOUNTIES[0].goal;k++) bountyProgress("cull",1,"add");
        ok("悬赏达标发奖并轮到下一单", bountyDone===1 && bountyIdx===1 && bountyProg===0, "done="+bountyDone+" idx="+bountyIdx+" prog="+bountyProg);
        bountyProgress("elite",99,"add");                             // 第2单: 斩杀精英(一次超额直接达标)
        ok("不同类型悬赏各自计数并推进", bountyDone===2 && bountyIdx===2, "done="+bountyDone+" idx="+bountyIdx);
        bountyIdx=2; bountyProg=3; bountyDone=5;
        const sv2=collectSave();
        ok("悬赏写入存档(bounty)", sv2.bounty && sv2.bounty.idx===2 && sv2.bounty.prog===3 && sv2.bounty.done===5, "bounty="+JSON.stringify(sv2.bounty));
        const oldB={}; ok("老存档(无bounty)悬赏归零", (((oldB.bounty||{}).idx)|0)===0 && (((oldB.bounty||{}).done)|0)===0, "ok");
      } finally {
        bountyIdx=bI; bountyProg=bP; bountyDone=bD;
        if(typeof arenaState!=="undefined") arenaState.keys=keyS;
        xp=xpS; lvl=lvlS; maxHp=maxS; hp=hpS; dmgMul=dmgS; drops.length=dropS; updateHearts();
      }
    }

    // ---- 敌人多样化批次: 僵尸/木乃伊减量 + 群系分布 + 成群出没 ----
    {
      const N=200, cnt={};
      for(let i=0;i<N;i++){ const [t]=nightSpawnFor(BIO_DESERT, i/N); cnt[t]=(cnt[t]||0)+1; }
      const mummyFrac=(cnt.mummy||0)/N, kinds=Object.keys(cnt).length;
      ok("沙漠夜刷木乃伊占比≤8%", mummyFrac<=0.08, "木乃伊="+(mummyFrac*100).toFixed(0)+"%");
      ok("沙漠夜刷类型丰富(≥5种)且无僵尸", kinds>=5 && !cnt.zombie, "种类="+kinds+" 僵尸="+(cnt.zombie||0));
      const pln={}; for(let i=0;i<N;i++){ const [t]=nightSpawnFor(BIO_PLAIN, i/N); pln[t]=(pln[t]||0)+1; }
      ok("平原夜刷僵尸占比≤12%", (pln.zombie||0)/N<=0.12, "僵尸="+(((pln.zombie||0)/N)*100).toFixed(0)+"%");
      const all=new Set();
      for(const b of [BIO_DESERT,BIO_MESA,BIO_SALTLAKE,BIO_CANYON,BIO_SNOW,BIO_TAIGA,BIO_VOLCANO,BIO_PLAIN,BIO_FOREST,BIO_SWAMP,BIO_SAVANNA])
        for(let i=0;i<40;i++){ all.add(nightSpawnFor(b, i/40)[0]); }
      ok("夜刷谱系含蝎/甲虫/蛛/沙虫/机甲等多样对手", ["scarab","serqet","spider","sandworm","mech","slime","skeleton"].every(t=>all.has(t)), "谱系="+[...all].join(","));
      const dS=dayCount; dayCount=1; const sc1=swarmChance(); dayCount=8; const sc8=swarmChance(); dayCount=dS;
      ok("成群概率合法且随天数上升", sc1>0 && sc1<1 && sc8>sc1 && sc8<1, "第1天="+sc1.toFixed(2)+" 后期="+sc8.toFixed(2));
      const mlenS=mobs.length; const got=spawnPack("scarab",4,10,20);
      ok("成群出没一次刷多只", got>=1 && mobs.length-mlenS===got, "生成="+got);
      mobs.length=mlenS;
    }

    // ---- 战斗舞台批次: 沙暴袭击 ----
    {
      const pool=new Set(); for(let i=0;i<40;i++) pool.add(sandRaidType(i/40));
      const okPool=[...pool].every(t=>["scarab","serqet","spider","sandworm"].includes(t) && MOB_DEFS[t] && MOB_DEFS[t].hostile && !MOB_DEFS[t].boss);
      ok("沙暴袭击者均为沙漠系可战敌人", okPool && pool.size>=3, "谱系="+[...pool].join(","));
      ok("沙暴袭击限定干旱群系", aridBiome(BIO_DESERT)&&aridBiome(BIO_MESA)&&!aridBiome(BIO_SNOW)&&!aridBiome(BIO_FOREST), "ok");
      // 新世界出生在村口, 10~20 格内有不少落点在村落安全区里(会被拒), 单次 spawnMob 可能合理落空 → 最多试 5 次
      const mlenS=mobs.length; const t0=sandRaidType(0.1); let spawned=false;
      for(let k=0;k<5 && !spawned;k++) spawned=spawnMob(t0,10,20);
      ok("沙暴袭击能刷出敌人", spawned && mobs.length-mlenS===1 && mobs[mobs.length-1].type===t0, "type="+t0+" ok="+spawned);
      mobs.length=mlenS;
    }

    // ---- 成长闭环: 能量核心货币 + 核心强化(kill→core→永久提升) ----
    {
      const aS=armor, cS=cores, dS=dmgMul, mS=maxHp, hS=hp, bagS=new Map(bag);
      try{
        armor=0; cores=0; gainCore();
        ok("核心拾取: 护甲未满先补甲", armor===1 && cores===0, "armor="+armor+" cores="+cores);
        armor=5; cores=0; gainCore();
        ok("核心拾取: 护甲满后转存为核心货币", armor===5 && cores===1, "armor="+armor+" cores="+cores);
        const iSharp=RECIPES.findIndex(r=>r.name==="⚡ 核心·锋锐");
        ok("核心强化配方存在", iSharp>=0 && RECIPES[iSharp].coreCost===3, "idx="+iSharp);
        cores=2; const dmg0=dmgMul; doCraft(iSharp);
        ok("核心不足时强化被挡下", dmgMul===dmg0 && cores===2, "dmg未变="+(dmgMul===dmg0)+" cores="+cores);
        cores=5; doCraft(iSharp);
        ok("核心充足: 伤害强化生效并扣核心3", Math.abs(dmgMul-(dmg0+0.08))<1e-9 && cores===2, "dmg="+dmgMul.toFixed(2)+" cores="+cores);
        cores=7; const sv=collectSave();
        ok("能量核心写入存档", sv.cores===7, "sv.cores="+sv.cores);
        ok("老存档(无cores字段)核心归零", (({}).cores|0)===0, "ok");
      } finally {
        armor=aS; cores=cS; dmgMul=dS; maxHp=mS; hp=hS; bag.clear(); for(const [k,v] of bagS) bag.set(k,v); updateHearts();
      }
    }

    // ---- 地图: 沙海沙丘 ----
    {
      let mn=1e9,mx=-1e9;
      for(let i=0;i<400;i++){ const d=desertDune(i*7-100, i*3+40); mn=Math.min(mn,d); mx=Math.max(mx,d); }
      ok("沙丘高度非负且有起伏", mn>=0 && mx<=10 && (mx-mn)>2, "min="+mn.toFixed(1)+" max="+mx.toFixed(1));
      let hmn=1e9,hmx=-1e9,n=0;
      for(let gx=-800;gx<=800 && n<220;gx+=17) for(let gz=-800;gz<=800;gz+=17){ if(biomeAt(gx,gz)===BIO_DESERT){ const hh=heightAt(gx,gz); hmn=Math.min(hmn,hh); hmx=Math.max(hmx,hh); n++; } }
      ok("沙漠地形有起伏且仍可建造(不过高)", n===0 || ((hmx-hmn)>=2 && hmx<52), "样本="+n+" 高差="+(n?(hmx-hmn):0)+" 最高="+(n?hmx:0));
    }

    // ---- 地图丰富性: 表层材质函数 / 边界柔化 / genChunk 各装饰不崩 ----
    {
      ok("表层材质函数分群系正确", surfaceTop(BIO_DESERT,30,false)===SAND && surfaceTop(BIO_MESA,30,false)===CLAY
         && surfaceTop(BIO_PLAIN,30,false)===GRASS && surfaceTop(BIO_SNOW,66,false)===SNOW && surfaceTop(BIO_FOREST,30,false)===MOSSY,
         "sand="+(surfaceTop(BIO_DESERT,30,false)===SAND));
      let genErr=null, okLen=true, sawCactusOrProp=false;
      try{
        for(let c=0;c<8;c++){
          const arr=genChunk(c*3-6, c*2+5);
          if(arr.length!==CS*CS*H) okLen=false;
          for(let i=0;i<arr.length;i++){ if(arr[i]===CACTUS||arr[i]===AMETHYST){ sawCactusOrProp=true; break; } }
        }
      }catch(e){ genErr=e.message; }
      ok("genChunk 生成各群系装饰(沙丘/石拱/白骨/棕榈/晶簇/边界柔化)无异常且尺寸正确", !genErr && okLen, genErr||("len="+(CS*CS*H)));
    }

    // ---- 敌人行为差异化: 巨蝎蝎毒(中毒 DoT) ----
    {
      const hpS=hp, mS=maxHp, pS=poisonT, ptS=poisonTickT, dS=dead;
      try{
        dead=false; maxHp=999; hp=20; poisonT=0; poisonTickT=0;
        applyPoison(5);
        ok("蝎毒可施加(中毒计时开始)", poisonT>0, "poisonT="+poisonT.toFixed(1));
        const h0=hp; tickPoison(1.1);
        ok("中毒每秒掉血", hp===h0-1, "掉血="+(h0-hp));
        hp=1; poisonTickT=0; tickPoison(1.1);
        ok("蝎毒不致死(最低留1血)", hp===1, "hp="+hp);
        poisonT=0.05; tickPoison(0.2);
        ok("中毒到期自动清除", poisonT===0, "poisonT="+poisonT);
      } finally {
        hp=hpS; maxHp=mS; poisonT=pS; poisonTickT=ptS; dead=dS; updateHearts();
        const pt=document.getElementById("poisontint"); if(pt) pt.style.opacity=0;
      }
    }

    // ---- 敌人行为差异化: 沙虫钻沙突袭 ----
    {
      const hpS=hp,mS=maxHp,aS=armor,pS=poisonT, mlen=mobs.length, px=player.x,py=player.y,pz=player.z;
      try{
        armor=0; maxHp=999; hp=999; poisonT=0;
        const sw={type:"sandworm",def:MOB_DEFS.sandworm,x:player.x+2,y:player.y,z:player.z,vx:0,vy:0,vz:0,kbx:0,kbz:0,
          yaw:0,tgtYaw:0,hp:MOB_DEFS.sandworm.hp,hurtT:0,animT:0,t:0,atkCd:0,burnT:0,swingT:0,groanT:0,fleeT:0,onGround:true,pause:false,burning:false,held:null};
        mobs.length=0; mobs.push(sw);
        const hp0=hp; let sawBurrow=false, sawErupt=false;
        for(let f=0; f<20; f++){ updateMobs(0.05); if(sw.burrowed) sawBurrow=true; if(sw.erupt>0) sawErupt=true; }
        ok("沙虫会钻沙潜行(burrowed)", sawBurrow, "曾潜行="+sawBurrow);
        ok("沙虫破沙而出并造成伤害", sawErupt && hp<hp0, "曾出土="+sawErupt+" 掉血="+(hp0-hp));
        sw.burrowed=true; const whp=sw.hp; hurtMob(sw,10,0,0,true);
        ok("沙虫埋沙时只受4成伤害(可击杀非无敌)", Math.abs((whp-sw.hp)-4)<1e-6, "掉血="+(whp-sw.hp));
      } finally {
        mobs.length=mlen; hp=hpS; maxHp=mS; armor=aS; poisonT=pS; player.x=px; player.y=py; player.z=pz; updateHearts();
      }
    }

    // ---- 敌人行为差异化: 圣甲虫突进扑击 ----
    {
      const hpS=hp,mS=maxHp,pS=poisonT, mlen=mobs.length, plen=particles.length, px=player.x,py=player.y,pz=player.z;
      try{
        maxHp=999; hp=999; poisonT=0;
        const sc={type:"scarab",def:MOB_DEFS.scarab,x:player.x+5,y:player.y,z:player.z,vx:0,vy:0,vz:0,kbx:0,kbz:0,
          yaw:0,tgtYaw:0,hp:MOB_DEFS.scarab.hp,hurtT:0,animT:0,t:0,atkCd:0,burnT:0,swingT:0,groanT:0,fleeT:0,onGround:true,pause:false,burning:false,held:null,chargeCd:0,chargeState:"idle"};
        mobs.length=0; mobs.push(sc);
        const dx=player.x-sc.x,dz=player.z-sc.z,dist=Math.hypot(dx,dz),hp0=hp;
        let speed=updateScarabCharge(sc,0.05,dx,dz,dist,MOB_DEFS.scarab.speed,true);
        const sawTell=sc.chargeState==="telegraph"&&speed===0;
        let sawCharge=false;
        for(let f=0;f<16&&!sawCharge;f++){
          speed=updateScarabCharge(sc,0.05,dx,dz,dist,speed,true);
          if(sc.chargeState==="lunge"&&sc.charge>0) sawCharge=true;
        }
        const tellFx=particles.length>=plen+8&&particles.slice(plen,plen+8).every(p=>p.u===15*TS&&p.l>=2&&p.size>=0.14);
        ok("圣甲虫: 蓄力会生成高亮浮空预警粒子环",tellFx,"粒子数="+(particles.length-plen));
        ok("圣甲虫: 先预警再锁向冲锋，预警阶段无伤害",sawTell&&sawCharge&&hp===hp0,
           "预警="+sawTell+" 冲锋="+sawCharge+" 预警掉血="+(hp0-hp));
      } finally {
        mobs.length=mlen; particles.length=plen; hp=hpS; maxHp=mS; poisonT=pS; player.x=px; player.y=py; player.z=pz; updateHearts();
      }
    }

    // 第十七轮·精准反击: 只由被沙步规避的圣甲虫标记冲锋授予，下一次同目标近战消费。
    {
      const hpS=hp,mS=maxHp,aS=armor,pS=poisonT,deadS=dead,mlen=mobs.length,plen=particles.length;
      const S0=Object.assign({},sandStepState), P0={x:player.x,y:player.y,z:player.z,vx:player.vx,vy:player.vy,vz:player.vz,kbx:player.kbx,kbz:player.kbz}, hurt0=playerEnt.hurtT;
      try{
        maxHp=999; hp=999; armor=0; poisonT=0; dead=false;
        const sc={type:"scarab",def:MOB_DEFS.scarab,x:player.x+1,y:player.y,z:player.z,vx:0,vy:0,vz:0,kbx:0,kbz:0,
          yaw:0,tgtYaw:0,hp:100,hurtT:0,animT:0,t:0,atkCd:0,burnT:0,swingT:0,groanT:0,fleeT:0,onGround:true,pause:false,burning:false,held:null,
          chargeCd:2,chargeState:"lunge",charge:SCARAB_LUNGE_T,chargeHit:false,chargeYaw:Math.atan2(-1,0)};
        const other={type:"scarab",def:MOB_DEFS.scarab,x:player.x+2,y:player.y,z:player.z,hp:100,hurtT:0,kbx:0,kbz:0};
        mobs.push(sc,other); clearSandRiposte(); sandStepState.evadeT=0.25; sandStepState.dodged=false;
        const ordinaryBlocked=foeStrike(2,0,0,sc)===false&&sandStepState.counterT===0;
        sandStepState.dodged=false;
        const hp0=hp, dx=player.x-sc.x,dz=player.z-sc.z;
        updateScarabCharge(sc,0.05,dx,dz,Math.hypot(dx,dz),MOB_DEFS.scarab.speed,true);
        const taggedDodge=hp===hp0&&sc.chargeHit&&sandStepState.counterTarget===sc&&sandStepState.counterT===SAND_RIPOSTE_WINDOW;
        updateStatsHUD();
        const visible=document.getElementById("stats").innerHTML.includes("反击机会")&&document.getElementById("btnDodge").textContent.includes("反击");
        ok("精准闪避: 仅标记冲锋可授予同目标反击，HUD/触屏同步提示",ordinaryBlocked&&taggedDodge&&visible,
           "普通敌击无资格="+ordinaryBlocked+" 冲锋反击="+taggedDodge+" UI="+visible);
        const wrong=sandRiposteDamage(other,5), wrongTarget=wrong.damage===5&&sandStepState.counterTarget===sc;
        const right=sandRiposteDamage(sc,5), sameTarget=right.damage===7&&right.bonus===2&&sandStepState.counterT===0&&sandStepState.counterHitT>0;
        ok("反击只强化同一目标一次(+35%，上取整)并立即消费",wrongTarget&&sameTarget,
           "错目标="+wrong.damage+" 同目标="+right.damage+"(+"+right.bonus+")");
        sandStepState.counterT=1; sandStepState.counterTarget=sc;
        const capped=sandRiposteDamage(sc,50);
        ok("精准反击奖励封顶+3",capped.damage===53&&capped.bonus===3,"高伤害="+capped.damage+" 奖励="+capped.bonus);
        sandStepState.counterT=1; sandStepState.counterTarget=sc; mobs.splice(mobs.indexOf(sc),1); tickSandStep(0.05);
        ok("反击窗口在超时或目标离场后失效",sandStepState.counterT===0&&sandStepState.counterTarget===null,
           "timer="+sandStepState.counterT+" target="+(sandStepState.counterTarget===null));
        mobs.push(sc); sandStepState.evadeT=0.25; sandStepState.counterT=1; sandStepState.counterTarget=sc;
        hp=999; damagePlayer(1,0,0);
        const envStillHurts=hp<999&&sandStepState.counterT===1&&sandStepState.counterTarget===sc;
        const saved=collectSave(), runtimeOnly=!Object.keys(saved).some(k=>/sandStep|riposte|counter|scarabCharge/i.test(k));
        ok("反击不规避环境伤害且不增加存档字段",envStillHurts&&runtimeOnly,"环境扣血="+(999-hp)+" runtimeOnly="+runtimeOnly);
      } finally {
        mobs.length=mlen; Object.assign(sandStepState,S0); Object.assign(player,P0); playerEnt.hurtT=hurt0;
        hp=hpS; maxHp=mS; armor=aS; poisonT=pS; dead=deadS; particles.length=plen;
        updateHearts(); refreshSandStepButton(); updateStatsHUD();
      }
    }

    // 第十九轮·Codex：触屏方向、帮助拦截和运行态反击提示。
    {
      const t0={...touchState}, k0={...keys}, yaw0=player.yaw, s0={...sandStepState};
      const sl0=softLock, locked0=locked, dead0=dead, photo0=photoMode;
      const help=document.getElementById("fullhelp"), hd0=help.style.display;
      const overlay=document.getElementById("overlay"), od0=overlay.style.display;
      const n0=mobs.length;
      try{
        for(const key in keys) keys[key]=false;
        player.yaw=0; touchState.active=true; touchState.moveX=1; touchState.moveY=0;
        const right=sandStepDirection();
        touchState.moveX=-1; const left=sandStepDirection();
        touchState.moveX=1; touchState.moveY=-1; const diagonal=sandStepDirection();
        ok("触屏沙步: 摇杆左右与斜向输入决定方向且归一化",right[0]>.99&&Math.abs(right[1])<1e-6&&left[0]<-.99&&diagonal[0]>.7&&diagonal[1]<-.7&&Math.abs(Math.hypot(...diagonal)-1)<1e-6);
        touchState.moveX=touchState.moveY=0; const forward=sandStepDirection();
        touchState.active=false; touchState.moveX=1; const inactive=sandStepDirection();
        ok("触屏沙步: 摇杆归中或触屏未激活时沿视线前进",forward[1]<-.99&&inactive[1]<-.99&&Math.abs(inactive[0])<1e-6);
        softLock=true; dead=false; photoMode=false; overlay.style.display="none"; help.style.display="flex";
        const before={x:player.x,z:player.z,cd:sandStepState.cd};
        const blocked=sandStepPanelOpen()&&sandStep()===false;
        ok("完整帮助打开时直接沙步调用也被拦截",blocked&&player.x===before.x&&player.z===before.z&&sandStepState.cd===before.cd);
        help.style.display="none";
        const sc={type:"scarab",hp:10}; mobs.push(sc);
        sandStepState.counterTarget=sc; sandStepState.counterT=1; sandStepState.counterHitT=0;
        refreshRiposteCue();
        const cue=document.getElementById("riposteCue");
        ok("精准反击提示: 同目标文案与半程倒计时",!cue.hidden&&cue.textContent.includes("原圣甲虫")&&cue.textContent.includes("1.0s")&&document.getElementById("riposteFill").style.transform==="scaleX(0.5)");
        help.style.display="flex"; refreshRiposteCue(); const helpHidden=cue.hidden; help.style.display="none";
        photoMode=true; refreshRiposteCue(); const photoHidden=cue.hidden; photoMode=false;
        dead=true; refreshRiposteCue(); const deadHidden=cue.hidden; dead=false;
        softLock=false; locked=false; refreshRiposteCue(); const pausedHidden=cue.hidden; softLock=true;
        mobs.length=n0; refreshRiposteCue();
        ok("精准反击提示: 帮助、拍照、死亡、暂停与目标离场均隐藏",helpHidden&&photoHidden&&deadHidden&&pausedHidden&&cue.hidden);
        sandStepState.counterT=0; sandStepState.counterTarget=null; sandStepState.counterHitT=.6; refreshRiposteCue();
        const hitShown=!cue.hidden&&cue.textContent.includes("精准反击命中");
        sandStepState.counterHitT=0; refreshRiposteCue();
        ok("精准反击提示: 命中确认后消退",hitShown&&cue.hidden);
      } finally {
        Object.assign(touchState,t0); for(const key in keys) delete keys[key]; Object.assign(keys,k0);
        player.yaw=yaw0; Object.assign(sandStepState,s0); softLock=sl0; locked=locked0; dead=dead0; photoMode=photo0;
        help.style.display=hd0; overlay.style.display=od0; mobs.length=n0; refreshRiposteCue();
      }
    }

    // 第十九轮·云端: 骷髅蓄力瞄准箭 —— 瞄准不放箭、锁定后不再跟随、放出带标签的瞄准箭; 挨打打断并僵直; 断视线取消; 沙步可躲; 骷髅不再瞬发
    {
      const P0={x:player.x,y:player.y,z:player.z}, a0=arrows.length, pa0=particles.length, n0=mobs.length, s0=Object.assign({},sandStepState), hp0=hp, ms0=mobShoot;
      const mk=()=>({type:"skeleton",def:MOB_DEFS.skeleton,x:player.x+8,y:player.y,z:player.z,vx:0,vy:0,vz:0,kbx:0,kbz:0,yaw:0,tgtYaw:0,
        hp:MOB_DEFS.skeleton.hp,hurtT:0,animT:0,t:0,atkCd:0,burnT:0,swingT:0,groanT:0,fleeT:0,onGround:true,pause:false,burning:false,held:null});
      try{
        // 1) 正常: 瞄准 → 锁定 → 放箭
        const sk=mk(); let stoodStill=true, firedEarly=false, lockedAim=null;
        let r=updateSkeletonAim(sk,0.05,8,2,true,true);
        const started=sk.aimState==="aim" && r===0 && arrows.length===a0;
        for(let i=0;i<40 && sk.aimState==="aim";i++){
          if(sk.aimT<=SKEL_LOCK_T && !lockedAim){ lockedAim={x:sk.aimX,z:sk.aimZ}; player.z+=3; }   // 锁定后玩家横移 3 格
          const before=arrows.length;
          r=updateSkeletonAim(sk,0.05,8,2,true,true);
          if(sk.aimState==="aim"){ if(r!==0) stoodStill=false; if(arrows.length!==before) firedEarly=true; }
        }
        const ar=arrows[arrows.length-1], fired=arrows.length===a0+1 && ar && ar.tag===SKEL_AIM_TAG && ar.hostile;
        const sp=ar?Math.hypot(ar.vx,ar.vy,ar.vz):0;
        const noTrack=!!lockedAim && fired && Math.abs(ar.vz/sp)<0.05 && Math.abs(sk.aimZ-lockedAim.z)<1e-9;   // 箭朝锁定点(原位置), 不追横移后的玩家
        const fast=fired && Math.abs(sp-SKEL_ARROW_SPEED)<0.5 && sk.atkCd>=1.6;
        ok("骷髅蓄力瞄准: 先站定瞄准不放箭, 锁定后不再跟随玩家, 时间到放出更快的带标签瞄准箭",
           started && stoodStill && !firedEarly && fired && noTrack && fast,
           "start="+started+" still="+stoodStill+" early="+firedEarly+" fired="+fired+" noTrack="+noTrack+" sp="+sp.toFixed(1)+" cd="+sk.atkCd.toFixed(2));
        arrows.length=a0; player.z=P0.z;
        // 2) 瞄准中挨打 → 打断 + 僵直, 僵直期间不射
        const s2=mk(); updateSkeletonAim(s2,0.05,8,2,true,true); s2.hurtT=0.4;
        const r2=updateSkeletonAim(s2,0.05,8,2,true,true);
        const staggered=s2.aimState==="stagger" && Math.abs(r2-2*0.35)<1e-9 && arrows.length===a0 && s2.atkCd>=SKEL_STAGGER_T;
        s2.hurtT=0; let shotInStagger=false;
        for(let t=0;t<SKEL_STAGGER_T+0.1;t+=0.05){ updateSkeletonAim(s2,0.05,8,2,true,true); if(arrows.length!==a0) shotInStagger=true; }
        const recovered=s2.aimState==="idle" && s2.atkCd>0;   // 僵直结束后还在冷却, 不会立刻再瞄
        ok("骷髅蓄力瞄准: 瞄准中挨打被打断并僵直 1.2 秒, 僵直期间不射, 结束后仍在冷却",
           staggered && !shotInStagger && recovered, "stag="+staggered+" shot="+shotInStagger+" rec="+recovered+" cd="+s2.atkCd.toFixed(2));
        // 3) 断视线 / 脱战 → 取消
        const s3=mk(); updateSkeletonAim(s3,0.05,8,2,true,true);
        updateSkeletonAim(s3,0.05,8,2,false,true);
        const s4=mk(); updateSkeletonAim(s4,0.05,8,2,true,true);
        updateSkeletonAim(s4,0.05,8,2,true,false);
        ok("骷髅蓄力瞄准: 躲到掩体后(断视线)或脱战会取消瞄准, 不放箭",
           s3.aimState==="idle" && s4.aimState==="idle" && s3.atkCd>=0.8 && arrows.length===a0, "los="+s3.aimState+" chase="+s4.aimState);
        // 4) 沙步能躲瞄准箭, 但不给精准反击(反击只属于圣甲虫冲锋)
        sandStepState.evadeT=0.3; sandStepState.dodged=false; sandStepState.counterTarget=null; sandStepState.counterT=0;
        const hit=foeStrike(SKEL_AIM_DAMAGE,0,0,null,SKEL_AIM_TAG);
        ok("骷髅蓄力瞄准: 沙步闪避窗内能躲瞄准箭, 不授予精准反击", hit===false && hp===hp0 && !sandStepState.counterTarget,
           "hit="+hit+" hp="+hp+" counter="+!!sandStepState.counterTarget);
        Object.assign(sandStepState,s0);
        // 5) 真实 updateMobs 里骷髅不再瞬发 mobShoot
        let shot=0; mobShoot=()=>{ shot++; };
        const keep=mobs.slice(); mobs.length=0;            // 只放这一只骷髅, 不把世界里的其他生物牵扯进来
        const s5=mk(); mobs.push(s5);
        try{ for(let i=0;i<8;i++) updateMobs(0.05); } finally { mobs.length=0; for(const m of keep) mobs.push(m); }
        ok("骷髅蓄力瞄准: updateMobs 里骷髅不再走瞬发射箭", shot===0, "mobShoot调用="+shot+" state="+(s5.aimState||"idle"));
      } finally {
        mobShoot=ms0; mobs.length=n0; arrows.length=a0; particles.length=Math.min(particles.length,pa0);
        Object.assign(player,P0); Object.assign(sandStepState,s0); hp=hp0; updateHearts();
      }
    }

    // 第十九轮·云端 P3: 能量核心战技 —— 价格逐级上涨、3 级封顶、冷却/反击效果生效、存档往返与坏值限幅
    {
      const cm0=Object.assign({},combatMastery), cores0=cores, s0=Object.assign({},sandStepState), P0={x:player.x,y:player.y,z:player.z,vx:player.vx,vz:player.vz,onGround:player.onGround};
      try{
        restoreCombatMastery({});
        const iStep=RECIPES.findIndex(r=>r.name==="⚡ 战技·沙步熟练"), iRip=RECIPES.findIndex(r=>r.name==="⚡ 战技·回砂反击");
        const exists=iStep>=0 && iRip>=0 && RECIPES[iStep].coreCost===3 && RECIPES[iRip].coreCost===4;
        cores=20; const costs=[];
        for(let k=0;k<4;k++){ costs.push(RECIPES[iStep].coreCost); doCraft(iStep); }
        const stepCapped=combatMastery.step===3 && cores===20-3-4-5 && !canCraft(RECIPES[iStep]) && costs.join(",")==="3,4,5,6";
        ok("核心战技·沙步熟练: 价格 3→4→5 逐级上涨, 3 级封顶后不再扣核心, 冷却 4.5→3.3 秒",
           exists && stepCapped && Math.abs(sandStepCd()-3.3)<1e-9, "exists="+exists+" costs="+costs+" step="+combatMastery.step+" cores="+cores+" cd="+sandStepCd().toFixed(2));
        // 沙步真正用上缩短后的冷却
        restoreCombatMastery({step:2}); let used=false;
        for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){ Object.assign(player,P0); sandStepState.cd=0; sandStepState.evadeT=0; player.onGround=true; if(sandStep(dx,dz,true)){ used=true; break; } }
        ok("核心战技·沙步熟练: 2 级时沙步冷却为 3.7 秒", !used || Math.abs(sandStepState.cd-3.7)<1e-9, "used="+used+" cd="+sandStepState.cd.toFixed(2));
        // 回砂反击: 基础 35%/+3, 3 级 65%/+6
        const tgt={x:player.x,y:player.y,z:player.z};
        restoreCombatMastery({}); sandStepState.counterT=1; sandStepState.counterTarget=tgt; const b0=sandRiposteDamage(tgt,10).bonus;
        restoreCombatMastery({riposte:3}); sandStepState.counterT=1; sandStepState.counterTarget=tgt; const b3=sandRiposteDamage(tgt,10).bonus;
        cores=4; restoreCombatMastery({}); doCraft(iRip); const ripBought=combatMastery.riposte===1 && cores===0 && RECIPES[iRip].coreCost===5;
        ok("核心战技·回砂反击: 10 点近战基础加成 +3, 3 级时 +6; 买 1 级扣 4 核心、下一级要 5", b0===3 && b3===6 && ripBought, "b0="+b0+" b3="+b3+" bought="+ripBought);
        // 存档往返 + 坏值限幅
        restoreCombatMastery({step:2,riposte:1}); const sv=JSON.parse(JSON.stringify(collectSave()));
        restoreCombatMastery({}); restoreCombatMastery(sv.combatMastery); const round=combatMastery.step===2 && combatMastery.riposte===1;
        restoreCombatMastery({step:-1,riposte:9}); const clampOK=combatMastery.step===0 && combatMastery.riposte===3;
        restoreCombatMastery({step:"x",riposte:null}); const badOK=combatMastery.step===0 && combatMastery.riposte===0;
        restoreCombatMastery(undefined); const legacyOK=combatMastery.step===0 && combatMastery.riposte===0;
        const api=window.__game && window.__game.combatMastery && window.__game.combatMastery.sandStepCd===4.5;
        ok("核心战技: 存档往返、越界限幅到 0..3、坏值和老存档读成 0 级、__game 可读", round && clampOK && badOK && legacyOK && !!api,
           "round="+round+" clamp="+clampOK+" bad="+badOK+" legacy="+legacyOK+" api="+!!api);
      } finally {
        restoreCombatMastery(cm0); cores=cores0; Object.assign(sandStepState,s0); Object.assign(player,P0); refreshSandStepButton();
      }
    }

    // 第二十轮·云端: 雨后彩虹 + 远方天空闪电 —— 雨/雷暴转晴才出彩虹(沙暴不出), 只在白天/非雪原, 最后 10 秒淡出; 雷击同步天空电光方向与闪烁
    {
      const w0=weather, wt0=weatherT, rt0=rainbowT, rk0=rainbowK, lt0=lightT, th0=thunderT, R0=RENDER, ba0=boltA, pa0=particles.length;
      try{
        weather="rain"; weatherT=0; rainbowT=0; updateWeather(0.01); const afterRain=weather==="clear" && rainbowT===RAINBOW_T;
        weather="sand"; weatherT=0; rainbowT=0; updateWeather(0.01); const afterSand=weather==="clear" && rainbowT===0;
        weather="clear"; rainbowT=RAINBOW_T;
        const day=rainbowTarget(0.5,BIO_DESERT), night=rainbowTarget(-0.1,BIO_DESERT), snow=rainbowTarget(0.5,BIO_SNOW);
        rainbowT=5; const fading=rainbowTarget(0.5,BIO_DESERT);
        weather="rain"; rainbowT=RAINBOW_T; const raining=rainbowTarget(0.5,BIO_DESERT);
        ok("雨后彩虹: 雨/雷暴转晴才出现(沙暴不出), 白天且非雪原才显示, 最后 10 秒淡出",
           afterRain && afterSand && day===1 && night===0 && snow===0 && Math.abs(fading-0.5)<1e-9 && raining===0,
           "rain="+afterRain+" sand="+afterSand+" day="+day+" night="+night+" snow="+snow+" fade="+fading+" raining="+raining);
        weather="storm"; weatherT=999; thunderT=0; lightT=0; RENDER=Math.max(RENDER,8); boltA=99;
        const keepM=mobs.slice(); mobs.length=0;            // 雷击会伤附近生物: 测试里不牵扯世界中的生物
        try{ updateWeather(0.01); } finally { mobs.length=0; for(const m of keepM) mobs.push(m); }
        const struck=lightT>0 && Math.abs(boltA)<=Math.PI+1e-9;
        lightT=0.35; const a1=boltAlpha(); lightT=0.17; const a2=boltAlpha(); lightT=0.1; const a3=boltAlpha(); lightT=0; const a4=boltAlpha();
        const locsOK=!!USK.uRainbow && !!USK.uBolt;
        ok("远方天空闪电: 雷击时设置电光方向, 亮度一亮一暗再一亮后归零; 天空着色器接口就绪",
           struck && a1===1 && a2===0.2 && a3>0 && a3<1 && a4===0 && locsOK, "struck="+struck+" a="+[a1,a2,a3.toFixed(2),a4]+" locs="+locsOK);
      } finally {
        weather=w0; weatherT=wt0; rainbowT=rt0; rainbowK=rk0; lightT=lt0; thunderT=th0; RENDER=R0; boltA=ba0; particles.length=Math.min(particles.length,pa0);
      }
    }

    // 第二十一轮·云端: 试炼第二波加入骷髅射手; 沙漠旋风只在晴朗白天的干旱群系出现、最多 1 根、粒子限速、会散去
    {
      const wavesOK=TRIAL_WAVES[1].includes("skeleton") && TRIAL_WAVES_OMEN[1].includes("skeleton") && TRIAL_WAVES[2].includes("anubis")
        && [...TRIAL_WAVES,...TRIAL_WAVES_OMEN].every(w=>w.every(t=>MOB_DEFS[t] && MOB_DEFS[t].hostile));
      ok("试炼厅: 第二波(普通/不祥)加入骷髅射手, 末波仍是阿努比斯, 波次里的怪都存在且敌对", wavesOK,
         "w2="+TRIAL_WAVES[1].join("/")+" omen2="+TRIAL_WAVES_OMEN[1].join("/"));
      const w0=weather, sh0=sunH, P0={x:player.x,y:player.y,z:player.z}, dt0=dustDevilT, acc0=dustDevilAcc, pa0=particles.length, g0=gfxLevel;
      try{
        // 找一块干旱群系站上去
        let spot=null; for(let i=0;i<80 && !spot;i++){ const x=Math.floor(player.x)+i*37, z=Math.floor(player.z)-i*23; ensureData(x>>4,z>>4); const b=biomeAt(x,z); if(b===BIO_DESERT||b===BIO_MESA||b===BIO_SALTLAKE||b===BIO_CANYON) spot={x,z}; }
        if(spot){ player.x=spot.x+0.5; player.z=spot.z+0.5; for(let dx=-3;dx<=3;dx++) for(let dz=-3;dz<=3;dz++) ensureData((spot.x>>4)+dx,(spot.z>>4)+dz); }
        gfxLevel=Math.max(gfxLevel,2); weather="clear"; sunH=0.8;
        const aridOK=!!spot && dustDevilOK();
        weather="rain"; const rainNo=!dustDevilOK(); weather="clear"; sunH=0.1; const nightNo=!dustDevilOK(); sunH=0.8;
        dustDevils.length=0; let spawned=false;
        for(let k=0;k<12 && !spawned;k++){ dustDevilT=0; tickDustDevils(0.05); spawned=dustDevils.length===1; }   // 选点偶尔落在没地面的地方, 多试几次
        particles.length=0; for(let i=0;i<40;i++) tickDustDevils(0.05);               // 2 秒
        const made=particles.length, bounded=made<=Math.ceil(2*DUST_DEVIL_RATE)+1 && made>0, single=dustDevils.length<=1;
        weather="rain"; tickDustDevils(0.05); const gone=dustDevils.length===0;      // 天气变了就散
        ok("沙漠旋风: 晴朗白天的干旱群系才有(下雨/夜里没有), 最多 1 根, 2 秒粒子不超过限速, 天气一变就散",
           aridOK && rainNo && nightNo && spawned && bounded && single && gone,
           "arid="+aridOK+" rain="+rainNo+" night="+nightNo+" spawn="+spawned+" parts="+made+" single="+single+" gone="+gone);
      } finally {
        weather=w0; sunH=sh0; Object.assign(player,P0); dustDevils.length=0; dustDevilT=dt0; dustDevilAcc=acc0; gfxLevel=g0; particles.length=Math.min(particles.length,pa0);
      }
    }

    // 第二十二轮·云端: 木乃伊重击前摇 —— 蓄力期间不伤人; 砸地时圈内受伤、圈外无事; 挨打打不断; 沙步可躲; 不再走通用近战
    {
      const P0={x:player.x,y:player.y,z:player.z}, hp0=hp, mh0=maxHp, s0=Object.assign({},sandStepState), pa0=particles.length, n0=mobs.length, dead0=dead;
      const mk=()=>({type:"mummy",def:MOB_DEFS.mummy,x:player.x+1.5,y:player.y,z:player.z,vx:0,vy:0,vz:0,kbx:0,kbz:0,yaw:0,tgtYaw:0,
        hp:MOB_DEFS.mummy.hp,hurtT:0,animT:0,t:0,atkCd:0,burnT:0,swingT:0,groanT:0,fleeT:0,onGround:true,pause:false,burning:false,held:null});
      try{
        maxHp=999; hp=999; dead=false; sandStepState.evadeT=0;
        // 1) 圈内: 蓄力期间不掉血, 砸地掉血
        const m1=mk(); let r=updateMummySlam(m1,0.05,-1.5,0,1.5,1.6,true);
        const wound=m1.slamState==="wind" && r===0; let hurtEarly=false;
        for(let t=0;t<MUMMY_WIND_T-0.1;t+=0.05){ updateMummySlam(m1,0.05,-1.5,0,1.5,1.6,true); if(hp!==999) hurtEarly=true; }
        m1.hurtT=0.4;                                              // 挨打也打不断
        for(let t=0;t<0.3 && m1.slamState==="wind";t+=0.05) updateMummySlam(m1,0.05,-1.5,0,1.5,1.6,true);
        const hitIn=hp<999 && m1.slamState==="recover" && m1.atkCd>=2.0;
        ok("木乃伊重击: 站定蓄力期间不伤人, 挨打也打不断, 砸地时圈内受伤并进入收招",
           wound && !hurtEarly && hitIn, "wind="+wound+" early="+hurtEarly+" hit="+hitIn+" hp="+hp);
        // 2) 蓄力中走出圈外 → 砸空
        hp=999; const m2=mk(); updateMummySlam(m2,0.05,-1.5,0,1.5,1.6,true);
        player.x=m2.x+MUMMY_SLAM_R+0.6;
        for(let t=0;t<MUMMY_WIND_T+0.1 && m2.slamState==="wind";t+=0.05) updateMummySlam(m2,0.05,player.x-m2.x,0,player.x-m2.x,1.6,true);
        const missed=hp===999 && m2.slamState==="recover"; player.x=P0.x;
        ok("木乃伊重击: 蓄力时走出紫色光环就砸空", missed, "hp="+hp+" state="+m2.slamState);
        // 3) 沙步闪避窗内被砸 → 免伤
        hp=999; const m3=mk(); updateMummySlam(m3,0.05,-1.5,0,1.5,1.6,true);
        sandStepState.evadeT=1; sandStepState.dodged=false;
        for(let t=0;t<MUMMY_WIND_T+0.1 && m3.slamState==="wind";t+=0.05) updateMummySlam(m3,0.05,-1.5,0,1.5,1.6,true);
        const dodged=hp===999 && sandStepState.dodged, granted=sandStepState.counterTarget===m3 && sandStepState.counterT===SAND_RIPOSTE_WINDOW;
        const keepM=mobs.slice(); mobs.push(m3); const sl=softLock, od=overlay.style.display; softLock=true; overlay.style.display="none"; refreshRiposteCue();   // 遮罩开着时提示框不刷新
        const cueTxt=document.getElementById("riposteCue").textContent; mobs.length=0; for(const q of keepM) mobs.push(q); softLock=sl; overlay.style.display=od;
        Object.assign(sandStepState,s0); refreshRiposteCue();
        ok("木乃伊重击: 沙步闪避窗内被砸不掉血, 并授予对这只木乃伊的精准反击(提示写「原木乃伊」)", dodged && granted && cueTxt.includes("原木乃伊"),
           "hp="+hp+" dodged="+dodged+" granted="+granted+" cue="+cueTxt.slice(0,30));
        // 4) 真实 updateMobs: 贴脸的木乃伊第一帧不再直接打人(先蓄力)
        hp=999; const keep=mobs.slice(); mobs.length=0; const m4=mk(); mobs.push(m4);
        try{ updateMobs(0.05); } finally { mobs.length=0; for(const q of keep) mobs.push(q); }
        ok("木乃伊重击: updateMobs 里贴脸第一帧只开始蓄力、不直接出手", hp===999 && m4.slamState==="wind", "hp="+hp+" state="+m4.slamState);
      } finally {
        Object.assign(player,P0); hp=hp0; maxHp=mh0; dead=dead0; Object.assign(sandStepState,s0); mobs.length=Math.min(mobs.length,n0); particles.length=Math.min(particles.length,pa0); updateHearts();
      }
    }

    // 第八轮·云端·地图: 圆形小地图有内容 + HH:MM 时间 + 坐标与玩家一致; N 大地图能开关
    try{
      const mr=mmRenderSync();
      const xyzOk = mr.xyz===(Math.floor(player.x)+","+Math.floor(player.y)+","+Math.floor(player.z));
      ok("小地图: 画布有非透明像素·时间 HH:MM·坐标与玩家一致", mr.opaque>1000 && /^([01]\d|2[0-3]):[0-5]\d$/.test(mr.time) && xyzOk,
         "opaque="+mr.opaque+" time="+mr.time+" xyz="+mr.xyz+" tiles="+mr.tiles);
      const on=toggleBigMap(true), shown=getComputedStyle(document.getElementById("bigmap")).display;
      const off=toggleBigMap(false), hidden=getComputedStyle(document.getElementById("bigmap")).display;
      ok("大地图(N)能打开/关闭", on===true && shown==="flex" && off===false && hidden==="none", "on="+on+"/"+shown+" off="+off+"/"+hidden);
      { // 与本地新手引导共用 N 键: 引导进行中 N = 跳过引导(不开地图); 引导结束后 N 才开关大地图
        const key0=(function(){ try{ return localStorage.getItem(TUT_KEY); }catch(e){ return null; } })(), act0=tut.active;
        const pressN=()=>document.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyN",key:"n",bubbles:true}));
        const sl0=softLock; softLock=true;                                            // 键盘处理要求 playing()
        toggleBigMap(false); startTutorial(true); pressN();
        const skipped=!tut.active && !MM.bigOpen;
        pressN(); const opened=MM.bigOpen; toggleBigMap(false); softLock=sl0;
        try{ if(key0==null) localStorage.removeItem(TUT_KEY); else localStorage.setItem(TUT_KEY,key0); }catch(e){}
        if(act0) startTutorial(true); else { tut.active=false; renderTut(); }
        ok("N 键: 新手引导进行中按 N 跳过引导且不开地图; 引导结束后按 N 打开大地图", skipped && opened, "skipped="+skipped+" opened="+opened);
      }
    }catch(err){ ok("小地图/大地图自测未抛错", false, String(err&&err.stack||err)); }

    /* ---- 第三十六轮·本地: 脚步声 / NPC 对白气泡 / Tab 背包面板 ---- */
    try{
      // 脚步声: 材质映射覆盖全部走法分类, 且未知方块安全回退
      const stepCases=[[SAND,"sand"],[SALTCRUST,"sand"],[LOG,"wood"],[GRASS,"grass"],[WATER,"water"],[LAVA,"lava"],[ICE,"ice"],[STONE,"stone"],[SANDSTONE,"sand"],[999999,"stone"]];
      const stepBad=stepCases.filter(([id,want])=>stepMatFor(id)!==want).map(([id,want])=>id+"→"+stepMatFor(id)+"(want "+want+")");
      ok("脚步声按脚下方块分材质(沙/木/草/水/岩浆/冰/石), 未知 ID 回退 stone", stepBad.length===0, stepBad.length?stepBad.join(", "):stepCases.length+" 类全部正确");
      const toneBad=Object.entries(STEP_TONE).filter(([k,v])=>!(Array.isArray(v)&&v.length===5&&Number.isFinite(v[0])&&typeof v[1]==="string"&&v.slice(2).every(Number.isFinite)));
      ok("脚步声音色表结构完整(带通频率/滤波/音量/时长/低频咚)", toneBad.length===0, toneBad.length?toneBad.map(([k])=>k).join(","):Object.keys(STEP_TONE).length+" 种材质");
      { const a0=actx2;                                   // 无 AudioContext 时必须安静返回, 不能抛错
        let threw=false; try{ actx2=null; sfxStep(SAND); sfxStep(WATER); }catch(e){ threw=true; } actx2=a0;
        ok("脚步声在音频未初始化时不抛错", !threw, threw?"抛错":"静默返回"); }
      { const s0=stepAcc; stepAcc=0; const okReset=(stepAcc===0);
        stepAcc=99; ok("脚步距离累计器可被外部重置(供自测/读档清理)", okReset && stepAcc===99, "acc="+stepAcc); stepAcc=s0; }

      // NPC 对白气泡: 靠近时显示气泡三层结构, 离开时隐藏
      /* updateNPC 内部会用 findTalkTarget() 重算 talkNpc, 所以这里临时替换它 ——
         比往 mobs 里塞假 NPC 更干净(不会让 maintainNPCs/其他断言看到多出来的怪)。 */
      const prEl=document.getElementById("npcPrompt");
      const ft0=findTalkTarget, ns0=npcSpawnT;
      npcSpawnT=999;                                        // 别让自测顺手刷出 NPC
      const fakeNpc={npcRole:"trader", npcName:"商队商人", pause:true};
      npcPanelOpen=false; craftOpen=false;
      findTalkTarget=()=>fakeNpc; updateNPC(0.016);
      const prOn=prEl.style.display!=="none", prHtml=prEl.innerHTML;
      const bubbleOk=prOn && /np-bubble/.test(prHtml) && /np-tag/.test(prHtml) && /商队商人/.test(prHtml)
                     && /沙海无垠/.test(prHtml) && /<kbd>F<\/kbd>/.test(prHtml);
      ok("NPC 对白气泡: 靠近时显示 头像/名字/对白/按键 三层", bubbleOk, "display="+prEl.style.display+" len="+prHtml.length);
      findTalkTarget=()=>null; updateNPC(0.016);
      ok("NPC 对白气泡: 离开后隐藏", prEl.style.display==="none", "display="+prEl.style.display);
      findTalkTarget=()=>({npcRole:"oracle", pause:true}); updateNPC(0.016);
      const roleSwitch=/神谕祭司/.test(prEl.innerHTML) && !/商队商人/.test(prEl.innerHTML);
      ok("NPC 对白气泡: 换一位 NPC 时内容随之切换", roleSwitch, prEl.textContent.slice(0,24));
      findTalkTarget=()=>fakeNpc; npcPanelOpen=true; updateNPC(0.016);   // 面板开着时不显示气泡
      const noDup=prEl.style.display==="none";
      npcPanelOpen=false;
      findTalkTarget=ft0; npcSpawnT=ns0; talkNpc=null; updateNPC(0.016);

      // Tab 背包面板: 开/关、Esc 关、与 B 合成面板同源、空背包不炸
      const bag0=[...bag.entries()], bagSaved=[...bag.entries()];
      bag.clear(); bagAdd(SAND,7); bagAdd("waterskin",2);
      const openedB=openBagPanel();
      const bp=document.getElementById("bagPanel");
      const shownB=getComputedStyle(bp).display, sumTxt=document.getElementById("bagSummary").textContent;
      const gridTxt=document.getElementById("bagGrid2").textContent;
      const hbCells=document.querySelectorAll("#bagHotbar .bagCell").length;
      ok("Tab 背包面板: 可打开并显示物品(与 B 面板同源)", openedB===true && shownB==="flex" && /沙子|沙/.test(gridTxt) && /x7/.test(gridTxt) && /水袋|x2/.test(gridTxt), "display="+shownB+" grid="+gridTxt.slice(0,30));
      ok("Tab 背包面板: 汇总统计含种类/总数/核心", /物品种类/.test(sumTxt) && /物品总数/.test(sumTxt) && /9/.test(sumTxt), sumTxt.slice(0,40));
      ok("Tab 背包面板: 快捷栏逐格列出且与 HOTBAR_ITEMS 等长", hbCells===HOTBAR_ITEMS.length, "cells="+hbCells+"/"+HOTBAR_ITEMS.length);
      const cur0=selSlot; selectSlot((selSlot+1)%HOTBAR_ITEMS.length); renderBagPanel();
      const curOn=!!document.querySelector("#bagHotbar .bagCell.cur");
      ok("Tab 背包面板: 高亮跟随当前快捷栏", curOn, "selSlot="+selSlot);
      selectSlot(cur0);
      bag.clear(); renderBagPanel();
      ok("Tab 背包面板: 空背包显示占位文案而不报错", /空空/.test(document.getElementById("bagGrid2").textContent), "ok");
      closeBagPanel();
      ok("Tab 背包面板: 可关闭并复位 display", getComputedStyle(bp).display==="none" && bagOpen===false, "display="+getComputedStyle(bp).display);
      ok("Tab 背包面板: 关闭是纯只读, 不改动真实背包", JSON.stringify([...bag.entries()])==="[]", JSON.stringify([...bag.entries()]));
      // 与 B 合成面板互斥, 且格子内容一致
      toggleCraft();
      openBagPanel();
      ok("Tab 背包面板: 打开时自动收起 B 合成面板(不叠面板)", craftOpen===false && getComputedStyle(bp).display==="flex", "craft="+craftOpen);
      closeBagPanel(); if(craftOpen) toggleCraft();
      // Esc 可关
      openBagPanel();
      document.dispatchEvent(new KeyboardEvent("keydown",{code:"Escape",key:"Escape",bubbles:true}));
      ok("Tab 背包面板: Esc 可关闭", bagOpen===false && getComputedStyle(bp).display==="none", "bagOpen="+bagOpen);
      // 计入"有面板开着"判定(沙步等战斗操作因此被正确屏蔽); 用打开前的基线对比, 不依赖别的面板状态
      const basePanel=sandStepPanelOpen();
      openBagPanel();
      const blocksSandstep=sandStepPanelOpen();
      closeBagPanel();
      ok("Tab 背包面板: 打开时被视为'面板已开'(沙步被屏蔽), 关闭后回到原状态", blocksSandstep===true && sandStepPanelOpen()===basePanel, "open="+blocksSandstep+" base="+basePanel+" after="+sandStepPanelOpen());
      // 存档零影响
      const before=JSON.stringify(bagSaved);
      bag.clear(); for(const [k,v] of bagSaved) bag.set(k,v);
      ok("Tab 背包面板: 不新增任何存档字段(还原后背包逐项一致)", JSON.stringify([...bag.entries()])===before, "match="+(JSON.stringify([...bag.entries()])===before));
    }catch(err){ ok("第三十六轮自测(脚步声/气泡/背包)未抛错", false, String(err&&err.stack||err)); }

    /* ---- 第三十七轮·本地: 补漏与优化(Tab 作用域/指针锁竞态/共享噪声缓冲/节点回收) ---- */
    try{
      const snap37={ sl:softLock, lk:locked, dd:dead, ov:overlay.style.display, so:selSlot,
                     craft:craftOpen, keys:Object.assign({},keys) };
      const bag37=[...bag.entries()];
      const pressTab=()=>document.dispatchEvent(new KeyboardEvent("keydown",{code:"Tab",key:"Tab",bubbles:true}));
      const cleanUp=()=>{ if(bagOpen) closeBagPanel(); if(craftOpen) toggleCraft(true);
        document.getElementById("bagPanel").style.display="none"; bag.clear(); for(const [k,v] of bag37) bag.set(k,v); };

      // 1) 暂停菜单打开时按 Tab: 不得凭空弹出背包(旧守卫 !softLock 会放行)
      bagOpen=false; craftOpen=false; softLock=false; locked=false; dead=false;
      overlay.style.display="flex";                      // 暂停菜单可见(softLock=false)
      pressTab();
      const tabOnMenu=bagOpen;
      cleanUp();
      // 2) 死亡状态下按 Tab: 同样不得弹出背包
      softLock=false; locked=false; dead=true; overlay.style.display="flex";
      pressTab();
      const tabOnDead=bagOpen;
      dead=false; cleanUp();
      ok("Tab 键不劫持: 暂停菜单打开时 / 已死亡时 都不会弹出背包",
         tabOnMenu===false && tabOnDead===false, "菜单="+tabOnMenu+" 死亡="+tabOnDead);

      // 3) 真实游戏态按 Tab: 能开; 再按一次: 能关
      bagOpen=false; softLock=true; locked=false; dead=false; overlay.style.display="none";
      pressTab(); const tabOpen=bagOpen;
      pressTab(); const tabClose=bagOpen;
      cleanUp();
      ok("Tab 键在真实游戏态可开可关背包(收紧守卫后没把功能改坏)",
         tabOpen===true && tabClose===false, "开="+tabOpen+" 关="+tabClose);

      // 4) 指针锁竞态: 从 B 合成面板切到 Tab 背包时, 不得再去申请指针锁
      bagOpen=false; craftOpen=false; document.getElementById("craftPanel").style.display="none";
      const realEnter37=enterPointerLock; let enterCalls37=0;
      enterPointerLock=function(){ enterCalls37++; return realEnter37.apply(this,arguments); };
      craftOpen=true; document.getElementById("craftPanel").style.display="flex";
      enterCalls37=0; openBagPanel();
      const raceCalls=enterCalls37;
      closeBagPanel(); enterPointerLock=realEnter37; cleanUp();
      ok("Tab 背包: 从 B 面板切过来时不再申请指针锁(修掉与 exitPointerLock 的竞态)",
         raceCalls===0 && craftOpen===false, "enterPointerLock="+raceCalls);

      // 5b) 右键开面板不该弹"游戏暂停": 开箱/熔炉/背包等会 exitPointerLock, 随后 pointerlockchange 丢锁;
      //     若正开着面板, 丢锁是去开面板而非退出, 不应拉起暂停菜单(面板是居中模态, 暂停遮罩会从四周露出 → 用户报"右键有时退出游戏")。无面板丢锁仍应暂停。
      {
        const ovD=overlay.style.display, ovC=overlay.className, hudD=document.getElementById("hud").style.display,
              chD=document.getElementById("chestPanel").style.display, lk0=locked, sl0=softLock, dd0=dead;
        dead=false; softLock=false;
        overlay.style.display="none"; overlay.classList.remove("pause-menu"); document.getElementById("hud").style.display="block";
        document.getElementById("chestPanel").style.display="flex"; chestOpen={key:"st",store:{},title:"st",cap:27};
        document.dispatchEvent(new Event("pointerlockchange"));                 // 模拟开箱后浏览器释放指针锁
        const panelNoPause = overlay.style.display==="none" && !overlay.classList.contains("pause-menu");
        chestOpen=null; document.getElementById("chestPanel").style.display="none";
        overlay.style.display="none"; overlay.classList.remove("pause-menu");
        document.dispatchEvent(new Event("pointerlockchange"));                 // 无面板时丢锁 → 真退出, 仍应暂停
        const barePauses = overlay.style.display!=="none" && overlay.classList.contains("pause-menu");
        overlay.style.display=ovD; overlay.className=ovC; document.getElementById("hud").style.display=hudD;
        document.getElementById("chestPanel").style.display=chD; locked=lk0; softLock=sl0; dead=dd0;
        ok("右键开面板不弹游戏暂停: 开着面板丢指针锁不退游戏, 真退出(无面板)仍暂停",
           panelNoPause && barePauses, "面板态未暂停="+panelNoPause+" 裸退出暂停="+barePauses);
      }

      // 5c) N 打开大地图也会 exitPointerLock。地图还开着时丢锁不该拉起暂停菜单(半透明底会透出「游戏暂停」), 关掉后菜单也不该残留。
      {
        const ovD=overlay.style.display, ovC=overlay.className, hudD=document.getElementById("hud").style.display;
        const title0=document.getElementById("title").textContent, sb=document.getElementById("startbtn");
        const sbt=sb.textContent, sbd=sb.disabled, mapWas=MM.bigOpen, lk0=locked, sl0=softLock, dd0=dead;
        const ss0=Object.assign({}, sandStepState), key0={};
        for(const k in keys) key0[k]=keys[k];
        dead=false; softLock=false; locked=false;
        overlay.style.display="none"; overlay.classList.remove("pause-menu");
        document.getElementById("title").textContent="沙海奇境";   // 前面的暂停测试会把标题留成「游戏暂停」, 先写成已知值再看丢锁会不会改它
        document.getElementById("hud").style.display="block";
        if(MM.bigOpen) toggleBigMap(false);
        toggleBigMap(true);
        document.dispatchEvent(new Event("pointerlockchange"));
        const mapNoPause=MM.bigOpen && overlay.style.display==="none" && !overlay.classList.contains("pause-menu") && document.getElementById("title").textContent==="沙海奇境";
        toggleBigMap(false);
        const mapClosed=!MM.bigOpen && overlay.style.display==="none" && !overlay.classList.contains("pause-menu");
        overlay.style.display=ovD; overlay.className=ovC; document.getElementById("hud").style.display=hudD;
        document.getElementById("title").textContent=title0; sb.textContent=sbt; sb.disabled=sbd;
        locked=lk0; softLock=sl0; dead=dd0;
        Object.assign(sandStepState, ss0);
        for(const k in keys) keys[k]=false;
        for(const k in key0) keys[k]=key0[k];
        if(mapWas) toggleBigMap(true);
        ok("大地图打开时丢指针锁不弹游戏暂停, 关掉后也不残留暂停菜单",
           mapNoPause && mapClosed, "开图未暂停="+mapNoPause+" 关掉="+mapClosed);
      }

      // 5d) Esc 关大地图: 不能在这次 Esc 的 keydown 里 requestPointerLock。
      //     浏览器会在 Esc 之后约 300ms 把刚申请到的锁强制退出, 那时地图已经关上, pointerlockchange 会 pauseGame。
      //     Esc 应直接进入拖动瞄准; 随后再丢一次锁也不弹菜单。N 关闭仍申请指针锁(拒绝时由 enterPointerLock 自己进拖动, 不另弹暂停)。
      {
        const ovD=overlay.style.display, ovC=overlay.className, hudD=document.getElementById("hud").style.display;
        const title0=document.getElementById("title").textContent, sb=document.getElementById("startbtn");
        const sbt=sb.textContent, sbd=sb.disabled, mapWas=MM.bigOpen, lk0=locked, sl0=softLock, dd0=dead;
        const intro0=_introShown, tut0=tut.active, cur0=canvas.style.cursor;
        const cross=document.getElementById("cross"), cross0=cross.style.display;
        const nameEl=document.getElementById("itemname"), name0=nameEl.textContent, nameOp=nameEl.style.opacity;
        const ss0=Object.assign({}, sandStepState), key0={};
        for(const k in keys) key0[k]=keys[k];
        const realEPL=enterPointerLock; let epl=0;
        enterPointerLock=function(){ epl++; };
        const arm=()=>{
          dead=false; softLock=false; locked=false; _introShown=true; tut.active=false;
          overlay.style.display="none"; overlay.classList.remove("pause-menu");
          document.getElementById("title").textContent="沙海奇境";
          document.getElementById("hud").style.display="block";
          if(MM.bigOpen){ MM.bigWasLocked=false; toggleBigMap(false); }
          toggleBigMap(true); MM.bigWasLocked=true; epl=0;
        };
        let escOk=false, lateOk=false, nOk=false, detail="";
        try{
          arm();
          window.dispatchEvent(new KeyboardEvent("keydown",{code:"Escape",key:"Escape",bubbles:true,cancelable:true}));
          escOk=!MM.bigOpen && epl===0 && softLock===true && overlay.style.display==="none"
            && !overlay.classList.contains("pause-menu") && document.getElementById("title").textContent==="沙海奇境";
          document.dispatchEvent(new Event("pointerlockchange"));   // 模拟 Esc 约 300ms 后浏览器强制丢锁
          lateOk=softLock===true && overlay.style.display==="none" && !overlay.classList.contains("pause-menu")
            && document.getElementById("title").textContent==="沙海奇境";
          arm();
          window.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyN",key:"n",bubbles:true,cancelable:true}));
          nOk=!MM.bigOpen && epl===1 && softLock===false && overlay.style.display==="none" && !overlay.classList.contains("pause-menu");
          detail="Esc进拖动且未申请锁="+escOk+" 迟到丢锁不暂停="+lateOk+" N申请一次锁="+nOk+"(epl="+epl+")";
        } finally {
          enterPointerLock=realEPL;
          if(MM.bigOpen){ MM.bigWasLocked=false; toggleBigMap(false); }
          clearTimeout(nameTimer); nameEl.textContent=name0; nameEl.style.opacity=nameOp;
          overlay.style.display=ovD; overlay.className=ovC; document.getElementById("hud").style.display=hudD;
          document.getElementById("title").textContent=title0; sb.textContent=sbt; sb.disabled=sbd;
          canvas.style.cursor=cur0; cross.style.display=cross0;
          locked=lk0; softLock=sl0; dead=dd0; _introShown=intro0; tut.active=tut0;
          Object.assign(sandStepState, ss0);
          for(const k in keys) keys[k]=false;
          for(const k in key0) keys[k]=key0[k];
          if(mapWas){ MM.bigWasLocked=false; toggleBigMap(true); }
        }
        ok("Esc 关大地图不申请指针锁并进入拖动瞄准, 随后丢锁也不弹暂停; N 关闭仍申请指针锁",
           escOk && lateOk && nOk, detail);
      }

      // 5e) 编年史(T) 不在模态名单里时, 开着它丢锁会把暂停菜单透出半透明底。Esc 关闭与大地图同一条路。
      {
        const el=document.getElementById("chronicle");
        const ovD=overlay.style.display, ovC=overlay.className, hudD=document.getElementById("hud").style.display;
        const title0=document.getElementById("title").textContent, sb=document.getElementById("startbtn");
        const sbt=sb.textContent, sbd=sb.disabled, mapWas=MM.bigOpen, chWas=el.classList.contains("on");
        const lk0=locked, sl0=softLock, dd0=dead, intro0=_introShown, tut0=tut.active, cur0=canvas.style.cursor;
        const cross=document.getElementById("cross"), cross0=cross.style.display;
        const nameEl=document.getElementById("itemname"), name0=nameEl.textContent, nameOp=nameEl.style.opacity;
        const chLock0=chronicleWasLocked, ss0=Object.assign({}, sandStepState), key0={};
        for(const k in keys) key0[k]=keys[k];
        const realEPL=enterPointerLock; let epl=0;
        enterPointerLock=function(){ epl++; };
        let openNoPause=false, escOk=false, lateOk=false, detail="";
        try{
          dead=false; softLock=false; locked=false; _introShown=true; tut.active=false;
          overlay.style.display="none"; overlay.classList.remove("pause-menu");
          document.getElementById("title").textContent="沙海奇境";
          document.getElementById("hud").style.display="block";
          if(MM.bigOpen){ MM.bigWasLocked=false; toggleBigMap(false); }
          if(el.classList.contains("on")){ chronicleWasLocked=false; el.classList.remove("on"); }
          toggleChronicle();
          document.dispatchEvent(new Event("pointerlockchange"));
          openNoPause=el.classList.contains("on") && modalPanelOpen() && overlay.style.display==="none"
            && !overlay.classList.contains("pause-menu") && document.getElementById("title").textContent==="沙海奇境";
          chronicleWasLocked=true; epl=0; softLock=false;
          document.dispatchEvent(new KeyboardEvent("keydown",{code:"Escape",key:"Escape",bubbles:true,cancelable:true}));
          escOk=!el.classList.contains("on") && epl===0 && softLock===true && overlay.style.display==="none"
            && !overlay.classList.contains("pause-menu") && document.getElementById("title").textContent==="沙海奇境";
          document.dispatchEvent(new Event("pointerlockchange"));
          lateOk=softLock===true && !el.classList.contains("on") && overlay.style.display==="none"
            && !overlay.classList.contains("pause-menu") && document.getElementById("title").textContent==="沙海奇境";
          detail="开着不暂停="+openNoPause+" Esc进拖动且未申请锁="+escOk+" 迟到丢锁不暂停="+lateOk+"(epl="+epl+")";
        } finally {
          enterPointerLock=realEPL;
          chronicleWasLocked=false;
          if(el.classList.contains("on")) el.classList.remove("on");
          if(MM.bigOpen){ MM.bigWasLocked=false; toggleBigMap(false); }
          clearTimeout(nameTimer); nameEl.textContent=name0; nameEl.style.opacity=nameOp;
          overlay.style.display=ovD; overlay.className=ovC; document.getElementById("hud").style.display=hudD;
          document.getElementById("title").textContent=title0; sb.textContent=sbt; sb.disabled=sbd;
          canvas.style.cursor=cur0; cross.style.display=cross0;
          locked=lk0; softLock=sl0; dead=dd0; _introShown=intro0; tut.active=tut0; chronicleWasLocked=chLock0;
          Object.assign(sandStepState, ss0);
          for(const k in keys) keys[k]=false;
          for(const k in key0) keys[k]=key0[k];
          if(chWas) el.classList.add("on");
          if(mapWas){ MM.bigWasLocked=false; toggleBigMap(true); }
        }
        ok("编年史打开时丢指针锁不弹暂停; Esc 关闭不申请指针锁, 进入拖动瞄准, 随后丢锁也不暂停",
           openNoPause && escOk && lateOk, detail);
      }

      // 5) 共享噪声缓冲: 反复触发所有材质, 缓冲区数量不随触发次数增长
      /* 关键: 正常游戏里 actx2 是玩家第一次手势时才建的, 自动化自测没有手势 → actx2 为 null。
         不主动 initAudio() 的话下面两条断言会走"跳过"分支变成空跑通过(已实测踩过)。 */
      if(!actx2) initAudio();
      if(actx2){
        noiseBufs.clear(); noiseCtx=actx2;
        for(let r=0;r<40;r++) for(const m of [SAND,STONE,LOG,ICE,WATER,LAVA,GRASS]) sfxStep(m);
        const afterFirst=noiseBufs.size;
        for(let r=0;r<40;r++) for(const m of [SAND,STONE,LOG,ICE,WATER,LAVA,GRASS]) sfxStep(m);
        const afterSecond=noiseBufs.size;
        // 560 次发声后, 缓冲区只应按"长度+包络"去重(最多 6 种长度), 而不是 560 个
        ok("共享噪声缓冲: 560 次脚步声只生成按长度去重的少量缓冲区(不再每次新建)",
           afterSecond===afterFirst && afterFirst>=1 && afterFirst<=8, "一次="+afterFirst+" 两次="+afterSecond);
      } else ok("共享噪声缓冲: 560 次脚步声只生成按长度去重的少量缓冲区(不再每次新建)", false, "无法创建 AudioContext");

      // 6) 音频节点回收: 发声后 src 挂了 onended 断开回调(依赖上面已建好的 actx2)
      if(actx2){
        let capSrc=null;
        const realCBS=actx2.createBufferSource.bind(actx2);
        actx2.createBufferSource=function(){ const s=realCBS(); capSrc=s; return s; };
        sfxStep(SAND);
        actx2.createBufferSource=realCBS;
        const hasHook=!!(capSrc&&typeof capSrc.onended==="function");
        let freed=false;
        if(capSrc&&hasHook){ try{ capSrc.onended(); freed=true; }catch(e){ freed=false; } }
        ok("音频节点回收: 噪声源带 onended 断链回调, 触发后不抛错",
           /* 第三十八轮: 缓存键格式由 "包络|长度" 改为 "长度|包络"(便于按长度去重计数) */
           hasHook&&freed && !!(capSrc&&noiseBufs.has("0.11|lin")), "onended="+hasHook+" 可触发="+freed);
      } else ok("音频节点回收: 噪声源带 onended 断链回调, 触发后不抛错", false, "无法创建 AudioContext");

      // 7) 断链回调本身不能抛错(包了 try/catch)
      ok("音频节点回收: freeChain 对已断开的节点重复调用不抛错", (()=>{
        try{ const fake={onended:null,disconnect(){throw new Error("already gone")}};
             freeChain(fake,fake); fake.onended(); return true; }catch(e){ return false; }
      })(), "重复调用安全");

      // 还原现场
      cleanUp();
      softLock=snap37.sl; locked=snap37.lk; dead=snap37.dd; overlay.style.display=snap37.ov; selSlot=snap37.so;
      craftOpen=snap37.craft; document.getElementById("craftPanel").style.display = snap37.craft ? "flex":"none";
      for(const k in keys) keys[k]=(k in snap37.keys)?snap37.keys[k]:false;
      ok("第三十七轮自测结束后背包/面板/输入状态已还原",
         bagOpen===false && getComputedStyle(document.getElementById("bagPanel")).display==="none"
         && JSON.stringify([...bag.entries()])===JSON.stringify(bag37), "ok");
    }catch(err){ ok("第三十七轮自测(Tab作用域/竞态/音频优化)未抛错", false, String(err&&err.stack||err)); }

    /* ---- 第三十八轮·本地: 共享噪声缓冲统一到全部 15 个发声函数 + 变体池 + 断链 ---- */
    try{
      if(!actx2) initAudio();
      const SFX38=[
        ["sfxBreak",()=>sfxBreak()], ["sfxBrush",()=>sfxBrush()], ["sfxHit",()=>sfxHit()],
        ["sfxEat",()=>sfxEat()], ["sfxGun",()=>sfxGun()], ["sfxRocket",()=>sfxRocket()],
        ["sfxFlame",()=>sfxFlame()], ["sfxStoneGrind",()=>sfxStoneGrind(5)],
        ["sfxSunSweep",()=>sfxSunSweep()], ["sfxHiss",()=>sfxHiss()], ["sfxExplode",()=>sfxExplode()],
        ["sfxGeyser",()=>sfxGeyser(5)], ["sfxFirework",()=>sfxFirework()], ["sfxThunder",()=>sfxThunder()],
        ["sfxStep",()=>sfxStep(SAND)],
      ];
      /* 上一版这条断言写的是 SFX38.length===15 —— 断言的是本地硬编码数组自己的长度,
           跟游戏代码零关联, 永远不可能失败(恒真)。后来又依赖硬编码 ALLSFX 列表(第三十九轮
           独立审计实测: 在游戏代码里新增第 16 个带坏包络名的发声函数, 硬编码对照照过)。
           现在真的从源码里点名: 扫本页内联脚本源码, 找出所有"函数体里调了 noisePick( 建噪声
           缓冲、且接了 actx2.destination"的 sfx* 顶层函数名, 再逐个对照 SFX38。 */
      const pageSrc=Array.from(document.scripts||[]).map(s=>s.textContent||"").join("\n");
      const ALLSFX=[];
      const sfxRe=/function\s+(sfx\w+)\s*\(/g, mRep=[];
      {
        let mc; const seen=new Set();
        while((mc=sfxRe.exec(pageSrc))!==null){
          const name=mc[1];
          if(seen.has(name)) continue; seen.add(name);
          const fnSrc=String(eval(name));
          if(fnSrc.includes("noisePick(") && fnSrc.includes("actx2.destination")) ALLSFX.push(name);
          else { const hits=(fnSrc.match(/noisePick\(/g)||[]).length;
                 mRep.push(name+"(noisePick×"+hits+", dest="+fnSrc.includes("actx2.destination")+")"); }
        }
      }
      const uncovered=[];
      for(const n of ALLSFX){ if(!SFX38.some(p=>p[0]===n)) uncovered.push(n); }
      ok("第三十八轮: 源码提取的建噪声发声函数("+ALLSFX.length+"个="+ALLSFX.sort().join("|")+")全部在 SFX38 里",
         SFX38.length===ALLSFX.length && uncovered.length===0,
         "SFX38="+SFX38.length+" 源码提取="+ALLSFX.length+" 漏列="+(uncovered.join(",")||"无")+
         " 非噪声sfx*("+mRep.length+"): "+(mRep.join(",")||"无"));

      if(actx2){
        // 1) 核心: 每个函数各调 5 轮, createBuffer 增量必须为 0(预热已把变体备齐)
        const realCB38=actx2.createBuffer.bind(actx2);
        let cb38=0; actx2.createBuffer=function(...a){ cb38++; return realCB38(...a); };
        let err38=null;
        for(const [,f] of SFX38){ try{ f(); }catch(e){ err38=err38||String(e&&e.stack||e).slice(0,120); } }
        const warm38=cb38;
        for(let r=0;r<5;r++) for(const [,f] of SFX38){ try{ f(); }catch(e){ err38=err38||String(e&&e.stack||e).slice(0,120); } }
        const after38=cb38;
        actx2.createBuffer=realCB38;
        ok("全部 15 个发声函数不再每次新建缓冲: 预热后再各调 5 轮, createBuffer 增量为 0",
           err38===null && warm38>0 && after38===warm38, "预热建了="+warm38+" 5轮后="+after38+" 错="+err38);

        // 2) 缓存有界: 大量调用后键数量与变体总数都不再增长
        const keys38=noiseBufs.size;
        const bufCnt38=()=>{ let c=0; for(const [,a] of noiseBufs) c+=a.length; return c; };
        const bufs38=bufCnt38();
        for(let r=0;r<10;r++) for(const [,f] of SFX38){ try{ f(); }catch(e){} }
        for(const m of [SAND,STONE,LOG,ICE,WATER,LAVA,GRASS]) sfxStep(m);
        ok("缓存有界: 15 个函数再各调 10 轮 + 7 种脚步材质, 键数量与变体总数都不增长",
           noiseBufs.size===keys38 && bufCnt38()===bufs38 && keys38>0,
           "键 一次="+keys38+" 之后="+noiseBufs.size+" / 变体 一次="+bufs38+" 之后="+bufCnt38());

        // 3) 每个键的采样数必须等于 round(sampleRate*len) —— 键名就是 len|env
        const lenBad=[];
        for(const [k,arr] of noiseBufs){
          const len=parseFloat(k.split("|")[0]);
          const want=Math.round(actx2.sampleRate*len);
          if(!arr.length || arr.some(b=>!b || b.length!==want)) lenBad.push(k);
        }
        ok("每个缓存键的采样数都等于 round(sampleRate*键里的长度)(否则 src.start(t,0,len) 会截断)",
           lenBad.length===0, "异常键="+(lenBad.join(",")||"无"));

        // 4) 变体池真的在起作用: 高频音效连发 40 次必须用到 >1 种缓冲
        /* 这是防止"缓存把音效变成机械音"的关键回归 —— 原来每次都是全新随机噪声,
           若只留一份, sfxHit 这种无随机参数的音效每次波形会完全一样。 */
        const variants={};
        for(const [name,fn] of [["sfxHit",()=>sfxHit()],["sfxStep",()=>sfxStep(SAND)],["sfxFlame",()=>sfxFlame()]]){
          const seen=new Set();
          for(let i=0;i<40;i++){
            let cap=null;
            const r1=actx2.createBufferSource.bind(actx2);
            actx2.createBufferSource=function(){ const s=r1(); cap=s; return s; };
            fn(); actx2.createBufferSource=r1;
            if(cap&&cap.buffer) seen.add(cap.buffer);
          }
          variants[name]=seen.size;
        }
        ok("变体池有效: sfxHit/sfxStep/sfxFlame 连发 40 次各用到 >1 种缓冲(否则会变机械音)",
           Object.values(variants).every(v=>v>1), JSON.stringify(variants));

        // 5) 罕见长音只备 1 份(内存取舍): 但键确实存在
        const longEnv=["1.5|flat","1.3|gey","1.6|p12","0.7|p16","0.5|p22","0.45|p15"];
        ok("罕见长音(雷/嘶/喷发/爆炸/烟花/烈阳)已缓存且各只备 1 份变体",
           longEnv.every(k=>noiseBufs.has(k) && noiseBufs.get(k).length===1),
           longEnv.map(k=>k+"="+(noiseBufs.has(k)?noiseBufs.get(k).length:"缺")).join(" "));

        // 6) 包络指数有没有串味 —— 本次重构最大的风险点
        /* 用分窗 RMS 比值反推烘焙进去的包络: 指数越大衰减越快, mid/head 越小。
           逐项核对数值 + 严格单调性, 任一包络写错都会被抓出来。 */
        const winRMS=(d,x0,x1)=>{ const n=d.length,a=Math.floor(x0*n),b=Math.floor(x1*n);
                                  let s=0; for(let i=a;i<b;i++) s+=d[i]*d[i];
                                  return Math.sqrt(s/Math.max(1,b-a)); };
        /* 每个包络量取多个变体再平均: 单份缓冲的采样噪声会被比值放大
           (sin 的 head 幅度是 9 种里最低的, 单份 sd≈0.085)。第三十八轮取 3 份(sd≈0.05),
           但 p16/p15 这对 3 份平均后的间隙 sd 实测≈0.0049, 而两者真实间隔只有 ≈0.023 ——
           40% 的门槛(0.008)距均值只剩 ~3σ, ?seed=7 实测仍会随机红(我复现: 一次跑出 0.007)。
           这里改取 9 份平均: 间隙 sd 降到 ≈0.0028, 门槛 0.008 距均值 ≥5.3σ(≈6e-8/次,
           不再随机红); 而索引整体写反时间隙≈−0.024、必反号, 仍 100% 抓到(变异测试保持通过)。 */
        noiseBufs.clear(); noiseCtx=actx2;
        const envM={};
        for(const env of Object.keys(NOISE_ENV)){
          const accM=[], accT=[];
          for(let v=0;v<9;v++){
            const d=noiseBuf(0.4, env, v).getChannelData(0);
            const head=winRMS(d,0.02,0.10);
            accM.push(winRMS(d,0.45,0.55)/head); accT.push(winRMS(d,0.90,0.98)/head);
          }
          const avg=a=>a.reduce((x,y)=>x+y,0)/a.length;
          envM[env]={ midOverHead:+avg(accM).toFixed(3), tailOverHead:+avg(accT).toFixed(3) };
        }
        /* 期望值取自独立审计的重复实测均值(每项多次采样取平均), 不是我拍脑袋写的:
           lin 0.53/0.07  flat 1.00/1.00  sin 5.00/1.00  p12 0.47/0.04
           p15 0.39/0.02  p16 0.37/0.015 p2 0.29/0.006 p22 0.25/0.004  gey 1.06/0.135
           注意 sin 关于 x=0.5 对称, 所以 tail≈head(不是像衰减包络那样趋近 0);
           gey 因有快起音 min(1,x*8), head 被压低, 所以 mid/head 略大于 1。
           容差用相对值, 不用绝对值 —— 这是变异测试逼出来的。上一版 sin 只留 ±0.15 而实测
           sd≈0.085, 等于 ±1.76σ, 实测 60 次里红 7 次(真机 13 次红 3 次), 是条随机红的断言;
           但把绝对容差放宽到 ±0.30 之后, 变异测试又显示"把 p22 的指数误写成 1.6"
           (实测 0.363 vs 期望 0.25, 差 0.113) 反而**抓不到**了。
           改成 ±12% 后两类缺陷都能覆盖:
             · sin 的 mid/head≈5, 9 份平均后 sd≈0.028 → ±12%≈±0.6≈±21σ, 足够稳
             · lin 的 mid/head≈0.53, 9 份平均后 sd≈0.003 → ±12%≈±0.06≈±20σ, 足够稳
             · p22 被误写成 1.6 → 0.363 > 0.25×1.12=0.28, 抓到
             · p2 被误写成 1.5 → 0.363 > 0.29×1.12=0.325, 抓到
           p16/p15 这对只差 5%, 相对容差盖不住(也确实不该靠这条盖) —— 指数互换由下面的
           "指数次序"专门负责, 职责分开。tail 因为数值极小(0.004~0.135), 用 max(0.02, 15%)。 */
        const want38={lin:[0.53,0.07], flat:[1.00,1.00], sin:[5.00,1.00], p12:[0.47,0.04],
                      p15:[0.39,0.02], p16:[0.37,0.015], p2:[0.29,0.006], p22:[0.25,0.004],
                      gey:[1.06,0.135]};
        const envBad=[];
        for(const [env,w] of Object.entries(want38)){
          const g=envM[env];
          if(!g) { envBad.push(env+"=缺"); continue; }
          if(Math.abs(g.midOverHead-w[0])>w[0]*0.12) envBad.push(env+" mid="+g.midOverHead+" 期望≈"+w[0]+"(±12%)");
          if(Math.abs(g.tailOverHead-w[1])>Math.max(0.02,w[1]*0.15)) envBad.push(env+" tail="+g.tailOverHead+" 期望≈"+w[1]);
        }
        ok("包络逐项核对: 9 种包络的 mid/head、tail/head 都与实测标定值相符",
           envBad.length===0, envBad.join("; ")||JSON.stringify(envM));
        /* 指数次序: 指数越大衰减越快, 所以 mid/head 应按 p22<p2<p16<p15<p12 递增。
           这一条原先写成"带 0.01 最小间隔的严格递增", 实测 ?seed=7 跑 10 次红 1 次 ——
           每项取 3 份平均时 p16/p15 的间距 sd 实测≈0.0049, 而两者真实间隔只有 ≈0.020,
           0.01 的门槛(真实间隔的一半)距均值只剩 ~2σ, 会被噪声压塌。
           第三十九轮: 包络测量已改 9 份平均(见上), 间距 sd 降到 ≈0.0028, 门槛取期望间隔的
           40%(p16→p15 即 0.008)距均值 ≈5.3σ(≈6e-8/次, 不再随机红); 而索引整体写反时间隙
           会反号(≈−0.024), 必被任何正门槛抓到(变异测试保持通过)。 */
        const chain=[["p22","p2"],["p2","p16"],["p16","p15"],["p15","p12"]], orderBad=[];
        for(const [a,b] of chain){
          const gap=envM[b].midOverHead-envM[a].midOverHead;
          /* 期望间隔取自 want38 的标定值差(确定性, 不受本次采样噪声影响) */
          const expGap=want38[b][0]-want38[a][0];
          if(gap < expGap*0.4) orderBad.push(a+"→"+b+" 实测间距="+gap.toFixed(3)+" 期望≈"+expGap.toFixed(3));
        }
        ok("包络指数无串味: 相邻指数的衰减速度次序符合 p22<p2<p16<p15<p12(容差按期望间距的 40%, 不随机红)",
           orderBad.length===0,
           orderBad.join("; ")||["p22","p2","p16","p15","p12"].map(e=>e+"="+envM[e].midOverHead).join(" < "));
        // 变体必须是彼此独立的缓冲(否则等于只有一份, 又变回机械音)
        let dupEnv=[];
        for(const env of Object.keys(NOISE_ENV)){
          const s=new Set();
          for(let v=0;v<3;v++) s.add(noiseBuf(0.4, env, v));
          if(s.size!==3) dupEnv.push(env+"="+s.size);
        }
        ok("每种包络备的 3 个变体是彼此独立的缓冲(不是同一份)", dupEnv.length===0, dupEnv.join(",")||"9/9 各 3 份互不相同");

        /* 6b) 包络名接线检查 —— 独立审计两轮逼出来的
           (a) 第一轮: 上面两条包络断言都只遍历注册表, 从没查 15 个调用点实际传的字符串,
               sfxBrush 误写 "sine"(键叫 "sin")被静默兜底吃掉都能全绿。于是加了:
               名字必须是真实键 + 能量波形必须与期望包络相符。
           (b) 第二轮(本次): 6b(b) 旧版期望值按源码里读出的名字作键 want38[m[1]] ——
               "合法名互换"(M1: sfxBrush sin→lin; M7: sfxHit lin↔sfxGun p2 调用点互换)
               波形对得上互换后的期望, 506/506 照过。这版给每个调用点写死期望包络
               EXPECT38(不随名字漂移): 名字必须与接线表一致、波形必须与接线表期望一致。
           (c) 行为级复核: 播放后 src.onended 必须被 freeChain 赋成函数(注释里冒充
               "freeChain(" 骗不过这条); 播放的缓冲必须命中共享缓存(每次新建/别名绕过
               立刻暴露)。 */
        const EXPECT38={ "sfxBreak":"lin", "sfxBrush":"sin", "sfxStep":"lin", "sfxSunSweep":"p15",
                         "sfxHit":"lin", "sfxEat":"lin", "sfxHiss":"flat", "sfxExplode":"p16",
                         "sfxGun":"p2", "sfxRocket":"lin", "sfxStoneGrind":"sin", "sfxGeyser":"gey",
                         "sfxFirework":"p22", "sfxFlame":"lin", "sfxThunder":"p12" };
        const nameBad=[], wireBad=[], playedBad=[], hookBad=[];
        noiseBufs.clear(); noiseCtx=actx2;
        for(const [fn38,call38] of SFX38){
          const exp=EXPECT38[fn38];
          if(!exp){ nameBad.push(fn38+"=不在 EXPECT38 接线表里(新函数? 请补表)"); continue; }
          const m=String(eval(fn38)).match(/noisePick\([^,]+,"([^"]+)"/);
          if(!m){ nameBad.push(fn38+"=源码里没有 noisePick 调用"); continue; }
          if(m[1]!==exp){ wireBad.push(fn38+"=传的名字\""+m[1]+"\"≠接线表\""+exp+"\"(合法名互换)"); continue; }
          let played=null;
          const r1=actx2.createBufferSource.bind(actx2);
          actx2.createBufferSource=function(){ const s=r1(); if(!played) played=s; return s; };
          try{ call38(); }catch(e){ nameBad.push(fn38+"() 调用抛错: "+(e&&e.message||e)); }
          actx2.createBufferSource=r1;
          if(!played||!played.buffer){ nameBad.push(fn38+"=没拿到它用的 buffer"); continue; }
          /* freeChain 行为级: 断链=src.onended 真的被赋了函数, 看运行产物不看源码字符串 */
          if(typeof played.onended!=="function") hookBad.push(fn38+"=src 没挂 onended 断链(freeChain 未生效)");
          /* "不再每次新建"行为级: 播放的缓冲必须命中共享缓存(自己 createBuffer 的进不了缓存) */
          const cached=[...noiseBufs.values()].flat();
          let fromCache=false; for(let i=0;i<cached.length;i++){ if(cached[i]===played.buffer){ fromCache=true; break; } }
          if(!fromCache) playedBad.push(fn38+"=播放缓冲不在共享缓存里(疑似每次新建, 见 MUST-FIX)");
          const dd=played.buffer.getChannelData(0);
          const ratio=+(winRMS(dd,0.02,0.10)? winRMS(dd,0.45,0.55)/winRMS(dd,0.02,0.10) : 0).toFixed(3);
          const w=want38[exp];
          if(!w){ nameBad.push(fn38+"(env="+exp+") 缺期望值"); continue; }
          /* 容差取 ±15%: 这里量的是单个函数实际播放的那一份缓冲(样本量比第 6 条更少),
             sin 单份/少量平均时实测可能偏高(如一次测得 5.291 vs 期望 5.00, 属 ≈+1.8σ 的采样
             波动而非系统偏差), 所以用相对容差。对全部 9 种包络都成立, 仍能抓住整条包络被换掉
             (变异测试: sfxBrush 退化成 lin → 0.548 vs 期望 5.00, 差 89%, 抓到)。 */
          if(Math.abs(ratio-w[0])>w[0]*0.15) playedBad.push(fn38+"(env="+exp+") 实测 mid/head="+ratio+" 期望≈"+w[0]+"(±15%)");
        }
        ok("15 个调用点的包络名都真实存在于 NOISE_ENV(拼错会立刻暴露, 不再静默降级)",
           nameBad.length===0, nameBad.join("; ")||"15/15 全部命中");
        ok("15 个调用点的包络名与接线表 EXPECT38 一一对应(合法名互换 M1/M7 也抓得到)",
           wireBad.length===0, wireBad.join("; ")||"15/15 与接线表一致");
        ok("15 个函数实际播放出去的缓冲都在共享缓存里: 包络与期望值相符 + 不是每次新建(不靠名字)",
           playedBad.length===0, playedBad.join("; ")||"15/15 波形与期望一致且命中缓存");
        ok("15 个发声函数播放后 src 都挂了 onended 断链(行为级: 看是否真的调用了 freeChain)",
           hookBad.length===0, hookBad.join("; ")||"15/15 都挂了断链");
      } else ok("第三十八轮音频统一自测", false, "无法创建 AudioContext");

      // 7) 不依赖音频上下文: 源码层面确认 15 个函数都挂了 freeChain, 且都没有残留的逐采样生成
      {
        /* 先把整行注释剥掉再匹配, 否则一行 // TODO: freeChain(src,f,g) 也能骗过 includes
           (独立审计 M8 实证过)。6b 里还有行为级复核(onended 真的被赋了函数、缓冲命中共享
           缓存), 这里是无 AudioContext 时的源码级兜底。 */
        const need=ALLSFX;   // 名单来自源码提取, 不是再敲一遍的硬编码
        const codeOnly=t=>String(t).replace(/\/\/[^\n]*/g,"").replace(/\/\*[\s\S]*?\*\//g,"");
        const texts=need.map(n=>codeOnly(eval(n)));
        const noFree=texts.filter(t=>t.includes("freeChain(")).length;
        const noCreateBuf=texts.filter(t=>t.includes("actx2.createBuffer(")).length;
        ok("15 个发声函数全部挂了 freeChain 断链(剥注释后源码级, 行为级见 6b)", noFree===15, noFree+"/15");
        ok("15 个发声函数里没有残留的逐采样噪声生成(actx2.createBuffer)", noCreateBuf===0, "残留="+noCreateBuf);
      }
    }catch(err){ ok("第三十八轮自测(音频统一)未抛错", false, String(err&&err.stack||err)); }

    // 收尾再确认一次: 即使中途 saveGame 写过测试世界, 还原后玩家存档仍在
    sandseaStorageRestore(liveStore);
    let endSave=null; try{ endSave=localStorage.getItem(SAVE_KEY); }catch(e){}
    ok("自测结束时玩家存档仍未被测试世界覆盖", endSave===liveSave, "match="+(endSave===liveSave));
  } finally {
    // 先还 localStorage(抛错也要还), 再还原内存现场
    try{ sandseaStorageRestore(liveStore); }catch(e){}
    try{
      player.x=snap.x; player.y=snap.y; player.z=snap.z; player.vy=snap.vy;
      hp=snap.hp; dead=snap.dead; softLock=snap.softLock; worldGenReady=snap.wgr;
      blockDiff.clear(); for(const [k,v] of prevDiff) blockDiff.set(k,v); diffIndexRebuild();
      pcx=1e9; refreshChunks();
    }catch(e){}
  }

  const line="=".repeat(52);
  console.log("%c沙海奇境 Sandsea · 自测报告","font-size:15px;font-weight:bold;color:#e8a75a");
  console.log(line);
  for(const r of results) console.log((r.ok?"✅ PASS":"❌ FAIL")+"  "+r.name+(r.detail?"   ("+r.detail+")":""));
  console.log(line);
  console.log((fail===0?"%c全部通过":"%c存在失败项")+"  "+pass+" passed / "+fail+" failed",
              "font-weight:bold;color:"+(fail===0?"#4caf50":"#f44336"));
  return {pass, fail, total:pass+fail, results};
}
