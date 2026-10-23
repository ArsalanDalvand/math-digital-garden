import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {buildKnowledge} from '../../frontend/src/lib/markdown.mjs';
import * as plugins from '../../frontend/src/lib/obsidian-plugins.mjs';

test('only requested plugin renderers remain',async()=>{
 const [note]=await buildKnowledge([{slug:'plain',title:'plain',current_content:'```plotly\ndata: []\n```'}]);
 assert.doesNotMatch(note.html,/data-plotly/);
 assert.equal(plugins.parsePlotly,undefined);assert.equal(plugins.lintMarkdown,undefined);
 assert.equal(existsSync(new URL('../../frontend/src/lib/math-tools.mjs',import.meta.url)),false);
 assert.equal(existsSync(new URL('../../backend/app/note_export.py',import.meta.url)),false);
});
test('native Excalidraw scene renders on its page and inside a note embed without changing bytes',async()=>{
 const raw='---\nexcalidraw-plugin: parsed\n---\n# Drawing\n```json\n'+JSON.stringify({type:'excalidraw',version:2,elements:[{id:'box',type:'rectangle',x:0,y:0,width:100,height:80}],appState:{},files:{}})+'\n```';
 const garden=await buildKnowledge([{slug:'drawing',title:'Drawing.excalidraw',current_content:raw},{slug:'embed',title:'embed',current_content:'![[Drawing.excalidraw]]'}]);
 assert.match(garden[0].html,/data-excalidraw/);assert.match(garden[1].html,/data-excalidraw/);assert.equal(garden[0].current_content,raw);
});
test('already bound GeoGebra figures do not prevent binding new preview figures',()=>{
 const source=readFileSync(new URL('../../frontend/src/components/GeoGebra.astro',import.meta.url),'utf8');
 assert.doesNotMatch(source,/if\(!button \|\| button.dataset.bound\)return/);
});
test('compressed Obsidian drawings render; unsafe executable assets stay inert',async()=>{
 const {default:LZ}=await import('../../frontend/node_modules/lz-string/libs/lz-string.js');
 const raw='---\nexcalidraw-plugin: parsed\n---\n%%\n## Drawing\n```compressed-json\n'+LZ.compressToBase64(JSON.stringify({type:'excalidraw',elements:[],files:{},appState:{}}))+'\n```\n%%';
 const [note]=await buildKnowledge([{slug:'compressed',title:'Drawing',current_content:raw}]);
 assert.match(note.html,/data-excalidraw/);assert.doesNotMatch(note.html,/compressed-json/);assert.equal(note.current_content,raw);
});
test('GeoGebra material identifiers use the official API parameter',async()=>{
 const {geogebraFrame}=await import('../../frontend/src/lib/geogebra.mjs');
 assert.match(geogebraFrame({materialId:'abc123',commands:[]},'test'),/material_id/);
});
test('GeoGebra local files resolve only imported manifest assets',()=>{
 const config=plugins.parseGeoGebra('filename: diagram.ggb\ncommands: []',['vault/book/diagram.ggb']);
 assert.equal(config.filename,'/vault/book/diagram.ggb');
 assert.throws(()=>plugins.parseGeoGebra('filename: https://evil.test/a.ggb\ncommands: []'));
});
test('Excalidraw attached images resolve only imported assets and executable shapes are excluded',async()=>{
 const {parseExcalidraw}=await import('../../frontend/src/lib/excalidraw.mjs');
 const raw='## Embedded Files\nimg1: [[photo.png]]\n\n```json\n'+JSON.stringify({type:'excalidraw',elements:[{id:'a',type:'image',x:0,y:0,width:10,height:10,fileId:'img1'},{id:'bad',type:'embeddable',x:0,y:0,width:10,height:10,link:'javascript:alert(1)'}],files:{bad:{dataURL:'data:image/svg+xml;base64,PHN2Zz4='}}})+'\n```';
 const scene=await parseExcalidraw(raw,['vault/book/photo.png']);
 assert.equal(scene.files.img1.dataURL,'/vault/book/photo.png');assert.equal(scene.files.bad,undefined);assert.equal(scene.elements.length,1);
});

test('Obsidian embeds using the full .excalidraw.md filename resolve native scenes',async()=>{
 const raw='---\nexcalidraw-plugin: parsed\n---\n```json\n'+JSON.stringify({type:'excalidraw',elements:[],files:{}})+'\n```';
 const garden=await buildKnowledge([{slug:'full-drawing',title:'Drawing.excalidraw',relative_path:'book/Drawing.excalidraw.md',current_content:raw},{slug:'full-embed',title:'embed',current_content:'![[Drawing.excalidraw.md]]'}]);
 assert.match(garden[1].html,/data-excalidraw=/);
});
