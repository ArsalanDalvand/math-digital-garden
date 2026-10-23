import type {EditorView} from '@codemirror/view';
import type {MathfieldElement} from 'mathlive';
import {syntaxTree} from '@codemirror/language';
import {undo,redo} from '@codemirror/commands';
import {Transaction} from '@codemirror/state';
import {commandChanges} from '../lib/editor-commands.mjs';
import {bindInlineMathLive} from '../lib/inline-mathlive';

/** Bind a single editor; call returned cleanup before destroying its view. */
export function bindEditorToolbar(host:HTMLElement,view:EditorView,math:MathfieldElement):()=>void{
  const toolbar=host.querySelector<HTMLElement>('[role="toolbar"]')!;
  const dialog=host.querySelector<HTMLDialogElement>('[data-toolbar-link]')!;
  const form=host.querySelector<HTMLFormElement>('[data-toolbar-link-form]')!;
  const input=form.elements.namedItem('url') as HTMLInputElement;
  const error=host.querySelector<HTMLElement>('[data-link-error]')!;
  const status=host.querySelector<HTMLElement>('[data-toolbar-status]')!;
  const block=host.querySelector<HTMLSelectElement>('[data-toolbar-block]')!;
  const controls=Array.from(toolbar.querySelectorAll<HTMLButtonElement|HTMLSelectElement>('button,select'));
  const events=new AbortController();const {signal}=events;
  const disposeMath=bindInlineMathLive(host,view,math);
  let linkSelection:{from:number;to:number;doc:string}|undefined;

  function updateActiveStates(){
    if(!view.state||!view.state.selection)return;
    const sel=view.state.selection.main;
    try {
      const tree=syntaxTree(view.state);
      if(!tree)return;
      let isBold=false,isItalic=false,isStrike=false,isCode=false;
      let blockVal='paragraph';
      const line=view.state.doc.lineAt(sel.from).text;
      if(/^# /.test(line))blockVal='h1';
      else if(/^## /.test(line))blockVal='h2';
      else if(/^### /.test(line))blockVal='h3';
      else if(/^> /.test(line))blockVal='quote';
      else if(/^```/.test(line))blockVal='codeblock';

      let node:import('@lezer/common').SyntaxNode|null=tree.resolveInner(sel.from,1);
      while(node){
        if(node.name==='StrongEmphasis')isBold=true;
        if(node.name==='Emphasis')isItalic=true;
        if(node.name==='Strikethrough')isStrike=true;
        if(node.name==='InlineCode')isCode=true;
        node=node.parent;
      }
      toolbar.querySelector('[data-toolbar-action="bold"]')?.setAttribute('aria-pressed',String(isBold));
      toolbar.querySelector('[data-toolbar-action="italic"]')?.setAttribute('aria-pressed',String(isItalic));
      toolbar.querySelector('[data-toolbar-action="strike"]')?.setAttribute('aria-pressed',String(isStrike));
      toolbar.querySelector('[data-toolbar-action="inlinecode"]')?.setAttribute('aria-pressed',String(isCode));
      if(block&&document.activeElement!==block)block.value=blockVal;
    } catch {}
  }

  function execute(action:string,url?:string){
    status.textContent='';
    if(view.state.readOnly||host.closest('[hidden]'))return;
    if(view.state.selection.ranges.length!==1){status.textContent='برای قالب‌بندی یک بخش از متن را انتخاب کنید.';return;}
    if(action==='undo'||action==='redo'){(action==='undo'?undo:redo)(view);view.focus();return;}
    const selection=action==='link'&&linkSelection?linkSelection:view.state.selection.main;
    const doc=view.state.doc.toString();
    if(action==='link'&&linkSelection?.doc!==doc){error.textContent='متن تغییر کرده است؛ پنجره را ببندید و دوباره بخش موردنظر را انتخاب کنید.';return;}
    let inCode=false;
    syntaxTree(view.state).iterate({from:selection.from,to:selection.to,enter(node){
      if(['FencedCode','CodeBlock','InlineCode'].includes(node.name)){inCode=true;return false;}
    }});
    const edit=commandChanges(doc,selection.from,selection.to,action,{url,inCode});
    if(!edit){
      if(action==='link'&&!inCode){error.textContent='نشانی معتبر با http یا https وارد کنید.';return;}
      status.textContent=inCode?'قالب‌بندی داخل کد انجام نمی‌شود.':'این قالب‌بندی قابل انجام نیست.';
      if(dialog.open)dialog.close();view.focus();return;
    }
    view.dispatch({...edit,scrollIntoView:true,annotations:Transaction.userEvent.of('input.toolbar')});
    updateActiveStates();
    if(dialog.open)dialog.close();view.focus();
  }
  toolbar.addEventListener('pointerdown',event=>{if((event.target as HTMLElement).closest('button'))event.preventDefault();},{signal});
  toolbar.addEventListener('click',event=>{
    const button=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-toolbar-action]');
    if(!button)return;
    if(button.dataset.toolbarAction==='link'){
      if(view.state.readOnly)return;
      const {from,to}=view.state.selection.main;linkSelection={from,to,doc:view.state.doc.toString()};
      input.value='';error.textContent='';dialog.showModal();input.focus();
    }else execute(button.dataset.toolbarAction!);
  },{signal});
  block.addEventListener('change',()=>{execute(block.value);block.value='paragraph';},{signal});
  toolbar.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    const index=controls.indexOf(event.target as HTMLButtonElement|HTMLSelectElement);if(index<0)return;
    event.preventDefault();const rtl=getComputedStyle(toolbar).direction==='rtl';
    const next=event.key==='Home'?0:event.key==='End'?controls.length-1:(index+((event.key==='ArrowRight')!==rtl?1:-1)+controls.length)%controls.length;
    controls[next].focus();
  },{signal});
  form.addEventListener('submit',event=>{event.preventDefault();if(form.reportValidity())execute('link',input.value);},{signal});
  host.querySelector('[data-toolbar-link-cancel]')!.addEventListener('click',()=>dialog.close(),{signal});
  dialog.addEventListener('close',()=>{linkSelection=undefined;view.focus();},{signal});

  host.ownerDocument?.addEventListener('selectionchange',()=>{if(!host.hidden)updateActiveStates();},{signal});
  view.dom?.addEventListener('keyup',updateActiveStates,{signal});
  view.dom?.addEventListener('pointerup',updateActiveStates,{signal});

  return()=>{events.abort();if(dialog.open)dialog.close();disposeMath();};
}
