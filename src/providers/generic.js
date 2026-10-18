import * as cheerio from 'cheerio';
import { parseMetadata } from '../parsing/metadata-parser.js';
import { parseSize } from '../utils/normalize.js';
import { parseMirrors } from '../parsing/mirror-parser.js';

export const genericProvider = {
  name: 'GENERIC',

  match() {
    return true; // Fallback matches anything
  },

  extractFileId(url) {
    if (!url) return null;
    const match = url.match(/\/([a-zA-Z0-9_\-]{6,})(?:\/|$|\?)/);
    return match ? match[1] : null;
  },

  parse(html, url) {
    const $ = cheerio.load(html || '');
    const fileId = this.extractFileId(url) || 'generic-file';

    let filename = $('h1, h2, h3, .title, .filename, title').first().text().trim();
    if (!filename) filename = 'Unknown File';

    let rawSize = '';
    const sizeMatch = html ? html.match(/([\d.,]+\s*(?:GB|MB|KB|GiB|MiB))/i) : null;
    if (sizeMatch) rawSize = sizeMatch[1];

    const { sizeBytes, sizeDisplay } = parseSize(rawSize);
    const meta = parseMetadata(filename);
    const mirrors = parseMirrors(html, url);

    return {
      provider: 'GENERIC',
      providerUrl: url,
      fileId,
      filename,
      title: meta.title,
      year: meta.year,
      type: meta.type,
      season: meta.season,
      episode: meta.episode,
      quality: meta.quality,
      codec: meta.codec,
      format: meta.format,
      sizeBytes,
      sizeDisplay,
      mirrors
    };
  }
};

export default genericProvider;
