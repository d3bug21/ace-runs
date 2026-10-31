// Shared contracts between the engine, avatar, food/fx, stages and UI modules.
// World conventions (used everywhere):
//   * Units are metres. +Y is up, the track surface is y = 0.
//   * The runner travels toward -Z. Track distance d >= 0 maps to world z = -d.
//   * The camera sits behind the runner (at larger z) looking toward -Z, so world +X is
//     screen right and the runner's right. Lane index -1 / 0 / +1 = left / middle / right.
import type * as THREE from 'three';

export const LANE_WIDTH = 2.2;
export const laneX = (lane: number): number => lane * LANE_WIDTH;

export type CharacterId = 'ace' | 'moana';
export type RideId = 'shoes' | 'bike' | 'scooter' | 'skate';
export type StageId = 'indoor' | 'arcade' | 'outdoor' | 'sports' | 'jungle' | 'parks';
export type Season = 'winter' | 'spring' | 'summer' | 'autumn';
export type RunMode = 'adventure' | 'endless' | 'tutorial';

export const CHARACTERS: CharacterId[] = ['ace', 'moana'];
export const RIDES: RideId[] = ['shoes', 'bike', 'scooter', 'skate'];
export const STAGES: StageId[] = ['indoor', 'arcade', 'outdoor', 'sports', 'jungle', 'parks'];

// ------------------------------------------------------------------ avatar
export type Expression =
  | 'happy' // default cheerful smile
  | 'grin' // big open smile
  | 'wow' // amazed, round mouth, raised brows
  | 'yum' // eyes closed happy, cheeks puffed / munching
  | 'oops' // surprised bump face (never hurt or crying)
  | 'sleepy' // half-closed eyes, yawn-ready
  | 'droopy' // a little glum, droopy brows (mild)
  | 'tummy' // "oh no, my tummy" wobbly mouth
  | 'determined' // focused little smile
  | 'brr' // brain-freeze shiver, teeth chattering
  | 'cheer'; // eyes squeezed happy, mouth wide (celebration)

export type AnchorName =
  | 'head'
  | 'aboveHead'
  | 'eyeL'
  | 'eyeR'
  | 'mouth'
  | 'chest'
  | 'tummy'
  | 'back'
  | 'armL'
  | 'armR'
  | 'handL'
  | 'handR'
  | 'legL'
  | 'legR'
  | 'feet';

/** Per-frame motion state the engine feeds to the avatar. */
export interface AvatarMotion {
  time: number; // seconds since run/menu start
  dt: number;
  speed: number; // forward m/s (0 when idle in menus)
  lateral: number; // lateral velocity m/s, + = right (runner's right == screen right)
  airborne: boolean;
  vy: number; // vertical velocity m/s
  jumpT: number; // seconds since take-off, -1 when grounded
  sliding: boolean;
  slideT: number; // seconds since slide start, -1 when not sliding
  landT: number; // seconds since last landing (999 if long ago)
  bumpT: number; // seconds since last bump/stumble (999 if long ago)
  boost: number; // 0..1 banana zoom intensity
  sleepy: number; // 0..1 sugar-slump / tired weight
  wobble: number; // 0..1 wobbly / tummy-ache sway weight
  mood: number; // -1 droopy .. +1 happy
  flex: number; // 0..1 muscle-flex pose weight (broccoli / spinach)
  celebrate: number; // 0..1 cheer pose weight (finish line, results)
  menu: boolean; // idle "showing off" pose for menus (no forward travel)
}

export interface TeethState {
  shine: number; // 0..1 bright sparkling teeth (dairy)
  sticky: boolean; // sticky-teeth look (lollies / chocolate)
  speck: boolean; // tiny cavity speck on one tooth
}

export interface Avatar {
  /** Origin on the ground under the runner, facing -Z. */
  readonly root: THREE.Group;
  readonly character: CharacterId;
  readonly ride: RideId;
  /** Standing head-top height in metres (about 1.5). */
  readonly height: number;
  update(m: AvatarMotion): void;
  setExpression(e: Expression, holdSeconds?: number): void;
  anchor(name: AnchorName): THREE.Object3D;
  setTeeth(t: TeethState): void;
  /** 0..1 sparkly eyes (carrot). */
  setEyeSparkle(v: number): void;
  /** 0..1 opacity of a full-body blink used during invulnerability. */
  setBlink(visible: boolean): void;
  dispose(): void;
}

// ------------------------------------------------------------------ food
export type BenefitId = 'vision' | 'muscles' | 'bones' | 'shield' | 'energy' | 'refresh' | 'grow' | 'tummy';
export type JunkEffectId = 'sugar' | 'teeth' | 'freeze' | 'slow' | 'tummy';

export interface FoodDef {
  id: string;
  name: string; // display name (grown-ups / older kids)
  kind: 'healthy' | 'junk';
  benefit?: BenefitId;
  junk?: JunkEffectId;
  /** Short friendly line shown lightly in the book / results. */
  blurb: string;
  /** Bite sound effect id. */
  sfx: string;
  /** Stages where it is common (undefined = everywhere). */
  stages?: StageId[];
  points: number;
}

// ------------------------------------------------------------------ powers / effects
export interface PowerState {
  // healthy powers: seconds remaining (0 = inactive)
  vision: number; // carrot: sparkly eyes, brighter sharper world, guide arrows
  muscles: number; // broccoli/spinach/peas: bonk through obstacles
  bones: number; // dairy: bouncy super jumps
  shield: number; // orange/kiwifruit/feijoa/strawberry: germ shield (absorbs one bump)
  energy: number; // banana/corn/kumara/bread: zippy zoom boost
  magnet: number; // eggs/chicken/fish/nuts (grow strong): food friends fly to you
  refresh: number; // water: splash sparkle (cosmetic tail after instantly clearing junk)
  happyTummy: number; // apple slices / fruit salad / meals: happy tummy glow
  // junk effects: seconds remaining
  sugarRush: number; // fizzy jittery burst
  slump: number; // sleepy wobbly slump after the rush
  teeth: number; // sticky teeth + cavity speck
  freeze: number; // ice-cream brain freeze shiver
  slow: number; // slow heavy tired moment (chips / fried)
  tummyAche: number; // rumbling tummy (off food)
  // long-term
  junkLoad: number; // 0..1, builds with junk, falls with healthy food + water
  glow: number; // 0..1 "healthy and happy" glow meter (capped by junkLoad)
  glowLevel: number; // 0..5 integer steps of glow
  happyAndHealthy: boolean; // glow full -> golden happy aura
}

/** Context the effects system gets from the engine. */
export interface FxContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  canvas: HTMLCanvasElement;
  /** Absolutely-positioned DOM layer above the canvas, below HUD (pointer-events: none). */
  overlay: HTMLElement;
  reducedMotion: boolean;
}

export interface EffectsSystem {
  setAvatar(a: Avatar | null): void;
  /** A healthy food was collected: play its benefit animation on the character. */
  onHealthy(food: FoodDef, power: PowerState): void;
  /** A junk food was collected: play its gentle, funny effect. */
  onJunk(food: FoodDef, power: PowerState): void;
  onShieldBlock(): void; // shield bounced a bump away
  onBonk(): void; // muscles bonked an obstacle aside
  onBump(): void; // a gentle bump (lost a heart)
  onBounceBack(): void; // junk cleared by healthy food / water
  onGlowLevel(level: number, full: boolean): void;
  /** Persistent visuals (shield bubble, aura, magnet field, junk clouds, world brightness). */
  update(dt: number, time: number, power: PowerState): void;
  reset(): void;
  dispose(): void;
}

// ------------------------------------------------------------------ stages
export type ObstacleKind =
  | 'low' // jump over: top <= 0.9 m
  | 'high' // slide under: nothing below y = 1.05 inside the lane span; body up to >= 2.2
  | 'block' // change lane: solid y 0..>=2.4
  | 'platform' // tall walk-on block, top at y = PLATFORM_TOP; reached via a ramp
  | 'ramp' // incline from y 0 up to PLATFORM_TOP over its length, directly before a platform
  | 'moverBlock' // creature/object (1 lane wide, >= 1.6 tall) that walks across lanes
  | 'moverLow'; // low (<= 0.8) thing that rolls/hops across lanes (jump over it)

export const LOW_MAX = 0.9;
export const HIGH_CLEARANCE = 1.05;
export const PLATFORM_TOP = 2.0;

export interface ObstacleRequest {
  kind: ObstacleKind;
  /** Lanes covered (1..3); width = laneSpan * LANE_WIDTH, centred on the object origin. */
  laneSpan: number;
  /** Extent along the track (metres). Object occupies local z in [-length/2, +length/2]. */
  length: number;
  /** For low: top height. block: height. platform/ramp: PLATFORM_TOP. high: top of body. */
  height: number;
  /** Movers: walking direction along X (+1 = toward screen right). */
  dir?: 1 | -1;
  /** Stage section at this distance (e.g. 'rugby', 'winter'). */
  section: string;
  season?: Season;
  rng: () => number;
}

export interface ObstacleVisual {
  /** Origin: centre of the footprint on the ground (y = 0). Engine positions it. */
  object: THREE.Object3D;
  /** Idle/moving animation. dist = metres until the runner reaches it (negative once passed). */
  update?(time: number, dt: number, dist: number): void;
  /** Called when muscles bonk it or the runner bumps it: optional wobble/knock reaction. */
  react?(kind: 'bonk' | 'bump'): void;
  dispose?(): void;
}

export interface StageSection {
  id: string; // e.g. 'rugby', 'winter', or the stage id for single-section stages
  label: string; // friendly display name
  start: number; // track distance where it starts (m)
  season?: Season;
}

export interface StageBuildContext {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  quality: 'low' | 'high';
}

export interface DecorRequest {
  /** Track distance range [d0, d1) to decorate (world z from -d0 to -d1). */
  d0: number;
  d1: number;
  section: StageSection;
  rng: () => number;
}

export interface StageModule extends StagePatternSource {
  readonly id: StageId;
  readonly name: string;
  /** Adventure length in metres (finish line). */
  readonly length: number;
  readonly music: string; // music id in the audio manifest
  /** Sections in order (single entry for most stages). Must cover distance 0..infinity. */
  readonly sections: StageSection[];
  /** Sky, fog, lights. Add everything under one Group you own and remove it in dispose(). */
  build(ctx: StageBuildContext): void;
  /** Floor + side scenery for a stretch of track. Returned object is placed as-is (world coords). */
  buildDecor(req: DecorRequest): THREE.Object3D;
  /** Themed visual for a gameplay obstacle. Must honour the collision dimensions. */
  makeObstacle(req: ObstacleRequest): ObstacleVisual;
  /** Per-frame: ambient critters, little surprises, season blending. playerPos is world. */
  update(time: number, dt: number, dist: number, playerPos: THREE.Vector3): void;
  /** Ambience id for a distance (seasons can change it). */
  ambienceAt(dist: number): string;
  /** Optional: occasional stage sound effect ids to sprinkle (arcade bleeps, jungle calls...). */
  readonly sprinkleSfx?: string[];
  dispose(): void;
}

// ------------------------------------------------------------------ themed obstacle patterns
/** One obstacle in an authored pattern. dz = metres from the pattern start (increasing = further ahead). */
export interface PatternItem {
  dz: number;
  lane: -1 | 0 | 1; // centre lane of the footprint (for laneSpan 3 use 0; laneSpan 2 is centred between lane and lane+1 -> use lane -1 or 0 and the engine offsets +0.5 lane)
  kind: ObstacleKind;
  laneSpan?: 1 | 2 | 3; // default 1
  length?: number; // default by kind
  height?: number; // default by kind
  dir?: 1 | -1; // movers
}
/**
 * Authored, stage-themed pattern. The engine places food trails itself around them.
 * Rules: every row must stay passable (a free lane, or a jumpable 'low' / slidable 'high');
 * rows that need different actions should be >= 9 m apart; ramps sit directly before a platform
 * in the same lane (ramp.dz + ramp.length/2 == platform.dz - platform.length/2).
 */
export interface StagePattern {
  id: string;
  /** Only used inside this section id (e.g. 'tennis'); omit = any section of the stage. */
  section?: string;
  difficulty: 1 | 2 | 3;
  /** Total metres the pattern occupies. */
  length: number;
  items: PatternItem[];
}
/** Optional extension a StageModule may implement. */
export interface StagePatternSource {
  readonly patterns?: StagePattern[];
}
