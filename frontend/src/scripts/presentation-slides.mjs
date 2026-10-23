// Section slides preserve complete rendered blocks; oversized sections scroll.
/** @param {Node[]} nodes */
export function sectionSlides(nodes) {
  /** @type {Node[][]} */
  const slides=[];
  /** @type {Node[]} */
  let current=[];
  const finish=()=>{if(current.length)slides.push(current);current=[];};
  for(const node of nodes){
    if(node.nodeType===3&&!node.textContent?.trim())continue;
    const tag=node.nodeType===1?/** @type {Element} */(node).tagName:'';
    if(tag==='HR'){finish();continue;}
    if(tag==='H1'||tag==='H2')finish();
    current.push(node);
  }
  finish();
  return slides;
}
