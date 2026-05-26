const puppeteer = require('puppeteer');
(async () => {
    const browser = await puppeteer.launch({headless: true, args: ['--no-sandbox']});
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    
    await page.goto('http://localhost:8080', {waitUntil: 'networkidle2'});
    
    // Switch to 3D tab
    await page.evaluate(() => {
        const tabs = document.querySelectorAll('.tab-btn');
        if (tabs.length > 1) tabs[1].click();
    });
    
    await new Promise(r => setTimeout(r, 1000));
    
    // Click Realistic Mode checkbox
    await page.evaluate(() => {
        const cb = document.getElementById('realistic_mode');
        if (cb) cb.click();
    });
    
    await new Promise(r => setTimeout(r, 2000));
    
    await page.screenshot({path: 'debug_screenshot_realistic.png'});
    console.log("Screenshot saved.");
    await browser.close();
})();
