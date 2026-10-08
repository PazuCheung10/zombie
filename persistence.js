import {DEFAULT,GENES,upgradeGenome} from './sim.js';
import {CHALLENGE_GENES,INITIAL_CHALLENGE} from './challenge.js';
import {Z_BASE,validZombie} from './zombie-policy.js';
export const STORAGE_KEY='fieldwork-checkpoint-v3',LEGACY_KEY='fieldwork-checkpoint-v2';
export const CONFIG_LIMITS={agents:[2,12],civilians:[6,12],zombies:[12,60],population:[6,100],episodes:[1,10],mutation:[.01,1]};
export function validGenome(g){return Array.isArray(g)&&g.length===GENES.length&&g.every((v,i)=>Number.isFinite(v)&&v>=GENES[i][1]&&v<=GENES[i][2]);}
function validChallenge(c){return c&&CHALLENGE_GENES.every(([k,lo,hi])=>Number.isFinite(c[k])&&c[k]>=lo&&c[k]<=hi);}
function validConfig(c){
  const config={};
  for(const k of Object.keys(DEFAULT)){const v=c?.[k],[lo,hi]=CONFIG_LIMITS[k];if(!Number.isFinite(v)||v<lo||v>hi||(k!=='mutation'&&!Number.isInteger(v)))throw Error(`Invalid saved ${k}.`);config[k]=v;}
  return config;
}
export function validateCheckpoint(s,config){
  if(!s||!validGenome(s.best)||!validGenome(s.origin)||!Array.isArray(s.population)||s.population.length!==config.population||!s.population.every(validGenome)||!validChallenge(s.challenge)||!Array.isArray(s.hall)||s.hall.length>4||!s.hall.every(validChallenge)||!Array.isArray(s.adversaries)||s.adversaries.length>8||!s.adversaries.every(validChallenge)||typeof s.curriculum!=='boolean'||typeof s.evolveZombies!=='boolean')throw Error('Invalid training checkpoint.');
  for(const k of ['generation','level','levelAge','mastery','attempts','randomState','zombieGeneration','enemyVersion'])if(!Number.isSafeInteger(s[k])||s[k]<0)throw Error(`Invalid checkpoint ${k}.`);
  if(!Number.isSafeInteger(s.lastAttempt)||s.lastAttempt < -100||s.randomState>4294967295)throw Error('Invalid random state.');
  if(!validZombie(s.zombieBest)||!Array.isArray(s.zombiePopulation)||s.zombiePopulation.length!==6||!s.zombiePopulation.every(validZombie)||!Array.isArray(s.enemyHall)||s.enemyHall.length>3||!s.enemyHall.every(validZombie)||!Array.isArray(s.defenderHall)||s.defenderHall.length>3||!s.defenderHall.every(validGenome)||!Number.isFinite(s.enemyScore))throw Error('Invalid enemy checkpoint.');
  if(s.pending!==null&&(!validChallenge(s.pending?.challenge)||!Number.isFinite(s.pending.entrySurvival)||s.pending.entrySurvival<.7||s.pending.entrySurvival>1))throw Error('Invalid queued challenge.');
}
export function parseSave(data){
  const d=typeof data==='string'?JSON.parse(data):structuredClone(data);
  if(d.format!=='fieldwork-genome'||![1,2,3].includes(d.version)||!Array.isArray(d.genome))throw Error('Unsupported genome file.');
  const config=validConfig(d.config);
  if(!Number.isSafeInteger(d.generation)||d.generation<0||!Number.isInteger(d.seed)||d.seed<0||d.seed>4294967295)throw Error('Invalid generation or seed.');
  if(d.version<3){
    const genome=upgradeGenome(d.genome);if(!validGenome(genome))throw Error('Invalid legacy genome.');
    // New physics, larger maps and infection invalidate old optimizer scores/challenge gates.
    // Preserve learned defender weights/generation, but warm-start both populations and re-evaluate.
    return {...d,version:3,config,genome,checkpoint:null,challenge:{...INITIAL_CHALLENGE},level:0,archive:[],migrated:true};
  }
  if(!validGenome(d.genome))throw Error('模型格式不正確。');
  if(d.founder&&!validGenome(d.founder))throw Error('起點模型格式不正確。');
  if(d.runId!==undefined&&(typeof d.runId!=='string'||d.runId.length>100))throw Error('分支編號不正確。');
  if(d.zombieGenome&&!validZombie(d.zombieGenome))throw Error('Invalid zombie genome.');
  if(d.checkpoint){validateCheckpoint(d.checkpoint,config);if(d.checkpoint.generation!==d.generation||JSON.stringify(d.checkpoint.best)!==JSON.stringify(d.genome))throw Error('Inconsistent checkpoint.');}
  if(d.challenge&&!validChallenge(d.challenge))throw Error('Invalid saved challenge.');
  if(d.level!==undefined&&(!Number.isSafeInteger(d.level)||d.level<0))throw Error('Invalid level.');
  const archive=d.archive??[];if(!Array.isArray(archive)||archive.length>30)throw Error('Invalid generation archive.');
  for(const item of archive){validConfig(item.config);validateCheckpoint(item.checkpoint,item.config);}
  return {...d,config,archive,challenge:d.checkpoint?.challenge??d.challenge??INITIAL_CHALLENGE};
}
