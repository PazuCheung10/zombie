import {id} from './sim.js';
export function archiveKey(checkpoint){return `${checkpoint.generation}-${checkpoint.enemyVersion}-${id(checkpoint.best)}`;}
export function rememberGeneration(archive,config,checkpoint){
  if(!checkpoint)return archive;
  const key=archiveKey(checkpoint);
  if(archive.some(item=>archiveKey(item.checkpoint)===key))return archive;
  const next=[...archive,{config:structuredClone(config),checkpoint:structuredClone(checkpoint)}];
  return next.length>30?[next[0],...next.slice(-29)]:next;
}
export function branchRecord(item,seed,archive){
  const checkpoint=structuredClone(item.checkpoint);
  return {format:'fieldwork-genome',version:3,genome:checkpoint.best,config:structuredClone(item.config),seed,generation:checkpoint.generation,checkpoint,challenge:checkpoint.challenge,level:checkpoint.level,archive:structuredClone(archive)};
}
