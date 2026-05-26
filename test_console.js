const puppeteer = require('puppeteer');
(async () => {
    const browser = await puppeteer.launch({headless: true, args: ['--no-sandbox']});
    const page = await browser.newPage();
    
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
    page.on('requestfailed', request => console.log('REQUEST FAILED:', request.url(), request.failure() ? request.failure().errorText : ''));
    page.on('response', response => {
        if (!response.ok()) {
            console.log('RESPONSE FAILED:', response.url(), response.status());
        }
    });

    await page.goto('http://localhost:8080', {waitUntil: 'networkidle2'});
    
    await browser.close();
})();
