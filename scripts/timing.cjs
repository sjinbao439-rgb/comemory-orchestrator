const fs=require('node:fs');
const round=n=>Math.round(n*1000)/1000;
function sourceClock({startMs=null,endMs=null,intervals=null}={}){
 if(intervals!==null){
  if(startMs!==null||endMs!==null)throw Error('Use intervals or a single range, not both');
  if(!Array.isArray(intervals)||!intervals.length)throw Error('Invalid intervals');
  const ranges=intervals.map(x=>{if(!x||!Number.isFinite(x.startMs)||!Number.isFinite(x.endMs)||x.startMs<0||x.endMs<=x.startMs)throw Error('Invalid interval');return [x.startMs,x.endMs]}).sort((a,b)=>a[0]-b[0]);
  const merged=[];for(const [start,end] of ranges){const last=merged.at(-1);if(last&&start<=last[1])last[1]=Math.max(last[1],end);else merged.push([start,end])}
  return {basis:'measured',clockScope:'source_union',sourceSeconds:round(merged.reduce((s,[a,b])=>s+b-a,0)/1000)};
 }
 if((startMs===null)!==(endMs===null))throw Error('Both timestamps are required');
 if(startMs===null)return {basis:'estimated',clockScope:'text',sourceSeconds:null};
 if(!Number.isFinite(startMs)||!Number.isFinite(endMs)||startMs<0||endMs<=startMs)throw Error('Invalid time range');
 return {basis:'measured',clockScope:'event_span',sourceSeconds:round((endMs-startMs)/1000)};
}
function planTiming(o={}){
 const clock=sourceClock(o);
 const {spokenChars=0,supportedSeconds=null,charsPerSecond=4,tailSeconds=0,maxShotSeconds=12}=o;
 const minDisplaySeconds=o.minDisplaySeconds??(clock.basis==='measured'?0:3);
 for(const [k,v] of Object.entries({spokenChars,tailSeconds,minDisplaySeconds}))if(!Number.isFinite(v)||v<0)throw Error(`${k} must be nonnegative`);
 for(const [k,v] of Object.entries({charsPerSecond,maxShotSeconds}))if(!Number.isFinite(v)||v<=0)throw Error(`${k} must be positive`);
 if(supportedSeconds!==null&&(!Array.isArray(supportedSeconds)||!supportedSeconds.length||supportedSeconds.some(s=>!Number.isFinite(s)||s<=0)))throw Error('Invalid supportedSeconds');
 const targetDisplaySeconds=round(Math.max(minDisplaySeconds,clock.sourceSeconds??spokenChars/charsPerSecond)+tailSeconds);
 if(targetDisplaySeconds<=0||targetDisplaySeconds>3600)throw Error('Duration must be positive and at most one hour');
 const result={...clock,targetDisplaySeconds,blocked:supportedSeconds===null,needsSemanticReview:targetDisplaySeconds>maxShotSeconds,clips:[]};
 if(result.blocked)return result;
 const sizes=[...new Set(supportedSeconds)].sort((a,b)=>a-b),max=sizes.at(-1),count=Math.ceil(targetDisplaySeconds/max);
 if(count>1000)throw Error('Too many clips; check model capabilities or split the input');
 const unit=Math.floor(targetDisplaySeconds/count*1000)/1000;
 if(unit<=0)throw Error('Clip duration below millisecond precision');
 for(let i=0;i<count;i++){
  const displaySeconds=i===count-1?round(targetDisplaySeconds-unit*(count-1)):unit;
  const generateSeconds=sizes.find(s=>s>=displaySeconds)??max;
  result.clips.push({generateSeconds,displaySeconds,trimSeconds:round(generateSeconds-displaySeconds)});
 }
 return result;
}
module.exports={planTiming,sourceClock};
if(require.main===module){try{if(!process.argv[2])throw Error('Usage: node timing.cjs <timing-input.json>');console.log(JSON.stringify(planTiming(JSON.parse(fs.readFileSync(process.argv[2],'utf8'))),null,2))}catch(e){console.error(e.message);process.exitCode=1}}
