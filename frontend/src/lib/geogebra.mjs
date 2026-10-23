/** @param {{appName:string,width:number,height:number,caption:string,commands:string[]}|null} config @param {string} token */
export function geogebraFrame(config, token) {
  const safe = config ? JSON.stringify(config).replace(/</g, '\\u003c') : 'null';
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;padding:0;overflow:hidden}#status{font:14px system-ui;direction:rtl}#status:empty{display:none}</style><div id="plot"></div><p id="status">در حال بارگذاری…</p>
<script>
let c=${safe}, token=${JSON.stringify(token)}, parentOrigin='*',ready=false;
window.addEventListener('message',event=>{if(c || event.source!==parent || event.data?.type!=='garden:geogebra:init')return;c=event.data.config;token=event.data.token;parentOrigin=event.origin;if(typeof GGBApplet!=='undefined')boot();});
window.notify=(status)=>{document.getElementById('status').textContent=status==='ready'?'':'بارگذاری GeoGebra ناموفق بود؛ متن و کد اصلی در دسترس است.';parent.postMessage({type:'garden:geogebra',token,status},parentOrigin);};
window.boot=()=>{if(!c)return;try{const app=new GGBApplet({...c,width:window.innerWidth || c.width,preventFocus:true,disableAutoScale:true,playButton:false,perspective:c.perspective ?? (!c.materialId && !c.ggbBase64 && ['graphing','classic'].includes(c.appName) ? 'AG' : undefined),material_id:c.materialId,showAlgebraInput:c.showAlgebraInput ?? true,showToolBar:c.showToolBar ?? true,showMenuBar:c.showMenuBar ?? false,enableFileFeatures:false,disableJavaScript:true,useBrowserForJS:false,appletOnLoad(api){let width=window.innerWidth;window.addEventListener('resize',()=>{if(window.innerWidth===width)return;width=window.innerWidth;api.setSize(width,c.height);});for(const command of c.commands)api.evalCommand(command);ready=true;notify('ready');}});app.inject('plot');}catch{notify('failed');}};
setTimeout(()=>{if(!ready)notify('failed');},60000);
</script><script crossorigin="anonymous" async src="https://www.geogebra.org/apps/deployggb.js" onload="boot()" onerror="notify('failed')"></script>`;
}

/** @param {string} main @param {string} configured */
export function viewerOrigin(main,configured=''){
 const parent=new URL(main);
 const local=['127.0.0.1','localhost'].includes(parent.hostname);
 const viewer=new URL(configured || (local ? `${parent.protocol}//${parent.hostname==='localhost'?'127.0.0.1':'localhost'}:${parent.port || '4321'}` : (()=>{throw new Error('GeoGebra viewer origin is required');})()));
 if(viewer.hostname===parent.hostname || viewer.username || viewer.password || (!local && viewer.protocol!=='https:') || !['https:','http:'].includes(viewer.protocol))throw new Error('Viewer must have a separate hostname');
 return viewer.origin;
}
