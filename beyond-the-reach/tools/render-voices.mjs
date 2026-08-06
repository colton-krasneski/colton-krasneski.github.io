/* ============================================================
   Batch-render every spoken line to voices/*.mp3 from the CLI.

     ELEVENLABS_API_KEY=sk_... node tools/render-voices.mjs
     OPENAI_API_KEY=sk-...    node tools/render-voices.mjs --provider openai

   Or put the key in beyond-the-reach/.env.local (gitignored) and just run
   `node tools/render-voices.mjs --provider openai`:

     OPENAI_API_KEY=sk-proj-...
     ELEVENLABS_API_KEY=sk_...

   Flags
     --provider elevenlabs|openai   (default elevenlabs)
     --model <id>                   override the TTS model
     --only rook,thorne             render just these characters
     --limit N                      at most N lines per character (casting audition)
     --force                        re-render lines that already exist
     --dry                          list what would be rendered, call nothing

   Same trick as the in-browser Voice Studio: each line carries the
   character's previous request ids plus the surrounding dialogue, so the
   performance runs continuously instead of resetting every line.
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const outDir = path.join(root, 'voices');
fs.mkdirSync(outDir, { recursive: true });

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : (argv[i + 1] || true); };
const has = n => argv.includes('--' + n);

/* Keys come from the environment or from .env.local — never from this file.
   Anything pasted into source ends up in git the first time you commit. */
const envFile = path.join(root, '.env.local');
if (fs.existsSync(envFile)) {
  // Parsed by hand rather than via process.loadEnvFile so a UTF-8 BOM (which
  // PowerShell's `>` and Notepad both write) doesn't corrupt the first key name.
  const text = fs.readFileSync(envFile, 'utf8').replace(/^﻿/, '');
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*(#|$)/.test(line)) continue;
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, '$2');
  }
}

const provider = flag('provider', 'elevenlabs');
const force = has('force'), dry = has('dry');
const only = flag('only', '') ? String(flag('only', '')).split(',').filter(Boolean) : [];
const envName = provider === 'openai' ? 'OPENAI_API_KEY' : 'ELEVENLABS_API_KEY';
const key = process.env[envName];
const model = flag('model', provider === 'openai' ? 'gpt-4o-mini-tts' : 'eleven_multilingual_v2');

if (!key && !dry) {
  console.error(`No ${envName} found.\n` +
    `  Either:  ${envName}=... node tools/render-voices.mjs --provider ${provider}\n` +
    `  Or put   ${envName}=...   in ${envFile}  (already gitignored)`);
  process.exit(1);
}

/* ---- pull the cast + delivery profiles straight out of voice.js ---- */
const voiceSrc = fs.readFileSync(path.join(root, 'js', 'voice.js'), 'utf8');
const grab = (name) => {
  const i = voiceSrc.indexOf(`const ${name} = {`);
  if (i < 0) throw new Error('cannot find ' + name + ' in voice.js');
  let depth = 0, j = voiceSrc.indexOf('{', i);
  for (let k = j; k < voiceSrc.length; k++) {
    if (voiceSrc[k] === '{') depth++;
    else if (voiceSrc[k] === '}') { depth--; if (!depth) return eval('(' + voiceSrc.slice(j, k + 1) + ')'); }
  }
};
const SUGGESTED = grab('SUGGESTED');
const PROFILE = grab('PROFILE');
const DIRWORD = grab('DIRWORD');
const TAG = grab('TAG');

const cast = Object.assign({}, SUGGESTED[provider] || {},
  JSON.parse(process.env.BTR_CAST || '{}'));

/* ---- the episode ---- */
const EPISODE = eval(fs.readFileSync(path.join(root, 'js', 'episode-01.js'), 'utf8') + '; EPISODE');
let n = 0;
const LINES = [];
for (const b of EPISODE.beats) {
  if (!b.who || !b.line) continue;
  LINES.push({ id: 'ep1_' + (n++), who: b.who, em: b.em || 'neutral', text: b.line });
}
const limit = Number(flag('limit', 0)) || 0;
const seen = {};
const todo = LINES
  .filter(l => !only.length || only.includes(l.who))
  .filter(l => !limit || (seen[l.who] = (seen[l.who] || 0) + 1) <= limit);
const chars = todo.reduce((a, l) => a + l.text.length, 0);
console.log(`${LINES.length} spoken lines · rendering ${todo.length} (~${chars.toLocaleString()} credits) · ${provider} · ${model}`);

if (dry) {
  const byChar = {};
  for (const l of todo) byChar[l.who] = (byChar[l.who] || 0) + 1;
  for (const [k, v] of Object.entries(byChar).sort((a, b) => b[1] - a[1]))
    console.log(`  ${k.padEnd(8)} ${String(v).padStart(3)} lines   voice=${cast[k] || '(uncast)'}`);
  process.exit(0);
}

const lastReq = {};
let ok = 0, skip = 0, fail = 0;

for (let i = 0; i < todo.length; i++) {
  const l = todo[i];
  const file = path.join(outDir, `${l.id}_${l.who}.mp3`);
  if (!force && fs.existsSync(file)) { skip++; continue; }

  const p = PROFILE[l.who] || PROFILE.vo;
  const voice = cast[l.who];
  if (!voice) { console.log(`  SKIP ${l.who} — no voice cast`); fail++; continue; }

  try {
    let res;
    if (provider === 'openai') {
      res = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model, voice, input: l.text, response_format: 'mp3', speed: p.speed,
          instructions: `${p.dir} Deliver this line ${DIRWORD[l.em] || 'naturally'}. This is a line from an animated series; perform it, do not read it.`
        })
      });
    } else {
      const idx = LINES.indexOf(l);
      const prevSame = [...LINES.slice(0, idx)].reverse().find(x => x.who === l.who);
      const body = {
        text: (model === 'eleven_v3' && TAG[l.em] ? TAG[l.em] + ' ' : '') + l.text,
        model_id: model,
        voice_settings: {
          stability: p.stability, similarity_boost: p.similarity_boost,
          style: p.style, use_speaker_boost: true, speed: p.speed
        }
      };
      if (prevSame) body.previous_text = prevSame.text;
      if (LINES[idx + 1]) body.next_text = LINES[idx + 1].text;
      const ids = (lastReq[l.who] || []).slice(-3);
      if (ids.length) body.previous_request_ids = ids;

      res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
        method: 'POST',
        headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const rid = res.headers.get('request-id') || res.headers.get('x-request-id');
      if (rid) (lastReq[l.who] = lastReq[l.who] || []).push(rid);
    }

    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 180)}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    ok++;
    process.stdout.write(`\r  ${i + 1}/${todo.length}  ${l.who.padEnd(7)} ${l.text.slice(0, 46).padEnd(48)}`);
  } catch (e) {
    fail++;
    console.log(`\n  FAIL ${l.id} ${l.who}: ${e.message}`);
    if (/401|403/.test(e.message)) break;
  }
}
console.log(`\n\ndone — ${ok} rendered, ${skip} already present, ${fail} failed`);
console.log(`files in ${outDir}`);
console.log('The player reads its cache from IndexedDB, not this folder — these mp3s are for');
console.log('editing, archiving, or dropping into a video edit.');
