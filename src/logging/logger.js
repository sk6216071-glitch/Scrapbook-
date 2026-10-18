/**
 * Structured Logger with tag prefixes and Zero Credential Logging
 */

const SENSITIVE_PATTERNS = [
  /(authorization:\s*(?:bearer\s+)?)['"][^'"]+['"]/gi,
  /(bearer\s+)[a-zA-Z0-9_\-\.]+/gi,
  /(token=)[^&\s]+/gi,
  /(password=)[^&\s]+/gi,
  /(secret=)[^&\s]+/gi,
  /(cookie:\s*)[^\r\n]+/gi,
  /(api[_-]?key=)[^&\s]+/gi,
];

export function sanitize(input) {
  if (typeof input !== 'string') {
    try {
      input = JSON.stringify(input);
    } catch {
      input = String(input);
    }
  }

  let sanitized = input;
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, '$1[REDACTED]');
  }
  return sanitized;
}

export function formatLog(tag, message) {
  const timestamp = new Date().toISOString();
  const cleanMessage = sanitize(message);
  return `[${timestamp}] [${tag}] ${cleanMessage}`;
}

export const logger = {
  log(tag, message) {
    if (!message) {
      console.log(formatLog('INFO', tag));
    } else {
      console.log(formatLog(tag, message));
    }
  },

  info(tag, message) {
    if (!message) {
      console.log(formatLog('INFO', tag));
    } else {
      console.log(formatLog(tag, message));
    }
  },

  warn(tag, message) {
    if (!message) {
      console.error(formatLog('WARNING', tag));
    } else {
      console.error(formatLog(tag, message));
    }
  },

  error(tag, message) {
    if (!message) {
      console.error(formatLog('ERROR', tag));
    } else {
      console.error(formatLog(tag, message));
    }
  },

  debug(tag, message) {
    if (process.env.DEBUG || process.env.NODE_ENV === 'development') {
      if (!message) {
        console.log(formatLog('DEBUG', tag));
      } else {
        console.log(formatLog(tag, message));
      }
    }
  }
};

export default logger;
