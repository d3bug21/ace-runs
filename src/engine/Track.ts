// Streams the track ahead of the runner: decor chunks, obstacle patterns, food trails, finish arch.
// All gameplay positions are in track distance d (world z = -d) and world x.
import * as THREE from 'three';
import type { FoodDef, ObstacleKind, ObstacleVisual, StageModule, StagePattern, StageSection } from '../contracts';
import { LANE_WIDTH, PLATFORM_TOP } from '../contracts';
import { FOOD_BY_ID, HEALTHY, JUNK } from '../content/foods';
import { disposeTree, geo, mat, PAL, pick, rng as makeRng } from '../kit/kit';
import { DEFAULT_HEIGHT, DEFAULT_LENGTH, GENERIC_PATTERNS } from './patterns';

export interface Obstacle {
  kind: ObstacleKind;
  span: number;
  dc: number; // centre distance
  len: number;
  height: number;
  x: number; // current centre x
  visual: ObstacleVisual;
  // movers
  dir: 1 | -1;
  fromX: number;
  toX: number;
  moveT: number; // -1 = not triggered, else 0..1 progress
  // state
  knocked: number; // -1 or seconds since knocked aside
  knockDir: number;
  threatened: boolean; // runner dodged it at the last moment (near-miss candidate)
  passed: boolean;
  hit: boolean;
  guide: THREE.Object3D | null;
}

export interface FoodItem {
  def: FoodDef;
  d: number;
  x: number;
  y: number; // base height above track
  obj: THREE.Object3D;
  taken: boolean;
  takenT: number;
  pulled: boolean; // magnet attracted
  phase: number;
  /** First item of a trail: triggers the full benefit animation. */
  lead: boolean;
}

export type FoodFactory = (id: string) => THREE.Object3D;

interface Chunk {
  d0: number;
  d1: number;
  obj: THREE.Object3D;
}

const CHUNK = 40;
const AHEAD = 150;
const START_CLEAR = 45;

/** Food pools per stage / section for a sense of place (ids weighted by repetition). */
const POOLS: Record<string, string[]> = {
  indoor: ['apple_slices', 'yoghurt', 'cheese', 'carrot_sticks', 'banana', 'orange', 'water', 'bread', 'strawberry', 'peas', 'egg', 'milk'],
  arcade: ['carrot_sticks', 'kiwifruit', 'banana', 'water', 'cheese', 'nuts', 'apple_slices', 'corn', 'broccoli', 'milk', 'fruit_salad'],
  outdoor: ['apple_slices', 'feijoa', 'kiwifruit', 'water', 'carrot', 'corn', 'strawberry', 'banana', 'egg', 'cheese', 'watermelon'],
  sports: ['water', 'water', 'banana', 'milk', 'orange', 'chicken', 'kumara', 'broccoli', 'bread', 'egg', 'yoghurt', 'nuts'],
  jungle: ['banana', 'banana', 'kiwifruit', 'orange', 'watermelon', 'nuts', 'spinach', 'fish', 'feijoa', 'water', 'fruit_salad'],
  parks: ['feijoa', 'kumara', 'apple_slices', 'carrot', 'peas', 'water', 'veggie_bowl', 'fish', 'broccoli', 'strawberry'],
  winter: ['veggie_soup', 'veggie_soup', 'kumara', 'orange', 'carrot', 'broccoli', 'milk', 'kiwifruit', 'chicken'],
  spring: ['peas', 'spinach', 'strawberry', 'egg', 'carrot_sticks', 'milk', 'apple_slices', 'water'],
  summer: ['watermelon', 'water', 'water', 'strawberry', 'fruit_salad', 'corn', 'fish', 'yoghurt', 'banana'],
  autumn: ['feijoa', 'feijoa', 'kumara', 'apple_slices', 'corn', 'veggie_bowl', 'nuts', 'cheese', 'water'],
};

export interface TrackOptions {
  stage: StageModule;
  scene: THREE.Scene;
  seed: number;
  goal: number | null;
  makeFood: FoodFactory;
  scripted: boolean; // tutorial: no random patterns
  endless: boolean;
}

export class Track {
  readonly obstacles: Obstacle[] = [];
  readonly foods: FoodItem[] = [];
  private chunks: Chunk[] = [];
  private decorTo = 0;
  private spawnTo = START_CLEAR;
  private rnd: () => number;
  private root = new THREE.Group();
  private finish: THREE.Object3D | null = null;
  private patternCount = 0;
  junkLoadHint = 0; // engine sets: more water appears when junk builds up
  private lastJunkAt = 0;

  constructor(private o: TrackOptions) {
    this.rnd = makeRng(o.seed);
    o.scene.add(this.root);
    if (o.goal !== null) this.buildFinish(o.goal);
  }

  get rng(): () => number {
    return this.rnd;
  }

  sectionAt(d: number): StageSection {
    const s = this.o.stage.sections;
    let cur = s[0];
    for (const x of s) if (x.start <= d) cur = x;
    return cur;
  }

  /** Ensure content exists ahead and remove things far behind. */
  update(dist: number): void {
    while (this.decorTo < dist + AHEAD) {
      const d0 = this.decorTo;
      const d1 = d0 + CHUNK;
      const obj = this.o.stage.buildDecor({ d0, d1, section: this.sectionAt(d0 + CHUNK / 2), rng: makeRng((this.o.seed * 31 + d0) | 0) });
      this.root.add(obj);
      this.chunks.push({ d0, d1, obj });
      this.decorTo = d1;
    }
    while (this.chunks.length && this.chunks[0].d1 < dist - 30) {
      const c = this.chunks.shift()!;
      this.root.remove(c.obj);
      disposeTree(c.obj);
    }
    if (!this.o.scripted) {
      while (this.spawnTo < dist + AHEAD - 10) this.spawnNext();
    }
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const ob = this.obstacles[i];
      if (ob.dc + ob.len / 2 < dist - 25) {
        this.removeObstacle(i);
      }
    }
    for (let i = this.foods.length - 1; i >= 0; i--) {
      const f = this.foods[i];
      if ((f.d < dist - 12 && !f.pulled) || (f.taken && f.takenT > 0.5)) {
        this.root.remove(f.obj);
        this.foods.splice(i, 1);
      }
    }
  }

  private removeObstacle(i: number): void {
    const ob = this.obstacles[i];
    this.root.remove(ob.visual.object);
    if (ob.guide) this.root.remove(ob.guide);
    ob.visual.dispose?.();
    disposeTree(ob.visual.object);
    this.obstacles.splice(i, 1);
  }

  // ------------------------------------------------------------------ patterns
  private difficulty(d: number): number {
    if (this.o.goal !== null) {
      const p = d / this.o.goal;
      return p < 0.28 ? 1 : p < 0.62 ? 2 : 3;
    }
    return d < 500 ? 1 : d < 1500 ? 2 : 3;
  }

  private choosePattern(d: number): StagePattern {
    const level = this.difficulty(d);
    const section = this.sectionAt(d);
    const authored = (this.o.stage.patterns ?? []).filter(
      (p) => p.difficulty <= level && (!p.section || p.section === section.id) && validPattern(p),
    );
    const sectionSpecific = authored.filter((p) => p.section === section.id);
    const r = this.rnd();
    let pool: StagePattern[];
    if (sectionSpecific.length && r < 0.55) pool = sectionSpecific;
    else if (authored.length && r < 0.8) pool = authored;
    else pool = GENERIC_PATTERNS.filter((p) => p.difficulty <= level);
    // Prefer patterns at the current difficulty a bit more.
    const weighted: StagePattern[] = [];
    for (const p of pool) {
      weighted.push(p);
      if (p.difficulty === level) weighted.push(p);
    }
    return pick(this.rnd, weighted);
  }

  private spawnNext(): void {
    const d = this.spawnTo;
    const goal = this.o.goal;
    if (goal !== null && d > goal - 30 && d < goal + 40) {
      // Clear run-in to the finish arch, with a celebratory food line.
      this.foodLine(goal - 26, 0, 9, null);
      this.spawnTo = goal + 40;
      return;
    }
    const p = this.choosePattern(d);
    const mirror = this.rnd() < 0.5 ? -1 : 1;
    const placed: Obstacle[] = [];
    for (const it of p.items) {
      const lane = it.lane * mirror;
      const span = it.laneSpan ?? 1;
      let cx = lane * LANE_WIDTH;
      if (span === 2) cx = (mirror === 1 ? lane + 0.5 : lane - 0.5) * LANE_WIDTH;
      if (span === 3) cx = 0;
      const ob = this.addObstacle(it.kind, cx, d + it.dz, it.length ?? DEFAULT_LENGTH[it.kind], it.height ?? DEFAULT_HEIGHT[it.kind], span, ((it.dir ?? 1) * mirror) as 1 | -1);
      placed.push(ob);
    }
    this.placeFoodForPattern(d, p.length, placed);
    this.patternCount++;
    const level = this.difficulty(d);
    const gap = (level === 1 ? 17 : level === 2 ? 13 : 10) + this.rnd() * 6;
    // Occasional bonus line in the gap.
    if (this.rnd() < 0.45) this.foodLine(d + p.length + 3, pick(this.rnd, [-1, 0, 1]), Math.max(3, Math.floor(gap / 2.6) - 1), null);
    this.maybeJunk(d + p.length + gap * 0.5);
    this.spawnTo = d + p.length + gap;
  }

  addObstacle(kind: ObstacleKind, x: number, dc: number, len: number, height: number, span: number, dir: 1 | -1 = 1): Obstacle {
    const section = this.sectionAt(dc);
    const visual = this.o.stage.makeObstacle({ kind, laneSpan: span, length: len, height, dir, section: section.id, season: section.season, rng: this.rnd });
    visual.object.position.set(x, 0, -dc);
    this.root.add(visual.object);
    const ob: Obstacle = {
      kind, span, dc, len, height, x, visual, dir,
      fromX: x,
      toX: kind === 'moverBlock' || kind === 'moverLow' ? Math.max(-LANE_WIDTH, Math.min(LANE_WIDTH, x + dir * LANE_WIDTH)) : x,
      moveT: -1, knocked: -1, knockDir: 1, threatened: false, passed: false, hit: false, guide: null,
    };
    this.obstacles.push(ob);
    return ob;
  }

  private laneObstacles(laneXv: number, placed: Obstacle[]): Obstacle[] {
    return placed.filter((o) => Math.abs(o.x - laneXv) < o.span * LANE_WIDTH * 0.5 - 0.1 || ((o.kind === 'moverBlock' || o.kind === 'moverLow') && Math.abs(o.toX - laneXv) < 0.2));
  }

  private placeFoodForPattern(d: number, length: number, placed: Obstacle[]): void {
    type Option = { lane: number; style: 'clear' | 'arc' | 'roof' | 'low' };
    const options: Option[] = [];
    for (const lane of [-1, 0, 1]) {
      const obs = this.laneObstacles(lane * LANE_WIDTH, placed);
      if (!obs.length) options.push({ lane, style: 'clear' });
      else if (obs.some((o) => o.kind === 'ramp')) options.push({ lane, style: 'roof' });
      else if (obs.every((o) => o.kind === 'low')) options.push({ lane, style: 'arc' });
      else if (obs.every((o) => o.kind === 'high')) options.push({ lane, style: 'low' });
    }
    if (!options.length) return;
    // Prefer the fun routes (over things, along roofs).
    const fun = options.filter((o) => o.style !== 'clear');
    const opt = fun.length && this.rnd() < 0.7 ? pick(this.rnd, fun) : pick(this.rnd, options);
    const n = Math.max(4, Math.min(10, Math.round((length + 6) / 2.6)));
    this.foodLine(d - 2, opt.lane, n, opt.style === 'arc' ? placed.filter((o) => o.kind === 'low') : null, opt.style === 'low');
  }

  private poolFor(d: number): string[] {
    const sec = this.sectionAt(d);
    const pool = POOLS[sec.season ?? ''] ?? POOLS[this.o.stage.id] ?? HEALTHY.map((f) => f.id);
    const extra: string[] = [];
    if (this.junkLoadHint > 0.35) extra.push('water', 'water');
    return [...pool, ...pool, ...HEALTHY.map((f) => f.id), ...extra];
  }

  /** A trail of food in a lane from distance d. arcs: low obstacles to hop over. */
  foodLine(d: number, lane: number, n: number, arcs: Obstacle[] | null, lowLine = false, foodId?: string): void {
    const pool = this.poolFor(d);
    const id = foodId ?? pick(this.rnd, pool);
    const mixed = !foodId && this.rnd() < 0.18;
    const x = lane * LANE_WIDTH;
    for (let i = 0; i < n; i++) {
      const fd = d + i * 2.6;
      let y = lowLine ? 0.55 : 0.95;
      if (arcs) {
        for (const o of arcs) {
          const rel = (fd - (o.dc - 4.2)) / 8.4;
          if (rel > 0 && rel < 1) y = Math.max(y, 0.95 + 1.15 * Math.sin(Math.PI * rel));
        }
      }
      const g = this.groundAt(x, fd);
      const def = FOOD_BY_ID[mixed ? pick(this.rnd, pool) : id];
      this.addFood(def, fd, x, g + y, i === 0 || mixed);
    }
  }

  addFood(def: FoodDef, d: number, x: number, y: number, lead: boolean): FoodItem {
    const obj = this.o.makeFood(def.id);
    obj.position.set(x, y, -d);
    this.root.add(obj);
    const f: FoodItem = { def, d, x, y, obj, taken: false, takenT: 0, pulled: false, phase: this.rnd() * 6.28, lead };
    this.foods.push(f);
    return f;
  }

  private maybeJunk(d: number): void {
    if (d - this.lastJunkAt < 45 || this.rnd() > 0.42) return;
    if (this.o.goal !== null && d > this.o.goal - 40) return;
    // Find a lane that is free at d.
    const free = [-1, 0, 1].filter((l) => this.isLaneFree(l * LANE_WIDTH, d, 2.5));
    if (!free.length) return;
    const lane = pick(this.rnd, free);
    // Off food is rarer than ordinary treats.
    const pool = JUNK.flatMap((j) => (j.junk === 'tummy' ? [j] : [j, j, j]));
    const def = pick(this.rnd, pool);
    this.addFood(def, d, lane * LANE_WIDTH, this.groundAt(lane * LANE_WIDTH, d) + 0.95, true);
    this.lastJunkAt = d;
  }

  isLaneFree(x: number, d: number, margin: number): boolean {
    return !this.obstacles.some((o) => Math.abs(o.x - x) < o.span * LANE_WIDTH * 0.5 && Math.abs(o.dc - d) < o.len / 2 + margin);
  }

  /** Walkable height at (x, d): platform tops and ramps. */
  groundAt(x: number, d: number): number {
    let g = 0;
    for (const o of this.obstacles) {
      if (o.knocked >= 0 || (o.kind !== 'platform' && o.kind !== 'ramp')) continue;
      if (Math.abs(x - o.x) > o.span * LANE_WIDTH * 0.5 - 0.15) continue;
      const d0 = o.dc - o.len / 2;
      const d1 = o.dc + o.len / 2;
      if (d < d0 || d > d1) continue;
      g = Math.max(g, o.kind === 'platform' ? PLATFORM_TOP : (PLATFORM_TOP * (d - d0)) / (d1 - d0));
    }
    return g;
  }

  // ------------------------------------------------------------------ finish arch
  private buildFinish(goal: number): void {
    const g = new THREE.Group();
    const postM = mat(PAL.cream, { rough: 0.6 });
    const stripe = mat(PAL.teal, { rough: 0.6 });
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(geo.rbox(0.5, 5, 0.5, 0.18), postM);
      post.position.set(sx * 4.4, 2.5, 0);
      g.add(post);
      for (let i = 0; i < 4; i++) {
        const band = new THREE.Mesh(geo.rbox(0.56, 0.3, 0.56, 0.1), stripe);
        band.position.set(sx * 4.4, 0.8 + i * 1.1, 0);
        g.add(band);
      }
      const ball = new THREE.Mesh(geo.sphere(0.42, 18, 14), mat(PAL.sun, { rough: 0.4 }));
      ball.position.set(sx * 4.4, 5.3, 0);
      g.add(ball);
    }
    const banner = new THREE.Mesh(
      geo.rbox(8.6, 1.0, 0.25, 0.12),
      new THREE.MeshStandardMaterial({ map: finishTexture(), roughness: 0.7 }),
    );
    banner.position.set(0, 4.55, 0);
    g.add(banner);
    // Bunting flags.
    const cols = [PAL.coral, PAL.sun, PAL.teal, PAL.sea, PAL.berry, PAL.mint];
    for (let i = 0; i < 13; i++) {
      const t = i / 12;
      const x = -4.1 + t * 8.2;
      const f = new THREE.Mesh(geo.cone(0.22, 0.45, 3), mat(cols[i % cols.length]));
      f.rotation.x = Math.PI;
      f.position.set(x, 3.75 - Math.sin(t * Math.PI) * 0.35, 0.05);
      g.add(f);
    }
    // Chequered line on the floor.
    const line = new THREE.Mesh(geo.plane(7.4, 1.2), new THREE.MeshStandardMaterial({ map: checkerTexture(), roughness: 0.8 }));
    line.rotation.x = -Math.PI / 2;
    line.position.y = 0.03;
    g.add(line);
    g.position.set(0, 0, -goal);
    this.root.add(g);
    this.finish = g;
  }

  dispose(): void {
    for (let i = this.obstacles.length - 1; i >= 0; i--) this.removeObstacle(i);
    for (const c of this.chunks) disposeTree(c.obj);
    this.chunks = [];
    this.foods.length = 0;
    if (this.finish) disposeTree(this.finish);
    this.o.scene.remove(this.root);
  }
}

/** Pattern sanity check: never all three lanes hard-blocked at the same distance. */
export function validPattern(p: StagePattern): boolean {
  for (let dz = 0; dz <= p.length; dz += 0.5) {
    const blocked = new Set<number>();
    for (const it of p.items) {
      if (it.kind !== 'block' && it.kind !== 'moverBlock') continue;
      const len = it.length ?? DEFAULT_LENGTH[it.kind];
      if (Math.abs(it.dz - dz) > len / 2 + 0.4) continue;
      const span = it.laneSpan ?? 1;
      const lanes = span === 3 ? [-1, 0, 1] : span === 2 ? [it.lane, it.lane + 1] : [it.lane];
      if (it.kind === 'moverBlock') lanes.push(it.lane + (it.dir ?? 1));
      for (const l of lanes) blocked.add(l);
    }
    if (blocked.has(-1) && blocked.has(0) && blocked.has(1)) return false;
  }
  return true;
}

function finishTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#2fb5a8';
  g.fillRect(0, 0, 1024, 128);
  g.fillStyle = '#fff4e0';
  g.font = 'bold 84px Fredoka, "Trebuchet MS", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('FINISH!', 512, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function checkerTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d')!;
  for (let y = 0; y < 2; y++)
    for (let x = 0; x < 8; x++) {
      g.fillStyle = (x + y) % 2 ? '#2b3440' : '#fbf7ef';
      g.fillRect(x * 32, y * 32, 32, 32);
    }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
