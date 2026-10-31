import manifestJson from './manifest.json';

// Ace Runs! WebAudio mixer.
// - Three buses (music / voice / sfx) with separate gain nodes; ambience and ride loops ride on the sfx bus.
// - Every file is bundled locally (generated with ElevenLabs at build time) and resolved relative to the
//   document base, so it works from file:// (Electron), static hosting, subfolders and offline (service worker).
// - Nothing here ever throws because a file is missing or not decoded yet: calls silently no-op.
// - Files are fetched/decoded lazily on first use; preload() is an optimisation. Before the first user gesture
//   preload() only fetches bytes (no AudioContext is created until unlock()), and decodes them after unlock.
// - Music and ambience loops are baked once into a seamless loop buffer (quiet tail trimmed, equal-power
//   crossfade of the end into the start) and played with a native looping AudioBufferSourceNode: gapless,
//   timer-free, and unaffected by suspend()/background tabs.

export type Bus = 'music' | 'voice' | 'sfx';
export type Speaker = 'ace' | 'moana' | 'narrator';
export type AudioKind = 'voice' | 'sfx' | 'ambience' | 'music';

export interface AudioEntry {
  id: string;
  kind: AudioKind;
  speaker?: Speaker;
  group: string;
  text?: string;
  tts?: string;
  prompt?: string;
  file: string;
  variants?: number;
  duration?: number;
  loop?: boolean;
  volume?: number;
}

export interface SfxOptions {
  volume?: number;
  rate?: number;
  pan?: number;
  delay?: number;
}

export interface VoiceOptions {
  priority?: boolean;
  minGap?: number;
  interrupt?: boolean;
  delay?: number;
}

export interface LoopHandle {
  setVolume(v: number): void;
  setRate(r: number): void;
  stop(fade?: number): void;
}

/** Called whenever a voice line actually starts (for subtitles / mouth animation). */
export type VoiceStartListener = (speaker: Speaker, group: string, text: string, duration: number) => void;

interface Manifest {
  entries: AudioEntry[];
}

interface ActiveVoice {
  speaker: Speaker;
  src: AudioBufferSourceNode;
  gain: GainNode;
}

interface QueuedLine {
  entry: AudioEntry;
  delay: number;
}

interface LoopSlot {
  key: string;
  id: string;
  gain: GainNode;
  src: AudioBufferSourceNode | null;
  volume: number;
  rate: number;
  stopped: boolean;
}

interface BedSlot {
  id: string;
  gain: GainNode;
  src: AudioBufferSourceNode | null;
}

const manifest = manifestJson as unknown as Manifest;

/** Bus trims: perceptual slider value v maps to gain trim * v^2. */
const BUS_TRIM: Record<Bus, number> = { music: 0.55, voice: 1.0, sfx: 0.85 };
const DEFAULT_VOLUME: Record<Bus, number> = { music: 0.7, voice: 1, sfx: 0.85 };
/** Seconds of end-into-start crossfade baked into looping beds. */
const LOOP_XFADE: Record<'music' | 'ambience' | 'sfx', number> = { music: 2.5, ambience: 1.5, sfx: 0.08 };
const MAX_DECODED_BEDS = { music: 2, ambience: 3 };
const NARRATOR_QUEUE_MAX = 3;
/** Loudness normalisation targets (dBFS RMS of the active part of a clip) and the max correction. */
const LOUDNESS_TARGET: Record<AudioKind, number> = { voice: -17, sfx: -17, ambience: -24, music: -17 };
const LOUDNESS_MAX_DB = 12;
const CHAR_LATE_LIMIT = 0.6; // s: character lines that take longer than this to load are dropped
const SFX_LATE_LIMIT = 0.25;

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
const globToRegExp = (glob: string): RegExp =>
  new RegExp('^' + glob.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buses: Record<Bus, GainNode> | null = null;
  private musicDuck: GainNode | null = null;
  private sfxDuck: GainNode | null = null;
  private charGain: GainNode | null = null;
  private narratorGain: GainNode | null = null;

  private readonly base: string;
  private readonly entries = new Map<string, AudioEntry>();
  private readonly voiceGroups = new Map<string, AudioEntry[]>();

  private readonly raw = new Map<string, Promise<ArrayBuffer | null>>();
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly decoding = new Map<string, Promise<AudioBuffer | null>>();
  private readonly loopBuffers = new Map<string, AudioBuffer>();
  private readonly loopBaking = new Map<string, Promise<AudioBuffer | null>>();
  private readonly bedLru: Record<'music' | 'ambience', string[]> = { music: [], ambience: [] };
  private readonly failed = new Set<string>();
  private readonly fileKind = new Map<string, AudioKind>();
  private readonly norm = new Map<string, number>();
  private readonly wanted = new Set<string>();

  private readonly volumes: Record<Bus, number> = { ...DEFAULT_VOLUME };
  private extDuck = 0;
  private isUnlocked = false;
  private pausedByCaller = false;

  private readonly lastVariant = new Map<string, number>();
  private readonly lastSfxAt = new Map<string, number>();
  private readonly lastLine = new Map<string, string>();
  private readonly lastSpeakerStart = new Map<Speaker, number>();
  private active: ActiveVoice[] = [];
  private narratorQueue: QueuedLine[] = [];
  private narratorBusy = false;
  private narratorToken = 0;
  private pendingBeds: { music?: { id: string | null; fade: number }; ambience?: { id: string | null; fade: number } } = {};
  private music: BedSlot | null = null;
  private ambience: BedSlot | null = null;
  private readonly loops = new Map<string, LoopSlot>();

  /** Optional hook: fires when a voice line starts playing. */
  onVoiceStart: VoiceStartListener | null = null;

  constructor(baseUrl = './') {
    const docBase = typeof document !== 'undefined' ? document.baseURI : 'http://localhost/';
    let base: string;
    try {
      base = new URL(baseUrl, docBase).href;
    } catch {
      base = docBase;
    }
    this.base = base.endsWith('/') ? base : base + '/';
    for (const e of manifest.entries) {
      this.entries.set(e.id, e);
      for (const f of this.filesOf(e)) this.fileKind.set(f, e.kind);
      if (e.kind === 'voice' && e.speaker) {
        const k = `${e.speaker}:${e.group}`;
        const list = this.voiceGroups.get(k);
        if (list) list.push(e);
        else this.voiceGroups.set(k, [e]);
      }
    }
  }

  // =================================================================== context / buses

  get unlocked(): boolean {
    return this.isUnlocked;
  }

  /** Call from the first user gesture (pointerdown/keydown/touchend). Safe to call repeatedly. */
  unlock(): void {
    try {
      if (!this.ctx) this.createContext();
      const ctx = this.ctx;
      if (!ctx) return;
      if (this.pausedByCaller) return; // an explicit suspend() wins until resume()
      if (ctx.state !== 'running') {
        void ctx.resume().then(() => this.markRunning(), () => undefined);
      } else this.markRunning();
    } catch {
      /* audio unavailable: stay silent */
    }
  }

  private createContext(): void {
    if (typeof window === 'undefined') return;
    const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor({ latencyHint: 'interactive' });
    this.ctx = ctx;
    const master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 10;
    comp.ratio.value = 3;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    master.connect(comp).connect(ctx.destination);
    this.master = master;
    const music = ctx.createGain();
    const voice = ctx.createGain();
    const sfx = ctx.createGain();
    this.musicDuck = ctx.createGain();
    this.sfxDuck = ctx.createGain();
    music.connect(this.musicDuck).connect(master);
    sfx.connect(this.sfxDuck).connect(master);
    voice.connect(master);
    this.charGain = ctx.createGain();
    this.narratorGain = ctx.createGain();
    this.charGain.connect(voice);
    this.narratorGain.connect(voice);
    this.buses = { music, voice, sfx };
    for (const b of ['music', 'voice', 'sfx'] as Bus[]) this.buses[b].gain.value = this.busGain(b);
    ctx.onstatechange = () => {
      if (ctx.state === 'running') this.markRunning();
    };
    // Old iOS Safari needs a sound started inside the gesture to really unlock output.
    try {
      const silent = ctx.createBuffer(1, 1, ctx.sampleRate);
      const s = ctx.createBufferSource();
      s.buffer = silent;
      s.connect(master);
      s.start();
    } catch {
      /* ignore */
    }
  }

  private markRunning(): void {
    if (this.isUnlocked) return;
    this.isUnlocked = true;
    // Decode whatever preload() already fetched, then start beds requested before the gesture.
    // Big beds (music / ambience) stay as compressed bytes until they are actually played.
    for (const f of this.wanted) {
      const k = this.fileKind.get(f);
      if (k !== 'music' && k !== 'ambience') void this.decodeFile(f);
    }
    const { music, ambience } = this.pendingBeds;
    this.pendingBeds = {};
    if (music) this.playMusic(music.id, music.fade);
    if (ambience) this.playAmbience(ambience.id, ambience.fade);
  }

  private busGain(bus: Bus): number {
    const v = this.volumes[bus];
    return BUS_TRIM[bus] * v * v;
  }

  setVolume(bus: Bus, v: number): void {
    if (!(bus in this.volumes)) return;
    this.volumes[bus] = clamp01(v);
    if (this.ctx && this.buses) this.buses[bus].gain.setTargetAtTime(this.busGain(bus), this.ctx.currentTime, 0.04);
  }

  getVolume(bus: Bus): number {
    return this.volumes[bus] ?? 0;
  }

  /** Duck music under voices etc. 0..1 extra attenuation. */
  setDuck(amount: number): void {
    this.extDuck = clamp01(amount);
    this.updateDucks();
  }

  /** Pause everything (game pause, page hidden). */
  suspend(): void {
    this.pausedByCaller = true;
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend().catch(() => undefined);
  }

  /** Resume after suspend(). */
  resume(): void {
    this.pausedByCaller = false;
    if (this.ctx && this.ctx.state !== 'running' && this.ctx.state !== 'closed') {
      void this.ctx.resume().then(() => this.markRunning(), () => undefined);
    }
  }

  // =================================================================== loading

  private url(file: string): string {
    try {
      return new URL(file, this.base).href;
    } catch {
      return file;
    }
  }

  private filesOf(e: AudioEntry): string[] {
    const n = e.variants ?? 0;
    if (n <= 1) return [e.file];
    return Array.from({ length: n }, (_, i) => e.file.replace(/(\.[a-z0-9]+)$/i, `_${i + 1}$1`));
  }

  private fetchRaw(file: string): Promise<ArrayBuffer | null> {
    const cached = this.raw.get(file);
    if (cached) return cached;
    if (typeof fetch === 'undefined') return Promise.resolve(null);
    const p = fetch(this.url(file))
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .catch(() => null)
      .then((ab) => {
        if (!ab) {
          this.failed.add(file);
          this.raw.delete(file);
        }
        return ab;
      });
    this.raw.set(file, p);
    return p;
  }

  private decodeFile(file: string): Promise<AudioBuffer | null> {
    const hit = this.buffers.get(file);
    if (hit) return Promise.resolve(hit);
    if (this.failed.has(file)) return Promise.resolve(null);
    const pending = this.decoding.get(file);
    if (pending) return pending;
    const ctx = this.ctx;
    if (!ctx || !this.isUnlocked) return this.fetchRaw(file).then(() => null);
    const p = this.fetchRaw(file)
      .then((ab) => (ab ? ctx.decodeAudioData(ab) : null))
      .then(
        (buf) => {
          this.raw.delete(file); // bytes are detached by decodeAudioData
          this.decoding.delete(file);
          if (buf) {
            this.buffers.set(file, buf);
            this.norm.set(file, loudnessGain(buf, LOUDNESS_TARGET[this.fileKind.get(file) ?? 'sfx']));
          } else this.failed.add(file);
          return buf;
        },
        () => {
          this.raw.delete(file);
          this.decoding.delete(file);
          this.failed.add(file);
          return null;
        },
      );
    this.decoding.set(file, p);
    return p;
  }

  /** Decoded + baked seamless loop buffer for music / ambience / ride loops. */
  private loopBuffer(e: AudioEntry): Promise<AudioBuffer | null> {
    const file = e.file;
    const hit = this.loopBuffers.get(file);
    if (hit) {
      this.touchBed(e, file);
      return Promise.resolve(hit);
    }
    const pending = this.loopBaking.get(file);
    if (pending) return pending;
    const kind: 'music' | 'ambience' | 'sfx' = e.kind === 'music' ? 'music' : e.kind === 'ambience' ? 'ambience' : 'sfx';
    const p = this.decodeFile(file).then((buf) => {
      this.loopBaking.delete(file);
      const ctx = this.ctx;
      if (!buf || !ctx) return null;
      let baked: AudioBuffer;
      try {
        baked = bakeLoop(ctx, buf, LOOP_XFADE[kind], kind !== 'sfx');
      } catch {
        baked = buf;
      }
      this.loopBuffers.set(file, baked);
      if (kind !== 'sfx') {
        this.buffers.delete(file); // keep only the baked copy of big beds
        this.touchBed(e, file);
      }
      return baked;
    });
    this.loopBaking.set(file, p);
    return p;
  }

  /** Entry volume x loudness normalisation for one file. */
  private level(e: AudioEntry, file: string): number {
    return (e.volume ?? 1) * (this.norm.get(file) ?? 1);
  }

  private touchBed(e: AudioEntry, file: string): void {
    if (e.kind !== 'music' && e.kind !== 'ambience') return;
    const lru = this.bedLru[e.kind];
    const i = lru.indexOf(file);
    if (i >= 0) lru.splice(i, 1);
    lru.push(file);
    const keep = new Set<string>();
    if (this.music) {
      const m = this.entries.get(this.music.id);
      if (m) keep.add(m.file);
    }
    if (this.ambience) {
      const a = this.entries.get(this.ambience.id);
      if (a) keep.add(a.file);
    }
    while (lru.length > MAX_DECODED_BEDS[e.kind]) {
      const idx = lru.findIndex((f) => !keep.has(f));
      if (idx < 0) break;
      const [old] = lru.splice(idx, 1);
      this.loopBuffers.delete(old);
    }
  }

  private selectEntries(selector: string): AudioEntry[] {
    const out: AudioEntry[] = [];
    const sel = selector.trim();
    if (!sel) return out;
    const colon = sel.indexOf(':');
    if (colon < 0) {
      const exact = this.entries.get(sel);
      if (exact) return [exact];
      const re = globToRegExp(sel);
      for (const e of this.entries.values()) if (re.test(e.id)) out.push(e);
      return out;
    }
    const head = sel.slice(0, colon);
    const re = globToRegExp(sel.slice(colon + 1) || '*');
    const isSpeaker = head === 'ace' || head === 'moana' || head === 'narrator';
    const isKind = head === 'sfx' || head === 'music' || head === 'ambience' || head === 'voice';
    for (const e of this.entries.values()) {
      if (isSpeaker) {
        if (e.kind === 'voice' && e.speaker === head && (re.test(e.group) || re.test(e.id))) out.push(e);
      } else if (isKind) {
        if (e.kind === head && (re.test(e.id) || re.test(e.group))) out.push(e);
      }
    }
    return out;
  }

  /** Preload/decode a set of ids or group selectors ('ace:*', 'narrator:stage_*', 'sfx:*', 'mus_jungle'). Resolves even if some fail. */
  preload(selectors: string[]): Promise<void> {
    const jobs: Promise<unknown>[] = [];
    try {
      for (const s of selectors ?? []) {
        for (const e of this.selectEntries(String(s))) {
          const isBed = e.kind === 'music' || e.kind === 'ambience';
          for (const f of this.filesOf(e)) {
            this.wanted.add(f);
            if (isBed) jobs.push(this.fetchRaw(f)); // decoded + baked on first play (bounded memory)
            else if (e.loop && this.isUnlocked) jobs.push(this.loopBuffer(e));
            else jobs.push(this.decodeFile(f));
          }
        }
      }
    } catch {
      /* ignore bad selectors */
    }
    return Promise.all(jobs.map((j) => j.catch(() => null))).then(() => undefined);
  }

  private ready(): AudioContext | null {
    const ctx = this.ctx;
    if (!ctx || !this.isUnlocked || !this.buses || ctx.state === 'closed') return null;
    return ctx;
  }

  // =================================================================== sfx

  /** Plays a one-shot effect (random variant, never the same variant twice in a row). */
  playSfx(id: string, opts: SfxOptions = {}): void {
    try {
      const ctx = this.ready();
      const e = this.entries.get(id);
      if (!ctx || !e || this.pausedByCaller) return;
      const now = ctx.currentTime;
      if (now - (this.lastSfxAt.get(id) ?? -1) < 0.03) return;
      this.lastSfxAt.set(id, now);
      const files = this.filesOf(e);
      let pick = 0;
      if (files.length > 1) {
        const last = this.lastVariant.get(id) ?? -1;
        pick = Math.floor(Math.random() * (files.length - 1));
        if (pick >= last) pick++;
        this.lastVariant.set(id, pick);
      }
      const file = files[pick];
      const play = (buf: AudioBuffer) => {
        if (!this.buses) return;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const jitter = opts.rate === undefined ? 1 + (Math.random() * 2 - 1) * 0.025 : 1;
        src.playbackRate.value = Math.max(0.25, Math.min(4, (opts.rate ?? 1) * jitter));
        const g = ctx.createGain();
        g.gain.value = Math.max(0, (opts.volume ?? 1) * this.level(e, file));
        let node: AudioNode = src.connect(g);
        if (opts.pan && typeof ctx.createStereoPanner === 'function') {
          const p = ctx.createStereoPanner();
          p.pan.value = Math.max(-1, Math.min(1, opts.pan));
          node = node.connect(p);
        }
        node.connect(this.buses.sfx);
        src.onended = () => {
          try {
            g.disconnect();
          } catch {
            /* ok */
          }
        };
        src.start(ctx.currentTime + Math.max(0, opts.delay ?? 0));
      };
      const buf = this.buffers.get(file);
      if (buf) {
        play(buf);
        return;
      }
      const asked = performance.now();
      void this.decodeFile(file).then((b) => {
        // Late effects are dropped rather than played out of sync.
        if (b && (performance.now() - asked) / 1000 < SFX_LATE_LIMIT + (opts.delay ?? 0)) play(b);
      });
    } catch {
      /* never throw from audio */
    }
  }

  // =================================================================== voices

  hasVoice(speaker: Speaker, group: string): boolean {
    return (this.voiceGroups.get(`${speaker}:${group}`)?.length ?? 0) > 0;
  }

  /** Is a line from this speaker (or anyone) playing right now? */
  isSpeaking(speaker?: Speaker): boolean {
    return this.active.some((a) => !speaker || a.speaker === speaker) || (speaker === 'narrator' && this.narratorBusy);
  }

  private pickLine(speaker: Speaker, group: string): AudioEntry | null {
    const list = this.voiceGroups.get(`${speaker}:${group}`);
    if (!list || !list.length) return null;
    const key = `${speaker}:${group}`;
    const last = this.lastLine.get(key);
    const pool = list.length > 1 ? list.filter((e) => e.id !== last) : list;
    const e = pool[Math.floor(Math.random() * pool.length)];
    this.lastLine.set(key, e.id);
    return e;
  }

  private durationOf(e: AudioEntry): number {
    const b = this.buffers.get(e.file);
    if (b) return b.duration;
    return e.duration ?? 1.2;
  }

  /**
   * Plays a random line from the group (avoids repeating the last one). Character lines are throttled
   * (skip if another line from the same speaker started < minGap s ago, default 1.2) unless priority.
   * Narrator lines queue (don't overlap other narrator lines); character + narrator can overlap but
   * duck each other slightly. Returns the clip duration (s) or 0 if skipped/unavailable.
   */
  playVoice(speaker: Speaker, group: string, opts: VoiceOptions = {}): number {
    try {
      const ctx = this.ready();
      if (!ctx || !this.hasVoice(speaker, group)) return 0;
      const delay = Math.max(0, opts.delay ?? 0);
      if (speaker === 'narrator') return this.playNarrator(group, opts, delay);

      const now = ctx.currentTime;
      const gap = opts.minGap ?? 1.2;
      const lastStart = this.lastSpeakerStart.get(speaker) ?? -1e9;
      const talking = this.active.some((a) => a.speaker === speaker);
      if (!opts.priority && !opts.interrupt && (now - lastStart < gap || talking)) return 0;
      const e = this.pickLine(speaker, group);
      if (!e) return 0;
      if (talking) this.stopSpeaker(speaker);
      this.lastSpeakerStart.set(speaker, now + delay);
      const buf = this.buffers.get(e.file);
      if (buf) {
        this.startLine(e, buf, delay);
        return buf.duration;
      }
      const asked = performance.now();
      void this.decodeFile(e.file).then((b) => {
        if (!b || !this.ready()) return;
        const late = (performance.now() - asked) / 1000;
        if (late > CHAR_LATE_LIMIT + delay) return;
        this.startLine(e, b, Math.max(0, delay - late));
      });
      return this.failed.has(e.file) ? 0 : this.durationOf(e);
    } catch {
      return 0;
    }
  }

  private playNarrator(group: string, opts: VoiceOptions, delay: number): number {
    const e = this.pickLine('narrator', group);
    if (!e || this.failed.has(e.file)) return 0;
    if (opts.interrupt) {
      this.narratorQueue = [];
      this.stopSpeaker('narrator');
      this.narratorBusy = false;
      this.narratorToken++;
    }
    void this.decodeFile(e.file); // warm while queued
    const item: QueuedLine = { entry: e, delay };
    if (this.narratorBusy) {
      // Avoid stacking the same callout twice; priority lines jump the queue.
      this.narratorQueue = this.narratorQueue.filter((q) => q.entry.group !== group);
      if (opts.priority) this.narratorQueue.unshift(item);
      else this.narratorQueue.push(item);
      if (this.narratorQueue.length > NARRATOR_QUEUE_MAX) this.narratorQueue.length = NARRATOR_QUEUE_MAX;
    } else {
      this.startNarrator(item);
    }
    return this.durationOf(e);
  }

  private startNarrator(item: QueuedLine): void {
    this.narratorBusy = true;
    const token = ++this.narratorToken;
    const e = item.entry;
    const go = (buf: AudioBuffer | null) => {
      if (!this.narratorBusy || token !== this.narratorToken) return; // interrupted / stopped while loading
      if (!buf || !this.ready()) {
        this.narratorDone();
        return;
      }
      this.startLine(e, buf, item.delay);
    };
    const buf = this.buffers.get(e.file);
    if (buf) go(buf);
    else void this.decodeFile(e.file).then(go);
  }

  private narratorDone(): void {
    this.narratorBusy = false;
    const next = this.narratorQueue.shift();
    if (next) this.startNarrator(next);
  }

  private startLine(e: AudioEntry, buf: AudioBuffer, delay: number): void {
    const ctx = this.ready();
    const speaker = e.speaker ?? 'narrator';
    const out = speaker === 'narrator' ? this.narratorGain : this.charGain;
    if (!ctx || !out) {
      if (speaker === 'narrator') this.narratorDone();
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = this.level(e, e.file);
    src.connect(g).connect(out);
    const rec: ActiveVoice = { speaker, src, gain: g };
    this.active.push(rec);
    src.onended = () => {
      this.active = this.active.filter((a) => a !== rec);
      try {
        g.disconnect();
      } catch {
        /* ok */
      }
      this.updateDucks();
      if (speaker === 'narrator' && this.narratorBusy && !this.active.some((a) => a.speaker === 'narrator')) this.narratorDone();
    };
    src.start(ctx.currentTime + delay);
    this.updateDucks();
    if (this.onVoiceStart) {
      const cb = this.onVoiceStart;
      const text = e.text ?? '';
      const fire = () => {
        try {
          cb(speaker, e.group, text, buf.duration);
        } catch {
          /* listener errors are not ours */
        }
      };
      if (delay > 0) setTimeout(fire, delay * 1000);
      else fire();
    }
  }

  private stopSpeaker(speaker: Speaker): void {
    for (const a of this.active) {
      if (a.speaker !== speaker) continue;
      a.src.onended = null;
      try {
        a.src.stop();
      } catch {
        /* already stopped */
      }
      try {
        a.gain.disconnect();
      } catch {
        /* ok */
      }
    }
    this.active = this.active.filter((a) => a.speaker !== speaker);
    this.updateDucks();
  }

  stopVoices(): void {
    try {
      this.narratorQueue = [];
      this.narratorBusy = false;
      this.narratorToken++;
      for (const s of ['ace', 'moana', 'narrator'] as Speaker[]) this.stopSpeaker(s);
    } catch {
      /* ignore */
    }
  }

  private updateDucks(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicDuck || !this.sfxDuck || !this.charGain || !this.narratorGain) return;
    const t = ctx.currentTime;
    const narr = this.active.some((a) => a.speaker === 'narrator');
    const kid = this.active.some((a) => a.speaker !== 'narrator');
    const talking = narr || kid;
    const set = (p: AudioParam, v: number) => {
      p.cancelScheduledValues(t);
      p.setTargetAtTime(v, t, v < p.value ? 0.06 : 0.35);
    };
    set(this.musicDuck.gain, (1 - this.extDuck) * (talking ? 0.55 : 1));
    set(this.sfxDuck.gain, talking ? 0.85 : 1);
    set(this.charGain.gain, narr ? 0.75 : 1);
    set(this.narratorGain.gain, kid ? 0.85 : 1);
  }

  // =================================================================== music / ambience

  /** Crossfade to a looping music track; null stops music. */
  playMusic(id: string | null, fade = 1.5): void {
    try {
      if (!this.ready()) {
        this.pendingBeds.music = { id, fade };
        return;
      }
      this.music = this.switchBed(this.music, id, 'music', fade);
    } catch {
      /* ignore */
    }
  }

  /** Crossfade to a looping ambience bed; null stops ambience. */
  playAmbience(id: string | null, fade = 1.5): void {
    try {
      if (!this.ready()) {
        this.pendingBeds.ambience = { id, fade };
        return;
      }
      this.ambience = this.switchBed(this.ambience, id, 'ambience', fade);
    } catch {
      /* ignore */
    }
  }

  private switchBed(cur: BedSlot | null, id: string | null, kind: 'music' | 'ambience', fade: number): BedSlot | null {
    const ctx = this.ready();
    if (!ctx || !this.buses) return cur;
    if (cur && cur.id === id) return cur;
    const e = id ? this.entries.get(id) : undefined;
    if (id && (!e || (e.kind !== 'music' && e.kind !== 'ambience'))) return cur; // unknown id: keep what plays
    this.fadeOutBed(cur, fade);
    if (!e) return null;
    const bus = kind === 'music' ? this.buses.music : this.buses.sfx;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(bus);
    const slot: BedSlot = { id: e.id, gain, src: null };
    const f = Math.max(0.05, fade);
    void this.loopBuffer(e).then((buf) => {
      const live = kind === 'music' ? this.music : this.ambience;
      if (!buf || live !== slot || !this.ready()) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(gain);
      const t = ctx.currentTime;
      src.start(t);
      slot.src = src;
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(this.level(e, e.file), t + f);
    });
    return slot;
  }

  private fadeOutBed(slot: BedSlot | null, fade: number): void {
    const ctx = this.ctx;
    if (!slot || !ctx) return;
    const t = ctx.currentTime;
    const f = Math.max(0.05, fade);
    slot.gain.gain.cancelScheduledValues(t);
    slot.gain.gain.setValueAtTime(slot.gain.gain.value, t);
    slot.gain.gain.linearRampToValueAtTime(0, t + f);
    const src = slot.src;
    if (src) {
      src.onended = () => {
        try {
          slot.gain.disconnect();
        } catch {
          /* ok */
        }
      };
      try {
        src.stop(t + f + 0.05);
      } catch {
        /* ok */
      }
    } else {
      try {
        slot.gain.disconnect();
      } catch {
        /* ok */
      }
    }
  }

  // =================================================================== continuous loops (rides)

  /** Continuous loop (ride sounds). Returns a handle; same key replaces. */
  loop(key: string, id: string | null, volume = 1): LoopHandle | null {
    try {
      const old = this.loops.get(key);
      if (old && id && old.id === id && !old.stopped) {
        this.setLoopVolume(old, volume);
        return this.handleFor(old);
      }
      if (old) this.stopLoop(old, 0.15);
      if (!id) return null;
      const ctx = this.ready();
      const e = this.entries.get(id);
      if (!ctx || !e || !this.buses) return null;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(this.buses.sfx);
      const slot: LoopSlot = { key, id, gain, src: null, volume: Math.max(0, volume), rate: 1, stopped: false };
      this.loops.set(key, slot);
      void this.loopBuffer(e).then((buf) => {
        if (!buf || slot.stopped || !this.ready()) return;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.playbackRate.value = slot.rate;
        src.connect(gain);
        const t = ctx.currentTime;
        src.start(t, Math.random() * buf.duration * 0.5);
        slot.src = src;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(slot.volume * this.level(e, e.file), t + 0.12);
      });
      return this.handleFor(slot);
    } catch {
      return null;
    }
  }

  private handleFor(slot: LoopSlot): LoopHandle {
    return {
      setVolume: (v: number) => this.setLoopVolume(slot, v),
      setRate: (r: number) => {
        if (!Number.isFinite(r)) return;
        slot.rate = Math.max(0.25, Math.min(4, r));
        const ctx = this.ctx;
        if (ctx && slot.src) slot.src.playbackRate.setTargetAtTime(slot.rate, ctx.currentTime, 0.05);
      },
      stop: (fade = 0.2) => this.stopLoop(slot, fade),
    };
  }

  private setLoopVolume(slot: LoopSlot, v: number): void {
    if (!Number.isFinite(v)) return;
    slot.volume = Math.max(0, v);
    const ctx = this.ctx;
    if (!ctx || slot.stopped || !slot.src) return; // applied when the loop starts
    const e = this.entries.get(slot.id);
    slot.gain.gain.setTargetAtTime(slot.volume * (e ? this.level(e, e.file) : 1), ctx.currentTime, 0.05);
  }

  private stopLoop(slot: LoopSlot, fade: number): void {
    if (slot.stopped) return;
    slot.stopped = true;
    if (this.loops.get(slot.key) === slot) this.loops.delete(slot.key);
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const f = Math.max(0.02, fade);
    slot.gain.gain.cancelScheduledValues(t);
    slot.gain.gain.setValueAtTime(slot.gain.gain.value, t);
    slot.gain.gain.linearRampToValueAtTime(0, t + f);
    const src = slot.src;
    if (src) {
      src.onended = () => {
        try {
          slot.gain.disconnect();
        } catch {
          /* ok */
        }
      };
      try {
        src.stop(t + f + 0.03);
      } catch {
        /* ok */
      }
    } else {
      try {
        slot.gain.disconnect();
      } catch {
        /* ok */
      }
    }
  }

  // =================================================================== introspection (dev / UI helpers)

  /** Manifest entry by id (e.g. to show subtitles). */
  entry(id: string): AudioEntry | undefined {
    return this.entries.get(id);
  }

  /** Voice groups available for a speaker. */
  voiceGroupsOf(speaker: Speaker): string[] {
    const out: string[] = [];
    for (const k of this.voiceGroups.keys()) if (k.startsWith(speaker + ':')) out.push(k.slice(speaker.length + 1));
    return out;
  }
}

/**
 * Gain that brings a clip's active loudness (mean power of its louder half of 25 ms windows, so short
 * clips with silence are not over-boosted) to `targetDb`, limited to +/- LOUDNESS_MAX_DB.
 */
export function loudnessGain(buf: AudioBuffer, targetDb: number): number {
  const win = Math.max(1, Math.floor(buf.sampleRate * 0.025));
  const n = Math.floor(buf.length / win);
  if (n < 1) return 1;
  const chans: Float32Array[] = [];
  for (let c = 0; c < buf.numberOfChannels; c++) chans.push(buf.getChannelData(c));
  const step = buf.length > buf.sampleRate * 20 ? 8 : 2;
  const pw = new Float32Array(n);
  for (let w = 0; w < n; w++) {
    let s = 0;
    let k = 0;
    const o = w * win;
    for (const d of chans) for (let i = 0; i < win; i += step, k++) s += d[o + i] * d[o + i];
    pw[w] = s / (k || 1);
  }
  pw.sort();
  let sum = 0;
  const from = Math.floor(n / 2);
  for (let w = from; w < n; w++) sum += pw[w];
  const p = sum / Math.max(1, n - from);
  if (!(p > 1e-10)) return 1;
  const db = 10 * Math.log10(p);
  const corr = Math.max(-LOUDNESS_MAX_DB, Math.min(LOUDNESS_MAX_DB, targetDb - db));
  return Math.pow(10, corr / 20);
}

/**
 * Builds a seamless loop: optionally trims leading silence and a quiet / faded tail, then crossfades the
 * last `xfade` seconds into the start (equal power). Playing the result with `loop = true` is gapless:
 * the final sample flows into out[0] = in[start + N], which is the sample that followed it originally.
 */
export function bakeLoop(ctx: BaseAudioContext, buf: AudioBuffer, xfade: number, trim: boolean): AudioBuffer {
  const sr = buf.sampleRate;
  const chans = buf.numberOfChannels;
  const L = buf.length;
  let start = 0;
  let end = L;
  if (trim && L > sr * 6) {
    const win = Math.max(1, Math.floor(sr * 0.05));
    const n = Math.floor(L / win);
    const env = new Float32Array(n);
    const data: Float32Array[] = [];
    for (let c = 0; c < chans; c++) data.push(buf.getChannelData(c));
    for (let w = 0; w < n; w++) {
      let s = 0;
      const o = w * win;
      for (let c = 0; c < chans; c++) {
        const d = data[c];
        for (let i = 0; i < win; i += 4) s += d[o + i] * d[o + i];
      }
      env[w] = Math.sqrt(s / ((win / 4) * chans));
    }
    const sorted = Array.from(env).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] || 0;
    if (median > 1e-4) {
      const maxLead = Math.min(n - 1, Math.floor(3 / 0.05));
      let w0 = 0;
      while (w0 < maxLead && env[w0] < median * 0.1) w0++;
      const maxTail = Math.floor(8 / 0.05);
      let w1 = n - 1;
      while (w1 > n - 1 - maxTail && w1 > w0 && env[w1] < median * 0.3) w1--;
      start = w0 * win;
      end = Math.min(L, (w1 + 1) * win);
    }
  }
  const len = end - start;
  const X = Math.max(0, Math.min(Math.floor(xfade * sr), Math.floor(len / 4)));
  const N = len - X;
  if (N <= 0) return buf;
  const out = ctx.createBuffer(chans, N, sr);
  for (let c = 0; c < chans; c++) {
    const src = buf.getChannelData(c);
    const dst = out.getChannelData(c);
    for (let k = 0; k < X; k++) {
      const t = k / X;
      dst[k] = src[start + k] * Math.sin(t * Math.PI * 0.5) + src[start + N + k] * Math.cos(t * Math.PI * 0.5);
    }
    dst.set(src.subarray(start + X, start + N), X);
  }
  return out;
}
