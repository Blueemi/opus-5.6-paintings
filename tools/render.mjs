// Renders paintings headlessly to full-resolution PNGs.
//
//   cd tools && npm install
//   node render.mjs                    # all six, into ../renders/
//   node render.mjs aurora strata      # just these
//   node render.mjs aurora --query seed=k3x9qa --out /some/dir
//
// Needs a local Chrome. Set CHROME to its executable if it isn't in the default macOS location.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ALL = ['alpenglow', 'lavender', 'shanshui', 'aurora', 'strata', 'watercolour'];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const opt = (flag, fallback) => {
  const i = args.indexOf(flag);
  if (i < 0) return fallback;
  const value = args[i + 1];
  args.splice(i, 2);
  return value;
};
const query = opt('--query', '');
const outDir = path.resolve(opt('--out', path.join(root, 'renders')));
const names = args.length ? args : ALL;
for (const name of names) {
  if (!ALL.includes(name)) throw new Error(`unknown painting "${name}"; expected one of ${ALL.join(', ')}`);
}
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=metal'],
});

let failed = false;
for (const name of names) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  page.on('pageerror', (e) => console.error(`[${name}] ${e.message}`));
  const url = pathToFileURL(path.join(root, 'paintings', `${name}.html`)).href + (query ? `?${query}` : '');
  const t0 = Date.now();
  await page.goto(url);
  await page.waitForFunction(() => window.__done === true || window.__error, null, { timeout: 300000, polling: 250 });
  const error = await page.evaluate(() => window.__error || null);
  if (error) {
    console.error(`[${name}] failed: ${error}`);
    failed = true;
  } else {
    const dataUrl = await page.evaluate(() => document.getElementById('art').toDataURL('image/png'));
    const out = path.join(outDir, `${name}.png`);
    fs.writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log(`${name}: ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${out}`);
  }
  await page.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
