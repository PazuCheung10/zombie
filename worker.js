import {Evolution} from './evolution.js';
let evolution,running=false,token=0;
onmessage=({data})=>{
  try {
    if(data.type==='reset'){running=false;token++;evolution=null;}
    if(data.type==='start'){
      if(!evolution){
        evolution=new Evolution(data.config,data.options);
        postMessage({type:'ready',baseline:evolution.baseline,checkpoint:evolution.snapshot()});
      }
      evolution.curriculum=data.curriculum!==false;
      evolution.evolveZombies=data.evolveZombies!==false;
      if(!running){running=true;loop(++token);}
    }
    if(data.type==='pause'){running=false;token++;postMessage({type:'paused'});}
    if(data.type==='enemy-training'&&evolution)evolution.evolveZombies=data.value;
    if(data.type==='curriculum'&&evolution){evolution.curriculum=data.value;if(!data.value)evolution.pending=null;}
  }catch(e){running=false;postMessage({type:'error',message:e.message});}
};
function loop(t){
  if(!running||t!==token)return;
  try{postMessage({type:'generation',...evolution.next()});setTimeout(()=>loop(t),0);}
  catch(e){running=false;postMessage({type:'error',message:e.message});}
}
