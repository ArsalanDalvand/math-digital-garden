(async()=>{
  const assert=(ok,message)=>{if(!ok)throw new Error(message);};
  const root=document.querySelector('[data-tutor-slug]'), form=root.querySelector('form');
  document.querySelector('[data-mode=canonical]').click();
  await new Promise(r=>setTimeout(r,50));
  const source=document.querySelector('article[data-ai-scope=canonical]');
  const data=await (await fetch('/api/workspace/notes/cantor')).json();
  const walker=document.createTreeWalker(source,NodeFilter.SHOW_TEXT);
  let node;while((node=walker.nextNode())){if(node.textContent.trim().length>5 && data.canonical.content.includes(node.textContent.trim()))break;}
  const range=document.createRange();range.selectNodeContents(node);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);document.dispatchEvent(new Event('selectionchange'));
  const original=window.fetch;let signal,started=false;
  window.fetch=async(url,options)=>{
    if(url!='/api/ai/chat')return original(url,options);
    signal=options.signal;started=true;
    const stream=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('event: text\ndata: "partial"\n\n'));signal.addEventListener('abort',()=>controller.error(new DOMException('Aborted','AbortError')));}});
    return new Response(stream,{headers:{'Content-Type':'text/event-stream'}});
  };
  try {
    form.elements.question.value='توضیح';form.requestSubmit();
    for(let i=0;i<100 && !started;i++)await new Promise(r=>setTimeout(r,20));
    assert(started,'request started');
    document.dispatchEvent(new Event('garden:context-change'));
    await new Promise(r=>setTimeout(r,30));
    assert(signal.aborted,'changing scope aborts pending stream');
    assert(root.querySelector('[data-chat-answer]').textContent==='','old answer cleared');
    const hash=source.dataset.aiHash;source.dataset.aiHash='0'.repeat(64);
    document.dispatchEvent(new Event('selectionchange'));form.requestSubmit();
    await new Promise(r=>setTimeout(r,200));
    assert(root.querySelector('[data-chat-status]').textContent.includes('نسخه تغییر'),'stale displayed hash rejected');
    source.dataset.aiHash=hash;
    return {passed:true,abortOnContextChange:true,staleOutputCleared:true,staleVersionRejected:true,transport:'explicit browser mock for lifecycle only'};
  } finally {window.fetch=original;}
})()
