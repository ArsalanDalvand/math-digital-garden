import {resolveVaultImage} from './obsidian-plugins.mjs';
import {Worker} from 'node:worker_threads';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);

/** Decode in an isolated, bounded worker: a compressed scene is untrusted input.
 * @param {string} encoded @returns {Promise<string>} */
function decompress(encoded){
 if(encoded.length>200_000 || !/^[A-Za-z0-9+/=\s]+$/.test(encoded))throw new Error('Invalid compressed scene');
 return new Promise((resolve,reject)=>{
  const worker=new Worker(`const {parentPort,workerData}=require('node:worker_threads');const LZ=require(workerData.module);const raw=LZ.decompressFromBase64(workerData.raw.replace(/\\s/g,''));if(!raw || raw.length>5_000_000)throw new Error('Scene too large');parentPort.postMessage(raw);`,{eval:true,execArgv:[],workerData:{module:require.resolve('lz-string'),raw:encoded},resourceLimits:{maxOldGenerationSizeMb:32,maxYoungGenerationSizeMb:8}});
  const timer=setTimeout(()=>{worker.terminate();reject(new Error('Scene decode timed out'));},1500);
  worker.once('message',raw=>{clearTimeout(timer);worker.terminate();resolve(raw);});
  worker.once('error',error=>{clearTimeout(timer);reject(error);});
  worker.once('exit',code=>{clearTimeout(timer);if(code)reject(new Error('Scene decode failed'));});
 });
}

/** @param {string} raw @param {string[]} assets */
export async function parseExcalidraw(raw,assets=[]){
 const block=raw.match(/(?:^|\n)```(compressed-json|json)\s*\r?\n([\s\S]*?)\r?\n```/);
 if(!block && !raw.trimStart().startsWith('{'))return;
 const data=block ? (block[1]==='compressed-json' ? await decompress(block[2]) : block[2]) : raw;
 if(data.length>5_000_000)throw new Error('Scene too large');
 const scene=JSON.parse(data);
 if(scene.type!=='excalidraw' || !Array.isArray(scene.elements) || scene.elements.length>5000)throw new Error('Invalid scene');
 const allowed=new Set(['rectangle','diamond','ellipse','line','arrow','freedraw','text','image','frame']);
 const elements=scene.elements.filter(/** @param {any} element */ element=>element && allowed.has(element.type) && !element.isDeleted).map(/** @param {any} element */ element=>({...element,link:null}));
 for(const e of elements){
  if(![e.x,e.y,e.width,e.height].every(n=>typeof n==='number' && Number.isFinite(n) && Math.abs(n)<100_000))throw new Error('Invalid scene dimensions');
 }
 /** @type {Record<string, any>} */
 const files={};
 for(const [id,file] of Object.entries(scene.files ?? {})){
  if(file && typeof file==='object' && typeof file.dataURL==='string' && /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(file.dataURL) && file.dataURL.length<=2_000_000)files[id]=file;
 }
 for(const match of raw.matchAll(/^([\w]+):\s*!?\[\[([^\]\n]+)\]\]/gm)){
  const asset=resolveVaultImage(match[2].split('|')[0],assets);
  if(asset && /\.(png|jpe?g|gif|webp)$/i.test(asset))files[match[1]]={id:match[1],dataURL:'/'+asset.split('/').map(encodeURIComponent).join('/'),created:0,mimeType:'image/'+(asset.split('.').at(-1)==='jpg'?'jpeg':asset.split('.').at(-1))};
 }
 return {elements,files,appState:{exportBackground:true,viewBackgroundColor:/^#[0-9a-f]{3,8}$/i.test(scene.appState?.viewBackgroundColor) ? scene.appState.viewBackgroundColor : '#ffffff'}};
}
