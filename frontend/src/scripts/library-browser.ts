import {api as request,ApiError,message} from './api';
import {personalNodes} from './library-utils.mjs';

const root=document.querySelector<HTMLElement>('[data-library-browser]');
if(root){
 const status=root.querySelector<HTMLElement>('[data-browser-status]')!,
  list=root.querySelector<HTMLElement>('[data-browser-list]')!,
  form=root.querySelector<HTMLFormElement>('form')!,
  more=root.querySelector<HTMLButtonElement>('[data-browser-more]')!,
  importBtn=root.querySelector<HTMLButtonElement>('[data-import-docs]');

 let currentIdentity:string|null|undefined,creating=false;
 let identityEpoch=0;
 let generation=0;
 let parent:string|null=null,view='items',offset=0;
 const path:{id:string;title:string}[]=[];
 type PublicNode={label:string;link?:string;items?:PublicNode[]};
 let publicPath:PublicNode[]=[];
 const publicTree=request<PublicNode[]>('/library-tree');
 void publicTree.catch(()=>{});

 const run=async(fn:()=>Promise<void>)=>{
  const epoch=identityEpoch;
  try{status.textContent='';await fn();}catch(error){if(epoch===identityEpoch)status.textContent=message(error);}
 };

 const api=async<T=any>(path:string,data?:unknown,method?:string):Promise<T>=>{
  const epoch=identityEpoch;
  const value=await request<T>(path,data,method);
  if(epoch!==identityEpoch)throw new Error('حساب تغییر کرد؛ درخواست قبلی کنار گذاشته شد.');
  return value;
 };

 const button=(text:string,fn:()=>Promise<void>,className?:string)=>{
  const b=document.createElement('button');
  b.type='button';
  b.textContent=text;
  if(className)b.className=className;
  b.addEventListener('click',()=>void run(fn));
  return b;
 };

 const openShareDialog=(item:any)=>{
  const dialog=document.createElement('dialog');
  dialog.setAttribute('data-share-dialog','');
  const heading=document.createElement('h2');
  heading.textContent='اشتراک‌گذاری پوشه: '+item.title;
  const desc=document.createElement('p');
  desc.textContent='با پیوند اختصاصی، هم‌کلاسی‌ها یا همکاران شما بدون نیاز به ثبت‌نام یا ورود می‌توانند تمام یادداشت‌های این پوشه را مطالعه کنند. این مستندات به هیچ وجه توسط هوش مصنوعی وبسایت خوانده یا نمایه‌سازی نمی‌شود.';
  const linkBox=document.createElement('div');
  const feedback=document.createElement('p');
  feedback.setAttribute('role','status');
  feedback.style.color='var(--primary-text)';

  const renderContent=()=>{
   linkBox.replaceChildren();
   if(item.visibility==='unlisted'&&item.share_token){
    const fullUrl=`${window.location.origin}/shared/${item.share_token}`;
    const input=document.createElement('input');
    input.type='text';
    input.readOnly=true;
    input.value=fullUrl;
    input.style.width='100%';
    input.style.padding='8px 10px';
    input.style.margin='8px 0';
    input.style.background='var(--surface-subtle)';
    input.style.border='1px solid var(--border)';
    input.style.borderRadius='6px';
    input.style.color='inherit';

    const copyBtn=button('📋 کپی پیوند',async()=>{
     await navigator.clipboard.writeText(fullUrl);
     feedback.textContent='پیوند در کلیپ‌بورد کپی شد!';
    });

    const revokeBtn=button('🚫 غیرفعال کردن اشتراک‌گذاری',async()=>{
     feedback.textContent='در حال لغو اشتراک...';
     const updated=await api('/library/items/'+item.id+'/publication',{visibility:'private'},'PUT');
     item.visibility=updated.visibility;
     item.share_token=updated.share_token;
     feedback.textContent='اشتراک‌گذاری لغو شد و پوشه خصوصی شد.';
     renderContent();
     await load();
    });

    linkBox.append(input,copyBtn,revokeBtn);
   }else{
    const enableBtn=button('🔗 ایجاد پیوند اشتراک‌گذاری اختصاصی (Unlisted)',async()=>{
     feedback.textContent='در حال تولید پیوند اشتراک‌گذاری...';
     const updated=await api('/library/items/'+item.id+'/publication',{visibility:'unlisted'},'PUT');
     item.visibility=updated.visibility;
     item.share_token=updated.share_token;
     feedback.textContent='پیوند با موفقیت ایجاد شد!';
     renderContent();
     await load();
    });
    linkBox.append(enableBtn);
   }
  };

  renderContent();
  const closeBtn=button('بستن',async()=>dialog.close());
  dialog.append(heading,desc,linkBox,feedback,closeBtn);
  root.append(dialog);
  dialog.addEventListener('close',()=>dialog.remove());
  dialog.showModal();
 };

 const openImportDialog=()=>{
  const dialog=document.createElement('dialog');
  dialog.setAttribute('data-share-dialog','');
  const heading=document.createElement('h2');
  heading.textContent='درون‌ریزی مستندات به کتابخانه';
  const desc=document.createElement('p');
  desc.textContent='می‌توانید مستندات خود را از یک مخزن گیت (گیت‌هاب، گیت‌لب، گیتیا، یا سرور شخصی) یا فایل زیپ وارد کنید. این یادداشت‌ها کاملاً شخصی و مستقل هستند.';

  const tabsContainer=document.createElement('div');
  tabsContainer.style.display='flex';
  tabsContainer.style.gap='8px';
  tabsContainer.style.marginBottom='16px';

  let currentTab:'git'|'zip'='git';
  const gitTabBtn=document.createElement('button');
  gitTabBtn.type='button';
  gitTabBtn.textContent='🌐 مخزن گیت (Git)';
  const zipTabBtn=document.createElement('button');
  zipTabBtn.type='button';
  zipTabBtn.textContent='📦 فایل فشرده (Zip)';

  tabsContainer.append(gitTabBtn,zipTabBtn);

  const panel=document.createElement('div');
  const feedback=document.createElement('p');
  feedback.setAttribute('role','status');

  const renderTab=()=>{
   gitTabBtn.style.fontWeight=currentTab==='git'?'bold':'normal';
   zipTabBtn.style.fontWeight=currentTab==='zip'?'bold':'normal';
   panel.replaceChildren();

   if(currentTab==='git'){
    const formGit=document.createElement('form');
    formGit.innerHTML=`
     <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:12px">
      <label>نشانی مخزن گیت (HTTP/HTTPS):
       <input name="repo_url" type="url" required placeholder="https://github.com/user/my-notes.git" style="width:100%;padding:8px;margin-top:4px;border-radius:6px;border:1px solid var(--border);background:var(--surface-subtle);color:var(--foreground)" />
      </label>
      <label>شاخه مخزن (پیش‌فرض: main):
       <input name="branch" type="text" value="main" placeholder="main" style="width:100%;padding:8px;margin-top:4px;border-radius:6px;border:1px solid var(--border);background:var(--surface-subtle);color:var(--foreground)" />
      </label>
      <label>نام پوشه در کتابخانه (اختیاری):
       <input name="title" type="text" placeholder="نام دلخواه یا خالی جهت استفاده از نام مخزن" style="width:100%;padding:8px;margin-top:4px;border-radius:6px;border:1px solid var(--border);background:var(--surface-subtle);color:var(--foreground)" />
      </label>
      <button type="submit" style="padding:10px;border-radius:6px;background:var(--primary);color:var(--primary-foreground);font-weight:bold;cursor:pointer;margin-top:6px">شروع کلون و ساخت یادداشت‌ها</button>
     </div>
    `;
    formGit.addEventListener('submit',async(e)=>{
     e.preventDefault();
     const fd=new FormData(formGit);
     const subBtn=formGit.querySelector<HTMLButtonElement>('button[type=submit]')!;
     subBtn.disabled=true;
     feedback.textContent='در حال کلون کردن مخزن و تحلیل یادداشت‌ها (ممکن است چند ثانیه زمان ببرد)...';
     try{
      const res=await api('/library/import/git',{
       repo_url:fd.get('repo_url'),
       branch:fd.get('branch')||'main',
       title:fd.get('title')||undefined,
       parent_id:parent
      },'POST');
      feedback.textContent=`مخزن با موفقیت وارد شد! تعداد کل یادداشت‌ها: ${res.stats?.total||0}`;
      setTimeout(()=>{dialog.close();void load();document.dispatchEvent(new Event('garden:library'));},1200);
     }catch(err){
      subBtn.disabled=false;
      feedback.textContent=message(err);
     }
    });
    panel.append(formGit);
   }else{
    const formZip=document.createElement('form');
    formZip.innerHTML=`
     <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:12px">
      <label>انتخاب فایل زیپ مستندات (.zip):
       <input name="zip_file" type="file" accept=".zip" required style="width:100%;padding:8px;margin-top:4px" />
      </label>
      <label>نام پوشه در کتابخانه (اختیاری):
       <input name="title" type="text" placeholder="نام دلخواه یا خالی جهت استفاده از نام فایل" style="width:100%;padding:8px;margin-top:4px;border-radius:6px;border:1px solid var(--border);background:var(--surface-subtle);color:var(--foreground)" />
      </label>
      <button type="submit" style="padding:10px;border-radius:6px;background:var(--primary);color:var(--primary-foreground);font-weight:bold;cursor:pointer;margin-top:6px">آپلود و استخراج زیپ</button>
     </div>
    `;
    formZip.addEventListener('submit',async(e)=>{
     e.preventDefault();
     const fileInput=formZip.querySelector<HTMLInputElement>('input[type=file]')!;
     const file=fileInput.files?.[0];
     if(!file)return;
     const fd=new FormData(formZip);
     const subBtn=formZip.querySelector<HTMLButtonElement>('button[type=submit]')!;
     subBtn.disabled=true;
     feedback.textContent='در حال خواندن و آپلود فایل زیپ...';

     const reader=new FileReader();
     reader.onload=async()=>{
      try{
       const base64Data=(reader.result as string).split(',')[1];
       feedback.textContent='در حال استخراج و ایجاد ساختار یادداشت‌ها...';
       const res=await api('/library/import/zip',{
        filename:file.name,
        content_base64:base64Data,
        title:fd.get('title')||undefined,
        parent_id:parent
       },'POST');
       feedback.textContent=`فایل زیپ با موفقیت استخراج شد! تعداد یادداشت‌ها: ${res.stats?.total||0}`;
       setTimeout(()=>{dialog.close();void load();document.dispatchEvent(new Event('garden:library'));},1200);
      }catch(err){
       subBtn.disabled=false;
       feedback.textContent=message(err);
      }
     };
     reader.readAsDataURL(file);
    });
    panel.append(formZip);
   }
  };

  gitTabBtn.addEventListener('click',()=>{currentTab='git';feedback.textContent='';renderTab();});
  zipTabBtn.addEventListener('click',()=>{currentTab='zip';feedback.textContent='';renderTab();});

  renderTab();
  const closeBtn=button('بستن',async()=>dialog.close());
  dialog.append(heading,desc,tabsContainer,panel,feedback,closeBtn);
  root.append(dialog);
  dialog.addEventListener('close',()=>dialog.remove());
  dialog.showModal();
 };

 if(importBtn){
  importBtn.addEventListener('click',()=>openImportDialog());
 }

 const load=async(append=false)=>{
  const version=++generation;
  if(!append){offset=0;list.replaceChildren();}
  form.hidden=view!=='items'||publicPath.length>0;
  if(importBtn)importBtn.hidden=view!=='items'||publicPath.length>0;

  const pathHost=root.querySelector<HTMLElement>('[data-browser-path]')!;
  pathHost.replaceChildren(button('ریشهٔ کتابخانه',async()=>{parent=null;path.length=0;publicPath=[];view='items';await load();}));
  for(const [i,p] of path.entries()){
   pathHost.append(button(p.title,async()=>{parent=p.id;path.splice(i+1);await load();}));
  }

  const url=view==='watching'||view==='favorites'?'/library/'+view:'/library/items?'+(view==='trash'?'trashed=true':parent?'parent_id='+parent:'');
  let rows:any[]=[];

  if(!append&&view==='items'&&!parent){
   try{
    const publicNodes=publicPath.length?publicPath[publicPath.length-1].items??[]:await publicTree;
    const nodes=await personalNodes(publicNodes,api);
    if(version!==generation)return;
    for(const [i,node] of publicPath.entries())pathHost.append(button(node.label,async()=>{publicPath.splice(i+1);await load();}));
    for(const node of nodes){
     const li=document.createElement('li');
     li.dataset.label=node.label;
     if(node.link){const a=document.createElement('a');a.textContent=node.label;a.href=node.link;li.append(a);}
     else li.append(button('پوشه: '+node.label,async()=>{publicPath.push(node);await load();}));
     list.append(li);
    }
   }catch(error){
    if(version!==generation)return;
    status.textContent=message(error);
   }
  }

  if(!publicPath.length){
   try{
    rows=await api<any[]>(url+(url.includes('?')?'&':'?')+'offset='+offset+'&limit=100');
   }catch(error){
    if(!(error instanceof ApiError&&error.status===401&&view==='items'&&!parent))throw error;
   }
  }

  if(version!==generation)return;
  for(const item of rows){
   const li=document.createElement('li');
   li.dataset.label=item.title;

   if(item.kind==='folder'){
    li.append(button('📁 '+item.title,async()=>{parent=item.id;path.push({id:item.id,title:item.title});view='items';await load();}));
   }else{
    const a=document.createElement('a');
    a.textContent='📄 '+item.title+(item.updated?' — به‌روزشده':'');
    a.href=item.href||(item.canonical_slug?'/notes/'+encodeURIComponent(item.canonical_slug):'/library/'+item.id);
    li.append(a);
   }

   if(view==='trash'){
    li.append(button('بازیابی',async()=>{await api('/library/items/'+item.id+'/restore',{});await load();document.dispatchEvent(new Event('garden:library'));}));
   }else if(item.kind==='folder'){
    if(item.has_git){
     const syncBtn=button('🔄 بروزرسانی از گیت',async()=>{
      syncBtn.disabled=true;
      syncBtn.textContent='⏳ در حال بروزرسانی...';
      status.textContent=`در حال دریافت تغییرات مخزن «${item.title}»...`;
      try{
       const res=await api(`/library/items/${item.id}/git-sync`,{},'POST');
       status.textContent=res.message||'بروزرسانی با موفقیت انجام شد.';
       await load();
       document.dispatchEvent(new Event('garden:library'));
      }catch(err){
       status.textContent=message(err);
      }finally{
       syncBtn.disabled=false;
       syncBtn.textContent='🔄 بروزرسانی از گیت';
      }
     });
     li.append(syncBtn);
    }

    li.append(
     button('🔗 اشتراک‌گذاری',async()=>openShareDialog(item)),
     button('تغییر نام',async()=>{
      const title=prompt('نام تازهٔ پوشه',item.title);
      if(title===null||title===item.title)return;
      await api('/library/items/'+item.id,{title},'PATCH');
      await load();
      document.dispatchEvent(new Event('garden:library'));
     }),
     button('انتقال',async()=>{
      const dialog=document.createElement('dialog'),heading=document.createElement('h2'),panel=document.createElement('section'),feedback=document.createElement('p');
      heading.textContent='انتقال پوشه';heading.id='folder-move-title';dialog.setAttribute('aria-labelledby',heading.id);feedback.setAttribute('role','status');
      const close=button('بستن',async()=>dialog.close());dialog.append(close,heading,panel,feedback);root.append(dialog);
      const curEpoch=identityEpoch;let requestCount=0;
      const browse=async(destination:string|null,start=0)=>{
       const current=++requestCount;
       const rows=await api<any[]>('/library/items?offset='+start+'&limit=50'+(destination?'&parent_id='+destination:''));
       if(current!==requestCount||curEpoch!==identityEpoch||!dialog.open)return;
       if(start===0){
        panel.replaceChildren(
         button('انتقال به این پوشه',async()=>{
          try{await api('/library/items/'+item.id,{parent_id:destination},'PATCH');dialog.close();await load();document.dispatchEvent(new Event('garden:library'));}
          catch(error){feedback.textContent=message(error);}
         }),
         button('ریشه',async()=>browse(null))
        );
       }
       for(const folder of rows)if(folder.kind==='folder'&&folder.id!==item.id)panel.append(button(folder.title,async()=>browse(folder.id)));
       if(rows.length===50)panel.append(button('بیشتر',async()=>browse(destination,start+50)));
      };
      dialog.addEventListener('close',()=>{requestCount++;dialog.remove();});
      dialog.showModal();
      await browse(null);
     }),
     button('زباله‌دان',async()=>{
      if(confirm('این پوشه و تمام محتوای آن به زباله‌دان منتقل شوند؟')){
       await api('/library/items/'+item.id+'/trash?subtree=true',{});
       await load();
       document.dispatchEvent(new Event('garden:library'));
      }
     })
    );
   }
   list.append(li);
  }

  for(const li of [...list.children].sort((a,b)=>(a as HTMLElement).dataset.label!.localeCompare((b as HTMLElement).dataset.label!,'fa')))list.append(li);
  offset+=rows.length;
  more.hidden=rows.length<100;
  form.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled=creating;
  if(!list.children.length)status.textContent='موردی وجود ندارد.';
 };

 root.querySelectorAll<HTMLElement>('[data-library-view]').forEach(b=>b.addEventListener('click',()=>void run(async()=>{
  view=b.dataset.libraryView!;parent=null;path.length=0;publicPath=[];await load();
 })));

 form.addEventListener('submit',event=>{
  event.preventDefault();
  if(creating)return;
  creating=true;
  form.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled=true;
  void run(async()=>{
   const epoch=identityEpoch;
   try{
    const data=new FormData(form),item=await api<any>('/library/items',{title:data.get('title'),kind:data.get('kind'),parent_id:parent});
    if(epoch!==identityEpoch)return;
    form.reset();
    if(item.kind==='note')location.href='/library/'+item.id+'?edit=1';
    else document.dispatchEvent(new Event('garden:library'));
   }finally{
    if(epoch===identityEpoch){
     creating=false;
     form.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled=false;
    }
   }
  });
 });

 more.addEventListener('click',()=>void run(()=>load(true)));
 document.addEventListener('garden:library',()=>void run(()=>load()));
 document.addEventListener('garden:identity',event=>{
  const next=(event as CustomEvent).detail?.id??null;
  if(currentIdentity===next)return;
  currentIdentity=next;
  creating=false;
  identityEpoch++;
  generation++;
  parent=null;
  path.length=0;
  publicPath=[];
  view='items';
  form.reset();
  list.replaceChildren();
  root.querySelector('[data-browser-path]')!.replaceChildren();
  root.querySelectorAll('dialog').forEach(dialog=>dialog.close());
  status.textContent='';
  void run(()=>load());
 });

 document.addEventListener('garden:account',()=>{
  generation++;
  list.replaceChildren();
  status.textContent='';
  void run(()=>load());
 });

 void run(async()=>{
  await load();
  form.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled=false;
 });
}
