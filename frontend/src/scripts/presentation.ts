import {sectionSlides} from './presentation-slides.mjs';

const trigger=document.querySelector<HTMLButtonElement>('[data-presentation-open]');
const dialog=document.querySelector<HTMLDialogElement>('[data-presentation]');
const source=document.querySelector<HTMLElement>('article.note:not([data-live-preview]):not([data-presentation-stage])');
const menu=document.querySelector('[data-note-more]');
if(trigger&&dialog&&source&&menu){
  menu.append(trigger);trigger.hidden=false;
  const stage=dialog.querySelector<HTMLElement>('[data-presentation-stage]')!;
  const status=dialog.querySelector<HTMLElement>('[data-presentation-status]')!;
  const count=dialog.querySelector<HTMLElement>('[data-presentation-count]')!;
  const previous=dialog.querySelector<HTMLButtonElement>('[data-presentation-prev]')!;
  const next=dialog.querySelector<HTMLButtonElement>('[data-presentation-next]')!;
  const fullscreen=dialog.querySelector<HTMLButtonElement>('[data-presentation-fullscreen]')!;
  const title=document.querySelector('.workspace-document > h1')?.textContent||document.title;
  let slides:Node[][]=[],index=0,epoch=0,invalid=false,controller:AbortController|undefined;
  let focus:HTMLElement|null=null;
  let identity:string|null|undefined;
  const render=()=>{
    stage.replaceChildren(...(slides[index]||[]));stage.scrollTop=0;
    count.textContent=slides.length?`${index+1} / ${slides.length}`:'';
    previous.disabled=index===0;next.disabled=index>=slides.length-1;
  };
  const clear=()=>{epoch++;controller?.abort();slides=[];stage.replaceChildren();count.textContent='';status.textContent='';previous.disabled=true;next.disabled=true;if(document.fullscreenElement===dialog)void document.exitFullscreen().catch(()=>{});};
  const flush=()=>new Promise<{content:string}>((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('ذخیره کامل نشد؛ دوباره تلاش کنید.')),15000);
    document.dispatchEvent(new CustomEvent('garden:flush-note',{detail:{resolve:(value:{content:string})=>{clearTimeout(timer);resolve(value);},reject:(error:unknown)=>{clearTimeout(timer);reject(error);}}}));
  });
  trigger.addEventListener('click',async()=>{
    if(invalid||dialog.open)return;
    focus=document.activeElement as HTMLElement;clear();const started=epoch;
    dialog.showModal();status.textContent='در حال آماده‌سازی ارائه…';fullscreen.hidden=!document.fullscreenEnabled;render();
    try{
      const content=document.createElement('div');
      const workspace=document.querySelector<HTMLElement>('[data-workspace-note]');
      const privateScope=workspace?.dataset.libraryId||workspace?.classList.contains('is-editing')||source.dataset.aiScope==='personal';
      if(workspace&&privateScope){
        const snapshot=await flush();if(started!==epoch)return;
        controller=new AbortController();
        const response=await fetch('/api/preview',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'X-Requested-With':'MathGarden'},body:snapshot.content,signal:controller.signal});
        if(!response.ok)throw new Error('آماده‌سازی ارائه انجام نشد؛ وضعیت ورود و ذخیره را بررسی کنید.');
        const result=await response.json();if(typeof result.html!=='string')throw new Error('پاسخ ارائه معتبر نیست.');
        content.innerHTML=result.html;
      }else content.append(...Array.from(source.childNodes,node=>node.cloneNode(true)));
      if(started!==epoch||invalid||!dialog.open)return;
      // Avoid duplicate page IDs; presentation does not resolve additional references.
      content.querySelectorAll('[id]').forEach(node=>node.removeAttribute('id'));
      const heading=document.createElement('h1');heading.textContent=title;
      slides=[[heading],...sectionSlides(Array.from(content.childNodes))];index=0;status.textContent='';render();stage.focus();
    }catch(error){if(started===epoch&&!invalid)status.textContent=error instanceof Error?error.message:'آماده‌سازی ارائه انجام نشد.';}
  });
  const move=(position:number)=>{if(!slides.length)return;index=Math.max(0,Math.min(slides.length-1,position));render();};
  previous.addEventListener('click',()=>move(index-1));next.addEventListener('click',()=>move(index+1));
  dialog.querySelector('[data-presentation-close]')!.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{clear();if(!invalid)(focus?.isConnected&&focus.getClientRects().length?focus:document.querySelector<HTMLElement>('[data-more-toggle]'))?.focus();});
  dialog.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();dialog.close();return;}
    if(event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||(event.target as Element).closest('input,textarea,select,[contenteditable],video,audio,iframe'))return;
    const target=({ArrowRight:index+1,ArrowLeft:index-1,Home:0,End:slides.length-1} as Record<string,number>)[event.key];
    if(target!==undefined){event.preventDefault();event.stopPropagation();move(target);}
  });
  fullscreen.addEventListener('click',()=>{void (document.fullscreenElement===dialog?document.exitFullscreen():dialog.requestFullscreen()).catch(()=>{status.textContent='تمام‌صفحه در این مرورگر در دسترس نیست.';});});
  document.addEventListener('garden:identity',event=>{const next=(event as CustomEvent).detail?.id??null;if(identity===undefined){identity=next;return;}if(identity===next)return;identity=next;invalid=true;trigger.disabled=true;clear();if(dialog.open)dialog.close();});
  document.addEventListener('astro:before-swap',()=>{clear();if(dialog.open)dialog.close();});
}
