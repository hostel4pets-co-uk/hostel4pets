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

  assert.equal(await page.locator('#book').count(), 1, 'Book navigation must target the #book section');
  assert.equal(await page.locator('.trust-list').count(), 0, 'Removed marketing labels must not remain on the booking page');
  assert.equal(await page.locator('.site-nav a[href="/chat"]').count(), 1, 'Primary navigation must include the clean chat route');

  const mobileHeader = await page.locator('.site-header').boundingBox();
  const mobileNav = await page.locator('.site-nav').boundingBox();
  const mobileNavLinks = await page.locator('.site-nav a').evaluateAll(links => links.map(link => {
    const box = link.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  }));
  assert(mobileHeader && mobileNav, 'Mobile header and navigation must have layout boxes');
  assert.equal(mobileNavLinks.length, 4, 'Mobile navigation must contain four links');
  assert(mobileNav.y >= mobileHeader.y - 1, 'Mobile navigation must remain inside the sticky header');
  assert(mobileNav.y + mobileNav.height <= mobileHeader.y + mobileHeader.height + 1, 'Mobile navigation must fit inside the sticky header');
  const navRowY = mobileNavLinks[0]?.y;
  assert(navRowY !== undefined, 'Mobile navigation links must be visible');
  for (const link of mobileNavLinks) {
    assert(Math.abs(link.y - navRowY) <= 1, 'All mobile navigation links must remain on one row');
    assert(link.x >= mobileNav.x - 1, 'Mobile navigation link must remain inside the navigation left edge');
    assert(link.x + link.width <= mobileNav.x + mobileNav.width + 1, 'Mobile navigation link must remain inside the navigation right edge');
  }

  await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.id = 'chat-panel-shell';
    probe.innerHTML = '<div class="chat-modal collapsed"><header class="chat-header"><span class="chat-header__avatar"></span><span class="title">New Message!</span><div id="chat-controls"><button id="collapse-btn" class="emoji-btn" type="button">+</button></div></header></div>';
    document.body.append(probe);
  });
  const launcherBox = await page.locator('#chat-panel-shell').boundingBox();
  const launcherZ = await page.locator('#chat-panel-shell').evaluate(element => Number.parseInt(getComputedStyle(element).zIndex, 10));
  const headerZ = await page.locator('.site-header').evaluate(element => Number.parseInt(getComputedStyle(element).zIndex, 10));
  assert(launcherBox, 'Collapsed chat launcher must have a layout box');
  const overlapsNavigation = !(
    launcherBox.y + launcherBox.height <= mobileNav.y
    || mobileNav.y + mobileNav.height <= launcherBox.y
    || launcherBox.x + launcherBox.width <= mobileNav.x
    || mobileNav.x + mobileNav.width <= launcherBox.x
  );
  assert.equal(overlapsNavigation, false, 'Collapsed chat launcher must not overlap mobile navigation');
  assert(headerZ > launcherZ, 'Sticky mobile header must remain above the floating chat launcher');
  await page.locator('#chat-panel-shell').evaluate(element => element.remove());

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
  await page.waitForTimeout(100);
  const pinnedHeader = await page.locator('.site-header').boundingBox();
  assert(pinnedHeader && pinnedHeader.y <= 1, 'Mobile navigation header must stay pinned to the top while scrolling');
  await page.evaluate(() => window.scrollTo(0, 0));

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
  const chatShell = chatPage.locator('#chat-panel-shell');
  assert((await chatModal.getAttribute('class') ?? '').includes('collapsed'), 'Chat should begin collapsed from saved preference');
  await chatPage.locator('.chat-header').click({ position: { x: 120, y: 20 } });
  await chatPage.waitForTimeout(250);
  assert(!(await chatModal.getAttribute('class') ?? '').includes('collapsed'), 'Clicking the chat header must expand the panel');
  assert((await chatShell.getAttribute('class') ?? '').includes('is-expanded'), 'Expanded chat must update the shell state');
  const expandedBody = await chatPage.locator('.chat-body').boundingBox();
  const expandedHeader = await chatPage.locator('.chat-header').boundingBox();
  assert(expandedBody && expandedHeader && expandedBody.height > expandedHeader.height, 'Expanded chat must reveal its body, not only widen the launcher');

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

  // Starting a new chat must reveal the session immediately even when the welcome
  // request is slow. This also exercises the complete standalone interface module,
  // which previously entered a silent MutationObserver loop after session creation.
  const startContext = await browser.newContext({
    viewport,
    colorScheme: 'dark',
    locale: 'en-GB',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
  });
  await startContext.addInitScript(() => {
    localStorage.setItem('h4p.theme', 'dark');
    localStorage.setItem('chatCollapsed', 'true');
    localStorage.removeItem('chatSession');
  });
  const startPage = await startContext.newPage();
  await startPage.route('https://cdn.jsdelivr.net/**', async route => {
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
  await startPage.route('https://h4p.kittycrow.dev/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/chat/send')) {
      await new Promise(resolve => setTimeout(resolve, 3_000));
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
  startPage.setDefaultTimeout(5_000);
  await startPage.goto(new URL('/chat', baseUrl).href, { waitUntil: 'domcontentloaded' });
  await startPage.waitForFunction(() => Boolean(window.chatApp));
  assert.equal(new URL(startPage.url()).pathname, '/chat', 'GitHub Pages chat directory must present the clean /chat URL');
  const fixedModal = startPage.locator('.chat-modal');
  const fixedShell = startPage.locator('#chat-panel-shell');
  assert(!(await fixedModal.getAttribute('class') ?? '').includes('collapsed'), 'Standalone chat must ignore a stored collapsed preference');
  assert((await fixedShell.getAttribute('class') ?? '').includes('is-expanded'), 'Standalone chat must always use the expanded shell');
  assert.equal(await startPage.locator('#collapse-btn').isHidden(), true, 'Standalone chat must not expose a collapse control');
  await startPage.locator('.chat-header').click({ position: { x: 120, y: 20 } });
  assert(!(await fixedModal.getAttribute('class') ?? '').includes('collapsed'), 'Standalone chat header clicks must not collapse the page');
  assert.equal(await startPage.evaluate(() => localStorage.getItem('chatCollapsed')), 'true', 'Standalone chat must not overwrite the embedded chat preference');
  await startPage.locator('#nickname').fill('Javier');
  await startPage.locator('#submit-button').click();
  await startPage.waitForFunction(() => {
    const send = document.querySelector('#send-button');
    const submit = document.querySelector('#submit-button');
    return Boolean(localStorage.getItem('chatSession'))
      && send instanceof HTMLElement
      && getComputedStyle(send).display !== 'none'
      && submit instanceof HTMLElement
      && submit.hidden;
  }, undefined, { timeout: 1_500 });
  assert((await startPage.locator('#chat-panel-shell').getAttribute('class') ?? '').includes('has-session'), 'Starting chat must synchronise the shell session state');
  assert.equal(await startPage.evaluate(() => document.readyState), 'complete', 'Starting chat must not freeze the page lifecycle');
  await startContext.close();

  const formSection = await page.locator('.form-section').first().boundingBox();
  assert(formSection, 'Booking form section must be visible');
  for (const selector of ['#checkInDate', '#checkInTime', '#checkOutDate', '#checkOutTime']) {
    const box = await page.locator(selector).boundingBox();
    assert(box, `${selector} must be visible`);
    assert(box.x >= formSection.x - 1, `${selector} must not bleed past the left edge`);
    assert(box.x + box.width <= formSection.x + formSection.width + 1, `${selector} must not bleed past the right edge`);
  }

  const calendarPage = await context.newPage();
  await calendarPage.route('https://h4p.kittycrow.dev/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/calendar.json')) {
      await route.fulfill({ json: [] });
      return;
    }
    if (url.pathname.endsWith('/database/calendar')) {
      await route.fulfill({ json: { sha256: 'full-calendar-test' } });
      return;
    }
    await route.fulfill({ status: 404, body: '' });
  });
  await calendarPage.route('https://www.gov.uk/bank-holidays.json**', route => route.fulfill({
    json: {
      scotland: { events: [] },
      'england-and-wales': { events: [] },
    },
  }));
  await calendarPage.goto(new URL('/calendar', baseUrl).href, { waitUntil: 'domcontentloaded' });
  assert.equal(new URL(calendarPage.url()).pathname, '/calendar', 'GitHub Pages calendar directory must present the clean /calendar URL');
  await calendarPage.waitForSelector('#Calendar');
  const calendarBox = await calendarPage.locator('#calendar-container').boundingBox();
  const tableBox = await calendarPage.locator('#Calendar').boundingBox();
  assert(calendarBox && tableBox, 'Full calendar page must initialise its calendar');
  assert(tableBox.width <= calendarBox.width + 1, 'Calendar must fit without horizontal scrolling');
  assert.equal(await calendarPage.locator('#Calendar tbody td[data-date]').count() > 0, true, 'Full calendar page must render dated cells');
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
  const differentLocation = page.locator('label[for="sameLocation"]');
  assert.equal(await differentLocation.isVisible(), true, 'Different drop-off location control must show its label');
  assert.match(await differentLocation.innerText(), /Drop-off location different from pickup location/, 'Different drop-off location label must be explicit');
  const differentLocationBox = await differentLocation.boundingBox();
  const differentLocationCheckboxBox = await page.locator('#sameLocation').boundingBox();
  assert(differentLocationBox && differentLocationCheckboxBox
    && differentLocationCheckboxBox.x >= differentLocationBox.x
    && differentLocationCheckboxBox.x + differentLocationCheckboxBox.width <= differentLocationBox.x + differentLocationBox.width,
  'Different drop-off checkbox must remain inside its labelled row');
  const taxiBox = await taxiSection.boundingBox();
  const bookingBox = await page.locator('#booking-form').boundingBox();
  assert(taxiBox && bookingBox && taxiBox.x >= bookingBox.x - 1 && taxiBox.x + taxiBox.width <= bookingBox.x + bookingBox.width + 1, 'Expanded taxi form must remain inside the booking calculator');
  await page.selectOption('#pickupLocation', 'Aberdeen');
  await page.click('#taxiSubmit');
  await page.waitForFunction(() => document.querySelector('#taxi-result')?.textContent?.includes('added'));
  assert((await page.inputValue('#priceBreakdown')).includes('PET TAXI'), 'Taxi price must be included in the price breakdown');
  assert.equal(await page.locator('#taxiRemove').isVisible(), true, 'Added taxi charge must expose a remove action');
  const totalWithTaxi = Number((await page.inputValue('#totalPrice')).replace(/[^0-9.]/g, ''));
  await page.click('#taxiRemove');
  await page.waitForFunction(() => document.querySelector('#taxi-result')?.textContent?.includes('removed'));
  assert(!(await page.inputValue('#priceBreakdown')).includes('PET TAXI'), 'Removing taxi must remove it from the price breakdown');
  const totalWithoutTaxi = Number((await page.inputValue('#totalPrice')).replace(/[^0-9.]/g, ''));
  assert.equal(Number((totalWithTaxi - totalWithoutTaxi).toFixed(2)), 12.5, 'Removing taxi must restore the stay-only total');
  assert.equal(await page.locator('#taxiRemove').isHidden(), true, 'Remove taxi action must hide when no taxi is applied');
  assert.equal(await page.locator('#taxi-summary-status').textContent(), 'Optional', 'Taxi summary must return to its optional state');

  await page.setViewportSize({ width: 320, height: 844 });
  await page.waitForTimeout(150);
  const overflowControls = await page.locator('#booking-form').evaluate(form => {
    const selectors = 'input:not([type="hidden"]), select, textarea, button';
    return Array.from(form.querySelectorAll(selectors)).flatMap(control => {
      if (!(control instanceof HTMLElement) || control.offsetParent === null) return [];
      const boundary = control.closest('.form-section, .booking-extra__body, .taxi-subsection') ?? form;
      const controlBox = control.getBoundingClientRect();
      const boundaryBox = boundary.getBoundingClientRect();
      const fits = controlBox.left >= boundaryBox.left - 1
        && controlBox.right <= boundaryBox.right + 1;
      return fits ? [] : [control.id || control.tagName.toLowerCase()];
    });
  });
  assert.deepEqual(overflowControls, [], `Visible booking controls must not overflow their section: ${overflowControls.join(', ')}`);
  await page.setViewportSize(viewport);

  await page.selectOption('#numOfPets', '2');
  await page.waitForSelector('#neutered2');
  await page.selectOption('#neutered1', 'no');
  await page.check('#sameLocation');
  await page.selectOption('#pickupLocation', 'Dyce');
  await page.selectOption('#dropoffLocation', 'Aberdeen');
  await page.waitForTimeout(150);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#pickupLocation')?.value === 'Dyce');
  assert.equal(await page.inputValue('#checkInDate'), '2026-08-01', 'Check-in date must survive a page revisit');
  assert.equal(await page.inputValue('#checkInTime'), '08:00', 'Check-in time must survive a page revisit');
  assert.equal(await page.inputValue('#checkOutDate'), '2026-08-03', 'Check-out date must survive a page revisit');
  assert.equal(await page.inputValue('#checkOutTime'), '10:00', 'Check-out time must survive a page revisit');
  assert.equal(await page.inputValue('#numOfPets'), '2', 'Pet count must survive a page revisit');
  assert.equal(await page.inputValue('#neutered1'), 'no', 'Dynamic pet selections must survive a page revisit');
  assert.equal(await page.locator('#pet-taxi').evaluate(element => element instanceof HTMLDetailsElement && element.open), true, 'Expanded taxi step must survive a page revisit');
  assert.equal(await page.isChecked('#sameLocation'), true, 'Different drop-off selection must survive a page revisit');
  assert.equal(await page.inputValue('#pickupLocation'), 'Dyce', 'Pickup location must survive a page revisit');
  assert.equal(await page.inputValue('#dropoffLocation'), 'Aberdeen', 'Drop-off location must survive a page revisit');

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
