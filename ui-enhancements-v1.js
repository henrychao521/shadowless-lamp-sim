// ui-enhancements-v1.js — 介面增強集（自 index.html 內嵌 script 整併，Phase 68）
// 版本以檔名承載（Phase 65 教訓：GitHub Pages CDN 對 query 不可靠）。
// 內容變更時改檔名後綴（v1→v2）並同步 index.html／sw.js／deploy.yml 三處。

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
    // 解讀文字依 IEC 50% 門檻分級，幫學生把數字連結到意義。
    (function() {
        var valEl = document.getElementById('center-illuminance-val');
        var outEl = document.getElementById('metric-interpret');
        if (!valEl || !outEl) return;

        function interpret() {
            var n = parseFloat((valEl.textContent || '').replace('%', ''));
            if (isNaN(n)) { outEl.textContent = ''; outEl.className = 'metric-interpret'; return; }
            var msg, level;
            if (n >= 99.5) {
                level = 'ok';   msg = '目前沒有有效遮擋，術野照度幾乎滿值——還沒形成需要稀釋的陰影。試著移動遮擋物或加大半徑。';
            } else if (n >= 80) {
                level = 'ok';   msg = '很亮（≥80%）：遮擋幾乎沒影響，多角度補光成功把本影稀釋掉了，術野依然明亮。';
            } else if (n >= 50) {
                level = 'warn'; msg = '仍合格（≥50%）：照度有下降但仍符合 IEC 60601 標準，醫師的眼睛還不會覺得暗。';
            } else if (n >= 20) {
                level = 'bad';  msg = '不合格（<50%）：低於 IEC 50% 下限，術野中心會出現明顯陰影、影響判斷。試試增加燈數或加大發散角來補光。';
            } else {
                level = 'bad';  msg = '嚴重不足（<20%）：本影幾乎沒被稀釋，接近「單一光源被擋住」的情況。';
            }
            outEl.textContent = '💬 ' + msg;
            outEl.className = 'metric-interpret mi-' + level;
        }

        new MutationObserver(interpret).observe(valEl, { childList: true, characterData: true, subtree: true });
        interpret();
    })();
