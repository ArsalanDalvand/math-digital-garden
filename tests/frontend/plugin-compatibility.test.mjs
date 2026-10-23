import test from 'node:test';
import assert from 'node:assert/strict';
import {buildKnowledge} from '../../frontend/src/lib/markdown.mjs';
import * as plugins from '../../frontend/src/lib/obsidian-plugins.mjs';

test('GeoGebra plain commands and Lab YAML aliases render without modifying source',async()=>{
 const raw='```GGB\nf(x)=cosh(x)\ng(x)=sinh(x)\n```\n\n```ggb\nappName: classic\nperspective: AG\nshowToolBar: false\ncommands: ["A=(0,0)"]\nexplain: ["نقطهٔ مبدأ"]\n```';
 const [note]=await buildKnowledge([{slug:'lab',title:'lab',current_content:raw}]);
 assert.equal((note.html.match(/data-geogebra=/g)??[]).length,2);
 assert.match(note.html,/نقطهٔ مبدأ/);assert.match(note.html,/cosh/);assert.equal(note.current_content,raw);
 const config=plugins.parseGeoGebra('appName: classic\nmaterialId: abc123\nshowToolBar: false\ncommands: []');
 assert.equal(config.materialId,'abc123');assert.equal(config.showToolBar,false);
 assert.throws(()=>plugins.parseGeoGebra('filename: file:///etc/passwd\ncommands: []'));
 assert.throws(()=>plugins.parseGeoGebra('width: 999999\ncommands: []'));
});


test('Excalidraw sidecar image resolution is manifest-bound and refuses ambiguous drawings',()=>{
 const assets=['vault/book/Drawing.excalidraw.png'];
 assert.equal(plugins.resolveVaultImage('Drawing.excalidraw',assets),assets[0]);
 assert.equal(plugins.resolveVaultImage('Drawing.excalidraw.md',assets),assets[0]);
 assert.equal(plugins.resolveVaultImage('../../Drawing.excalidraw',assets),undefined);
 assert.equal(plugins.resolveVaultImage('Drawing.excalidraw',[...assets,'vault/other/Drawing.excalidraw.png']),undefined);
});






test('Excalidraw prefers its PNG export when both PNG and SVG sidecars exist',()=>{
 assert.equal(plugins.resolveVaultImage('Drawing.excalidraw',['vault/Drawing.excalidraw.png','vault/Drawing.excalidraw.svg']),'vault/Drawing.excalidraw.png');
});
