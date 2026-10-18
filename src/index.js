import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config/config.js';
import logger from './logging/logger.js';
import { connectDB } from './database/mongodb.js';
import apiRouter from './api/routes.js';
import telegramBot from './telegram/telegram-bot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();

app.use(express.json());

// Serve static frontend files
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

// Mount REST API
app.use('/api', apiRouter);

// Fallback route to serve admin dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

let server = null;

export async function startServer(port = config.port) {
  // Connect to DB (or fallback to InMemory repository)
  await connectDB();

  return new Promise((resolve) => {
    server = app.listen(port, () => {
      logger.log('DATABASE', `Server listening on http://localhost:${port}`);
      logger.log('DATABASE', `Admin dashboard available at http://localhost:${port}/`);
      
      // Initialize Telegram 24x7 bot if enabled
      telegramBot.start().catch((err) => {
        logger.error('TELEGRAM', `Bot error on startup: ${err.message}`);
      });

      resolve(server);
    });
  });
}

// Start immediately if executed directly
if (process.argv[1] === __filename) {
  startServer().catch((err) => {
    logger.error('SERVER', `Fatal error during server startup: ${err.message}`);
    process.exit(1);
  });
}

export default app;
