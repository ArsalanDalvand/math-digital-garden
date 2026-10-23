// Read-only real page checks; all editing requests below use synthetic responses.
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const url=process.env.WORKSPACE_TEST_URL;
if(!url)throw new Error('Set WORKSPACE_TEST_URL to a local note URL');
const evidence=process.env.WORKSPACE_EVIDENCE_DIR;
if(evidence)mkdirSync(evidence,{recursive:true});
const env={...process.env,TMPDIR:process.env.TMPDIR||'/tmp'};delete env.LD_PRELOAD;
const session='docmost-acceptance';
function browser(...args){
 const output=execFileSync('agent-browser',['--session',session,...args,'--json'],{env,timeout:40000,encoding:'utf8'});
 const result=JSON.parse(output);assert.equal(result.success,true,result.error);return result.data;
}
const evaluate=source=>browser('eval',source).result;
let checks=0;
function check(source){assert.equal(evaluate(source),true,source);checks++;}
const reports=[];
try{
 browser('open',url);
 for(const width of [1440,1024,901,390,320]){
  browser('set','viewport',String(width),'900');
  check('document.documentElement.scrollWidth<=innerWidth');
  check('document.querySelector(".note-mode").getBoundingClientRect().left>=document.querySelector(".document-options").getBoundingClientRect().right+4');
  check('[...document.querySelectorAll(".note-mode button")].every(e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>=44)');
  browser('click','.reading-settings summary');
  check('document.querySelector(".reading-settings").open');
  check('(()=>{const r=document.querySelector(".reading-settings-panel").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})()');
  browser('press','Escape');
  check('document.activeElement===document.querySelector(".reading-settings summary")');
  browser('click','[data-more-toggle]');
  check('!document.querySelector("#workspace-more-panel").hidden');
  browser('press','Escape');
  check('document.activeElement===document.querySelector("[data-more-toggle]")');
  browser('click','.note-outline summary');
  browser('wait','.note-outline-panel a');
  check('document.querySelectorAll(".note-outline-panel a").length>0');
  browser('press','Escape');
  if(width===390){
   browser('click','[data-nav-toggle]');
   check('document.querySelector("#main").inert&&document.querySelector("[data-nav-toggle]").getAttribute("aria-expanded")==="true"');
   browser('press','Escape');
   check('!document.querySelector("#main").inert&&document.activeElement===document.querySelector("[data-nav-toggle]")');
   browser('click','.mobile-study-trigger button');
   browser('wait','[data-slot=sheet-content]');
   check('!!document.querySelector("[data-slot=sheet-content]")');
   browser('press','Escape');
  }
  reports.push({width,geometry:evaluate('({page:document.documentElement.scrollWidth,toolbar:document.querySelector(".document-toolbar").getBoundingClientRect().toJSON()})')});
  if(evidence&&(width===1440||width===390))browser('screenshot',evidence+'/reader-'+width+'.png');
 }
 browser('set','viewport','1440','900');
 browser('click','[data-tools-toggle]');
 check('getComputedStyle(document.querySelector(".workspace-tools")).display==="none"');
 browser('click','[data-tools-toggle]');
 browser('click','.reading-settings summary');
 browser('check','[data-reading-setting=focus]');
 check('document.querySelector("[data-nav-toggle]").getAttribute("aria-expanded")==="false"');
 browser('reload');
 check('document.documentElement.dataset.readingFocus==="true"&&getComputedStyle(document.querySelector(".workspace-nav")).display==="none"');
 browser('click','.reading-settings summary');
 browser('uncheck','[data-reading-setting=focus]');
 check('document.querySelector("[data-nav-toggle]").getAttribute("aria-expanded")==="true"');
 browser('press','Escape');
 browser('click','[data-theme-toggle]');
 if(evidence)browser('screenshot',evidence+'/reader-dark.png');
 for(const selector of ['.document-toolbar','.workspace-header','#workspace-navigation']){
  const audit=browser('a11y','--selector',selector);reports.push({selector,audit});
  assert.equal(audit.counts.violations,0,selector);assert.equal(audit.counts.incomplete,0,selector);checks+=2;
 }
 browser('click','[data-theme-toggle]');
 // No fixture request can write a live fork, bookmark or proposal.
 evaluate(`(()=>{const original=window.fetch;window.fixture={failPreview:false,saves:0};window.fetch=async(input,options={})=>{
 const path=String(input);const json=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
 if(path.startsWith('/api/workspace/notes/'))return json({canonical:{content:'# Fixture\\n\\nSynthetic text.\\n',current_hash:'fixture'},fork:null});
 if(path==='/api/workspace')return json({bookmarks:[]});
 if(path.includes('/fork')){window.fixture.saves++;return json({current_hash:'fixture-saved'});}
 if(path.includes('/bookmarks/'))return json({});
 if(path==='/api/preview'){if(window.fixture.failPreview)return new Response('',{status:503});return json({html:'<h1 id="fixture">Fixture</h1><p>Synthetic preview.</p>'});}
 if(options.method&&options.method!=='GET')throw new Error('Unexpected mutation blocked by test');
 return original(input,options);};return true})()`);
 browser('click','[data-edit]');
 browser('wait','[data-editor] .cm-content');
 check('document.querySelector("[data-edit]").getAttribute("aria-pressed")==="true"&&!document.querySelector("[data-view]").hidden');
 evaluate('window.fixture.failPreview=true');
 browser('click','[data-view]');
 browser('wait','--fn','document.querySelector("[data-view]").disabled===false');
 check('!document.querySelector("[data-editor-panel]").hidden&&document.querySelector("[data-save-status]").textContent.includes("پیش‌نمایش")');
 evaluate('window.fixture.failPreview=false');
 browser('click','[data-view]');
 browser('wait','--fn','document.querySelector("[data-editor-panel]").hidden');
 check('document.querySelector("[data-view]").getAttribute("aria-pressed")==="true"');
 browser('click','[data-edit]');
 browser('set','viewport','320','900');
 browser('keyboard','inserttext',' synthetic edit ');
 check('document.documentElement.scrollWidth<=innerWidth');
 browser('wait','--fn','window.fixture.saves>0');
 browser('click','[data-more-toggle]');
 browser('click','[data-share]');
 browser('wait','[data-share-dialog][open]');
 browser('press','Escape');
 check('document.activeElement===document.querySelector("[data-more-toggle]")');
 browser('click','[data-view]');
 browser('wait','--fn','document.querySelector("[data-editor-panel]").hidden');
 check('document.querySelector(".note-status").textContent.includes("شخصی")');
 if(evidence)writeFileSync(evidence+'/browser-results.json',JSON.stringify({checks,reports,fixture:'Editing only; public note uses real backend'},null,2));
 console.log(JSON.stringify({checks,status:'passed',fixture:'Synthetic editing; real public reader'}));
}finally{browser('close');}
