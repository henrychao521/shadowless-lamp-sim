// simulation.js

document.addEventListener("DOMContentLoaded", () => {
    // Canvas setup
    const canvas = document.getElementById('rayCanvas');
    const ctx = canvas.getContext('2d');
    
    // Chart setup
    const chartCtx = document.getElementById('illuminanceChart').getContext('2d');
    let illuminanceChart = null;
    let prevIECPass = null; // IEC 閾值穿越追蹤（觸覺反饋用）

    // UI Elements
    const inputs = {
        lampHeight: document.getElementById('lamp_height'),
        obstacleX: document.getElementById('obstacle_x'),
        obstacleY: document.getElementById('obstacle_y'),
        obstacleRad: document.getElementById('obstacle_rad'),
        numLeds: document.getElementById('num_leds'),
        beamSpread: document.getElementById('beam_spread')
    };

    const displays = {
        lampHeight: document.getElementById('val_lamp_height'),
        obstacleX: document.getElementById('val_obstacle_x'),
        obstacleY: document.getElementById('val_obstacle_y'),
        obstacleRad: document.getElementById('val_obstacle_rad'),
        numLeds: document.getElementById('val_num_leds'),
        beamSpread: document.getElementById('val_beam_spread'),
        centerIlluminance: document.getElementById('center-illuminance-val')
    };

    // 光源設計模式：未勾選 = LED 陣列式（預設）；勾選 = 多面反射式（DomeLux 型）
    const reflectorModeEl = document.getElementById('reflector_mode');

    // Constants
    const LAMP_SPAN_WIDTH = 35.0;
    const RAYS_PER_LED = 15;
    const TARGET_WIDTH = 20.0;
    const NUM_BINS = 80;

    // Helper math
    const toRadians = deg => deg * Math.PI / 180;
    
    // Coordinate mapping (World to Canvas)
    // World X: -45 to 45 cm
    // World Y (Z in code): -5 to 160 cm
    const WORLD_X_MIN = -45, WORLD_X_MAX = 45;
    const WORLD_Y_MIN = -5, WORLD_Y_MAX = 160;
    
    function mapX(x) {
        return ((x - WORLD_X_MIN) / (WORLD_X_MAX - WORLD_X_MIN)) * canvas.width;
    }
    
    function mapY(y) {
        // Invert Y for canvas (0 is top)
        return canvas.height - ((y - WORLD_Y_MIN) / (WORLD_Y_MAX - WORLD_Y_MIN)) * canvas.height;
    }
    
    function mapR(r) {
        return (r / (WORLD_X_MAX - WORLD_X_MIN)) * canvas.width;
    }

    function initChart() {
        var mobile = window.innerWidth < 768;
        illuminanceChart = new Chart(chartCtx, {
            type: 'line',
            data: {
                labels: Array(NUM_BINS).fill(''),
                datasets: [
                    {
                        label: mobile ? '照度 (%)' : '實際相對照度 (%)',
                        data: [],
                        borderColor: '#0ea5e9',
                        backgroundColor: 'rgba(14, 165, 233, 0.2)',
                        fill: true,
                        tension: 0.4,
                        borderWidth: mobile ? 1.5 : 2,
                        pointRadius: 0
                    },
                    {
                        label: mobile ? '基準 (100%)' : '無遮擋基準',
                        data: Array(NUM_BINS).fill(100),
                        borderColor: '#10b981',
                        borderDash: [5, 5],
                        borderWidth: 1.5,
                        pointRadius: 0,
                        fill: false
                    },
                    {
                        // IEC 60601-2-41: shadow dilution ≥ 50% center illuminance required
                        label: mobile ? 'IEC ≥50%' : 'IEC 60601 最低標準 (50%)',
                        data: Array(NUM_BINS).fill(50),
                        borderColor: '#ef4444',
                        borderDash: [3, 6],
                        borderWidth: mobile ? 1 : 1.5,
                        pointRadius: 0,
                        fill: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: mobile ? { left: 4, right: 8 } : {} },
                scales: {
                    x: {
                        title: {
                            display: !mobile,
                            text: '工作平面水平位置 (cm)',
                            color: '#94a3b8',
                            font: { size: 11 }
                        },
                        grid: { color: 'rgba(51, 65, 85, 0.1)' },
                        ticks: {
                            color: '#94a3b8',
                            maxTicksLimit: mobile ? 5 : 10,
                            font: { size: mobile ? 10 : 11 }
                        }
                    },
                    y: {
                        min: 0,
                        max: 120,
                        title: {
                            display: !mobile,
                            text: '相對照度 (%)',
                            color: '#94a3b8',
                            font: { size: 11 }
                        },
                        grid: { color: 'rgba(51, 65, 85, 0.1)' },
                        ticks: {
                            color: '#94a3b8',
                            font: { size: mobile ? 10 : 11 },
                            maxTicksLimit: mobile ? 5 : 7
                        }
                    }
                },
                plugins: {
                    legend: {
                        labels: {
                            color: '#f8fafc',
                            font: { size: mobile ? 10 : 12 },
                            boxWidth: mobile ? 12 : 16,
                            padding: mobile ? 8 : 12
                        }
                    }
                }
            }
        });
    }

    // 多面反射式：中央燈泡位於反射碗內、靠近反射面弧線下方（燈體高度的 0.9 倍處）。
    // 物理上燈泡在燈頭高處的碗內，光線向下打到術野；不可設太低（會與病人頭部模型重疊）。
    const REFLECTOR_SOURCE_FACTOR = 0.9;

    function runSimulation() {
        // Read parameters
        const lampH = parseFloat(inputs.lampHeight.value);
        const obsX = parseFloat(inputs.obstacleX.value);
        const obsY = parseFloat(inputs.obstacleY.value);
        const obsR = parseFloat(inputs.obstacleRad.value);
        const nUnits = parseInt(inputs.numLeds.value);
        const spreadDeg = parseFloat(inputs.beamSpread.value);
        const reflectorMode = reflectorModeEl ? reflectorModeEl.checked : false;

        // Update displays
        displays.lampHeight.textContent = lampH;
        displays.obstacleX.textContent = obsX;
        displays.obstacleY.textContent = obsY;
        displays.obstacleRad.textContent = obsR;
        displays.numLeds.textContent = nUnits;
        displays.beamSpread.textContent = spreadDeg.toFixed(1);

        // 1. Generate emitters（兩種模式共用相同的弧線發光位置與瞄準角度）
        //    → 幾何剖面上的陰影稀釋效果相同，差異在工程取捨（見模式分析卡片）
        const thetaLimit = Math.asin(Math.min(0.999, LAMP_SPAN_WIDTH / lampH));
        const emitters = [];
        for (let i = 0; i < nUnits; i++) {
            let angle = -thetaLimit;
            if (nUnits > 1) {
                angle = -thetaLimit + (2 * thetaLimit * i) / (nUnits - 1);
            }
            const ex = lampH * Math.sin(angle);
            const ey = lampH * Math.cos(angle);
            emitters.push({ x: ex, y: ey, aimAngle: Math.atan2(0 - ey, 0 - ex) });
        }

        // 多面反射式：建立中央光源 + 內部光路（光源 → 各反射面）
        let source = null;
        const internalRays = [];
        if (reflectorMode) {
            source = { x: 0, y: lampH * REFLECTOR_SOURCE_FACTOR };
            emitters.forEach(f => {
                internalRays.push({ start: { x: source.x, y: source.y }, end: { x: f.x, y: f.y } });
            });
        }

        // 2. Ray Tracing（從各發光單元射向工作面）
        const spreadRad = toRadians(spreadDeg);

        let allRays = [];
        let hitUnobstructed = [];
        let hitActual = [];

        emitters.forEach(em => {
            const baseAngle = em.aimAngle;
            for (let i = 0; i < RAYS_PER_LED; i++) {
                let rAng = -spreadRad / 2;
                if (RAYS_PER_LED > 1) {
                    rAng = -spreadRad / 2 + (spreadRad * i) / (RAYS_PER_LED - 1);
                }
                const currAngle = baseAngle + rAng;
                const dirX = Math.cos(currAngle);
                const dirY = Math.sin(currAngle);

                if (dirY >= 0) continue; // pointing upwards

                // intersection with y = 0
                const tTarget = -em.y / dirY;
                const targetX = em.x + tTarget * dirX;
                const targetY = 0;

                // collision check
                const sx = em.x, sy = em.y;
                const vx = targetX - sx, vy = targetY - sy;
                const wx = obsX - sx, wy = obsY - sy;

                const dotWV = wx * vx + wy * vy;
                const dotVV = vx * vx + vy * vy;
                let tProj = dotWV / dotVV;
                tProj = Math.max(0.0, Math.min(1.0, tProj));

                const cx = sx + tProj * vx;
                const cy = sy + tProj * vy;

                const dist = Math.sqrt((obsX - cx) ** 2 + (obsY - cy) ** 2);
                const isBlocked = dist < obsR;

                allRays.push({ start: { x: sx, y: sy }, end: { x: targetX, y: targetY }, blocked: isBlocked });

                if (targetX >= -TARGET_WIDTH && targetX <= TARGET_WIDTH) {
                    hitUnobstructed.push(targetX);
                    if (!isBlocked) {
                        hitActual.push(targetX);
                    }
                }
            }
        });

        drawCanvas(emitters, allRays, obsX, obsY, obsR, reflectorMode, source, internalRays);
        updateChart(hitUnobstructed, hitActual);
        updateModeUI(reflectorMode);
    }

    function drawCanvas(emitters, allRays, obsX, obsY, obsR, reflectorMode, source, internalRays) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 多面反射式：先畫光源 → 反射面的內部光路（淡琥珀色）
        if (reflectorMode && source && internalRays) {
            ctx.strokeStyle = 'rgba(253, 230, 138, 0.18)'; // faint amber
            ctx.lineWidth = 1;
            ctx.beginPath();
            internalRays.forEach(r => {
                ctx.moveTo(mapX(r.start.x), mapY(r.start.y));
                ctx.lineTo(mapX(r.end.x), mapY(r.end.y));
            });
            ctx.stroke();
        }

        // Draw Rays (draw blocked first so valid lines are on top)
        ctx.lineWidth = 1;
        // Sub-sample rays if too many to avoid clutter
        const step = 2;

        // Blocked rays
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.2)'; // red
        ctx.beginPath();
        for (let i = 0; i < allRays.length; i += step) {
            if (allRays[i].blocked) {
                ctx.moveTo(mapX(allRays[i].start.x), mapY(allRays[i].start.y));
                ctx.lineTo(mapX(allRays[i].end.x), mapY(allRays[i].end.y));
            }
        }
        ctx.stroke();

        // Valid rays
        ctx.strokeStyle = 'rgba(14, 165, 233, 0.3)'; // blue
        ctx.beginPath();
        for (let i = 0; i < allRays.length; i += step) {
            if (!allRays[i].blocked) {
                ctx.moveTo(mapX(allRays[i].start.x), mapY(allRays[i].start.y));
                ctx.lineTo(mapX(allRays[i].end.x), mapY(allRays[i].end.y));
            }
        }
        ctx.stroke();

        // Draw Target Plane
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(mapX(-TARGET_WIDTH), mapY(0));
        ctx.lineTo(mapX(TARGET_WIDTH), mapY(0));
        ctx.stroke();

        if (reflectorMode) {
            // ── 多面反射式：畫反射碗弧線 + 各反射面小鏡片 + 中央光源 ──
            // 反射碗弧線（通過所有反射面）
            ctx.strokeStyle = 'rgba(100, 116, 139, 0.85)'; // slate
            ctx.lineWidth = 6;
            ctx.beginPath();
            emitters.forEach((f, idx) => {
                const px = mapX(f.x), py = mapY(f.y);
                if (idx === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            });
            ctx.stroke();

            // 各反射面：依反射定律畫出鏡面切線方向的小鏡片
            ctx.strokeStyle = '#cbd5e1';
            ctx.lineWidth = 3;
            emitters.forEach(f => {
                const fx = mapX(f.x), fy = mapY(f.y);
                const sx = mapX(source.x), sy = mapY(source.y);
                const tx = mapX(0), ty = mapY(0);
                // 入射方向（光源→反射面）與出射方向（反射面→工作面中心）
                let dinx = fx - sx, diny = fy - sy;
                let li = Math.hypot(dinx, diny) || 1; dinx /= li; diny /= li;
                let doutx = tx - fx, douty = ty - fy;
                let lo = Math.hypot(doutx, douty) || 1; doutx /= lo; douty /= lo;
                // 鏡面法線 n ∝ (dout − din)，切線 = 垂直於 n
                let nx = doutx - dinx, ny = douty - diny;
                let ln = Math.hypot(nx, ny) || 1; nx /= ln; ny /= ln;
                const tanx = -ny, tany = nx;
                const half = 14;
                ctx.beginPath();
                ctx.moveTo(fx - tanx * half, fy - tany * half);
                ctx.lineTo(fx + tanx * half, fy + tany * half);
                ctx.stroke();
            });
            // 注意：中央光源（燈泡）改在繪製遮擋物之後才畫，確保燈具永遠在前景可見
        } else {
            // ── LED 陣列式：每個發光單元畫成獨立 LED ──
            ctx.fillStyle = '#fbbf24';
            ctx.strokeStyle = '#d97706';
            ctx.lineWidth = 2;
            emitters.forEach(em => {
                ctx.beginPath();
                ctx.arc(mapX(em.x), mapY(em.y), 8, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            });
        }

        // Draw Obstacle
        ctx.fillStyle = 'rgba(71, 85, 105, 0.9)'; // slate
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(mapX(obsX), mapY(obsY), mapR(obsR), 0, Math.PI*2);
        ctx.fill();
        ctx.stroke();
        
        // Draw Obstacle Text
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 24px "Inter"';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText("模擬頭部", mapX(obsX), mapY(obsY));

        // ── 多面反射式：中央光源（燈泡）畫在最上層，確保燈具永遠可見 ──
        if (reflectorMode && source) {
            const cx = mapX(source.x), cy = mapY(source.y);
            const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, 52);
            grad.addColorStop(0, 'rgba(253, 230, 138, 1)');
            grad.addColorStop(0.5, 'rgba(251, 191, 36, 0.55)');
            grad.addColorStop(1, 'rgba(253, 230, 138, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(cx, cy, 52, 0, Math.PI * 2);
            ctx.fill();
            // 亮核
            ctx.fillStyle = '#fffbeb';
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(cx, cy, 13, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            // 標籤「中央光源」：右側引線 + 文字
            const labelX = cx + 70, labelY = cy - 6;
            ctx.strokeStyle = 'rgba(253, 230, 138, 0.85)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(cx + 14, cy);
            ctx.lineTo(labelX - 6, labelY);
            ctx.stroke();
            ctx.fillStyle = '#fde68a';
            ctx.font = 'bold 22px "Inter"';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText('中央光源', labelX, labelY);
            ctx.font = '16px "Inter"';
            ctx.fillStyle = 'rgba(253, 230, 138, 0.7)';
            ctx.fillText('（單一燈泡）', labelX, labelY + 20);
        }
    }

    // ── 依模式切換 UI 文字（圖例、標籤、模式分析卡片）──
    function updateModeUI(reflectorMode) {
        const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };

        set('legend-source-label', reflectorMode ? '中央光源 + 反射面' : 'LED 光源');
        set('num_leds_label_text', reflectorMode ? '反射面數量' : 'LED 發光單元數量');
        set('beam_spread_label_text', reflectorMode ? '反射面聚焦發散角' : '透鏡準直發散角');

        const titleEl = document.getElementById('mode-analysis-title');
        const prosEl  = document.getElementById('mode-analysis-pros');
        const consEl  = document.getElementById('mode-analysis-desc'); // 重用為 cons 容器
        const noteEl  = document.getElementById('mode-analysis-note');

        if (reflectorMode) {
            if (titleEl) titleEl.textContent = '🪞 多面反射式（DomeLux 型）';
            if (prosEl) prosEl.innerHTML =
                '<strong>優點：</strong>單一光源色溫一致、無分區色差；反射面密集可從多角度填補陰影；' +
                '光源單一、維護更換相對單純。';
            if (consEl) consEl.innerHTML =
                '<strong>缺點：</strong>單點故障風險（故 DomeLux 設「Bulb Failure I/II」雙燈泡備援）；' +
                '反射面損耗約 10%；燈體較深重、散熱集中於單一光源。';
        } else {
            if (titleEl) titleEl.textContent = '💡 LED 陣列式（Trumpf iLED 型）';
            if (prosEl) prosEl.innerHTML =
                '<strong>優點：</strong>單顆故障僅損失局部光通量、可靠度高；LED 壽命約 5 萬小時；' +
                '省電低熱、可分區調光與調色溫。';
            if (consEl) consEl.innerHTML =
                '<strong>缺點：</strong>多顆 LED 需校準色溫以免色差；驅動電路較複雜；' +
                '單顆光通量有限，需密集排列。';
        }
        if (noteEl) noteEl.textContent =
            '💡 2D 幾何剖面下兩種設計的陰影稀釋曲線相同——因為陰影稀釋只取決於「光線抵達術野的角度分布」。'
            + '真正差異在於上述工程取捨，而非幾何照度。';
    }

    function updateChart(hitUnobstructed, hitActual) {
        // Binning
        const binEdges = [];
        for (let i = 0; i <= NUM_BINS; i++) {
            binEdges.push(-TARGET_WIDTH + (i * (2 * TARGET_WIDTH) / NUM_BINS));
        }

        const countsUnobstructed = new Array(NUM_BINS).fill(0);
        const countsActual = new Array(NUM_BINS).fill(0);

        hitUnobstructed.forEach(x => {
            const binIndex = Math.floor((x + TARGET_WIDTH) / ((2 * TARGET_WIDTH) / NUM_BINS));
            if(binIndex >= 0 && binIndex < NUM_BINS) countsUnobstructed[binIndex]++;
        });

        hitActual.forEach(x => {
            const binIndex = Math.floor((x + TARGET_WIDTH) / ((2 * TARGET_WIDTH) / NUM_BINS));
            if(binIndex >= 0 && binIndex < NUM_BINS) countsActual[binIndex]++;
        });

        const relativeIlluminance = [];
        const labels = [];
        let centerDilution = 0;
        const centerIndex = Math.floor(NUM_BINS / 2);

        for (let i = 0; i < NUM_BINS; i++) {
            const val = countsUnobstructed[i] > 0 ? (countsActual[i] / countsUnobstructed[i]) * 100 : 100;
            relativeIlluminance.push(val);
            
            const xVal = (-TARGET_WIDTH + (i + 0.5) * ((2 * TARGET_WIDTH) / NUM_BINS)).toFixed(1);
            labels.push(xVal);
            
            if (i === centerIndex) {
                centerDilution = val;
            }
        }

        // Update Chart
        illuminanceChart.data.labels = labels;
        illuminanceChart.data.datasets[0].data = relativeIlluminance;
        illuminanceChart.update();

        // Update Text Display
        const centerValElem = displays.centerIlluminance;
        centerValElem.textContent = centerDilution.toFixed(1) + '%';

        // Change color based on threshold (e.g., < 50 is bad)
        if (centerDilution < 50) {
            centerValElem.style.color = '#ef4444'; // red
        } else if (centerDilution < 80) {
            centerValElem.style.color = '#fbbf24'; // yellow
        } else {
            centerValElem.style.color = '#14b8a6'; // teal
        }

        // IEC 60601-2-41 Pass/Fail badge
        const iecPass = centerDilution >= 50;
        const iecBadge = document.getElementById('iec-compliance-badge');
        if (iecBadge) {
            if (iecPass) {
                iecBadge.textContent = '✅ IEC PASS';
                iecBadge.className = 'iec-badge iec-pass';
            } else {
                iecBadge.textContent = '❌ IEC FAIL';
                iecBadge.className = 'iec-badge iec-fail';
            }
        }

        // ── 手機版浮動指標條同步 ──
        const mmbVal   = document.getElementById('mmb-center-val');
        const mmbBadge = document.getElementById('mmb-iec-badge');
        if (mmbVal) {
            mmbVal.textContent = centerDilution.toFixed(1) + '%';
            mmbVal.style.color = centerDilution < 50 ? '#ef4444'
                               : centerDilution < 80 ? '#fbbf24'
                               : '#14b8a6';
        }
        if (mmbBadge) {
            mmbBadge.textContent = iecPass ? '✅ IEC PASS' : '❌ IEC FAIL';
            mmbBadge.className   = 'iec-badge ' + (iecPass ? 'iec-pass' : 'iec-fail');
        }

        // ── 面板折疊按鈕即時照度指示（只在手機版可見）──
        const toggleMetric = document.getElementById('toggle-metric-badge');
        if (toggleMetric) {
            toggleMetric.textContent = centerDilution.toFixed(0) + '% ' + (iecPass ? '✅' : '❌');
            toggleMetric.style.color = centerDilution < 50 ? '#ef4444'
                                     : centerDilution < 80 ? '#fbbf24'
                                     : '#14b8a6';
        }

        // ── IEC 閾值穿越觸覺反饋（Android Chrome 支援 Vibration API）──
        if (prevIECPass !== null && iecPass !== prevIECPass && navigator.vibrate) {
            // IEC PASS 達標：輕快雙振；IEC FAIL 跌破：重-短-重
            navigator.vibrate(iecPass ? [25, 20, 50] : [70, 25, 35]);
        }
        prevIECPass = iecPass;
    }

    // ── URL Hash State (shareable simulation configurations) ──
    // Format: #h=100&ox=0&oy=50&oz=0&or=10.5&n=25&s=6.0&rm=0
    function encodeHash() {
        var ozEl = document.getElementById('obstacle_z');
        var rmEl = document.getElementById('realistic_mode');
        var hash = [
            'h='  + inputs.lampHeight.value,
            'ox=' + inputs.obstacleX.value,
            'oy=' + inputs.obstacleY.value,
            'oz=' + (ozEl ? ozEl.value : '0'),
            'or=' + inputs.obstacleRad.value,
            'n='  + inputs.numLeds.value,
            's='  + inputs.beamSpread.value,
            'rm=' + (rmEl && rmEl.checked ? '1' : '0'),
            'rf=' + (reflectorModeEl && reflectorModeEl.checked ? '1' : '0')
        ].join('&');
        // replaceState to avoid polluting browser history on every slider move
        if (window.history && window.history.replaceState) {
            window.history.replaceState(null, '', '#' + hash);
        }
    }

    function restoreFromHash() {
        var raw = window.location.hash.replace(/^#/, '');
        if (!raw) return;
        var params = {};
        raw.split('&').forEach(function(pair) {
            var kv = pair.split('=');
            if (kv.length === 2) params[kv[0]] = kv[1];
        });
        if (params.h  && inputs.lampHeight)  inputs.lampHeight.value  = params.h;
        if (params.ox && inputs.obstacleX)   inputs.obstacleX.value   = params.ox;
        if (params.oy && inputs.obstacleY)   inputs.obstacleY.value   = params.oy;
        if (params.or && inputs.obstacleRad) inputs.obstacleRad.value = params.or;
        if (params.n  && inputs.numLeds)     inputs.numLeds.value     = params.n;
        if (params.s  && inputs.beamSpread)  inputs.beamSpread.value  = params.s;
        // 3D-specific: obstacle_z and realistic_mode
        var ozEl = document.getElementById('obstacle_z');
        if (params.oz && ozEl) { ozEl.value = params.oz; ozEl.dispatchEvent(new Event('input')); }
        var rmEl = document.getElementById('realistic_mode');
        if (params.rm && rmEl) {
            var shouldBeChecked = params.rm === '1';
            if (rmEl.checked !== shouldBeChecked) {
                rmEl.checked = shouldBeChecked;
                rmEl.dispatchEvent(new Event('change'));
            }
        }
        // 光源設計模式（多面反射式）
        if (params.rf && reflectorModeEl) {
            reflectorModeEl.checked = params.rf === '1';
        }
    }

    // ── rAF 防抖：每個動畫幀最多執行一次 runSimulation，避免手機高速拖曳時掉幀 ──
    var _simRafId = null;
    function scheduleSimulation() {
        if (_simRafId !== null) cancelAnimationFrame(_simRafId);
        _simRafId = requestAnimationFrame(function() {
            _simRafId = null;
            runSimulation();
        });
    }

    // Attach Event Listeners — include value-pulse animation + hash update + haptic
    Object.values(inputs).forEach(function(input) {
        input.addEventListener('input', function() {
            // 低成本操作立即執行（不等 rAF）
            encodeHash();
            // Flash the corresponding value display span
            var span = document.getElementById('val_' + input.id);
            if (span) {
                span.classList.remove('val-pulse');
                void span.offsetWidth; // force reflow to restart animation
                span.classList.add('val-pulse');
            }
            // Haptic nudge when slider hits min or max boundary (Android Chrome)
            if (navigator.vibrate && (input.value == input.min || input.value == input.max)) {
                navigator.vibrate(18);
            }
            // 高成本渲染（Canvas + Chart.js）延至下一個 rAF，合併同幀內的多次輸入
            scheduleSimulation();
        });
    });

    // 3D-specific sliders / toggles: also update URL hash on change
    var extraHashEls = ['obstacle_z', 'realistic_mode', 'smart_compensation'];
    extraHashEls.forEach(function(id) {
        var el = document.getElementById(id);
        if (!el) return;
        var evt = (el.type === 'checkbox') ? 'change' : 'input';
        el.addEventListener(evt, encodeHash);
    });

    // 光源設計模式切換：更新 hash + 觸覺 + 重新模擬
    if (reflectorModeEl) {
        reflectorModeEl.addEventListener('change', function() {
            encodeHash();
            if (navigator.vibrate) navigator.vibrate(20);
            scheduleSimulation();
        });
    }

    // Initialize — restore hash params first, then run
    restoreFromHash();
    initChart();
    runSimulation();
});
