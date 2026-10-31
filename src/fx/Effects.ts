// Food effects: shows each food's real benefit (or gentle junk effect) ON the character with short,
// readable animations, plus persistent visuals driven by PowerState (shield bubble, glow aura, magnet
// field, speed streaks, junk cloud, world brightness). Words are only a light extra.
//
// Draw calls at peak: 2 sprite layers + shield + aura + 2 pulses + magnet + streaks + chart (4)
// + snail (3) + cloud (1) ~ 16. Everything is pooled; update() does no allocations.
import * as THREE from 'three';
import type { AnchorName, Avatar, EffectsSystem, Expression, FoodDef, FxContext, PowerState } from '../contracts';
import { S, releaseAtlas } from './atlas';
import { F_GERM, F_HOLD, F_JITTER, F_JUNK, F_POP, F_SWAY, SpriteLayer } from './sprites';
import { groundQuad, makeCloud, makeGroundMaterial, makeHeightChart, makeShieldMaterial, makeSnail, makeStreaks } from './props';

const ANCHORS: AnchorName[] = ['head', 'aboveHead', 'eyeL', 'eyeR', 'mouth', 'chest', 'tummy', 'armL', 'armR', 'handL', 'handR', 'legL', 'legR', 'feet', 'back'];
const DEFAULT_LOCAL: Record<AnchorName, [number, number, number]> = {
  head: [0, 1.25, 0],
  aboveHead: [0, 1.7, 0],
  eyeL: [-0.1, 1.3, -0.25],
  eyeR: [0.1, 1.3, -0.25],
  mouth: [0, 1.15, -0.27],
  chest: [0, 0.95, -0.1],
  tummy: [0, 0.75, -0.18],
  armL: [-0.32, 0.95, 0],
  armR: [0.32, 0.95, 0],
  handL: [-0.36, 0.7, 0],
  handR: [0.36, 0.7, 0],
  legL: [-0.12, 0.35, 0],
  legR: [0.12, 0.35, 0],
  feet: [0, 0.04, 0],
  back: [0, 0.95, 0.15],
};

const FIZZ = [0xff9fc0, 0xffd84a, 0x7fdcc0, 0xffffff];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const easeOutBack = (t: number) => {
  const c = 1.9;
  const u = t - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
};
const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));

// manual sprite slots (top layer)
const M_BONE = 0; // 0..3 bones, 4..7 glows
const M_TOOTHB = 8; // 8 bubble, 9-10 thought dots
const M_SPRING = 11; // 11-12
const M_TUMMY = 13;
const M_SWIRL = 14;
const M_BRR = 15;
const M_STARGLOW = 16;
const M_AURA = 17;
const M_COUNT = 19;

// emission accumulators
const Acc = {
  Aura: 0,
  Trail: 1,
  Vision: 2,
  Muscles: 3,
  Germ: 4,
  Zap: 5,
  Magnet: 6,
  Refresh: 7,
  Fizz: 8,
  Jitter: 9,
  Zzz: 10,
  Snow: 11,
  Frost: 12,
  Sigh: 13,
  Rumble: 14,
  Drizzle: 15,
  ChartTrail: 16,
  N: 17,
} as const;
type AccSlot = (typeof Acc)[keyof typeof Acc];

const STREAKS = 26;

class Effects implements EffectsSystem {
  private readonly ctx: FxContext;
  private avatar: Avatar | null = null;
  private readonly group = new THREE.Group();
  private readonly world: SpriteLayer;
  private readonly top: SpriteLayer;
  private readonly rate: number;
  private readonly origin = new THREE.Vector3();
  private readonly A = {} as Record<AnchorName, THREE.Vector3>;
  private anchorObjs: Partial<Record<AnchorName, THREE.Object3D>> = {};
  private readonly tmp = new THREE.Vector3();
  private readonly acc = new Float32Array(Acc.N);
  private now = 0;
  private alive = false;

  // event start times
  private tVision = -99;
  private tMuscles = -99;
  private tBones = -99;
  private tShieldOn = -99;
  private tEnergy = -99;
  private tRefresh = -99;
  private tGrow = -99;
  private tTummy = -99;
  private tBlock = -99;
  private tHit = -99;
  private tCloudPop = -99;
  private tTeeth = -99;
  private tFreeze = -99;

  // expressions
  private exprLock = 0;
  private lastAssert = -99;
  private pendingExpr: Expression | null = null;
  private pendingAt = 0;
  private pendingHold = 0;
  // avatar look state (sent only on change)
  private sentSparkle = -1;
  private sentShine = -1;
  private sentSticky = false;
  private sentSpeck = false;
  private sparkle = 0;

  // world look
  private visAmt = 0;
  private loadAmt = 0;
  private filterKey = -1;
  private flashEl: HTMLDivElement;

  // shield
  private readonly shield: THREE.Mesh;
  private readonly shieldMat: THREE.ShaderMaterial;
  private shieldVis = 0;
  private shieldPopped = false;
  private readonly shieldC = new THREE.Vector3(0, 0.85, 0);
  private shieldR = 1;
  // ground
  private readonly aura: THREE.Mesh;
  private readonly auraMat: THREE.ShaderMaterial;
  private auraAmt = 0;
  private auraLevel = 0;
  private readonly auraCol = new THREE.Color();
  private readonly pulses: { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; t0: number; dur: number; size: number }[] = [];
  private readonly magnet: THREE.Mesh;
  private readonly magnetMat: THREE.ShaderMaterial;
  private magnetAmt = 0;
  // streaks
  private readonly streaks: THREE.InstancedMesh;
  private readonly sPos = new Float32Array(STREAKS * 4); // x y z speed
  private streakAmt = 0;
  private readonly mtx = new THREE.Matrix4();
  private readonly qid = new THREE.Quaternion();
  private readonly sv = new THREE.Vector3();
  private readonly ss = new THREE.Vector3(1, 1, 1);
  // props
  private readonly chart = makeHeightChart();
  private chartSide = 1;
  private chartBurst = false;
  private readonly snail = makeSnail();
  private snailAmt = 0;
  private snailSide = 1;
  private readonly cloud = makeCloud();
  private cloudAmt = 0;

  constructor(ctx: FxContext) {
    this.ctx = ctx;
    this.rate = ctx.reducedMotion ? 0.4 : 1;
    for (const n of ANCHORS) this.A[n] = new THREE.Vector3(...DEFAULT_LOCAL[n]);
    this.group.name = 'fx:root';
    this.world = new SpriteLayer(ctx.reducedMotion ? 220 : 420, 0, false);
    this.top = new SpriteLayer(ctx.reducedMotion ? 90 : 160, M_COUNT, true);
    this.world.rate = this.top.rate = this.rate;
    this.world.sizeScale = this.top.sizeScale = 1.3;
    this.world.onBounce = (x, y, z) => this.germBounced(x, y, z);

    this.shieldMat = makeShieldMaterial();
    this.shield = new THREE.Mesh(new THREE.SphereGeometry(1, 36, 24), this.shieldMat);
    this.shield.renderOrder = 15;
    this.shield.visible = false;
    this.auraMat = makeGroundMaterial(0, 0xffc94a);
    this.aura = groundQuad(this.auraMat);
    this.magnetMat = makeGroundMaterial(2, 0xc7a8ff);
    this.magnet = groundQuad(this.magnetMat);
    this.magnet.scale.set(5, 5, 1);
    for (let i = 0; i < 2; i++) {
      const mat = makeGroundMaterial(1, 0xffffff);
      this.pulses.push({ mesh: groundQuad(mat), mat, t0: -99, dur: 0.6, size: 3 });
    }
    this.streaks = makeStreaks(STREAKS);
    for (let i = 0; i < STREAKS; i++) this.resetStreak(i, true);

    this.group.add(this.shield, this.aura, this.magnet, this.streaks, this.chart.root, this.snail.root, this.cloud);
    for (const p of this.pulses) this.group.add(p.mesh);
    ctx.scene.add(this.group, this.world.mesh, this.top.mesh);

    this.flashEl = document.createElement('div');
    Object.assign(this.flashEl.style, {
      position: 'absolute',
      inset: '0',
      pointerEvents: 'none',
      opacity: '0',
      background: 'radial-gradient(ellipse at 50% 45%, rgba(255,255,255,0) 30%, rgba(255,250,225,0.65) 100%)',
    });
    ctx.overlay.append(this.flashEl);
  }

  // ---------------------------------------------------------------- public API
  setAvatar(a: Avatar | null): void {
    this.avatar = a;
    this.anchorObjs = {};
    this.sentSparkle = -1;
    this.sentShine = -1;
    if (a) {
      for (const n of ANCHORS) {
        try {
          this.anchorObjs[n] = a.anchor(n);
        } catch {
          /* optional anchor */
        }
      }
      this.readAnchors();
    }
    this.group.visible = !!a;
    this.world.mesh.visible = this.top.mesh.visible = !!a;
  }

  onHealthy(food: FoodDef, power: PowerState): void {
    if (!this.avatar) return;
    const t = this.now;
    const A = this.A;
    this.say('yum', 0.45);
    switch (food.benefit) {
      case 'vision': {
        this.tVision = t;
        this.sayLater('wow', 0.4, 1.0);
        for (const [e, sd] of [[A.eyeL, -1], [A.eyeR, 1]] as const) {
          for (let i = 0; i < this.n(7); i++) {
            const a = (i / 7) * Math.PI * 2;
            this.top.spawn(i % 3 ? S.SPARK : S.STAR, e.x + sd * 0.28, e.y + 0.05, e.z, Math.cos(a) * 1.2 + sd * 0.5, Math.sin(a) * 1.2, 0, rnd(0.5, 0.75), rnd(0.16, 0.24), 0.05, i % 2 ? 0xffffff : 0xfff2a0, 1, i % 3 ? 1 : 0, 0, 0, 3);
          }
        }
        this.top.spawn(S.RING, A.head.x, A.head.y + 0.05, A.head.z, 0, 0, 0, 0.5, 0.3, 1.6, 0xfff6c8, 0.8, 1);
        if (!this.ctx.reducedMotion) {
          this.flashEl.animate([{ opacity: 0.95, transform: 'scale(1.12)' }, { opacity: 0, transform: 'scale(1)' }], { duration: 600, easing: 'ease-out' });
        }
        break;
      }
      case 'muscles': {
        this.tMuscles = t;
        this.sayLater('determined', 0.35, 1.2);
        for (const [arm, s] of [[A.armL, -1], [A.armR, 1]] as const) {
          this.top.spawn(S.BURST, arm.x + s * 0.34, arm.y + 0.26, arm.z, s * 0.4, 0.4, 0, 0.45, 0.3, 0.42, 0xffffff, 0.9, 0, 0, 0, 0, F_POP, rnd(-0.3, 0.3));
          for (let i = 0; i < this.n(6); i++) {
            this.top.spawn(S.STAR, arm.x + s * 0.2, arm.y + 0.2, arm.z, s * rnd(1.2, 2.6), rnd(1.5, 3.2), rnd(-0.6, 0.6), rnd(0.6, 0.9), rnd(0.14, 0.22), 0.06, 0xffffff, 1, 0, 0, 5, 1.2, 0, 0, rnd(-5, 5));
          }
        }
        this.top.spawn(S.RING, A.chest.x, A.chest.y, A.chest.z, 0, 0, 0, 0.5, 0.4, 2.2, 0x9be37a, 0.6, 1);
        this.pulse(0x9be37a, 3.2, 0.6);
        break;
      }
      case 'bones': {
        this.tBones = t;
        this.sayLater('grin', 0.3, 1.5);
        const m = A.mouth;
        this.top.spawn(S.TOOTH, m.x + 0.34, m.y + 0.2, m.z, 0, 0.25, 0, 1.2, 0.36, 0.36, 0xffffff, 1, 0, 0, 0, 0, F_POP | F_HOLD, 0.15, 0);
        this.top.spawn(S.SPARK, m.x + 0.38, m.y + 0.3, m.z, 0, 0.2, 0, 0.7, 0.26, 0.05, 0xffffff, 1, 1, 0, 0, 0, 0, 0, 4);
        this.pulse(0xdff4ff, 2.6, 0.55);
        break;
      }
      case 'shield': {
        this.tShieldOn = t;
        this.shieldPopped = false;
        this.sayLater('cheer', 0.35, 0.9);
        for (let i = 0; i < 3; i++) this.sendGerm(1.9 + i * 0.75);
        for (let i = 0; i < this.n(10); i++) {
          const a = (i / 10) * Math.PI * 2;
          this.world.spawn(S.SPARK, Math.cos(a) * this.shieldR, this.shieldC.y + Math.sin(a) * this.shieldR, 0.1, Math.cos(a) * 0.6, Math.sin(a) * 0.6, 0, 0.6, 0.2, 0.05, 0xc8fff2, 1, 1);
        }
        break;
      }
      case 'energy': {
        this.tEnergy = t;
        this.sayLater('grin', 0.35, 1.0);
        const c = A.chest;
        for (let i = 0; i < this.n(9); i++) {
          const a = (i / 9) * Math.PI * 2;
          this.world.spawn(S.ZAP, c.x, c.y, c.z, Math.cos(a) * 3, Math.sin(a) * 3 + 0.5, 0.4, rnd(0.4, 0.55), 0.3, 0.12, 0xffffff, 1, 0, 0, 0, 2, 0, -a + Math.PI / 2, 0);
        }
        this.streakAmt = 1.6;
        this.pulse(0xffe066, 3, 0.45);
        break;
      }
      case 'refresh': {
        this.tRefresh = t;
        this.sayLater('cheer', 0.35, 1.0);
        this.washJunk();
        const h = A.head;
        for (let i = 0; i < this.n(20); i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = rnd(0.8, 2.2);
          this.world.spawn(S.DROP, h.x, h.y + 0.25, h.z, Math.cos(a) * sp, rnd(2.0, 3.4), Math.sin(a) * sp * 0.7, rnd(0.75, 1.0), rnd(0.13, 0.2), 0.1, 0xffffff, 1, 0, 0, 7.5, 0, 0, 0, 0);
        }
        for (let i = 0; i < this.n(12); i++) {
          const a = (i / 12) * Math.PI * 2;
          this.world.spawn(S.SPARK, Math.cos(a) * 0.6, rnd(0.3, 1.5), Math.sin(a) * 0.6, Math.cos(a) * 0.8, 0.6, Math.sin(a) * 0.8, 0.7, 0.18, 0.04, 0xd9f6ff, 1, 1);
        }
        this.top.spawn(S.RING, A.chest.x, A.chest.y, A.chest.z, 0, 0, 0, 0.6, 0.4, 2.4, 0x9fdcff, 0.55, 1);
        this.pulse(0x7fd0f7, 3.6, 0.7);
        break;
      }
      case 'grow': {
        this.tGrow = t;
        this.chartBurst = false;
        this.chartSide = this.origin.x > 0.5 ? -1 : 1;
        this.sayLater('determined', 0.35, 1.0);
        break;
      }
      case 'tummy': {
        this.tTummy = t;
        this.sayLater('happy', 0.45, 1.2);
        const tm = A.tummy;
        for (let i = 0; i < this.n(6); i++) {
          const sd = i % 2 ? 1 : -1;
          this.top.spawn(S.HEART, tm.x + sd * rnd(0.15, 0.3), tm.y + rnd(-0.05, 0.15), tm.z, sd * rnd(0.4, 0.8), rnd(0.35, 0.8), 0, rnd(1.0, 1.4), rnd(0.12, 0.2), 0.16, 0xffffff, 1, 0, 0, 0, 0.5, F_POP | F_SWAY, rnd(-0.3, 0.3), 0);
        }
        this.pulse(0xffc28a, 2.4, 0.6);
        break;
      }
    }
    void power;
  }

  onJunk(food: FoodDef, power: PowerState): void {
    if (!this.avatar) return;
    const A = this.A;
    const m = A.mouth;
    switch (food.junk) {
      case 'sugar':
        this.say('grin', 0.8);
        for (let i = 0; i < this.n(14); i++) {
          this.world.spawn(S.BUBBLE, m.x + rnd(-0.15, 0.15), m.y, m.z + 0.1, rnd(-1, 1), rnd(0.8, 1.8), rnd(-0.3, 0.5), rnd(0.7, 1.1), rnd(0.1, 0.18), 0.14, FIZZ[i % 4], 1, 0, 0, 0, 0.8, F_JUNK);
        }
        break;
      case 'teeth':
        this.tTeeth = this.now;
        this.say('oops', 0.8);
        break;
      case 'freeze':
        this.tFreeze = this.now;
        this.say('brr', 1.2);
        for (let i = 0; i < this.n(7); i++) {
          const a = (i / 7) * Math.PI * 2;
          this.world.spawn(S.PUFF, A.head.x + Math.cos(a) * 0.25, A.head.y + Math.sin(a) * 0.2, A.head.z, Math.cos(a) * 0.5, Math.sin(a) * 0.4 + 0.2, 0, rnd(0.7, 1.0), 0.3, 0.6, 0xcdeeff, 0.75, 0, 0, 0, 1, F_JUNK);
        }
        for (let i = 0; i < this.n(10); i++) {
          this.top.spawn(S.SNOW, A.head.x + rnd(-0.4, 0.4), A.head.y + rnd(-0.1, 0.4), A.head.z, rnd(-0.6, 0.6), rnd(0.2, 0.9), 0, rnd(0.8, 1.2), rnd(0.1, 0.17), 0.06, 0xffffff, 1, 0, 0, 0.5, 0.5, F_JUNK, rnd(0, 6), rnd(-2, 2));
        }
        break;
      case 'slow':
        this.say('droopy', 1.0);
        this.sigh();
        break;
      case 'tummy':
        this.say('tummy', 1.2);
        for (let i = 0; i < this.n(5); i++) {
          const s = i % 2 ? 1 : -1;
          this.top.spawn(S.SWIRL, A.tummy.x + s * 0.2, A.tummy.y + rnd(-0.1, 0.1), A.tummy.z, s * rnd(0.6, 1.1), rnd(-0.2, 0.3), 0, rnd(0.6, 0.9), rnd(0.12, 0.18), 0.08, 0x9fd68a, 1, 0, 0, 0, 1, F_JUNK | this.jit(), 0, s * 6);
        }
        break;
    }
    void power;
  }

  onShieldBlock(): void {
    if (!this.avatar) return;
    this.tBlock = this.now;
    this.shieldPopped = true;
    this.say('wow', 0.8);
    const c = this.shieldC;
    const R = this.shieldR;
    for (let i = 0; i < this.n(24); i++) {
      const a = Math.random() * Math.PI * 2;
      const e = rnd(-0.9, 0.9);
      const dx = Math.cos(a) * Math.cos(e);
      const dy = Math.sin(e);
      const dz = Math.sin(a) * Math.cos(e);
      this.world.spawn(i % 3 ? S.SPARK : S.BUBBLE, c.x + dx * R, c.y + dy * R, c.z + dz * R, dx * 2.6, dy * 2.6 + 0.6, dz * 2.6, rnd(0.45, 0.75), rnd(0.12, 0.24), 0.04, 0xc8fff2, 1, i % 3 ? 1 : 0, 0, 0, 1.5);
    }
    this.top.spawn(S.BOING, c.x + 0.5, c.y + 0.75, c.z, 0, 0.4, 0, 0.7, 0.55, 0.6, 0xffffff, 1, 0, 0, 0, 0, F_POP | F_HOLD, 0.1, 0);
    this.pulse(0x7fe8d6, 3.4, 0.5);
  }

  onBonk(): void {
    if (!this.avatar) return;
    this.say('grin', 0.6);
    this.top.spawn(S.BONK, 0, 1.75, -1.1, 0, 0.35, 0, 0.75, 0.85, 0.95, 0xffffff, 1, 0, 0, 0, 0, F_POP | F_HOLD, rnd(-0.15, 0.15), 0);
    for (let i = 0; i < this.n(9); i++) {
      const a = (i / 9) * Math.PI * 2;
      this.top.spawn(S.STAR, 0, 1.1, -1.0, Math.cos(a) * 2.6, Math.sin(a) * 2.6 + 0.8, -0.5, rnd(0.45, 0.65), rnd(0.15, 0.24), 0.05, 0xffffff, 1, 0, 0, 4, 1.5, 0, 0, rnd(-6, 6));
    }
  }

  onBump(): void {
    if (!this.avatar) return;
    this.say('oops', 0.8);
    const h = this.A.head;
    for (let i = 0; i < this.n(6); i++) {
      const a = (i / 6) * Math.PI * 2;
      this.top.spawn(S.STAR, h.x + Math.cos(a) * 0.3, h.y + 0.25, h.z + Math.sin(a) * 0.3, Math.cos(a) * 0.9, 0.9, Math.sin(a) * 0.9, 0.7, 0.16, 0.06, 0xffffff, 1, 0, 0, 2, 0.8, 0, 0, 5);
    }
    this.top.spawn(S.BOING, h.x + 0.45, h.y + 0.35, h.z, 0, 0.3, 0, 0.7, 0.5, 0.55, 0xffffff, 1, 0, 0, 0, 0, F_POP | F_HOLD, -0.12, 0);
  }

  onBounceBack(): void {
    if (!this.avatar) return;
    this.washJunk();
    this.sayLater('cheer', 0.5, 0.8);
    for (let i = 0; i < this.n(16); i++) {
      const a = Math.random() * Math.PI * 2;
      this.world.spawn(i % 4 ? S.SPARK : S.STAR, Math.cos(a) * 0.5, rnd(0.2, 1.6), Math.sin(a) * 0.4, Math.cos(a) * 1.2, rnd(0.6, 1.6), Math.sin(a) * 1.2, rnd(0.6, 0.9), rnd(0.14, 0.22), 0.05, 0xfff6c8, 1, i % 4 ? 1 : 0, 0, 0, 1);
    }
  }

  onGlowLevel(level: number, full: boolean): void {
    if (!this.avatar) return;
    this.pulse(full ? 0xffc94a : 0xffd98a, 2.4 + level * 0.35, 0.7);
    for (let i = 0; i < this.n(8 + level * 3); i++) {
      const a = Math.random() * Math.PI * 2;
      const r = rnd(0.3, 0.8);
      this.world.spawn(S.SPARK, Math.cos(a) * r, 0.1, Math.sin(a) * r, 0, rnd(1.6, 3), 0, rnd(0.7, 1.1), rnd(0.12, 0.2), 0.04, 0xffe7a0, 1, 1, 0, 0, 0.8);
    }
    if (full) {
      this.sayLater('cheer', 0.3, 1.3);
      const c = this.A.chest;
      this.top.spawn(S.RING, c.x, c.y, c.z, 0, 0, 0, 0.8, 0.4, 3.0, 0xffd36a, 0.8, 1);
      for (let i = 0; i < this.n(12); i++) {
        const a = (i / 12) * Math.PI * 2;
        this.top.spawn(i % 3 ? S.STAR : S.HEART, c.x, c.y, c.z, Math.cos(a) * 2.2, Math.sin(a) * 2.2 + 1, 0, rnd(0.8, 1.1), rnd(0.16, 0.24), 0.08, 0xffffff, 1, 0, 0, 2.5, 1.2, 0, 0, rnd(-3, 3));
      }
    }
  }

  update(dt: number, time: number, p: PowerState): void {
    void time;
    dt = Math.min(dt, 0.1);
    this.now += dt;
    const av = this.avatar;
    if (!av) {
      this.applyFilter(0, 0, 0);
      return;
    }
    this.alive = true;
    av.root.getWorldPosition(this.origin);
    this.readAnchors();
    this.group.position.copy(this.origin);
    this.world.origin.copy(this.origin);
    this.top.origin.copy(this.origin);
    const now = this.now;
    const A = this.A;

    // shield geometry follows the body (taller when standing, wider on wheels)
    const headY = Math.max(0.7, A.head.y);
    this.shieldC.set(0, headY * 0.55 + 0.08, av.ride === 'shoes' ? 0 : 0.05);
    this.shieldR = Math.max(0.8, headY * 0.62 + 0.15);

    this.updateExpression(p);
    this.updateLook(dt, p);
    this.updateShield(dt, p);
    this.updateAura(dt, p);
    this.updatePulses();
    this.updateMagnet(dt, p);
    this.updateStreaks(dt, p);
    this.updateChart(dt);
    this.updateSnail(dt, p);
    this.updateCloud(dt, p);
    this.updateJunk(dt, p);
    this.updateHealthyTails(dt, p);
    this.updateBones();

    this.world.update(dt);
    this.top.update(dt);
    void now;
  }

  reset(): void {
    this.world.clear();
    this.top.clear();
    this.tVision = this.tMuscles = this.tBones = this.tShieldOn = this.tEnergy = this.tRefresh = this.tGrow = this.tTummy = -99;
    this.tBlock = this.tHit = this.tCloudPop = this.tTeeth = this.tFreeze = -99;
    this.shieldVis = this.auraAmt = this.magnetAmt = this.streakAmt = this.snailAmt = this.cloudAmt = 0;
    this.visAmt = this.loadAmt = 0;
    this.shieldPopped = false;
    this.pendingExpr = null;
    this.exprLock = 0;
    this.acc.fill(0);
    this.shield.visible = this.aura.visible = this.magnet.visible = this.streaks.visible = false;
    this.chart.root.visible = this.snail.root.visible = this.cloud.visible = false;
    for (const pu of this.pulses) {
      pu.t0 = -99;
      pu.mesh.visible = false;
    }
    this.applyFilter(0, 0, 0);
    this.ctx.canvas.style.filter = '';
    this.filterKey = -1;
    if (this.avatar) {
      this.avatar.setEyeSparkle(0);
      this.avatar.setTeeth({ shine: 0, sticky: false, speck: false });
    }
    this.sparkle = 0;
    this.sentSparkle = 0;
    this.sentShine = 0;
    this.sentSticky = this.sentSpeck = false;
  }

  dispose(): void {
    this.avatar = null; // the avatar may already be disposed by the engine
    this.reset();
    this.ctx.scene.remove(this.group, this.world.mesh, this.top.mesh);
    this.world.dispose();
    this.top.dispose();
    releaseAtlas();
    this.shield.geometry.dispose();
    this.shieldMat.dispose();
    this.aura.geometry.dispose();
    this.auraMat.dispose();
    this.magnet.geometry.dispose();
    this.magnetMat.dispose();
    for (const pu of this.pulses) {
      pu.mesh.geometry.dispose();
      pu.mat.dispose();
    }
    this.streaks.geometry.dispose();
    (this.streaks.material as THREE.Material).dispose();
    this.streaks.dispose();
    this.flashEl.remove();
    this.avatar = null;
    void this.alive;
  }

  // ---------------------------------------------------------------- helpers
  private n(count: number): number {
    return Math.max(1, Math.round(count * this.rate));
  }

  private jit(): number {
    return this.ctx.reducedMotion ? 0 : F_JITTER;
  }

  /** Continuous emission: returns how many to emit this frame for `perSec`. */
  private tick(slot: AccSlot, perSec: number, dt: number): number {
    this.acc[slot] += perSec * this.rate * dt;
    const k = Math.floor(this.acc[slot]);
    this.acc[slot] -= k;
    return Math.min(k, 6);
  }

  private readAnchors(): void {
    for (const n of ANCHORS) {
      const o = this.anchorObjs[n];
      if (!o) continue;
      o.getWorldPosition(this.tmp);
      this.A[n].copy(this.tmp).sub(this.origin);
    }
  }

  private say(e: Expression, hold: number): void {
    this.avatar?.setExpression(e, hold);
    this.exprLock = this.now + hold;
    this.pendingExpr = null;
  }

  private sayLater(e: Expression, delay: number, hold: number): void {
    this.pendingExpr = e;
    this.pendingAt = this.now + delay;
    this.pendingHold = hold;
  }

  private persistentExpr(p: PowerState): Expression | null {
    if (p.freeze > 0) return 'brr';
    if (p.tummyAche > 0) return 'tummy';
    if (p.slump > 0) return 'sleepy';
    if (p.slow > 0) return 'droopy';
    if (p.sugarRush > 0) return 'grin';
    if (p.junkLoad > 0.8) return 'droopy';
    return null;
  }

  private updateExpression(p: PowerState): void {
    const av = this.avatar!;
    if (this.pendingExpr && this.now >= this.pendingAt) {
      const e = this.pendingExpr;
      this.pendingExpr = null;
      av.setExpression(e, this.pendingHold);
      this.exprLock = this.now + this.pendingHold;
      return;
    }
    if (this.now < this.exprLock || this.pendingExpr) return;
    const pe = this.persistentExpr(p);
    if (pe && this.now - this.lastAssert > 0.4) {
      av.setExpression(pe, 0.65);
      this.lastAssert = this.now;
    }
  }

  private updateLook(dt: number, p: PowerState): void {
    const av = this.avatar!;
    // sparkly eyes
    const ev = this.now - this.tVision;
    const target = p.vision > 0 ? (ev < 0.7 ? 1 : 0.8) : 0;
    this.sparkle = target > this.sparkle ? target : damp(this.sparkle, target, 4, dt);
    const sq = Math.round(this.sparkle * 50) / 50;
    if (sq !== this.sentSparkle) {
      av.setEyeSparkle(sq);
      this.sentSparkle = sq;
    }
    // teeth: dairy shine, sticky lollies
    const eb = this.now - this.tBones;
    let shine = eb < 2.4 ? 1 - (eb / 2.4) * 0.5 : 0;
    if (p.bones > 0) shine = Math.max(shine, 0.4);
    shine = Math.round(shine * 20) / 20;
    const sticky = p.teeth > 0;
    if (shine !== this.sentShine || sticky !== this.sentSticky || sticky !== this.sentSpeck) {
      av.setTeeth({ shine, sticky, speck: sticky });
      this.sentShine = shine;
      this.sentSticky = this.sentSpeck = sticky;
    }
    // world brightness / crispness (carrot) and gentle desaturation (junk load)
    this.visAmt = damp(this.visAmt, p.vision > 0 ? Math.min(1, p.vision / 0.6) : 0, 5, dt);
    this.loadAmt = damp(this.loadAmt, p.junkLoad, 2, dt);
    const flash = !this.ctx.reducedMotion && ev < 0.5 ? 1 - ev / 0.5 : 0;
    this.applyFilter(this.visAmt, this.loadAmt, flash);
  }

  private applyFilter(vis: number, load: number, flash: number): void {
    const b = Math.round((1 + 0.06 * vis + 0.16 * flash - 0.05 * load) * 100);
    const c = Math.round((1 + 0.08 * vis) * 100);
    const s = Math.round((1 + 0.18 * vis) * (1 - 0.25 * load) * 100);
    const key = b * 1e6 + c * 1e3 + s;
    if (key === this.filterKey) return;
    this.filterKey = key;
    this.ctx.canvas.style.filter = b === 100 && c === 100 && s === 100 ? '' : `brightness(${b / 100}) contrast(${c / 100}) saturate(${s / 100})`;
  }

  private pulse(color: number, size: number, dur: number): void {
    let best = this.pulses[0];
    for (const pu of this.pulses) if (pu.t0 < best.t0) best = pu;
    best.t0 = this.now;
    best.dur = dur;
    best.size = size;
    (best.mat.uniforms.uColor.value as THREE.Color).setHex(color);
  }

  private updatePulses(): void {
    for (const pu of this.pulses) {
      const e = (this.now - pu.t0) / pu.dur;
      if (e < 0 || e > 1) {
        pu.mesh.visible = false;
        continue;
      }
      pu.mesh.visible = true;
      const s = 0.6 + (pu.size - 0.6) * (1 - Math.pow(1 - e, 2.2));
      pu.mesh.scale.set(s, s, 1);
      pu.mat.uniforms.uAlpha.value = (1 - e) * 1.1;
    }
  }

  // ---------------------------------------------------------------- shield + germs
  private sendGerm(dist: number): void {
    const a = rnd(-Math.PI * 0.9, Math.PI * 0.9) + Math.PI / 2; // mostly from the sides / front, visible from behind
    const e = rnd(-0.2, 0.6);
    const dx = Math.cos(a) * Math.cos(e);
    const dz = -Math.abs(Math.sin(a)) * Math.cos(e) * 0.8 + 0.2;
    const dy = Math.sin(e);
    const c = this.shieldC;
    const sp = 3.4;
    this.world.spawn(Math.random() < 0.5 ? S.GERM : S.GERM2, c.x + dx * dist, c.y + dy * dist, c.z + dz * dist, -dx * sp, -dy * sp, -dz * sp, 3, 0.34, 0.34, 0xffffff, 1, 0, 0, 0, 0, F_GERM | F_HOLD, rnd(-0.3, 0.3), rnd(-1.5, 1.5));
  }

  private germBounced(x: number, y: number, z: number): void {
    this.tHit = this.now;
    const c = this.shieldC;
    const v = this.shieldMat.uniforms.uHitDir.value as THREE.Vector3;
    v.set(x - c.x, y - c.y, z - c.z).normalize();
    for (let i = 0; i < this.n(5); i++) {
      this.world.spawn(S.SPARK, x, y, z, v.x * 1.5 + rnd(-0.8, 0.8), v.y * 1.5 + rnd(-0.5, 0.8), v.z * 1.5 + rnd(-0.8, 0.8), 0.4, rnd(0.12, 0.2), 0.03, 0xc8fff2, 1, 1, 0, 0, 2);
    }
    this.world.spawn(S.RING, x, y, z, 0, 0, 0, 0.3, 0.1, 0.6, 0xc8fff2, 0.9, 1);
  }

  private updateShield(dt: number, p: PowerState): void {
    if (p.shield <= 0) this.shieldPopped = false;
    const want = p.shield > 0 && !this.shieldPopped ? 1 : 0;
    const eb = this.now - this.tBlock;
    const popping = eb < 0.35;
    this.shieldVis = popping ? this.shieldVis : damp(this.shieldVis, want, want ? 10 : 6, dt);
    const sh = this.shield;
    const u = this.shieldMat.uniforms;
    u.uTime.value = this.now;
    if (!popping && this.shieldVis < 0.01) {
      sh.visible = false;
      this.world.bounceR = 0;
      return;
    }
    sh.visible = true;
    const R = this.shieldR;
    const eOn = this.now - this.tShieldOn;
    let s = eOn < 0.45 ? 0.3 + 0.7 * easeOutBack(Math.min(1, eOn / 0.45)) : 1;
    let alpha = this.shieldVis;
    u.uFlash.value = 0;
    if (popping) {
      const k = eb / 0.35;
      s = 1 + k * 0.4;
      alpha = (1 - k) * 0.9;
      u.uFlash.value = (1 - k) * 0.45;
    }
    // wobble after a germ bounce + breathing
    const eh = this.now - this.tHit;
    const wob = eh < 0.5 ? Math.sin(eh * 30) * (1 - eh / 0.5) * 0.06 : 0;
    const breathe = Math.sin(this.now * 2.2) * 0.015;
    u.uHit.value = eh < 0.35 ? 1 - eh / 0.35 : 0;
    const sx = R * 0.92 * s * (1 + wob + breathe);
    const sy = R * 1.08 * s * (1 - wob + breathe);
    const sz = R * (this.avatar!.ride === 'shoes' ? 0.92 : 1.2) * s * (1 + wob);
    sh.position.copy(this.shieldC);
    sh.scale.set(sx, sy, sz);
    u.uAlpha.value = alpha * 0.85;
    if (!popping) {
      this.world.bounceCenter.copy(this.shieldC);
      this.world.bounceR = R * 1.0;
      // occasional germ attempts while the shield is up
      if (this.tick(Acc.Germ, 0.42, dt)) this.sendGerm(rnd(2.6, 3.4));
    } else this.world.bounceR = 0;
  }

  // ---------------------------------------------------------------- glow aura
  private updateAura(dt: number, p: PowerState): void {
    const hh = p.happyAndHealthy;
    const level = hh ? 5 : p.glowLevel;
    this.auraLevel = damp(this.auraLevel, level, 3, dt);
    const dim = 1 - 0.6 * this.loadAmt;
    const target = level > 0 ? (0.32 + level * 0.1 + (hh ? 0.25 : 0)) * dim : 0;
    this.auraAmt = damp(this.auraAmt, target, 3, dt);
    if (this.auraAmt < 0.01) {
      this.aura.visible = false;
    } else {
      this.aura.visible = true;
      const s = 1.3 + this.auraLevel * 0.2 + (hh ? 0.35 : 0) + Math.sin(this.now * 2.4) * 0.04;
      this.aura.scale.set(s, s, 1);
      const warm = Math.min(1, this.auraLevel / 5);
      this.auraCol.setRGB(1, 0.7 + 0.09 * warm, 0.54 - 0.25 * warm);
      (this.auraMat.uniforms.uColor.value as THREE.Color).copy(this.auraCol);
      this.auraMat.uniforms.uAlpha.value = this.auraAmt;
      this.auraMat.uniforms.uTime.value = this.now;
    }
    // rising sparkles grow with the glow level
    const k = this.tick(Acc.Aura, level > 0 ? (level * 1.4 + (hh ? 5 : 0)) * dim : 0, dt);
    for (let i = 0; i < k; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = rnd(0.35, 0.7);
      this.world.spawn(S.SPARK, Math.cos(a) * r, 0.1, Math.sin(a) * r * 0.7, 0, rnd(1.0, 1.8), 0, rnd(0.7, 1.1), rnd(0.08, 0.15), 0.03, hh ? 0xffe28a : 0xffe7c4, 0.9, 1);
    }
    // golden sparkle trail left behind while happy and healthy + soft golden body glow
    if (hh) {
      const c = this.A.chest;
      this.top.manual(M_AURA, S.GLOW, c.x, c.y - 0.1, c.z, 2.0 + Math.sin(this.now * 3) * 0.08, 0, 0xffd36a, 0.3 * dim, 1);
      const kt = this.tick(Acc.Trail, 14, dt);
      for (let i = 0; i < kt; i++) {
        const o = this.origin;
        this.world.spawn(i % 3 ? S.SPARK : S.STAR, o.x + rnd(-0.35, 0.35), o.y + rnd(0.1, 0.7), o.z + rnd(0.1, 0.4), rnd(-0.2, 0.2), rnd(0.2, 0.6), 0, rnd(0.6, 0.9), rnd(0.1, 0.16), 0.02, 0xffd36a, 1, 1, 1);
      }
    }
  }

  // ---------------------------------------------------------------- magnet (grow strong)
  private updateMagnet(dt: number, p: PowerState): void {
    this.magnetAmt = damp(this.magnetAmt, p.magnet > 0 ? 1 : 0, 4, dt);
    if (this.magnetAmt < 0.01) {
      this.magnet.visible = false;
      return;
    }
    this.magnet.visible = true;
    this.magnetMat.uniforms.uAlpha.value = this.magnetAmt * 0.34;
    this.magnetMat.uniforms.uTime.value = this.now;
    const k = this.tick(Acc.Magnet, 7 * this.magnetAmt, dt);
    const c = this.A.chest;
    for (let i = 0; i < k; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = rnd(2.2, 2.8);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r * 0.8;
      const y = rnd(0.3, 1.6);
      const life = 0.8;
      this.world.spawn(S.SPARK, x, y, z, (c.x - x) / life, (c.y - y) / life, (c.z - z) / life, life, 0.1, 0.2, i % 2 ? 0xe6dbff : 0xfff1d0, 0.9, 1);
    }
  }

  // ---------------------------------------------------------------- speed streaks (energy)
  private resetStreak(i: number, initial: boolean): void {
    const o = i * 4;
    let x = 0;
    let y = 0;
    do {
      x = rnd(-2.8, 2.8);
      y = rnd(0.15, 2.6);
    } while (Math.abs(x) < 0.75 && y < 2.1);
    this.sPos[o] = x;
    this.sPos[o + 1] = y;
    this.sPos[o + 2] = initial ? rnd(-20, 2) : rnd(-24, -16);
    this.sPos[o + 3] = rnd(26, 42);
  }

  private updateStreaks(dt: number, p: PowerState): void {
    const target = p.energy > 0 ? 1 : 0;
    this.streakAmt = this.streakAmt > target ? damp(this.streakAmt, target, 2.5, dt) : damp(this.streakAmt, target, 8, dt);
    const amt = Math.min(1.6, this.streakAmt);
    if (amt < 0.02) {
      this.streaks.visible = false;
    } else {
      this.streaks.visible = true;
      (this.streaks.material as THREE.MeshBasicMaterial).opacity = Math.min(0.8, amt * (this.ctx.reducedMotion ? 0.25 : 0.45));
      for (let i = 0; i < STREAKS; i++) {
        const o = i * 4;
        this.sPos[o + 2] += this.sPos[o + 3] * dt;
        if (this.sPos[o + 2] > 2.5) this.resetStreak(i, false);
        this.sv.set(this.sPos[o], this.sPos[o + 1], this.sPos[o + 2]);
        this.ss.set(1, 1, 0.6 + amt * 0.8);
        this.mtx.compose(this.sv, this.qid, this.ss);
        this.streaks.setMatrixAt(i, this.mtx);
      }
      this.streaks.instanceMatrix.needsUpdate = true;
    }
    // yellow zig-zag sparks trailing behind
    if (p.energy > 0) {
      const k = this.tick(Acc.Zap, 9, dt);
      const o = this.origin;
      for (let i = 0; i < k; i++) {
        const s = Math.random() < 0.5 ? -1 : 1;
        this.world.spawn(S.ZAP, o.x + s * rnd(0.2, 0.45), o.y + rnd(0.15, 1.1), o.z + rnd(0.1, 0.4), s * rnd(0.2, 0.6), rnd(-0.2, 0.4), rnd(0.5, 1.5), rnd(0.4, 0.55), rnd(0.22, 0.3), 0.08, 0xffffff, 1, 0, 1, 0, 0, 0, rnd(-0.6, 0.6), 0);
      }
    }
  }

  // ---------------------------------------------------------------- height chart (grow strong)
  private updateChart(dt: number): void {
    const e = this.now - this.tGrow;
    const D = 1.9;
    const ch = this.chart;
    if (e < 0 || e > D) {
      ch.root.visible = false;
      return;
    }
    ch.root.visible = true;
    const side = this.chartSide;
    ch.root.position.set(side * 1.15, 0, -0.35);
    ch.root.rotation.y = -side * 0.3;
    const pop = e < 0.32 ? easeOutBack(e / 0.32) : e > D - 0.3 ? smooth((D - e) / 0.3) : 1;
    ch.root.scale.set(Math.max(0.001, pop), Math.max(0.001, pop), Math.max(0.001, pop));
    // star climbs the chart
    const climb = smooth((e - 0.3) / 0.95);
    const y = 0.22 + climb * (ch.height - 0.12);
    ch.star.position.y = y;
    ch.star.rotation.y = e * 5;
    const sc = 1 + (e > 1.25 && e < 1.6 ? Math.sin(((e - 1.25) / 0.35) * Math.PI) * 0.45 : 0);
    ch.star.scale.set(sc, sc, sc);
    // sprout grows
    const g = e < 0.25 ? 0 : easeOutBack(Math.min(1, (e - 0.25) / 0.6));
    ch.sprout.scale.set(Math.max(0.001, g), Math.max(0.001, g), Math.max(0.001, g));
    // star sparkle trail + glow (runner-local coords of the star)
    const wx = ch.root.position.x;
    const wz = ch.root.position.z + 0.12;
    if (e > 0.3 && e < 1.25) {
      const k = this.tick(Acc.ChartTrail, 18, dt);
      for (let i = 0; i < k; i++) this.world.spawn(S.SPARK, wx + rnd(-0.08, 0.08), y * pop, wz, rnd(-0.3, 0.3), -0.4, 0, 0.5, 0.12, 0.03, 0xffe7a0, 1, 1);
    }
    this.top.manual(M_STARGLOW, S.GLOW, wx, y * pop, wz, 0.6 * pop, 0, 0xffe28a, 0.55 * pop, 1);
    if (!this.chartBurst && e > 1.25) {
      this.chartBurst = true;
      this.say('cheer', 0.9);
      for (let i = 0; i < this.n(12); i++) {
        const a = (i / 12) * Math.PI * 2;
        this.top.spawn(i % 3 ? S.SPARK : S.STAR, wx, y, wz, Math.cos(a) * 1.8, Math.sin(a) * 1.8, 0, rnd(0.5, 0.75), rnd(0.12, 0.2), 0.04, 0xffffff, 1, i % 3 ? 1 : 0, 0, 1.5, 1.5);
      }
    }
  }

  // ---------------------------------------------------------------- snail buddy (slow)
  private updateSnail(dt: number, p: PowerState): void {
    const want = p.slow > 0 ? 1 : 0;
    if (want && this.snailAmt < 0.02) this.snailSide = this.origin.x < -0.5 ? 1 : -1;
    this.snailAmt = damp(this.snailAmt, want, want ? 3 : 2.2, dt);
    const sn = this.snail;
    if (this.snailAmt < 0.01) {
      sn.root.visible = false;
      return;
    }
    sn.root.visible = true;
    const side = this.snailSide;
    sn.root.position.set(side * 0.95, 0, 0.35 + (1 - this.snailAmt) * 3.5);
    sn.root.rotation.y = side * 0.95;
    const w = this.now * 5;
    sn.body.scale.set(1, 1 - Math.sin(w) * 0.04, 1 + Math.sin(w) * 0.08);
    sn.shell.rotation.z = Math.sin(w * 0.5) * 0.05;
    sn.root.scale.setScalar(1.6);
    if (p.slow > 0 && this.tick(Acc.Sigh, 0.9, dt)) this.sigh();
  }

  private sigh(): void {
    const m = this.A.mouth;
    this.world.spawn(S.PUFF, m.x + 0.1, m.y, m.z, rnd(0.3, 0.6), rnd(-0.15, 0.1), 0.4, 1.2, 0.24, 0.5, 0xe4edf5, 0.9, 0, 0, -0.1, 0.8, F_JUNK | F_SWAY);
  }

  // ---------------------------------------------------------------- little junk cloud
  private updateCloud(dt: number, p: PowerState): void {
    const want = p.junkLoad >= 0.55 && this.now - this.tCloudPop > 3.5 ? 1 : 0;
    this.cloudAmt = damp(this.cloudAmt, want, want ? 2 : 4, dt);
    const cl = this.cloud;
    if (this.cloudAmt < 0.01) {
      cl.visible = false;
      return;
    }
    cl.visible = true;
    const h = this.A.aboveHead;
    cl.position.set(h.x, h.y + 0.22 + Math.sin(this.now * 1.6) * 0.04, h.z + 0.05);
    const s = 1.25 * this.cloudAmt * (1 + Math.sin(this.now * 2.1) * 0.03);
    cl.scale.set(s, s, s);
    const k = this.tick(Acc.Drizzle, 6 * this.cloudAmt, dt);
    for (let i = 0; i < k; i++) {
      this.world.spawn(S.DROP, cl.position.x + rnd(-0.22, 0.22), cl.position.y - 0.12, cl.position.z + rnd(-0.08, 0.08), 0, -1.2, 0, 0.42, 0.09, 0.08, 0xd6ecff, 0.9, 0, 0, 3, 0, F_JUNK, 0, 0);
    }
  }

  private washJunk(): void {
    this.world.killFlag(F_JUNK);
    this.top.killFlag(F_JUNK);
    if (this.cloudAmt > 0.15) {
      const c = this.cloud.position;
      for (let i = 0; i < this.n(14); i++) {
        const a = Math.random() * Math.PI * 2;
        this.top.spawn(S.SPARK, c.x + Math.cos(a) * 0.2, c.y + Math.sin(a) * 0.12, c.z, Math.cos(a) * 1.6, Math.sin(a) * 1.2 + 0.4, 0, rnd(0.45, 0.7), rnd(0.12, 0.2), 0.03, 0xfffbe8, 1, 1);
      }
      for (let i = 0; i < this.n(5); i++) {
        const a = (i / 5) * Math.PI * 2;
        this.world.spawn(S.PUFF, c.x, c.y, c.z, Math.cos(a) * 1.2, Math.sin(a) * 0.8, 0, 0.5, 0.25, 0.5, 0xffffff, 0.8, 0, 0, 0, 2);
      }
      this.cloudAmt = 0;
      this.cloud.visible = false;
    }
    this.tCloudPop = this.now;
  }

  // ---------------------------------------------------------------- junk tails
  private updateJunk(dt: number, p: PowerState): void {
    const A = this.A;
    // sugar rush: fizzy bubbles + jittery sparkles
    if (p.sugarRush > 0) {
      const k = this.tick(Acc.Fizz, 14, dt);
      for (let i = 0; i < k; i++) {
        this.world.spawn(S.BUBBLE, rnd(-0.5, 0.5), rnd(0.2, 1.2), rnd(-0.3, 0.3), rnd(-0.15, 0.15), rnd(0.6, 1.3), 0, rnd(0.7, 1.1), rnd(0.13, 0.24), 0.18, FIZZ[i % 4], 1, 0, 0, 0, 0, F_JUNK | this.jit());
      }
      const kj = this.tick(Acc.Jitter, 6, dt);
      for (let i = 0; i < kj; i++) {
        this.top.spawn(S.SPARK, A.head.x + rnd(-0.45, 0.45), A.head.y + rnd(-0.1, 0.4), A.head.z, 0, 0.3, 0, 0.35, 0.2, 0.06, i % 2 ? 0xff9fc0 : 0xffe066, 1, 1, 0, 0, 0, F_JUNK | this.jit());
      }
    }
    // sugar slump: floating z z z
    if (p.slump > 0 && this.tick(Acc.Zzz, 1.8, dt)) {
      const h = A.aboveHead;
      this.top.spawn(S.Z, h.x + 0.2, h.y - 0.05, h.z, 0.18, 0.5, 0, 1.9, 0.24, 0.42, 0xffffff, 1, 0, 0, 0, 0, F_JUNK | F_SWAY, rnd(-0.3, 0.1), 0);
    }
    // sticky teeth: a little thought bubble with a sticky tooth, wobbling by the head
    if (p.teeth > 0) {
      const e = this.now - this.tTeeth;
      const pop = e < 0.4 ? easeOutBack(e / 0.4) : 1;
      const fade = Math.min(1, p.teeth / 0.4);
      const h = A.head;
      const side = this.origin.x > 0.5 ? -1 : 1;
      const bx = h.x + side * 0.62;
      const by = h.y + 0.5 + Math.sin(this.now * 2.2) * 0.04;
      this.top.manual(M_TOOTHB, S.TOOTH_BUBBLE, bx, by, h.z, 0.55 * pop, Math.sin(this.now * 3.1) * 0.14, 0xffffff, fade);
      this.top.manual(M_TOOTHB + 1, S.DOT, h.x + side * 0.3, h.y + 0.28, h.z, 0.07 * pop, 0, 0xffffff, fade * 0.95);
      this.top.manual(M_TOOTHB + 2, S.DOT, h.x + side * 0.4, h.y + 0.36, h.z, 0.1 * pop, 0, 0xffffff, fade * 0.95);
    }
    // brain freeze: snowflakes + frosty puffs + brrr
    if (p.freeze > 0) {
      const h = A.head;
      const k = this.tick(Acc.Snow, 10, dt);
      for (let i = 0; i < k; i++) {
        const a = Math.random() * Math.PI * 2;
        this.top.spawn(S.SNOW, h.x + Math.cos(a) * 0.42, h.y + rnd(-0.1, 0.35), h.z + Math.sin(a) * 0.3, -Math.sin(a) * 0.6, rnd(-0.3, 0.1), Math.cos(a) * 0.6, rnd(0.7, 1.0), rnd(0.08, 0.15), 0.05, 0xffffff, 1, 0, 0, 0.3, 0, F_JUNK, rnd(0, 6), rnd(-2, 2));
      }
      if (this.tick(Acc.Frost, 3, dt)) this.world.spawn(S.PUFF, h.x + rnd(-0.3, 0.3), h.y + 0.1, h.z + 0.1, rnd(-0.3, 0.3), 0.3, 0, 0.8, 0.35, 0.65, 0xcdeeff, 0.6, 0, 0, 0, 1, F_JUNK);
      const e = this.now - this.tFreeze;
      const pop = e < 0.3 ? easeOutBack(e / 0.3) : 1;
      const shake = this.ctx.reducedMotion ? 0 : Math.sin(this.now * 45) * 0.025;
      const side = this.origin.x > 0.5 ? -1 : 1;
      this.top.manual(M_BRR, S.BRR, h.x - side * 0.6 + shake, h.y + 0.32, h.z, 0.55 * pop, -side * 0.12, 0xffffff, Math.min(1, p.freeze / 0.3));
    }
    // rumbly tummy: wiggly swirl at the tummy + squiggles
    if (p.tummyAche > 0) {
      const t = A.tummy;
      const fade = Math.min(1, p.tummyAche / 0.4);
      const wob = 1 + Math.sin(this.now * 9) * 0.08;
      this.top.manual(M_SWIRL, S.SWIRL, t.x, t.y, t.z, 0.44 * wob, -this.now * 4, 0x9fd68a, 0.9 * fade);
      const k = this.tick(Acc.Rumble, 3.5, dt);
      for (let i = 0; i < k; i++) {
        const s = Math.random() < 0.5 ? -1 : 1;
        this.top.spawn(S.SWIRL, t.x + s * 0.22, t.y + rnd(-0.1, 0.1), t.z, s * rnd(0.5, 0.9), rnd(-0.1, 0.3), 0, 0.7, 0.16, 0.08, 0x8fd06a, 1, 0, 0, 0, 1, F_JUNK | this.jit(), 0, s * 6);
      }
    }
  }

  // ---------------------------------------------------------------- healthy tails
  private updateHealthyTails(dt: number, p: PowerState): void {
    const A = this.A;
    if (p.vision > 0) {
      const k = this.tick(Acc.Vision, 3.5, dt);
      for (let i = 0; i < k; i++) {
        const sd = Math.random() < 0.5 ? -1 : 1;
        const e = sd < 0 ? A.eyeL : A.eyeR;
        this.top.spawn(S.SPARK, e.x + sd * rnd(0.22, 0.34), e.y + rnd(-0.04, 0.14), e.z, 0, 0.15, 0, 0.5, 0.16, 0.03, 0xfff6c8, 1, 1, 0, 0, 0, 0, 0, 3);
      }
    }
    if (p.muscles > 0) {
      const k = this.tick(Acc.Muscles, 2.2, dt);
      for (let i = 0; i < k; i++) {
        const arm = Math.random() < 0.5 ? A.armL : A.armR;
        this.top.spawn(i % 2 ? S.STAR : S.SPARK, arm.x, arm.y + 0.1, arm.z, rnd(-0.3, 0.3), 0.6, 0, 0.5, 0.11, 0.03, i % 2 ? 0xffffff : 0xb8f09a, 1, i % 2 ? 0 : 1);
      }
    }
    if (p.refresh > 0) {
      const k = this.tick(Acc.Refresh, 8, dt);
      for (let i = 0; i < k; i++) {
        this.world.spawn(i % 2 ? S.DROP : S.SPARK, rnd(-0.4, 0.4), rnd(0.5, 1.6), rnd(-0.2, 0.2), 0, -0.6, 0, 0.6, 0.08, 0.04, i % 2 ? 0xffffff : 0xd9f6ff, 0.9, i % 2 ? 0 : 1, 0, 2);
      }
    }
    // tummy glow: a warm smiley glow at the tummy anchor
    const et = this.now - this.tTummy;
    const glow = Math.max(et < 1.6 ? (et < 0.25 ? easeOutBack(et / 0.25) : 1 - smooth((et - 1.2) / 0.4) * 0.6) : 0, p.happyTummy > 0 ? 0.4 : 0);
    if (glow > 0.01) {
      const t = A.tummy;
      const pulse = 1 + Math.sin(this.now * 6) * 0.06;
      this.top.manual(M_TUMMY, S.TUMMY, t.x, t.y, t.z, 0.72 * pulse * Math.max(0.6, glow), 0, 0xffffff, Math.min(1, glow));
    }
    // bones power: a subtle bouncy spring at each foot
    if (p.bones > 0) {
      const fade = Math.min(1, p.bones / 0.5) * 0.8;
      for (let i = 0; i < 2; i++) {
        const leg = i ? A.legR : A.legL;
        const bounce = Math.abs(Math.sin(this.now * 7 + i * 1.6));
        this.top.manual(M_SPRING + i, S.SPRING, leg.x, 0.12 + bounce * 0.06, leg.z + 0.05, 0.22 + bounce * 0.04, 0, 0xffffff, fade);
      }
    }
  }

  private updateBones(): void {
    const e = this.now - this.tBones;
    if (e < 0 || e > 1.7) return;
    const A = this.A;
    const fade = e < 0.18 ? e / 0.18 : e > 1.3 ? 1 - (e - 1.3) / 0.4 : 1;
    const limbs = [A.armL, A.armR, A.legL, A.legR];
    for (let i = 0; i < 4; i++) {
      const l = limbs[i];
      const shimmer = 0.78 + 0.22 * Math.sin(this.now * 16 + i * 1.7);
      const y = i < 2 ? l.y - 0.12 : l.y;
      const rot = 0.97 + (i % 2 ? -0.18 : 0.18);
      this.top.manual(M_BONE + 4 + i, S.GLOW, l.x, y, l.z, 0.5, 0, 0xbfe8ff, 0.32 * fade * shimmer, 1);
      this.top.manual(M_BONE + i, S.BONE, l.x, y, l.z, 0.5 * (0.92 + 0.08 * shimmer), rot, 0xffffff, fade);
    }
  }
}

/** Create the food effects system (contracts.ts EffectsSystem). */
export function createEffects(ctx: FxContext): EffectsSystem {
  return new Effects(ctx);
}
