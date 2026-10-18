import { describe, it, expect } from 'vitest';
import { InMemoryDatabase, Status } from '../src/database/models.js';
import { generateDedupeKey } from '../src/utils/dedupe.js';

describe('Phase 4: Database, Deduplication & Job Statuses', () => {
  it('generates consistent dedupe keys', () => {
    const key = generateDedupeKey(
      'https://example-authorized-site.test/tvshows/example-show/',
      'https://provider.example/file/9QWlfgZTmmiv837',
      '9QWlfgZTmmiv837'
    );
    expect(key).toBe('https://example-authorized-site.test/tvshows/example-show::https://provider.example/file/9qwlfgztmmiv837::9QWlfgZTmmiv837');
  });

  it('creates and updates jobs in in-memory repository', async () => {
    const db = new InMemoryDatabase();
    const job = await db.createJob({
      url: 'https://example-authorized-site.test/item',
      status: Status.DISCOVERED
    });

    expect(job._id).toBeDefined();
    expect(job.status).toBe(Status.DISCOVERED);

    const updated = await db.updateJob(job._id, {
      status: Status.RESOLVED,
      resultsCount: 2
    });

    expect(updated.status).toBe(Status.RESOLVED);
    expect(updated.resultsCount).toBe(2);

    const fetched = await db.getJob(job._id);
    expect(fetched.status).toBe(Status.RESOLVED);
  });

  it('deduplicates links and merges mirror links', async () => {
    const db = new InMemoryDatabase();
    const link1 = {
      sourceUrl: 'https://example-authorized-site.test/page',
      providerUrl: 'https://provider.example/file/12345',
      fileId: '12345',
      filename: 'sample.mkv',
      status: Status.RESOLVED,
      mirrors: [{ name: 'Mirror 1', url: 'https://m1.example/dl', type: 'direct' }]
    };

    const saved1 = await db.saveLink(link1);
    expect(saved1._id).toBeDefined();

    // Save duplicate link with an additional mirror
    const link2 = {
      sourceUrl: 'https://example-authorized-site.test/page',
      providerUrl: 'https://provider.example/file/12345',
      fileId: '12345',
      filename: 'sample.mkv',
      status: Status.RESOLVED,
      mirrors: [
        { name: 'Mirror 1', url: 'https://m1.example/dl', type: 'direct' },
        { name: 'Mirror 2', url: 'https://m2.example/dl', type: 'cloud' }
      ]
    };

    const saved2 = await db.saveLink(link2);
    expect(saved2._id).toBe(saved1._id); // Same ID preserved
    expect(saved2.mirrors.length).toBe(2); // Mirrors merged

    const allLinks = await db.getLinks();
    expect(allLinks.length).toBe(1);
  });

  it('aggregates stats correctly', async () => {
    const db = new InMemoryDatabase();
    await db.saveLink({
      sourceUrl: 'https://a.test',
      providerUrl: 'https://p.test/1',
      fileId: '1',
      status: Status.RESOLVED
    });
    await db.saveLink({
      sourceUrl: 'https://a.test',
      providerUrl: 'https://p.test/2',
      fileId: '2',
      status: Status.PARTIAL
    });
    await db.saveLink({
      sourceUrl: 'https://a.test',
      providerUrl: 'https://p.test/3',
      fileId: '3',
      status: Status.HUMAN_VERIFICATION_REQUIRED
    });

    const stats = await db.getStats();
    expect(stats.total).toBe(3);
    expect(stats.resolved).toBe(1);
    expect(stats.partial).toBe(1);
    expect(stats.humanVerification).toBe(1);
    expect(stats.errors).toBe(0);
  });
});
