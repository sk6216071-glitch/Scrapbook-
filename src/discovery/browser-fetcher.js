import { detectChallenge } from '../parsing/html-parser.js';
import { fetchWithBackoff } from './http-client.js';
import logger from '../logging/logger.js';

let playwrightModule = null;

export async function fetchWithBrowser(url, options = {}) {
  try {
    if (!playwrightModule) {
      try {
        playwrightModule = await import('playwright');
      } catch (e) {
        logger.warn('BROWSER', `Playwright not available: ${e.message}. Using standard HTTP client.`);
      }
    }

    if (!playwrightModule?.chromium) {
      return await fetchWithBackoff(url, options);
    }

    const browser = await playwrightModule.chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: options.timeout || 15000 });
      const html = await page.content();

      const challenge = detectChallenge(html);
      if (challenge) {
        return {
          statusCode: 403,
          body: html,
          url,
          isChallenge: true,
          challenge
        };
      }

      return {
        statusCode: 200,
        body: html,
        url
      };
    } finally {
      await browser.close();
    }
  } catch (err) {
    logger.warn('BROWSER', `Browser fetch failed: ${err.message}. Falling back to HTTP client.`);
    return await fetchWithBackoff(url, options);
  }
}

export default { fetchWithBrowser };
