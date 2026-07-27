import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const [baseUrl = 'http://127.0.0.1:4173'] = process.argv.slice(2);
const viewport = { width: 390, height: 844 };

function belowOrEqual(first, second, tolerance = 1) {
  assert(first && second, 'Expected both elements to have layout boxes');
  return first.y + first.height <= second.y + tolerance;
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport,
    colorScheme: 'dark',
    locale: 'en-GB',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
  });

  await context.addInitScript(() => {
    localStorage.setItem('h4p.theme', 'dark');
    localStorage.setItem('chatSession', JSON.stringify({ sessionId: 'preview-session', nickname: 'Javier' }));
    localStorage.setItem('welcomeSent:preview-session', 'true');
    localStorage.setItem('chatCollapsed', 'true');
  });

  const page = await context.newPage();
  await page.route('**/generated/main.js', route => route.fulfill({ contentType: 'application/javascript', body: 'export {};' }));
  await page.route('**/generated/calendar.js', route => route.fulfill({ contentType: 'application/javascript', body: 'export {};' }));
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
      await route.fulfill({ json: [{ town: 'Aberdeen' }, { town: 'Dyce' }] });
      return;
    }
    if (url.pathname.endsWith('/taxi')) {
      await route.fulfill({ json: { price: 12.5 } });
      return;
    }
    if (url.pathname.endsWith('/calendar.json')) {
      await route.fulfill({ json: [] });
      return;
    }
    if (url.pathname.endsWith('/database/calendar')) {
      await route.fulfill({ json: { sha256: 'preview-test' } });
      return;
    }
    if (url.pathname.endsWith('/chat/send')) {
      await route.fulfill({ json: {} });
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
    await route.fulfill({ status: 404, body: '' });
  });

  page.setDefaultTimeout(5_000);
  await page.goto(new URL('/', baseUrl).href, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  // Exercise chat on its direct page. The booking page loads the same chat modal
  // asynchronously from chat.html, so this avoids coupling layout assertions to
  // the transport timing of that fetch while testing the identical component.
  const chatPage = await context.newPage();
  await chatPage.route('https://cdn.jsdelivr.net/**', async route => {
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
  await chatPage.route('https://h4p.kittycrow.dev/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/chat/send')) {
      await route.fulfill({ json: {} });
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
    await route.fulfill({ status: 404, body: '' });
  });
  chatPage.setDefaultTimeout(5_000);
  await chatPage.goto(new URL('/interface-test.html', baseUrl).href, { waitUntil: 'domcontentloaded' });
  const chatStylesheetUrl = new URL('/styles/styles.css', baseUrl).href;
  await chatPage.setContent(`<!DOCTYPE html><html data-theme="dark"><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"><link rel="stylesheet" href="${chatStylesheetUrl}"></head><body class="chat-page"><div id="chat-panel-shell" class="standalone-chat-shell"><div class="chat-modal"><header class="chat-header"><span class="chat-header__avatar"></span><span class="title">Chat</span><div id="chat-controls"><button id="mute-btn" class="emoji-btn" type="button">🔕</button><button id="clear-btn" class="emoji-btn" type="button">×</button><button id="collapse-btn" class="emoji-btn" type="button">−</button></div></header><main class="chat-body"><div id="chatroom"></div><div id="message" contenteditable="true" data-placeholder="Type your message here"></div></main><footer class="chat-footer"><input id="nickname" hidden><button id="submit-button" hidden>Start chat</button><button id="send-button">Send message</button></footer></div></div></body></html>`, { waitUntil: 'load' });
  await chatPage.evaluate(async moduleUrl => {
    window.md = { mobile: () => 'mobile', tablet: () => null };
    window.DOMPurify = { sanitize: value => value };
    const { ChatApp } = await import(moduleUrl);
    window.ChatApp = ChatApp;
    window.chatApp = new ChatApp();
  }, new URL('/generated/chat.js', baseUrl).href);
  await chatPage.waitForFunction(() => Boolean(window.chatApp));
  await chatPage.waitForTimeout(250);

  const startChat = chatPage.locator('#submit-button');
  assert.equal(await startChat.getAttribute('hidden') !== null, true, 'Started chat must keep Start chat hidden');
  assert.equal(await startChat.evaluate(element => getComputedStyle(element).display), 'none', 'Hidden Start chat must not occupy layout space');

  const chatModal = chatPage.locator('.chat-modal');
  assert((await chatModal.getAttribute('class') ?? '').includes('collapsed'), 'Chat should begin collapsed from saved preference');
  await chatPage.locator('.chat-header').click({ position: { x: 120, y: 20 } });
  await chatPage.waitForTimeout(250);
  assert(!(await chatModal.getAttribute('class') ?? '').includes('collapsed'), 'Clicking the chat header must expand the panel');

  await chatPage.evaluate(() => {
    const room = document.querySelector('#chatroom');
    if (!room) return;
    for (let index = 1; index <= 8; index += 1) {
      const wrapper = document.createElement('div');
      wrapper.className = 'message-wrapper host show';
      wrapper.innerHTML = `<div class="message host"><div class="nickname-strip">Robin - Hostel4Pets</div><div class="message-text">Test message ${index} with enough content to wrap across lines.</div></div><div class="timestamp host">2026.07.27 11:54</div>`;
      room.appendChild(wrapper);
    }
  });

  const chatroomBox = await chatPage.locator('#chatroom').boundingBox();
  const messageBox = await chatPage.locator('#message').boundingBox();
  const footerBox = await chatPage.locator('.chat-footer').boundingBox();
  assert(belowOrEqual(chatroomBox, messageBox), 'Chat messages must end before the composer begins');
  assert(belowOrEqual(messageBox, footerBox), 'Composer must end before chat actions begin');

  const formSection = await page.locator('.form-section').first().boundingBox();
  assert(formSection, 'Booking form section must be visible');
  for (const selector of ['#checkInDate', '#checkInTime', '#checkOutDate', '#checkOutTime']) {
    const box = await page.locator(selector).boundingBox();
    assert(box, `${selector} must be visible`);
    assert(box.x >= formSection.x - 1, `${selector} must not bleed past the left edge`);
    assert(box.x + box.width <= formSection.x + formSection.width + 1, `${selector} must not bleed past the right edge`);
  }

  const calendarPage = await context.newPage();
  const stylesheetUrl = new URL('/styles/styles.css', baseUrl).href;
  await calendarPage.setContent(`<!DOCTYPE html><html data-theme="dark"><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"><link rel="stylesheet" href="${stylesheetUrl}"></head><body><div id="calendar-container" class="calendar-container"><table id="Calendar" class="calendar"><tbody><tr>${Array.from({ length: 7 }, (_, index) => `<td>${index + 1}</td>`).join('')}</tr></tbody></table></div></body></html>`, { waitUntil: 'load' });
  await calendarPage.waitForTimeout(150);
  const calendarBox = await calendarPage.locator('#calendar-container').boundingBox();
  const tableBox = await calendarPage.locator('#Calendar').boundingBox();
  assert(calendarBox && tableBox, 'Calendar must be visible');
  assert(tableBox.width <= calendarBox.width + 1, 'Calendar must fit without horizontal scrolling');
  await calendarPage.close();

  await page.fill('#checkInDate', '2026-08-01');
  await page.fill('#checkInTime', '08:00');
  await page.fill('#checkOutDate', '2026-08-03');
  await page.fill('#checkOutTime', '10:00');
  await page.click('#calculateButton');
  await page.waitForTimeout(150);

  const breakdownMetrics = await page.locator('#priceBreakdown').evaluate(element => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    overflow: getComputedStyle(element).overflowY,
    resize: getComputedStyle(element).resize,
  }));
  assert(breakdownMetrics.scrollHeight <= breakdownMetrics.clientHeight + 2, 'Price breakdown must auto-fit its content');
  assert.equal(breakdownMetrics.overflow, 'hidden', 'Price breakdown must not show an internal scrollbar');
  assert.equal(breakdownMetrics.resize, 'none', 'Price breakdown must not require manual resizing');

  const taxiSection = page.locator('#pet-taxi');
  assert.equal(await taxiSection.evaluate(element => element instanceof HTMLDetailsElement && !element.open), true, 'Pet taxi should begin as an optional collapsed booking step');
  await page.locator('#pet-taxi > summary').click();
  await page.waitForTimeout(150);
  assert.equal(await taxiSection.evaluate(element => element instanceof HTMLDetailsElement && element.open), true, 'Pet taxi must expand within the booking flow');
  const taxiBox = await taxiSection.boundingBox();
  const bookingBox = await page.locator('#booking-form').boundingBox();
  assert(taxiBox && bookingBox && taxiBox.x >= bookingBox.x - 1 && taxiBox.x + taxiBox.width <= bookingBox.x + bookingBox.width + 1, 'Expanded taxi form must remain inside the booking calculator');
  await page.selectOption('#pickupLocation', 'Aberdeen');
  await page.click('#taxiSubmit');
  await page.waitForFunction(() => document.querySelector('#taxi-result')?.textContent?.includes('added'));
  assert((await page.inputValue('#priceBreakdown')).includes('PET TAXI'), 'Taxi price must be included in the price breakdown');

  assert.equal(await page.locator('[data-current-year]').first().textContent(), String(new Date().getFullYear()), 'Footer year must update automatically');

  const dayPage = await context.newPage();
  await dayPage.route('https://cdn.jsdelivr.net/**', route => route.fulfill({ contentType: 'application/javascript', body: 'window.DOMPurify={sanitize:value=>value}; class MobileDetect{mobile(){return null}tablet(){return null}}' }));
  await dayPage.route('https://h4p.kittycrow.dev/**', route => route.fulfill({ json: [] }));
  await dayPage.route('https://en.wikipedia.org/**', route => route.fulfill({ json: { query: { search: [], pages: {} } } }));
  await dayPage.goto(new URL('/dayView.html?d=20260727', baseUrl).href, { waitUntil: 'domcontentloaded' });
  await dayPage.waitForSelector('#pet-list');
  await dayPage.evaluate(() => {
    const list = document.querySelector('#pet-list');
    if (!list) return;
    list.innerHTML = '';
    for (let index = 1; index <= 18; index += 1) {
      const item = document.createElement('li');
      item.className = 'pet-item';
      item.innerHTML = `<div class="guest-num">Guest ${index}</div><div class="detail name">Name: Pet ${index}</div><div class="detail species">Species: Dog</div><div class="detail breed">Breed: Labrador</div>`;
      list.appendChild(item);
    }
  });
  const dayModal = await dayPage.locator('#day-modal .modal-content').boundingBox();
  assert(dayModal && dayModal.height <= viewport.height, 'Day view must remain within the viewport');
  const dayList = await dayPage.locator('#pet-list').evaluate(element => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    overflow: getComputedStyle(element).overflowY,
  }));
  assert(dayList.clientHeight > 0, 'Day list must receive visible space');
  assert(['auto', 'scroll'].includes(dayList.overflow), 'Long day lists must remain scrollable');

  console.log('Interface regression checks passed.');
} finally {
  await browser.close();
}
