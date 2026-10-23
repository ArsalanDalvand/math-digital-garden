import test from 'node:test';
import assert from 'node:assert/strict';
import {consumeTutorStream, selectionMatches} from '../../frontend/src/lib/tutor.mjs';

test('SSE survives fragmented UTF8 and errors never look complete',async()=>{
  const bytes=new TextEncoder().encode('event: text\r\ndata: "فارسی $x$"\r\n\r\nevent: error\ndata: {"message":"قطع"}\n\n');
  const stream=new ReadableStream({start(c){for(const b of bytes)c.enqueue(new Uint8Array([b]));c.close();}});
  const events=[];
  await assert.rejects(()=>consumeTutorStream(stream,(e,d)=>events.push([e,d])),/قطع/);
  assert.deepEqual(events,[['text','فارسی $x$']]);
});
test('truncated stream rejects and a raw passage must be unique',async()=>{
  const stream=new ReadableStream({start(c){c.close();}});
  await assert.rejects(()=>consumeTutorStream(stream,()=>{}),/incomplete/);
  assert.equal(selectionMatches('الف $x$ 😀','😀'),true);
  assert.equal(selectionMatches('x x','x'),false);
  assert.equal(selectionMatches('**x**','fabricated'),false);
});

test('done finishes and cancels the reader even if HTTP remains open',async()=>{
  let controller,cancelled=false;
  const stream=new ReadableStream({start(c){controller=c;c.enqueue(new TextEncoder().encode('event: done\ndata: {}\n\n'));},cancel(){cancelled=true;}});
  const pending=consumeTutorStream(stream,()=>{});
  const finished=await Promise.race([pending.then(()=>true),new Promise(r=>setTimeout(()=>r(false),100))]);
  if(!finished)controller.close();
  assert.equal(finished,true);
  assert.equal(cancelled,true);
});
