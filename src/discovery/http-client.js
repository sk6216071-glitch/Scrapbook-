import { request } from 'undici';
import config from '../config/config.js';
import logger from '../logging/logger.js';

/**
 * Sleep helper for backoff
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Robust HTTP client with exponential backoff and timeout controls
 */
export async function fetchWithBackoff(url, options = {}) {
  const maxRetries = options.maxRetries ?? config.maxRetries;
  const timeout = options.timeout ?? config.requestTimeout;
  const userAgent = options.userAgent ?? config.userAgent;
  const method = (options.method || 'GET').toUpperCase();
  const headers = {
    'User-Agent': userAgent,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    ...(options.headers || {})
  };

  let attempt = 0;
  let lastError = null;

  while (attempt <= maxRetries) {
    try {
      const response = await request(url, {
        method,
        headers,
        body: options.body,
        headersTimeout: timeout,
        bodyTimeout: timeout,
        maxRedirections: 0 // Handle redirects manually for SSRF and loop detection
      });

      const body = await response.body.text();

      // Retry on 429 and transient 5xx server errors
      if ([429, 500, 502, 503, 504].includes(response.statusCode) && attempt < maxRetries) {
        attempt++;
        const backoffMs = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 200, 10000);
        logger.warn('HTTP', `Transient HTTP ${response.statusCode} from ${url}. Retrying in ${Math.round(backoffMs)}ms (attempt ${attempt}/${maxRetries})`);
        await sleep(backoffMs);
        continue;
      }

      return {
        statusCode: response.statusCode,
        headers: response.headers,
        body,
        url
      };
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        attempt++;
        const backoffMs = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 200, 10000);
        logger.warn('HTTP', `Request error to ${url}: ${err.message}. Retrying in ${Math.round(backoffMs)}ms (attempt ${attempt}/${maxRetries})`);
        await sleep(backoffMs);
      } else {
        break;
      }
    }
  }

  throw lastError;
}

export default { fetchWithBackoff };
