(async()=>{
  const assert=(ok,message)=>{if(!ok)throw new Error(message);};
  const wait=async(check)=>{for(let i=0;i<300;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,50));}throw new Error(document.querySelector('[data-chat-status]').textContent);};
  const tutor=document.querySelector('[data-tutor-slug]');
  const source=[...document.querySelectorAll('[data-ai-scope]')].find(e=>e.getClientRects().length);
  const before=await (await fetch('/api/workspace/notes/cantor')).json();
  const raw=source.dataset.aiRaw ?? before.canonical.content;
  const walker=document.createTreeWalker(source,NodeFilter.SHOW_TEXT);
  let node;while((node=walker.nextNode())){if(node.textContent.trim().length>5 && raw.includes(node.textContent.trim()))break;}
  assert(node,'selectable stored passage');
  const range=document.createRange();range.selectNodeContents(node);
  const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
  document.dispatchEvent(new Event('selectionchange'));
  const form=tutor.querySelector('[data-chat-form]');form.elements.question.value='برهان را توضیح بده';form.requestSubmit();
  await wait(()=>tutor.querySelector('[data-chat-status]').textContent.includes('پاسخ دریافت شد'));
  assert(tutor.querySelector('[data-chat-answer]').textContent.includes('توضیح آزمون'),'streamed answer shown');
  assert(tutor.querySelector('[data-chat-answer] .katex'),'LaTeX rendered');
  const after=await (await fetch('/api/workspace/notes/cantor')).json();
  assert(JSON.stringify(before)===JSON.stringify(after),'AI does not save note changes');
  assert(!tutor.querySelector('[data-apply-answer]'),'slice C controls are deferred');
  return {passed:true,provider:'explicit mocked Dify transport',sse:true,latex:true,notesUnchanged:true};
})()
