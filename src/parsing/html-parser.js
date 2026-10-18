import * as cheerio from 'cheerio';
import { resolveUrl } from '../utils/url.js';

/**
 * Detects bot/human verification challenges (Turnstile, Cloudflare, CAPTCHA)
 */
export function detectChallenge(html) {
  if (!html || typeof html !== 'string') return null;

  const lower = html.toLowerCase();

  const challengeIndicators = [
    'cf-turnstile',
    'challenges.cloudflare.com',
    'cf-challenge',
    'cf-browser-verification',
    'just a moment...',
    'attention required! | cloudflare',
    'verify you are human',
    'cf_chl_prog',
    'hcaptcha',
    'g-recaptcha',
    'recaptcha/api.js'
  ];

  const found = challengeIndicators.some(indicator => lower.includes(indicator));
  if (found) {
    return {
      isChallenge: true,
      status: 'HUMAN_VERIFICATION_REQUIRED',
      message: 'Manual verification required.'
    };
  }

  return null;
}

/**
 * Parse an HTML document with Cheerio and extract standard navigation elements
 */
export function parseHtml(html, baseUrl) {
  const challenge = detectChallenge(html);
  if (challenge) {
    return {
      isChallenge: true,
      challenge,
      title: '',
      links: [],
      forms: [],
      metaRefresh: null,
      canonical: null,
      embeddedJson: []
    };
  }

  const $ = cheerio.load(html || '');

  const title = $('title').first().text().trim();

  // Extract meta refresh
  let metaRefresh = null;
  const refreshTag = $('meta[http-equiv="refresh" i]').attr('content');
  if (refreshTag) {
    const match = refreshTag.match(/url=['"]?([^'">]+)['"]?/i);
    if (match && match[1]) {
      metaRefresh = resolveUrl(match[1].trim(), baseUrl);
    }
  }

  // Extract canonical URL
  let canonical = null;
  const canonicalHref = $('link[rel="canonical"]').attr('href');
  if (canonicalHref) {
    canonical = resolveUrl(canonicalHref.trim(), baseUrl);
  }

  // Extract links
  const links = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (href && !href.startsWith('javascript:') && !href.startsWith('#')) {
      const resolved = resolveUrl(href.trim(), baseUrl);
      if (resolved) {
        links.push({
          url: resolved,
          text: $(el).text().trim(),
          class: $(el).attr('class') || '',
          id: $(el).attr('id') || '',
          rel: $(el).attr('rel') || ''
        });
      }
    }
  });

  // Extract forms
  const forms = [];
  $('form').each((_, el) => {
    const action = $(el).attr('action') || '';
    const resolvedAction = resolveUrl(action, baseUrl) || baseUrl;
    const method = ($(el).attr('method') || 'GET').toUpperCase();
    const inputs = {};
    $(el).find('input').each((_, input) => {
      const name = $(input).attr('name');
      const val = $(input).attr('value') || '';
      if (name) inputs[name] = val;
    });

    forms.push({
      action: resolvedAction,
      method,
      inputs
    });
  });

  // Extract embedded JSON
  const embeddedJson = [];
  $('script[type="application/json"], script[type="application/ld+json"]').each((_, el) => {
    try {
      const content = $(el).html();
      if (content) {
        embeddedJson.push(JSON.parse(content.trim()));
      }
    } catch {
      // Ignore malformed JSON scripts
    }
  });

  return {
    isChallenge: false,
    challenge: null,
    $,
    title,
    links,
    forms,
    metaRefresh,
    canonical,
    embeddedJson
  };
}
