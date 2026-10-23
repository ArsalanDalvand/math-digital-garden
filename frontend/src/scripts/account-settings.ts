import {api,ApiError} from './api';
import {applyPreferences,type Account} from './account-preferences';
const container=document.querySelector<HTMLElement>('.account-settings');
if(container){
  const loading=container.querySelector<HTMLElement>('[data-settings-loading]')!;
  const content=container.querySelector<HTMLElement>('[data-settings-content]')!;
  const errorMessage=(error:unknown)=>error instanceof ApiError?(error.status===401?'نشست پایان یافته است؛ دوباره وارد شوید.':error.status===403?'رمز عبور فعلی درست نیست یا درخواست پذیرفته نشد.':error.status===409?'این ایمیل در دسترس نیست.':error.status===413?'تصویر باید حداکثر ۵۱۲ کیلوبایت باشد.':error.status===415||error.status===422?'اطلاعات پذیرفته نشد؛ قالب تصویر و فیلدهای فرم را بررسی کنید.':'ذخیره انجام نشد؛ دوباره تلاش کنید.'):'ارتباط برقرار نشد؛ دوباره تلاش کنید.';
  const show=(status:HTMLElement,text:string,error=false)=>{status.textContent=text;status.dataset.error=String(error);status.setAttribute('role',error?'alert':'status');};
  let owner:string|undefined,sessionOwner:string|null|undefined;
  let identityChanged=false;
  function invalidateIdentity(){
    if(identityChanged)return;
    identityChanged=true;content.hidden=true;loading.hidden=false;
    container!.querySelectorAll<HTMLInputElement>('input').forEach(field=>{field.value='';field.disabled=true;});
    show(loading,'حساب تغییر کرده است؛ برای ادامه صفحه را دوباره باز کنید.',true);
    const reload=document.createElement('a');reload.href=location.pathname;reload.textContent='بارگذاری دوباره';loading.append(' ',reload);
  }
  document.addEventListener('garden:identity',event=>{
    sessionOwner=(event as CustomEvent<{id:string}|null>).detail?.id||null;
    if(owner&&sessionOwner!==owner)invalidateIdentity();
  });
  function identity(user:Account){
    if(identityChanged)return false;
    if((owner&&owner!==user.id)||(sessionOwner!==undefined&&sessionOwner!==user.id)){invalidateIdentity();return false;}
    owner=user.id;
    const name=container!.querySelector<HTMLInputElement>('[name="full_name"]');if(name)name.value=user.full_name||'';
    const email=container!.querySelector<HTMLInputElement>('[name="email"]');if(email)email.value=user.email;
    const image=container!.querySelector<HTMLImageElement>('[data-avatar-preview]');if(image){image.hidden=!user.avatar_url;if(user.avatar_url)image.src=user.avatar_url+'?v='+Date.now();}
    const fallback=container!.querySelector<HTMLElement>('[data-avatar-fallback]');if(fallback){fallback.hidden=!!user.avatar_url;fallback.textContent=Array.from(user.full_name||user.email)[0];}
    const remove=container!.querySelector<HTMLButtonElement>('[data-avatar-remove]');if(remove)remove.hidden=!user.avatar_url;
    const prefs=container!.querySelector<HTMLFormElement>('[data-settings-form="preferences"]');
    if(prefs)for(const [key,value] of Object.entries(user.preferences)){
      const field=prefs.elements.namedItem(key) as HTMLInputElement|HTMLSelectElement|null;
      if(field instanceof HTMLInputElement&&field.type==='checkbox')field.checked=Boolean(value);else if(field)field.value=String(value);
    }
    const size=container!.querySelector<HTMLOutputElement>('[data-size-output]');if(size)size.value=user.preferences.size+' پیکسل';
    return true;
  }
  api<Account>('/account').then(user=>{if(!identity(user))return;applyPreferences(user.preferences);loading.hidden=true;content.hidden=false;}).catch(error=>{loading.hidden=error instanceof ApiError&&error.status===401;show(loading,errorMessage(error),true);if(error instanceof ApiError&&error.status===401)container!.querySelector<HTMLElement>('[data-settings-login]')!.hidden=false;});
  container.querySelectorAll<HTMLFormElement>('[data-settings-form]').forEach(form=>{
    const status=form.querySelector<HTMLElement>('[data-form-status]')!;
    const confirmation=form.querySelector<HTMLInputElement>('[name="confirmation"]');
    const password=form.querySelector<HTMLInputElement>('[name="password"]');
    const validate=()=>confirmation?.setCustomValidity(confirmation.value!==password?.value?'تکرار رمز عبور با رمز جدید یکسان نیست.':'');
    confirmation?.addEventListener('input',validate);password?.addEventListener('input',validate);
    form.querySelector<HTMLInputElement>('[name="size"]')?.addEventListener('input',event=>{form.querySelector<HTMLOutputElement>('[data-size-output]')!.value=(event.target as HTMLInputElement).value+' پیکسل';});
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(identityChanged||form.getAttribute('aria-busy')==='true')return;
      validate();if(!form.reportValidity())return;
      const kind=form.dataset.settingsForm!;const data=new FormData(form);
      const payload=kind==='preferences'?{expected_user_id:owner,theme:data.get('theme'),size:Number(data.get('size')),leading:Number(data.get('leading')),width:Number(data.get('width')),focus:data.has('focus'),default_mode:data.get('default_mode'),fixed_toolbar:data.has('fixed_toolbar')}:Object.fromEntries(Array.from(data.entries()).filter(([key])=>key!=='confirmation'));
      const button=form.querySelector<HTMLButtonElement>('button[type="submit"]')!;button.disabled=true;form.setAttribute('aria-busy','true');show(status,'در حال ذخیره…');
      try{const result=await api<Account>('/account/'+kind,payload,'PATCH');if(identityChanged)return;form.querySelectorAll<HTMLInputElement>('input[type="password"]').forEach(field=>field.value='');if(kind!=='password'){identity(result);if(kind==='preferences')applyPreferences(result.preferences);document.dispatchEvent(new Event('garden:account'));}show(status,'ذخیره شد.');}
      catch(error){show(status,errorMessage(error),true);}finally{button.disabled=false;form.setAttribute('aria-busy','false');}
    });
  });
  const file=container.querySelector<HTMLInputElement>('[data-avatar-file]');const remove=container.querySelector<HTMLButtonElement>('[data-avatar-remove]');const status=container.querySelector<HTMLElement>('[data-avatar-status]');
  async function avatar(action:'PUT'|'DELETE'){
    if(identityChanged||!file||!remove||!status||file.disabled)return;
    const selected=file.files?.[0];
    if(action==='PUT'&&(!selected||selected.size>524288||!['image/png','image/jpeg','image/webp'].includes(selected.type))){show(status,'تصویر PNG، JPEG یا WebP تا ۵۱۲ کیلوبایت انتخاب کنید.',true);file.value='';return;}
    file.disabled=true;remove.disabled=true;show(status,'در حال ذخیره تصویر…');
    try{const response=await fetch('/api/account/avatar',{method:action,credentials:'same-origin',headers:{'X-Requested-With':'MathGarden',...(action==='PUT'?{'Content-Type':selected!.type}:{})},body:action==='PUT'?selected:undefined});if(!response.ok)throw new ApiError(response.status,'Avatar update failed');if(!identity(await response.json()))return;document.dispatchEvent(new Event('garden:account'));show(status,action==='PUT'?'تصویر ذخیره شد.':'تصویر حذف شد.');}
    catch(error){show(status,errorMessage(error),true);}finally{file.disabled=false;remove.disabled=false;file.value='';}
  }
  file?.addEventListener('change',()=>void avatar('PUT'));remove?.addEventListener('click',()=>void avatar('DELETE'));
}
