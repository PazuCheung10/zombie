import {Evolution} from './evolution.js';
import {evaluate,BASE} from './sim.js';
const e=new Evolution({}, {curriculum:false,evolveZombies:false});console.log('baseline validation',e.baseline);const start=Date.now();for(let i=0;i<20;i++){let r=e.next();console.log(r.generation,r.train.survival.toFixed(3),r.bestValidation.survival.toFixed(3),Math.round((Date.now()-start)/1000)+'s');}const seeds=Array.from({length:30},(_,i)=>21000+i);console.log('UNSEEN TEST',JSON.stringify({baseline:evaluate(BASE,seeds,e.config),evolved:evaluate(e.best,seeds,e.config),genome:e.best}));
