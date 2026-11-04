const fs=require('node:fs');
const {sourceClock}=require('./timing.cjs');
function validate(input,plan){
 const errors=[];const ok=(v,m)=>{if(!v)errors.push(m)};const arr=v=>Array.isArray(v)?v:[];
 ok(input&&plan&&typeof input==='object'&&typeof plan==='object','Input and plan must be objects');if(!input||!plan||typeof input!=='object'||typeof plan!=='object'||Array.isArray(input)||Array.isArray(plan))return ['Input and plan must be objects'];
 ok(typeof input.sessionId==='string'&&input.sessionId===plan.sessionId,'sessionId mismatch');
 ok(Number.isInteger(plan.revision)&&plan.revision>0,'Invalid plan revision');
 ok(['planning','ready_for_generation','awaiting_capability','complete'].includes(plan.status),'Invalid plan status');
 ok(Array.isArray(input.utterances),'Missing utterances array');
 const utterances=new Map();for(const u of arr(input.utterances)){
  if(!u||typeof u!=='object'){errors.push('Invalid utterance object');continue;}
  ok(typeof u.id==='string'&&!utterances.has(u.id),'Duplicate/invalid utterance ID');utterances.set(u.id,u);
  ok(typeof u.text==='string'&&['elder','young','unknown'].includes(u.speaker)&&typeof u.final==='boolean','Invalid utterance');
  ok(u.startMs===null&&u.endMs===null||Number.isFinite(u.startMs)&&Number.isFinite(u.endMs)&&u.startMs>=0&&u.endMs>u.startMs,'Invalid utterance timestamps');
 }
 for(const k of ['scenes','bufferSourceIds','unresolved','queueActions'])ok(Array.isArray(plan[k]),`Missing array ${k}`);
 const sources=(ids,elder=true)=>Array.isArray(ids)&&ids.length>0&&new Set(ids).size===ids.length&&ids.every(id=>{const u=utterances.get(id);return u&&u.final&&(!elder||u.speaker==='elder')});
 const scenes=new Map(),previous=new Map(arr(input.previousPlan?.scenes).filter(s=>s&&typeof s==='object').map(s=>[s.id,s]));
 for(const s of arr(plan.scenes)){
  if(!s||typeof s!=='object'){errors.push('Invalid scene object');continue;}
  ok(typeof s.id==='string'&&!scenes.has(s.id),'Duplicate/invalid scene ID');scenes.set(s.id,s);
  ok(Number.isInteger(s.revision)&&s.revision>0&&(!previous.has(s.id)||s.revision>=previous.get(s.id).revision),'Invalid/stale scene revision');
  ok(sources(s.sourceIds),'Scene facts require final elder sources');
  ok(sources(s.timeSourceIds)&&s.timeSourceIds.every(id=>arr(s.sourceIds).includes(id)),'Invalid timing sources');
  ok(typeof s.event==='string'&&s.event.trim()&&typeof s.prompt==='string'&&s.prompt.trim()&&typeof s.negativePrompt==='string'&&s.negativePrompt.trim(),'Missing event or prompt');
  for(const k of ['unknowns','continuityIds','facts'])ok(Array.isArray(s[k]),`Missing scene array ${k}`);
  for(const f of arr(s.facts)){if(!f||typeof f!=='object'){errors.push('Invalid fact object');continue;}ok(typeof f.text==='string'&&['explicit','inherited','uncertain'].includes(f.certainty),'Invalid fact');ok(sources(f.sourceIds)&&f.sourceIds.every(id=>arr(s.sourceIds).includes(id)),'Invalid fact provenance')}
  if(plan.schemaVersion!==2&&s.transition!==undefined)ok(['hold','blink','cut'].includes(s.transition),'Invalid legacy transition');
  ok(['planned','queued','generating','ready','failed','obsolete'].includes(s.executionStatus),'Invalid executionStatus');
  if(s.executionStatus==='ready')ok(typeof s.artifactUri==='string'&&s.artifactUri.trim()&&Number.isFinite(s.artifactDurationSeconds)&&s.artifactDurationSeconds>0,'Ready requires actual artifact metadata');
  const t=s.timing??{};ok(['measured','estimated'].includes(t.basis)&&Number.isFinite(t.targetDisplaySeconds)&&t.targetDisplaySeconds>0&&typeof t.blocked==='boolean'&&typeof t.needsSemanticReview==='boolean'&&Array.isArray(t.clips),'Invalid timing result');
  const timed=arr(s.timeSourceIds).map(id=>utterances.get(id));
  if(t.basis==='measured')ok(timed.length&&timed.every(u=>u&&Number.isFinite(u.startMs)&&Number.isFinite(u.endMs)),'Measured timing requires real timestamps');
  if(t.basis==='measured'&&timed.length&&timed.every(u=>u&&Number.isFinite(u.startMs)&&Number.isFinite(u.endMs))){const minimum=sourceClock({intervals:timed}).sourceSeconds;ok(t.targetDisplaySeconds+.001>=minimum,'Measured duration cannot truncate source time silently');}
  const supported=input.capabilities?.supportedSeconds;
  if(t.blocked)ok(arr(t.clips).length===0,'Blocked timing cannot request clips');
  else {ok(Array.isArray(supported)&&supported.length>0,'Cannot generate with unknown capabilities');ok(arr(t.clips).length>0,'Missing clips');let total=0;for(const c of arr(t.clips)){if(!c||typeof c!=='object'){errors.push('Invalid clip object');continue;}ok(arr(supported).includes(c.generateSeconds)&&Number.isFinite(c.displaySeconds)&&c.displaySeconds>0&&c.displaySeconds<=c.generateSeconds,'Invalid clip duration');ok(Number.isFinite(c.trimSeconds)&&Math.abs(c.trimSeconds-(c.generateSeconds-c.displaySeconds))<.002,'Invalid trim');total+=c.displaySeconds}ok(Math.abs(total-t.targetDisplaySeconds)<.005,'Display duration does not conserve total')}
 }
 const actionKeys=new Set();for(const q of arr(plan.queueActions)){
  if(!q||typeof q!=='object'){errors.push('Invalid queue action object');continue;}
  const key=`${q.type}:${q.sceneId}:${q.revision}`;ok(!actionKeys.has(key),'Duplicate queue action');actionKeys.add(key);
  ok(['enqueue','cancel','mark_obsolete'].includes(q.type)&&typeof q.reason==='string'&&q.reason.trim(),'Invalid queue action');
  const current=scenes.get(q.sceneId),old=previous.get(q.sceneId);
  if(q.type==='cancel')ok(input.capabilities?.cancelAvailable===true,'Cancellation capability unavailable');
  if(q.type==='enqueue')ok(input.capabilities?.videoAvailable===true&&current?.revision===q.revision&&!current.timing?.blocked&&['planned','queued'].includes(current.executionStatus),'Cannot enqueue unavailable/stale/unready scene');
  else ok(old?.revision===q.revision,'Cancellation requires an existing old revision');
 }
 for(const id of arr(plan.bufferSourceIds))ok(utterances.get(id)?.final,'Invalid buffer source');
 if(input.previousPlan)ok(plan.revision>=input.previousPlan.revision,'Stale plan');
 if(plan.schemaVersion!==undefined)ok([1,2].includes(plan.schemaVersion),'Unsupported schemaVersion');
 if(plan.schemaVersion===2){
  ok(plan.bufferReasons&&typeof plan.bufferReasons==='object'&&!Array.isArray(plan.bufferReasons),'Missing bufferReasons');
  for(const id of arr(plan.bufferSourceIds))ok(typeof plan.bufferReasons?.[id]==='string'&&plan.bufferReasons[id].trim(),'Missing buffer reason');
  for(const scene of arr(plan.scenes))if(scene&&typeof scene==='object'){
   ok(typeof scene.imagePrompt==='string'&&scene.imagePrompt.trim(),'Missing imagePrompt');
   ok(typeof scene.segmentationReason==='string'&&scene.segmentationReason.trim(),'Missing segmentationReason');
   const old=previous.get(scene.id);
   if(old&&scene.revision===old.revision){const changed=['event','imagePrompt','prompt','negativePrompt','facts','timing'].some(key=>old[key]!==undefined&&JSON.stringify(old[key])!==JSON.stringify(scene[key]));ok(!changed,'Changed scene requires a new revision');}
   const t=scene.timing??{},us=arr(scene.timeSourceIds).map(id=>utterances.get(id));
   if(t.basis==='estimated')ok(t.clockScope==='text'&&t.sourceSeconds===null,'Estimated timing cannot claim an audio clock');
   if(t.basis==='measured'&&us.length&&us.every(u=>u&&Number.isFinite(u.startMs)&&Number.isFinite(u.endMs))){
    ok(['event_span','source_union'].includes(t.clockScope),'Invalid measured clockScope');
    const actual=t.clockScope==='source_union'?sourceClock({intervals:us}).sourceSeconds:(Math.max(...us.map(u=>u.endMs))-Math.min(...us.map(u=>u.startMs)))/1000;
    ok(Number.isFinite(t.sourceSeconds)&&Math.abs(t.sourceSeconds-actual)<.002,'Source clock does not match referenced utterances');
    ok(t.targetDisplaySeconds+.001>=actual,'Display target truncates the selected source clock');
   }

   if(scene.clipPrompts!==undefined)ok(Array.isArray(scene.clipPrompts)&&scene.clipPrompts.length===scene.timing?.clips?.length&&scene.clipPrompts.every(p=>typeof p==='string'&&p.trim()),'Invalid clipPrompts');
   if(scene.executionStatus==='ready')ok(scene.artifactDurationSeconds+.15>=scene.timing?.targetDisplaySeconds,'Ready scene is shorter than its presentation plan');
  }
  for(const note of arr(plan.unresolved))ok(typeof note==='string'&&note.trim(),'Invalid unresolved note');
  if(plan.archiveStatus==='saved')ok(plan.archiveReceipt&&typeof plan.archiveReceipt.uri==='string'&&plan.archiveReceipt.uri.trim()&&Number.isFinite(Date.parse(plan.archiveReceipt.savedAt)),'Saved archive requires a receipt');
 }

 return errors;
}
module.exports={validate};
if(require.main===module){try{if(!process.argv[3])throw Error('Usage: node validate.cjs <input.json> <plan.json>');const e=validate(...process.argv.slice(2,4).map(p=>JSON.parse(fs.readFileSync(p,'utf8'))));if(e.length)throw Error(e.join('\n'));console.log('PASS: structural invariants; semantic review remains required')}catch(e){console.error(e.message);process.exitCode=1}}
