import {api,ApiError,message} from './api';
import {personalNodes} from './library-utils.mjs';

type PublicNode={label:string;link?:string;items?:PublicNode[]};
type Item={id:string;title:string;kind:'note'|'folder';canonical_slug?:string};
const root=document.querySelector<HTMLElement>('[data-library-navigation]');
if(root){
  const tree=root.querySelector<HTMLElement>('[data-library-tree]')!;
  const status=root.querySelector<HTMLElement>('[data-library-status]')!;
  const dialog=root.querySelector<HTMLDialogElement>('[data-library-create]')!;
  const form=dialog.querySelector<HTMLFormElement>('form')!;
  const title=form.elements.namedItem('title') as HTMLInputElement;
  const kind=form.elements.namedItem('kind') as HTMLSelectElement;
  const feedback=dialog.querySelector<HTMLElement>('[data-create-status]')!;
  const submit=form.querySelector<HTMLButtonElement>('[type=submit]')!;
  let generation=0,identity:string|null|undefined,parent:string|null=null,busy=false,createVersion=0;
  let trigger:HTMLElement|null=null;
  const expanded=new Set<string>();
  const icon=(type:string)=>root.querySelector<HTMLTemplateElement>('[data-tree-icon="'+type+'"]')!.content.cloneNode(true);
  const insert=(host:HTMLElement,node:HTMLElement,label:string)=>{
    node.dataset.label=label;
    const next=[...host.children].find(child=>child.hasAttribute('data-more')||label.localeCompare((child as HTMLElement).dataset.label||'','fa')<0);
    host.insertBefore(node,next??null);
  };
  const openCreate=(from:HTMLElement,id:string|null=null,name='کتابخانه')=>{
    trigger=from;parent=id;form.reset();feedback.textContent='';submit.disabled=false;
    dialog.querySelector<HTMLElement>('[data-create-location]')!.textContent='در '+name;
    dialog.showModal();title.focus();
  };
  root.querySelector<HTMLButtonElement>('[data-library-add]')!.addEventListener('click',event=>openCreate(event.currentTarget as HTMLElement));
  dialog.querySelector('[data-create-cancel]')!.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{createVersion++;busy=false;parent=null;form.reset();feedback.textContent='';trigger?.focus();});
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;
    if(!title.value.trim()){title.setCustomValidity('نام را وارد کنید.');title.reportValidity();return;}
    busy=true;submit.disabled=true;feedback.textContent='در حال ساخت…';
    const version=++createVersion,epoch=generation;
    try{
      const item=await api<Item>('/library/items',{title:title.value.trim(),kind:kind.value,parent_id:parent});
      if(version!==createVersion||epoch!==generation||!dialog.open)return;
      if(parent)expanded.add(parent);
      dialog.close();document.dispatchEvent(new Event('garden:library'));
      if(item.kind==='note')location.assign('/library/'+encodeURIComponent(item.id)+'?edit=1');
      else root.querySelector<HTMLButtonElement>('[data-library-add]')!.focus();
    }catch(error){if(version===createVersion&&epoch===generation)feedback.textContent=message(error);}
    finally{if(version===createVersion){busy=false;submit.disabled=false;}}
  });
  title.addEventListener('input',()=>title.setCustomValidity(''));
  const link=(label:string,href:string)=>{
    const a=document.createElement('a'),text=document.createElement('span');text.textContent=label;
    a.href=href;a.append(icon('note'),text);if(location.pathname===href)a.setAttribute('aria-current','page');return a;
  };
  const folder=(label:string)=>{
    const details=document.createElement('details'),summary=document.createElement('summary'),text=document.createElement('span'),children=document.createElement('div');
    text.textContent=label;summary.append(icon('folder'),text);children.className='folder-tree';details.append(summary,children);return {details,summary,children};
  };
  const publicNodes=async(host:HTMLElement,nodes:PublicNode[],version:number)=>{
    const visible=await personalNodes(nodes,async(path,data)=>{const rows=await api<any[]>(path,data);if(version!==generation)throw new Error('حساب تغییر کرد.');return rows;});
    if(version!==generation||!host.isConnected)return;
    for(const node of visible){
      if(node.link){insert(host,link(node.label,node.link),node.label);continue;}
      const {details,children}=folder(node.label);let loaded=false;
      const active=(items:PublicNode[]):boolean=>items.some(n=>n.link===location.pathname||active(n.items??[]));
      details.addEventListener('toggle',()=>{if(details.open&&!loaded){loaded=true;void publicNodes(children,node.items??[],version).catch(error=>{loaded=false;if(version===generation)status.textContent=message(error);});}});
      details.open=active(node.items??[]);insert(host,details,node.label);
    }
  };
  const populate=async(host:HTMLElement,id:string|null,version:number,offset=0)=>{
    const rows=await api<Item[]>('/library/items?offset='+offset+'&limit=50'+(id?'&parent_id='+encodeURIComponent(id):''));
    if(version!==generation||!host.isConnected)return;
    for(const item of rows){
      let element:HTMLElement;
      if(item.kind==='note')element=link(item.title,item.canonical_slug?'/notes/'+encodeURIComponent(item.canonical_slug):'/library/'+encodeURIComponent(item.id));
      else{
        const {details,summary,children}=folder(item.title);element=details;let loaded=false;
        const add=document.createElement('button');add.type='button';add.textContent='+';add.className='library-child-add';add.setAttribute('aria-label','ساختن در '+item.title);
        add.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();openCreate(add,item.id,item.title);});summary.append(add);
        details.addEventListener('toggle',()=>{
          if(details.open)expanded.add(item.id);else expanded.delete(item.id);
          if(details.open&&!loaded){loaded=true;void populate(children,item.id,version).catch(error=>{loaded=false;if(version===generation)status.textContent=message(error);});}
        });
        details.open=expanded.has(item.id);
      }
      element.dataset.ownedLibraryNode='';insert(host,element,item.title);
    }
    if(rows.length===50){
      const more=document.createElement('button');more.type='button';more.textContent='نمایش بیشتر';more.dataset.more='';more.dataset.ownedLibraryNode='';
      more.addEventListener('click',async()=>{more.disabled=true;try{await populate(host,id,version,offset+50);more.remove();}catch(error){more.disabled=false;if(version===generation)status.textContent=message(error);}});host.append(more);
    }
  };
  const publicTree=api<PublicNode[]>('/library-tree');void publicTree.catch(()=>{});
  const load=()=>{
    const version=++generation;tree.replaceChildren();
    void publicTree.then(nodes=>publicNodes(tree,nodes,version)).catch(error=>{if(version===generation)status.textContent=message(error);});
    void populate(tree,null,version).catch(error=>{if(version===generation&&!(error instanceof ApiError&&error.status===401))status.textContent=message(error);});
  };
  load();
  document.addEventListener('garden:library',load);
  document.addEventListener('garden:account',()=>{expanded.clear();dialog.close();load();});
  document.addEventListener('garden:identity',event=>{
    const next=(event as CustomEvent).detail?.id??null;if(next===identity)return;
    identity=next;expanded.clear();dialog.close();status.textContent='';load();
  });
}
