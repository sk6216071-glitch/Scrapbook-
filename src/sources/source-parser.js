import * as cheerio from 'cheerio';
import { parseMetadata } from '../parsing/metadata-parser.js';
import { resolveUrl } from '../utils/url.js';
import { detectChallenge } from '../parsing/html-parser.js';

/**
 * Parses source website pages (e.g. authorized TV/Movie catalog page)
 */
export function parseSourcePage(html, sourceUrl) {
  const challenge = detectChallenge(html);
  if (challenge) {
    return {
      isChallenge: true,
      challenge,
      title: null,
      year: null,
      season: null,
      links: []
    };
  }

  const $ = cheerio.load(html || '');

  // Extract page title or headline
  const pageHeading = $('h1.entry-title, h1, title').first().text().trim();
  const meta = parseMetadata(pageHeading);

  const candidateLinks = [];
  const seenUrls = new Set();

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim();
    if (!href || href.startsWith('javascript:') || href.startsWith('#')) return;

    // Filter out taxonomy and navigation archives
    if (/\/category\/|\/tag\/|\/genre\/|\/page\/|\/author\//i.test(href)) return;

    const resolved = resolveUrl(href, sourceUrl);
    if (!resolved || seenUrls.has(resolved)) return;
    if (/\/category\/|\/tag\/|\/genre\/|\/page\/|\/author\//i.test(resolved)) return;

    // Filter links that represent download buttons, episode links, or provider links
    const isDownloadOrEpisode =
      /download|episode|season|gdflix|hubcloud|file|link|drive|server|480p|720p|1080p|2160p/i.test(text) ||
      /download|file|link/i.test(resolved) ||
      $(el).hasClass('btn') ||
      $(el).hasClass('download-btn');

    if (isDownloadOrEpisode) {
      seenUrls.add(resolved);
      candidateLinks.push({
        url: resolved,
        text,
        quality: meta.quality,
        codec: meta.codec
      });
    }
  });

  let sourceDomain = '';
  try {
    sourceDomain = new URL(sourceUrl).hostname;
  } catch {
    sourceDomain = '';
  }

  return {
    isChallenge: false,
    challenge: null,
    sourceUrl,
    sourceDomain,
    title: meta.title || pageHeading,
    year: meta.year,
    season: meta.season,
    type: meta.type,
    links: candidateLinks
  };
}

export default { parseSourcePage };
