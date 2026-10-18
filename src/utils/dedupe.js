import { normalizeUrl } from './url.js';

/**
 * Generate compound key fingerprint for link deduplication
 * Pattern: ${sourceUrl}::${providerUrl}::${fileId}
 */
export function generateDedupeKey(sourceUrl = '', providerUrl = '', fileId = '') {
  const normSource = normalizeUrl(sourceUrl).toLowerCase();
  const normProvider = normalizeUrl(providerUrl).toLowerCase();
  const cleanId = String(fileId || '').trim();

  return `${normSource}::${normProvider}::${cleanId}`;
}

/**
 * Extract fingerprint from a link record
 */
export function fingerprintLink(link) {
  if (link.dedupeKey) return link.dedupeKey;
  return generateDedupeKey(
    link.sourceUrl || '',
    link.providerUrl || '',
    link.fileId || link.filename || ''
  );
}
