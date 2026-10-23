import {StateEffect,StateField} from '@codemirror/state';
import {Decoration,EditorView,WidgetType} from '@codemirror/view';
import {syntaxTree} from '@codemirror/language';
import type {MathfieldElement} from 'mathlive';

type ActiveMath={from:number;to:number;delimiter:string;math:MathfieldElement};
const setMath=StateEffect.define<ActiveMath|null>();
class InlineMathWidget extends WidgetType{
  constructor(readonly math:MathfieldElement){super();}
  eq(other:InlineMathWidget){return other.math===this.math;}
  toDOM(){const wrapper=document.createElement('span');wrapper.className='cm-mathlive';wrapper.contentEditable='false';wrapper.append(this.math);return wrapper;}
  ignoreEvent(){return true;}
}
const activeMath=StateField.define<ActiveMath|null>({
  create:()=>null,
  update(active,tr){
    for(const effect of tr.effects)if(effect.is(setMath))return effect.value;
    if(!active)return null;
    if(tr.state.readOnly)return null;
    const from=tr.changes.mapPos(active.from,-1),to=tr.changes.mapPos(active.to,1);
    if(tr.selection&&(tr.selection.main.from<from||tr.selection.main.to>to))return null;
    return {...active,from,to};
  },
  provide:field=>EditorView.decorations.from(field,active=>{
    if(!active)return Decoration.none;
    const widget=new InlineMathWidget(active.math);
    return Decoration.set([active.from===active.to?Decoration.widget({widget,side:1}).range(active.from):Decoration.replace({widget}).range(active.from,active.to)]);
  })
});
export const inlineMathLive=[activeMath,EditorView.baseTheme({
  '.cm-mathlive':{display:'inline-block',maxWidth:'100%',verticalAlign:'middle',direction:'ltr',unicodeBidi:'isolate'},
  '.cm-mathlive math-field':{display:'inline-block',maxWidth:'100%',minWidth:'2em',padding:'0',border:'none',borderRadius:'0',background:'transparent',color:'inherit',fontSize:'inherit',outline:'1px solid var(--primary)'},
  '.cm-mathlive math-field::part(virtual-keyboard-toggle)':{display:'none'},
  '.cm-mathlive math-field::part(menu-toggle)':{display:'none'}
})];

export function bindInlineMathLive(host:HTMLElement,view:EditorView,math:MathfieldElement){
  const button=host.querySelector<HTMLButtonElement>('[data-toolbar-math]')!;
  const status=host.querySelector<HTMLElement>('[data-toolbar-status]')!;
  const events=new AbortController(),{signal}=events;
  let disposed=false;
  math.mathVirtualKeyboardPolicy='manual';
  function close(focus=false){
    if(disposed)return;
    const active=view.state.field(activeMath);
    if(active)view.dispatch({effects:setMath.of(null),selection:{anchor:active.to}});
    window.mathVirtualKeyboard.hide();button.setAttribute('aria-pressed','false');
    math.value='';if(focus)view.focus();
  }
  button.addEventListener('click',()=>{
    if(view.state.readOnly||host.hidden)return;
    if(view.state.field(activeMath)){close(true);return;}
    let {from,to}=view.state.selection.main;
    let node:import('@lezer/common').SyntaxNode|null=syntaxTree(view.state).resolveInner(from,1);
    for(;node;node=node.parent)if(/Code|Fenced/.test(node.name)){status.textContent='فرمول را بیرون از بلوک کد وارد کنید.';return;}
    status.textContent='';let delimiter='$',value=view.state.sliceDoc(from,to);
    for(const match of view.state.doc.toString().matchAll(/(?<![\\$])\$\$([\s\S]+?)\$\$|(?<![\\$])\$([^$\n]+?)\$(?!\$)/g)){
      if(match.index<=from&&to<=match.index+match[0].length){from=match.index;to=from+match[0].length;delimiter=match[1]!==undefined?'$$':'$';value=match[1]??match[2];break;}
    }
    math.value=value;
    view.dispatch({effects:setMath.of({from,to,delimiter,math}),selection:{anchor:from},scrollIntoView:true});
    button.setAttribute('aria-pressed','true');math.focus();window.mathVirtualKeyboard.show();
  },{signal});
  math.addEventListener('input',()=>{
    const active=view.state.field(activeMath);if(!active||view.state.readOnly)return;
    const insert=math.value?active.delimiter+math.value+active.delimiter:'';
    const next={...active,to:active.from+insert.length};
    view.dispatch({changes:{from:active.from,to:active.to,insert},effects:setMath.of(next),selection:{anchor:active.from}});
  },{signal});
  math.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);}
  },{signal,capture:true});
  math.addEventListener('focusout',()=>queueMicrotask(()=>{if(!disposed&&!math.hasFocus())close();}),{signal});
  return()=>{close();disposed=true;events.abort();};
}
