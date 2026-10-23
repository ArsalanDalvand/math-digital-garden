(async()=>{
  const assert=(ok,message)=>{if(!ok)throw new Error(message);};
  const wait=async(check)=>{for(let i=0;i<200;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,50));}throw new Error(document.querySelector('[data-review-status]').textContent);};
  await wait(()=>document.querySelector('[data-review-list] button'));
  const list=await (await fetch('/api/review')).json();
  const target=list.find(item=>item.status==='pending');assert(target,'pending proposal exists');
  document.querySelector('[data-review-list] button').click();
  await wait(()=>document.querySelectorAll('[data-review-diff] .cm-editor').length===2);
  assert(!document.querySelector('[data-review-panel]').hidden,'review panel opened');
  document.querySelector('[data-review-comment]').value='تایید آزمون رفت‌وبرگشت';
  document.querySelector('[data-decision=approve]').click();
  await wait(()=>document.querySelector('[data-review-status]').textContent.includes('approved'));
  const approved=await (await fetch('/api/review/'+target.id)).json();
  assert(approved.status==='approved','proposal approved');
  assert(approved.sync_status==='synced','approved content committed to dedicated Git repo');
  assert(approved.sync_commit.length===40,'commit hash recorded');
  const note=await (await fetch('/api/notes/'+target.slug)).json();
  assert(note.current_content===target.proposed_content,'canonical exactly equals frozen Markdown');
  document.querySelector('[data-index]').click();
  await wait(()=>document.querySelector('[data-review-status]').textContent.includes('ایندکس شد'));
  return {passed:true,proposalId:target.id,gitCommit:approved.sync_commit,canonicalMatchesFrozen:true,mergeView:true,index:true};
})()
