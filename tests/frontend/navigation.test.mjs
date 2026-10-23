import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../frontend/package.json',import.meta.url));
const {JSDOM}=require('jsdom');
const ts=require('typescript');
const source=readFileSync(new URL('../../frontend/src/layouts/Reader.astro',import.meta.url),'utf8');
function shell(mobile,focus=false){
 const dom=new JSDOM('<button data-nav-toggle></button><button data-nav-backdrop hidden></button><aside id="workspace-navigation"><button data-nav-close></button><a href="/">Home</a></aside><main id="main"></main><button data-tools-toggle aria-expanded="true"></button><div class="workspace-more"><button data-more-toggle aria-expanded="false">بیشتر</button><div id="workspace-more-panel" hidden><button data-bookmark>Bookmark</button><button data-share>Share</button></div><details class="reading-settings"><summary>تنظیمات مطالعه</summary><input data-reading-setting="focus" type="checkbox"></details></div><dialog data-share-dialog></dialog><details class="note-outline"><summary>Outline</summary></details>',{runScripts:'outside-only',url:'http://localhost/'});
 let change;
 dom.window.matchMedia=()=>({matches:mobile,addEventListener:(_event,callback)=>{change=callback;}});
 dom.window.localStorage.setItem('garden-reading',JSON.stringify({focus}));
 const settings=readFileSync(new URL('../../frontend/src/components/ReadingSettings.astro',import.meta.url),'utf8');
 dom.window.eval(ts.transpile(settings.match(/<script>\s*([\s\S]*?)<\/script>/)[1]));
 dom.window.eval(ts.transpile(source.match(/<script>\s*([\s\S]*?)<\/script>/)[1]));
 return {document:dom.window.document,resize(matches){mobile=matches;change({matches});}};
}
test('desktop navigation can collapse and reopen from its persistent header control',()=>{
 const {document}=shell(false),toggle=document.querySelector('[data-nav-toggle]'),nav=document.querySelector('aside');
 assert.equal(toggle.getAttribute('aria-expanded'),'true');
 toggle.click();assert.equal(toggle.getAttribute('aria-expanded'),'false');assert.equal(nav.inert,true);
 toggle.click();assert.equal(toggle.getAttribute('aria-expanded'),'true');assert.equal(nav.inert,false);
});
test('Escape closes the active menu before the sidebar and returns focus',()=>{
 const {document}=shell(false),nav=document.querySelector('[data-nav-toggle]'),more=document.querySelector('[data-more-toggle]'),reading=document.querySelector('.reading-settings');
 more.click();reading.open=true;
 document.dispatchEvent(new document.defaultView.KeyboardEvent('keydown',{key:'Escape'}));
 assert.equal(reading.open,false);assert.equal(more.getAttribute('aria-expanded'),'true');assert.equal(nav.getAttribute('aria-expanded'),'true');
 assert.equal(document.activeElement,reading.querySelector('summary'));
 document.dispatchEvent(new document.defaultView.KeyboardEvent('keydown',{key:'Escape'}));
 assert.equal(more.getAttribute('aria-expanded'),'false');assert.equal(document.activeElement,more);
});
test('focus reading mode and sidebar state stay in sync',()=>{
 const {document}=shell(false),focus=document.querySelector('[data-reading-setting="focus"]'),toggle=document.querySelector('[data-nav-toggle]');
 focus.checked=true;focus.dispatchEvent(new document.defaultView.Event('input',{bubbles:true}));
 assert.equal(document.documentElement.dataset.readingFocus,'true');
 assert.equal(toggle.getAttribute('aria-expanded'),'false');
 toggle.click();
 assert.equal(document.documentElement.dataset.readingFocus,'false');
 assert.equal(focus.checked,false);
 assert.equal(toggle.getAttribute('aria-expanded'),'true');
});
test('saved focus mode survives page initialization and viewport changes',()=>{
 const {document,resize}=shell(false,true),toggle=document.querySelector('[data-nav-toggle]');
 assert.equal(document.documentElement.dataset.readingFocus,'true');
 assert.equal(toggle.getAttribute('aria-expanded'),'false');
 resize(true);resize(false);
 assert.equal(document.documentElement.dataset.readingFocus,'true');
 assert.equal(toggle.getAttribute('aria-expanded'),'false');
 toggle.click();
 assert.equal(document.documentElement.dataset.readingFocus,'false');
 assert.equal(toggle.getAttribute('aria-expanded'),'true');
});
test('mobile drawer opens, closes with Escape and restores focus; resize resets visibility',()=>{
 const {document,resize}=shell(true),toggle=document.querySelector('[data-nav-toggle]'),close=document.querySelector('[data-nav-close]'),backdrop=document.querySelector('[data-nav-backdrop]');
 assert.equal(toggle.getAttribute('aria-expanded'),'false');
 toggle.click();assert.equal(document.activeElement,close);assert.equal(document.body.classList.contains('nav-open'),true);
 assert.equal(backdrop.hidden,false);assert.equal(document.querySelector('main').inert,true);
 document.dispatchEvent(new document.defaultView.KeyboardEvent('keydown',{key:'Escape'}));
 assert.equal(toggle.getAttribute('aria-expanded'),'false');assert.equal(document.activeElement,toggle);
 assert.equal(backdrop.hidden,true);assert.equal(document.querySelector('main').inert,false);
 toggle.click();close.click();assert.equal(document.activeElement,toggle);
 resize(false);assert.equal(toggle.getAttribute('aria-expanded'),'true');
 resize(true);assert.equal(toggle.getAttribute('aria-expanded'),'false');
});

test('document actions close after selection; proposal close restores a visible trigger',()=>{
 const {document}=shell(false),more=document.querySelector('[data-more-toggle]'),panel=document.querySelector('#workspace-more-panel');
 more.click();assert.equal(panel.hidden,false);
 document.querySelector('[data-bookmark]').click();assert.equal(panel.hidden,true);assert.equal(document.activeElement,more);
 more.click();document.querySelector('[data-share]').click();assert.equal(panel.hidden,false);
 document.querySelector('[data-share-dialog]').dispatchEvent(new document.defaultView.Event('close'));
 assert.equal(panel.hidden,true);assert.equal(document.activeElement,more);
});
test('outline Escape leaves navigation open; focus mode restores tools and navigation',()=>{
 const {document}=shell(false),outline=document.querySelector('.note-outline'),tools=document.querySelector('[data-tools-toggle]'),focus=document.querySelector('[data-reading-setting="focus"]');
 outline.open=true;document.dispatchEvent(new document.defaultView.KeyboardEvent('keydown',{key:'Escape'}));
 assert.equal(outline.open,false);assert.equal(document.activeElement,outline.querySelector('summary'));assert.equal(document.querySelector('[data-nav-toggle]').getAttribute('aria-expanded'),'true');
 tools.click();assert.equal(document.body.classList.contains('tools-collapsed'),true);tools.click();
 focus.checked=true;focus.dispatchEvent(new document.defaultView.Event('input'));assert.equal(tools.getAttribute('aria-expanded'),'false');
 focus.checked=false;focus.dispatchEvent(new document.defaultView.Event('input'));assert.equal(tools.getAttribute('aria-expanded'),'true');assert.equal(document.querySelector('[data-nav-toggle]').getAttribute('aria-expanded'),'true');
});
test('shell leaves Escape to an open dialog instead of dismissing its return target',()=>{
 const {document}=shell(false),more=document.querySelector('[data-more-toggle]'),dialog=document.querySelector('dialog');
 more.click();dialog.setAttribute('open','');
 const event=new document.defaultView.KeyboardEvent('keydown',{key:'Escape',cancelable:true});document.dispatchEvent(event);
 assert.equal(event.defaultPrevented,false);assert.equal(more.getAttribute('aria-expanded'),'true');
});
