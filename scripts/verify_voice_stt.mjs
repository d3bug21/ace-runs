#!/usr/bin/env node
// Intelligibility check for generated voice lines: transcribes each voice mp3 with ElevenLabs Scribe (scribe_v2)
// and compares it with the manifest `tts` text (word-level LCS similarity). Lines that contain a Kiwi / te reo
// keyword (Kia ora, Ka pai, Chur, kūmara, Ciela, ...) are additionally flagged when that keyword is not heard.
// Writes scripts/voice-stt-check.json (merged per id, so --only re-checks update the existing report).
// Usage: ELEVENLABS_API_KEY=... node scripts/verify_voice_stt.mjs [--only=id,id2|prefix*] [--threshold=0.6] [--concurrency=3]
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'scripts/voice-stt-check.json');
const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) { console.error('ELEVENLABS_API_KEY missing'); process.exit(2); }
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const ONLY = args.only ? String(args.only).split(',') : null;
const THRESH = Number(args.threshold || 0.6);
const CONC = Number(args.concurrency || 3);
const match = (id) => !ONLY || ONLY.some((o) => (o.endsWith('*') ? id.startsWith(o.slice(0, -1)) : id === o));
const entries = JSON.parse(readFileSync(join(ROOT, 'src/audio/manifest.json'), 'utf8')).entries
  .filter((e) => e.kind === 'voice' && match(e.id));

// Accepted spellings for Kiwi words (Scribe writes what an accent sounds like, e.g. "chur" ~ "cheer").
const KEYWORDS = [
  { word: 'kia ora', heard: [/\bkia\s*ora\b/, /\bkiaora\b/] },
  { word: 'ka pai', heard: [/\bka\s*pai\b/, /\bkapai\b/] },
  { word: 'chur', heard: [/\bchur\b/, /\bcheer\b/, /\bcher\b/, /\bcha\b/, /\bchair\b/] }, // non-rhotic Kiwi 'chur' ~ 'cheh'
  { word: 'kumara', heard: [/\bkumara\b/] },
  { word: 'ciela', heard: [/\bciela\b/] }, // see nameAliases(): 'Cielo' and Mandarin 谢啦 (xie la) also count
  { word: 'sweet as', heard: [/\bsweet\s*as\b/] },
  { word: 'choice', heard: [/\bchoice\b/] },
  { word: 'heaps', heard: [/\bheaps\b/] },
];
const plain = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const norm = (s) => plain(s).replace(/\[[^\]]*\]/g, ' ').replace(/-/g, ' ').replace(/[^a-z' ]+/g, ' ').split(/\s+/).filter(Boolean)
  .map((w) => w.replace(/^wh/, 'w').replace(/(.)\1+/g, '$1'));
function similarity(a, b) { // word-level LCS ratio
  const x = norm(a), y = norm(b); if (!x.length) return y.length ? 0 : 1;
  const dp = Array.from({ length: x.length + 1 }, () => new Array(y.length + 1).fill(0));
  for (let i = 1; i <= x.length; i++) for (let j = 1; j <= y.length; j++)
    dp[i][j] = x[i - 1] === y[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  return (2 * dp[x.length][y.length]) / (x.length + y.length);
}
/** Map accepted Kiwi-accent spellings in the transcript back to the expected word before scoring. */
// Ciela is said "SYEH-lah". Scribe writes that sound as 'Ciela' / 'Cielo' (Spanish cie = /sje/) or, when it
// sounds un-English, as Mandarin 谢啦 (xie la = /ɕjɛ la/, two syllables). Calibration: 'See-ella' / 'Celia'
// (three syllables) were transcribed 'Siela' / 'Celia' and never as these forms. See scripts/voices.json.
function nameAliases(expected, heard) {
  return /ciela/i.test(expected) ? heard.replace(/谢\s*[啦拉]|\bcielo\b/gi, 'Ciela') : heard;
}
function canonical(expected, heard) {
  heard = nameAliases(expected, heard);
  const e = norm(expected).join(' ');
  let h = norm(heard).join(' ');
  for (const k of KEYWORDS) if (e.includes(k.word)) for (const r of k.heard) h = h.replace(new RegExp(r.source, 'g'), k.word);
  return h;
}
function missingKeywords(expected, heard) {
  // keyword spellings are matched without the repeated-letter collapse (so 'Ciella' does not pass as 'Ciela')
  const e = norm(expected).join(' '), h = plain(nameAliases(expected, heard)).replace(/[^a-z' ]+/g, ' ');
  return KEYWORDS.filter((k) => e.includes(k.word) && !k.heard.some((r) => r.test(h))).map((k) => k.word);
}
async function scribe(blob, name, language, timestamps) {
  for (let i = 0; i < 5; i++) {
    const fd = new FormData(); fd.append('model_id', 'scribe_v2'); fd.append('language_code', language);
    if (timestamps) fd.append('timestamps_granularity', 'word'); else fd.append('tag_audio_events', 'false');
    fd.append('file', blob, name);
    const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', { method: 'POST', headers: { 'xi-api-key': KEY }, body: fd });
    if (res.ok) return res.json();
    if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 2000 * 2 ** i)); continue; }
    throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  throw new Error('retries exhausted');
}
async function transcribe(file) {
  return scribe(new Blob([readFileSync(file)], { type: 'audio/mpeg' }), basename(file), 'en', true);
}

// Name check for lines that say "Ciela" (SYEH-lah): cut the name word out using Scribe's word timestamps
// (macOS afconvert decode) and read it 3x with Scribe forced to Mandarin. Mandarin writes one character per
// syllable, so 谢啦 / 谢拉 (xie la) = two syllables with the /sj/ glide; three-syllable 'see-EL-ah' style
// calibration takes ('See-ella', 'Celia') never came back as 谢啦.
// The name span = consecutive heard words that are not other words of the expected line (merges 谢 + 啦).
function nameSpan(expected, words) {
  const others = new Set(norm(expected).filter((w) => w !== 'ciela'));
  const spans = []; let cur = null;
  for (const w of words) {
    const t = norm(w.text).join(' ') || w.text.replace(/[\p{P}\s]/gu, '');
    const isOther = t && others.has(t);
    if (!isOther && t) { if (cur) { cur.end = w.end; cur.text += ' ' + w.text; } else { cur = { text: w.text, start: w.start, end: w.end }; spans.push(cur); } }
    else cur = null;
  }
  return spans[0] || words[words.length - 1];
}
function wavSlice(file, t0, t1) {
  const tmp = join(process.env.TMPDIR || '/tmp', `namecheck_${process.pid}_${Math.random().toString(36).slice(2)}.wav`);
  execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', file, tmp]);
  const b = readFileSync(tmp); unlinkSync(tmp);
  let off = 12, data = null; while (off < b.length - 8) { const id = b.toString('ascii', off, off + 4), sz = b.readUInt32LE(off + 4); if (id === 'data') { data = b.subarray(off + 8, off + 8 + sz); break; } off += 8 + sz; }
  const a = Math.max(0, Math.floor(t0 * 16000)) * 2, z = Math.min(data.length, Math.ceil(t1 * 16000) * 2); const pcm = data.subarray(a, z);
  const h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(16000, 24); h.writeUInt32LE(32000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
async function nameCheck(file, words, expected) {
  const ws = (words || []).filter((w) => w.type === 'word'); if (!ws.length) return null;
  const w = nameSpan(expected, ws); const seg = wavSlice(file, w.start - 0.1, w.end + 0.12); const readings = [];
  for (let i = 0; i < 3; i++) readings.push(String((await scribe(new Blob([seg], { type: 'audio/wav' }), 'name.wav', 'zh', false)).text || '').trim());
  const xieLa = readings.filter((r) => /谢\s*[啦拉]/.test(r)).length;
  return { word: w.text, start: w.start, end: w.end, mandarin_readings: readings, xie_la: xieLa, pass: xieLa >= 2 || /^(ciela|cielo)$/i.test(w.text.trim()) };
}

// Groups whose lines are wordless exertion sounds: any clean short vocalisation is acceptable.
const ACCEPT_GROUPS = { jump: 'short exertion interjection (Hup / Wheee / Yah / Hop); Scribe spells these loosely, any clean vocalisation is fine' };
const ACCEPT_IDS = {
  ciela_muscles_2: "'Flex' heard as 'Flix' is the Kiwi vowel, not a mistake",
};
const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { results: [] };
const byId = new Map((prev.results || []).map((r) => [r.id, r]));
const validIds = new Set(JSON.parse(readFileSync(join(ROOT, 'src/audio/manifest.json'), 'utf8')).entries.filter((e) => e.kind === 'voice').map((e) => e.id));
const queue = [...entries];
async function worker() {
  while (queue.length) {
    const e = queue.shift(); const f = join(ROOT, 'public', e.file);
    if (!existsSync(f)) { byId.set(e.id, { id: e.id, speaker: e.speaker, status: 'missing', flag: true }); continue; }
    try {
      const st = await transcribe(f); const heard = String(st.text || '').trim();
      const sim = Number(similarity(e.tts, canonical(e.tts, heard)).toFixed(2));
      let missing = missingKeywords(e.tts, heard);
      const name = /ciela/i.test(e.tts) ? await nameCheck(f, st.words, e.tts) : null;
      if (name) missing = name.pass ? missing.filter((k) => k !== 'ciela') : [...new Set([...missing, 'ciela'])];
      const old = byId.get(e.id);
      byId.set(e.id, { id: e.id, speaker: e.speaker, expected: e.tts, heard, similarity: sim, missing_keywords: missing, ...(name ? { name_check: name } : {}),
        flag: ((name?.pass ? false : sim < THRESH) || missing.length > 0) && !(ACCEPT_GROUPS[e.group] && heard) && !ACCEPT_IDS[e.id],
        ...(ACCEPT_GROUPS[e.group] && (sim < THRESH) ? { accepted: ACCEPT_GROUPS[e.group] } : {}),
        ...(ACCEPT_IDS[e.id] ? { accepted: ACCEPT_IDS[e.id] } : {}),
        checked_at: new Date().toISOString(),
        ...(old && old.note ? { note: old.note } : {}), ...(old && old.history ? { history: old.history } : {}),
        ...(old && old.heard && old.heard !== heard ? { history: [...(old.history || []), { heard: old.heard, similarity: old.similarity }] } : {}) });
    } catch (err) { byId.set(e.id, { id: e.id, speaker: e.speaker, status: 'error', error: err.message, flag: true }); }
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
const results = [...byId.values()].filter((r) => validIds.has(r.id)).sort((a, b) => (a.similarity ?? -1) - (b.similarity ?? -1));
const flagged = results.filter((r) => r.flag);
writeFileSync(OUT, JSON.stringify({ checked_at: new Date().toISOString(), model: 'scribe_v2', threshold: THRESH,
  ...(prev.first_pass ? { first_pass: prev.first_pass } : {}), ...(prev.fixes ? { fixes: prev.fixes } : {}), ...(prev.ciela_rename ? { ciela_rename: prev.ciela_rename } : {}),
  summary: { checked: results.length, flagged: flagged.length, mean_similarity: Number((results.reduce((s, r) => s + (r.similarity || 0), 0) / (results.length || 1)).toFixed(3)) },
  results }, null, 2) + '\n');
for (const r of flagged) console.log(r.id, r.similarity ?? r.status, r.missing_keywords?.length ? `missing[${r.missing_keywords}]` : '', '| expected:', r.expected, '| heard:', r.heard ?? r.error);
console.log(`checked ${entries.length} now; report has ${results.length}, flagged ${flagged.length}`);
