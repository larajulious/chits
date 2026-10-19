import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { createInstance } from 'i18next';

// Run against a saved catalog directory for a comparable four-language baseline.
// This measures Node resource initialization, not native startup or IME latency.
const directory = process.argv[2] ?? 'src/localization/locales';
const files = readdirSync(directory).filter(file => file.endsWith('.json'));
const raw = files.map(file => readFileSync(`${directory}/${file}`, 'utf8'));
const timings = [];
for (let iteration = 0; iteration < 40; iteration++) {
  const start = performance.now();
  const instance = createInstance();
  void instance.init({
    resources: Object.fromEntries(raw.map((text, index) => [files[index].slice(0, -5), { translation: JSON.parse(text) }])),
    lng: 'en', fallbackLng: 'en', keySeparator: false, initAsync: false,
  });
  timings.push(performance.now() - start);
}
timings.sort((a, b) => a - b);
console.log(JSON.stringify({ node: process.version, languages: files.length, catalogBytes: raw.reduce((sum, text) => sum + Buffer.byteLength(text), 0), gzipCatalogBytes: raw.reduce((sum, text) => sum + gzipSync(text).length, 0), initializationMedianMs: timings[20], initializationP95Ms: timings[38] }, null, 2));
