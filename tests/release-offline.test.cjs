const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const release=require('../version.json');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');

for(const page of ['index.html','preview.html']){
 test(page+' displays its installed version and offers only newer releases',async()=>{
  const html=read(page),nodes=new Map();
  function $(id){
   if(!nodes.has(id))nodes.set(id,{style:{},addEventListener(type,handler){this[type]=handler;}});
   return nodes.get(id);
  }
  let remote=release.version,redirect;
  const context=vm.createContext({$,location:{protocol:'https:',replace:url=>{redirect=url}},navigator:{},
   fetch:async()=>({ok:true,json:async()=>({version:remote})})});
  vm.runInContext(html.slice(html.indexOf('const APP_VERSION='),html.indexOf("$('saveStart').addEventListener")),context);
  vm.runInContext(html.slice(html.indexOf("$('checkUpdate').addEventListener"),html.indexOf('/* Analytics modal interactions')),context);
  assert.equal($('appVersion').textContent,release.version);
  assert.equal($('settingsVersionBadge').textContent,'v'+release.version);
  await $('checkUpdate').click();
  assert.match($('updateStatus').textContent,/актуальная версия/);
  assert.equal($('applyUpdate').style.display,'none');
  const [major,minor,patch]=remote.split('.').map(Number);
  remote=[major,minor,patch+1].join('.');
  await $('checkUpdate').click();
  assert.equal($('applyUpdate').style.display,'block');
  await $('applyUpdate').click();
  assert.equal(redirect.split('?')[0],'./'+page);
 });
}

test('first offline navigation serves each installed entry from its own cache',async()=>{
 const scope='https://example.test/saldoza/',stored=new Map(),events={};
 const absolute=value=>new URL(value,scope).href;
 const cache={
  match:async key=>stored.get(absolute(key)),
  async addAll(requests){
   for(const request of requests){
    const file=request.url.slice(scope.length)||'index.html';
    stored.set(request.url,read(file));
   }
  }
 };
 const context={URL,Request,self:{registration:{scope},location:new URL(scope),skipWaiting(){},
  addEventListener:(type,handler)=>{events[type]=handler}},
  caches:{open:async()=>cache},
  fetch:async()=>{throw Error('offline')}};
 vm.runInNewContext(read('sw.js'),context);
 let installed;
 events.install({waitUntil:result=>{installed=result}});
 await installed;
 for(const page of ['preview.html','index.html']){
  let response;
  events.fetch({request:{method:'GET',mode:'navigate',url:absolute(page+'?refresh=1')},respondWith:result=>{response=result}});
  assert.equal(await response,read(page));
 }
});
