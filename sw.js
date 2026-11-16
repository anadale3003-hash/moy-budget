const CACHE='family-budget-v1-5-81';
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
  event.respondWith(fetch(request,{cache:'no-store'}).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put('./index.html',copy)));}return response}).catch(()=>caches.match('./index.html')));return;
 }
 event.respondWith(caches.match(request).then(hit=>hit||fetch(request)));
});

self.addEventListener('push', event => {
  let message = {};
  try { message = event.data ? event.data.json() : {}; } catch (_) {
    message = { title: 'Мой бюджет', body: event.data ? event.data.text() : 'Новое напоминание' };
  }
  const title = message.title || 'Мой бюджет';
  const options = {
    body: message.body || 'У тебя есть напоминание.',
    icon: new URL('./icon.png', self.registration.scope).href,
    badge: new URL('./icon.png', self.registration.scope).href,
    tag: message.tag || 'moy-budget',
    renotify: false,
    data: { url: message.url || new URL('./index.html', self.registration.scope).href }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification.data?.url || new URL('./index.html', self.registration.scope).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('focus' in client) {
        await client.focus();
        if ('navigate' in client) await client.navigate(target);
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});
