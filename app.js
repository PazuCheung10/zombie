import {W,H,DT,DURATION,SIGHT,DEFAULT,GENES,BASE,createWorld,step,metrics,id,los} from './sim.js';
import {INITIAL_CHALLENGE,challengeConfig} from './challenge.js';
import {STORAGE_KEY,LEGACY_KEY,parseSave,CONFIG_LIMITS} from './persistence.js';
import {Z_BASE} from './zombie-policy.js';
import {archiveKey,rememberGeneration,branchRecord} from './timeline.js';
import {saveGeneration,listGenerations,readGeneration,listRuns,milestoneRecords} from './history-db.js';
let archive=[],comparison=null,zombieBest=[...Z_BASE],enemyVersion=0;
let runId=crypto.randomUUID(),viewRun=runId,founder=[...BASE],records=[];
const actionNames={Search:'搜尋',Engage:'處理威脅',Protect:'保護平民',Reload:'前往補給',Reloading:'補給中',Retreat:'保持距離',Melee:'近身防衛'};
const $=s=>document.querySelector(s);
let config={...DEFAULT},best=[...BASE],champion=[...BASE],history=[],generation=0,selected=0,mode='compare',speed=3,playing=true,training=false,max=false,left,right,acc=0,last=0,hold=0,worker;
let challenge={...INITIAL_CHALLENGE},level=0,checkpoint=null,resumeOptions={},storageWarning=false,initialized=false;
function notice(s){$('#notice').textContent=s;}
function savedRecord(){return {format:'fieldwork-genome',version:3,genome:best,config,seed:Number($('#seed').value)>>>0,generation,checkpoint,challenge,level,archive,zombieGenome:zombieBest,runId,founder};}
function persist(){
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(savedRecord()));}
  catch{storageWarning=true;notice('自動保存暫時無法使用，關閉前請下載模型備份。');}
}
function newWorker(){
  worker?.terminate();worker=new Worker('./worker.js',{type:'module'});
  worker.onmessage=({data:r})=>{
    if(r.type==='error'){notice(r.message);training=false;$('#train').textContent='▶ 繼續訓練';return;}
    if(r.type==='paused'){$('#status').textContent='已暫停 · 模型已保存';return;}
    if(r.type==='ready'){checkpoint=r.checkpoint;if(!archive.length)keepGeneration(false);recordGeneration(config,checkpoint);persist();notice('訓練中，每一代會自動記錄；可以隨時暫停。');return;}
    if(r.type!=='generation')return;
    r.checkpoint.evolveZombies=$('#enemy-training').checked;
    if(!$('#curriculum').checked){r.checkpoint.curriculum=false;r.checkpoint.pending=null;}
    generation=r.generation;best=r.best;champion=r.champion;challenge=r.challenge;level=r.level;checkpoint=r.checkpoint;zombieBest=r.zombieBest;enemyVersion=r.enemyVersion;
    if(!archive.length||generation%500===0)keepGeneration(false);
    recordGeneration(config,checkpoint);
    history.push(r);if(history.length>200)history.shift();persist();
    $('#generation').textContent=String(generation).padStart(3,'0');
    $('#survival').innerHTML=`${(r.bestValidation.survival*100).toFixed(1)}<b>%</b>`;
    $('#gain').textContent=`${((r.bestValidation.survival-r.baseline.survival)*100).toFixed(1)} 個百分點（與未進化模型比較）`;
    $('#fitness').textContent=r.bestValidation.fitness.toFixed(1);
    $('#mean').textContent=`最佳 ${r.train.fitness.toFixed(1)} · 平均 ${r.mean.toFixed(1)}`;
    $('#kills').innerHTML=`${r.bestValidation.kills.toFixed(1)}<b>/ ${r.bestValidation.threats.toFixed(1)}</b>`;
    $('#agent-rate').textContent=`守衛生存率 ${(r.bestValidation.agentSurvival*100).toFixed(0)}%`;
    $('#status').textContent=training?'正在學習下一代…':'完成這一代後暫停…';
    updateChallenge();
    $('#lesson').textContent=`${r.pending?'已找到更難而可應付的挑戰，下一代升級。':r.mastery>=4?'已掌握目前挑戰，正在尋找下一級。':'正在學習目前的挑戰。'} 穩定達標 ${Math.min(r.mastery,4)}／4 代。`;
    $('#anchor').textContent=`固定測試 ${(r.anchor.survival*100).toFixed(1)}% · 每局平均 ${r.train.seconds.toFixed(1)}s / ${DURATION}s`;
    $('#enemy-info').textContent=`喪屍小型網絡 · 第 ${r.zombieGeneration} 代 · 對手版本 ${r.enemyVersion} · 感染分數 ${r.enemyScore.toFixed(1)}`;
    if(history.length===1||r.promoted||r.enemyChanged)restart();drawChart();
  };
  worker.onerror=e=>{notice(`訓練發生錯誤：${e.message}`);training=false;$('#train').textContent='▶ 繼續訓練';};
}
function updateChallenge(){
  $('#level').textContent=`第 ${level} 級挑戰`;
  $('#challenge-info').textContent=`${Math.min(120,config.zombies+Math.round(challenge.extra))} 隻喪屍 · ${challenge.speed.toFixed(2)} 倍速度 · ${(challenge.runners*100).toFixed(0)}% 衝刺型 · ${(challenge.spread*100).toFixed(0)}% 分散 · ${challenge.wave.toFixed(2)} 倍出場密度`;
}
function restart(){
  const seed=Number($('#seed').value)>>>0;$('#seed').value=seed;
  const c={...challengeConfig(config,challenge),zombieGenome:zombieBest};
  left=createWorld(seed,c,comparison?.checkpoint.best??founder);right=createWorld(seed,c,mode==='champion'?champion:best);
  right.replayGeneration=generation;right.replayLevel=level;
  $('#before-title').textContent=comparison?'較早的模型':'學習起點';
  $('#before-gen').textContent=comparison?`第 ${comparison.checkpoint.generation} 代`:'訓練開始時';acc=0;hold=0;
  $('#genome-id').textContent=`第 ${generation} 代 · 挑戰 ${level}`;
  $('#difficulty').textContent=`挑戰 ${level} · 地圖 ${seed} · 局面結束即結算`;
  draw();
}
function toggleTraining(){
  if(!initialized)return;
  training=!training;
  worker.postMessage({type:training?'start':'pause',config,options:resumeOptions,curriculum:$('#curriculum').checked,evolveZombies:$('#enemy-training').checked});
  $('#train').textContent=training?'Ⅱ 暫停訓練':'▶ 繼續訓練';
  $('#status').textContent=training?'正在訓練…':'完成這一代後暫停…';
}
$('#train').onclick=toggleTraining;
$('#curriculum').onchange=()=>{
  const value=$('#curriculum').checked;
  worker.postMessage({type:'curriculum',value});resumeOptions.curriculum=value;
  if(checkpoint){checkpoint.curriculum=value;if(!value)checkpoint.pending=null;resumeOptions.checkpoint=checkpoint;persist();}
  $('#lesson').textContent=value?'已開啟自動難度':'已固定場景難度';
};
$('#enemy-training').onchange=()=>{const value=$('#enemy-training').checked;worker.postMessage({type:'enemy-training',value});resumeOptions.evolveZombies=value;if(checkpoint){checkpoint.evolveZombies=value;persist();}};
$('#play').onclick=()=>{playing=!playing;$('#play').textContent=playing?'Ⅱ':'▶';$('#play').title=playing?'暫停畫面':'播放畫面';$('#play').setAttribute('aria-label',$('#play').title);};
for(const b of document.querySelectorAll('[data-speed]'))b.onclick=()=>{speed=Number(b.dataset.speed);document.querySelectorAll('[data-speed]').forEach(x=>x.classList.toggle('active',x===b));};
function setMax(value){max=value;$('#worlds').hidden=max;$('#max-message').hidden=!max;$('#max').textContent=max?'返回模擬畫面':'暫停繪圖，加速訓練';if(max&&!training)toggleTraining();}
$('#max').onclick=()=>setMax(!max);
for(const b of document.querySelectorAll('[data-mode]'))b.onclick=()=>{mode=b.dataset.mode;document.querySelectorAll('[data-mode]').forEach(x=>x.classList.toggle('active',x===b));$('#worlds').classList.toggle('single',mode!=='compare');$('#after-title').textContent=mode==='champion'?'本代最佳':'最新模型';setMax(false);restart();};
$('#replay').onclick=restart;$('#seed').onchange=()=>{restart();persist();};
function readConfig(){
  const c={};for(const [k,[lo,hi]] of Object.entries(CONFIG_LIMITS)){const v=Number($('#'+k).value);if(!Number.isFinite(v)||v<lo||v>hi||(k!=='mutation'&&!Number.isInteger(v)))throw Error(`參數超出範圍：${lo}–${hi}`);c[k]=v;}return c;
}
function clearMetrics(){
  history=[];$('#generation').textContent=String(generation).padStart(3,'0');$('#survival').innerHTML='—<b>%</b>';$('#fitness').textContent='—';$('#kills').innerHTML='—';$('#gain').textContent='開始訓練後重新評估';$('#mean').textContent='平均分數 —';$('#agent-rate').textContent='守衛生存率 —';$('#anchor').textContent='固定測試生存率 —';
}
function reset(c,keep=true){
  if(checkpoint)recordGeneration(config,checkpoint);
  runId=crypto.randomUUID();viewRun=runId;records=[];comparison=null;archive=[];
  config=c;if(!keep){founder=[...BASE];best=[...BASE];generation=0;challenge={...INITIAL_CHALLENGE};level=0;}
  champion=[...best];if(!keep){zombieBest=[...Z_BASE];enemyVersion=0;}checkpoint=null;resumeOptions={genome:best,generation,challenge,level,zombieGenome:zombieBest,evolveZombies:$('#enemy-training').checked,curriculum:$('#curriculum').checked};
  training=false;newWorker();clearMetrics();$('#train').textContent='▶ 繼續訓練';$('#status').textContent=keep?'已保留學到的模型':'從未進化模型開始';selected=0;setMax(false);updateChallenge();refreshTimeline();restart();drawChart();persist();loadHistory();
}
$('#reset').onclick=()=>{try{reset(readConfig(),true);notice('已套用設定，保留模型並建立新的候選族群。');}catch(e){notice(e.message);}};
$('#recommended').onclick=()=>{for(const k of Object.keys(DEFAULT))$('#'+k).value=DEFAULT[k];reset({...DEFAULT},true);notice('已套用建議參數，並保留學到的模型。');};
$('#fresh').onclick=()=>{try{localStorage.setItem(STORAGE_KEY+'-previous',JSON.stringify(savedRecord()));reset(readConfig(),false);notice('新實驗已準備好，舊記錄仍保留在瀏覽器。');}catch(e){notice(e.message);}};
$('#save').onclick=()=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify(savedRecord(),null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=`fieldwork-L${level}-G${generation}-${id(best)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notice(checkpoint?'已下載模型、雙方候選族群及訓練狀態。':'已下載模型，開始時會建立候選族群。');
};
function restore(data){
  const d=parseSave(data);runId=d.runId??crypto.randomUUID();viewRun=runId;founder=[...(d.founder??d.checkpoint?.origin??BASE)];records=[];config=d.config;best=[...d.genome];champion=[...best];generation=d.generation;checkpoint=d.checkpoint??null;archive=d.archive??[];comparison=null;zombieBest=[...(checkpoint?.zombieBest??d.zombieGenome??Z_BASE)];enemyVersion=checkpoint?.enemyVersion??0;
  challenge={...d.challenge};level=checkpoint?.level??d.level??0;
  resumeOptions=checkpoint?{checkpoint}:{genome:best,generation,challenge,level,zombieGenome:zombieBest};
  training=false;newWorker();clearMetrics();
  for(const k of Object.keys(DEFAULT))$('#'+k).value=config[k];
  $('#enemy-training').checked=checkpoint?.evolveZombies??true;
  $('#curriculum').checked=checkpoint?.curriculum??true;$('#seed').value=d.seed;
  $('#train').textContent='▶ 繼續訓練';$('#status').textContent=`已還原第 ${generation} 代`;
  selected=0;setMax(false);updateChallenge();refreshTimeline();restart();drawChart();persist();loadHistory();
}
$('#load').onclick=()=>$('#file').click();
$('#file').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>4500000)throw Error('備份超過 4.5 MB。');restore(await file.text());notice(`已載入模型，按「繼續訓練」即可接著學習。`);}catch(err){notice(err.message);}e.target.value='';};
async function refreshRuns(){
  try{
    const runs=await listRuns(),select=$('#history-run');select.replaceChildren();
    for(const [i,r] of runs.entries())select.add(new Option(`分支 ${i+1} · 第 ${r.generation} 代${r.run===runId?'（目前）':''}`,r.run));
    if(!runs.some(r=>r.run===runId))select.add(new Option('目前分支',runId));
    select.value=viewRun;
  }catch{}
}
async function recordGeneration(c,s){
  const run=runId,copy=structuredClone(s),configuration={...c};
  try{
    const key=await saveGeneration(run,configuration,copy);
    if(viewRun===run){
      const row={key,run,generation:copy.generation,level:copy.level,enemyVersion:copy.enemyVersion};
      records=records.filter(r=>r.key!==key);records.push(row);records.sort((a,b)=>a.generation-b.generation);refreshTimeline();
    }
    if(copy.generation%100===0||records.length===1)refreshRuns();
  }catch{notice('歷代記錄空間不足或無法使用；最新模型仍會嘗試保存在本機。請下載模型備份。');}
}
function refreshTimeline(){
  const select=$('#past-generation'),value=comparison?.key??'baseline';
  select.replaceChildren(new Option('學習起點','baseline'));
  const items=milestoneRecords(records,Number($('#history-interval').value));
  if(comparison&&!items.some(r=>r.key===comparison.key))items.push({key:comparison.key,generation:comparison.checkpoint.generation});
  for(const item of items)select.add(new Option(`第 ${item.generation} 代`,item.key));
  select.value=value;$('#resume-generation').disabled=!comparison;
  $('#history-note').textContent=`起點自動保留 · 每 ${$('#history-interval').value} 代一個比較點 · ${records.length} 代已記錄`;
}
function keepGeneration(manual=false){archive=rememberGeneration(archive,config,checkpoint);}
async function selectComparison(key){
  try{
    const item=key==='baseline'?null:await readGeneration(key);
    if(key!=='baseline'&&!item)throw Error('尚未記錄這一代，或此瀏覽器沒有該代資料。');
    comparison=item;refreshTimeline();mode='compare';document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));$('#worlds').classList.remove('single');setMax(false);restart();
  }catch(e){notice(e.message);}
}
$('#past-generation').onchange=e=>selectComparison(e.target.value);
$('#history-interval').onchange=refreshTimeline;
$('#history-run').onchange=async e=>{try{viewRun=e.target.value;comparison=null;records=await listGenerations(viewRun);refreshTimeline();restart();}catch{notice('無法讀取這個分支的歷代記錄。');}};
$('#find-generation').onclick=()=>{
  const n=Number($('#specific-generation').value),r=records.find(r=>r.generation===n);
  if(!Number.isSafeInteger(n)||n<0||!r){notice('找不到這一代。可選擇目前已自動記錄的代數，或切換訓練分支。');return;}
  selectComparison(r.key);
};
$('#resume-generation').onclick=()=>{
  if(!comparison)return;const selected=structuredClone(comparison),record=branchRecord(selected,Number($('#seed').value)>>>0,archive.filter(item=>item.checkpoint.generation<=selected.checkpoint.generation));
  keepGeneration(false);record.runId=crypto.randomUUID();record.founder=founder;restore(record);records=[];refreshTimeline();refreshRuns();
  notice(`已回到第 ${generation} 代，原來的記錄仍保留。按「繼續訓練」開始新分支。`);
};
async function loadHistory(){
  try{
    const currentRun=runId,currentConfig={...config},currentCheckpoint=structuredClone(checkpoint),currentArchive=structuredClone(archive);
    for(const item of currentArchive)await saveGeneration(currentRun,item.config,item.checkpoint);
    if(currentCheckpoint)await saveGeneration(currentRun,currentConfig,currentCheckpoint);
    const rows=await listGenerations(currentRun);
    if(currentRun!==runId)return;records=rows;viewRun=currentRun;refreshTimeline();refreshRuns();
  }catch{notice('無法讀取歷代記錄；仍可訓練及下載最新模型。');}
}
$('#after').onclick=e=>{let r=e.target.getBoundingClientRect(),p={x:(e.clientX-r.left)/r.width*W,y:(e.clientY-r.top)/r.height*H};selected=right.agents.reduce((best,a)=>Math.hypot(a.x-p.x,a.y-p.y)<Math.hypot(best.x-p.x,best.y-p.y)?a:best,right.agents[0]).id;draw();};
function circle(ctx,x,y,r,fill,stroke){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}}
function render(canvas,w,inspect){let ctx=canvas.getContext('2d');ctx.clearRect(0,0,W,H);ctx.fillStyle='#182328';ctx.fillRect(0,0,W,H);ctx.strokeStyle='#233137';ctx.lineWidth=1;ctx.beginPath();for(let x=30;x<W;x+=30){ctx.moveTo(x,0);ctx.lineTo(x,H);}for(let y=30;y<H;y+=30){ctx.moveTo(0,y);ctx.lineTo(W,y);}ctx.stroke();ctx.strokeStyle='#38454a';ctx.strokeRect(13,13,W-26,H-26);
for(const s of w.supplies){circle(ctx,s.x,s.y,29,'#7fbebc08','#6b969a');circle(ctx,s.x,s.y,21,null,'#416166');ctx.strokeStyle='#9dbbbd';ctx.beginPath();ctx.moveTo(s.x-7,s.y);ctx.lineTo(s.x+7,s.y);ctx.moveTo(s.x,s.y-7);ctx.lineTo(s.x,s.y+7);ctx.stroke();ctx.font='8px monospace';ctx.fillStyle='#7e9b9f';ctx.textAlign='center';ctx.fillText('補給',s.x,s.y+44);}
for(const r of w.walls){ctx.fillStyle='#101b20';ctx.fillRect(r.x+4,r.y+5,r.w,r.h);ctx.fillStyle='#3b494d';ctx.fillRect(r.x,r.y,r.w,r.h);ctx.strokeStyle='#59666a';ctx.strokeRect(r.x+.5,r.y+.5,r.w-1,r.h-1);}
if($('#fov').checked){for(const a of w.agents.filter(a=>a.alive)){ctx.beginPath();for(let i=0;i<=100;i++){let ang=i/100*Math.PI*2,lo=0,hi=SIGHT;for(let k=0;k<8;k++){let mid=(lo+hi)/2;if(los(w,a,{x:a.x+Math.cos(ang)*mid,y:a.y+Math.sin(ang)*mid}))lo=mid;else hi=mid;}let x=a.x+Math.cos(ang)*lo,y=a.y+Math.sin(ang)*lo;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();ctx.fillStyle='#7fb2ff08';ctx.fill();ctx.strokeStyle='#79a9ec24';ctx.stroke();}}
for(const c of w.civilians){if(!c.alive)continue;if(c.danger){circle(ctx,c.x,c.y,15+Math.sin(w.t*6)*2,null,'#c4bc6b70');}circle(ctx,c.x+2,c.y+3,8,'#00000028');circle(ctx,c.x,c.y,7,'#b4dfb3');circle(ctx,c.x-2,c.y-2,2,'#deefd7');}
for(const z of w.zombies){if(!z.alive)continue;if(!z.active){if(z.converted){circle(ctx,z.x,z.y,9,'#e898ce');circle(ctx,z.x,z.y,12+Math.sin(w.t*12)*2,null,'#ca95dfaa');}else if(z.spawn-w.t<3)circle(ctx,z.x,z.y,12,null,'#e77c7655');continue;}circle(ctx,z.x+2,z.y+3,8,'#00000030');circle(ctx,z.x,z.y,z.radius,z.radius>12?'#ad91fa':z.runner?'#ffba70':'#e17d77');if(z.radius>12)circle(ctx,z.x,z.y,z.radius+3,null,'#c6b5ff88');if(z.dashing){const glow=.35+.3*Math.sin(w.t*9);ctx.globalAlpha=glow;circle(ctx,z.x,z.y,z.radius+8,'#ffcb86');ctx.globalAlpha=1;}if(z.winding)circle(ctx,z.x,z.y,16+Math.sin(w.t*20)*3,null,'#ffc584');if(z.dashing){ctx.strokeStyle='#ffba7088';ctx.beginPath();ctx.moveTo(z.x-z.vx*.12,z.y-z.vy*.12);ctx.lineTo(z.x,z.y);ctx.stroke();}circle(ctx,z.x-2,z.y-2,2,'#ffb1a5');}
for(const a of w.agents){if(!a.alive)continue;let z=w.zombies.find(z=>z.id===a.target&&z.alive);if(z&&$('#targets').checked){ctx.setLineDash([4,7]);ctx.strokeStyle='#8bb5ed60';ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(z.x,z.y);ctx.stroke();ctx.setLineDash([]);circle(ctx,z.x,z.y,13,null,'#90b6e777');}if(inspect&&a.id===selected)circle(ctx,a.x,a.y,19,null,'#9fc7ffb0');ctx.save();ctx.translate(a.x,a.y);ctx.rotate(a.angle);ctx.beginPath();ctx.moveTo(13,0);ctx.lineTo(-8,-8);ctx.lineTo(-4,0);ctx.lineTo(-8,8);ctx.closePath();ctx.fillStyle='#91baff';ctx.fill();ctx.restore();ctx.font='9px monospace';ctx.textAlign='center';ctx.fillStyle='#90a9bc';ctx.fillText(String(a.id+1).padStart(2,'0'),a.x,a.y-23);for(let i=0;i<10;i++){ctx.fillStyle=i<a.ammo?'#94bafa':'#354c5d';ctx.fillRect(a.x-14+i*3,a.y+17,2,3);}if(a.load>0){ctx.strokeStyle='#c6e5f5';ctx.beginPath();ctx.arc(a.x,a.y,17,-Math.PI/2,-Math.PI/2+a.load/1.3*Math.PI*2);ctx.stroke();}}
for(const p of w.shots){ctx.strokeStyle='#eed79e';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(p.x-p.vx*.035,p.y-p.vy*.035);ctx.lineTo(p.x,p.y);ctx.stroke();}ctx.lineWidth=1;
for(const e of w.effects){ctx.globalAlpha=e.ttl/.4;circle(ctx,e.x,e.y,e.type==='melee'?35*(1-e.ttl/.4):14*(1-e.ttl/.4),null,e.type==='civilian'?'#b6d8aa':e.type==='agent'?'#8fbaff':'#f4d8a7');ctx.globalAlpha=1;}
if(w.done){ctx.fillStyle='#111a20c9';ctx.fillRect(W/2-230,H/2-48,460,95);ctx.textAlign='center';ctx.fillStyle='#e4efdf';ctx.font='23px sans-serif';ctx.fillText(`${w.config.civilians} 人之中，${w.civilians.filter(c=>c.alive).length} 人生還`,W/2,H/2-8);ctx.font='12px monospace';ctx.fillStyle='#8da29f';ctx.fillText(`${({'Civilians lost':'平民全數感染','All threats cleared':'已清除所有威脅','Time limit':'時間結束'})[w.endReason]} · ${w.t.toFixed(1)} 秒`,W/2,H/2+20);}}
function inspect(){const a=right.agents[selected]??right.agents[0];$('#selected').textContent=`守衛 ${String(a.id+1).padStart(2,'0')}`;$('#action').textContent=a.alive?(actionNames[a.action]??a.action):'已倒下';$('#ammo').textContent=`${a.ammo} / 10`;$('#health').textContent=Math.max(0,Math.round(a.hp));$('#target').textContent=a.target===null?'—':`喪屍 ${a.target+1}`;$('#eta').textContent=Number.isFinite(a.eta)?`${a.eta.toFixed(1)} 秒`:'—';$('#observed-motion').textContent=a.estimate?`觀察速度 ${a.estimate.speed.toFixed(0)}／秒 · ${a.estimate.confidence?'已追蹤':'首次看到'} · 目擊命中 ${a.estimate.hits} 次`:'觀察速度 — · 目擊命中 —';$('#utilities').replaceChildren(...a.scores.map(s=>{let el=document.createElement('div');el.className='utility';const row=document.createElement('div'),label=document.createElement('span'),value=document.createElement('span');label.textContent=`${actionNames[s.action]??s.action} ${s.label==='station'?'補給站':s.label==='waypoint'?'路線':s.label}`;value.textContent=s.score.toFixed(2);row.append(label,value);const bar=document.createElement('div');bar.className='bar';const fill=document.createElement('i');fill.style.width=`${Math.max(0,Math.min(100,s.score/12*100))}%`;bar.append(fill);el.append(row,bar);return el;}));}
function draw(){if(!left||max)return;if(mode==='compare')render($('#before'),left,false);render($('#after'),right,true);for(const [key,w] of [['before',left],['after',right]]){$('#'+key+'-alive').textContent=`${w.civilians.filter(c=>c.alive).length} / ${config.civilians} 人生還`;$('#'+key+'-time').textContent=`${w.t.toFixed(1)} / ${DURATION} 秒`;}inspect();}
function drawChart(){const canvas=$('#chart'),ctx=canvas.getContext('2d'),ww=1200,hh=190;ctx.clearRect(0,0,ww,hh);const pad=45,top=18,bottom=160;ctx.font='11px monospace';ctx.textAlign='right';for(let p=0;p<=100;p+=25){let y=bottom-(bottom-top)*p/100;ctx.strokeStyle='#2a363e';ctx.beginPath();ctx.moveTo(pad,y);ctx.lineTo(ww-40,y);ctx.stroke();ctx.fillStyle='#70838d';ctx.fillText(`${p}%`,ww-1,y+4);ctx.fillText(String(Math.round((config.civilians*100+15)*p/100)),pad-8,y+4);}if(!history.length){ctx.textAlign='center';ctx.fillStyle='#73858c';ctx.font='14px sans-serif';ctx.fillText('開始訓練後，這裡會顯示學習進度。',ww/2,95);return;}
const rows=history.slice(-200);for(const [key,color] of [['train','#91bafe'],['mean','#6d7892'],['survival','#abdfb5'],['anchor','#d9b780']]){ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();rows.forEach((r,i)=>{let value=key==='train'?r.train.fitness/(config.civilians*100+15):key==='mean'?r.mean/(config.civilians*100+15):key==='anchor'?r.anchor.survival:r.bestValidation.survival;let x=pad+i/Math.max(1,rows.length-1)*(ww-pad-40),y=bottom-Math.min(1,value)*(bottom-top);i&&r.level===rows[i-1].level&&r.enemyVersion===rows[i-1].enemyVersion?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();if(rows.length===1){let r=rows[0],value=key==='train'?r.train.fitness/(config.civilians*100+15):key==='mean'?r.mean/(config.civilians*100+15):key==='anchor'?r.anchor.survival:r.bestValidation.survival;circle(ctx,pad,bottom-Math.min(1,value)*(bottom-top),3,color);}}
rows.forEach((r,i)=>{if(i&&(r.level!==rows[i-1].level||r.enemyVersion!==rows[i-1].enemyVersion)){let x=pad+i/Math.max(1,rows.length-1)*(ww-pad-40);ctx.setLineDash([3,4]);ctx.strokeStyle='#708975';ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,bottom);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#b5cbb6';ctx.font='10px monospace';ctx.fillText(`難度${r.level}／敵${r.enemyVersion}`,x+4,13);}});
ctx.fillStyle='#7b8d97';ctx.font='11px monospace';ctx.textAlign='left';ctx.fillText(`第 ${rows[0].generation} 代`,pad,185);ctx.textAlign='right';ctx.fillText(`第 ${rows.at(-1).generation} 代`,ww-40,185);}
function frame(now){const dt=Math.min(.1,(now-last)/1000||0);last=now;if(playing&&!max){if(right.done&&(mode!=='compare'||left.done)){hold+=dt;if(hold>.8){if($('#new-map').checked){$('#seed').value=(Number($('#seed').value)+1)>>>0;}restart();}}else{acc+=dt*speed;while(acc>=DT){step(left);step(right);acc-=DT;}}draw();}requestAnimationFrame(frame);}
async function boot(){
  $('#train').disabled=true;
  newWorker();updateChallenge();restart();drawChart();requestAnimationFrame(frame);
  let saved=null;
  try{saved=localStorage.getItem(STORAGE_KEY)??localStorage.getItem(LEGACY_KEY);}catch{}
  try{
    if(saved){const migrated=JSON.parse(saved).version<3;restore(saved);notice(migrated?'已保留舊模型，並為新規則重新評估難度。':'已自動還原上次模型及比較記錄。');}
    else {resumeOptions={genome:BASE,generation:0};persist();refreshTimeline();refreshRuns();notice('已準備好建議參數。按「開始訓練」，模型與每代記錄會自動保存。');}
  }catch(e){notice(`無法還原存檔：${e.message}。原始資料仍保留。`);}
  initialized=true;$('#train').disabled=false;
}
boot();
