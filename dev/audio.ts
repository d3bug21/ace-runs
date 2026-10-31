// Dev sandbox for the AudioManager: buttons for every voice group, effect, bed and ride loop,
// plus a self-test (window.__audioSelfTest) that decodes every bundled file and checks loop seams.
import { AudioManager, bakeLoop, type AudioEntry, type Bus, type LoopHandle, type Speaker } from '../src/audio/AudioManager';
import manifestJson from '../src/audio/manifest.json';

const entries = (manifestJson as unknown as { entries: AudioEntry[] }).entries;
const am = new AudioManager('../');
const $ = (id: string) => document.getElementById(id) as HTMLElement;
const status = $('status');
const groupsEl = $('groups');

addEventListener('pointerdown', () => am.unlock());
addEventListener('keydown', () => am.unlock());
am.onVoiceStart = (speaker, group, text, dur) => {
  $('sub').textContent = `${speaker} / ${group}: "${text}" (${dur.toFixed(2)} s)`;
};

function section(title: string): HTMLElement {
  const h = document.createElement('h2');
  h.textContent = title;
  const row = document.createElement('div');
  row.className = 'row';
  groupsEl.append(h, row);
  return row;
}
function button(row: HTMLElement, label: string, fn: (b: HTMLButtonElement) => void): void {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', () => {
    am.unlock();
    fn(b);
  });
  row.append(b);
}

for (const bus of ['music', 'voice', 'sfx'] as Bus[]) {
  const l = document.createElement('label');
  const r = document.createElement('input');
  r.type = 'range';
  r.min = '0';
  r.max = '1';
  r.step = '0.05';
  r.value = String(am.getVolume(bus));
  r.addEventListener('input', () => am.setVolume(bus, Number(r.value)));
  l.append(bus, r);
  $('vols').append(l);
}
const ctl = section('controls');
button(ctl, 'stop voices', () => am.stopVoices());
button(ctl, 'music off', () => am.playMusic(null));
button(ctl, 'ambience off', () => am.playAmbience(null));
button(ctl, 'duck 0.5', (b) => {
  const on = !b.classList.contains('on');
  b.classList.toggle('on', on);
  am.setDuck(on ? 0.5 : 0);
});
button(ctl, 'suspend', () => am.suspend());
button(ctl, 'resume', () => am.resume());

for (const sp of ['ace', 'ciela', 'narrator'] as Speaker[]) {
  const row = section(`voice: ${sp}`);
  for (const g of am.voiceGroupsOf(sp)) button(row, g, () => am.playVoice(sp, g, { priority: true }));
}
const sfxRow = section('sfx');
for (const e of entries.filter((x) => x.kind === 'sfx' && !x.loop)) button(sfxRow, e.id + (e.variants ? ` x${e.variants}` : ''), () => am.playSfx(e.id));
const loops = new Map<string, LoopHandle>();
const loopRow = section('ride loops');
for (const e of entries.filter((x) => x.kind === 'sfx' && x.loop)) {
  button(loopRow, e.id, (b) => {
    const on = !b.classList.contains('on');
    loopRow.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
    b.classList.toggle('on', on);
    loops.get('ride')?.stop();
    loops.delete('ride');
    if (on) {
      const h = am.loop('ride', e.id, 0.9);
      if (h) loops.set('ride', h);
    }
  });
}
const ambRow = section('ambience');
for (const e of entries.filter((x) => x.kind === 'ambience')) button(ambRow, e.id, () => am.playAmbience(e.id));
const musRow = section('music');
for (const e of entries.filter((x) => x.kind === 'music')) button(musRow, e.id, () => am.playMusic(e.id));

const files = entries.flatMap((e) =>
  e.variants ? Array.from({ length: e.variants }, (_, i) => e.file.replace(/(\.[a-z0-9]+)$/i, `_${i + 1}$1`)) : [e.file],
);
status.textContent = `${entries.length} manifest entries, ${files.length} files`;

interface SelfTest {
  files: number;
  decoded: number;
  failed: string[];
  totalSeconds: number;
  seams: { id: string; jump: number; typical: number; ratio: number; loopSeconds: number; srcSeconds: number }[];
}
/** Decodes every file and measures the loop seam of every looping entry (dev evidence). */
async function selfTest(): Promise<SelfTest> {
  const ctx = new OfflineAudioContext(2, 44100, 44100);
  const out: SelfTest = { files: files.length, decoded: 0, failed: [], totalSeconds: 0, seams: [] };
  const decode = async (f: string) => {
    try {
      const r = await fetch(new URL(f, new URL('../', document.baseURI)).href);
      if (!r.ok) throw new Error(String(r.status));
      return await ctx.decodeAudioData(await r.arrayBuffer());
    } catch {
      out.failed.push(f);
      return null;
    }
  };
  const loopIds = new Map(entries.filter((e) => e.loop).map((e) => [e.file, e]));
  for (let i = 0; i < files.length; i += 8) {
    await Promise.all(
      files.slice(i, i + 8).map(async (f) => {
        const b = await decode(f);
        if (!b) return;
        out.decoded++;
        out.totalSeconds += b.duration;
        const e = loopIds.get(f);
        if (!e) return;
        const xf = e.kind === 'music' ? 2.5 : e.kind === 'ambience' ? 1.5 : 0.08;
        const baked = bakeLoop(ctx, b, xf, e.kind !== 'sfx');
        const d = baked.getChannelData(0);
        const n = d.length;
        let typical = 0;
        for (let k = 1; k < n; k += 97) typical += Math.abs(d[k] - d[k - 1]);
        typical /= Math.floor(n / 97);
        const jump = Math.abs(d[0] - d[n - 1]);
        out.seams.push({ id: e.id, jump: +jump.toFixed(4), typical: +typical.toFixed(4), ratio: +(jump / (typical || 1e-6)).toFixed(2), loopSeconds: +baked.duration.toFixed(2), srcSeconds: +b.duration.toFixed(2) });
      }),
    );
    status.textContent = `self-test: decoded ${out.decoded}/${files.length}...`;
  }
  status.textContent = `self-test: decoded ${out.decoded}/${files.length}, failed ${out.failed.length}, ${(out.totalSeconds / 60).toFixed(1)} min of audio`;
  return out;
}
(window as unknown as { __audioSelfTest: typeof selfTest; __am: AudioManager }).__audioSelfTest = selfTest;
(window as unknown as { __am: AudioManager }).__am = am;
