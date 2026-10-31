// Voice Design helper for Ace Runs! (ElevenLabs text-to-voice). The API key is read from env only.
//
// Preview:  node design_voice.mjs design <outDir> <label> <model_id> <guidance> "<description>" "<text>"
//   Writes <outDir>/<label>_<i>.mp3 and <outDir>/<label>.json (generated_voice_ids, no secrets).
// Save:     node design_voice.mjs save <generated_voice_id> "<voice_name>" "<description>"
//   Saves one chosen preview to the voice library and prints the new voice_id.
import { writeFileSync, mkdirSync } from 'node:fs';

const key = process.env.ELEVENLABS_API_KEY;
if (!key) { console.error('ELEVENLABS_API_KEY missing'); process.exit(2); }
const [mode, ...rest] = process.argv.slice(2);
const API = 'https://api.elevenlabs.io';

async function call(path, body) {
  const res = await fetch(API + path, {
    method: 'POST', headers: { 'xi-api-key': key, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const t = await res.text();
  if (!res.ok) { console.log('ERROR', res.status, t.slice(0, 800)); process.exit(1); }
  return JSON.parse(t);
}

if (mode === 'design') {
  const [outDir, label, model_id, guidance, voice_description, text] = rest;
  mkdirSync(outDir, { recursive: true });
  const body = { voice_description, model_id, guidance_scale: Number(guidance), text, should_enhance: false };
  const d = await call('/v1/text-to-voice/design?output_format=mp3_44100_128', body);
  const meta = { label, model_id, guidance: Number(guidance), voice_description, text: d.text, previews: [] };
  d.previews.forEach((p, i) => {
    const f = `${outDir}/${label}_${i}.mp3`;
    writeFileSync(f, Buffer.from(p.audio_base_64, 'base64'));
    meta.previews.push({ file: f, generated_voice_id: p.generated_voice_id, duration_secs: p.duration_secs, language: p.language });
  });
  writeFileSync(`${outDir}/${label}.json`, JSON.stringify(meta, null, 2));
  console.log(JSON.stringify(meta.previews, null, 1));
} else if (mode === 'save') {
  const [generated_voice_id, voice_name, voice_description] = rest;
  const d = await call('/v1/text-to-voice', { voice_name, voice_description, generated_voice_id });
  console.log(JSON.stringify({ voice_id: d.voice_id, name: d.name }, null, 1));
} else {
  console.error('usage: design_voice.mjs design|save ...');
  process.exit(2);
}
