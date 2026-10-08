import fs from 'node:fs';
import {Evolution} from './evolution.js';
import {episode,DEFAULT,evaluate,BASE} from './sim.js';
import {parseSave} from './persistence.js';
const saved=parseSave(fs.readFileSync('fixtures/legacy-gen47.json','utf8'));
const e=new Evolution(saved.config,{genome:saved.genome,generation:saved.generation});
const start=Date.now();const rows=[];
for(let i=0;i<48;i++){
 const r=e.next();
 rows.push({generation:r.generation,level:r.level,survival:r.bestValidation.survival,seconds:r.train.seconds,anchor:r.anchor.survival,pending:!!r.pending,challenge:r.challenge});
 if(i%6===0||r.promoted||r.pending)console.log(JSON.stringify(rows.at(-1)));
}
const seeds=Array.from({length:16},(_,i)=>50000+i);
const results={elapsedSeconds:(Date.now()-start)/1000,rows,testCurrent:evaluate(e.best,seeds,e.worldConfig),testLegacy:evaluate(saved.genome,seeds,e.worldConfig),testBase:evaluate(e.best,seeds,DEFAULT)};
fs.writeFileSync('checkpoints/curriculum-benchmark.json',JSON.stringify(results,null,2));
console.log(JSON.stringify({elapsed:results.elapsedSeconds,level:e.level,trained:results.testCurrent.survival,legacy:results.testLegacy.survival,base:results.testBase.survival}));
