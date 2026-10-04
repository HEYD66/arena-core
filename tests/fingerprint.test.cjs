'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {normalize,preset,script,DEVICE_TEMPLATES}=require('../src/main/fingerprint.cjs');
const {environment}=require('../src/main/environment.cjs');
test('fingerprint defaults are opt-in and disruptive switches remain disabled',()=>{const f=normalize();assert.equal(f.enabled,false);for(const k of ['canvas','audio','rects','webgl'])assert.equal(f[k],false);assert.equal(script(environment()),null);});
test('six reference presets validate with coherent screen and viewport',()=>{assert.equal(DEVICE_TEMPLATES.length,6);for(const t of DEVICE_TEMPLATES){const e=environment(preset(t.id,{language:'ja-JP',timezone:'Asia/Tokyo'},'fixed-seed'));assert.equal(e.language,'ja-JP');assert.equal(e.timezone,'Asia/Tokyo');assert(e.width<=e.fingerprint.screenWidth);assert(e.height<=e.fingerprint.screenHeight);assert.equal(e.fingerprint.canvas,false);assert.equal(e.fingerprint.webgl,false);assert.deepEqual(environment(e),e);}});
test('fixed random seed is reproducible; explicit random action issues fresh seed',()=>{assert.deepEqual(preset('random',{},'seed'),preset('random',{},'seed'));assert.notEqual(preset('random').fingerprint.seed,preset('random').fingerprint.seed);});
test('reject malformed seeds, incoherent screens and invalid hardware fields',()=>{for(const value of [{seed:'<script>'},{memory:3},{screenWidth:-2},{screenHeight:600,availHeight:900},{colorDepth:25},{enabled:true,webgl:true}])assert.throws(()=>normalize(value));assert.throws(()=>environment({width:2000,height:800,fingerprint:{enabled:true,hardware:true,screenWidth:1920}}));});
test('injection compiles, is deterministic, and avoids duplicate native overrides',()=>{const e=environment(preset('random',{},'same-seed'));const s=script(e);new vm.Script(s);assert.equal(s,script(e));assert(!s.includes('setTimezone'));assert(!s.includes('userAgentData'));assert(!s.includes("'webdriver'"));assert(!s.includes('originalToString'));assert(!s.includes('addIceCandidate'));assert(!s.includes('/*__ARENA_FP_PAYLOAD__*/null'));});

test('random preserves viewport, DPR and screen sizes for fixed and adaptive configurations',()=>{for(const patch of [{width:1760,height:920,scale:1.25},{width:0,height:0,scale:0},{width:2560,height:1440,scale:2}]){const base=environment({...patch,fingerprint:{screenWidth:1920,screenHeight:1080,availHeight:1040}});for(let i=0;i<30;i++){const next=environment(preset('random',base,'window-'+i));for(const k of ['width','height','scale'])assert.equal(next[k],base[k]);for(const k of ['screenWidth','screenHeight','availHeight'])assert.equal(next.fingerprint[k],base.fingerprint[k]);}}});

test('one-click random enables Canvas, audio and WebGL even when all were explicitly disabled',()=>{
 for(const enabled of [false,true]){
  const base=environment({language:'ja-JP',timezone:'Asia/Tokyo',fingerprint:{enabled,canvas:false,audio:false,webgl:false,rects:false}});
  const snapshot=JSON.stringify(base),next=environment(preset('random',base,'auto-flags'));
  for(const k of ['enabled','canvas','audio','webgl'])assert.equal(next.fingerprint[k],true,k);
  assert.equal(next.fingerprint.rects,false);assert(next.fingerprint.vendor&&next.fingerprint.renderer);
  assert.equal(next.language,base.language);assert.equal(next.timezone,base.timezone);
  assert.equal(JSON.stringify(base),snapshot,'random only returns a draft');
 }
});
test('random preserves explicit layout choice and a later manual opt-out still saves',()=>{
 const next=environment(preset('random',{fingerprint:{rects:true}},'layout-choice'));
 assert.equal(next.fingerprint.rects,true);
 const edited=environment({...next,fingerprint:{...next.fingerprint,canvas:false,audio:false,webgl:false}});
 for(const k of ['canvas','audio','webgl'])assert.equal(edited.fingerprint[k],false);
});
