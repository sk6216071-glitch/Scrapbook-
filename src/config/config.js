import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/scraper_db',
  requestTimeout: parseInt(process.env.REQUEST_TIMEOUT || '15000', 10),
  maxRedirects: parseInt(process.env.MAX_REDIRECTS || '10', 10),
  maxRetries: parseInt(process.env.MAX_RETRIES || '2', 10),
  concurrency: parseInt(process.env.CONCURRENCY || '3', 10),
  userAgent: process.env.USER_AGENT || 'AuthorizedMetadataScraper/1.0',
  allowedDomains: (process.env.ALLOWED_DOMAINS || '')
    .split(',')
    .map(d => d.trim().toLowerCase())
    .filter(Boolean),
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '8265322595:AAHZTMo374j74uyenJpxlxyGry8Ir0AG034',
  telegramChatId: process.env.TELEGRAM_CHAT_ID || '930928310',
  telegramEnabled: process.env.TELEGRAM_ENABLED !== undefined ? process.env.TELEGRAM_ENABLED === 'true' : true,
  telegramHeartbeatInterval: parseInt(process.env.TELEGRAM_HEARTBEAT_MINUTES || '60', 10),
};

export default config;
