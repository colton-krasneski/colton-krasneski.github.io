/* Visual smoke-test: screenshots the browse page and a set of frames.
   node tools/shots.mjs [outDir] [indexHtml]      (needs `npm i playwright`) */
import { chromium } from 'playwright';
import path from 'node:path';
import url from 'node:url';
import fs from 'node:fs';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const out = process.argv[2] || path.join(here, '..', '_shots');
const indexHtml = process.argv[3] || path.join(here, '..', 'index.html');
fs.mkdirSync(out, { recursive: true });

async function launch() {
  for (const opt of [{}, { channel: 'msedge' }, { channel: 'chrome' }]) {
    try { return await chromium.launch(opt); } catch (e) { /* try next */ }
  }
  throw new Error('no chromium available — run: npx playwright install chromium');
}
const page = await (await launch()).newPage({ viewport: { width: 1600, height: 900 } });
const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });

await page.goto(url.pathToFileURL(indexHtml).href);
await page.waitForTimeout(900);
await page.screenshot({ path: path.join(out, '00-browse.png') });
await page.evaluate(() => scrollTo(0, 620));
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(out, '01-episodes.png') });
await page.evaluate(() => scrollTo(0, 0));

const info = await page.evaluate(() => ({ total: BTR.total, beats: BTR.TL.length, lines: BTR.lines.length }));
console.log(`runtime ${Math.floor(info.total / 60)}:${String(Math.round(info.total) % 60).padStart(2, '0')}  ·  ${info.beats} beats  ·  ${info.lines} spoken lines`);

await page.evaluate(() => { BTR.openPlayer(); BTR.pause(); });
await page.waitForTimeout(400);

/* Pick real beats out of the timeline rather than guessing timestamps:
   each entry is [label, predicate-source] evaluated in the page. */
const WANT = [
  ['02-coldopen-reach', `b.sc==='reach_dawn' && b.who`],
  ['03-burning-ship', `b.sc==='burning_ship'`],
  ['04-hallow-cu', `b.who==='hallow' && b.shot==='cu'`],
  ['05-op-logo', `b.op && b.title && b.title.l2`],
  ['06-op-cast', `b.op && b.title && /THORNE/.test(b.title.sub||'')`],
  ['07-op-group', `b.op && b.chars && b.chars.length>2`],
  ['08-saltmarrow', `b.sc==='saltmarrow_dawn' && b.card`],
  ['09-nell-cu', `b.who==='nell' && b.shot==='cu'`],
  ['10-market', `b.sc==='market_day'`],
  ['11-sanctity', `b.sc==='sanctity_hull'`],
  ['12-ardent-cu', `b.who==='ardent' && b.shot==='cu'`],
  ['13-twoshot', `b.shot==='two' && b.sc==='square_tithe'`],
  ['14-seacave', `b.sc==='seacave' && !b.who`],
  ['15-compass', `b.shot==='insert' && b.sc==='seacave'`],
  ['16-harbor-night', `b.sc==='harbor_night' && b.card`],
  ['17-tavern-wide', `b.sc==='tavern' && b.shot==='wide' && b.card`],
  ['18-thorne-cu', `b.who==='thorne' && b.shot==='cu'`],
  ['19-raid', `b.sc==='tavern_raid' && b.who`],
  ['20-roofs', `b.sc==='roofs_night' && b.chars`],
  ['21-dock-confront', `b.sc==='dock_confront' && b.chars && b.chars.length>1 && b.chars[0].fig`],
  ['22-crane', `b.sc==='crane_top' && b.who`],
  ['23-flag', `b.sc==='gull_deck_flag' && !b.op`],
  ['24-gull-deck', `b.sc==='gull_deck' && b.shot==='two'`],
  ['25-open-sea', `b.sc==='open_sea_dawn' && b.shot==='two'`],
  ['26-ed', `b.chapter==='Ending'`]
];
const MARKS = [];
for (const [name, pred] of WANT) {
  const t = await page.evaluate(p => {
    const b = BTR.TL.find(b => { try { return eval(p) } catch (e) { return false } });
    return b ? b.t + Math.min(1.2, b.dur * .45) : null;
  }, pred);
  if (t == null) console.log('  (no beat matched ' + name + ')');
  else MARKS.push([name, t]);
}
for (const [name, t] of MARKS) {
  await page.evaluate(tt => BTR.seek(tt), t);
  await page.waitForTimeout(420);
  await page.screenshot({ path: path.join(out, name + '.png'), clip: { x: 0, y: 0, width: 1600, height: 842 } });
}

console.log(errs.length ? errs.slice(0, 12).join('\n') : 'no page errors');
console.log('shots →', out);
process.exit(0);
