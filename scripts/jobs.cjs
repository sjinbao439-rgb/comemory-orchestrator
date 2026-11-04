const fs=require('node:fs');
const states=new Set(['planned','queued','generating','ready','failed','obsolete']);
function taskKey(sessionId,sceneId,revision,clipIndex){
 if(typeof sessionId!=='string'||!sessionId||typeof sceneId!=='string'||!sceneId||!Number.isInteger(revision)||revision<1||!Number.isInteger(clipIndex)||clipIndex<0)throw Error('Invalid task identity');
 return [encodeURIComponent(sessionId),encodeURIComponent(sceneId),revision,clipIndex].join('/');
}
function makeTasks(sessionId,scene){
 if(!scene||typeof scene.prompt!=='string'||!scene.prompt.trim()||typeof scene.imagePrompt!=='string'||!scene.imagePrompt.trim()||typeof scene.negativePrompt!=='string'||!scene.timing||scene.timing.blocked||!Array.isArray(scene.timing.clips)||!scene.timing.clips.length)throw Error('Scene requires prompts and verified timing capabilities');
 if(scene.clipPrompts!==undefined&&(!Array.isArray(scene.clipPrompts)||scene.clipPrompts.length!==scene.timing.clips.length||scene.clipPrompts.some(p=>typeof p!=='string'||!p.trim())))throw Error('clipPrompts must match the clip count');
 return scene.timing.clips.map((clip,clipIndex)=>{
  if(!Number.isFinite(clip.generateSeconds)||!Number.isFinite(clip.displaySeconds)||clip.displaySeconds<=0||clip.displaySeconds>clip.generateSeconds||!Number.isFinite(clip.trimSeconds)||Math.abs(clip.trimSeconds-(clip.generateSeconds-clip.displaySeconds))>.002)throw Error('Invalid clip timing');
  const previousKey=clipIndex>0?taskKey(sessionId,scene.id,scene.revision,clipIndex-1):null;
  return {taskKey:taskKey(sessionId,scene.id,scene.revision,clipIndex),sessionId,sceneId:scene.id,revision:scene.revision,clipIndex,imagePrompt:scene.imagePrompt,prompt:scene.clipPrompts?.[clipIndex]??scene.prompt,negativePrompt:scene.negativePrompt,dependsOn:previousKey?[previousKey]:[],reference:previousKey?{source:'previous_clip_last_frame',taskKey:previousKey}:{source:'scene_first_frame'},...clip,status:'planned'};
 });
}
function acceptResult(task,scene,result){
 if(!task||!scene||!result)return {accepted:false,reason:'missing_metadata'};
 if(scene.id!==task.sceneId||scene.revision!==task.revision||scene.executionStatus==='obsolete'||result.taskKey!==task.taskKey||['obsolete','failed'].includes(task.status))return {accepted:false,reason:'stale_or_mismatched_task'};
 if(result.status!=='ready'||result.assetVerified!==true||typeof result.artifactUri!=='string'||!result.artifactUri.trim()||!Number.isFinite(result.artifactDurationSeconds))return {accepted:false,reason:'unverified_asset'};
 if(Math.abs(result.artifactDurationSeconds-task.generateSeconds)>.15||result.artifactDurationSeconds+.01<task.displaySeconds)return {accepted:false,reason:'duration_mismatch'};
 return {accepted:true,reason:'metadata_valid',artifactUri:result.artifactUri,artifactDurationSeconds:result.artifactDurationSeconds};
}
function decideClose({ended=false,bufferSourceIds=[],tasks=[],playbackEnded=false,nowMs=0,deadlineMs=null}={}){
 if(!Array.isArray(bufferSourceIds)||!Array.isArray(tasks)||tasks.some(t=>!t||!states.has(t.status)))throw Error('Invalid session state');
 if(!Number.isFinite(nowMs)||deadlineMs!==null&&!Number.isFinite(deadlineMs))throw Error('Invalid deadline');
 if(!ended)return {action:'continue'};
 if(bufferSourceIds.length)return {action:'finalize_buffer',sourceIds:bufferSourceIds};
 const pending=tasks.filter(t=>['planned','queued','generating'].includes(t.status));
 if(pending.length)return {action:deadlineMs!==null&&nowMs>=deadlineMs?'expire_tasks':'wait_generation',taskKeys:pending.map(t=>t.taskKey)};
 if(!playbackEnded)return {action:'finish_playback'};
 return {action:tasks.some(t=>t.status==='failed')?'archive_partial':tasks.some(t=>t.status==='ready')?'archive_complete':'archive_text_only'};
}
module.exports={taskKey,makeTasks,acceptResult,decideClose};
if(require.main===module){try{const [command,file]=process.argv.slice(2);if(!file)throw Error('Usage: node jobs.cjs tasks|result|close <input.json>');const data=JSON.parse(fs.readFileSync(file,'utf8'));const out=command==='tasks'?makeTasks(data.sessionId,data.scene):command==='result'?acceptResult(data.task,data.scene,data.result):command==='close'?decideClose(data):null;if(out===null)throw Error('Unknown command');console.log(JSON.stringify(out,null,2))}catch(e){console.error(e.message);process.exitCode=1}}
