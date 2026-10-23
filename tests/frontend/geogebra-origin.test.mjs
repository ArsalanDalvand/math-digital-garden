import test from 'node:test';
import assert from 'node:assert/strict';
import * as geo from '../../frontend/src/lib/geogebra.mjs';
test('GeoGebra viewer has a real isolated origin and never shares the private cookie hostname',()=>{
 assert.equal(geo.viewerOrigin('http://127.0.0.1:4321'),'http://localhost:4321');
 assert.equal(geo.viewerOrigin('https://garden.example','https://drawings.example'),'https://drawings.example');
 assert.throws(()=>geo.viewerOrigin('https://garden.example','https://garden.example:444'));
 assert.throws(()=>geo.viewerOrigin('https://garden.example'));
});
