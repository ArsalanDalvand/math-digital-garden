import test from 'node:test';
import assert from 'node:assert/strict';
import {publicationHref,threadComments} from '../../frontend/src/scripts/library-utils.mjs';
test('publication URLs never include private hierarchy; comments stay in their own thread',()=>{
 assert.equal(publicationHref({id:'a',visibility:'unlisted',share_token:'x/y'}),'/shared/x%2Fy');
 assert.equal(publicationHref({id:'a',visibility:'public'}),'/published/a');
 const threads=threadComments([{id:'b',parent_id:'a'},{id:'a',parent_id:null},{id:'c',parent_id:null}]);
 assert.deepEqual(threads.map(t=>[t.id,t.replies.map(r=>r.id)]),[['a',['b']],['c',[]]]);
});

test('canonical overlays are bounded, owner scoped and leave public tree unchanged',async()=>{
 const {personalNodes}=await import('../../frontend/src/scripts/library-utils.mjs');
 const nodes=Array.from({length:205},(_,i)=>({label:'Public '+i,link:'/notes/n'+i}));
 const requests=[];
 const result=await personalNodes(nodes,async(path,body)=>{requests.push(body.slugs);return body.slugs.flatMap(slug=>slug==='n0'?[{slug,title:'Private rename',hidden:false}]:slug==='n1'?[{slug,title:'Moved',hidden:true}]:[]);});
 assert.deepEqual(requests.map(slugs=>slugs.length),[100,100,5]);
 assert.equal(result.length,204);assert.equal(result[0].label,'Private rename');
 assert.equal(nodes[0].label,'Public 0');assert.equal(nodes.length,205);
 assert.deepEqual(await personalNodes(nodes,async()=>{throw Object.assign(new Error(),{status:401});}),nodes);
 await assert.rejects(personalNodes(nodes,async()=>{throw new Error('service unavailable');}));
});
