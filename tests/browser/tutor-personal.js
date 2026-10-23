(async()=>{
  const assert=(ok,message)=>{if(!ok)throw new Error(message);};
  const current=await (await fetch('/api/workspace/notes/cantor')).json();
  const content=current.canonical.content+'\n\nمتن خصوصی برای آزمون دستیار.';
  const saved=await fetch('/api/notes/cantor/fork',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'MathGarden'},body:JSON.stringify({content,expected_hash:current.fork?.current_hash ?? current.canonical.current_hash})});
  assert(saved.ok,'test account fork saved');
  document.querySelector('[data-mode=personal]').click();
  let source;
  for(let i=0;i<200;i++){source=document.querySelector('article[data-ai-scope=personal]');if(source?.dataset.aiRaw?.includes('متن خصوصی'))break;await new Promise(r=>setTimeout(r,20));}
  assert(source?.dataset.aiScope==='personal','personal rendered context set');
  const walker=document.createTreeWalker(source,NodeFilter.SHOW_TEXT);let node;
  while((node=walker.nextNode()))if(node.textContent.includes('متن خصوصی'))break;
  assert(node,'private text rendered');
  const range=document.createRange();range.selectNodeContents(node);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);document.dispatchEvent(new Event('selectionchange'));
  const root=document.querySelector('[data-tutor-slug]'),form=root.querySelector('form');
  form.elements.question.value='توضیح متن';form.requestSubmit();
  for(let i=0;i<200;i++){if(root.querySelector('[data-chat-status]').textContent.includes('پاسخ دریافت شد'))break;await new Promise(r=>setTimeout(r,20));}
  assert(root.querySelector('[data-chat-context]').textContent.includes('نسخهٔ شخصی'),'authorized private version is labeled');
  assert(root.querySelector('[data-chat-answer]').textContent.includes('توضیح آزمون'),'personal answer received');
  const after=await (await fetch('/api/workspace/notes/cantor')).json();
  assert(after.canonical.content===current.canonical.content && after.fork.custom_content===content,'AI does not change either note');
  return {passed:true,personalContext:true,canonicalUnchanged:true,provider:'explicit mocked Dify transport'};
})()
