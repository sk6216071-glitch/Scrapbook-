import * as cheerio from 'cheerio';
import { parseMetadata } from '../parsing/metadata-parser.js';
import { parseSize } from '../utils/normalize.js';
import { parseMirrors } from '../parsing/mirror-parser.js';

export const gdflixProvider = {
  name: 'GDFLIX',

  match(url) {
    if (!url) return false;
    const lower = url.toLowerCase();
    return (
      lower.includes('gdflix') ||
      lower.includes('hubcloud') ||
      lower.includes('/file/') ||
      lower.includes('/drive/') ||
      lower.includes('provider.example')
    );
  },

  extractFileId(url) {
    if (!url) return null;
    const match = url.match(/\/(?:file|drive)\/([a-zA-Z0-9_\-]+)/i) ||
                  url.match(/[?&]id=([a-zA-Z0-9_\-]+)/i) ||
                  url.match(/[?&]file=([a-zA-Z0-9_\-]+)/i);
    return match ? match[1] : null;
  },

  parse(html, url) {
    const $ = cheerio.load(html || '');
    const fileId = this.extractFileId(url);

    // Extract filename
    let filename = $('.filename, .file-name, h1, h2, h3, .title, strong')
      .map((_, el) => $(el).text().trim())
      .get()
      .find(t => /\.(mkv|mp4|zip|rar|avi)$/i.test(t)) || '';

    if (!filename) {
      const pageTitle = $('title').text().trim();
      filename = pageTitle.replace(/^download\s+/i, '').replace(/\s+-\s+.*$/, '').trim();
    }

    // Extract file size
    let rawSize = '';
    const sizeEl = $('.size, .file-size, span:contains("Size:"), div:contains("File Size")');
    if (sizeEl.length > 0) {
      const text = sizeEl.first().text();
      const match = text.match(/([\d.,]+\s*(?:GB|MB|KB|Bytes|B|GiB|MiB))/i);
      if (match) rawSize = match[1];
    }

    if (!rawSize) {
      // Look for size pattern anywhere in the page
      const match = html.match(/([\d.,]+\s*(?:GB|MB|KB|GiB|MiB))/i);
      if (match) rawSize = match[1];
    }

    const { sizeBytes, sizeDisplay } = parseSize(rawSize);
    const meta = parseMetadata(filename);
    const mirrors = parseMirrors(html, url);

    const isHubCloud = url.toLowerCase().includes('hubcloud');
    const providerName = isHubCloud ? 'HUBCLOUD' : 'GDFLIX';

    return {
      provider: providerName,
      providerUrl: url,
      destinationUrl: url,
      fileId: fileId || 'unknown',
      filename: filename || 'unknown',
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

export default gdflixProvider;
