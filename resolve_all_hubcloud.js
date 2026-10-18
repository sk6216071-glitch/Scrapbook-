import http from './src/discovery/http-client.js';
import * as cheerio from 'cheerio';
import fs from 'fs';
import { decodeMediatorPayload } from './src/discovery/link-discovery.js';

async function main() {
  let html = '';
  if (fs.existsSync('page_cache.html')) {
    html = fs.readFileSync('page_cache.html', 'utf-8');
  } else {
    console.log('Fetching page from 4khdhub.one...');
    const res = await http.fetchWithBackoff('https://4khdhub.one/friends-sex-and-games-series-8361/');
    html = res.body;
    fs.writeFileSync('page_cache.html', html, 'utf-8');
  }

  const $ = cheerio.load(html);

  const hubcloudCandidates = [];
  $('a[href]').each((_, el) => {
    const text = $(el).text();
    const href = $(el).attr('href');
    if (text.includes('HubCloud') && href && href.includes('greenmotors')) {
      const container = $(el).closest('.download-item, .episode-download-item');
      let filename = container.find('.file-title, .episode-file-title').text().trim();
      let size = container.find('.badge-size, span.badge:contains("GB"), span.badge:contains("MB")').first().text().trim();
      if (!filename) {
        filename = $(el).closest('div').text().trim();
      }
      hubcloudCandidates.push({ filename, size, href });
    }
  });

  console.log(`Found ${hubcloudCandidates.length} total HubCloud download items!`);

  // Print all found items
  const results = [];
  for (let i = 0; i < hubcloudCandidates.length; i++) {
    const item = hubcloudCandidates[i];
    try {
      const gRes = await http.fetchWithBackoff(item.href);
      let targetUrl = gRes.headers.location || item.href;
      if (gRes.statusCode === 302 && gRes.headers.location) {
        const nextRes = await http.fetchWithBackoff(gRes.headers.location);
        const destination = decodeMediatorPayload(nextRes.body);
        results.push({
          index: i + 1,
          filename: item.filename,
          size: item.size,
          hubcloudUrl: destination
        });
        console.log(`[${i + 1}/${hubcloudCandidates.length}] ${item.filename} (${item.size}) -> ${destination}`);
      } else {
        const destination = decodeMediatorPayload(gRes.body);
        results.push({
          index: i + 1,
          filename: item.filename,
          size: item.size,
          hubcloudUrl: destination
        });
        console.log(`[${i + 1}/${hubcloudCandidates.length}] ${item.filename} (${item.size}) -> ${destination}`);
      }
    } catch (err) {
      console.error(`[${i + 1}/${hubcloudCandidates.length}] Failed ${item.filename}: ${err.message}`);
    }
  }

  fs.writeFileSync('hubcloud_links.json', JSON.stringify(results, null, 2), 'utf-8');
  console.log('\nAll done! Results saved to hubcloud_links.json');
}

main().catch(console.error);
