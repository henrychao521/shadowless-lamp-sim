const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
    const browser = await puppeteer.launch({ 
        headless: "new",
        defaultViewport: { width: 1280, height: 800 } 
    });
    const page = await browser.newPage();
    
    // 1. Navigate to the local server
    await page.goto('http://localhost:8080', { waitUntil: 'networkidle0' });
    
    // 2. Switch to 3D View
    const tabs = await page.$$('.tab-btn');
    if (tabs.length > 1) {
        await tabs[1].click();
        await new Promise(r => setTimeout(r, 1000));
    }

    // 3. Enable Realistic Mode
    const realisticCheckbox = await page.$('#realistic_mode');
    if (realisticCheckbox) {
        await realisticCheckbox.click();
        await new Promise(r => setTimeout(r, 1500));
        await page.screenshot({ path: path.join(__dirname, 'step1_realistic.png') });
    }

    // 4. Enable Smart Compensation
    const smartCompCheckbox = await page.$('#smart_compensation');
    if (smartCompCheckbox) {
        await smartCompCheckbox.click();
        await new Promise(r => setTimeout(r, 1500));
        await page.screenshot({ path: path.join(__dirname, 'step2_smart_comp.png') });
    }

    // 5. Move Obstacle X slider to 15
    await page.evaluate(() => {
        const slider = document.getElementById('obstacle_x');
        if (slider) {
            slider.value = 15;
            slider.dispatchEvent(new Event('input'));
            slider.dispatchEvent(new Event('change'));
        }
    });
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: path.join(__dirname, 'step3_obstacle_move.png') });

    // 6. Move Beam Spread slider to 12
    await page.evaluate(() => {
        const slider = document.getElementById('beam_spread');
        if (slider) {
            slider.value = 12;
            slider.dispatchEvent(new Event('input'));
            slider.dispatchEvent(new Event('change'));
        }
    });
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: path.join(__dirname, 'step4_beam_spread.png') });

    await browser.close();
    console.log("Operation complete.");
})();
