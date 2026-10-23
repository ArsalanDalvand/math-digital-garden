export class ApiError extends Error {
  constructor(public status:number, message:string) { super(message); }
}
export async function api<T = any>(path:string, data?:unknown, method?:string): Promise<T> {
  const response = await fetch('/api'+path, {
    method:method ?? (data === undefined ? 'GET' : 'POST'), credentials:'same-origin',
    headers:{'Content-Type':'application/json','X-Requested-With':'MathGarden'},
    body:data === undefined ? undefined : JSON.stringify(data), cache:'no-store',
  });
  if (!response.ok) {
    let detail='خطا در ارتباط با سرویس';
    try { const payload=await response.json(); if(typeof payload.detail==='string') detail=payload.detail; } catch {}
    throw new ApiError(response.status,detail);
  }
  return response.status === 204 ? undefined as T : response.json();
}
export const message = (error:unknown) => error instanceof ApiError && error.status===401
  ? 'برای این کار وارد حساب شوید.' : error instanceof ApiError && error.status===409
  ? 'نسخه تغییر کرده است؛ متن خود را دریافت کنید و پس از بارگذاری دوباره مقایسه کنید.'
  : error instanceof Error ? error.message : 'خطای موقت';
