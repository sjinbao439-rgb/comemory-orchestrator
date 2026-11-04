const {test}=require('node:test');const assert=require('node:assert/strict');const {planTiming}=require('./timing.cjs');
test('真实时间优先，按模型能力裁剪',()=>{const t=planTiming({startMs:0,endMs:9000,spokenChars:4,supportedSeconds:[5,10]});assert.equal(t.basis,'measured');assert.equal(t.targetDisplaySeconds,9);assert.equal(t.clips[0].generateSeconds,10);assert.equal(t.clips[0].trimSeconds,1)});
test('文字估算与未知模型能力如实标记',()=>{const t=planTiming({spokenChars:40,supportedSeconds:null});assert.equal(t.basis,'estimated');assert.equal(t.blocked,true);assert.equal(t.clips.length,0)});
test('长事件分配合法片段，总时长守恒',()=>{const t=planTiming({startMs:0,endMs:26000,supportedSeconds:[5]});assert.equal(t.needsSemanticReview,true);assert.equal(t.clips.length,6);assert.ok(t.clips.every(c=>c.generateSeconds===5&&c.displaySeconds<=5));assert.ok(Math.abs(t.clips.reduce((n,c)=>n+c.displaySeconds,0)-t.targetDisplaySeconds)<.01)});
test('拒绝反向、半缺失时间及非法参数',()=>{for(const x of [{startMs:2,endMs:1},{startMs:0},{supportedSeconds:[]},{supportedSeconds:[0]},{spokenChars:-1},{supportedSeconds:[5,NaN]}])assert.throws(()=>planTiming(x))});

const {sourceClock}=require('./timing.cjs');
test('短句按实测时长呈现，不被最短3秒抬高',()=>{const t=planTiming({startMs:0,endMs:1100,supportedSeconds:[5]});assert.equal(t.targetDisplaySeconds,1.1);assert.equal(t.clips[0].trimSeconds,3.9)});
test('分离来源区间按并集计时，不叠加重合、不计算无关问答空档',()=>{const t=planTiming({intervals:[{startMs:0,endMs:2000},{startMs:1500,endMs:3000},{startMs:8000,endMs:10000}],supportedSeconds:[5]});assert.equal(t.sourceSeconds,5);assert.equal(t.targetDisplaySeconds,5);assert.equal(t.clockScope,'source_union')});
test('仅文字保留3秒下限，显式余量才加长',()=>{assert.equal(planTiming({spokenChars:4,supportedSeconds:[5]}).targetDisplaySeconds,3);assert.equal(planTiming({startMs:0,endMs:9000,tailSeconds:.5,supportedSeconds:[10]}).targetDisplaySeconds,9.5)});
test('拒绝冲突或损坏区间、过量任务与零时长',()=>{for(const x of [{intervals:[]},{startMs:0,endMs:1000,intervals:[{startMs:0,endMs:1000}]},{intervals:[{startMs:2,endMs:1}]},{startMs:0,endMs:2000,supportedSeconds:[.00001]},{spokenChars:0,minDisplaySeconds:0}])assert.throws(()=>planTiming(x))});
