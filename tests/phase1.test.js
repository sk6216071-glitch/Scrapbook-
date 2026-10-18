import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateUrl, isPrivateIPv4, isPrivateIPv6, resolveUrl } from '../src/utils/url.js';
import { parseHtml, detectChallenge } from '../src/parsing/html-parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.join(__dirname, '..', 'fixtures');

describe('Phase 1: URL, SSRF & HTML Parser', () => {
  it('correctly detects private IPv4 addresses', () => {
    expect(isPrivateIPv4('127.0.0.1')).toBe(true);
    expect(isPrivateIPv4('10.0.1.25')).toBe(true);
    expect(isPrivateIPv4('172.16.5.4')).toBe(true);
    expect(isPrivateIPv4('192.168.1.1')).toBe(true);
    expect(isPrivateIPv4('169.254.169.254')).toBe(true); // AWS metadata
    expect(isPrivateIPv4('100.64.0.1')).toBe(true); // CG-NAT
    expect(isPrivateIPv4('8.8.8.8')).toBe(false);
    expect(isPrivateIPv4('1.1.1.1')).toBe(false);
  });

  it('correctly detects private IPv6 addresses', () => {
    expect(isPrivateIPv6('::1')).toBe(true);
    expect(isPrivateIPv6('fc00::1')).toBe(true);
    expect(isPrivateIPv6('fe80::1')).toBe(true);
    expect(isPrivateIPv6('2606:4700:4700::1111')).toBe(false);
  });

  it('blocks non-HTTP protocols via validateUrl', async () => {
    const fileRes = await validateUrl('file:///etc/passwd');
    expect(fileRes.valid).toBe(false);
    expect(fileRes.reason).toBe('INVALID_PROTOCOL');

    const ftpRes = await validateUrl('ftp://example.com/file');
    expect(ftpRes.valid).toBe(false);
  });

  it('blocks access to localhost when not in allowed domains', async () => {
    const res = await validateUrl('http://127.0.0.1:8080/admin', { allowedDomains: [] });
    expect(res.valid).toBe(false);
    expect(res.reason).toBe('PRIVATE_IP_BLOCKED');
  });

  it('detects Cloudflare Turnstile challenge in HTML', () => {
    const captchaHtml = fs.readFileSync(path.join(fixturesDir, 'captcha-page.html'), 'utf-8');
    const challenge = detectChallenge(captchaHtml);
    expect(challenge).not.toBeNull();
    expect(challenge.status).toBe('HUMAN_VERIFICATION_REQUIRED');
    expect(challenge.message).toBe('Manual verification required.');
  });

  it('parses links and meta refresh correctly', () => {
    const redirectHtml = fs.readFileSync(path.join(fixturesDir, 'redirect-page.html'), 'utf-8');
    const parsed = parseHtml(redirectHtml, 'https://example-authorized-site.test');
    expect(parsed.metaRefresh).toBe('https://example-authorized-site.test/destination');
    expect(parsed.canonical).toBe('https://example-authorized-site.test/canonical-destination');
  });

  it('gracefully parses malformed HTML without crashing', () => {
    const malformedHtml = fs.readFileSync(path.join(fixturesDir, 'malformed-page.html'), 'utf-8');
    const parsed = parseHtml(malformedHtml, 'https://example-authorized-site.test');
    expect(parsed.title).toBe('Malformed Page');
    expect(parsed.links.length).toBeGreaterThan(0);
  });
});
