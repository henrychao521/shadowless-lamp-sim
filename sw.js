// sw.js — shadowless-lamp-sim Service Worker
// 緩存本地靜態資產，實現 PWA 離線功能（2D 模擬完全離線可用）

// 每次更新靜態資產內容時遞增版本號，activate 會刪除舊快取、強制重新預快取，
// 確保使用者下次造訪即取得最新版本
// （Phase 65：線上實測發現 GitHub Pages 新加坡邊緣節點對 simulation.js 回應
//   「新標頭＋舊內文」且不把 query 納入快取鍵 → ?v=N 永遠打不掉陳舊副本。
//   改以「檔名」承載版本（simulation-v6.js），路徑必在 CDN 快取鍵內，保證取新。
//   另：預快取一律 cache:'no-cache' 強制重新驗證。）
const CACHE_NAME = 'sls-cache-v18'; // Phase 70：index.css 改淺色工程圖紙風（方向 A）

// 本地靜態資產（相對於 GitHub Pages 的根路徑）
// ⚠️ 帶版本碼的資產必須與 index.html 的引用完全一致（Phase 64 修正）：
//    SW 快取以「完整 URL 含 query」為 key，先前預快取無版本碼的 index.css，
//    但頁面實際請求 index.css?v=N → key 不同、預快取永遠不命中，
//    首次安裝後若未再次造訪即離線，核心資產會缺失。
const LOCAL_ASSETS = [
    '/shadowless-lamp-sim/',
    '/shadowless-lamp-sim/index.html',
    '/shadowless-lamp-sim/index.css?v=15',
    '/shadowless-lamp-sim/simulation-v6.js',
    '/shadowless-lamp-sim/ui-enhancements-v1.js',
    '/shadowless-lamp-sim/simulation3d.js?v=6',
    '/shadowless-lamp-sim/optics-reciprocity.html',
    '/shadowless-lamp-sim/icon.svg',
    '/shadowless-lamp-sim/manifest.json',
];

// 允許 runtime 快取的 CDN 主機（Chart.js / Three.js + addons 皆來自 jsdelivr）。
// 先前 SW 完全跳過非同源請求 → 真離線時 Chart.js/Three.js 載不到，
// 「2D 完全離線可用」實際上依賴瀏覽器 HTTP 快取、並不可靠（Phase 64 修正）。
const CDN_HOSTS = ['cdn.jsdelivr.net'];

// ── Install：預快取所有本地資產 ──
self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            // cache:'no-cache' 強制向伺服器重新驗證（ETag 304 仍高效），
            // 避免預快取吃到瀏覽器 HTTP 快取裡的陳舊副本（Phase 65 教訓）
            return cache.addAll(LOCAL_ASSETS.map(function(u) {
                return new Request(u, { cache: 'no-cache' });
            }));
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

// 可否寫入快取：同源資產為 200；CDN 經 <script src> 載入時為 opaque（status 0），
// opaque 回應無法檢查狀態但可快取，Chart.js 即屬此類（Three.js 為 module import、type cors/200）
function cacheable(response) {
    return response && (response.status === 200 || response.type === 'opaque');
}

// ── Fetch：快取優先，網路備援 ──
self.addEventListener('fetch', function(event) {
    var url = new URL(event.request.url);

    // 非同源請求：僅 runtime 快取白名單 CDN（Chart.js / Three.js），
    // 其餘（如 Google Fonts）仍交給瀏覽器處理
    if (url.origin !== self.location.origin && CDN_HOSTS.indexOf(url.hostname) === -1) {
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
                    if (cacheable(response)) {
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
                if (cacheable(response)) {
                    var clone = response.clone();
                    caches.open(CACHE_NAME).then(function(cache) {
                        cache.put(event.request, clone);
                    });
                }
                return response;
            }).catch(function() {
                // 完全離線：僅對「頁面導航」回退到快取的 index.html；
                // 腳本/樣式等子資源若回退 HTML 反而會造成解析錯誤（Phase 64 修正）
                if (event.request.mode === 'navigate') {
                    return caches.match('/shadowless-lamp-sim/index.html');
                }
                return Response.error();
            });
        })
    );
});
