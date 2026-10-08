// Scenario genomes, separate from the defenders' policy genes.
// Values describe pressure; all limits are deliberate CPU/solvability guardrails.
export const CHALLENGE_GENES = [
  ['extra', 0, 60, 3],
  ['speed', 1, 1.55, .035],
  ['runners', 0, .65, .06],
  ['spread', 0, 1, .09],
  ['wave', 1, 2.4, .10],
];
export const INITIAL_CHALLENGE = {extra:0, speed:1, runners:0, spread:0, wave:1};
export function normalizeChallenge(value={}) {
  return Object.fromEntries(CHALLENGE_GENES.map(([key,lo,hi])=>[
    key, Math.max(lo,Math.min(hi,Number.isFinite(value[key])?value[key]:INITIAL_CHALLENGE[key]))
  ]));
}
export function pressure(c) {
  return CHALLENGE_GENES.reduce((s,[k,lo,hi])=>s+(c[k]-lo)/(hi-lo),0);
}
export function mutateChallenge(parent, random, frontier=parent) {
  const child={...parent};
  for(const [key,lo,hi,step] of CHALLENGE_GENES) {
    // Every proposal stays within one small lesson of the current frontier.
    child[key]=Math.max(lo,Math.min(hi,frontier[key]+step,
      Math.max(frontier[key]-step*.35,parent[key]+(random()-.30)*step)));
  }
  return child;
}
export function crossoverChallenge(a,b,random) {
  return Object.fromEntries(CHALLENGE_GENES.map(([k])=>[k,random()<.5?a[k]:b[k]]));
}
export function challengeConfig(config,challenge) {
  return {...config,challenge:normalizeChallenge(challenge)};
}
