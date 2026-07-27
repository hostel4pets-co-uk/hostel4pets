import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [baseUrl, outputRoot, label] = process.argv.slice(2);

if (!baseUrl || !outputRoot || !label) {
  throw new Error('Usage: node scripts/capture-design.mjs <base-url> <output-dir> <label>');
}

const pages = [
  ['home', '/'],
  ['calendar', '/calendar.html'],
  ['chat', '/chat.html'],
  ['taxi', '/taxi.html'],
  ['day-view', '/dayView.html'],
];

const viewports = [
  ['desktop', { width: 1440, height: 1000 }],
  ['mobile', { width: 390, height: 844 }],
];

const escapeXml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

const browser = await chromium.launch({ headless: true });

try {
  for (const [viewportName, viewport] of viewports) {
    const context = await browser.newContext({
      viewport,
      colorScheme: 'light',
      reducedMotion: 'reduce',
      locale: 'en-GB',
      timezoneId: 'Europe/London',
    });

    for (const [pageName, pathname] of pages) {
      const target = new URL(pathname, baseUrl).href;
      const directory = path.join(outputRoot, label, viewportName, pageName);
      await mkdir(directory, { recursive: true });

      const page = await context.newPage();
      const consoleMessages = [];
      const pageErrors = [];
      const failedRequests = [];

      page.on('console', (message) => {
        consoleMessages.push({ type: message.type(), text: message.text() });
      });
      page.on('pageerror', (error) => pageErrors.push(error.message));
      page.on('requestfailed', (request) => {
        failedRequests.push({
          url: request.url(),
          failure: request.failure()?.errorText ?? 'unknown',
        });
      });

      const response = await page.goto(target, {
        waitUntil: 'domcontentloaded',
        timeout: 45_000,
      });
      await page.waitForTimeout(2_500);

      await page.screenshot({
        path: path.join(directory, 'page-light.png'),
        fullPage: true,
      });

      const themeToggle = page.locator('[data-theme-toggle], #theme-toggle').first();
      if (await themeToggle.count()) {
        await themeToggle.click();
        await page.waitForTimeout(500);
        await page.screenshot({
          path: path.join(directory, 'page-dark.png'),
          fullPage: true,
        });
      }

      const sanitisedHtml = await page.evaluate(() => {
        const clone = document.documentElement.cloneNode(true);
        clone.querySelectorAll('script, noscript').forEach((node) => node.remove());
        clone.querySelectorAll('input, textarea, select').forEach((element) => {
          element.removeAttribute('value');
          element.removeAttribute('autocomplete');
          if (element instanceof HTMLTextAreaElement) element.textContent = '';
          if (element instanceof HTMLSelectElement) {
            [...element.options].forEach((option) => option.removeAttribute('selected'));
          }
        });
        clone.querySelectorAll('[contenteditable]').forEach((element) => {
          element.textContent = '';
        });
        clone.querySelectorAll('a[href]').forEach((anchor) => {
          const href = anchor.getAttribute('href') ?? '';
          if (/^(mailto:|tel:)/i.test(href)) anchor.setAttribute('href', '[redacted]');
        });
        return '<!DOCTYPE html>\n' + clone.outerHTML;
      });

      const layoutNodes = await page.evaluate(() => {
        const candidates = [...document.body.querySelectorAll('*')];
        return candidates
          .filter((element) => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
          })
          .map((element) => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            const text = (element.childElementCount === 0 ? element.textContent : '')
              ?.replace(/\s+/g, ' ')
              .trim()
              .slice(0, 160) ?? '';
            return {
              tag: element.tagName.toLowerCase(),
              id: element.id,
              classes: [...element.classList].slice(0, 8),
              role: element.getAttribute('role') ?? '',
              label: element.getAttribute('aria-label') ?? '',
              text,
              box: {
                x: Math.round(rect.x),
                y: Math.round(rect.y),
                width: Math.round(rect.width),
                height: Math.round(rect.height),
              },
              style: {
                display: style.display,
                position: style.position,
                color: style.color,
                background: style.backgroundColor,
                font: style.font,
                borderRadius: style.borderRadius,
              },
            };
          });
      });

      const xml = [
        `<?xml version="1.0" encoding="UTF-8"?>`,
        `<layout page="${escapeXml(pageName)}" viewport="${escapeXml(viewportName)}" url="${escapeXml(target)}">`,
        ...layoutNodes.map((node) => [
          `  <node tag="${escapeXml(node.tag)}" id="${escapeXml(node.id)}" classes="${escapeXml(node.classes.join(' '))}" role="${escapeXml(node.role)}" label="${escapeXml(node.label)}">`,
          `    <box x="${node.box.x}" y="${node.box.y}" width="${node.box.width}" height="${node.box.height}" />`,
          `    <style display="${escapeXml(node.style.display)}" position="${escapeXml(node.style.position)}" color="${escapeXml(node.style.color)}" background="${escapeXml(node.style.background)}" font="${escapeXml(node.style.font)}" radius="${escapeXml(node.style.borderRadius)}" />`,
          node.text ? `    <text>${escapeXml(node.text)}</text>` : '',
          `  </node>`,
        ].filter(Boolean).join('\n')),
        `</layout>`,
        '',
      ].join('\n');

      let ariaSnapshot = '';
      try {
        ariaSnapshot = await page.locator('body').ariaSnapshot();
      } catch (error) {
        ariaSnapshot = `Accessibility snapshot unavailable: ${error.message}\n`;
      }

      const metadata = {
        label,
        page: pageName,
        url: target,
        viewport,
        status: response?.status() ?? null,
        title: await page.title(),
        documentTheme: await page.evaluate(() => document.documentElement.dataset.theme ?? ''),
        consoleMessages,
        pageErrors,
        failedRequests,
      };

      await Promise.all([
        writeFile(path.join(directory, 'page.sanitised.html'), sanitisedHtml),
        writeFile(path.join(directory, 'layout.xml'), xml),
        writeFile(path.join(directory, 'accessibility.yml'), ariaSnapshot),
        writeFile(path.join(directory, 'metadata.json'), JSON.stringify(metadata, null, 2) + '\n'),
      ]);

      await page.close();
    }

    await context.close();
  }
} finally {
  await browser.close();
}
