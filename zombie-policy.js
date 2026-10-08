// A deliberately small feed-forward policy: 10 observations -> 6 tanh units -> 3 outputs.
// Outputs: target utility, throttle, lateral steering. No enemy subtype/health inputs.
export const Z_INPUTS=10,Z_HIDDEN=6,Z_OUTPUTS=3;
export const Z_SIZE=Z_HIDDEN*(Z_INPUTS+1)+Z_OUTPUTS*(Z_HIDDEN+1);
export const Z_BASE=Array(Z_SIZE).fill(0);
// Weak, evolvable initialization: prefer visible civilians and move forward.
Z_BASE[3]=1; // target category (civilian +1, defender -1)
Z_BASE[Z_INPUTS+1+2]=-1; // distance
Z_BASE[Z_HIDDEN*(Z_INPUTS+1)]=.7;
Z_BASE[Z_HIDDEN*(Z_INPUTS+1)+1]=.5;
Z_BASE[Z_HIDDEN*(Z_INPUTS+1)+(Z_HIDDEN+1)+Z_HIDDEN]=1.1;
export function zombieNetwork(weights,inputs){
  const hidden=[];let offset=0;
  for(let j=0;j<Z_HIDDEN;j++){
    let sum=weights[offset+Z_INPUTS];
    for(let i=0;i<Z_INPUTS;i++)sum+=weights[offset+i]*inputs[i];
    hidden.push(Math.tanh(sum));offset+=Z_INPUTS+1;
  }
  const output=[];
  for(let j=0;j<Z_OUTPUTS;j++){
    let sum=weights[offset+Z_HIDDEN];
    for(let i=0;i<Z_HIDDEN;i++)sum+=weights[offset+i]*hidden[i];
    output.push(Math.tanh(sum));offset+=Z_HIDDEN+1;
  }
  return output;
}
export function mutateZombie(parent,random,rate=.18){
  return parent.map(v=>Math.max(-3,Math.min(3,v+(random()<rate?(random()+random()-1)*.65:0))));
}
export function validZombie(g){return Array.isArray(g)&&g.length===Z_SIZE&&g.every(v=>Number.isFinite(v)&&Math.abs(v)<=3);}
