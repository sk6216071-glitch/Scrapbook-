import http from './src/discovery/http-client.js';
import * as cheerio from 'cheerio';
import { decodeMediatorPayload } from './src/discovery/link-discovery.js';

async function main() {
  const res = await http.fetchWithBackoff('https://4khdhub.one/friends-sex-and-games-series-8361/');
  const $ = cheerio.load(res.body);

  const hubcloudCandidates = [];
  $('a[href]').each((_, el) => {
    const text = $(el).text();
    const href = $(el).attr('href');
    if (text.includes('HubCloud') && href && href.includes('greenmotors')) {
      const container = $(el).closest('.download-item, .episode-download-item');
      const filename = container.find('.file-title, .episode-file-title').text().trim();
      const size = container.find('.badge-size, span.badge:contains("GB"), span.badge:contains("MB")').first().text().trim();
      hubcloudCandidates.push({ filename, size, href });
    }
  });

  console.log(`Found ${hubcloudCandidates.length} HubCloud download items!`);

  // Let's resolve the first 8 HubCloud destination links
  const sample = hubcloudCandidates.slice(0, 8);
  for (const item of sample) {
    try {
      const gRes = await http.fetchWithBackoff(item.href);
      let targetUrl = gRes.headers.location || item.href;
      if (gRes.statusCode === 302 && gRes.headers.location) {
        const nextRes = await http.fetchWithBackoff(gRes.headers.location);
        const destination = decodeMediatorPayload(nextRes.body);
        console.log(`\nFilename: ${item.filename}`);
        console.log(`Size: ${item.size}`);
        console.log(`HubCloud Destination Link: ${destination}`);
      }
    } catch (err) {
      console.error(`Error resolving ${item.filename}: ${err.message}`);
    }
  }
}

main().catch(console.error);
