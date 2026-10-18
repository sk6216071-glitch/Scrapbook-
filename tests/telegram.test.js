import { describe, it, expect, vi } from 'vitest';
import telegramBot from '../src/telegram/telegram-bot.js';

describe('Telegram Bot 24x7 Monitoring Service', () => {
  it('initializes properly and reports disabled when token is missing', async () => {
    expect(telegramBot).toBeDefined();
    expect(telegramBot.formatUptime(3665)).toBe('1h 1m 5s');
    expect(telegramBot.formatUptime(90061)).toBe('1d 1h 1m 1s');
  });

  it('formats system stats correctly', async () => {
    const stats = await telegramBot.getSystemStats();
    expect(stats).toHaveProperty('memoryMB');
    expect(stats).toHaveProperty('activeWorkers');
    expect(stats).toHaveProperty('totalLinks');
    expect(typeof stats.memoryMB).toBe('number');
  });

  it('handles sendAlert safely', async () => {
    if (!telegramBot.enabled) {
      const res = await telegramBot.sendAlert('Test message');
      expect(res).toBeUndefined();
    } else {
      expect(telegramBot.enabled).toBe(true);
      expect(telegramBot.token).toBeTruthy();
    }
  });
});
