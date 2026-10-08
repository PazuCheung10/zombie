import assert from 'node:assert/strict';
import {createWorld,step,metrics,evaluate,BASE,DEFAULT,DURATION,DT,W,H,los,senseDefender,infect,upgradeGenome} from './sim.js';
import {Z_BASE,Z_SIZE,zombieNetwork} from './zombie-policy.js';

const a=createWorld(42),b=createWorld(42);
while(!a.done){step(a);step(b);assert.deepEqual(a,b);}
assert.ok(a.t<=DURATION);assert.ok(a.endReason);
assert.deepEqual(createWorld(42).walls,createWorld(42).walls);
assert.notDeepEqual(createWorld(42).walls,createWorld(43).walls);
for(let seed=1;seed<=20;seed++){
  const w=createWorld(seed);
  assert.ok(w.walls.length>=4&&w.walls.length<=7);
  for(const e of [...w.agents,...w.civilians,...w.zombies,...w.supplies])for(const wall of w.walls)assert.ok(e.x<wall.x-20||e.x>wall.x+wall.w+20||e.y<wall.y-20||e.y>wall.y+wall.h+20,'spawn has wall clearance');
}
const layoutA=createWorld(99),layoutB=createWorld(99,DEFAULT,BASE.map((x,i)=>i===4?1:x));
assert.deepEqual(layoutA.walls,layoutB.walls);assert.deepEqual(layoutA.zombies,layoutB.zombies);assert.deepEqual(layoutA.civilians,layoutB.civilians);
assert.equal(upgradeGenome(BASE.slice(0,15)).length,20);

// Perception measures positions and observed impacts, never reads hidden health or velocity.
const sensed=createWorld(21);sensed.walls=[];const observer=sensed.agents[0],z=sensed.zombies[0];
observer.x=100;observer.y=100;z.x=170;z.y=100;z.active=true;z.spawn=0;sensed.zombies=[z];
let first=senseDefender(sensed,observer);assert.equal(first[0].confidence,0);assert.equal(first[0].vx,0);
sensed.t=.2;z.x+=20;z.vx=-9999;z.speed=9999;z.hp=9999;
const measured=senseDefender(sensed,observer);assert.equal(measured[0].vx,80);assert.equal(measured[0].confidence,1);
assert.ok(!('hp' in measured[0])&&!('speed' in measured[0])&&!('runner' in measured[0]));
const copy=structuredClone(sensed);copy.zombies[0].hp=1;copy.zombies[0].vx=20;copy.zombies[0].speed=2;copy.zombies[0].runner=!z.runner;
assert.deepEqual(senseDefender(copy,copy.agents[0]),senseDefender(sensed,observer));
sensed.walls=[{x:125,y:80,w:20,h:50}];assert.equal(los(sensed,observer,z),false);assert.equal(senseDefender(sensed,observer).length,0);

function targetWorld(hp=3){const w=createWorld(11);w.walls=[];w.agents=[];const z={...w.zombies[0],x:100,y:100,speed:0,hp,radius:8,active:true,spawn:0,runner:false};w.zombies=[z];return w;}
function shot(w){w.shots.push({x:70,y:100,vx:300,vy:0,ttl:1});step(w);}
const tank=targetWorld();shot(tank);assert.equal(tank.zombies[0].hp,2);assert.equal(tank.kills,0);shot(tank);assert.equal(tank.kills,0);shot(tank);assert.equal(tank.kills,1);
const blocked=targetWorld(1);blocked.walls=[{x:85,y:85,w:5,h:30}];shot(blocked);assert.equal(blocked.kills,0);
const behind=targetWorld(1);behind.walls=[{x:115,y:85,w:5,h:30}];behind.shots=[{x:70,y:100,vx:600,vy:0,ttl:1}];step(behind);assert.equal(behind.kills,1,'target hit before wall');

const infection=createWorld(12);infection.walls=[];infection.agents=[];infection.zombies.forEach(z=>z.alive=false);
const victim=infection.civilians[0];infect(infection,victim);infect(infection,victim);
const converted=infection.zombies.at(-1);assert.equal(infection.infections,1);assert.equal(infection.threatCount,DEFAULT.zombies+1);assert.equal(victim.alive,false);
const pos=[converted.x,converted.y];
for(let i=0;i<9;i++){step(infection);assert.deepEqual([converted.x,converted.y],pos);assert.equal(converted.active,false);assert.equal(infection.done,false);}
step(infection);assert.equal(converted.active,true,'activates exactly one second after infection');
const cleared=createWorld(13);cleared.zombies=[];step(cleared);assert.equal(cleared.t,DT);assert.ok(Math.abs(cleared.life-DURATION*DEFAULT.civilians)<1e-7);assert.equal(cleared.endReason,'All threats cleared');
const frozen=structuredClone(cleared);step(cleared);assert.deepEqual(cleared,frozen);
const future=createWorld(13);future.zombies.forEach(z=>{z.spawn=25;z.active=false;});step(future);assert.equal(future.done,false);
const undefended=createWorld(13);undefended.agents.forEach(a=>a.alive=false);step(undefended);assert.equal(undefended.done,false);
const extinct=createWorld(13);extinct.civilians.forEach(c=>c.alive=false);step(extinct);assert.equal(extinct.endReason,'Civilians lost');

// A policy can choose either target category, full stop, or lateral motion.
assert.equal(zombieNetwork(Z_BASE,Array(10).fill(0)).length,3);assert.equal(Z_SIZE,87);
const waiting=[...Z_BASE];waiting[66+7+6]=-3;
const still=createWorld(14,{...DEFAULT,zombieGenome:waiting});still.walls=[];still.agents=[];const stillZ=still.zombies[0];still.zombies=[stillZ];stillZ.x=still.civilians[0].x-140;stillZ.y=still.civilians[0].y;stillZ.spawn=0;
const before=[stillZ.x,stillZ.y];step(still);assert.equal(stillZ.action,'Wait');assert.deepEqual([stillZ.x,stillZ.y],before);
const robotHunter=[...Z_BASE];robotHunter[3]=-1;
const hunter=createWorld(18,{...DEFAULT,zombieGenome:robotHunter});hunter.walls=[];const hz=hunter.zombies[0];hunter.zombies=[hz];hz.x=600;hz.y=400;hz.spawn=0;hunter.civilians[0].x=650;hunter.civilians[0].y=400;hunter.agents[0].x=550;hunter.agents[0].y=400;step(hunter);assert.equal(hz.action,'Pursue defender');
const baseMetrics=metrics(hunter);hunter.agents.forEach(a=>a.alive=false);assert.equal(metrics(hunter).enemyFitness,baseMetrics.enemyFitness,'no direct reward for killing defenders');
console.log('PASS: deterministic randomized maps, spawn clearance, observation privacy and measured velocity, variable HP, ordered collisions, one-second infection, early endings and neural stop/target controls.');
