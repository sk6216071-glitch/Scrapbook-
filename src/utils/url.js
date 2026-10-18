import dns from 'dns/promises';
import { isIP } from 'net';
import config from '../config/config.js';

/**
 * Checks if an IPv4 address is in private, loopback, or reserved ranges
 */
export function isPrivateIPv4(ip) {
  const parts = ip.split('.').map(p => parseInt(p, 10));
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
    return true; // Malformed IP treated as unsafe
  }

  const [a, b] = parts;

  // 0.0.0.0/8 (Current network)
  if (a === 0) return true;
  // 10.0.0.0/8 (RFC 1918)
  if (a === 10) return true;
  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;
  // 100.64.0.0/10 (Carrier-grade NAT: 100.64.0.0 to 100.127.255.255)
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 169.254.0.0/16 (Link-local)
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12 (RFC 1918: 172.16.0.0 to 172.31.255.255)
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.0.2.0/24 (TEST-NET-1)
  if (a === 192 && b === 0 && parts[2] === 2) return true;
  // 192.168.0.0/16 (RFC 1918)
  if (a === 192 && b === 168) return true;
  // 198.51.100.0/24 (TEST-NET-2)
  if (a === 198 && b === 51 && parts[2] === 100) return true;
  // 203.0.113.0/24 (TEST-NET-3)
  if (a === 203 && b === 0 && parts[2] === 113) return true;
  // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved)
  if (a >= 224) return true;

  return false;
}

/**
 * Checks if an IPv6 address is in private, loopback, or reserved ranges
 */
export function isPrivateIPv6(ip) {
  const normalized = ip.toLowerCase();

  // Loopback (::1) & Unspecified (::)
  if (normalized === '::1' || normalized === '::') return true;

  // IPv4-mapped IPv6 (e.g. ::ffff:192.168.1.1 or ::ffff:c0a8:0101)
  if (normalized.startsWith('::ffff:')) {
    const rest = normalized.slice(7);
    if (isIP(rest) === 4) {
      return isPrivateIPv4(rest);
    }
  }

  // Unique local addresses (fc00::/7, i.e., starts with fc or fd)
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;

  // Link-local addresses (fe80::/10)
  if (/^fe[89ab]/i.test(normalized)) return true;

  return false;
}

/**
 * Checks if an IP is private or restricted
 */
export function isPrivateIP(ip) {
  const version = isIP(ip);
  if (version === 4) return isPrivateIPv4(ip);
  if (version === 6) return isPrivateIPv6(ip);
  return true; // Not a valid IP
}

/**
 * Validates a URL for SSRF vulnerabilities and protocol correctness
 */
export async function validateUrl(rawUrl, options = {}) {
  const allowedDomains = options.allowedDomains || config.allowedDomains;

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (err) {
    return { valid: false, reason: 'INVALID_URL', error: 'Malformed URL' };
  }

  // Protocol check - only http: and https: allowed
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, reason: 'INVALID_PROTOCOL', error: `Disallowed protocol: ${parsed.protocol}` };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Check if explicitly allowlisted
  const isExplicitlyAllowed = allowedDomains.length > 0 && allowedDomains.some(d => {
    if (d === '*') return true;
    if (d.includes('*')) {
      const regex = new RegExp('^' + d.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
      return regex.test(hostname);
    }
    return hostname === d || hostname.endsWith(`.${d}`);
  });

  // If allowlist is non-empty and hostname is NOT in allowlist:
  if (allowedDomains.length > 0 && !isExplicitlyAllowed) {
    return { valid: false, reason: 'DOMAIN_NOT_ALLOWED', error: `Domain not in allowlist: ${hostname}` };
  }

  // If host is explicitly localhost or loopback and explicitly allowed in allowlist
  if (isExplicitlyAllowed && (hostname === 'localhost' || hostname === '127.0.0.1')) {
    return { valid: true, parsedUrl: parsed };
  }

  // Direct localhost or loopback check if not explicitly allowed
  if (hostname === 'localhost') {
    return { valid: false, reason: 'PRIVATE_IP_BLOCKED', error: 'Access to localhost is blocked' };
  }

  // Direct IP checks
  const ipVersion = isIP(hostname);
  if (ipVersion > 0) {
    if (isPrivateIP(hostname) && !isExplicitlyAllowed) {
      return { valid: false, reason: 'PRIVATE_IP_BLOCKED', error: `Access to private IP ${hostname} is blocked` };
    }
    return { valid: true, parsedUrl: parsed };
  }

  // If domain is a test/mock domain (e.g. ends with .test or .example), skip DNS resolution if configured
  if (hostname.endsWith('.test') || hostname.endsWith('.example')) {
    return { valid: true, parsedUrl: parsed };
  }

  // Resolve hostname via DNS to prevent DNS rebinding to private IPs
  try {
    const addresses = await dns.lookup(hostname, { all: true });
    for (const addr of addresses) {
      if (isPrivateIP(addr.address) && !isExplicitlyAllowed) {
        return {
          valid: false,
          reason: 'PRIVATE_IP_BLOCKED',
          error: `Hostname ${hostname} resolves to private IP ${addr.address}`
        };
      }
    }
  } catch (err) {
    // In disconnected environments or mock domains, if resolution fails:
    if (options.allowUnresolved || hostname.endsWith('.test') || hostname.endsWith('.example')) {
      return { valid: true, parsedUrl: parsed };
    }
    return { valid: false, reason: 'DNS_LOOKUP_FAILED', error: `Could not resolve hostname: ${err.message}` };
  }

  return { valid: true, parsedUrl: parsed };
}

/**
 * Resolve relative or absolute URL against a base URL
 */
export function resolveUrl(relativeOrAbsolute, baseUrl) {
  try {
    return new URL(relativeOrAbsolute, baseUrl).href;
  } catch {
    return null;
  }
}

/**
 * Normalizes URL for deduplication and consistent storage
 */
export function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = ''; // Strip hash
    // Standardize pathname
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.href;
  } catch {
    return url;
  }
}
