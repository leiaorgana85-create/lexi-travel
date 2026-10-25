const CACHE='lexi-travel-shell-v7';
const BUILD='2026-10-25.lists-clean-1';
const SHELL=["./", "./index.html", "manifest.json", "offline.js?v=4", "theme.js?v=2", "styles.css?v=5", "calendar-fixes.css?v=20", "calendar-special-events.css?v=2", "calendar-sync.css?v=1", "calendar-ui-tweaks.css?v=7", "calendar-edit-top.css?v=2", "notes-ui.css?v=9", "notes-plain-tools.css?v=3", "notes-table-layout.css?v=2", "shopping-list.css?v=10", "visit-list.css?v=3", "plan-ui.css?v=8", "plan-next-move.css?v=5", "plan-calendar.css?v=1", "theme.css?v=1", "ui-system.css?v=2", "compact-select.css?v=1", "tab-gesture-guard.js?v=3", "travel-api-transport.js?v=4", "app.js?v=6", "today-button.js?v=1", "country-fast.js?v=2", "calendar-fixes.js?v=20", "calendar-special-events.js?v=5", "split-view.js?v=9", "calendar-sync.js?v=5", "calendar-flight-authority.js?v=2", "calendar-ui-tweaks.js?v=7", "calendar-resume-refresh.js?v=5", "notes-ui.js?v=12", "notes-reorder.js?v=7", "notes-readonly.js?v=3", "notes-enhancements.js?v=2", "notes-icon-choice.js?v=2", "notes-pane-fixes.js?v=4", "notes-rich.js?v=6", "notes-plain-tools.js?v=3", "notes-sync.js?v=8", "shopping-list.js?v=18", "visit-list.js?v=11", "plan-ui.js?v=8", "plan-next-move.js?v=8", "plan-calendar-editor-bridge.js?v=4", "plan-calendar.js?v=7", "travel-ui-polish.js?v=1", "compact-select.js?v=1"];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL.map(path=>new Request(new URL(path,self.location.href),{cache:'reload'})))).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('lexi-travel-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET')return;
 const url=new URL(e.request.url),scope=new URL('./',self.location.href);
 if(url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname)||url.pathname.includes('/notes-app/'))return;
 // Build probes intentionally bypass the installed shell, so update detection
 // can still see new releases. Runtime files come from one complete release.
 if(e.request.mode==='navigate'&&url.searchParams.has('build')&&url.searchParams.get('build')!==BUILD){e.respondWith(fetch(e.request,{cache:'reload'}).catch(()=>caches.open(CACHE).then(c=>c.match('./index.html'))));return}
 if(url.searchParams.has('lexi_build_probe')){e.respondWith(fetch(e.request,{cache:'no-store'}));return}
 e.respondWith((async()=>{
  const c=await caches.open(CACHE),hit=await c.match(e.request);if(hit)return hit;
  if(e.request.mode==='navigate'){const shell=await c.match('./index.html');if(shell)return shell}
  try{return await fetch(e.request)}catch(_){return Response.error()}
 })());
});
