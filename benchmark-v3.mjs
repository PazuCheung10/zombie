import fs from 'node:fs';
import {Evolution} from './evolution.js';
import {DEFAULT,BASE,evaluate,id} from './sim.js';
import {parseSave} from './persistence.js';
import {Z_BASE} from './zombie-policy.js';
const saved=parseSave(fs.readFileSync('fixtures/legacy-gen47.json','utf8'));
const e=new Evolution(DEFAULT,{genome:saved.genome,generation:47});
const rows=[],start=Date.now();
console.log('initial',e.bestValidation);
for(let i=0;i<16;i++){
 const r=e.next();const row={generation:r.generation,level:r.level,enemyVersion:r.enemyVersion,zombieGeneration:r.zombieGeneration,survival:r.bestValidation.survival,enemyScore:r.enemyScore,seconds:r.train.seconds};rows.push(row);console.log(JSON.stringify(row));
}
const seeds=Array.from({length:16},(_,i)=>62000+i);
const results={elapsedSeconds:(Date.now()-start)/1000,rows,defendersAgainstCurrent:evaluate(e.best,seeds,e.worldConfig),oldDefendersAgainstCurrent:evaluate(saved.genome,seeds,e.worldConfig),defendersAgainstBase:evaluate(e.best,seeds,{...e.worldConfig,zombieGenome:Z_BASE}),enemyId:id(e.zombieBest)};
fs.writeFileSync('checkpoints/v3-benchmark.json',JSON.stringify(results,null,2));
console.log(JSON.stringify(results));
