import config from '../config/config.js';
import logger from '../logging/logger.js';
import { Status } from '../database/models.js';
import { getDB } from '../database/mongodb.js';
import { validateUrl } from '../utils/url.js';
import { resolveRedirects } from '../discovery/redirect-resolver.js';
import { detectChallenge } from '../parsing/html-parser.js';
import { parseSourcePage } from '../sources/source-parser.js';
import { discoverLinks } from '../discovery/link-discovery.js';
import providerRegistry from '../providers/provider-registry.js';
import { generateDedupeKey } from '../utils/dedupe.js';

export class JobQueue {
  constructor(concurrency = config.concurrency) {
    this.concurrency = concurrency;
    this.activeWorkers = 0;
    this.queue = [];
  }

  enqueue(jobId) {
    this.queue.push(jobId);
    this.processNext();
  }

  async processNext() {
    if (this.activeWorkers >= this.concurrency || this.queue.length === 0) {
      return;
    }

    const jobId = this.queue.shift();
    this.activeWorkers++;

    try {
      await this.executeJob(jobId);
    } catch (err) {
      logger.error('QUEUE', `Unhandled error processing job ${jobId}: ${err.message}`);
    } finally {
      this.activeWorkers--;
      this.processNext();
    }
  }

  async executeJob(jobId) {
    const db = getDB();
    const job = await db.getJob(jobId);
    if (!job) return;

    logger.info('QUEUE', `Processing job ${jobId} for URL: ${job.url}`);

    // Step 1: SSRF Validation
    const validation = await validateUrl(job.url);
    if (!validation.valid) {
      await db.updateJob(jobId, {
        status: Status.ACCESS_DENIED,
        error: validation.error
      });
      return;
    }

    // Step 2: Follow redirects
    await db.updateJob(jobId, { status: Status.REDIRECTING });
    const redirectRes = await resolveRedirects(job.url);

    if (redirectRes.status !== 'RESOLVED') {
      await db.updateJob(jobId, {
        status: redirectRes.status,
        error: redirectRes.error
      });
      return;
    }

    const finalUrl = redirectRes.finalUrl;
    const html = redirectRes.body;

    // Step 3: Challenge Check
    const challenge = detectChallenge(html);
    if (challenge) {
      let sourceDomain = '';
      try { sourceDomain = new URL(job.url).hostname; } catch {}
      const challengeDoc = {
        sourceUrl: job.url,
        sourceDomain,
        title: 'Human Verification Challenge',
        year: null,
        type: 'unknown',
        season: null,
        episode: null,
        quality: null,
        codec: null,
        provider: 'CHALLENGE',
        providerUrl: '',
        fileId: 'challenge',
        filename: 'Turnstile / Bot Challenge',
        format: 'html',
        sizeBytes: 0,
        sizeDisplay: '0 B',
        mirrors: [],
        status: Status.HUMAN_VERIFICATION_REQUIRED,
        redirectChain: redirectRes.redirectChain || [],
        dedupeKey: generateDedupeKey(job.url, '', 'challenge')
      };
      const saved = await db.saveLink(challengeDoc);

      await db.updateJob(jobId, {
        status: Status.HUMAN_VERIFICATION_REQUIRED,
        extractedLinks: [saved._id],
        error: challenge.message
      });
      return;
    }

    await db.updateJob(jobId, { status: Status.PARSING });

    let sourceDomain = '';
    try {
      sourceDomain = new URL(job.url).hostname;
    } catch {}

    const extractedLinkIds = [];

    // Step 4: Check if final URL is already a provider page directly
    const directProvider = providerRegistry.getProvider(finalUrl);
    if (directProvider.name !== 'GENERIC' || finalUrl.includes('/file/')) {
      const parsedProvider = directProvider.parse(html, finalUrl);
      const dedupeKey = generateDedupeKey(job.url, finalUrl, parsedProvider.fileId);

      const linkDoc = {
        sourceUrl: job.url,
        sourceDomain,
        ...parsedProvider,
        status: Status.RESOLVED,
        redirectChain: redirectRes.redirectChain,
        dedupeKey
      };

      const saved = await db.saveLink(linkDoc);
      extractedLinkIds.push(saved._id);

      await db.updateJob(jobId, {
        status: Status.RESOLVED,
        resultsCount: 1,
        extractedLinks: extractedLinkIds
      });
      logger.info('QUEUE', `Job ${jobId} resolved successfully with 1 provider link.`);
      return;
    }

    // Step 5: Treat as Source Catalog Page
    const sourceData = parseSourcePage(html, finalUrl);
    let candidateLinks = sourceData.links || [];

    if (candidateLinks.length === 0) {
      // Check discovery links for intermediate links
      const discovery = discoverLinks(html, finalUrl);
      if (discovery.providerLinks.length > 0) {
        for (const pl of discovery.providerLinks) {
          candidateLinks.push({ url: pl.url, text: pl.text });
        }
      }
    }

    // Limit candidates per job to keep execution responsive
    const candidatesToProcess = candidateLinks.slice(0, 15);
    const chunkSize = 5;

    for (let i = 0; i < candidatesToProcess.length; i += chunkSize) {
      const chunk = candidatesToProcess.slice(i, i + chunkSize);
      await Promise.all(chunk.map(async (item) => {
        try {
          const itemRedirect = await resolveRedirects(item.url);
          if (itemRedirect.status !== 'RESOLVED' || !itemRedirect.body) return;

          const itemChallenge = detectChallenge(itemRedirect.body);
          if (itemChallenge) return;

          const provider = providerRegistry.getProvider(itemRedirect.finalUrl);
          let parsedData = null;

          if (provider.name !== 'GENERIC' || itemRedirect.finalUrl.includes('/file/')) {
            parsedData = provider.parse(itemRedirect.body, itemRedirect.finalUrl);
          } else {
            const subDiscovery = discoverLinks(itemRedirect.body, itemRedirect.finalUrl);
            if (subDiscovery.providerLinks.length > 0) {
              const firstProv = subDiscovery.providerLinks[0];
              const provRedirect = await resolveRedirects(firstProv.url);
              if (provRedirect.status === 'RESOLVED' && provRedirect.body) {
                const subProvider = providerRegistry.getProvider(provRedirect.finalUrl);
                parsedData = subProvider.parse(provRedirect.body, provRedirect.finalUrl);
              }
            }
          }

          if (parsedData) {
            const dedupeKey = generateDedupeKey(job.url, parsedData.providerUrl, parsedData.fileId);
            const linkRecord = {
              sourceUrl: job.url,
              sourceDomain,
              title: parsedData.title || sourceData.title,
              year: parsedData.year || sourceData.year,
              type: parsedData.type || sourceData.type || 'tv',
              season: parsedData.season || sourceData.season || null,
              episode: parsedData.episode || null,
              quality: parsedData.quality || item.quality || null,
              codec: parsedData.codec || item.codec || null,
              provider: parsedData.provider,
              providerUrl: parsedData.providerUrl,
              destinationUrl: parsedData.destinationUrl || parsedData.providerUrl,
              fileId: parsedData.fileId,
              filename: parsedData.filename,
              format: parsedData.format,
              sizeBytes: parsedData.sizeBytes,
              sizeDisplay: parsedData.sizeDisplay,
              mirrors: parsedData.mirrors || [],
              status: Status.RESOLVED,
              redirectChain: itemRedirect.redirectChain || [],
              dedupeKey
            };

            const saved = await db.saveLink(linkRecord);
            extractedLinkIds.push(saved._id);
          }
        } catch (err) {
          logger.warn('QUEUE', `Error processing candidate link ${item.url}: ${err.message}`);
        }
      }));
    }

    const finalStatus = extractedLinkIds.length > 0 ? Status.RESOLVED : Status.PARTIAL;

    if (extractedLinkIds.length === 0) {
      const partialDoc = {
        sourceUrl: job.url,
        sourceDomain,
        title: sourceData.title || 'Unknown',
        year: sourceData.year || null,
        type: sourceData.type || 'tv',
        season: sourceData.season || null,
        episode: null,
        quality: null,
        codec: null,
        provider: 'UNKNOWN',
        providerUrl: '',
        fileId: 'none',
        filename: sourceData.title || 'Unknown',
        format: 'unknown',
        sizeBytes: 0,
        sizeDisplay: '0 B',
        mirrors: [],
        status: finalStatus,
        redirectChain: redirectRes.redirectChain || [],
        dedupeKey: generateDedupeKey(job.url, '', 'none')
      };
      const saved = await db.saveLink(partialDoc);
      extractedLinkIds.push(saved._id);
    }

    await db.updateJob(jobId, {
      status: finalStatus,
      resultsCount: finalStatus === Status.RESOLVED ? extractedLinkIds.length : 0,
      extractedLinks: extractedLinkIds,
      error: finalStatus === Status.RESOLVED ? null : 'No downloadable provider links resolved'
    });

    logger.info('QUEUE', `Job ${jobId} finished with status ${finalStatus}. Results: ${extractedLinkIds.length}`);
  }
}

export const jobQueue = new JobQueue();
export default jobQueue;
