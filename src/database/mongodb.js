import { MongoClient } from 'mongodb';
import config from '../config/config.js';
import logger from '../logging/logger.js';
import { InMemoryDatabase, MongoDatabase } from './models.js';

let dbInstance = null;
let mongoClient = null;

export async function connectDB() {
  if (dbInstance) return dbInstance;

  try {
    mongoClient = new MongoClient(config.mongodbUri, {
      serverSelectionTimeoutMS: 2000,
      connectTimeoutMS: 2000
    });

    await mongoClient.connect();
    const db = mongoClient.db();
    logger.info('DATABASE', `Connected to MongoDB database: ${db.databaseName}`);

    dbInstance = new MongoDatabase(db);
    await dbInstance.init();
    return dbInstance;
  } catch (err) {
    logger.warn('WARNING', `Could not connect to MongoDB daemon (${err.message}). Falling back to In-Memory repository.`);
    dbInstance = new InMemoryDatabase();
    return dbInstance;
  }
}

export function getDB() {
  if (!dbInstance) {
    dbInstance = new InMemoryDatabase();
  }
  return dbInstance;
}

export async function closeDB() {
  if (mongoClient) {
    try {
      await mongoClient.close();
    } catch {}
    mongoClient = null;
  }
  dbInstance = null;
}

export default { connectDB, getDB, closeDB };
