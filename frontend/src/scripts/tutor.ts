import {message} from './api';
import {consumeTutorStream,selectionMatches} from '../lib/tutor.mjs';

for(const root of document.querySelectorAll<HTMLElement>('[data-tutor-slug]')) {
  const status=root.querySelector<HTMLElement>('[data-chat-status]')!;
  const answer=root.querySelector<HTMLElement>('[data-chat-answer]')!;
  const contextLabel=root.querySelector<HTMLElement>('[data-chat-context]')!;
  const form=root.querySelector<HTMLFormElement>('[data-chat-form]')!;
  const cancelButton=root.querySelector<HTMLButtonElement>('[data-chat-cancel]')!;
  const askButtons=Array.from(form.querySelectorAll<HTMLButtonElement>('button:not([data-chat-cancel])'));
  const setBusy=(busy:boolean)=>{form.setAttribute('aria-busy',String(busy));askButtons.forEach(button=>button.disabled=busy);cancelButton.disabled=!busy;};
  let active:AbortController|undefined, conversation:string|undefined, selected='', target:HTMLElement|undefined;
  function cancel(clear=false) {
    active?.abort();active=undefined;setBusy(false);
    if(clear){answer.replaceChildren();contextLabel.textContent='';conversation=undefined;}
  }
  document.addEventListener('garden:context-change',()=>{cancel(true);selected='';target=undefined;status.textContent='نسخه تغییر کرد؛ متن را دوباره انتخاب کنید.';});
  document.addEventListener('selectionchange',()=>{
    const selection=window.getSelection();
    if(!selection?.rangeCount || selection.isCollapsed)return;
    const range=selection.getRangeAt(0);
    const element=range.commonAncestorContainer instanceof Element?range.commonAncestorContainer:range.commonAncestorContainer.parentElement;
    const source=element?.closest<HTMLElement>('[data-ai-scope]');
    if(!source || !source.contains(range.startContainer) || !source.contains(range.endContainer))return;
    const text=selection.toString();
    if(text!==selected || target!==source){cancel(true);selected=text;target=source;status.textContent='متن انتخاب شد.';}
  });
  async function ask() {
    if(active)return;
    if(!target || !selected){status.textContent='ابتدا بخشی از جزوه را انتخاب کنید.';return;}
    if(target.dataset.aiDirty==='true'){status.textContent='ابتدا نسخهٔ شخصی را ذخیره و متن را دوباره انتخاب کنید.';return;}
    cancel();const controller=new AbortController();active=controller;setBusy(true);
    const source=target, passage=selected, scope=source.dataset.aiScope, version=source.dataset.aiHash;
    let text='';answer.replaceChildren();contextLabel.textContent='';status.textContent='در حال دریافت پاسخ…';
    try {
      let raw=source.dataset.aiRaw;
      if(raw===undefined){
        const stored=await fetch('/api/workspace/notes/'+encodeURIComponent(root.dataset.tutorSlug!),{signal:controller.signal});
        if(!stored.ok)throw new Error(stored.status===401?'ابتدا وارد حساب شوید.':'دریافت متن مجاز ممکن نیست.');
        const note=await stored.json();raw=note.canonical.content;
        if(note.canonical.current_hash!==version)throw new Error('نسخه تغییر کرده است؛ صفحه را دوباره بارگذاری کنید.');
      }
      if(!selectionMatches(raw ?? '',passage))throw new Error('انتخاب باید با یک بخش یکتای Markdown ذخیره‌شده منطبق باشد. متن ساده را انتخاب کنید؛ فرمول یا قالب‌بندی تبدیل‌شده ممکن است منطبق نباشد.');
      const response=await fetch('/api/ai/chat',{method:'POST',signal:controller.signal,
        headers:{'Content-Type':'application/json','X-Requested-With':'MathGarden','Accept':'text/event-stream'},
        body:JSON.stringify({question:new FormData(form).get('question'),slug:root.dataset.tutorSlug,
          scope,expected_hash:version,selection:passage,conversation_id:conversation})});
      if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(response.status===401?'ابتدا وارد حساب شوید.':response.status===503?'Dify تنظیم نشده یا موقتاً در دسترس نیست.':data.detail || 'خطای دستیار');}
      if(!response.body)throw new Error('پاسخ استریم موجود نیست.');
      await consumeTutorStream(response.body,(event,data)=>{
        if(controller.signal.aborted)return;
        if(event==='conversation')conversation=data.id;
        if(event==='context')contextLabel.textContent=`متن ورودی مجاز: ${data.scope==='personal'?'نسخهٔ شخصی':'نسخهٔ رسمی'} — ${data.hash.slice(0,12)} (استناد پاسخ ارزیابی نشده)`;
        if(event==='text'){text+=data;answer.textContent=text;}
      });
      const preview=await fetch('/api/preview',{method:'POST',signal:controller.signal,headers:{'X-Requested-With':'MathGarden'},body:text});
      if(preview.ok){
        const rendered=await preview.json();
        if(!controller.signal.aborted){
          // AI text must not trigger resource fetches that can disclose private context.
          const markup=document.createElement('template');markup.innerHTML=rendered.html;
          markup.content.querySelectorAll('img,iframe,audio,video,source,object,embed,image').forEach(node=>node.remove());
          answer.replaceChildren(markup.content);
        }
      }
      if(!controller.signal.aborted)status.textContent='پاسخ دریافت شد؛ با جزوه بررسی کنید.';
    } catch(error) {
      if(!controller.signal.aborted)status.textContent=message(error);
    } finally {if(active===controller){active=undefined;setBusy(false);}}
  }
  form.addEventListener('submit',event=>{event.preventDefault();void ask();});
  for(const button of root.querySelectorAll<HTMLElement>('[data-ask-selection]'))button.addEventListener('click',()=>{
    form.querySelector<HTMLTextAreaElement>('textarea')!.value=button.dataset.askSelection!;void ask();
  });
  root.querySelector('[data-chat-cancel]')!.addEventListener('click',()=>{cancel();status.textContent='پاسخ لغو شد.';});
  window.addEventListener('pagehide',()=>cancel(true));
}
