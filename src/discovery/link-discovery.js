import { parseHtml } from '../parsing/html-parser.js';
import { resolveUrl } from '../utils/url.js';
import providerRegistry from '../providers/provider-registry.js';

function rot13(str) {
  return str.replace(/[a-zA-Z]/g, function(c) {
    return String.fromCharCode((c <= 'Z' ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26);
  });
}

/**
 * Decodes intermediate mediator payload (e.g. s('o', '<base64>'))
 */
export function decodeMediatorPayload(html) {
  if (!html) return null;
  const match = html.match(/s\(['"]o['"],\s*['"]([A-Za-z0-9+/=]+)['"]/);
  if (!match) return null;

  try {
    const raw = match[1];
    const s1 = Buffer.from(raw, 'base64').toString('utf-8');
    const s2 = Buffer.from(s1, 'base64').toString('utf-8');
    const s3 = rot13(s2);
    const s4 = Buffer.from(s3, 'base64').toString('utf-8');
    const json = JSON.parse(s4);
    if (json.o) {
      return Buffer.from(json.o, 'base64').toString('utf-8');
    }
  } catch {}
  return null;
}

/**
 * Checks if a URL points to an intermediate redirector or continue page
 */
export function isIntermediateLink(url, text = '') {
  const lowerUrl = url.toLowerCase();
  const lowerText = text.toLowerCase();

  return (
    lowerText.includes('proceed') ||
    lowerText.includes('continue') ||
    lowerText.includes('get link') ||
    lowerText.includes('download link') ||
    lowerUrl.includes('/links/') ||
    lowerUrl.includes('/go/') ||
    lowerUrl.includes('/redirect') ||
    lowerUrl.includes('greenmotors') ||
    lowerUrl.includes('token=') ||
    lowerUrl.includes('file=ey')
  );
}

/**
 * Discovers provider links and intermediate links from page content
 */
export function discoverLinks(html, currentUrl) {
  const parsed = parseHtml(html, currentUrl);
  if (parsed.isChallenge) {
    return {
      isChallenge: true,
      challenge: parsed.challenge,
      providerLinks: [],
      intermediateLinks: []
    };
  }

  const providerLinks = [];
  const intermediateLinks = [];
  const seenUrls = new Set();

  // Check for decoded mediator destination URL
  const mediatorDestination = decodeMediatorPayload(html);
  if (mediatorDestination) {
    seenUrls.add(mediatorDestination);
    providerLinks.push({
      url: mediatorDestination,
      text: 'Mediator Decoded Destination',
      provider: providerRegistry.getProvider(mediatorDestination).name
    });
  }

  for (const link of parsed.links) {
    const url = link.url;
    if (!url || seenUrls.has(url)) continue;
    seenUrls.add(url);

    // Opaque token preservation: do not decode or alter query strings like ?file=eyJ...
    if (providerRegistry.getProvider(url).name !== 'GENERIC' || url.includes('/file/') || url.includes('/drive/')) {
      providerLinks.push({
        url,
        text: link.text,
        provider: providerRegistry.getProvider(url).name
      });
    } else if (isIntermediateLink(url, link.text)) {
      intermediateLinks.push({
        url,
        text: link.text
      });
    }
  }

  // Also check forms that might submit to an intermediate or provider URL
  for (const form of parsed.forms) {
    if (form.action && !seenUrls.has(form.action)) {
      seenUrls.add(form.action);
      if (providerRegistry.getProvider(form.action).name !== 'GENERIC') {
        providerLinks.push({
          url: form.action,
          text: 'Form Submit',
          inputs: form.inputs,
          provider: providerRegistry.getProvider(form.action).name
        });
      } else {
        intermediateLinks.push({
          url: form.action,
          text: 'Form Action',
          inputs: form.inputs
        });
      }
    }
  }

  return {
    isChallenge: false,
    challenge: null,
    providerLinks,
    intermediateLinks
  };
}

export default { discoverLinks, isIntermediateLink, decodeMediatorPayload };
