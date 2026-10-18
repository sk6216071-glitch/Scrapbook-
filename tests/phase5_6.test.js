import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import app from '../src/index.js';
import { getDB } from '../src/database/mongodb.js';
import { Status } from '../src/database/models.js';

let server;
let baseUrl;

beforeAll(async () => {
  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise((resolve) => {
    if (server) server.close(resolve);
    else resolve();
  });
});

describe('Phase 5 & 6: REST API & Endpoints', () => {
  it('rejects POST /api/scrape without url', async () => {
    const res = await fetch(`${baseUrl}/api/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it('accepts valid POST /api/scrape and returns 202', async () => {
    const res = await fetch(`${baseUrl}/api/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example-authorized-site.test/item' })
    });

    expect(res.status).toBe(202);
    const data = await res.json();
    expect(data.jobId).toBeDefined();
    expect(data.status).toBe(Status.DISCOVERED);
    expect(data.url).toBe('https://example-authorized-site.test/item');
  });

  it('returns 404 for non-existent job in GET /api/jobs/:id', async () => {
    const res = await fetch(`${baseUrl}/api/jobs/nonexistent-id-12345`);
    expect(res.status).toBe(404);
  });

  it('retrieves links list from GET /api/links', async () => {
    const db = getDB();
    await db.saveLink({
      sourceUrl: 'https://test.site/catalog',
      providerUrl: 'https://provider.site/file/101',
      fileId: '101',
      filename: 'test.mkv',
      status: Status.RESOLVED
    });

    const res = await fetch(`${baseUrl}/api/links?limit=10`);
    expect(res.status).toBe(200);
    const links = await res.json();
    expect(Array.isArray(links)).toBe(true);
    expect(links.length).toBeGreaterThan(0);
  });

  it('returns aggregate metrics from GET /api/stats', async () => {
    const res = await fetch(`${baseUrl}/api/stats`);
    expect(res.status).toBe(200);
    const stats = await res.json();
    expect(stats.total).toBeDefined();
    expect(stats.resolved).toBeDefined();
    expect(stats.errors).toBeDefined();
  });
});
