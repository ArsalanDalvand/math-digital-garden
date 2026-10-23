import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../frontend/package.json',import.meta.url));
const {JSDOM}=require('jsdom'),ts=require('typescript');
const {EditorState,StateField,StateEffect}=require('@codemirror/state');
const {EditorView,Decoration,WidgetType}=require('@codemirror/view');
const {syntaxTree}=require('@codemirror/language'),{markdown}=require('@codemirror/lang-markdown');
const read=path=>readFileSync(new URL('../../frontend/src/'+path,import.meta.url),'utf8');

test('MathLive writes inline at selection, reopens formulas and clears on cleanup',()=>{
 const markup=read('components/EditorToolbar.astro').split('<style>')[0];
 assert.doesNotMatch(markup+read('components/WorkspaceNote.astro'),/data-math-field|data-insert-math|data-toolbar-math-panel/);
 const dom=new JSDOM(markup,{runScripts:'outside-only'}),{window}=dom,{document}=window;
 const host=document.querySelector('[data-editor-toolbar]');host.hidden=false;
 const math=document.createElement('math-field');math.value='';math.focus=()=>{};math.hasFocus=()=>true;
 let shown=false,focus=0;
 Object.assign(window,{EditorView,Decoration,WidgetType,StateField,StateEffect,syntaxTree,mathVirtualKeyboard:{show(){shown=true;},hide(){shown=false;}}});
 window.eval(ts.transpile(read('lib/inline-mathlive.ts').replace(/^import .*;\n/gm,'').replace(/export /g,''),{target:ts.ScriptTarget.ES2022})+'\nwindow.inlineMathLive=inlineMathLive;window.bind=bindInlineMathLive;');
 const view={state:EditorState.create({doc:'before selected after',selection:{anchor:7,head:15},extensions:[markdown(),window.inlineMathLive]}),dispatch(edit){this.state=this.state.update(edit).state;},focus(){focus++;}};
 const dispose=window.bind(host,view,math),toggle=host.querySelector('[data-toolbar-math]');
 toggle.click();assert.equal(shown,true);assert.equal(math.value,'selected');
 assert.equal(view.state.doc.toString(),'before selected after');
 math.value='x^2';math.dispatchEvent(new window.Event('input'));
 assert.equal(view.state.doc.toString(),'before $x^2$ after');
 math.addEventListener('keydown',event=>event.stopPropagation());
 math.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
 assert.equal(shown,false);assert.ok(focus>0);assert.equal(toggle.getAttribute('aria-pressed'),'false');
 view.dispatch({selection:{anchor:9}});toggle.click();assert.equal(math.value,'x^2');
 math.value='y';math.dispatchEvent(new window.Event('input'));toggle.click();
 assert.equal(view.state.doc.toString(),'before $y$ after');
 view.dispatch({selection:{anchor:view.state.doc.length}});toggle.click();
 math.value='private formula';dispose();assert.equal(shown,false);assert.equal(math.value,'');
 toggle.click();assert.equal(shown,false);
 dom.window.close();
});

test('MathLive refuses read-only editors and fenced code',()=>{
 const dom=new JSDOM('<div><button data-toolbar-math></button><p data-toolbar-status></p></div>',{runScripts:'outside-only'}),{window}=dom;
 Object.assign(window,{EditorView,Decoration,WidgetType,StateField,StateEffect,syntaxTree,mathVirtualKeyboard:{show(){throw Error('must not open');},hide(){}}});
 window.eval(ts.transpile(read('lib/inline-mathlive.ts').replace(/^import .*;\n/gm,'').replace(/export /g,''),{target:ts.ScriptTarget.ES2022})+'\nwindow.inlineMathLive=inlineMathLive;window.bind=bindInlineMathLive;');
 for(const readonly of [false,true]){
  const math=window.document.createElement('math-field');math.hasFocus=()=>false;
  const view={state:EditorState.create({doc:'```js\nx=1\n```',selection:{anchor:7},extensions:[markdown(),window.inlineMathLive,EditorState.readOnly.of(readonly)]})};
  const dispose=window.bind(window.document.querySelector('div'),view,math);
  window.document.querySelector('button').click();dispose();
 }
 dom.window.close();
});
