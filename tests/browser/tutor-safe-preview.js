(async()=>{
  const root=document.querySelector('[data-tutor-slug]'),form=root.querySelector('form');
  const original=window.fetch;
  window.fetch=async(url,options)=>url==='/api/preview'?Response.json({html:'<p>متن آزمون <span class="katex">x</span></p><img src="http://127.0.0.1:8012/never-load-test-only"><iframe src="about:blank"></iframe>'}):original(url,options);
  try {
    form.elements.question.value='توضیح';form.requestSubmit();
    for(let i=0;i<200;i++){if(root.querySelector('[data-chat-status]').textContent.includes('پاسخ دریافت شد'))break;await new Promise(r=>setTimeout(r,20));}
    const answer=root.querySelector('[data-chat-answer]');
    if(answer.querySelector('img,iframe'))throw new Error('AI output must not load resource tags');
    if(!answer.querySelector('.katex'))throw new Error('Math markup must survive');
    return {passed:true,resourceTagsRemoved:true,mathPreserved:true,transport:'preview-only mock'};
  } finally {window.fetch=original;}
})()
