/**
 * Size & metadata normalization utilities
 */

const UNITS = {
  b: 1,
  byte: 1,
  bytes: 1,
  kb: 1024,
  kib: 1024,
  mb: 1024 * 1024,
  mib: 1024 * 1024,
  gb: 1024 * 1024 * 1024,
  gib: 1024 * 1024 * 1024,
  tb: 1024 * 1024 * 1024 * 1024,
  tib: 1024 * 1024 * 1024 * 1024,
};

/**
 * Format bytes to readable string (e.g., "39.47 GB")
 */
export function formatBytes(bytes) {
  if (bytes == null || isNaN(bytes) || bytes < 0) return '0 B';
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = bytes / Math.pow(k, i);
  return `${parseFloat(val.toFixed(2))} ${sizes[i]}`;
}

/**
 * Parse human-readable file size string or byte number
 */
export function parseSize(input) {
  if (input == null) {
    return { sizeBytes: 0, sizeDisplay: '0 B' };
  }

  if (typeof input === 'number') {
    return {
      sizeBytes: Math.round(input),
      sizeDisplay: formatBytes(input)
    };
  }

  const str = String(input).trim();
  // Check if raw integer string
  if (/^\d+$/.test(str)) {
    const bytes = parseInt(str, 10);
    return {
      sizeBytes: bytes,
      sizeDisplay: formatBytes(bytes)
    };
  }

  const match = str.match(/^([\d.,]+)\s*([a-zA-Z]+)?$/);
  if (!match) {
    return { sizeBytes: 0, sizeDisplay: str || '0 B' };
  }

  const numberPart = parseFloat(match[1].replace(/,/g, ''));
  const unitPart = (match[2] || 'b').toLowerCase();

  const multiplier = UNITS[unitPart] || 1;
  const sizeBytes = Math.round(numberPart * multiplier);

  return {
    sizeBytes,
    sizeDisplay: formatBytes(sizeBytes)
  };
}

/**
 * Normalize video resolution/quality
 */
export function normalizeQuality(rawQuality) {
  if (!rawQuality) return null;
  const q = String(rawQuality).toUpperCase();
  if (q.includes('2160') || q.includes('4K') || q.includes('UHD')) return '2160p';
  if (q.includes('1080') || q.includes('FHD')) return '1080p';
  if (q.includes('720') || q.includes('HD')) return '720p';
  if (q.includes('480') || q.includes('SD')) return '480p';
  return rawQuality;
}

/**
 * Normalize video codec
 */
export function normalizeCodec(rawCodec) {
  if (!rawCodec) return null;
  const c = String(rawCodec).toUpperCase();
  if (c.includes('265') || c.includes('HEVC')) return 'H.265';
  if (c.includes('264') || c.includes('AVC')) return 'H.264';
  if (c.includes('AV1')) return 'AV1';
  return rawCodec;
}
