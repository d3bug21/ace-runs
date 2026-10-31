// Persistent settings + progress in localStorage (key `ace-runs-save-v1`). Every read is
// defensive: a corrupted, partial or missing save never stops a child from playing.
import { CHARACTERS, RIDES, STAGES, type CharacterId, type RideId, type StageId } from '../contracts';
import type { RunStats } from '../engine/api';
import { FOOD_BY_ID } from '../content/foods';

export const SAVE_KEY = 'ace-runs-save-v1';

export interface Settings {
  music: number; // 0..1
  voice: number;
  sfx: number;
  hints: boolean;
  reducedMotion: boolean;
}

export interface StageProgress {
  unlocked: boolean;
  cleared: boolean;
  bestDistance: number; // best adventure distance (m)
  bestEndless: number; // best endless distance (m)
  stars: 0 | 1 | 2 | 3;
  plays: number;
}

export interface FoodRecord {
  count: number;
  firstSeen: number; // epoch ms
}

export interface Totals {
  runs: number;
  distance: number;
  healthy: number;
  junk: number;
  nearMisses: number;
}

export interface SaveState {
  version: 1;
  settings: Settings;
  character: CharacterId;
  ride: RideId;
  stage: StageId;
  tutorialDone: boolean;
  stages: Record<StageId, StageProgress>;
  foods: Record<string, FoodRecord>;
  totals: Totals;
}

/** What a finished run changed (for the results celebration). */
export interface RunOutcome {
  newFoods: string[];
  newlyCleared: boolean;
  unlockedStage: StageId | null;
  bestDistance: boolean;
  bestEndless: boolean;
  starsBefore: number;
}

export const DEFAULT_SETTINGS: Settings = { music: 0.6, voice: 0.95, sfx: 0.8, hints: true, reducedMotion: false };

function freshStage(i: number): StageProgress {
  return { unlocked: i === 0, cleared: false, bestDistance: 0, bestEndless: 0, stars: 0, plays: 0 };
}

export function freshSave(): SaveState {
  const stages = {} as Record<StageId, StageProgress>;
  STAGES.forEach((s, i) => (stages[s] = freshStage(i)));
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    character: 'ace',
    ride: 'shoes',
    stage: 'indoor',
    tutorialDone: false,
    stages,
    foods: {},
    totals: { runs: 0, distance: 0, healthy: 0, junk: 0, nearMisses: 0 },
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, d: number, a = 0, b = Number.MAX_SAFE_INTEGER): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : d;
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);

/** Rebuild a valid save from any parsed JSON (unknown fields dropped, bad values defaulted). */
export function sanitize(raw: unknown): SaveState {
  const s = freshSave();
  if (!isObj(raw)) return s;
  const st = isObj(raw.settings) ? raw.settings : {};
  s.settings = {
    music: num(st.music, DEFAULT_SETTINGS.music, 0, 1),
    voice: num(st.voice, DEFAULT_SETTINGS.voice, 0, 1),
    sfx: num(st.sfx, DEFAULT_SETTINGS.sfx, 0, 1),
    hints: st.hints !== false,
    reducedMotion: st.reducedMotion === true,
  };
  s.character = oneOf(raw.character, CHARACTERS, 'ace');
  s.ride = oneOf(raw.ride, RIDES, 'shoes');
  s.stage = oneOf(raw.stage, STAGES, 'indoor');
  s.tutorialDone = raw.tutorialDone === true;
  const stages = isObj(raw.stages) ? raw.stages : {};
  STAGES.forEach((id, i) => {
    const p = isObj(stages[id]) ? (stages[id] as Record<string, unknown>) : {};
    s.stages[id] = {
      unlocked: i === 0 || p.unlocked === true,
      cleared: p.cleared === true,
      bestDistance: num(p.bestDistance, 0),
      bestEndless: num(p.bestEndless, 0),
      stars: Math.round(num(p.stars, 0, 0, 3)) as 0 | 1 | 2 | 3,
      plays: Math.round(num(p.plays, 0)),
    };
  });
  // A cleared stage always opens the next one (repairs partially-written saves).
  STAGES.forEach((id, i) => {
    if (i > 0 && s.stages[STAGES[i - 1]].cleared) s.stages[id].unlocked = true;
  });
  if (!s.stages[s.stage].unlocked) s.stage = 'indoor';
  const foods = isObj(raw.foods) ? raw.foods : {};
  for (const [id, rec] of Object.entries(foods)) {
    if (!FOOD_BY_ID[id] || !isObj(rec)) continue;
    const count = Math.round(num(rec.count, 0));
    if (count > 0) s.foods[id] = { count, firstSeen: num(rec.firstSeen, Date.now()) };
  }
  const t = isObj(raw.totals) ? raw.totals : {};
  s.totals = {
    runs: Math.round(num(t.runs, 0)),
    distance: num(t.distance, 0),
    healthy: Math.round(num(t.healthy, 0)),
    junk: Math.round(num(t.junk, 0)),
    nearMisses: Math.round(num(t.nearMisses, 0)),
  };
  return s;
}

export class SaveData {
  state: SaveState;
  private writable: boolean;

  constructor(private storage: Storage | null = SaveData.defaultStorage()) {
    this.writable = !!storage;
    let raw: unknown = null;
    try {
      const txt = storage?.getItem(SAVE_KEY);
      raw = txt ? JSON.parse(txt) : null;
    } catch {
      raw = null; // corrupted JSON: start fresh but keep playing
    }
    this.state = sanitize(raw);
  }

  static defaultStorage(): Storage | null {
    try {
      const k = '__ace_runs_probe__';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return localStorage;
    } catch {
      return null; // private mode / blocked storage
    }
  }

  get settings(): Settings {
    return this.state.settings;
  }

  write(): void {
    if (!this.writable || !this.storage) return;
    try {
      this.storage.setItem(SAVE_KEY, JSON.stringify(this.state));
    } catch {
      /* quota / disabled storage: play on */
    }
  }

  stage(id: StageId): StageProgress {
    return this.state.stages[id];
  }

  isUnlocked(id: StageId): boolean {
    return this.state.stages[id].unlocked;
  }

  discovered(id: string): boolean {
    return (this.state.foods[id]?.count ?? 0) > 0;
  }

  discoveredCount(ids: string[]): number {
    return ids.filter((i) => this.discovered(i)).length;
  }

  /** Apply a finished run. Tutorial runs only record foods. */
  recordRun(stats: RunStats): RunOutcome {
    const out: RunOutcome = { newFoods: [], newlyCleared: false, unlockedStage: null, bestDistance: false, bestEndless: false, starsBefore: 0 };
    const now = Date.now();
    for (const rec of [stats.healthy, stats.junk]) {
      for (const [id, n] of Object.entries(rec ?? {})) {
        if (!FOOD_BY_ID[id] || !(n > 0)) continue;
        const f = this.state.foods[id];
        if (!f) {
          this.state.foods[id] = { count: n, firstSeen: now };
          out.newFoods.push(id);
        } else f.count += n;
      }
    }
    const t = this.state.totals;
    t.runs++;
    t.distance += Math.max(0, stats.distance || 0);
    t.healthy += stats.healthyTotal || 0;
    t.junk += stats.junkTotal || 0;
    t.nearMisses += stats.nearMisses || 0;
    if (stats.mode === 'tutorial') {
      if (stats.finished) this.state.tutorialDone = true;
      this.write();
      return out;
    }
    const sp = this.state.stages[stats.stage];
    if (!sp) {
      this.write();
      return out;
    }
    out.starsBefore = sp.stars;
    sp.plays++;
    if (stats.mode === 'endless') {
      if (stats.distance > sp.bestEndless) {
        out.bestEndless = sp.bestEndless > 0;
        sp.bestEndless = Math.round(stats.distance);
      }
    } else {
      if (stats.distance > sp.bestDistance) {
        out.bestDistance = sp.bestDistance > 0;
        sp.bestDistance = Math.round(stats.distance);
      }
      if (stats.stars > sp.stars) sp.stars = stats.stars;
      if (stats.finished && !sp.cleared) {
        sp.cleared = true;
        out.newlyCleared = true;
        const i = STAGES.indexOf(stats.stage);
        const next = STAGES[i + 1];
        if (next && !this.state.stages[next].unlocked) {
          this.state.stages[next].unlocked = true;
          out.unlockedStage = next;
        }
      }
    }
    this.write();
    return out;
  }

  resetProgress(): void {
    const keep = this.state.settings;
    this.state = freshSave();
    this.state.settings = keep;
    this.write();
  }
}
