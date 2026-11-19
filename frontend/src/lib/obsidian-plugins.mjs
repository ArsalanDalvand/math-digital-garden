import {parse as parseYaml} from 'yaml';

/** @param {string} raw @param {string[]} assets */
export function parseGeoGebra(raw,assets=[]) {
  if(raw.length>600_000)throw new Error('GeoGebra block too large');
  const cleanRaw = raw.split(/\r?\n/).map(line => line.replace(/^\s*>\s?/, '')).join('\n');
  let value=parseYaml(cleanRaw,{maxAliasCount:0});
  if(typeof value==='string')value={commands:raw.split(/\r?\n/).map(x=>x.trim()).filter(Boolean)};
  if(!value || typeof value!=='object' || Array.isArray(value))throw new Error('Invalid GeoGebra block');
  const config={appName:'graphing',width:700,height:450,caption:'رسم تعاملی',commands:[],explain:[],...value};
  if(!['graphing','geometry','3d','classic','suite','evaluator','scientific','notes'].includes(config.appName))throw new Error('Invalid app');
  for(const [key,min,max] of [['width',200,1600],['height',200,1000]])if(!Number.isInteger(config[key]) || config[key]<min || config[key]>max)throw new Error('Invalid size');
  for(const key of ['commands','explain'])if(!Array.isArray(config[key]) || config[key].length>100 || !config[key].every(/** @param {unknown} c */ c=>typeof c==='string' && c.length<=2000))throw new Error('Invalid list');
  if(typeof config.caption!=='string' || config.caption.length>500)throw new Error('Invalid caption');
  const booleans=['showToolBar','showAlgebraInput','showMenuBar','showToolBarHelp','allowStyleBar','enableUndoRedo','showZoomButtons','showFullscreenButton','showAnimationButton','showResetIcon','showSuggestionButtons','showStartTooltip','playButton','enableRightClick','enableLabelDrags','enableShiftDragZoom','preventFocus','transparentGraphics','randomize','enable3d','enableCAS','textmode'];
  const strings=['perspective','customToolBar','language','country','rounding','algebraInputPosition','keyboardType'];
  const allowed=new Set(['appName','width','height','caption','commands','explain','materialId','ggbBase64','filename',...booleans,...strings]);
  for(const key of Object.keys(config)){
    if(!allowed.has(key))throw new Error('Unsupported GeoGebra setting: '+key);
    if(booleans.includes(key) && typeof config[key]!=='boolean')throw new Error('Invalid boolean');
    if(strings.includes(key) && (typeof config[key]!=='string' || config[key].length>200))throw new Error('Invalid setting');
  }
  if(config.materialId!==undefined && (typeof config.materialId!=='string' || !/^[a-zA-Z0-9]{1,100}$/.test(config.materialId)))throw new Error('Invalid material');
  if(config.ggbBase64!==undefined && (typeof config.ggbBase64!=='string' || config.ggbBase64.length>500_000 || !/^[A-Za-z0-9+/=]+$/.test(config.ggbBase64)))throw new Error('Invalid file');
  if(config.filename!==undefined){
    if(typeof config.filename!=='string' || !config.filename.endsWith('.ggb'))throw new Error('Invalid file');
    const asset=resolveVaultImage(config.filename,assets);
    if(!asset)throw new Error('File is missing or ambiguous');
    config.filename='/'+asset.split('/').map(encodeURIComponent).join('/');
  }
  return config;
}

/** @param {string} name @param {string[]} assets */
export function resolveVaultImage(name,assets) {
  name=name.replace(/\\/g,'/');if(name.split('/').includes('..') || name.startsWith('/'))return;
  const names=/\.excalidraw(?:\.md)?$/.test(name) ? [name.replace(/\.md$/,'')+'.png',name.replace(/\.excalidraw(?:\.md)?$/,'.png'),name.replace(/\.md$/,'')+'.svg'] : [name];
  for(const candidate of names){
    const found=assets.filter(path=>path===candidate || path.endsWith('/'+candidate));
    if(found.length)return found.length===1 ? found[0] : undefined;
  }
}

