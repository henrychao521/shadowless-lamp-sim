// ui-enhancements-v5.js — 介面增強集（自 index.html 內嵌 script 整併，Phase 68）
// 版本以檔名承載（Phase 65 教訓：GitHub Pages CDN 對 query 不可靠）。
// 內容變更時改檔名後綴（v4→v5）並同步 index.html／sw.js／deploy.yml 三處。

// ── Phase 59：滑桿 ± 微調按鈕（手機精準調整、長按連續調整）──
    // 觸控拖曳滑桿難以對準精確值（如 0cm／100cm）。為每個滑桿兩側加上 −／＋ 按鈕，
    // 單擊跳一個 step，長按延遲後連續調整並在抵達上下限時自動停止。
    (function() {
        var panel = document.getElementById('controls-panel-body');
        if (!panel) return;

        function decimals(stepStr) {
            var i = String(stepStr).indexOf('.');
            return i < 0 ? 0 : String(stepStr).length - i - 1;
        }

        function makeBtn(glyph, label) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'slider-step-btn';
            b.textContent = glyph;
            b.setAttribute('aria-label', label);
            b.tabIndex = -1; // 鍵盤使用者可直接用方向鍵調整滑桿，避免增加多餘 tab 焦點
            return b;
        }

        // 按住連續調整：立即跳一步 → 延遲 380ms → 每 60ms 連續，抵達邊界自動停
        function bindHold(btn, action) {
            var holdTimer = null, repeatTimer = null;
            function stop() {
                if (holdTimer)   { clearTimeout(holdTimer);  holdTimer = null; }
                if (repeatTimer) { clearInterval(repeatTimer); repeatTimer = null; }
            }
            btn.addEventListener('pointerdown', function(e) {
                e.preventDefault();
                if (!action()) return;
                if (navigator.vibrate) { try { navigator.vibrate(8); } catch (_) {} }
                holdTimer = setTimeout(function() {
                    repeatTimer = setInterval(function() {
                        if (!action()) stop();
                    }, 60);
                }, 380);
            });
            btn.addEventListener('pointerup', stop);
            btn.addEventListener('pointerleave', stop);
            btn.addEventListener('pointercancel', stop);
            window.addEventListener('blur', stop);
        }

        panel.querySelectorAll('input[type="range"]').forEach(function(input) {
            var step = parseFloat(input.step) || 1;
            var min  = parseFloat(input.min);
            var max  = parseFloat(input.max);
            var dec  = decimals(input.step || '1');

            var row = document.createElement('div');
            row.className = 'slider-row';
            input.parentNode.insertBefore(row, input);   // row 取代 input 原位置
            var minus = makeBtn('−', '減少');
            var plus  = makeBtn('+', '增加');
            row.appendChild(minus);
            row.appendChild(input);                       // 將 input 移入 row
            row.appendChild(plus);

            function stepBy(dir) {
                var cur = parseFloat(input.value);
                var v = Math.min(max, Math.max(min, cur + dir * step));
                v = parseFloat(v.toFixed(dec));           // 修正浮點誤差（step 0.5 等）
                if (v === cur) return false;              // 已達邊界
                input.value = v;
                input.dispatchEvent(new Event('input',  { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
            }

            bindHold(minus, function() { return stepBy(-1); });
            bindHold(plus,  function() { return stepBy(1); });
        });
    })();

// ── Phase 60：點擊數值徽章直接輸入精確數值 ──
    // ± 按鈕適合微調，但要一次跳到特定值（如燈高 137cm、LED 41 顆）仍須多次點按。
    // 點擊標籤中的數值徽章 → 就地展開 number 輸入框，輸入後對齊 step 網格、夾在上下限內，
    // 沿用既有 input 事件流程（數值更新 / URL hash / 渲染），與拖曳完全一致。
    (function() {
        var panel = document.getElementById('controls-panel-body');
        if (!panel) return;

        function decimals(stepStr) {
            var i = String(stepStr).indexOf('.');
            return i < 0 ? 0 : String(stepStr).length - i - 1;
        }

        panel.querySelectorAll('input[type="range"]').forEach(function(input) {
            var badge = document.getElementById('val_' + input.id);
            if (!badge) return;

            var step = parseFloat(input.step) || 1;
            var min  = parseFloat(input.min);
            var max  = parseFloat(input.max);
            var dec  = decimals(input.step || '1');

            badge.classList.add('val-editable');
            badge.setAttribute('role', 'button');
            badge.setAttribute('tabindex', '-1'); // 鍵盤族可直接用方向鍵調滑桿，不增加多餘 tab 停留
            badge.title = '點擊輸入精確數值（' + min + '–' + max + '）';

            var editing = false;

            function openEditor() {
                if (editing) return;
                editing = true;

                var box = document.createElement('input');
                box.type = 'number';
                box.className = 'val-edit-input';
                box.min = min; box.max = max; box.step = input.step || 1;
                box.value = input.value;
                box.setAttribute('aria-label', '輸入精確數值（' + min + ' 至 ' + max + '）');
                badge.style.display = 'none';
                badge.parentNode.insertBefore(box, badge.nextSibling);
                box.focus();
                box.select();

                function commit(apply) {
                    if (!editing) return;
                    editing = false;
                    if (apply) {
                        var v = parseFloat(box.value);
                        if (!isNaN(v)) {
                            v = Math.min(max, Math.max(min, v));
                            v = min + Math.round((v - min) / step) * step;  // 對齊 step 網格
                            v = parseFloat(v.toFixed(dec));
                            if (v !== parseFloat(input.value)) {
                                input.value = v;
                                input.dispatchEvent(new Event('input',  { bubbles: true }));
                                input.dispatchEvent(new Event('change', { bubbles: true }));
                            }
                        }
                    }
                    if (box.parentNode) box.parentNode.removeChild(box);
                    badge.style.display = '';
                }

                box.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter')      { e.preventDefault(); commit(true); }
                    else if (e.key === 'Escape'){ e.preventDefault(); commit(false); }
                });
                box.addEventListener('blur', function() { commit(true); });
            }

            badge.addEventListener('click', function(e) {
                e.preventDefault();   // 阻止 label 將點擊轉發給滑桿
                e.stopPropagation();
                openEditor();
            });
        });
    })();

// ── Phase 61：學習指引「試試看」按鈕 → 套用對應預設場景並捲動回模擬區 ──
    (function() {
        document.querySelectorAll('.lg-preset[data-preset]').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var target = document.getElementById(btn.getAttribute('data-preset'));
                if (target) target.click();   // 重用既有預設場景按鈕邏輯
                var sim = document.querySelector('.visualization-area');
                if (sim && sim.scrollIntoView) sim.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        });
    })();

// ── Phase 63：白話即時解讀 — 觀察中心照度數值，翻譯成「這代表什麼」 ──
    // 以 MutationObserver 監看既有的 #center-illuminance-val（不改 simulation.js），
    // Phase 72：IEC 60601-2-41 未訂殘餘照度下限，解讀改為和「市售手術燈單遮罩數值」的常見區間對照
    // （區間由 simulation-v10.js 的 window.SLS_MARKET_BAND 計算，這裡只讀取）。
    // Phase 75：低於區間時的建議依 Playwright 實測改寫——中心照度取決於「燈頭張角中沒被遮擋物擋住的比例」，
    // 增加燈數、加大發散角幾乎不會改變這個百分比（見學習單任務 1、3、4 教師指引）。
    (function() {
        var valEl = document.getElementById('center-illuminance-val');
        var outEl = document.getElementById('metric-interpret');
        if (!valEl || !outEl) return;

        function interpret() {
            var n = parseFloat((valEl.textContent || '').replace('%', ''));
            var band = window.SLS_MARKET_BAND;
            if (isNaN(n) || !band) { outEl.textContent = ''; outEl.className = 'metric-interpret'; return; }
            var range = band.lo + '–' + band.hi + '%';
            var msg, level;
            if (n >= 99.5) {
                level = 'ok';   msg = '目前沒有有效遮擋，術野照度幾乎滿值——還沒形成需要稀釋的陰影。試著移動遮擋物或加大半徑。';
            } else if (n > band.hi) {
                level = 'ok';   msg = '高於市售常見區間（' + range + '）：比多數市售手術燈在說明書標示的單遮罩數值還亮，多角度補光把本影稀釋得很乾淨。';
            } else if (n >= band.lo) {
                level = 'warn'; msg = '落在市售常見區間（' + range + '）：和多數市售手術燈的單遮罩標示值相當——照度有下降，但本影已被明顯稀釋。';
            } else {
                level = 'bad';  msg = '低於市售常見區間（' + range + '）：比多數市售手術燈的單遮罩標示值還暗，術野中心會出現明顯陰影。想讓中心亮回來，要讓光從更多「沒被擋住的角度」進來：把燈拉低讓燈頭張角變大（實際產品是把燈頭做大）、讓遮擋物離術野遠一點或移到側邊。只增加燈數或加大發散角，這個百分比幾乎不會變。';
            }
            outEl.textContent = '💬 ' + msg;
            outEl.className = 'metric-interpret mi-' + level;
        }

        new MutationObserver(interpret).observe(valEl, { childList: true, characterData: true, subtree: true });
        interpret();
    })();

// ── Phase 76：光斑說明 — 曲線只畫在光斑內，光斑外（灰色虛線）沒有光可比 ──
    // 讀 simulation-v10.js 每次重算時寫入的 window.SLS_SPOT（光斑範圍，cm）。
    // 放在照度圖「下方」的獨立段落：文字長短變化不會把圖表推上推下（避免版面位移）。
    (function() {
        var valEl = document.getElementById('center-illuminance-val');
        var outEl = document.getElementById('spot-note');
        if (!valEl || !outEl) return;
        function update() {
            var spot = window.SLS_SPOT;
            if (!spot || spot.halfWidth === null) { outEl.textContent = ''; return; }
            var w = Math.round(spot.halfWidth * 2) / 2;
            outEl.textContent = '💬 曲線只畫在光斑內（約 ±' + w + 'cm，燈光實際照到的範圍）。兩側 0% 處的灰色虛線是光斑外：那裡本來就沒有光，無從比較「剩幾成」——不是 100% 亮，也不是影子。';
        }
        new MutationObserver(update).observe(valEl, { childList: true, characterData: true, subtree: true });
        update();
    })();

// ── Phase 75：幾何合理性提示 — 遮擋物碰到／穿過燈頭，或伸進燈頭碗口時提醒 ──
    // 模擬器的燈頭是以術野中心 (0,0) 為圓心、半徑＝燈高的圓弧，水平半寬固定 35cm（同 simulation-v9.js）。
    // 兩級：
    //   bad ：遮擋物圓和燈頭圓弧相交、或圓心已在燈頭外側（d ≥ 燈高）→ 現實中不可能，數字沒有物理意義
    //   warn：沒碰到，但遮擋物頂端高過燈頭最外圈 LED 的高度（伸進燈頭碗口）→ 醫師的頭不會在這裡，數字僅供參考
    // 滑桿本身不加限制（學生仍可自由探索），只即時提示；預設場景全部落在合理範圍。
    (function() {
        var out = document.getElementById('geometry-warning');
        if (!out) return;
        var ids = ['lamp_height', 'obstacle_x', 'obstacle_y', 'obstacle_rad'];
        var els = ids.map(function(id) { return document.getElementById(id); });
        if (els.some(function(el) { return !el; })) return;
        var HALF_SPAN = 35.0;

        function check() {
            var H = parseFloat(els[0].value), ox = parseFloat(els[1].value),
                oy = parseFloat(els[2].value), r = parseFloat(els[3].value);
            var th = Math.asin(Math.min(0.999, HALF_SPAN / H));
            var d = Math.hypot(ox, oy);
            var phi = Math.atan2(ox, oy);
            var dist;                                   // 遮擋物圓心到燈頭圓弧的最短距離
            if (Math.abs(phi) <= th) {
                dist = Math.abs(d - H);
            } else {
                var ex = H * Math.sin(th) * (phi > 0 ? 1 : -1), ey = H * Math.cos(th);
                dist = Math.hypot(ox - ex, oy - ey);
            }
            var rim = Math.sqrt(Math.max(0, H * H - HALF_SPAN * HALF_SPAN));   // 燈頭最外圈 LED 的高度
            var msg = '', level = '';
            if (dist < r || d >= H) {
                level = 'bad';
                msg = '⚠️ 遮擋物已經碰到或穿過燈頭（燈高 ' + H + 'cm，遮擋物頂端 ' + (oy + r) + 'cm）。現實中不可能，這時的中心照度沒有物理意義——請把燈拉高，或把遮擋物移低、縮小。';
            } else if (oy + r > rim) {
                level = 'warn';
                msg = 'ℹ️ 遮擋物頂端（' + (oy + r) + 'cm）已高過燈頭最外圈（約 ' + Math.round(rim) + 'cm），等於伸進燈頭碗口裡；醫師的頭不會在這個位置，數字僅供參考。';
            }
            if (msg) {
                out.textContent = msg;
                out.className = 'metric-interpret mi-' + level;
                out.hidden = false;
            } else {
                out.textContent = '';
                out.hidden = true;
            }
        }

        els.forEach(function(el) { el.addEventListener('input', check); });
        // 網址 hash 還原場景時是直接改 value、不發 input 事件 → 載入完成後再檢查一次
        document.addEventListener('DOMContentLoaded', check);
        window.addEventListener('load', check);
        check();
    })();
