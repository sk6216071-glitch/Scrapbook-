import express from 'express';
import { getDB } from '../database/mongodb.js';
import { jobQueue } from '../queue/job-queue.js';
import { Status } from '../database/models.js';

export const router = express.Router();

/**
 * POST /api/scrape
 * Submits a new scrape job
 */
router.post('/scrape', async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Valid URL is required in request body.' });
  }

  try {
    const db = getDB();
    const job = await db.createJob({
      url: url.trim(),
      status: Status.DISCOVERED
    });

    // Enqueue job for background execution
    jobQueue.enqueue(job.jobId || job._id);

    return res.status(202).json({
      jobId: job.jobId || job._id,
      status: job.status,
      url: job.url,
      createdAt: job.createdAt
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/jobs/:id
 * Fetches status and details of a scrape job
 */
router.get('/jobs/:id', async (req, res) => {
  try {
    const db = getDB();
    const job = await db.getJob(req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    return res.status(200).json({
      _id: job._id || job.jobId,
      url: job.url,
      status: job.status,
      resultsCount: job.resultsCount || 0,
      extractedLinks: job.extractedLinks || [],
      error: job.error || null,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/jobs
 * Lists recent scrape jobs
 */
router.get('/jobs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '20', 10);
    const db = getDB();
    const jobs = await db.listJobs(limit);
    return res.status(200).json(jobs);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/links
 * Retrieves scraped metadata links with optional status and limit filters
 */
router.get('/links', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '50', 10);
    const filter = {};
    if (req.query.status) {
      filter.status = req.query.status.toUpperCase();
    }

    const db = getDB();
    const links = await db.getLinks(filter, limit);
    return res.status(200).json(links);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/stats
 * Returns aggregate metrics
 */
router.get('/stats', async (req, res) => {
  try {
    const db = getDB();
    const stats = await db.getStats();
    return res.status(200).json(stats);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
