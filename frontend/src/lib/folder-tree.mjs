/** @param {{title:string,slug:string,relative_path?:string,book_slug?:string,chapter_slug?:string}[]} notes */
export function folderTree(notes){
 /** @type {any[]} */const root=[];
 for(const note of notes){const parts=(note.relative_path?.split('/').slice(0,-1)??[note.book_slug??'ریاضی',note.chapter_slug??'یادداشت‌ها']).filter(Boolean);let items=root;for(const label of parts){let folder=items.find(x=>x.label===label&&x.items);if(!folder){folder={label,items:[]};items.push(folder)}items=folder.items;}items.push({label:note.title,link:'/notes/'+encodeURIComponent(note.slug)});}
 
 const sortBranch = (/** @type {any[]} */ items) => {
   items.sort((a, b) => {
     const isFolderA = !!a.items;
     const isFolderB = !!b.items;
     if (isFolderA !== isFolderB) return isFolderA ? -1 : 1;
     return a.label.localeCompare(b.label, 'fa', { numeric: true, sensitivity: 'base' });
   });
   for (const item of items) {
     if (item.items) sortBranch(item.items);
   }
 };
 sortBranch(root);
 return root;
}
