(async () => {
  const assert = (ok,message) => {if(!ok)throw new Error(message);};
  const graph=document.querySelector('graph-component');
  const note=document.querySelector('article.note');
  assert(note?.textContent.includes('نقشه راه جامع ریاضی عمومی'), 'real roadmap is displayed');
  const links=note.querySelectorAll('a[data-note-preview]');
  assert(links.length===99, 'roadmap exposes its 99 resolved links');
  assert(graph?.simulator?.nodes.length>=100, 'real local graph contains roadmap and linked notes');
  assert(Object.keys(JSON.parse(graph.dataset.sitemap)).length===137, 'global graph metadata includes all public notes');
  const link=links[0];
  link.scrollIntoView({block:'center'});
  link.dispatchEvent(new PointerEvent('pointerenter',{pointerType:'mouse'}));
  const popup=document.querySelector('#inline-note-preview');
  assert(popup.matches(':popover-open') && popup.querySelector('.katex'), 'real linked math note previews');
  assert(!popup.querySelector('[id]'), 'real preview has no duplicate IDs');
  const rect=popup.getBoundingClientRect();
  assert(rect.left>=0 && rect.right<=innerWidth && rect.bottom<=innerHeight, 'real preview fits screen');
  popup.querySelector('[data-close-preview]').click();
  return {sample:'math-freamwork',roadmapLinks:links.length,localNodes:graph.simulator.nodes.length,globalNotes:137,width:innerWidth};
})()
