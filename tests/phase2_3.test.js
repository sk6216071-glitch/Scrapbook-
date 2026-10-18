import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseMetadata } from '../src/parsing/metadata-parser.js';
import { parseSize, normalizeQuality, normalizeCodec } from '../src/utils/normalize.js';
import { parseMirrors } from '../src/parsing/mirror-parser.js';
import { parseSourcePage } from '../src/sources/source-parser.js';
import gdflixProvider from '../src/providers/gdflix.js';
import providerRegistry from '../src/providers/provider-registry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.join(__dirname, '..', 'fixtures');

describe('Phase 2 & 3: Source, Providers, Metadata & Mirrors', () => {
  it('correctly extracts structured metadata from filename', () => {
    const filename = 'Example.Show.2026.S01.2160p.HS.WEB-DL.MULTI.DDPA.5.1.Atmos.H.265.zip';
    const meta = parseMetadata(filename);

    expect(meta.title).toBe('Example Show');
    expect(meta.year).toBe(2026);
    expect(meta.season).toBe(1);
    expect(meta.type).toBe('tv');
    expect(meta.quality).toBe('2160p');
    expect(meta.codec).toBe('H.265');
    expect(meta.format).toBe('zip');
  });

  it('correctly normalizes file sizes', () => {
    const res1 = parseSize('39.47 GB');
    expect(res1.sizeBytes).toBe(42380589793);
    expect(res1.sizeDisplay).toBe('39.47 GB');

    const res2 = parseSize('1.5 MB');
    expect(res2.sizeBytes).toBe(1572864);
    expect(res2.sizeDisplay).toBe('1.5 MB');

    const res3 = parseSize(1024);
    expect(res3.sizeBytes).toBe(1024);
    expect(res3.sizeDisplay).toBe('1 KB');
  });

  it('extracts mirrors from GDFLIX page fixture', () => {
    const gdflixHtml = fs.readFileSync(path.join(fixturesDir, 'gdflix-page.html'), 'utf-8');
    const mirrors = parseMirrors(gdflixHtml, 'https://provider.example/file/9QWlfgZTmmiv837');

    expect(mirrors.length).toBe(2);
    expect(mirrors[0].name).toBe('Mirror 1 - Fast Direct');
    expect(mirrors[0].type).toBe('direct');
    expect(mirrors[1].type).toBe('cloud');
  });

  it('GDFLIX provider matches and parses file info', () => {
    const url = 'https://provider.example/file/9QWlfgZTmmiv837';
    expect(gdflixProvider.match(url)).toBe(true);
    expect(gdflixProvider.extractFileId(url)).toBe('9QWlfgZTmmiv837');

    const gdflixHtml = fs.readFileSync(path.join(fixturesDir, 'gdflix-page.html'), 'utf-8');
    const parsed = gdflixProvider.parse(gdflixHtml, url);

    expect(parsed.provider).toBe('GDFLIX');
    expect(parsed.fileId).toBe('9QWlfgZTmmiv837');
    expect(parsed.sizeDisplay).toBe('39.47 GB');
    expect(parsed.quality).toBe('2160p');
    expect(parsed.codec).toBe('H.265');
    expect(parsed.mirrors.length).toBeGreaterThan(0);
  });

  it('source parser extracts candidate episode/download links', () => {
    const sourceHtml = fs.readFileSync(path.join(fixturesDir, 'source-page.html'), 'utf-8');
    const parsed = parseSourcePage(sourceHtml, 'https://example-authorized-site.test/tvshows/example-show/');

    expect(parsed.title).toContain('Example Show');
    expect(parsed.links.length).toBeGreaterThan(0);
    expect(parsed.links[0].url).toBe('https://example-authorized-site.test/links/intermediate-step');
  });
});
