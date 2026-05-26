const puppeteer = require('puppeteer');
(async () => {
    const browser = await puppeteer.launch({headless: true, args: ['--no-sandbox']});
    const page = await browser.newPage();
    
    await page.goto('http://localhost:8080', {waitUntil: 'networkidle2'});
    await new Promise(r => setTimeout(r, 2000));
    
    await page.screenshot({path: 'debug_screenshot2.png'});
    console.log("Screenshot saved to debug_screenshot2.png");
    await browser.close();
})();
