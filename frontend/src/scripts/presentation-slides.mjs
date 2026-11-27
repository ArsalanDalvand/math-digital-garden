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

const normalizeTitle = (/** @type {string} */ value) =>
  value.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Build presentation slides and skip the generated cover slide if content already begins
 * with a matching H1 heading.
 * @param {Node[]} nodes
 * @param {string} title
 * @param {string} [slogan]
 * @returns {Node[][]}
 */
export function buildPresentationSlides(nodes, title, slogan = '') {
  const bodySlides = sectionSlides(nodes);
  const firstNode = bodySlides[0]?.[0];
  if (
    firstNode &&
    firstNode.nodeType === 1 &&
    /** @type {Element} */ (firstNode).tagName === 'H1'
  ) {
    const firstNorm = normalizeTitle(firstNode.textContent || '');
    const titleNorm = normalizeTitle(title || '');
    if (
      firstNorm &&
      titleNorm &&
      (firstNorm === titleNorm || firstNorm.includes(titleNorm) || titleNorm.includes(firstNorm))
    ) {
      return bodySlides;
    }
  }

  const doc = nodes.find((n) => n.ownerDocument)?.ownerDocument || globalThis.document;
  const heading = doc.createElement('h1');
  heading.textContent = title;
  /** @type {Node[]} */
  const cover = [heading];
  if (slogan && slogan.trim()) {
    const lead = doc.createElement('p');
    lead.className = 'presentation-cover-slogan';
    lead.textContent = slogan.trim();
    cover.push(lead);
  }
  return [cover, ...bodySlides];
}
