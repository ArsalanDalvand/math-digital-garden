/** @param {string} raw @param {string} selection */
export function selectionMatches(raw, selection) {
  const start=raw.indexOf(selection);
  return !!selection && start>=0 && raw.indexOf(selection,start+1)<0;
}

/** @param {ReadableStream<Uint8Array>} stream @param {(event:string,data:any)=>void} receive */
export async function consumeTutorStream(stream, receive) {
  const reader=stream.getReader(), decoder=new TextDecoder();
  let buffer='';
  try {
    while(true) {
      const {done,value}=await reader.read();
      buffer+=decoder.decode(value,{stream:!done});
      let match;
      while((match=/\r?\n\r?\n/.exec(buffer))) {
        const frame=buffer.slice(0,match.index);buffer=buffer.slice(match.index+match[0].length);
        const event=frame.match(/^event:\s*(.+)$/m)?.[1];
        const data=frame.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
        if(!event || !data)continue;
        const parsed=JSON.parse(data);
        if(event==='error')throw new Error(parsed.message || 'Stream interrupted');
        receive(event,parsed);
        if(event==='done')return;
      }
      if(buffer.length>100_000)throw new Error('Stream frame too large');
      if(done)break;
    }
    throw new Error('Stream incomplete');
  } finally {await reader.cancel();reader.releaseLock();}
}
