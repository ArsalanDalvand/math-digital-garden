import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../frontend/package.json',import.meta.url));
const {JSDOM}=await import(require.resolve('jsdom'));

test('Sandbox document preserves less-than commands, cannot close its script and reports vendor readiness',async()=>{
  const {geogebraFrame}=await import('../../frontend/src/lib/geogebra.mjs');
  const config={appName:'graphing',width:700,height:450,caption:'رسم',commands:['f(x)=If[x<0,-x,x]','a="</script>"']};
  const html=geogebraFrame(config,'test-token');
  const scripts=new JSDOM(html).window.document.querySelectorAll('script');
  assert.equal(scripts.length,2);
  const messages=[],commands=[],events={};let options,injected;
  const status={textContent:''};const context={innerWidth:700,addEventListener:(type,fn)=>{events[type]=fn;},window:{},document:{getElementById:()=>status},parent:{postMessage:x=>messages.push(x)},setTimeout:()=>{},GGBApplet:class{constructor(p){options=p;}inject(id){injected=id;}}};
  context.window=context;
  vm.runInNewContext(scripts[0].textContent||'',context);
  context.boot();
  assert.equal(injected,'plot');
  assert.equal(options.preventFocus,true);
  assert.equal(options.disableAutoScale,true);
  assert.equal(options.showAlgebraInput,true);
  assert.equal(options.perspective,'AG');
  const sizes=[];
  options.appletOnLoad({evalCommand:c=>commands.push(c),setSize:(width,height)=>{sizes.push([width,height]);events.resize();}});
  events.resize();assert.equal(sizes.length,0);
  context.innerWidth=350;events.resize();assert.deepEqual(sizes,[[350,450]]);
  events.resize();assert.equal(sizes.length,1);
  assert.deepEqual(commands,config.commands);
  assert.equal(messages.at(-1).token,'test-token');
  assert.equal(messages.at(-1).status,'ready');
});

test('A stalled GeoGebra load reports an error and leaves the original note usable',async()=>{
  const {geogebraFrame}=await import('../../frontend/src/lib/geogebra.mjs');
  const script=new JSDOM(geogebraFrame({appName:'graphing',width:700,height:450,caption:'',commands:[]},'test')).window.document.querySelector('script');
  assert.ok(script);
  const messages=[];let timeout;const status={textContent:''};
  const context={addEventListener:()=>{},window:{},document:{getElementById:()=>status},parent:{postMessage:x=>messages.push(x)},setTimeout:fn=>timeout=fn};context.window=context;
  vm.runInNewContext(script.textContent||'',context);timeout();
  assert.equal(messages[0].status,'failed');
  assert.match(status.textContent,/بارگذاری/);
});

test('rendered GeoGebra is a figure, not a decorated code block',async()=>{
 const {renderMarkdown}=await import('../../frontend/src/lib/markdown.mjs');
 const raw='```geogebra\nf(x)=cosh(x)\ng(x)=sinh(x)\n```';
 const html=await renderMarkdown(raw);
 assert.doesNotMatch(html,/<pre[^>]*>\s*<figure/);
 assert.match(html,/data-geogebra-host/);
 assert.match(html,/کد اصلی رسم/);
 assert.match(html,/f\(x\)=cosh\(x\)/);
});
