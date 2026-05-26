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

    function runSimulation() {
        // Read parameters
        const lampH = parseFloat(inputs.lampHeight.value);
        const obsX = parseFloat(inputs.obstacleX.value);
        const obsY = parseFloat(inputs.obstacleY.value);
        const obsR = parseFloat(inputs.obstacleRad.value);
        const nLeds = parseInt(inputs.numLeds.value);
        const spreadDeg = parseFloat(inputs.beamSpread.value);

        // Update displays
        displays.lampHeight.textContent = lampH;
        displays.obstacleX.textContent = obsX;
        displays.obstacleY.textContent = obsY;
        displays.obstacleRad.textContent = obsR;
        displays.numLeds.textContent = nLeds;
        displays.beamSpread.textContent = spreadDeg.toFixed(1);

        // 1. Generate LEDs
        const thetaLimit = Math.asin(LAMP_SPAN_WIDTH / lampH);
        const leds = [];
        for (let i = 0; i < nLeds; i++) {
            // evenly spaced angles
            let angle = -thetaLimit;
            if (nLeds > 1) {
                angle = -thetaLimit + (2 * thetaLimit * i) / (nLeds - 1);
            }
            const lx = lampH * Math.sin(angle);
            const ly = lampH * Math.cos(angle);
            leds.push({x: lx, y: ly});
        }

        // 2. Ray Tracing
        const spreadRad = toRadians(spreadDeg);
        
        let allRays = [];
        let hitUnobstructed = [];
        let hitActual = [];

        leds.forEach(led => {
            // base angle
            const dx = -led.x;
            const dy = -led.y; // target is 0,0
            const baseAngle = Math.atan2(dy, dx);
            
            for(let i = 0; i < RAYS_PER_LED; i++) {
                let rAng = -spreadRad/2;
                if(RAYS_PER_LED > 1) {
                    rAng = -spreadRad/2 + (spreadRad * i) / (RAYS_PER_LED - 1);
                }
                const currAngle = baseAngle + rAng;
                const dirX = Math.cos(currAngle);
                const dirY = Math.sin(currAngle);
                
                if (dirY >= 0) continue; // pointing upwards
                
                // intersection with y = 0
                const tTarget = -led.y / dirY;
                const targetX = led.x + tTarget * dirX;
                const targetY = 0;
                
                // collision check
                const sx = led.x, sy = led.y;
                const vx = targetX - sx, vy = targetY - sy;
                const wx = obsX - sx, wy = obsY - sy;
                
                const dotWV = wx*vx + wy*vy;
                const dotVV = vx*vx + vy*vy;
                let tProj = dotWV / dotVV;
                tProj = Math.max(0.0, Math.min(1.0, tProj));
                
                const cx = sx + tProj * vx;
                const cy = sy + tProj * vy;
                
                const dist = Math.sqrt((obsX - cx)**2 + (obsY - cy)**2);
                const isBlocked = dist < obsR;
                
                allRays.push({ start: {x: sx, y: sy}, end: {x: targetX, y: targetY}, blocked: isBlocked });
                
                if (targetX >= -TARGET_WIDTH && targetX <= TARGET_WIDTH) {
                    hitUnobstructed.push(targetX);
                    if (!isBlocked) {
                        hitActual.push(targetX);
                    }
                }
            }
        });

        drawCanvas(leds, allRays, obsX, obsY, obsR);
        updateChart(hitUnobstructed, hitActual);
    }

    function drawCanvas(leds, allRays, obsX, obsY, obsR) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
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

        // Draw LEDs
        ctx.fillStyle = '#fbbf24';
        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = 2;
        leds.forEach(led => {
            ctx.beginPath();
            ctx.arc(mapX(led.x), mapY(led.y), 8, 0, Math.PI*2);
            ctx.fill();
            ctx.stroke();
        });

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
            'rm=' + (rmEl && rmEl.checked ? '1' : '0')
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

    // Initialize — restore hash params first, then run
    restoreFromHash();
    initChart();
    runSimulation();
});
