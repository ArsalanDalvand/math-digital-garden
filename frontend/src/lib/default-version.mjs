/** @param {{custom_content:string}|null} fork @param {string} search @param {boolean} [interacted] */
export function preferredVersion(fork,search,interacted=false){
 if(interacted)return 'unchanged';
 const q=new URLSearchParams(search);
 if(q.get('version')==='canonical')return 'canonical';
 return fork||q.get('personal')==='1'?'personal':'canonical';
}
