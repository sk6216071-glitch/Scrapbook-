import { generateDedupeKey } from '../utils/dedupe.js';

export const Status = {
  DISCOVERED: 'DISCOVERED',
  REDIRECTING: 'REDIRECTING',
  PARSING: 'PARSING',
  RESOLVED: 'RESOLVED',
  PARTIAL: 'PARTIAL',
  HUMAN_VERIFICATION_REQUIRED: 'HUMAN_VERIFICATION_REQUIRED',
  ACCESS_DENIED: 'ACCESS_DENIED',
  NOT_FOUND: 'NOT_FOUND',
  REDIRECT_LIMIT_EXCEEDED: 'REDIRECT_LIMIT_EXCEEDED',
  TIMEOUT: 'TIMEOUT',
  ERROR: 'ERROR'
};

export function generateId() {
  return Math.random().toString(36).substring(2, 13);
}

/**
 * MongoDB Implementation
 */
export class MongoDatabase {
  constructor(db) {
    this.db = db;
    this.jobs = db.collection('jobs');
    this.links = db.collection('scraped_links');
  }

  async init() {
    try {
      await this.links.createIndex({ dedupeKey: 1 }, { unique: true });
      await this.links.createIndex({ status: 1 });
      await this.links.createIndex({ createdAt: -1 });
      await this.jobs.createIndex({ createdAt: -1 });
    } catch {}
  }

  async createJob(jobData) {
    const id = generateId();
    const doc = {
      _id: id,
      jobId: id,
      url: jobData.url,
      status: jobData.status || Status.DISCOVERED,
      resultsCount: 0,
      extractedLinks: [],
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...jobData
    };
    await this.jobs.insertOne(doc);
    return doc;
  }

  async getJob(id) {
    return await this.jobs.findOne({ $or: [{ _id: id }, { jobId: id }] });
  }

  async updateJob(id, updates) {
    const now = new Date().toISOString();
    await this.jobs.updateOne(
      { $or: [{ _id: id }, { jobId: id }] },
      { $set: { ...updates, updatedAt: now } }
    );
    return await this.getJob(id);
  }

  async listJobs(limit = 20) {
    return await this.jobs.find().sort({ createdAt: -1 }).limit(limit).toArray();
  }

  async saveLink(linkDoc) {
    const dedupeKey = linkDoc.dedupeKey || generateDedupeKey(
      linkDoc.sourceUrl,
      linkDoc.providerUrl,
      linkDoc.fileId
    );

    const now = new Date().toISOString();
    const id = generateId();

    const existing = await this.links.findOne({ dedupeKey });
    if (existing) {
      // Merge mirrors and update
      const existingUrls = new Set((existing.mirrors || []).map(m => m.url));
      const newMirrors = (linkDoc.mirrors || []).filter(m => !existingUrls.has(m.url));
      const combinedMirrors = [...(existing.mirrors || []), ...newMirrors];

      await this.links.updateOne(
        { dedupeKey },
        {
          $set: {
            ...linkDoc,
            _id: existing._id,
            mirrors: combinedMirrors,
            updatedAt: now
          }
        }
      );
      return { ...existing, ...linkDoc, mirrors: combinedMirrors, updatedAt: now };
    }

    const doc = {
      _id: id,
      ...linkDoc,
      dedupeKey,
      createdAt: now,
      updatedAt: now
    };

    await this.links.insertOne(doc);
    return doc;
  }

  async getLinks(filter = {}, limit = 50) {
    const query = {};
    if (filter.status) {
      query.status = filter.status;
    }
    return await this.links.find(query).sort({ createdAt: -1 }).limit(limit).toArray();
  }

  async getStats() {
    const total = await this.links.countDocuments();
    const resolved = await this.links.countDocuments({ status: Status.RESOLVED });
    const partial = await this.links.countDocuments({ status: Status.PARTIAL });
    const humanVerification = await this.links.countDocuments({ status: Status.HUMAN_VERIFICATION_REQUIRED });
    const errors = await this.links.countDocuments({ status: { $in: [Status.ERROR, Status.TIMEOUT, Status.ACCESS_DENIED, Status.REDIRECT_LIMIT_EXCEEDED] } });

    return {
      total,
      resolved,
      partial,
      humanVerification,
      errors
    };
  }
}

/**
 * In-Memory Fallback Implementation
 */
export class InMemoryDatabase {
  constructor() {
    this.jobs = new Map();
    this.links = new Map();
  }

  async init() {}

  async createJob(jobData) {
    const id = generateId();
    const doc = {
      _id: id,
      jobId: id,
      url: jobData.url,
      status: jobData.status || Status.DISCOVERED,
      resultsCount: 0,
      extractedLinks: [],
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...jobData
    };
    this.jobs.set(id, doc);
    return { ...doc };
  }

  async getJob(id) {
    for (const [key, job] of this.jobs.entries()) {
      if (key === id || job.jobId === id || job._id === id) {
        return { ...job };
      }
    }
    return null;
  }

  async updateJob(id, updates) {
    let targetKey = null;
    let existing = null;
    for (const [key, job] of this.jobs.entries()) {
      if (key === id || job.jobId === id || job._id === id) {
        targetKey = key;
        existing = job;
        break;
      }
    }

    if (!existing) return null;

    const updated = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.jobs.set(targetKey, updated);
    return { ...updated };
  }

  async listJobs(limit = 20) {
    const list = Array.from(this.jobs.values()).sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
    return list.slice(0, limit);
  }

  async saveLink(linkDoc) {
    const dedupeKey = linkDoc.dedupeKey || generateDedupeKey(
      linkDoc.sourceUrl,
      linkDoc.providerUrl,
      linkDoc.fileId
    );

    const now = new Date().toISOString();
    let existingKey = null;
    let existingDoc = null;

    for (const [key, doc] of this.links.entries()) {
      if (doc.dedupeKey === dedupeKey) {
        existingKey = key;
        existingDoc = doc;
        break;
      }
    }

    if (existingDoc) {
      const existingUrls = new Set((existingDoc.mirrors || []).map(m => m.url));
      const newMirrors = (linkDoc.mirrors || []).filter(m => !existingUrls.has(m.url));
      const combinedMirrors = [...(existingDoc.mirrors || []), ...newMirrors];

      const merged = {
        ...existingDoc,
        ...linkDoc,
        mirrors: combinedMirrors,
        updatedAt: now
      };
      this.links.set(existingKey, merged);
      return { ...merged };
    }

    const id = generateId();
    const doc = {
      _id: id,
      ...linkDoc,
      dedupeKey,
      createdAt: now,
      updatedAt: now
    };
    this.links.set(id, doc);
    return { ...doc };
  }

  async getLinks(filter = {}, limit = 50) {
    let list = Array.from(this.links.values());
    if (filter.status) {
      list = list.filter(item => item.status === filter.status);
    }
    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return list.slice(0, limit);
  }

  async getStats() {
    const all = Array.from(this.links.values());
    const total = all.length;
    const resolved = all.filter(l => l.status === Status.RESOLVED).length;
    const partial = all.filter(l => l.status === Status.PARTIAL).length;
    const humanVerification = all.filter(l => l.status === Status.HUMAN_VERIFICATION_REQUIRED).length;
    const errors = all.filter(l =>
      [Status.ERROR, Status.TIMEOUT, Status.ACCESS_DENIED, Status.REDIRECT_LIMIT_EXCEEDED].includes(l.status)
    ).length;

    return {
      total,
      resolved,
      partial,
      humanVerification,
      errors
    };
  }
}
