import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Evolution} from './evolution.js';
import {BASE,DEFAULT,evaluate,VALIDATION,id} from './sim.js';
import {INITIAL_CHALLENGE,mutateChallenge,CHALLENGE_GENES} from './challenge.js';
import {parseSave} from './persistence.js';
import {rememberGeneration,branchRecord,archiveKey} from './timeline.js';
import {Z_BASE,validZombie} from './zombie-policy.js';
const saved=parseSave(fs.readFileSync('fixtures/legacy-gen47.json','utf8'));
assert.equal(saved.version,3);assert.equal(saved.genome.length,20);assert.equal(saved.generation,47);assert.equal(saved.migrated,true);
const config={...DEFAULT,population:6,episodes:1};
const e=new Evolution(config,{genome:saved.genome,generation:47,curriculum:false,evolveZombies:false});
assert.deepEqual(e.best,saved.genome);assert.deepEqual(e.population[0],saved.genome);
e.next();const snapshot=e.snapshot();
const record={format:'fieldwork-genome',version:3,genome:e.best,config,generation:e.generation,seed:8101,checkpoint:snapshot};
const parsed=parseSave(JSON.stringify(record));const resumed=new Evolution(config,{checkpoint:parsed.checkpoint});
assert.deepEqual(resumed.next(),e.next(),'exact defender, enemy population and RNG restoration');
assert.equal(e.level,0);assert.equal(e.zombieGeneration,0);
const bad=structuredClone(record);bad.checkpoint.zombiePopulation[0][0]=99;assert.throws(()=>parseSave(bad));
const archive=rememberGeneration([],config,snapshot);assert.equal(archive.length,1);
assert.equal(rememberGeneration(archive,config,snapshot).length,1);
const fork=parseSave(branchRecord(archive[0],999,archive));const forked=new Evolution(fork.config,{checkpoint:fork.checkpoint});
assert.equal(fork.generation,48);assert.deepEqual(forked.next(),new Evolution(config,{checkpoint:snapshot}).next());
fork.checkpoint.population[0][0]=0;assert.notDeepEqual(fork.checkpoint.population,archive[0].checkpoint.population,'fork cannot mutate archived population');
let many=[];for(let i=0;i<40;i++){const copy=structuredClone(snapshot);copy.generation=i;many=rememberGeneration(many,config,copy);}assert.equal(many.length,30);assert.equal(many[0].checkpoint.generation,0);assert.equal(many.at(-1).checkpoint.generation,39);
assert.equal(parseSave({...record,archive:many}).archive.length,30);

// A real enemy GA round breeds network weights while defender policy is frozen.
const co=new Evolution(config,{genome:saved.genome,generation:48,curriculum:false});
const initialWeights=co.zombiePopulation.map(id);const report=co.next();
assert.equal(report.zombieGeneration,1);assert.ok(co.zombiePopulation.every(validZombie));assert.notDeepEqual(co.zombiePopulation.map(id),initialWeights);
const continuation=new Evolution(config,{checkpoint:co.snapshot()});assert.deepEqual(co.next(),continuation.next());

// An explicit pending lesson is re-evaluated, while learned populations carry forward.
const advance=new Evolution(config,{genome:saved.genome,curriculum:false,evolveZombies:false});
advance.pending={challenge:{...INITIAL_CHALLENGE,extra:1},entrySurvival:.9};
const oldBest=[...advance.best],upgraded=advance.next();assert.equal(upgraded.level,1);assert.equal(upgraded.promoted,true);
assert.deepEqual(upgraded.baseline,evaluate(BASE,VALIDATION,advance.worldConfig));assert.equal(advance.hall.length,1);
assert.ok(advance.population.some(g=>JSON.stringify(g)===JSON.stringify(oldBest))||upgraded.bestValidation.fitness>=advance.baseline.fitness);
console.log('PASS: legacy migration, exact dual-population resume, corruption rejection, bounded generation archive, branch replay, neural enemy breeding, level transitions and score re-evaluation.');

const {milestoneRecords}=await import('./history-db.js');
const rows=[0,1,100,499,500,501,1000].map(generation=>({generation}));
assert.deepEqual(milestoneRecords(rows).map(r=>r.generation),[0,500,1000]);
assert.deepEqual(milestoneRecords(rows,100).map(r=>r.generation),[0,100,500,1000]);
console.log('PASS: automatic start and configurable generation milestones.');
