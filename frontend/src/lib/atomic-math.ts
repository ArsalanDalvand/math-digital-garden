import {StateField} from '@codemirror/state';
import {Decoration,Direction,EditorView,WidgetType} from '@codemirror/view';
import {syntaxTree} from '@codemirror/language';
import {readOnlyFacet} from '@atomic-editor/editor';
import katex from 'katex';
class MathWidget extends WidgetType{
 constructor(readonly value:string,readonly display:boolean){super()}
 eq(other:MathWidget){return other.value===this.value&&other.display===this.display}
 toDOM(){const el=document.createElement(this.display?'div':'bdi');el.className=this.display?'atomic-display-math':'atomic-inline-math';el.dir='ltr';el.innerHTML=katex.renderToString(this.value,{displayMode:this.display,output:'html',throwOnError:false,trust:false});return el}
 ignoreEvent(){return false}
}
export const atomicMath=StateField.define<{decorations:any,isolates:any}>({
 create:build,update:(value,tr)=>tr.docChanged||tr.selection||tr.reconfigured?build(tr.state):value,
 provide:field=>[EditorView.decorations.from(field,v=>v.decorations),EditorView.bidiIsolatedRanges.from(field,v=>v.isolates)]
});
function build(state:any){const raw=state.doc.toString(),ranges:any[]=[],isolates:any[]=[];const readOnly=state.facet(readOnlyFacet);const selection=state.selection.main;const re=/(?<![\\$])\$\$([\s\S]+?)\$\$|(?<![\\$])\$([^$\n]+?)\$(?!\$)/g;let match;
 while((match=re.exec(raw))){const from=match.index,to=from+match[0].length;let code=false;let node:import('@lezer/common').SyntaxNode|null=syntaxTree(state).resolveInner(from,1);for(;node;node=node.parent){if(/Code|Fenced/.test(node.name)){code=true;break}}if(code)continue;
 const display=match[1]!==undefined;const first=state.doc.lineAt(from),last=state.doc.lineAt(to);
 isolates.push(Decoration.mark({bidiIsolate:Direction.LTR}).range(from,to));
 const active=!readOnly&&selection.from<=last.to&&selection.to>=first.from;if(active)continue;
 ranges.push(Decoration.replace({widget:new MathWidget(match[1]??match[2],display),block:display&&from===first.from&&to===last.to}).range(from,to));
 }return {decorations:Decoration.set(ranges,true),isolates:Decoration.set(isolates,true)}
}
