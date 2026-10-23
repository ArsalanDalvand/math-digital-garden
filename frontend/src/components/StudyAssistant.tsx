import {useEffect,useMemo,useState} from 'react';
import {AssistantRuntimeProvider,useLocalRuntime,ThreadPrimitive,MessagePrimitive,ComposerPrimitive,type ChatModelAdapter} from '@assistant-ui/react';
import {DirectionProvider} from '@base-ui/react/direction-provider';
import {Send,Square,Sparkles} from 'lucide-react';
import {consumeTutorStream,selectionMatches} from '../lib/tutor.mjs';
export default function StudyAssistant({slug}:{slug:string}){
 const [selection,setSelection]=useState('');
 const [source,setSource]=useState<HTMLElement|null>(null);
 const adapter=useMemo<ChatModelAdapter>(()=>({async *run({messages,abortSignal}){
  if(!source||!selection)throw new Error('ابتدا بخشی از جزوه را انتخاب کنید.');
  if(source.dataset.aiDirty==='true')throw new Error('ابتدا تغییرها را ذخیره کنید.');
  const scope=source.dataset.aiScope,hash=source.dataset.aiHash;
  let raw=source.dataset.aiRaw;
  if(raw===undefined){const r=await fetch('/api/workspace/notes/'+encodeURIComponent(slug),{signal:abortSignal});if(!r.ok)throw new Error(r.status===401?'برای گفتگو وارد حساب شوید.':'دریافت متن ممکن نیست.');const d=await r.json();if(d.canonical.current_hash!==hash)throw new Error('نسخه تغییر کرده؛ صفحه را تازه کنید.');raw=d.canonical.content;}
  if(!selectionMatches(raw??'',selection))throw new Error('یک بخش یکتای متن ساده را انتخاب کنید؛ انتخاب فرمول تبدیل‌شده ممکن است منطبق نباشد.');
  const question=messages.at(-1)?.content.filter(p=>p.type==='text').map(p=>p.text).join('\n');
  const r=await fetch('/api/ai/chat',{method:'POST',signal:abortSignal,headers:{'Content-Type':'application/json','X-Requested-With':'MathGarden','Accept':'text/event-stream'},body:JSON.stringify({slug,scope,expected_hash:hash,selection,question})});
  if(!r.ok||!r.body)throw new Error(r.status===401?'وارد حساب شوید.':r.status===503?'دستیار فعلاً پیکربندی نشده یا در دسترس نیست.':'دریافت پاسخ ناموفق بود.');
  let text='';let failure:unknown;let done=false;const queue:string[]=[];
  const pump=consumeTutorStream(r.body,(event,data)=>{if(event==='text'){text+=data;queue.push(text);}}).catch(e=>{failure=e}).finally(()=>{done=true});
  while(!done||queue.length){if(abortSignal.aborted)break;if(queue.length){yield {content:[{type:'text',text:queue.shift()!}]};}else await new Promise(resolve=>setTimeout(resolve,25));}
  await pump;if(failure)throw failure;
 }}),[slug,source,selection]);
 const runtime=useLocalRuntime(adapter);
 useEffect(()=>{function select(){const s=window.getSelection();if(!s?.rangeCount||s.isCollapsed)return;const r=s.getRangeAt(0);const e=r.commonAncestorContainer instanceof Element?r.commonAncestorContainer:r.commonAncestorContainer.parentElement;const a=e?.closest<HTMLElement>('[data-ai-scope]');if(a&&a.contains(r.startContainer)&&a.contains(r.endContainer)){runtime.thread.cancelRun();setSelection(s.toString());setSource(a);}}
 function clear(){runtime.thread.cancelRun();runtime.thread.reset();setSelection('');setSource(null);}
 document.addEventListener('selectionchange',select);document.addEventListener('garden:context-change',clear);return()=>{document.removeEventListener('selectionchange',select);document.removeEventListener('garden:context-change',clear);};},[runtime]);
 return <DirectionProvider direction="rtl"><AssistantRuntimeProvider runtime={runtime}><section className="study-assistant" aria-label="دستیار مطالعه"><header><Sparkles size={18}/><strong>دستیار مطالعه</strong></header><p className="assistant-hint">دربارهٔ بخشی از همین جزوه بپرسید. پاسخ را با متن بررسی کنید.</p>{selection&&<button className="assistant-selection" onClick={()=>{setSelection('');setSource(null);runtime.thread.cancelRun();}}>متن انتخابی: {selection.slice(0,95)} · حذف</button>}<ThreadPrimitive.Root><ThreadPrimitive.Viewport className="assistant-messages"><ThreadPrimitive.Empty><p>متنی را انتخاب کنید، سپس پرسشتان را بنویسید.</p></ThreadPrimitive.Empty><ThreadPrimitive.Messages components={{UserMessage:()=> <MessagePrimitive.Root className="assistant-user"><MessagePrimitive.Content/></MessagePrimitive.Root>,AssistantMessage:()=> <MessagePrimitive.Root className="assistant-response"><MessagePrimitive.Content/><MessagePrimitive.Error><p role="alert">دریافت پاسخ ناموفق بود؛ وضعیت حساب و دسترسی دستیار را بررسی کنید.</p></MessagePrimitive.Error></MessagePrimitive.Root>}}/></ThreadPrimitive.Viewport><ComposerPrimitive.Root className="assistant-composer"><ComposerPrimitive.Input placeholder="این بخش را ساده‌تر توضیح بده…" aria-label="پرسش از دستیار"/><div><ComposerPrimitive.Send aria-label="ارسال پرسش"><Send size={18}/></ComposerPrimitive.Send><ComposerPrimitive.Cancel aria-label="توقف پاسخ"><Square size={16}/></ComposerPrimitive.Cancel></div></ComposerPrimitive.Root></ThreadPrimitive.Root></section></AssistantRuntimeProvider></DirectionProvider>;
}
