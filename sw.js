// sw.js — shadowless-lamp-sim Service Worker
// 緩存本地靜態資產，實現 PWA 離線功能（2D 模擬完全離線可用）

// 每次更新靜態資產內容時遞增版本號，activate 會刪除舊快取、強制重新預快取，
// 確保使用者下次造訪即取得最新版本（Phase 60：數值徽章可點擊直接輸入精確數值）
const CACHE_NAME = 'sls-cache-v8';

// 本地靜態資產（相對於 GitHub Pages 的根路徑）
const LOCAL_ASSETS = [
    '/shadowless-lamp-sim/',
    '/shadowless-lamp-sim/index.html',
    '/shadowless-lamp-sim/index.css',
    '/shadowless-lamp-sim/simulation.js',
    '/shadowless-lamp-sim/simulation3d.js',
    '/shadowless-lamp-sim/optics-reciprocity.html',
    '/shadowless-lamp-sim/icon.svg',
    '/shadowless-lamp-sim/manifest.json',
];

// ── Install：預快取所有本地資產 ──
self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            return cache.addAll(LOCAL_ASSETS);
        }).then(function() {
            // 立即接管（不等下次 navigate）
            return self.skipWaiting();
        })
    );
});

// ── Activate：刪除舊版快取 ──
self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(keys) {
            return Promise.all(
                keys
                    .filter(function(key) { return key !== CACHE_NAME; })
                    .map(function(key) { return caches.delete(key); })
            );
        }).then(function() {
            return self.clients.claim();
        })
    );
});

// ── Fetch：快取優先，網路備援 ──
self.addEventListener('fetch', function(event) {
    var url = new URL(event.request.url);

    // 跳過非同源請求（Three.js / Chart.js CDN、Google Fonts 等）
    // 讓瀏覽器自行處理，使用各 CDN 的快取標頭
    if (url.origin !== self.location.origin) {
        return;
    }

    // 跳過非 GET 請求
    if (event.request.method !== 'GET') {
        return;
    }

    event.respondWith(
        caches.match(event.request).then(function(cached) {
            if (cached) {
                // 快取命中：回傳快取版本，背景更新
                var networkUpdate = fetch(event.request).then(function(response) {
                    if (response && response.status === 200) {
                        var clone = response.clone();
                        caches.open(CACHE_NAME).then(function(cache) {
                            cache.put(event.request, clone);
                        });
                    }
                    return response;
                }).catch(function() {
                    // 網路不可用，快取版本已回傳
                });
                return cached;
            }

            // 快取未命中：從網路取得並快取
            return fetch(event.request).then(function(response) {
                if (response && response.status === 200) {
                    var clone = response.clone();
                    caches.open(CACHE_NAME).then(function(cache) {
                        cache.put(event.request, clone);
                    });
                }
                return response;
            }).catch(function() {
                // 完全離線：回傳快取的 index.html 作為 fallback
                return caches.match('/shadowless-lamp-sim/index.html');
            });
        })
    );
});
