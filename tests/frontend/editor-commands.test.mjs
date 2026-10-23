import test from 'node:test';
import assert from 'node:assert/strict';
import {commandChanges} from '../../frontend/src/lib/editor-commands.mjs';
function apply(doc,from,to,action,options){const edit=commandChanges(doc,from,to,action,options);return edit?doc.slice(0,edit.changes.from)+edit.changes.insert+doc.slice(edit.changes.to):doc;}
test('inline edits preserve surrounding Markdown and selected math bytes',()=>{
 const doc='قبل\r\n$\\frac{a}{b}$\r\nبعد';const from=doc.indexOf('$'),to=doc.lastIndexOf('$')+1;
 assert.equal(apply(doc,from,to,'bold'),'قبل\r\n**$\\frac{a}{b}$**\r\nبعد');
 assert.equal(apply('**متن**',2,5,'bold'),'متن');
 assert.equal(apply('`code`',0,6,'inlinecode'),'code');
});
test('block edits preserve CRLF and do not consume next unselected line',()=>{
 assert.equal(apply('one\r\ntwo\r\nthree',0,10,'h2'),'## one\r\n## two\r\nthree');
 assert.equal(apply('## عنوان\nبعد',4,4,'paragraph'),'عنوان\nبعد');
 assert.equal(apply('one\ntwo',0,7,'numbered'),'1. one\n2. two');
 assert.equal(apply('- [x] done\n- todo',0,17,'bullet'),'- done\n- todo');
});
test('links reject unsafe protocols and encode Markdown delimiters',()=>{
 assert.equal(commandChanges('label',0,5,'link',{url:'javascript:alert(1)'}),null);
 assert.equal(commandChanges('label',0,5,'link',{url:'data:text/html,hi'}),null);
 assert.equal(apply('label',0,5,'link',{url:'https://example.org/a(b)'}),'[label](https://example.org/a%28b%29)');
});
test('code context and invalid ranges do not change Markdown',()=>{
 assert.equal(commandChanges('const x=1',0,5,'bold',{inCode:true}),null);
 assert.equal(commandChanges('abc',-1,4,'bold'),null);
 assert.equal(commandChanges('abc',2,1,'bold'),null);
});
test('empty edits expose selected placeholder and code fences avoid collisions',()=>{
 const edit=commandChanges('',0,0,'math');assert.equal(edit.changes.insert,'$x$');assert.deepEqual(edit.selection,{anchor:1,head:2});
 assert.equal(apply('a```b',0,5,'codeblock'),'````\na```b\n````');
 assert.match(apply('',0,0,'table'),/^\|.*\n\| ---/);
});

test('leading blank line and code backticks remain valid bounded edits',()=>{
 assert.equal(apply('\ntext',0,0,'h1'),'# \ntext');
 assert.equal(apply('`x',0,2,'inlinecode'),'`` `x ``');
 assert.equal(apply('a`b',0,3,'inlinecode'),'``a`b``');
 for(const action of ['bold','italic','strike','inlinecode','math','mathblock','codeblock','table','paragraph','h1','h2','h3','quote','bullet','numbered','checklist']){
  const doc='unchanged before\r\nselected\r\nunchanged after',from=doc.indexOf('selected'),to=from+8;
  const edit=commandChanges(doc,from,to,action);
  assert.ok(edit&&edit.changes.from>=0&&edit.changes.to<=doc.length&&edit.changes.from<=edit.changes.to);
  const result=apply(doc,from,to,action);assert.ok(result.startsWith('unchanged before\r\n'));assert.ok(result.endsWith('\r\nunchanged after'));
 }
});
