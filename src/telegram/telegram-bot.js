import fs from 'fs';
import path from 'path';
import config from '../config/config.js';
import logger from '../logging/logger.js';
import { getDB } from '../database/mongodb.js';
import { jobQueue } from '../queue/job-queue.js';
import { Status } from '../database/models.js';

class TelegramBotService {
  constructor() {
    this.token = config.telegramBotToken;
    this.chatId = config.telegramChatId;
    this.enabled = Boolean(config.telegramEnabled && this.token);
    this.isRunning = false;
    this.pollOffset = 0;
    this.heartbeatTimer = null;
    this.startTime = Date.now();
  }

  /**
   * Initializes and starts the Telegram bot
   */
  async start() {
    if (!this.enabled) {
      logger.info('TELEGRAM', 'Telegram bot is disabled or TELEGRAM_BOT_TOKEN is not set.');
      return;
    }

    this.isRunning = true;
    logger.info('TELEGRAM', 'Starting Telegram 24x7 Uptime & Monitoring Bot...');

    // Verify token
    try {
      const me = await this.apiCall('getMe');
      logger.info('TELEGRAM', `Connected to Telegram bot: @${me.username} (${me.first_name})`);

      if (this.chatId) {
        await this.sendMessage(
          this.chatId,
          `🟢 <b>Server Online & 24x7 Monitor Active</b>\n\n` +
          `• <b>Port:</b> <code>${config.port}</code>\n` +
          `• <b>Environment:</b> <code>${config.nodeEnv}</code>\n` +
          `• <b>Start Time:</b> ${new Date().toISOString()}\n\n` +
          `Send /help to view available remote commands.`
        );
      }
    } catch (err) {
      logger.error('TELEGRAM', `Failed to initialize Telegram bot: ${err.message}`);
      return;
    }

    // Start background polling for commands
    this.pollLoop();

    // Start heartbeat timer
    if (config.telegramHeartbeatInterval > 0 && this.chatId) {
      const ms = config.telegramHeartbeatInterval * 60 * 1000;
      this.heartbeatTimer = setInterval(() => {
        this.sendHeartbeat().catch(err => {
          logger.error('TELEGRAM', `Heartbeat error: ${err.message}`);
        });
      }, ms);
    }
  }

  /**
   * Stops the bot gracefully
   */
  stop() {
    this.isRunning = false;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    logger.info('TELEGRAM', 'Telegram bot stopped.');
  }

  /**
   * Low-level API caller to api.telegram.org
   */
  async apiCall(endpoint, payload = {}) {
    if (!this.token) throw new Error('Telegram bot token not configured');
    const url = `https://api.telegram.org/bot${this.token}/${endpoint}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!data.ok) {
      throw new Error(data.description || `Telegram API error: ${res.status}`);
    }
    return data.result;
  }

  /**
   * Sends a message to a specific chat
   */
  async sendMessage(chatId, text, options = {}) {
    try {
      return await this.apiCall('sendMessage', {
        chat_id: chatId,
        text,
        parse_mode: options.parse_mode || 'HTML',
        disable_web_page_preview: options.disable_web_page_preview ?? true,
        ...options
      });
    } catch (err) {
      logger.error('TELEGRAM', `Failed to send message to ${chatId}: ${err.message}`);
    }
  }

  /**
   * Broadcasts an alert to the default configured chat ID
   */
  async sendAlert(text) {
    if (!this.enabled || !this.chatId) return;
    return this.sendMessage(this.chatId, text);
  }

  /**
   * Heartbeat periodic report
   */
  async sendHeartbeat() {
    if (!this.chatId) return;
    const stats = await this.getSystemStats();
    const uptimeStr = this.formatUptime(process.uptime());

    const message =
      `💓 <b>24x7 Uptime Heartbeat</b>\n\n` +
      `• <b>Status:</b> 🟢 ONLINE\n` +
      `• <b>Uptime:</b> ${uptimeStr}\n` +
      `• <b>Memory RSS:</b> ${stats.memoryMB} MB\n` +
      `• <b>Active Workers:</b> ${stats.activeWorkers}/${config.concurrency}\n` +
      `• <b>Total Links:</b> ${stats.totalLinks} (${stats.resolvedLinks} resolved)\n` +
      `• <b>Timestamp:</b> <code>${new Date().toLocaleTimeString()}</code>`;

    await this.sendMessage(this.chatId, message);
  }

  /**
   * Calculates uptime string
   */
  formatUptime(seconds) {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
  }

  /**
   * Gathers live system metrics
   */
  async getSystemStats() {
    const mem = process.memoryUsage();
    let totalLinks = 0;
    let resolvedLinks = 0;

    try {
      const db = getDB();
      const stats = await db.getStats();
      totalLinks = stats.total || 0;
      resolvedLinks = stats.resolved || 0;
    } catch {}

    return {
      memoryMB: Math.round(mem.rss / 1024 / 1024),
      activeWorkers: jobQueue.activeWorkers || 0,
      queueLength: jobQueue.queue?.length || 0,
      totalLinks,
      resolvedLinks
    };
  }

  /**
   * Long polling loop for incoming commands
   */
  async pollLoop() {
    while (this.isRunning) {
      try {
        const updates = await this.apiCall('getUpdates', {
          offset: this.pollOffset,
          timeout: 25,
          allowed_updates: ['message']
        });

        if (Array.isArray(updates)) {
          for (const update of updates) {
            this.pollOffset = update.update_id + 1;
            if (update.message && update.message.text) {
              await this.handleMessage(update.message);
            }
          }
        }
      } catch (err) {
        if (!this.isRunning) break;
        logger.error('TELEGRAM', `Poll error (retrying in 5s): ${err.message}`);
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  }

  /**
   * Handles incoming Telegram user commands
   */
  async handleMessage(msg) {
    const text = msg.text.trim();
    const chatId = msg.chat.id;
    const fromUser = msg.from?.username ? `@${msg.from.username}` : (msg.from?.first_name || 'User');

    logger.info('TELEGRAM', `Command from ${fromUser}: ${text}`);

    // Auto-pair with first user who messages the bot if chatId is not configured
    if (!this.chatId) {
      this.chatId = String(chatId);
      logger.info('TELEGRAM', `Auto-paired with chat ID: ${this.chatId}`);
      try {
        const envPath = path.resolve('.env');
        if (fs.existsSync(envPath)) {
          let envContent = fs.readFileSync(envPath, 'utf8');
          if (envContent.includes('TELEGRAM_CHAT_ID=')) {
            envContent = envContent.replace(/TELEGRAM_CHAT_ID=.*$/m, `TELEGRAM_CHAT_ID=${this.chatId}`);
          } else {
            envContent += `\nTELEGRAM_CHAT_ID=${this.chatId}\n`;
          }
          fs.writeFileSync(envPath, envContent, 'utf8');
        }
      } catch (e) {
        logger.error('TELEGRAM', `Could not persist chat ID to .env: ${e.message}`);
      }
    }

    const [cmd, ...args] = text.split(/\s+/);

    switch (cmd.toLowerCase()) {
      case '/start':
      case '/help':
        await this.sendMessage(
          chatId,
          `🤖 <b>Authorized Scraper 24x7 Uptime Bot</b>\n\n` +
          `<b>Available Commands:</b>\n` +
          `• <code>/ping</code> — Instant responsiveness check\n` +
          `• <code>/uptime</code> or <code>/status</code> — System health & stats\n` +
          `• <code>/links</code> — Recent 5 discovered download links\n` +
          `• <code>/scrape &lt;url&gt;</code> — Trigger a scrape job remotely\n` +
          `• <code>/id</code> — Show your Telegram Chat ID`
        );
        break;

      case '/ping':
        await this.sendMessage(chatId, `🏓 <b>Pong!</b> Service is responsive.\nLatency check: OK`);
        break;

      case '/id':
        await this.sendMessage(chatId, `🆔 Your Chat ID: <code>${chatId}</code>`);
        break;

      case '/uptime':
      case '/status': {
        const stats = await this.getSystemStats();
        const uptimeStr = this.formatUptime(process.uptime());

        const report =
          `📊 <b>System Status & Health</b>\n\n` +
          `• <b>Engine State:</b> 🟢 RUNNING\n` +
          `• <b>Uptime:</b> ${uptimeStr}\n` +
          `• <b>Active Workers:</b> ${stats.activeWorkers} / ${config.concurrency}\n` +
          `• <b>Pending Queue:</b> ${stats.queueLength}\n` +
          `• <b>RAM Usage:</b> ${stats.memoryMB} MB\n` +
          `• <b>Total Discovered:</b> ${stats.totalLinks}\n` +
          `• <b>Resolved Links:</b> ${stats.resolvedLinks}\n` +
          `• <b>Admin Web:</b> <code>http://localhost:${config.port}/</code>`;

        await this.sendMessage(chatId, report);
        break;
      }

      case '/links': {
        try {
          const db = getDB();
          const links = await db.getLinks({ status: Status.RESOLVED }, 5);
          if (!links || links.length === 0) {
            await this.sendMessage(chatId, `ℹ️ No resolved links found in database yet.`);
            break;
          }

          let response = `📁 <b>Latest Resolved Links (${links.length}):</b>\n\n`;
          links.forEach((l, idx) => {
            const dest = l.destinationUrl || l.providerUrl || 'N/A';
            response += `${idx + 1}. <b>${l.title || l.filename || 'File'}</b>\n`;
            response += `   • Quality: <code>${l.quality || 'N/A'}</code> | Size: <code>${l.sizeDisplay || 'N/A'}</code>\n`;
            response += `   • Link: <a href="${dest}">${dest}</a>\n\n`;
          });

          await this.sendMessage(chatId, response);
        } catch (err) {
          await this.sendMessage(chatId, `❌ Error retrieving links: ${err.message}`);
        }
        break;
      }

      case '/scrape': {
        const urlToScrape = args[0];
        if (!urlToScrape) {
          await this.sendMessage(chatId, `⚠️ <b>Usage:</b> <code>/scrape https://example.com/item</code>`);
          break;
        }

        try {
          const db = getDB();
          const job = await db.createJob({
            url: urlToScrape.trim(),
            status: Status.DISCOVERED
          });

          jobQueue.enqueue(job.jobId || job._id);

          await this.sendMessage(
            chatId,
            `⏳ <b>Scrape Job Queued</b>\n` +
            `• <b>Job ID:</b> <code>${job.jobId || job._id}</code>\n` +
            `• <b>Target:</b> <code>${urlToScrape}</code>\n` +
            `You will receive an alert once resolved.`
          );
        } catch (err) {
          await this.sendMessage(chatId, `❌ Failed to enqueue job: ${err.message}`);
        }
        break;
      }

      default:
        await this.sendMessage(chatId, `❓ Unknown command. Send /help to view list.`);
        break;
    }
  }
}

export const telegramBot = new TelegramBotService();
export default telegramBot;
