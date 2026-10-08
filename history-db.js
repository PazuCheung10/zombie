// Browser-native persistence. Large generation snapshots stay outside localStorage.
let opening;
function database(){
  if(!opening)opening=new Promise((resolve,reject)=>{
    const request=indexedDB.open('fieldwork-history',1);
    request.onupgradeneeded=()=>{
      const db=request.result;
      db.createObjectStore('checkpoints',{keyPath:'key'});
      db.createObjectStore('runs',{keyPath:'run'});
      const metadata=db.createObjectStore('metadata',{keyPath:'key'});
      metadata.createIndex('run','run');
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
  return opening;
}
export async function saveGeneration(run,config,checkpoint){
  if(!checkpoint)return null;
  const db=await database(),key=`${run}:${checkpoint.generation}`;
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(['checkpoints','metadata','runs'],'readwrite');
    tx.objectStore('checkpoints').put({key,config,checkpoint});
    tx.objectStore('runs').put({run,generation:checkpoint.generation});
    tx.objectStore('metadata').put({key,run,generation:checkpoint.generation,level:checkpoint.level,enemyVersion:checkpoint.enemyVersion});
    tx.oncomplete=()=>resolve(key);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??Error('Storage transaction aborted'));
  });
}
export async function listGenerations(run){
  const db=await database();
  return new Promise((resolve,reject)=>{
    const request=db.transaction('metadata').objectStore('metadata').index('run').getAll(run);
    request.onsuccess=()=>resolve(request.result.sort((a,b)=>a.generation-b.generation));request.onerror=()=>reject(request.error);
  });
}
export async function readGeneration(key){
  const db=await database();
  return new Promise((resolve,reject)=>{
    const request=db.transaction('checkpoints').objectStore('checkpoints').get(key);
    request.onsuccess=()=>resolve(request.result??null);request.onerror=()=>reject(request.error);
  });
}
export function milestoneRecords(records,interval=500){
  return records.filter((r,i)=>i===0||r.generation%interval===0);
}

export async function listRuns(){
  const db=await database();return new Promise((resolve,reject)=>{
    const request=db.transaction('runs').objectStore('runs').getAll();
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
}
