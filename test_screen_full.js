const puppeteer = require('puppeteer');
(async () => {
    const browser = await puppeteer.launch({headless: true, args: ['--no-sandbox']});
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    
    await page.goto('http://localhost:8080', {waitUntil: 'networkidle2'});
    await new Promise(r => setTimeout(r, 2000));
    
    await page.screenshot({path: 'debug_screenshot_full.png'});
    
    await page.evaluate(() => {
        const tabs = document.querySelectorAll('.tab-btn');
        if (tabs.length > 1) tabs[1].click();
    });
    
    await new Promise(r => setTimeout(r, 2000));
    
    await page.screenshot({path: 'debug_screenshot_full_3d.png'});
    console.log("Screenshots saved.");
    await browser.close();
})();
