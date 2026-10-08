import {BASE,GENES,DEFAULT,VALIDATION,rng,clamp,evaluate,id,upgradeGenome} from './sim.js';
import {INITIAL_CHALLENGE,pressure,mutateChallenge,crossoverChallenge,challengeConfig} from './challenge.js';

import {Z_BASE,mutateZombie} from './zombie-policy.js';

export class Evolution {
  constructor(config={}, options={}) {
    this.config={...DEFAULT,...config};
    this.random=rng(41717);
    this.generation=options.generation??0;
    this.curriculum=options.curriculum??true;
    this.level=options.level??0;
    this.levelAge=0;
    this.mastery=0;
    this.attempts=0;
    this.lastAttempt=-100;
    this.challenge={...INITIAL_CHALLENGE,...options.challenge};
    this.hall=[];
    this.pending=null;
    this.adversaries=[];
    this.best=upgradeGenome(options.genome??BASE);
    this.zombieBest=[...(options.zombieGenome??Z_BASE)];this.evolveZombies=options.evolveZombies??true;this.zombieGeneration=0;this.enemyVersion=0;
    this.zombiePopulation=[[...this.zombieBest],...Array.from({length:5},()=>mutateZombie(this.zombieBest,this.random,.5))];
    this.enemyHall=[];this.defenderHall=[];this.enemyScore=0;
    this.origin=[...this.best];
    this.population=[[...this.best]];
    while(this.population.length<this.config.population) {
      this.population.push(options.genome?this.mutate(this.best,.75):GENES.map(([,lo,hi])=>lo+this.random()*(hi-lo)));
    }
    if(options.checkpoint) {
      const s=options.checkpoint;
      for(const k of ['generation','curriculum','level','levelAge','mastery','attempts','lastAttempt','challenge','hall','pending','adversaries','best','origin','population','zombieBest','zombieGeneration','enemyVersion','zombiePopulation','enemyHall','defenderHall','enemyScore','evolveZombies'])this[k]=structuredClone(s[k]);
      this.random.setState(s.randomState);
    }
    this.refreshScores();
  }

  get worldConfig(){return {...challengeConfig(this.config,this.challenge),zombieGenome:this.zombieBest};}
  mutate(parent,rate=this.config.mutation) {
    return GENES.map(([,lo,hi],i)=>{
      let v=parent[i];
      if(this.random()<rate)v+=(hi-lo)*(this.random()+this.random()+this.random()+this.random()-2)*.17;
      return clamp(v,lo,hi);
    });
  }
  assess(genome) {
    const current=evaluate(genome,VALIDATION,this.worldConfig);
    const previous=this.hall.slice(-2);
    const retention=previous.length?previous.reduce((sum,c)=>sum+evaluate(genome,VALIDATION.slice(0,4),{...challengeConfig(this.config,c),zombieGenome:this.zombieBest}).fitness,0)/previous.length:current.fitness;
    const oldEnemies=this.enemyHall.slice(-2);
    const enemyRetention=oldEnemies.length?oldEnemies.reduce((sum,z)=>sum+evaluate(genome,VALIDATION.slice(0,2),{...this.worldConfig,zombieGenome:z}).fitness,0)/oldEnemies.length:current.fitness;
    return {current,score:current.fitness*.8+retention*.1+enemyRetention*.1};
  }
  refreshScores() {
    this.bestAssessment=this.assess(this.best);
    this.bestValidation=this.bestAssessment.current;
    this.baseline=evaluate(BASE,VALIDATION,this.worldConfig);
    this.anchor=evaluate(this.best,VALIDATION,challengeConfig(this.config,INITIAL_CHALLENGE));
  }

  // A second GA breeds scenario parameters against a frozen defender champion.
  // It seeks maximum pressure among empirically survivable proposals, not total defeat.
  breedChallenge() {
    this.attempts++;
    const seeds=Array.from({length:3},(_,i)=>30000+this.attempts*17+i);
    let population=Array.from({length:8},()=>mutateChallenge(this.challenge,this.random,this.challenge));
    for(let round=0;round<2;round++) {
      const ranked=population.map(c=>{
        const m=evaluate(this.best,seeds,{...challengeConfig(this.config,c),zombieGenome:this.zombieBest});
        const viable=m.survival>=.70&&m.worstSurvival>=.5;
        return {c,m,score:viable?1-m.survival+.08*m.danger+.02*pressure(c):-10+m.survival};
      }).sort((a,b)=>b.score-a.score);
      this.adversaries=ranked.map(x=>x.c);
      if(round===1)break;
      population=ranked.slice(0,2).map(x=>x.c);
      while(population.length<8) {
        const a=ranked[Math.floor(this.random()*4)].c,b=ranked[Math.floor(this.random()*4)].c;
        population.push(mutateChallenge(crossoverChallenge(a,b,this.random),this.random,this.challenge));
      }
    }
    // Confirm on all validation seeds, not only the adversary's search seeds.
    for(const c of this.adversaries.slice(0,4)) {
      if(pressure(c)<=pressure(this.challenge)+.005)continue;
      const m=evaluate(this.best,VALIDATION,{...challengeConfig(this.config,c),zombieGenome:this.zombieBest});
      if(m.survival>=.70&&m.worstSurvival>=.5)return {challenge:c,entrySurvival:m.survival};
    }
    return null;
  }

  trainZombies() {
    this.zombieGeneration++;
    const seeds=[42000+this.zombieGeneration%11*5,42001+this.zombieGeneration%11*5];
    const opponents=[this.best,this.defenderHall.at(-1)??this.origin];
    const ranked=this.zombiePopulation.map(g=>({g,score:opponents.reduce((sum,d)=>sum+evaluate(d,seeds,{...this.worldConfig,zombieGenome:g}).enemyFitness,0)/opponents.length})).sort((a,b)=>b.score-a.score);
    const incumbent=evaluate(this.best,VALIDATION.slice(0,4),this.worldConfig);
    let accepted=null;
    // Enemy reward itself contains no robot-kill bonus. The survival floor is a curriculum gate.
    for(const candidate of ranked.slice(0,3)) {
      const m=evaluate(this.best,VALIDATION.slice(0,4),{...this.worldConfig,zombieGenome:candidate.g});
      if(m.enemyFitness>incumbent.enemyFitness+.01&&m.survival>=.55&&m.worstSurvival>=.2){accepted=candidate;this.enemyScore=m.enemyFitness;break;}
    }
    if(accepted){
      this.enemyHall.push([...this.zombieBest]);this.enemyHall=this.enemyHall.slice(-3);
      this.zombieBest=[...accepted.g];this.enemyVersion++;this.mastery=0;
      this.pending=null;this.refreshScores();
    }else this.enemyScore=incumbent.enemyFitness;
    const next=[ranked[0].g,this.zombieBest];
    while(next.length<6){const a=ranked[Math.floor(this.random()*3)].g,b=ranked[Math.floor(this.random()*3)].g;next.push(mutateZombie(a.map((v,i)=>this.random()<.5?v:b[i]),this.random));}
    this.zombiePopulation=next;
    return !!accepted;
  }

  next() {
    let promoted=false,enemyChanged=false;
    if(this.evolveZombies&&this.generation>0&&this.generation%4===0)enemyChanged=this.trainZombies();
    if(this.pending) {
      this.hall.push({...this.challenge});this.hall=this.hall.slice(-4);
      this.challenge=this.pending.challenge;
      this.pending=null;this.level++;this.levelAge=0;this.mastery=0;
      // Population and learned weights survive the move. Old fitness does not.
      this.refreshScores();promoted=true;
    }
    const seeds=Array.from({length:this.config.episodes},(_,i)=>1000+(this.generation%7)*31+i*7);
    const ranked=this.population.map(g=>({g,m:evaluate(g,seeds,this.worldConfig)})).sort((a,b)=>b.m.fitness-a.m.fitness);
    const champion=ranked[0],assessment=this.assess(champion.g);
    if(assessment.score>this.bestAssessment.score) {
      this.best=[...champion.g];this.bestAssessment=assessment;this.bestValidation=assessment.current;
      this.anchor=evaluate(this.best,VALIDATION,challengeConfig(this.config,INITIAL_CHALLENGE));
    }
    this.generation++;this.levelAge++;
    this.mastery=this.bestValidation.survival>=.90&&this.bestValidation.worstSurvival>=.5?this.mastery+1:0;
    let lesson='Learning current challenge';
    if(this.curriculum&&this.mastery>=4&&this.levelAge>=6&&this.generation-this.lastAttempt>=6) {
      this.lastAttempt=this.generation;
      this.pending=this.breedChallenge();
      lesson=this.pending?'Harder, survivable challenge queued':'Holding difficulty: no safe harder candidate';
    }
    if(!this.curriculum)lesson='Difficulty locked';
    if(this.generation%10===0){this.defenderHall.push([...this.best]);this.defenderHall=this.defenderHall.slice(-3);}
    const report={zombieBest:this.zombieBest,zombieGeneration:this.zombieGeneration,enemyVersion:this.enemyVersion,enemyScore:this.enemyScore,enemyChanged,generation:this.generation,champion:champion.g,best:this.best,championId:id(champion.g),bestId:id(this.best),train:champion.m,mean:ranked.reduce((s,x)=>s+x.m.fitness,0)/ranked.length,validation:assessment.current,bestValidation:this.bestValidation,baseline:this.baseline,seeds,level:this.level,challenge:this.challenge,anchor:this.anchor,mastery:this.mastery,lesson,promoted,pending:this.pending,levelAge:this.levelAge};
    const r=this.random,n=this.config.population;
    const select=()=>{const a=ranked[Math.floor(r()*n)],b=ranked[Math.floor(r()*n)];return a.m.fitness>b.m.fitness?a.g:b.g;};
    const next=[ranked[0].g,ranked[1].g,this.best];
    while(next.length<n) {
      const a=select(),b=select();
      next.push(this.mutate(a.map((v,i)=>r()<.5?v:b[i])));
    }
    this.population=next.slice(0,n);
    report.checkpoint=this.snapshot();
    return report;
  }
  snapshot() {
    const s={randomState:this.random.getState()};
    for(const k of ['generation','curriculum','level','levelAge','mastery','attempts','lastAttempt','challenge','hall','pending','adversaries','best','origin','population','zombieBest','zombieGeneration','enemyVersion','zombiePopulation','enemyHall','defenderHall','enemyScore','evolveZombies'])s[k]=structuredClone(this[k]);
    return s;
  }
}
