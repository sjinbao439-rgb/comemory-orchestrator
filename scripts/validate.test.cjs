const {test}=require('node:test'),assert=require('node:assert/strict');const {validate}=require('./validate.cjs');
const input=require('../examples/jiangnan.input.json'),plan=require('../examples/jiangnan.plan.json');
const clone=()=>[structuredClone(input),structuredClone(plan)];
test('示例保留来源、真实时间、未知项与修订，结构通过',()=>assert.deepEqual(validate(input,plan),[]));
test('不允许把年轻人问句或临时识别当成事实来源',()=>{for(const change of [i=>i.utterances.find(u=>u.id==='u4').final=false,(i,p)=>p.scenes[0].facts[2].sourceIds=['u3']]){const [i,p]=clone();change(i,p);assert.ok(validate(i,p).length)}});
test('拒绝无时间戳却声称 measured，以及展示时长不守恒',()=>{const [i,p]=clone();i.utterances.find(u=>u.id==='u4').startMs=null;i.utterances.find(u=>u.id==='u4').endMs=null;assert.ok(validate(i,p).length);const [j,q]=clone();q.scenes[0].timing.clips[0].displaySeconds=1;assert.ok(validate(j,q).length)});
test('旧版本不能重新入队，未接服务不能提交任务',()=>{const [i,p]=clone();i.capabilities.videoAvailable=true;p.queueActions.push({type:'enqueue',sceneId:'bridge',revision:1,reason:'test'});assert.ok(validate(i,p).length);const [j,q]=clone();q.queueActions.push({type:'enqueue',sceneId:'bridge',revision:2,reason:'test'});assert.ok(validate(j,q).length)});
test('没有真实资产不能标记视频 ready',()=>{const [i,p]=clone();p.scenes[0].executionStatus='ready';assert.ok(validate(i,p).length)});

test('损坏数组元素返回校验错误而不是崩溃',()=>{for(const mutate of [(i,p)=>i.utterances.push(null),(i,p)=>p.scenes.push(null),(i,p)=>p.scenes[0].facts.push(null),(i,p)=>p.queueActions.push(null),(i,p)=>p.scenes[0].timing.clips.push(null)]){const [i,p]=clone();mutate(i,p);assert.ok(validate(i,p).length)}});
test('v2 要求首帧提示词、分镜依据、缓冲理由及实际归档回执',()=>{const [i,p]=clone();p.schemaVersion=2;p.bufferReasons={};for(const scene of p.scenes){delete scene.imagePrompt;delete scene.segmentationReason;}assert.ok(validate(i,p).length);for(const s of p.scenes){s.imagePrompt='依据已确认事实形成首帧';s.segmentationReason='主要行动与时空变化'}assert.deepEqual(validate(i,p),[]);p.bufferSourceIds=['u1'];assert.ok(validate(i,p).length);p.bufferReasons.u1='等待后续行动';assert.deepEqual(validate(i,p),[]);p.archiveStatus='saved';assert.ok(validate(i,p).length)});

test('内容修订必须升场景版本，不能取消不可取消的服务任务',()=>{const [i,p]=clone();i.previousPlan.scenes[0].revision=p.scenes[0].revision;assert.ok(validate(i,p).some(x=>x.includes('new revision')));const [j,q]=clone();j.capabilities.cancelAvailable=false;q.queueActions[0].type='cancel';assert.ok(validate(j,q).some(x=>x.includes('Cancellation')))});
test('v2 时钟依据必须与所选原话相符，不能假造 sourceSeconds',()=>{const [i,p]=clone();p.scenes[0].timing.sourceSeconds=99;assert.ok(validate(i,p).some(x=>x.includes('Source clock')))});
