import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const [baseUrl = 'http://127.0.0.1:4173'] = process.argv.slice(2);
const widths = [390, 320];

function overlaps(first, second) {
  return first.left < second.right
    && first.right > second.left
    && first.top < second.bottom
    && first.bottom > second.top;
}

const browser = await chromium.launch({ headless: true });
try {
  for (const width of widths) {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      colorScheme: 'dark',
      locale: 'en-GB',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
    });

    await context.addInitScript(() => {
      localStorage.setItem('h4p.theme', 'dark');
      localStorage.setItem('chatSession', JSON.stringify({ sessionId: 'mobile-nav-test', nickname: 'Javier' }));
      localStorage.setItem('welcomeSent:mobile-nav-test', 'true');
      localStorage.setItem('chatCollapsed', 'true');
    });

    const page = await context.newPage();
    await page.route('https://cdn.jsdelivr.net/**', async route => {
      if (route.request().url().includes('mobile-detect')) {
        await route.fulfill({
          contentType: 'application/javascript',
          body: "class MobileDetect{constructor(userAgent){this.userAgent=userAgent}mobile(){return 'mobile'}tablet(){return null}}",
        });
        return;
      }
      await route.fulfill({
        contentType: 'application/javascript',
        body: 'window.DOMPurify={sanitize:value=>value};',
      });
    });

    await page.route('https://h4p.kittycrow.dev/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/taxiCoverage.json')) {
        await route.fulfill({ json: [{ town: 'Aberdeen' }] });
        return;
      }
      if (url.pathname.endsWith('/calendar.json')) {
        await route.fulfill({ json: [] });
        return;
      }
      if (url.pathname.endsWith('/database/calendar')) {
        await route.fulfill({ json: { sha256: 'mobile-nav-test' } });
        return;
      }
      if (url.pathname.endsWith('/chat/stream')) {
        await route.fulfill({
          status: 200,
          headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
          body: 'data: []\n\n',
        });
        return;
      }
      if (url.pathname.endsWith('/chat/send')) {
        await route.fulfill({ json: {} });
        return;
      }
      await route.fulfill({ status: 404, body: '' });
    });

    await page.goto(new URL('/', baseUrl).href, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.site-nav a');
    await page.waitForSelector('#chat-panel-shell .chat-modal');
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(200);

    const layout = await page.evaluate(() => {
      const header = document.querySelector('.site-header');
      const nav = document.querySelector('.site-nav');
      const chat = document.querySelector('#chat-panel-shell');
      const links = Array.from(document.querySelectorAll('.site-nav a'));
      if (!(header instanceof HTMLElement)
        || !(nav instanceof HTMLElement)
        || !(chat instanceof HTMLElement)
        || links.some(link => !(link instanceof HTMLElement))) {
        return null;
      }

      const toBox = rect => ({
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      });

      return {
        header: toBox(header.getBoundingClientRect()),
        nav: toBox(nav.getBoundingClientRect()),
        chat: toBox(chat.getBoundingClientRect()),
        headerPosition: getComputedStyle(header).position,
        navPosition: getComputedStyle(nav).position,
        links: links.map(link => {
          const element = link;
          return {
            box: toBox(element.getBoundingClientRect()),
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
          };
        }),
      };
    });

    assert(layout, `Mobile layout elements must exist at ${width}px`);
    assert.equal(layout.headerPosition, 'sticky', `Header must remain sticky at ${width}px`);
    assert.equal(layout.navPosition, 'static', `Navigation must remain inside the header at ${width}px`);
    assert(Math.abs(layout.header.top) <= 1, `Header must remain pinned to the viewport top at ${width}px`);
    assert(layout.nav.top >= layout.header.top - 1, `Navigation must begin inside the header at ${width}px`);
    assert(layout.nav.bottom <= layout.header.bottom + 1, `Navigation must end inside the header at ${width}px`);
    assert.equal(layout.links.length, 4, `All four navigation pills must be present at ${width}px`);

    const firstTop = layout.links[0].box.top;
    for (const link of layout.links) {
      assert(Math.abs(link.box.top - firstTop) <= 1, `Navigation pills must remain on one row at ${width}px`);
      assert(link.box.left >= layout.nav.left - 1 && link.box.right <= layout.nav.right + 1,
        `Navigation pills must fit inside the navigation bar at ${width}px`);
      assert(link.scrollWidth <= link.clientWidth + 1,
        `Navigation pill text must fit without clipping at ${width}px`);
    }

    assert(!overlaps(layout.nav, layout.chat), `Chat launcher must not overlap navigation at ${width}px`);
    await context.close();
  }

  console.log('Mobile navigation regression checks passed.');
} finally {
  await browser.close();
}
