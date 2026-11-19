import {useEffect,useMemo,useState} from 'react';
import {AssistantRuntimeProvider,useLocalRuntime,ThreadPrimitive,MessagePrimitive,ComposerPrimitive,ErrorPrimitive,useMessagePartText,type ChatModelAdapter} from '@assistant-ui/react';
import {DirectionProvider} from '@base-ui/react/direction-provider';
import {Send,Square,Sparkles} from 'lucide-react';
import {consumeTutorStream,selectionMatches} from '../lib/tutor.mjs';
import 'katex/dist/katex.min.css';

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkCallout from '@r4ai/remark-callout';
import remarkRehype from 'remark-rehype';
import rehypeKatex from 'rehype-katex';
import rehypeStringify from 'rehype-stringify';

const mathProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkCallout)
  .use(remarkRehype)
  .use(rehypeKatex)
  .use(rehypeStringify);

function normalizeLatex(raw: string): string {
  if (!raw) return '';
  let s = raw.replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => `\n\n$$\n${math.trim()}\n$$\n\n`);
  s = s.replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => `$${math.trim()}$`);
  return s;
}

function AssistantMarkdownText() {
  const { text, status } = useMessagePartText();

  const renderedHtml = useMemo(() => {
    if (!text) return '';
    try {
      const normalized = normalizeLatex(text);
      const vfile = mathProcessor.processSync(normalized);
      return String(vfile);
    } catch (err) {
      console.warn('Math processing error:', err);
      return text;
    }
  }, [text]);

  return (
    <div className="assistant-markdown">
      <div dangerouslySetInnerHTML={{ __html: renderedHtml }} />
      {status.type === 'running' && (
        <span className="assistant-cursor" style={{ fontFamily: 'revert' }}> ●</span>
      )}
    </div>
  );
}

function UserMarkdownText() {
  const { text } = useMessagePartText();

  const renderedHtml = useMemo(() => {
    if (!text) return '';
    try {
      const normalized = normalizeLatex(text);
      const vfile = mathProcessor.processSync(normalized);
      return String(vfile);
    } catch {
      return text;
    }
  }, [text]);

  return (
    <div className="user-markdown">
      <div dangerouslySetInnerHTML={{ __html: renderedHtml }} />
    </div>
  );
}

export default function StudyAssistant({slug}:{slug:string}){
 const [selection,setSelection]=useState('');
 const [source,setSource]=useState<HTMLElement|null>(null);
 const adapter=useMemo<ChatModelAdapter>(()=>({async *run({messages,abortSignal}){
  const activeSource = source || document.querySelector<HTMLElement>('[data-ai-scope]') || document.querySelector<HTMLElement>('article.note');
  if(activeSource?.dataset.aiDirty==='true')throw new Error('ابتدا تغییرها را ذخیره کنید.');
  const scope=(activeSource?.dataset.aiScope as 'canonical'|'personal') || 'canonical';
  let hash=activeSource?.dataset.aiHash || '';
  let raw=activeSource?.dataset.aiRaw;
  if(raw===undefined || !hash){
    const r=await fetch('/api/workspace/notes/'+encodeURIComponent(slug),{signal:abortSignal});
    if(!r.ok)throw new Error(r.status===401?'برای گفتگو وارد حساب شوید.':'دریافت متن ممکن نیست.');
    const d=await r.json();
    raw=d.canonical.content;
    hash=d.canonical.current_hash;
  }
  let activeSelection = selection ? selection.trim() : '';
  if(!activeSelection && raw){
    activeSelection = raw.length > 2000 ? raw.slice(0, 2000) : raw;
  }
  const question=messages.at(-1)?.content.filter(p=>p.type==='text').map(p=>p.text).join('\n');
  const r=await fetch('/api/ai/chat',{method:'POST',signal:abortSignal,headers:{'Content-Type':'application/json','X-Requested-With':'MathGarden','Accept':'text/event-stream'},body:JSON.stringify({slug,scope,expected_hash:hash,selection:activeSelection,question,conversation_id:conversationIdRef.current||undefined})});
  if(!r.ok||!r.body){
    let detail = '';
    try { const d = await r.json(); detail = d.detail; } catch {}
    throw new Error(detail || (r.status===401?'وارد حساب شوید.':r.status===503?'دستیار فعلاً پیکربندی نشده یا در دسترس نیست.':'دریافت پاسخ ناموفق بود.'));
  }
  let text='';let failure:unknown;let done=false;const queue:string[]=[];
  const pump=consumeTutorStream(r.body,(event,data)=>{if(event==='text'){text+=data;queue.push(text);}}).catch(e=>{failure=e}).finally(()=>{done=true});
  while(!done||queue.length){if(abortSignal.aborted)break;if(queue.length){yield {content:[{type:'text',text:queue.shift()!}]};}else await new Promise(resolve=>setTimeout(resolve,25));}
  await pump;if(failure)throw failure;
 }}),[slug,source,selection]);
 const runtime=useLocalRuntime(adapter);
 useEffect(()=>{function select(){const s=window.getSelection();if(!s?.rangeCount||s.isCollapsed)return;const r=s.getRangeAt(0);const e=r.commonAncestorContainer instanceof Element?r.commonAncestorContainer:r.commonAncestorContainer.parentElement;const a=e?.closest<HTMLElement>('[data-ai-scope]');if(a&&a.contains(r.startContainer)&&a.contains(r.endContainer)){runtime.thread.cancelRun();setSelection(s.toString());setSource(a);}}
 function clear(){runtime.thread.cancelRun();runtime.thread.reset();setSelection('');setSource(null);}
 document.addEventListener('selectionchange',select);document.addEventListener('garden:context-change',clear);return()=>{document.removeEventListener('selectionchange',select);document.removeEventListener('garden:context-change',clear);};},[runtime]);
 return <DirectionProvider direction="rtl"><AssistantRuntimeProvider runtime={runtime}><section className="study-assistant" aria-label="دستیار مطالعه"><header><Sparkles size={18}/><strong>دستیار مطالعه</strong></header><p className="assistant-hint">دربارهٔ بخشی از همین جزوه یا کل یادداشت بپرسید.</p>{selection&&<button className="assistant-selection" onClick={()=>{setSelection('');setSource(null);runtime.thread.cancelRun();}}>متن انتخابی: {selection.slice(0,95)} · حذف</button>}<ThreadPrimitive.Root><ThreadPrimitive.Viewport className="assistant-messages"><ThreadPrimitive.Empty><p>پرسش خود دربارهٔ این یادداشت را بنویسید (یا بخشی از متن را با موس انتخاب کنید).</p></ThreadPrimitive.Empty><ThreadPrimitive.Messages components={{UserMessage:()=> <MessagePrimitive.Root className="assistant-user"><MessagePrimitive.Content components={{ Text: UserMarkdownText }} /></MessagePrimitive.Root>,AssistantMessage:()=> <MessagePrimitive.Root className="assistant-response"><MessagePrimitive.Content components={{ Text: AssistantMarkdownText }} /><MessagePrimitive.Error><p role="alert" className="text-destructive text-sm leading-relaxed p-2"><ErrorPrimitive.Message /></p></MessagePrimitive.Error></MessagePrimitive.Root>}}/></ThreadPrimitive.Viewport><ComposerPrimitive.Root className="assistant-composer"><ComposerPrimitive.Input placeholder="این بخش را ساده‌تر توضیح بده…" aria-label="پرسش از دستیار"/><div><ComposerPrimitive.Send aria-label="ارسال پرسش"><Send size={18}/></ComposerPrimitive.Send><ComposerPrimitive.Cancel aria-label="توقف پاسخ"><Square size={16}/></ComposerPrimitive.Cancel></div></ComposerPrimitive.Root></ThreadPrimitive.Root></section></AssistantRuntimeProvider></DirectionProvider>;
}
