import { normalizeQuality, normalizeCodec } from '../utils/normalize.js';

/**
 * Extracts structured metadata from release names, filenames, or page titles
 */
export function parseMetadata(filenameOrTitle) {
  if (!filenameOrTitle || typeof filenameOrTitle !== 'string') {
    return {
      title: null,
      year: null,
      type: 'movie',
      season: null,
      episode: null,
      quality: null,
      codec: null,
      format: null,
    };
  }

  const raw = filenameOrTitle.trim();

  // Extract file extension
  let format = null;
  const extMatch = raw.match(/\.([a-zA-Z0-9]{2,4})$/);
  if (extMatch) {
    format = extMatch[1].toLowerCase();
  }

  // Detect Season and Episode (e.g. S01E02 or s1e2)
  let season = null;
  let episode = null;
  let type = 'movie';

  const sEpMatch = raw.match(/(?:[._\s\-(]|^)s(\d{1,2})[._\s\-]*e(\d{1,3})(?:[._\s\-)\]]|$)/i);
  if (sEpMatch) {
    season = parseInt(sEpMatch[1], 10);
    episode = parseInt(sEpMatch[2], 10);
    type = 'tv';
  } else {
    const sMatch = raw.match(/(?:[._\s\-(]|^)s(\d{1,2})(?:[._\s\-)\]]|$)/i) ||
                   raw.match(/Season\s*(\d{1,2})/i);
    if (sMatch) {
      season = parseInt(sMatch[1], 10);
      type = 'tv';
    }

    const eMatch = raw.match(/(?:[._\s\-(]|^)e(\d{1,3})(?:[._\s\-)\]]|$)/i) ||
                   raw.match(/Episode\s*(\d{1,3})/i);
    if (eMatch) {
      episode = parseInt(eMatch[1], 10);
      type = 'tv';
    }
  }

  // Detect Year (1900 - 2099)
  let year = null;
  const yearMatch = raw.match(/(?:[._\s\-(])(19\d\d|20\d\d)(?:[._\s\-)])/);
  if (yearMatch) {
    year = parseInt(yearMatch[1], 10);
  }

  // Detect Quality
  let quality = null;
  const qMatch = raw.match(/(2160p|4k|uhd|1080p|fhd|720p|hd|480p|sd)/i);
  if (qMatch) {
    quality = normalizeQuality(qMatch[1]);
  }

  // Detect Codec
  let codec = null;
  const cMatch = raw.match(/(x265|h\.?265|hevc|x264|h\.?264|avc|av1)/i);
  if (cMatch) {
    codec = normalizeCodec(cMatch[1]);
  }

  // Extract clean Title
  let title = raw;
  if (format) {
    title = title.slice(0, -(format.length + 1));
  }

  const tokens = title.split(/[._]/);
  const cleanTokens = [];

  for (const token of tokens) {
    const t = token.trim();
    if (!t) continue;

    if (
      /^(19\d\d|20\d\d)$/.test(t) ||
      /^s\d{1,2}/i.test(t) ||
      /^season/i.test(t) ||
      /^e\d{1,3}/i.test(t) ||
      /^(2160p|1080p|720p|480p|4k)$/i.test(t) ||
      /^(web-?dl|bluray|hdrip|brrip|hdtv)$/i.test(t) ||
      /^(x264|x265|h264|h265|hevc|av1)$/i.test(t)
    ) {
      break;
    }
    cleanTokens.push(t);
  }

  if (cleanTokens.length > 0) {
    title = cleanTokens.join(' ').trim();
  } else {
    title = raw.replace(/[._]/g, ' ').trim();
  }

  return {
    title,
    year,
    type,
    season,
    episode,
    quality,
    codec,
    format: format || 'unknown',
  };
}
