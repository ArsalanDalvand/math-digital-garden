import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../frontend/package.json',import.meta.url));
const ts=require('typescript');

test('restored drawing markup is observed once even if copied DOM contains old binding flags',()=>{
 const source=readFileSync(new URL('../../frontend/src/components/Excalidraw.astro',import.meta.url),'utf8').replace(/^<script>\s*|\s*<\/script>\s*$/g,'');
 const js=ts.transpile(source,{target:ts.ScriptTarget.ES2022});
 const first={dataset:{excalidrawBound:'true'}};let hosts=[first],change;const observed=[];
 vm.runInNewContext(js,{document:{body:{},querySelectorAll:()=>hosts},IntersectionObserver:class{observe(h){observed.push(h);}},MutationObserver:class{constructor(fn){change=fn;}observe(){}},WeakSet});
 assert.deepEqual(observed,[first]);change();assert.equal(observed.length,1);
 const restored={dataset:{excalidrawBound:'true'}};hosts=[restored];change();assert.deepEqual(observed,[first,restored]);
});

test('restored GeoGebra buttons bind once even when the previous mode copied bound attributes',()=>{
 const source=readFileSync(new URL('../../frontend/src/components/GeoGebra.astro',import.meta.url),'utf8').replace(/^<script>\s*|\s*<\/script>\s*$/g,'').replace(/^\s*import .*$/m,'').replace('import.meta.env.PUBLIC_GEOGEBRA_VIEWER_ORIGIN','undefined');
 const js=ts.transpile(source,{target:ts.ScriptTarget.ES2022});let binds=0,clicks=0,change,intersect;const observed=[];
 const button={dataset:{bound:'true'},addEventListener(){binds++;},click(){clicks++;}};
 const figure={isConnected:true,querySelector:()=>button};
 vm.runInNewContext(js,{document:{body:{},querySelectorAll:()=>[figure]},IntersectionObserver:class{constructor(fn){intersect=fn;}observe(f){observed.push(f);}unobserve(){}},MutationObserver:class{constructor(fn){change=fn;}observe(){}},WeakSet});
 assert.equal(binds,1);change();assert.equal(binds,1);assert.deepEqual(observed,[figure]);
 intersect([{target:figure,isIntersecting:false}]);assert.equal(clicks,0);
 intersect([{target:figure,isIntersecting:true}]);assert.equal(clicks,1);
});
