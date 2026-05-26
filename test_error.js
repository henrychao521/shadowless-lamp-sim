const puppeteer = require('puppeteer');
(async () => {
    const browser = await puppeteer.launch({headless: true, args: ['--no-sandbox']});
    const page = await browser.newPage();
    
    page.on('console', msg => {
        if (msg.type() === 'error') {
            console.log('PAGE CONSOLE ERROR:', msg.text());
        }
    });
    page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
    
    await page.goto('http://localhost:8080', {waitUntil: 'networkidle2'});
    
    await page.evaluate(() => {
        const tabs = document.querySelectorAll('.tab-btn');
        if (tabs.length > 1) tabs[1].click();
    });
    
    await new Promise(r => setTimeout(r, 2000));
    
    // Check if canvas exists and what size it is
    const canvasInfo = await page.evaluate(() => {
        const c = document.querySelector('canvas');
        if (!c) return 'No canvas found';
        return {
            width: c.width,
            height: c.height,
            clientWidth: c.clientWidth,
            clientHeight: c.clientHeight
        };
    });
    console.log("Canvas Info:", canvasInfo);
    
    await browser.close();
})();
