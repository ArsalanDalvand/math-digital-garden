import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from '../../frontend/node_modules/typescript/lib/typescript.js';
const source=fs.readFileSync(new URL('../../frontend/src/components/AccountMenu.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText;
const account={id:'alice',role:'student',email:'alice@example.org',full_name:'Alice',avatar_url:null,preferences:{theme:'light',size:19,leading:2,width:760,focus:false,default_mode:'read',fixed_toolbar:true}};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function mount(){
 const document=new EventTarget(),window=new EventTarget(),requests=[],applied=[],identities=[];let cleanup;
 document.addEventListener('garden:identity',event=>identities.push(event.detail));
 class ApiError extends Error{constructor(status){super();this.status=status;}}
 const exports={};
 const slots=[];
 let hookIdx=0;
 let effectRan=false;
 const mockJsx=(type,props)=>({type,props});
 const require=name=>name==='react'?{
  useState:initial=>{const i=hookIdx++;if(!(i in slots))slots[i]=initial;return[slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},
  useEffect:effect=>{if(!effectRan){effectRan=true;cleanup=effect();}}
 }:name==='react/jsx-runtime'?{jsx:mockJsx,jsxs:mockJsx}:name.endsWith('/api')?{ApiError,api:(path,data,method)=>new Promise((resolve,reject)=>requests.push({path,data,method,resolve,reject}))}:name.endsWith('/account-preferences')?{applyPreferences:value=>applied.push(value)}:name.endsWith('/garden')?{$identity:{set(){}},setAppIdentity:user=>document.dispatchEvent(new CustomEvent('garden:identity',{detail:user?{id:user.id,role:user.role}:null})),syncThemeFromDom:()=>'light'}:{};
 vm.runInNewContext(compiled,{exports,require,document,window,CustomEvent,Date,location:{assign(){}}});
 const render=()=>{hookIdx=0;return exports.default();};
 render();
 return{document,window,ApiError,requests,applied,identities,render,unmount:()=>cleanup()};
}
test('reading and theme changes serialize, retain last values and suppress stale saves',async()=>{
 const state=mount();state.requests[0].resolve(account);await tick();
 state.document.dispatchEvent(new CustomEvent('garden:reading-settings',{detail:{size:20,leading:2,width:960,focus:false}}));
 state.document.dispatchEvent(new CustomEvent('garden:reading-settings',{detail:{size:24,leading:2.2,width:620,focus:true}}));
 state.document.dispatchEvent(new CustomEvent('garden:theme-setting',{detail:{theme:'dark'}}));
 assert.equal(state.requests.length,2);
 state.requests[1].resolve({...account,preferences:state.requests[1].data});await tick();
 assert.equal(state.requests.length,3);assert.equal(state.applied.length,1);
 assert.equal(state.requests[2].data.size,24);assert.equal(state.requests[2].data.width,620);assert.equal(state.requests[2].data.theme,'dark');
 state.requests[2].resolve({...account,preferences:state.requests[2].data});await tick();
 assert.equal(state.applied.at(-1).size,24);assert.equal(state.applied.at(-1).theme,'dark');state.unmount();
});
test('account response after unmount or newer identity fetch is ignored',async()=>{
 const state=mount();state.document.dispatchEvent(new Event('garden:account'));
 state.requests[1].resolve({...account,id:'bob'});await tick();state.requests[0].resolve(account);await tick();
 assert.equal(state.identities.length,1);assert.equal(state.identities[0].id,'bob');assert.equal(state.identities[0].role,'student');
 state.document.dispatchEvent(new Event('garden:account'));state.unmount();state.requests[2].resolve(account);await tick();
 assert.equal(state.identities.length,1);
});
test('failed persistence reports failure without claiming the local change was saved',async()=>{
 const state=mount(),status=[];state.document.addEventListener('garden:preference-save',event=>status.push(event.detail.state));
 state.requests[0].resolve(account);await tick();
 state.document.dispatchEvent(new CustomEvent('garden:theme-setting',{detail:{theme:'dark'}}));state.requests[1].reject(new Error('offline'));await tick();
 assert.deepEqual(status,['saving','error']);assert.equal(state.applied.length,1);state.unmount();
});

test('focus and bfcache revalidate identity and block unverified preference writes',async()=>{
 const state=mount();state.requests[0].resolve(account);await tick();
 state.window.dispatchEvent(new Event('focus'));
 state.document.dispatchEvent(new CustomEvent('garden:theme-setting',{detail:{theme:'dark'}}));
 assert.equal(state.requests.length,2);
 state.requests[1].resolve({...account,id:'bob'});await tick();assert.equal(state.identities.at(-1).id,'bob');
 const restored=new Event('pageshow');Object.defineProperty(restored,'persisted',{value:true});state.window.dispatchEvent(restored);
 state.requests[2].reject(new state.ApiError(401));await tick();assert.equal(state.identities.at(-1),null);
 state.document.dispatchEvent(new CustomEvent('garden:theme-setting',{detail:{theme:'dark'}}));assert.equal(state.requests.length,3);state.unmount();
 state.window.dispatchEvent(new Event('focus'));assert.equal(state.requests.length,3);
});
test('hidden tab stops queued preference writes and visible tab verifies new session first',async()=>{
 const state=mount();state.requests[0].resolve(account);await tick();
 state.document.dispatchEvent(new CustomEvent('garden:theme-setting',{detail:{theme:'dark'}}));
 assert.equal(state.requests[1].data.expected_user_id,'alice');
 state.document.dispatchEvent(new CustomEvent('garden:theme-setting',{detail:{theme:'light'}}));
 Object.defineProperty(state.document,'visibilityState',{value:'hidden',configurable:true});state.document.dispatchEvent(new Event('visibilitychange'));
 state.requests[1].resolve({...account,preferences:state.requests[1].data});await tick();assert.equal(state.requests.length,2);
 Object.defineProperty(state.document,'visibilityState',{value:'visible'});state.document.dispatchEvent(new Event('visibilitychange'));
 assert.equal(state.requests.length,3);state.requests[2].resolve({...account,id:'bob'});await tick();assert.equal(state.identities.at(-1).id,'bob');state.unmount();
});

test('external saved width is retained by the next theme change without a save loop',async()=>{
 const state=mount();state.requests[0].resolve(account);await tick();
 state.document.dispatchEvent(new CustomEvent('garden:preferences',{detail:{...account.preferences,width:960}}));
 assert.equal(state.requests.length,1);
 state.document.dispatchEvent(new CustomEvent('garden:theme-setting',{detail:{theme:'dark'}}));
 assert.equal(state.requests[1].data.width,960);assert.equal(state.requests[1].data.theme,'dark');
 state.requests[1].resolve({...account,preferences:state.requests[1].data});await tick();state.unmount();
});

test('auth/session guest response resolves with null identity and author role sees review item while student does not',async()=>{
 const state=mount();
 assert.equal(state.requests[0].path,'/auth/session');
 state.requests[0].resolve({authenticated:false,account:null});await tick();
 assert.equal(state.identities.at(-1),null);

 state.document.dispatchEvent(new Event('garden:account'));
 state.requests[1].resolve({authenticated:true,account:{...account,role:'student'}});await tick();
 assert.doesNotMatch(JSON.stringify(state.render()),/بازبینی پیشنهادها/);

 state.document.dispatchEvent(new Event('garden:account'));
 state.requests[2].resolve({authenticated:true,account:{...account,role:'author'}});await tick();
 assert.equal(state.identities.at(-1)?.role,'author');
 assert.match(JSON.stringify(state.render()),/بازبینی پیشنهادها/);
 state.unmount();
});
