import {EditorView,Decoration,WidgetType} from '@codemirror/view';
import {StateField,EditorSelection} from '@codemirror/state';
import {previewBlocks} from './preview-blocks.mjs';
class RenderedBlock extends WidgetType{
 constructor(readonly raw:string,readonly from:number,readonly render:(raw:string)=>Promise<string>){super()}
 eq(other:RenderedBlock){return other.raw===this.raw&&other.from===this.from}
 toDOM(view:EditorView){const dom=document.createElement('div');dom.className='note live-rendered-block';dom.setAttribute('aria-label','بخش یادداشت؛ برای ویرایش انتخاب کنید');dom.tabIndex=0;
 const activate=()=>{view.dispatch({selection:EditorSelection.cursor(this.from),scrollIntoView:false});view.focus()};
 dom.addEventListener('mousedown',e=>{if((e.target as Element).closest('a,button,input'))return;e.preventDefault();activate()});dom.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();activate()}});
 dom.textContent=this.raw;this.render(this.raw).then(html=>{if(dom.isConnected)dom.innerHTML=html}).catch(()=>{dom.title='پیش‌نمایش در دسترس نیست؛ برای ویرایش انتخاب کنید'});return dom}
 ignoreEvent(){return true}
}
/** Inactive top-level Markdown blocks use the same server renderer as reading. */
export function blockPreview(render:(raw:string)=>Promise<string>){
 let activated=false,lastRaw:string|undefined,blocks:ReturnType<typeof previewBlocks>=[];
 const build=(state:any)=>{const raw=state.doc.toString();if(raw!==lastRaw){blocks=previewBlocks(raw);lastRaw=raw;}const selection=state.selection.main;const ranges:any[]=[];
 for(const {from,to} of blocks){
 if(activated&&(selection.empty?selection.from>=from&&selection.from<to:selection.from<to&&selection.to>from))continue;
 ranges.push(Decoration.replace({widget:new RenderedBlock(raw.slice(from,to),from,render),block:true}).range(from,to))}
 return Decoration.set(ranges,true)};
 return StateField.define({create:build,update:(value,tr)=>{if(tr.selection||tr.docChanged)activated=true;return tr.docChanged||tr.selection?build(tr.state):value},provide:field=>EditorView.decorations.from(field)});
}
