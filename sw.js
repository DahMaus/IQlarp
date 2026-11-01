/* Wortschatz — Service Worker
   Speichert die App-Dateien beim ersten Besuch und liefert sie danach offline aus.
   Bei Änderungen an den Dateien die Version im Cache-Namen erhöhen. */

var CACHE = 'wortschatz-v2';

var ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/data.js',
  './js/store.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE)
      .then(function (cache) { return cache.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (namen) {
        return Promise.all(namen.map(function (name) {
          if (name !== CACHE) return caches.delete(name);
          return null;
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;

  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  /* Seitenaufrufe: erst Netz, sonst die gespeicherte Startseite. */
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(function () {
        return caches.match('./index.html');
      })
    );
    return;
  }

  /* Übrige Dateien: sofort aus dem Cache, im Hintergrund aktualisieren. */
  event.respondWith(
    caches.match(request).then(function (gespeichert) {
      var ausDemNetz = fetch(request).then(function (antwort) {
        if (antwort && antwort.ok) {
          var kopie = antwort.clone();
          caches.open(CACHE).then(function (cache) { cache.put(request, kopie); });
        }
        return antwort;
      }).catch(function () {
        return gespeichert;
      });
      return gespeichert || ausDemNetz;
    })
  );
});
