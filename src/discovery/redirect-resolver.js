import { fetchWithBackoff } from './http-client.js';
import { validateUrl, resolveUrl } from '../utils/url.js';
import { parseHtml } from '../parsing/html-parser.js';
import config from '../config/config.js';
import logger from '../logging/logger.js';

/**
 * Resolves full redirect chains with SSRF defense and loop detection
 */
export async function resolveRedirects(initialUrl, options = {}) {
  const maxRedirects = options.maxRedirects ?? config.maxRedirects;
  const redirectChain = [];
  const seenUrls = new Set();

  let currentUrl = initialUrl;
  let response = null;

  while (redirectChain.length <= maxRedirects) {
    if (seenUrls.has(currentUrl)) {
      return {
        finalUrl: currentUrl,
        statusCode: response?.statusCode || 302,
        body: response?.body || '',
        redirectChain,
        status: 'REDIRECT_LIMIT_EXCEEDED',
        error: `Circular redirect loop detected on: ${currentUrl}`
      };
    }

    seenUrls.add(currentUrl);

    // SSRF verification before each network request
    const validation = await validateUrl(currentUrl);
    if (!validation.valid) {
      logger.warn('SSRF', `Blocked navigation to ${currentUrl}: ${validation.error}`);
      return {
        finalUrl: currentUrl,
        statusCode: 403,
        body: '',
        redirectChain,
        status: 'ACCESS_DENIED',
        error: validation.error
      };
    }

    try {
      response = await fetchWithBackoff(currentUrl, options);
    } catch (err) {
      if (err.name === 'AbortError' || err.code === 'UND_ERR_HEADERS_TIMEOUT' || err.code === 'ETIMEDOUT') {
        return {
          finalUrl: currentUrl,
          statusCode: 504,
          body: '',
          redirectChain,
          status: 'TIMEOUT',
          error: err.message
        };
      }
      return {
        finalUrl: currentUrl,
        statusCode: 500,
        body: '',
        redirectChain,
        status: 'ERROR',
        error: err.message
      };
    }

    // Check HTTP status code for redirects
    const statusCode = response.statusCode;
    if ([301, 302, 303, 307, 308].includes(statusCode)) {
      const location = response.headers.location;
      if (!location) {
        break; // Redirect status without Location header
      }

      redirectChain.push(currentUrl);
      const nextUrl = resolveUrl(location, currentUrl);
      if (!nextUrl) {
        return {
          finalUrl: currentUrl,
          statusCode,
          body: response.body,
          redirectChain,
          status: 'ERROR',
          error: `Malformed Location header: ${location}`
        };
      }

      currentUrl = nextUrl;
      continue;
    }

    // Check meta refresh on 200 OK
    if (statusCode === 200 && response.body) {
      const parsed = parseHtml(response.body, currentUrl);
      if (parsed.metaRefresh && parsed.metaRefresh !== currentUrl) {
        redirectChain.push(currentUrl);
        currentUrl = parsed.metaRefresh;
        continue;
      }
    }

    // Reached final non-redirect destination
    break;
  }

  if (redirectChain.length > maxRedirects) {
    return {
      finalUrl: currentUrl,
      statusCode: response?.statusCode || 302,
      body: response?.body || '',
      redirectChain,
      status: 'REDIRECT_LIMIT_EXCEEDED',
      error: `Exceeded maximum redirect depth of ${maxRedirects}`
    };
  }

  return {
    finalUrl: currentUrl,
    statusCode: response?.statusCode || 200,
    body: response?.body || '',
    redirectChain,
    status: response?.statusCode === 404 ? 'NOT_FOUND' : 'RESOLVED',
    error: null
  };
}

export default { resolveRedirects };
