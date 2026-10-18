#!/usr/bin/env node
import { parseSize, normalizeQuality, normalizeCodec } from './utils/normalize.js';
import { parseMetadata } from './parsing/metadata-parser.js';

console.log('Authorized Metadata Scraper CLI Utility');

const sample = process.argv[2] || 'Example.Show.2026.S01.2160p.HS.WEB-DL.MULTI.DDPA.5.1.Atmos.H.265.zip';
console.log(`Analyzing: ${sample}`);
const metadata = parseMetadata(sample);
console.log('Result:', JSON.stringify(metadata, null, 2));
