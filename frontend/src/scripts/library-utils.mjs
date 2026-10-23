/** @param {{id:string,visibility:string,share_token?:string}} item */
export const publicationHref = (item) => item.visibility === 'unlisted' ? '/shared/'+encodeURIComponent(item.share_token || '') : '/published/'+encodeURIComponent(item.id);
/** @param {any[]} comments */
export const threadComments = (comments) => comments.filter(c=>!c.parent_id).map(c=>({...c,replies:comments.filter(reply=>reply.parent_id===c.id)}));

/** Resolve just this visible folder; never cache private overlays in the public tree.
 * @param {{label:string,link?:string,items?:any[]}[]} nodes
 * @param {(path:string,data:unknown)=>Promise<any[]>} api
 */
export async function personalNodes(nodes,api){
 const slugs=nodes.flatMap(n=>n.link?[decodeURIComponent(n.link.slice('/notes/'.length))]:[]);
 const overlays=new Map();
 try{
  for(let offset=0;offset<slugs.length;offset+=100){
   for(const row of await api('/library/canonical/metadata',{slugs:slugs.slice(offset,offset+100)}))overlays.set(row.slug,row);
  }
 }catch(error){if(error instanceof Error&&'status' in error&&error.status===401)return nodes;throw error;}
 return nodes.flatMap(node=>{const row=node.link?overlays.get(decodeURIComponent(node.link.slice('/notes/'.length))):null;return row?.hidden?[]:[row?{...node,label:row.title}:node];});
}
