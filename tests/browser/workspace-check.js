(async()=>{
  const assert=(ok,message)=>{if(!ok)throw new Error(message);};
  const wait=async(check)=>{for(let i=0;i<200;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,50));}throw new Error('UI timed out');};
  const get=async path=>{const r=await fetch('/api'+path);assert(r.ok,path+' '+r.status);return r.json();};
  const note=await get('/workspace/notes/cantor');
  assert(note.fork,'fork exists');
  assert(note.fork.custom_content.startsWith(note.canonical.content),'editor preserves original raw Markdown prefix byte-for-byte');
  assert(note.fork.custom_content.includes('توضیح آزمون رفت‌وبرگشت'),'typed text was autosaved');
  assert(note.fork.custom_content.includes('$x^2+1$'),'MathLive inserts raw LaTeX');
  assert(document.querySelector('[data-live-preview] .katex'),'live preview renders equations');
  document.querySelector('[data-bookmark]').click();
  await wait(()=>document.querySelector('[data-save-status]').textContent.includes('نشانه‌گذاری شد'));
  const form=document.querySelector('[data-proposal-form]');form.elements.comment.value='آزمون چرخهٔ کامل';form.requestSubmit();
  await wait(()=>document.querySelector('[data-save-status]').textContent.includes('ارسال شد'));
  const proposal=(await get('/proposals'))[0];
  assert(proposal.proposed_content===note.fork.custom_content,'proposal snapshot matches saved raw content');
  assert(proposal.base_content===note.canonical.content,'proposal exact base is frozen');
  window.__proposal=proposal;
  const privateResponse=await fetch('/api/workspace');
  assert(privateResponse.headers.get('cache-control')==='no-store','private responses are not cached');
  assert((await privateResponse.json()).bookmarks.some(n=>n.slug==='cantor'),'bookmark saved');
  document.querySelector('[data-compare]').click();
  await wait(()=>document.querySelector('[data-diff] .cm-mergeView'));
  assert(document.querySelectorAll('[data-diff] .cm-editor').length===2,'CodeMirror MergeView displays both versions');
  return {passed:true,proposalId:proposal.id,rawPrefix:true,formula:true,autosave:true,bookmark:true,mergeView:true};
})()
