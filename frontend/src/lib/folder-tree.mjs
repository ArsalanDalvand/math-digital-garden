/** @type {Record<string, string>} */
const BOOK_TITLES = {
  'axler-linear-algebra-done-right': 'جبر خطی آکسلر',
  'axler': 'جبر خطی آکسلر',
  'abstract-algebra-and-matrices': 'جبر مجرد و ماتریس‌ها',
  'abstract-algebra': 'جبر مجرد و ماتریس‌ها',
};

/** @param {{title:string,slug:string,relative_path?:string,book_slug?:string,chapter_slug?:string}[]} notes */
export function folderTree(notes){
 /** @type {any[]} */const root=[];
 for(const note of notes){
   let parts=(note.relative_path?.split('/').slice(0,-1)??[note.book_slug??'ریاضی',note.chapter_slug??'یادداشت‌ها']).filter(Boolean);
   if(parts.length > 0 && BOOK_TITLES[parts[0]]){
     parts[0] = BOOK_TITLES[parts[0]];
   }
   let items=root;
   for(const label of parts){
     let folder=items.find(x=>x.label===label&&x.items);
     if(!folder){folder={label,items:[]};items.push(folder)}
     items=folder.items;
   }
   items.push({label:note.title,link:'/notes/'+encodeURIComponent(note.slug)});
 }
 
 const sortBranch = (/** @type {any[]} */ items) => {
   items.sort((a, b) => {
     const isFolderA = !!a.items;
     const isFolderB = !!b.items;
     if (isFolderA !== isFolderB) return isFolderA ? -1 : 1;
     return a.label.localeCompare(b.label, 'fa', { numeric: true, sensitivity: 'base' });
   });
   let totalCount = 0;
   for (const item of items) {
     if (item.items) {
       item.count = sortBranch(item.items);
       totalCount += item.count;
     } else {
       totalCount += 1;
     }
   }
   return totalCount;
 };
 sortBranch(root);
 return root;
}
