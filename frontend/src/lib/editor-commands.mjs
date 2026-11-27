/** @typedef {{changes:{from:number,to:number,insert:string},selection:{anchor:number,head:number}}} ToolbarEdit */
/**
 * Return one raw Markdown replacement; callers own editor state and syntax context.
 * @param {string} doc
 * @param {number} from
 * @param {number} to
 * @param {string} action
 * @param {{url?:string,inCode?:boolean}} [options]
 * @returns {ToolbarEdit|null}
 */
export function commandChanges(doc,from,to,action,options={}){
  if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<from||to>doc.length||options.inCode)return null;
  const selected=doc.slice(from,to);
  /** @type {(start:number,end:number,insert:string,anchor?:number,head?:number)=>ToolbarEdit} */
  const replace=(start,end,insert,anchor=start,head=start+insert.length)=>({changes:{from:start,to:end,insert},selection:{anchor,head}});
  /** @type {(left:string,right?:string,placeholder?:string)=>ToolbarEdit} */
  const wrap=(left,right=left,placeholder='متن')=>{
    if(selected.startsWith(left)&&selected.endsWith(right)&&selected.length>=left.length+right.length)return replace(from,to,selected.slice(left.length,-right.length));
    if(doc.slice(from-left.length,from)===left&&doc.slice(to,to+right.length)===right)return replace(from-left.length,to+right.length,selected);
    const text=selected||placeholder;
    return replace(from,to,left+text+right,from+left.length,from+left.length+text.length);
  };
  if(action==='bold')return wrap('**');
  if(action==='italic')return wrap('*');
  if(action==='strike')return wrap('~~');
  if(action==='math')return wrap('$','$','x');
  if(action==='inlinecode'){
    const runs=selected.match(/`+/g)||[];
    const fence='`'.repeat(Math.max(0,...runs.map(run=>run.length))+1);
    if(/^(`+)([^`]|[\s\S]*[^`])\1$/.test(selected)){
      const count=selected.match(/^`+/)?.[0].length||0;
      return replace(from,to,selected.slice(count,-count));
    }
    if(selected.startsWith('`')||selected.endsWith('`')||(/^ .* $/.test(selected)&&/\S/.test(selected)))return wrap(fence+' ',' '+fence,'code');
    return wrap(fence,fence,'code');
  }
  if(action==='link'){
    let url;
    try{url=new URL(options.url||'');}catch{return null;}
    if(!['https:','http:'].includes(url.protocol)||/[\r\n<>]/.test(options.url||''))return null;
    const address=url.href.replace(/\(/g,'%28').replace(/\)/g,'%29');
    const label=(selected||'پیوند').replace(/[\\[\]]/g,'\\$&');
    return replace(from,to,`[${label}](${address})`,from+1,from+1+label.length);
  }
  const eol=doc.includes('\r\n')?'\r\n':'\n';
  if(action==='codeblock'||action==='mathblock'){
    const text=selected||(action==='codeblock'?'code':'x');
    const fence=action==='mathblock'?'$$':'`'.repeat(Math.max(2,...(text.match(/`+/g)||[]).map(run=>run.length))+1);
    const before=from>0&&!/[\r\n]/.test(doc[from-1])?eol:'';
    const after=to<doc.length&&!/[\r\n]/.test(doc[to])?eol:'';
    return replace(from,to,before+fence+eol+text+eol+fence+after,from+before.length+fence.length+eol.length,from+before.length+fence.length+eol.length+text.length);
  }
  if(action==='table'){
    const before=from>0&&!/[\r\n]/.test(doc[from-1])?eol:'';
    const after=to<doc.length&&!/[\r\n]/.test(doc[to])?eol:'';
    return replace(from,to,before+['| ستون ۱ | ستون ۲ |','| --- | --- |','|  |  |'].join(eol)+after);
  }
  if(!['paragraph','h1','h2','h3','quote','callout','bullet','numbered','checklist'].includes(action))return null;
  const start=from===0?0:Math.max(doc.lastIndexOf('\n',from-1),doc.lastIndexOf('\r',from-1))+1;
  const selectedEnd=to>from&&/[\r\n]/.test(doc[to-1])?to-1:to;
  let end=selectedEnd;
  while(end<doc.length&&!/[\r\n]/.test(doc[end]))end++;
  if(end>start&&doc[end-1]==='\r')end--;
  if(action==='callout'){
    const body=doc.slice(start,end)||'نکته';
    const quoted=body.split(/(\r\n|\r|\n)/).map((part,index)=>index%2?part:'> '+part.replace(/^>[ \t]?/,'')).join('');
    const insert=`> [!note]${eol}${quoted}`;
    const bodyStart=start+`> [!note]${eol}> `.length;
    return replace(start,end,insert,bodyStart,start+insert.length);
  }
  let number=0;
  const insert=doc.slice(start,end).split(/(\r\n|\r|\n)/).map((line,index)=>{
    if(index%2)return line;
    const indent=line.match(/^[ \t]*/)?.[0]||'';
    let text=line.slice(indent.length);
    if(action==='paragraph')return indent+text.replace(/^(?:#{1,6} |>[ \t]?|[-+*] (?:\[[ xX]\] )?|\d+[.)] )/,'');
    if(/^h[123]$/.test(action))return indent+'#'.repeat(Number(action[1]))+' '+text.replace(/^#{1,6} /,'');
    if(action==='quote')return indent+'> '+text.replace(/^>[ \t]?/,'');
    text=text.replace(/^(?:[-+*] (?:\[[ xX]\] )?|\d+[.)] )/,'');
    const prefix=action==='bullet'?'- ':action==='checklist'?'- [ ] ':`${++number}. `;
    return indent+prefix+text;
  }).join('');
  return replace(start,end,insert);
}
