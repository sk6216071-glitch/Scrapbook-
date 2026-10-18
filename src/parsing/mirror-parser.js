import * as cheerio from 'cheerio';
import { resolveUrl } from '../utils/url.js';

/**
 * Classify mirror link type based on URL or text
 */
export function classifyMirrorType(url, text = '') {
  const lower = `${url} ${text}`.toLowerCase();
  if (lower.includes('torrent') || lower.includes('.torrent') || lower.startsWith('magnet:')) {
    return 'torrent';
  }
  if (lower.includes('drive.google') || lower.includes('onedrive') || lower.includes('mega.nz') || lower.includes('dropbox')) {
    return 'cloud';
  }
  if (lower.includes('direct') || lower.includes('fast') || lower.includes('instant') || lower.includes('download')) {
    return 'direct';
  }
  return 'mirror';
}

/**
 * Extracts mirror links from HTML page
 */
export function parseMirrors(html, baseUrl) {
  if (!html) return [];
  const $ = cheerio.load(html);
  const mirrors = [];
  const seenUrls = new Set();

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim();
    const className = $(el).attr('class') || '';

    if (!href || href.startsWith('javascript:') || href.startsWith('#')) return;

    const resolved = resolveUrl(href, baseUrl);
    if (!resolved || seenUrls.has(resolved)) return;

    // Check if link looks like a mirror or download button
    const isMirror =
      /mirror|download|direct|server|fast|stream|cloud|link/i.test(text) ||
      /mirror|btn-download|download-btn/i.test(className) ||
      /download|file|mirror/i.test(resolved);

    if (isMirror) {
      seenUrls.add(resolved);
      mirrors.push({
        name: text || `Mirror ${mirrors.length + 1}`,
        url: resolved,
        type: classifyMirrorType(resolved, text)
      });
    }
  });

  return mirrors;
}
