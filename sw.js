const CACHE='family-budget-v1-5-14';
const ASSETS=['./','./index.html','./preview.html','./manifest.webmanifest','./version.json','./icon.svg','./icon.png','./icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin)return;
 const url=new URL(request.url);
 if(url.pathname.endsWith('/version.json')){event.respondWith(fetch(request,{cache:'no-store'}));return;}
 // Keep the preview isolated from the production entrypoint cache.
 // Network-first without HTTP cache allows an installed Home Screen shortcut to see updates.
 if(url.pathname.endsWith('/preview.html')){
  event.respondWith(fetch(request,{cache:'no-store'}).then(response=>{
   if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put('./preview.html',copy)));}
   return response;
  }).catch(()=>caches.match('./preview.html')));
  return;
 }
 if(request.mode==='navigate'||url.pathname.endsWith('/index.html')){
  event.respondWith(fetch(request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put('./index.html',copy));}return response}).catch(()=>caches.match('./index.html')));return;
 }
 event.respondWith(caches.match(request).then(hit=>hit||fetch(request)));
});