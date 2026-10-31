#!/usr/bin/env node
// Ace Runs! audio generator (ElevenLabs). Node 26, built-in fetch, no dependencies.
//
// Reads src/audio/manifest.json and writes every entry to public/<file>.
// Entries with `variants: N` are written as <name>_1.mp3 ... <name>_N.mp3 (no un-suffixed file).
//
//   ELEVENLABS_API_KEY=... node scripts/generate_audio.mjs [--force] [--only=id,id2|prefix*] [--kind=voice|sfx|ambience|music]
//                                                         [--concurrency=3] [--dry-run] [--verify-only]
//
// - Idempotent: files that already exist and pass the MP3 sanity check are skipped unless --force.
// - Retries with exponential backoff on 429 / 5xx / network errors (honours retry-after).
// - Sanity-checks each output (valid MPEG audio frames, plausible duration and size) and regenerates failures.
// - Writes a non-secret log to scripts/audio-generation-log.json. The API key is read only from
//   process.env.ELEVENLABS_API_KEY and is never logged or written anywhere.

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, unlinkSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = join(ROOT, 'src/audio/manifest.json');
const PUBLIC = join(ROOT, 'public');
const LOG = join(ROOT, 'scripts/audio-generation-log.json');
const API = 'https://api.elevenlabs.io';

// ------------------------------------------------------------------ configuration
// Voice ids / models / settings live in scripts/voices.json (non-secret).
const VOICES = JSON.parse(readFileSync(join(ROOT, 'scripts/voices.json'), 'utf8'));
delete VOICES._note;
const VOICE_FORMAT = 'mp3_44100_96';
const SFX_FORMAT = 'mp3_44100_96';
const MUSIC_FORMAT = 'mp3_44100_128';
const SFX_MODEL = 'eleven_text_to_sound_v2';
const MUSIC_MODEL = 'music_v2_5';

// Light eleven_v3 delivery tags for the two kids, prepended in the request only (manifest text is unchanged).
const KID_TAG_DEFAULT = '[excited]';
const KID_TAGS_BY_GROUP = {
  idle: '[cheerful]', results_ok: '[cheerful]', bounce_back: '[cheerful]', tummy_happy: '[cheerful]', refresh: '[cheerful]',
  vision: '[amazed]', new_food: '[amazed]', unlock: '[amazed]',
  bump: '[giggles]', teeth: '[giggles]', tummy: '[giggles]', freeze: '[giggles]',
  slow: '[sighs]',
  cooldown_go: '[cheerful]', cooldown_done: '[cheerful]', // calm, happy cool-down
};
// Per-line tag overrides chosen from the Scribe STT experiments (see scripts/voice-stt-check.json).
const KID_TAGS_BY_ID = {
  ace_hello_1: '[cheerful]', // 'Kia ora' was heard clearly far more often with a calmer delivery + hyphenation
  ciela_near_miss_1: '[relieved]', // '[excited] Phew!' came out as a sneeze-like sound
  ciela_start_2: '[cheerful]', // keeps the Kiwi 'eh' audible
  ciela_stretch_cheer_2: '[cheerful]', // '[excited] Ka pai!' came out as 'Cup high' in 3/3 takes
  ciela_hello_2: '[cheerful]', // calmer delivery keeps "Syeh-lah" two clean syllables
};

// Request-only punctuation tweaks where the STT check showed a word being swallowed or misheard.
// Words are unchanged; the manifest `tts` stays the source of truth.
const TTS_REQUEST_OVERRIDES = {
  ace_hello_1: "Ki-a o-ra! I'm Ace!", // Ace's voice blurred 'Kia ora' into 'Yoda'/'Chona' without the syllable breaks
  // Ciela is said "SYEH-lah" (two syllables, sy-glide). Request-only respellings chosen from Scribe experiments
  // (see scripts/voices.json -> ciela.pronunciation); the manifest text still says "Ciela".
  ciela_hello_1: "Ki-a o-ra... I'm Sieh-lah!", // syllable breaks + pause keep 'Kia ora' clear; 'Sieh-lah' heard as 'Ciela' 3/3
  ciela_hello_2: "Hi! Syeh-lah... here! Let's have some fun!", // pause after the name; heard 'Ciela', Mandarin read 2 syllables
  narrator_char_ciela_1: 'Syeh-lah!', // Jessie: heard as Mandarin 谢啦 'xie la' = /ɕjɛ la/
  ace_yum_5: 'Mmm... crunchy!', // pause stops 'crunchy' being clipped ('crotchy')
  ace_shield_1: 'Germs... bounce off!', // pause keeps the 'r' colour of 'germs' ('gems')
};

const SFX_TONE = 'Gentle, playful, kid-friendly cartoon sound, clean, no music, no voice.';
const LOOP_TONE = 'Clear and present, steady and continuous, seamless loop with no start or end, no music, no voice.';
const MUSIC_LOOP_HINT =
  'Loop-friendly background music for a children\'s game: steady consistent groove and tempo throughout, ' +
  'no long intro, no fade-out, no big ending or final chord, so the end flows straight back into the start. No vocals.';

// ------------------------------------------------------------------ cli
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true];
}));
const FORCE = !!args.force;
const DRY = !!args['dry-run'];
const VERIFY_ONLY = !!args['verify-only'];
const CONCURRENCY = Number(args.concurrency || 3);
const ONLY = args.only ? String(args.only).split(',') : null;
const KIND = args.kind || null;
const BEST_OF = Math.max(1, Number(args['best-of'] || 1)); // voice only: keep the take Scribe hears best
const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY && !DRY && !VERIFY_ONLY) { console.error('ELEVENLABS_API_KEY is not set in the environment.'); process.exit(2); }

// ------------------------------------------------------------------ mp3 sanity check
const BR = { // kbps tables [version][layer]
  1: { 3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320] },
  2: { 3: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160] },
};
const SR = { 1: [44100, 48000, 32000], 2: [22050, 24000, 16000], 2.5: [11025, 12000, 8000] };
export function inspectMp3(buf) {
  let off = 0;
  if (buf.length >= 10 && buf.toString('latin1', 0, 3) === 'ID3') {
    const sz = (buf[6] << 21) | (buf[7] << 14) | (buf[8] << 7) | buf[9];
    off = 10 + sz;
  }
  const start = off; let frames = 0, seconds = 0, bytesInFrames = 0, sampleRate = 0, kbpsSum = 0, resyncs = 0;
  while (off + 4 <= buf.length) {
    const h = buf.readUInt32BE(off);
    if ((h >>> 21) !== 0x7ff) { off++; resyncs++; if (resyncs > 4096) break; continue; }
    const verBits = (h >>> 19) & 3, layerBits = (h >>> 17) & 3, brIdx = (h >>> 12) & 15, srIdx = (h >>> 10) & 3, pad = (h >>> 9) & 1;
    const ver = verBits === 3 ? 1 : verBits === 2 ? 2 : verBits === 0 ? 2.5 : null;
    if (!ver || layerBits !== 1 || brIdx === 0 || brIdx === 15 || srIdx === 3) { off++; resyncs++; continue; }
    const kbps = BR[ver === 1 ? 1 : 2][3][brIdx]; const sr = SR[ver][srIdx];
    const spf = ver === 1 ? 1152 : 576;
    const len = Math.floor((spf / 8) * kbps * 1000 / sr) + pad;
    if (len < 24 || off + len > buf.length + 1) break;
    frames++; seconds += spf / sr; bytesInFrames += len; sampleRate = sr; kbpsSum += kbps; off += len;
  }
  return {
    frames, duration: Number(seconds.toFixed(3)), sampleRate,
    avgKbps: frames ? Math.round(kbpsSum / frames) : 0,
    frameCoverage: buf.length - start > 0 ? Number((bytesInFrames / (buf.length - start)).toFixed(3)) : 0,
  };
}

function expectedDuration(e) {
  if (e.kind === 'voice') return { min: 0.3, max: 20 };
  if (e.kind === 'sfx') { const d = Math.max(0.5, e.duration || 1); return { min: 0.25, max: d + 3 }; }
  if (e.kind === 'ambience') { const d = Math.min(30, e.duration || 22); return { min: d * 0.8, max: d + 3 }; }
  const d = e.duration || 60; return { min: Math.min(25, d * 0.75), max: d * 1.35 + 5 };
}
function check(buf, e) {
  if (!buf || buf.length < 1500) return `too small (${buf ? buf.length : 0} bytes)`;
  if (buf.length > 4 * 1024 * 1024) return `too large (${buf.length} bytes > 4 MiB)`;
  const info = inspectMp3(buf);
  if (info.frames < 10) return `not a valid MP3 (${info.frames} frames)`;
  if (info.frameCoverage < 0.9) return `MP3 frame coverage low (${info.frameCoverage})`;
  const { min, max } = expectedDuration(e);
  if (info.duration < min || info.duration > max) return `implausible duration ${info.duration}s (expected ${min}-${max}s)`;
  return null;
}

// ------------------------------------------------------------------ http
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
class ApiError extends Error { constructor(status, body) { super(`HTTP ${status}: ${body.slice(0, 400)}`); this.status = status; this.body = body; } }
async function post(path, body, attempts = 6) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(API + path, {
        method: 'POST', headers: { 'xi-api-key': KEY, 'content-type': 'application/json', accept: 'audio/mpeg' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(300_000),
      });
      if (res.ok) return { buf: Buffer.from(await res.arrayBuffer()), headers: res.headers };
      const text = await res.text();
      last = new ApiError(res.status, text);
      if (res.status !== 429 && res.status < 500) throw last;
      const ra = Number(res.headers.get('retry-after'));
      await sleep(ra > 0 ? ra * 1000 : Math.min(60_000, 2000 * 2 ** i) + Math.random() * 1000);
    } catch (err) {
      if (err instanceof ApiError && err.status !== 429 && err.status < 500) throw err;
      last = err; await sleep(Math.min(60_000, 2000 * 2 ** i) + Math.random() * 1000);
    }
  }
  throw last;
}

// ------------------------------------------------------------------ per-kind generation
let musicUnavailable = null; // set to a reason string if the Music API is refused on this account
const modelFallback = {}; // speaker -> fallback TTS model id once the preferred model is refused

function requestFor(e, take) {
  if (e.kind === 'voice') {
    const v = VOICES[e.speaker];
    if (!v) throw new Error(`unknown speaker ${e.speaker}`);
    const model_id = modelFallback[e.speaker] || v.model_id;
    let text = TTS_REQUEST_OVERRIDES[e.id] || e.tts;
    if ((e.speaker === 'ace' || e.speaker === 'ciela') && model_id === 'eleven_v3') {
      text = `${KID_TAGS_BY_ID[e.id] || KID_TAGS_BY_GROUP[e.group] || KID_TAG_DEFAULT} ${text}`;
    }
    return {
      endpoint: `/v1/text-to-speech/${v.voice_id}?output_format=${VOICE_FORMAT}`,
      body: { text, model_id, voice_settings: v.voice_settings },
      meta: { endpoint: '/v1/text-to-speech', model_id, voice_id: v.voice_id, voice_name: v.name, output_format: VOICE_FORMAT, request_text: text,
        ...(modelFallback[e.speaker] ? { model_fallback_from: v.model_id } : {}) },
    };
  }
  if (e.kind === 'sfx' || e.kind === 'ambience' || (e.kind === 'music' && musicUnavailable)) {
    const isAmb = e.kind !== 'sfx';
    const loop = isAmb || !!e.loop;
    const duration = isAmb ? Math.min(30, e.duration || 22) : Math.max(0.5, Math.min(30, e.duration || 1));
    const prompt = e.kind === 'music'
      ? `${e.prompt}. Seamlessly looping instrumental music bed, steady tempo.`
      : isAmb ? `${e.prompt}. Continuous, steady and clearly audible throughout, soft and friendly, no sudden loud sounds.` : `${e.prompt}. ${loop ? LOOP_TONE : SFX_TONE}`;
    const body = { text: prompt, model_id: SFX_MODEL, duration_seconds: duration, prompt_influence: isAmb ? 0.4 : 0.5, loop };
    return {
      endpoint: `/v1/sound-generation?output_format=${SFX_FORMAT}`, body,
      meta: { endpoint: '/v1/sound-generation', model_id: SFX_MODEL, output_format: SFX_FORMAT, duration_seconds: duration, loop, prompt, ...(e.kind === 'music' ? { music_fallback: musicUnavailable } : {}) },
    };
  }
  if (e.kind === 'music') {
    const ms = Math.round(Math.max(30, Math.min(75, e.duration || 60)) * 1000);
    const prompt = `${e.prompt}. ${MUSIC_LOOP_HINT}`;
    return {
      endpoint: `/v1/music?output_format=${MUSIC_FORMAT}`,
      body: { prompt, music_length_ms: ms, model_id: MUSIC_MODEL, force_instrumental: true },
      meta: { endpoint: '/v1/music', model_id: MUSIC_MODEL, output_format: MUSIC_FORMAT, music_length_ms: ms, force_instrumental: true, prompt },
    };
  }
  throw new Error(`unknown kind ${e.kind}`);
}

async function generateOne(job) {
  const { e, out, rel, take } = job;
  const started = Date.now();
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const req = requestFor(e, take);
    try {
      const { buf, headers } = await post(req.endpoint, req.body);
      const problem = check(buf, e);
      if (problem) { lastErr = `sanity check failed: ${problem}`; console.warn(`  ! ${rel} attempt ${attempt}: ${lastErr}`); continue; }
      mkdirSync(dirname(out), { recursive: true });
      const part = out + '.part'; writeFileSync(part, buf); renameSync(part, out);
      const info = inspectMp3(buf);
      return { id: e.id, kind: e.kind, file: rel, take, status: 'ok', bytes: buf.length, ...info, ...req.meta,
        request_id: headers.get('request-id') || undefined, attempts: attempt, ms: Date.now() - started, generated_at: new Date().toISOString() };
    } catch (err) {
      lastErr = err.message;
      if (e.kind === 'music' && !musicUnavailable && err instanceof ApiError && [401, 402, 403, 404].includes(err.status)) {
        musicUnavailable = `Music API refused (HTTP ${err.status}): ${err.body.slice(0, 200)}`;
        console.warn(`  ! Music API unavailable, falling back to looping sound-effects beds. ${musicUnavailable}`);
        continue;
      }
      const v = e.kind === 'voice' ? VOICES[e.speaker] : null;
      if (v && v.fallback_model_id && !modelFallback[e.speaker] && err instanceof ApiError && [400, 403, 404, 422].includes(err.status)) {
        modelFallback[e.speaker] = v.fallback_model_id;
        console.warn(`  ! ${v.model_id} refused for ${e.speaker} (HTTP ${err.status}); falling back to ${v.fallback_model_id}`);
        continue;
      }
      if (err instanceof ApiError && err.status === 422 && attempt < 3) { console.warn(`  ! ${rel}: ${lastErr}`); }
      else if (err instanceof ApiError) break;
    }
  }
  return { id: e.id, kind: e.kind, file: rel, take, status: 'error', error: lastErr, ms: Date.now() - started, generated_at: new Date().toISOString() };
}

// ------------------------------------------------------------------ best-of-N voice takes (Scribe scored)
const KEYWORDS = [
  { word: 'kia ora', heard: /\bkia\s*ora\b/ },
  { word: 'ka pai', heard: /\bka\s*pai\b/ },
  { word: 'chur', heard: /\b(chur|cha|chair|cher|cheer)\b/ },
  { word: 'ciela', heard: /\bciela\b/ },
];
const plain = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const words = (s) => plain(s).replace(/\[[^\]]*\]/g, ' ').replace(/-/g, ' ').replace(/[^a-z' ]+/g, ' ').split(/\s+/).filter(Boolean)
  .map((w) => w.replace(/^wh/, 'w').replace(/(.)\1+/g, '$1'));
function lcsRatio(x, y) {
  if (!x.length) return y.length ? 0 : 1;
  const dp = Array.from({ length: x.length + 1 }, () => new Array(y.length + 1).fill(0));
  for (let i = 1; i <= x.length; i++) for (let j = 1; j <= y.length; j++)
    dp[i][j] = x[i - 1] === y[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  return (2 * dp[x.length][y.length]) / (x.length + y.length);
}
function scoreStt(expected, heard) {
  if (/ciela/i.test(expected)) heard = heard.replace(/谢\s*[啦拉]|\bcielo\b/gi, 'Ciela'); // see verify_voice_stt.mjs nameAliases()
  const e = words(expected).join(' '), h = plain(heard).replace(/[^a-z' ]+/g, ' '); // keywords: no repeated-letter collapse
  const missing = KEYWORDS.filter((k) => e.includes(k.word) && !k.heard.test(h)).map((k) => k.word);
  const sim = lcsRatio(words(expected), words(heard));
  return { sim: Number(sim.toFixed(2)), missing, score: sim - missing.length };
}
async function transcribe(file) {
  for (let i = 0; i < 5; i++) {
    const fd = new FormData(); fd.append('model_id', 'scribe_v2'); fd.append('language_code', 'en');
    fd.append('file', new Blob([readFileSync(file)], { type: 'audio/mpeg' }), 'take.mp3');
    const res = await fetch(API + '/v1/speech-to-text', { method: 'POST', headers: { 'xi-api-key': KEY }, body: fd });
    if (res.ok) return String((await res.json()).text || '').trim();
    if (res.status === 429 || res.status >= 500) { await sleep(2000 * 2 ** i); continue; }
    return '';
  }
  return '';
}
async function bestOfVoice(job) {
  let best = null; const tmps = [];
  for (let t = 1; t <= BEST_OF; t++) {
    const tmp = `${job.out}.take${t}`;
    const r = await generateOne({ ...job, out: tmp });
    if (r.status !== 'ok') { if (!best) best = { r, tmp: null, score: -Infinity }; continue; }
    tmps.push(tmp);
    const heard = await transcribe(tmp);
    const s = scoreStt(job.e.tts, heard);
    r.stt = { heard, similarity: s.sim, missing_keywords: s.missing, takes_tried: t, best_of: BEST_OF };
    console.log(`    take ${t}: "${heard}" sim ${s.sim}${s.missing.length ? ` missing ${s.missing}` : ''}`);
    if (!best || s.score > best.score) best = { r, tmp, score: s.score };
    if (s.sim >= 0.999 && !s.missing.length) break;
  }
  if (best && best.tmp) { renameSync(best.tmp, job.out); best.r.stt.takes_tried = tmps.length; }
  for (const f of tmps) if (f !== best?.tmp && existsSync(f)) unlinkSync(f);
  return best.r;
}

// ------------------------------------------------------------------ main
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const entries = manifest.entries.filter((e) => (!KIND || e.kind === KIND) && (!ONLY || ONLY.some((o) => o.endsWith('*') ? e.id.startsWith(o.slice(0, -1)) : e.id === o)));
const jobs = [];
for (const e of entries) {
  const n = e.variants || 0;
  const takes = n ? Array.from({ length: n }, (_, i) => i + 1) : [0];
  for (const take of takes) {
    const rel = take ? e.file.replace(/(\.[a-z0-9]+)$/i, `_${take}$1`) : e.file;
    jobs.push({ e, take, rel, out: join(PUBLIC, rel) });
  }
}

const log = existsSync(LOG) ? JSON.parse(readFileSync(LOG, 'utf8')) : { files: {} };
log.files ||= {};
let todo = [];
for (const j of jobs) {
  if (existsSync(j.out) && !FORCE) {
    const buf = readFileSync(j.out); const problem = check(buf, j.e);
    if (!problem) { const prev = log.files[j.rel]; log.files[j.rel] = { ...(prev || { id: j.e.id, kind: j.e.kind, file: j.rel, take: j.take, status: 'ok' }), bytes: buf.length, ...inspectMp3(buf) }; continue; }
    console.warn(`existing ${j.rel} fails check (${problem}); regenerating`);
  }
  todo.push(j);
}
console.log(`${jobs.length} files in selection, ${jobs.length - todo.length} already present, ${todo.length} to generate${DRY ? ' (dry run)' : ''}.`);
if (VERIFY_ONLY) todo = [];
if (DRY) { for (const j of todo) console.log(' -', j.rel, JSON.stringify(requestFor(j.e, j.take).body).slice(0, 160)); process.exit(0); }

let done = 0;
async function worker() {
  while (todo.length) {
    const j = todo.shift();
    const r = BEST_OF > 1 && j.e.kind === 'voice' ? await bestOfVoice(j) : await generateOne(j);
    log.files[j.rel] = r; done++;
    console.log(`[${done}] ${r.status === 'ok' ? 'ok ' : 'ERR'} ${j.rel}${r.status === 'ok' ? ` ${r.bytes}B ${r.duration}s` : ` ${r.error}`}`);
    saveLog();
  }
}
function saveLog() {
  // Remove log rows for files that are no longer part of the manifest.
  const valid = new Set(manifest.entries.flatMap((e) => e.variants ? Array.from({ length: e.variants }, (_, i) => e.file.replace(/(\.[a-z0-9]+)$/i, `_${i + 1}$1`)) : [e.file]));
  for (const k of Object.keys(log.files)) if (!valid.has(k)) delete log.files[k];
  const rows = Object.values(log.files);
  const present = [...valid].filter((f) => existsSync(join(PUBLIC, f)));
  const totalBytes = present.reduce((s, f) => s + statSync(join(PUBLIC, f)).size, 0);
  log.updated_at = new Date().toISOString();
  log.voices = Object.fromEntries(Object.entries(VOICES).map(([k, v]) => [k, { voice_id: v.voice_id, name: v.name, source: v.source, model_id: modelFallback[k] || v.model_id, voice_settings: v.voice_settings }]));
  log.formats = { voice: VOICE_FORMAT, sfx: SFX_FORMAT, ambience: SFX_FORMAT, music: MUSIC_FORMAT, sfx_model: SFX_MODEL, music_model: MUSIC_MODEL };
  if (musicUnavailable) log.music_fallback = musicUnavailable;
  log.summary = { expected_files: valid.size, present_files: present.length, total_bytes: totalBytes,
    errors: rows.filter((r) => r.status !== 'ok').map((r) => ({ file: r.file, error: r.error })),
    missing: [...valid].filter((f) => !existsSync(join(PUBLIC, f))) };
  const tmp = LOG + '.part'; writeFileSync(tmp, JSON.stringify(log, null, 2) + '\n'); renameSync(tmp, LOG);
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length || 1) }, worker));
saveLog();
const s = log.summary;
console.log(`Done. present ${s.present_files}/${s.expected_files}, total ${(s.total_bytes / 1048576).toFixed(2)} MiB, errors ${s.errors.length}, missing ${s.missing.length}.`);
process.exit(s.errors.length || s.missing.length ? 1 : 0);
