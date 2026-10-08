import {normalizeChallenge} from './challenge.js';
import {Z_BASE,zombieNetwork} from './zombie-policy.js';
export const W=1200,H=800,DT=.1,DURATION=55,SHOT_SPEED=210,SIGHT=345;
export const DEFAULT={agents:3,civilians:10,zombies:28,population:24,episodes:3,mutation:.20};
export const GENES=[['urgency',0,8],['distance',0,5],['coordination',0,6],['cluster',0,4],['lead',0,1.8],['standOff',25,135],['reloadAt',0,7],['reloadPriority',0,8],['protect',0,5],['retreat',0,6],['meleeRange',0,40],['engage',0,4],['persistence',0,3],['fireRange',90,280],['rescueOverride',0,5],['observedSize',-3,3],['observedResistance',-3,3],['velocityMemory',0,.85],['accelerationLead',0,1],['fireConfidence',0,.8]];
export const BASE=[.15,4,0,0,0,28,0,1,.2,.1,0,2,1,260,0,0,0,.2,0,0];
export function upgradeGenome(g){return g.length===15?[...g,0,0,.2,0,0]:[...g];}
export const VALIDATION=[8101,8102,8103,8104,8105,8106,8107,8108];
export function rng(seed){let s=seed>>>0;const random=()=>{s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};random.getState=()=>s;random.setState=v=>{s=v>>>0;};return random;}
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function segmentEntry(a,b,r,pad=0){
  let lo=0,hi=1;
  for(const [k,min,max] of [['x',r.x-pad,r.x+r.w+pad],['y',r.y-pad,r.y+r.h+pad]]){
    const d=b[k]-a[k];
    if(Math.abs(d)<1e-9){if(a[k]<min||a[k]>max)return Infinity;}
    else{let u=(min-a[k])/d,v=(max-a[k])/d;if(u>v)[u,v]=[v,u];lo=Math.max(lo,u);hi=Math.min(hi,v);if(lo>hi)return Infinity;}
  }
  return lo;
}
export function los(w,a,b){return !w.walls.some(r=>segmentEntry(a,b,r)!==Infinity);}
function seen(w,a,b,radius=SIGHT){return b.alive&&dist(a,b)<radius&&los(w,a,b);}
function pointFree(w,x,y,r=10){return x>r&&x<W-r&&y>r&&y<H-r&&!w.walls.some(b=>x>b.x-r&&x<b.x+b.w+r&&y>b.y-r&&y<b.y+b.h+r);}
function move(w,e,dx,dy,speed){
  const length=Math.hypot(dx,dy);if(length<.01||speed<=0){e.vx=e.vy=0;return;}
  dx/=length;dy/=length;const radius=e.radius??9;
  const valid=(x,y)=>pointFree(w,x,y,radius)&&!w.walls.some(r=>segmentEntry(e,{x,y},r,radius)!==Infinity);
  let nx=e.x+dx*speed*DT,ny=e.y+dy*speed*DT;
  if(!valid(nx,ny)){
    let ok=false;
    for(const a of [.65,-.65,1.2,-1.2,1.65,-1.65,2.3,-2.3]){
      nx=e.x+(dx*Math.cos(a)-dy*Math.sin(a))*speed*DT;ny=e.y+(dx*Math.sin(a)+dy*Math.cos(a))*speed*DT;
      if(valid(nx,ny)){ok=true;break;}
    }
    if(!ok){nx=e.x;ny=e.y;}
  }
  e.vx=(nx-e.x)/DT;e.vy=(ny-e.y)/DT;e.x=nx;e.y=ny;
  if(Math.hypot(e.vx,e.vy)>1)e.angle=Math.atan2(e.vy,e.vx);
}
// Short, disjoint blocks cannot form an enclosed maze. Spawn clearances are explicit.
export function generateWalls(seed,entities){
  const r=rng(seed^0xA11CE),walls=[],count=4+Math.floor(r()*4);
  for(let tries=0;tries<200&&walls.length<count;tries++){
    const horizontal=r()<.5;
    const b={x:130+r()*(W-340),y:100+r()*(H-240),w:horizontal?55+r()*90:22+r()*20,h:horizontal?22+r()*20:55+r()*90};
    if(entities.some(e=>segmentEntry(e,e,b,65)!==Infinity))continue;
    if(walls.some(a=>!(b.x+b.w+70<a.x||a.x+a.w+70<b.x||b.y+b.h+70<a.y||a.y+a.h+70<b.y)))continue;
    walls.push(b);
  }
  return walls;
}
function makeZombie(w,id,x,y,spawn,random,converted=false){
  // Physical traits are sampled independently. Large appearance does not reveal exact health or speed.
  const large=random()<.16,runner=random()<w.challenge.runners;
  const radius=large?14+random()*5:8;
  return {id,x,y,vx:0,vy:0,alive:true,active:spawn===0,spawn,speed:(48+random()*16)*w.challenge.speed*(large?.85+random()*.4:1),radius,hp:large?2+Math.floor(random()*3):1+(random()<.10?1:0),runner,phase:random()*6.28,target:null,dashing:false,winding:false,hitSerial:0,converted,action:'Search',control:null,nextDecision:0};
}
export function createWorld(seed,config=DEFAULT,genome=BASE){
  const c={...DEFAULT,...config},r=rng(seed),challenge=normalizeChallenge(c.challenge);
  const w={seed,config:c,g:upgradeGenome(genome),zGenome:[...(c.zombieGenome??Z_BASE)],t:0,ticks:0,done:false,endReason:null,challenge,threatCount:Math.min(120,c.zombies+Math.round(challenge.extra)),dangerTime:0,civilians:[],zombies:[],agents:[],shots:[],effects:[],kills:0,fired:0,hits:0,life:0,infections:0,walls:[],supplies:[{x:480,y:405},{x:720,y:395}]};
  for(let i=0;i<c.civilians;i++)w.civilians.push({id:i,x:490+(i%2)*220+(r()-.5)*(100+challenge.spread*180),y:340+r()*120,phase:r()*6.28,vx:0,vy:0,alive:true,radius:7,infectedAt:null});
  for(const civilian of w.civilians)civilian.y+=Math.sin(civilian.phase)*challenge.spread*45;
  for(let i=0;i<c.agents;i++)w.agents.push({id:i,x:520+i*160/Math.max(1,c.agents-1),y:400+(i%2?50:-50),vx:0,vy:0,alive:true,hp:100,ammo:10,cool:0,melee:0,load:0,angle:0,target:null,action:'Search',scores:[],tracks:{},observations:[],nextSense:0});
  for(let i=0;i<w.threatCount;i++){
    const angle=r()*Math.PI*2,x=W/2+Math.cos(angle)*(510+r()*40),y=H/2+Math.sin(angle)*(330+r()*35);
    const spawn=i<Math.ceil(w.threatCount*.45)?0:(7+(i-Math.ceil(w.threatCount*.45))*.85)/challenge.wave;
    w.zombies.push(makeZombie(w,i,x,y,spawn,r));
  }
  w.walls=generateWalls(seed,[...w.civilians,...w.agents,...w.supplies,...w.zombies]);
  w.difficulty=Math.round(w.zombies.reduce((sum,z)=>sum+1/Math.max(1,Math.min(...w.civilians.map(c=>dist(z,c)))/z.speed),0)*20);
  return w;
}
function effect(w,e,type){w.effects.push({x:e.x,y:e.y,type,ttl:.4});}
function damage(w,z,amount){
  if(!z.alive)return;z.hp-=amount;z.hitSerial++;effect(w,z,'hit');
  if(z.hp<=0){z.alive=false;w.kills++;}
}
export function infect(w,c){
  if(!c.alive)return;c.alive=false;c.infectedAt=w.t;w.infections++;effect(w,c,'civilian');
  const random=rng((w.seed^Math.imul(c.id+1,2654435761))>>>0);
  const z=makeZombie(w,w.zombies.length,c.x,c.y,w.t+1,random,true);
  // Converted people have ordinary physical traits, but use the same learned zombie policy.
  z.radius=8;z.hp=1;z.speed=48+random()*16;z.runner=false;w.zombies.push(z);w.threatCount++;
}
// Defender observations are constructed from visible positions at 5 Hz.
// No hp, subtype, true velocity, maximum speed, future dash phase or hidden target state crosses this boundary.
export function senseDefender(w,a){
  const current=[];
  for(const z of w.zombies){
    if(!seen(w,a,z))continue; // Dormant visible conversions are threats too.
    if(!z.active&&!z.converted)continue;
    const old=a.tracks[z.id],elapsed=old?w.t-old.time:Infinity,continuous=old&&elapsed<=.31&&elapsed>0;
    let vx=0,vy=0,ax=0,ay=0,hits=0;
    if(continuous){
      const memory=w.g[17],rawX=(z.x-old.x)/elapsed,rawY=(z.y-old.y)/elapsed;
      vx=old.vx*memory+rawX*(1-memory);vy=old.vy*memory+rawY*(1-memory);
      ax=clamp((vx-old.vx)/elapsed,-180,180);ay=clamp((vy-old.vy)/elapsed,-180,180);
      // Only impacts observed while continuously visible count as resistance evidence.
      hits=(old.hits??0)+Math.max(0,z.hitSerial-old.hitSerial);
    }
    const observation={id:z.id,x:z.x,y:z.y,vx,vy,ax,ay,radius:z.radius,hits,confidence:continuous?1:0};
    a.tracks[z.id]={...observation,time:w.t,hitSerial:z.hitSerial};current.push(observation);
  }
  const visibleIds=new Set(current.map(z=>z.id));
  for(const key of Object.keys(a.tracks))if(!visibleIds.has(Number(key)))delete a.tracks[key];
  a.observations=current;return current;
}
function threat(z,civilians){
  let urgency=0,eta=Infinity,cluster=0;
  for(const c of civilians){const d=dist(z,c);const closing=d?Math.max(0,(z.vx*(c.x-z.x)+z.vy*(c.y-z.y))/d):0;eta=Math.min(eta,closing>1?d/closing:Infinity);urgency=Math.max(urgency,Math.max(0,1-d/230));if(d<140)cluster++;}
  return {urgency,eta,cluster:cluster/5};
}
function defender(w,a){
  const g=w.g;
  if(w.ticks>=a.nextSense){senseDefender(w,a);a.nextSense=w.ticks+2;}
  // No firing through a wall or at a target now outside sight between sensor ticks.
  const zs=a.observations.filter(z=>dist(a,z)<SIGHT&&los(w,a,z)),cs=w.civilians.filter(c=>seen(w,a,c)),peers=w.agents.filter(b=>b.id!==a.id&&seen(w,a,b));
  const choices=[];
  for(const z of zs){const th=threat(z,cs),claimed=peers.filter(b=>b.target===z.id).length;
    choices.push({kind:'Engage',target:z,eta:th.eta,score:g[11]+g[0]*th.urgency-g[1]*dist(a,z)/SIGHT-g[2]*claimed+g[3]*th.cluster+g[12]*(a.target===z.id?1:0)+g[15]*(z.radius-8)/12+g[16]*Math.min(z.hits,4)/4});}
  const station=w.supplies.reduce((s,b)=>dist(a,b)<dist(a,s)?b:s,w.supplies[0]);
  const danger=zs.reduce((s,z)=>Math.max(s,threat(z,cs).urgency),0);
  choices.push({kind:'Reload',target:station,score:a.ammo<10?(g[6]-a.ammo)*g[7]/4+(a.ammo===0?3:0)-g[14]*danger:-100});
  for(const c of cs)choices.push({kind:'Protect',target:c,score:g[8]*(.4+zs.reduce((s,z)=>Math.max(s,Math.max(0,1-dist(z,c)/230)),0))-dist(a,c)/SIGHT});
  const close=zs.reduce((s,z)=>!s||dist(a,z)<dist(a,s)?z:s,null);
  if(close)choices.push({kind:'Retreat',target:close,score:g[9]*Math.max(0,1-dist(a,close)/85)});
  choices.push({kind:'Search',target:{x:W/2+Math.cos(w.t*.17+a.id*2.1)*230,y:H/2+Math.sin(w.t*.17+a.id*2.1)*150},score:.05});
  choices.sort((x,y)=>y.score-x.score);const pick=choices[0];
  a.scores=choices.slice(0,4).map(x=>({action:x.kind,label:x.target.id===undefined?(x.kind==='Search'?'waypoint':'station'):`#${x.target.id+1}`,score:x.score}));
  a.action=pick.kind;a.target=pick.kind==='Engage'?pick.target.id:null;a.eta=pick.eta;a.visible=zs.length;
  a.estimate=pick.kind==='Engage'?{speed:Math.hypot(pick.target.vx,pick.target.vy),confidence:pick.target.confidence,hits:pick.target.hits}:null;
  a.cool=Math.max(0,a.cool-DT);a.melee=Math.max(0,a.melee-DT);
  if(close&&dist(a,close)<g[10]&&dist(a,close)<37&&a.melee<=0){
    // Contact is a physical lookup, not a policy observation.
    const actual=w.zombies.find(z=>z.id===close.id&&z.alive&&dist(a,z)<37);
    if(actual){damage(w,actual,1);a.melee=2;effect(w,a,'melee');a.action='Melee';}
  }
  if(pick.kind==='Reload'&&dist(a,station)<24){a.load+=DT;a.action='Reloading';if(a.load>=1.3){a.ammo=10;a.load=0;}a.vx=a.vy=0;return;}a.load=0;
  let dx=pick.target.x-a.x,dy=pick.target.y-a.y,d=Math.hypot(dx,dy),speed=76;
  if(pick.kind==='Engage'){
    if(d<g[5]-10){dx=-dx;dy=-dy;speed=65;}else if(d<g[5]+10)speed=0;
    const z=pick.target;
    if(a.ammo>0&&a.cool<=0&&d<g[13]&&z.confidence>=g[19]){
      const travel=d/SHOT_SPEED,extra=.5*travel*travel*g[18];
      const aimX=z.x+z.vx*travel*g[4]+z.ax*extra,aimY=z.y+z.vy*travel*g[4]+z.ay*extra,angle=Math.atan2(aimY-a.y,aimX-a.x);
      w.shots.push({x:a.x,y:a.y,vx:Math.cos(angle)*SHOT_SPEED,vy:Math.sin(angle)*SHOT_SPEED,ttl:2});
      a.angle=angle;a.aimAngle=angle;a.ammo--;a.cool=.70;w.fired++;
    }
  }
  if(pick.kind==='Retreat'){dx=-dx;dy=-dy;}if(pick.kind==='Protect'&&d<30)speed=0;
  for(const b of peers){if(dist(a,b)<28){dx+=(a.x-b.x)*4;dy+=(a.y-b.y)*4;}}
  move(w,a,dx,dy,speed);if(pick.kind==='Engage'&&a.aimAngle!==undefined)a.angle=a.aimAngle;
}
function zombieDecision(w,z){
  const visibleC=w.civilians.filter(c=>seen(w,z,c,650)).sort((a,b)=>dist(z,a)-dist(z,b)).slice(0,2);
  const visibleA=w.agents.filter(a=>seen(w,z,a,650)).sort((a,b)=>dist(z,a)-dist(z,b)).slice(0,2);
  const nearestShot=w.shots.filter(p=>dist(z,p)<160&&los(w,z,p)).sort((a,b)=>dist(z,a)-dist(z,b))[0];
  let best=null;
  for(const [targets,type] of [[visibleC,1],[visibleA,-1]])for(const target of targets){
    const inputs=[(target.x-z.x)/650,(target.y-z.y)/650,dist(z,target)/650,type,visibleA.length/2,nearestShot?1-dist(z,nearestShot)/160:0,nearestShot?(nearestShot.x-z.x)/160:0,nearestShot?(nearestShot.y-z.y)/160:0,Math.sin(w.t*.8+z.phase),1];
    const [utility,throttle,lateral]=zombieNetwork(w.zGenome,inputs);
    if(!best||utility>best.utility)best={utility,throttle:(throttle+1)/2,lateral,target:{x:target.x,y:target.y,id:target.id,type}};
  }
  z.control=best;z.target=best?.target.id??null;
}
function zombieStep(w,z){
  z.active=w.t+1e-9>=z.spawn;if(!z.active){z.vx=z.vy=0;return;}
  if(w.ticks>=z.nextDecision){zombieDecision(w,z);z.nextDecision=w.ticks+3;}
  const control=z.control;
  if(control){
    let dx=control.target.x-z.x,dy=control.target.y-z.y;
    const sx=dx-control.lateral*dy*.65,sy=dy+control.lateral*dx*.65;
    const cycle=(w.t+z.phase)%4;z.winding=z.runner&&cycle>2.4&&cycle<3;z.dashing=z.runner&&cycle>=3;
    const throttle=control.throttle<.22?0:control.throttle;
    z.action=throttle===0?'Wait':control.target.type===1?'Pursue civilian':'Pursue defender';
    move(w,z,sx,sy,z.speed*throttle*(z.winding?.45:z.dashing?1.55:1));
  }else {z.action='Search';move(w,z,Math.cos(z.phase+w.t*.1),Math.sin(z.phase+w.t*.1),14);}
  // Contacts are physical consequences, independent of target preference.
  for(const c of w.civilians)if(c.alive&&dist(z,c)<z.radius+c.radius+1&&los(w,z,c))infect(w,c);
  for(const a of w.agents)if(a.alive&&dist(z,a)<z.radius+10&&los(w,z,a)){a.hp-=30*DT;if(a.hp<=0){a.alive=false;effect(w,a,'agent');}}
}
export function step(w){
  if(w.done)return;w.ticks++;w.t=w.ticks*DT;w.effects=w.effects.filter(e=>(e.ttl-=DT)>0);
  for(const c of w.civilians){
    if(!c.alive)continue;let nearest=null,dd=Infinity;
    for(const z of w.zombies){if(!z.active||!z.alive)continue;const d=dist(c,z);if(d<dd&&los(w,c,z)){dd=d;nearest=z;}}
    let dx=W/2-c.x+Math.cos(w.t*.4+c.phase)*100,dy=H/2-c.y+Math.sin(w.t*.3+c.phase)*85,speed=9;
    if(nearest&&dd<160){dx=c.x-nearest.x+.16*(W/2-c.x);dy=c.y-nearest.y+.16*(H/2-c.y);speed=dd<55?22:18;}
    for(const b of w.civilians)if(b!==c&&b.alive&&dist(c,b)<18){dx+=(c.x-b.x)*3;dy+=(c.y-b.y)*3;}
    c.danger=dd<110;if(dd<70)w.dangerTime+=DT;move(w,c,dx,dy,speed);w.life+=DT;
  }
  // Snapshot prevents a newly infected entity acting in the same step that created it.
  for(const z of [...w.zombies])if(z.alive)zombieStep(w,z);
  for(const a of w.agents)if(a.alive)defender(w,a);
  for(const p of w.shots){
    const old={x:p.x,y:p.y};p.x+=p.vx*DT;p.y+=p.vy*DT;p.ttl-=DT;
    const wallT=Math.min(Infinity,...w.walls.map(r=>segmentEntry(old,p,r)));
    let first=null,best=wallT;
    for(const z of w.zombies){
      if(!z.alive||(!z.active&&!z.converted))continue;
      const dx=p.x-old.x,dy=p.y-old.y,fx=old.x-z.x,fy=old.y-z.y,aa=dx*dx+dy*dy,bb=2*(fx*dx+fy*dy),cc=fx*fx+fy*fy-(z.radius+2)**2;
      const disc=bb*bb-4*aa*cc;
      if(disc<0||aa===0)continue;
      const t=cc<=0?0:(-bb-Math.sqrt(disc))/(2*aa);
      if(t>=0&&t<=1&&t<best){first=z;best=t;}
    }
    if(first){damage(w,first,1);w.hits++;p.ttl=0;}else if(wallT!==Infinity)p.ttl=0;
  }
  w.shots=w.shots.filter(p=>p.ttl>0);
  if(!w.civilians.some(c=>c.alive))finish(w,'Civilians lost');
  else if(!w.zombies.some(z=>z.alive))finish(w,'All threats cleared');
  else if(w.ticks>=DURATION/DT)finish(w,'Time limit');
}
function finish(w,reason){w.done=true;w.endReason=reason;if(reason==='All threats cleared')w.life+=w.civilians.filter(c=>c.alive).length*Math.max(0,DURATION-w.t);}
export function metrics(w){
  const alive=w.civilians.filter(c=>c.alive).length,agents=w.agents.filter(a=>a.alive).length,time=clamp(w.life/(DURATION*w.config.civilians),0,1);
  return {threats:w.threatCount,survival:alive/w.config.civilians,seconds:w.t,danger:w.dangerTime/(DURATION*w.config.civilians),agentSurvival:agents/w.config.agents,kills:w.kills,infections:w.infections,accuracy:w.fired?w.hits/w.fired:0,enemyFitness:100*(w.config.civilians-alive)+2*(1-time),fitness:100*alive+3*agents+2*time+w.kills/w.threatCount+(w.fired?w.hits/w.fired:0)*.2};
}
export function episode(g,seed,c){const w=createWorld(seed,c,g);while(!w.done)step(w);return metrics(w);}
export function evaluate(g,seeds,c){const m=seeds.map(s=>episode(g,s,c));return {...Object.fromEntries(Object.keys(m[0]).map(k=>[k,m.reduce((sum,v)=>sum+v[k],0)/m.length])),worstSurvival:Math.min(...m.map(x=>x.survival))};}
export function id(g){let h=2166136261;for(const ch of JSON.stringify(g))h=Math.imul(h^ch.charCodeAt(0),16777619);return(h>>>0).toString(16).padStart(8,'0');}
