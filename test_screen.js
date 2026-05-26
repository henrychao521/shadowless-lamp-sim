const puppeteer = require('puppeteer');
(async () => {
    const browser = await puppeteer.launch({headless: true, args: ['--no-sandbox']});
    const page = await browser.newPage();
    
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
    
    await page.goto('http://localhost:8080', {waitUntil: 'networkidle2'});
    
    // Switch to 3D tab
    await page.evaluate(() => {
        const tabs = document.querySelectorAll('.tab-btn');
        if (tabs.length > 1) tabs[1].click();
    });
    
    await new Promise(r => setTimeout(r, 2000));
    
    await page.screenshot({path: 'debug_screenshot.png'});
    console.log("Screenshot saved to debug_screenshot.png");
    await browser.close();
})();
