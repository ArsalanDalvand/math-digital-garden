/** A bounded, editor-owned cache; never shared across identities or persisted.
 * @param {(raw:string, blocks:boolean)=>Promise<{html:string,blocks?:{raw:string,html:string}[]}>} request */
export function createPreviewRenderer(request) {
  /** @type {Map<string,string>} */
  const cache=new Map();
  /** @type {Map<string,Promise<string>>} */
  const pending=new Map();
  /** @type {Promise<string>|undefined} */
  let batch;let generation=0;
  /** @param {string} raw @param {string} html */
  const put=(raw,html)=>{cache.delete(raw);cache.set(raw,html);while(cache.size>64)cache.delete(cache.keys().next().value??'');};
  /** @param {string} raw */
  function fetchPreview(raw,blocks=false){
    const existing=pending.get(raw);if(existing)return existing;
    const epoch=generation;
    const promise=request(raw,blocks).then(result=>{
      if(epoch!==generation)throw new Error('Preview identity changed');
      for(const block of result.blocks??[])put(block.raw,block.html);
      put(raw,result.html);return result.html;
    }).finally(()=>{if(pending.get(raw)===promise)pending.delete(raw);});
    pending.set(raw,promise);return promise;
  }
  return {
    /** @param {string} raw */
    prepare(raw){const job=fetchPreview(raw,true);batch=job;job.finally(()=>{if(batch===job)batch=undefined;}).catch(()=>{});},
    /** @param {string} raw */
    async render(raw){
      const epoch=generation;
      const cached=cache.get(raw);if(cached!==undefined)return cached;
      if(batch)await batch;
      if(epoch!==generation)throw new Error('Preview identity changed');
      return cache.get(raw)??fetchPreview(raw);
    },
    clear(){generation++;cache.clear();pending.clear();batch=undefined;}
  };
}
