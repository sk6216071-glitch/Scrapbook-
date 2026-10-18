import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { app } from '../src/index.js';
import { getDB } from '../src/database/mongodb.js';
import { Status } from '../src/database/models.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.join(__dirname, '..', 'fixtures');

let appServer;
let mockTargetServer;
let appBaseUrl;
let mockTargetBaseUrl;

beforeAll(async () => {
  // Start mock target server hosting fixtures
  await new Promise((resolve) => {
    mockTargetServer = http.createServer((req, res) => {
      const url = req.url;
      if (url === '/source') {
        const content = fs.readFileSync(path.join(fixturesDir, 'source-page.html'), 'utf-8')
          .replace('/links/intermediate-step', `${mockTargetBaseUrl}/intermediate`);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end(content);
      }
      if (url === '/intermediate') {
        const content = fs.readFileSync(path.join(fixturesDir, 'intermediate-page.html'), 'utf-8')
          .replace('https://provider.example/file/9QWlfgZTmmiv837', `${mockTargetBaseUrl}/file/9QWlfgZTmmiv837`);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end(content);
      }
      if (url.startsWith('/file/9QWlfgZTmmiv837')) {
        const content = fs.readFileSync(path.join(fixturesDir, 'gdflix-page.html'), 'utf-8');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end(content);
      }
      if (url === '/captcha') {
        const content = fs.readFileSync(path.join(fixturesDir, 'captcha-page.html'), 'utf-8');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end(content);
      }
      res.writeHead(404);
      res.end('Not Found');
    });

    mockTargetServer.listen(0, '127.0.0.1', () => {
      const port = mockTargetServer.address().port;
      mockTargetBaseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  // Start Express App
  await new Promise((resolve) => {
    appServer = http.createServer(app);
    appServer.listen(0, '127.0.0.1', () => {
      const port = appServer.address().port;
      appBaseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise((resolve) => {
    if (appServer) appServer.close(resolve);
    else resolve();
  });
  await new Promise((resolve) => {
    if (mockTargetServer) mockTargetServer.close(resolve);
    else resolve();
  });
});

describe('Phase 7: End-to-End Scraping Pipeline', () => {
  it('processes a full scrape job pipeline from source to resolved provider link', async () => {
    const postRes = await fetch(`${appBaseUrl}/api/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: `${mockTargetBaseUrl}/source` })
    });

    expect(postRes.status).toBe(202);
    const { jobId } = await postRes.json();
    expect(jobId).toBeDefined();

    // Poll job status until complete (or timeout)
    const maxPolls = 20;
    let finalJob = null;
    for (let i = 0; i < maxPolls; i++) {
      await new Promise(r => setTimeout(r, 200));
      const jobRes = await fetch(`${appBaseUrl}/api/jobs/${jobId}`);
      finalJob = await jobRes.json();
      if (finalJob.status === Status.RESOLVED || finalJob.status === Status.ERROR) {
        break;
      }
    }

    expect(finalJob.status).toBe(Status.RESOLVED);
    expect(finalJob.resultsCount).toBeGreaterThanOrEqual(1);

    // Verify link record in DB
    const linksRes = await fetch(`${appBaseUrl}/api/links`);
    const links = await linksRes.json();
    const link = links.find(l => l.fileId === '9QWlfgZTmmiv837');

    expect(link).toBeDefined();
    expect(link.quality).toBe('2160p');
    expect(link.codec).toBe('H.265');
    expect(link.sizeDisplay).toBe('39.47 GB');
    expect(link.mirrors.length).toBeGreaterThan(0);
  });

  it('cleanly halts on challenge page returning HUMAN_VERIFICATION_REQUIRED', async () => {
    const postRes = await fetch(`${appBaseUrl}/api/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: `${mockTargetBaseUrl}/captcha` })
    });

    const { jobId } = await postRes.json();

    const maxPolls = 20;
    let finalJob = null;
    for (let i = 0; i < maxPolls; i++) {
      await new Promise(r => setTimeout(r, 200));
      const jobRes = await fetch(`${appBaseUrl}/api/jobs/${jobId}`);
      finalJob = await jobRes.json();
      if (finalJob.status === Status.HUMAN_VERIFICATION_REQUIRED) {
        break;
      }
    }

    expect(finalJob.status).toBe(Status.HUMAN_VERIFICATION_REQUIRED);
  });
});
