/* 오프라인에서도 앱 틀이 뜨도록 최소한만 캐시합니다 (개인 데이터는 캐시하지 않음)
   · 평소에는 네트워크에서 먼저 받아 늘 최신 화면을 보여 주고,
     인터넷이 없을 때만 캐시로 열어 줍니다. (버전을 올리지 않아도 수정이 바로 반영) */
var CACHE = 'my-budget-v8';
var ASSETS = ['./', './index.html', './styles.css?v=9', './core.js?v=9', './app.js?v=9', './manifest.json', './icon-192.png', './icon-512.png'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var sameOrigin = new URL(e.request.url).origin === location.origin;
  e.respondWith(fetch(e.request).then(function (res) {
    if (res && res.status === 200 && sameOrigin) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
    }
    return res;
  }).catch(function () {
    return caches.match(e.request).then(function (hit) { return hit || caches.match('./index.html'); });
  }));
});
