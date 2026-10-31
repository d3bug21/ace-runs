// Avatar harness: all 8 character x ride combos, every motion state, expression and teeth
// state, preset cameras (incl. the gameplay camera) and perf / slide-height checks.
// URL params (for scripted screenshots): char=ace|ciela|both ride=shoes|bike|scooter|skate|all
// grid=1 view=game|front|threeq|back|side|face|low|orbit act=run|idle|menu|lanes|leanL|leanR|jump|slide|land|bump
// speed boost sleepy wobble mood flex celebrate sparkle shine sticky=1 speck=1 expr=<Expression>
// t=<seconds> (simulate then freeze) spin=<rad/s> clean=1
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Avatar, AvatarMotion, CharacterId, Expression, RideId, StretchMove } from '../src/contracts';
import { CHARACTERS, COOLDOWN_MOVES, RIDES, WARMUP_MOVES } from '../src/contracts';
import { createAvatar, debugFaceClearance, debugRig } from '../src/avatar';
import { blobShadow, canvasTexture } from '../src/kit/kit';

type View = 'game' | 'front' | 'threeq' | 'menu' | 'near' | 'back' | 'side' | 'face' | 'shoe' | 'low' | 'orbit';
type Act = 'run' | 'idle' | 'menu' | 'lanes' | 'leanL' | 'leanR' | 'jump' | 'slide' | 'land' | 'bump';
const VIEWS: View[] = ['game', 'front', 'threeq', 'menu', 'near', 'back', 'side', 'face', 'shoe', 'low', 'orbit'];
const ACTS: Act[] = ['run', 'idle', 'menu', 'lanes', 'leanL', 'leanR', 'jump', 'slide', 'land', 'bump'];
const EXPRS: (Expression | 'auto')[] = ['auto', 'happy', 'grin', 'wow', 'yum', 'oops', 'sleepy', 'droopy', 'tummy', 'determined', 'brr', 'cheer'];

const qs = new URLSearchParams(location.search);
const num = (k: string, d: number) => (qs.has(k) ? Number(qs.get(k)) : d);
const S = {
  char: (qs.get('char') ?? 'ace') as CharacterId | 'both',
  ride: (qs.get('ride') ?? 'shoes') as RideId | 'all',
  grid: qs.get('grid') === '1',
  view: (qs.get('view') ?? 'threeq') as View,
  act: (qs.get('act') ?? 'run') as Act,
  speed: num('speed', 11),
  boost: num('boost', 0),
  sleepy: num('sleepy', 0),
  wobble: num('wobble', 0),
  mood: num('mood', 0.3),
  flex: num('flex', 0),
  celebrate: num('celebrate', 0),
  sparkle: num('sparkle', 0),
  shine: num('shine', 0),
  sticky: qs.get('sticky') === '1',
  speck: qs.get('speck') === '1',
  expr: (qs.get('expr') ?? 'auto') as Expression | 'auto',
  spin: num('spin', 0),
  blink: false,
  freezeT: qs.has('t') ? Number(qs.get('t')) : null,
  move: (qs.get('move') ?? 'none') as StretchMove | 'none',
  side: (qs.get('side') === '-1' ? -1 : 1) as 1 | -1,
};
const MOVES: (StretchMove | 'none')[] = ['none', ...WARMUP_MOVES, ...COOLDOWN_MOVES];
let moveT0 = 0;
if (qs.get('clean') === '1') document.body.classList.add('clean');

// ------------------------------------------------------------------ renderer + scene
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbfe6f5);
scene.fog = new THREE.Fog(0xbfe6f5, 30, 110);
// Gameplay lights (like the stages) vs menu lights (like MenuScene, mirrored to face the camera).
const hemi = new THREE.HemisphereLight(0xffffff, 0x88aa77, 1.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1dd, 1.6);
sun.position.set(6, 12, 4);
scene.add(sun);
const rim = new THREE.DirectionalLight(0xbfe6ff, 0);
scene.add(rim);
function setLights(menu: boolean): void {
  if (menu) {
    hemi.color.setHex(0xfff6e8);
    hemi.groundColor.setHex(0x9cc7a8);
    hemi.intensity = 1.7;
    sun.color.setHex(0xfff0dc);
    sun.intensity = 2.0;
    sun.position.set(4, 8, -6);
    rim.intensity = 0.9;
    rim.position.set(-6, 4, 5);
  } else {
    hemi.color.setHex(0xffffff);
    hemi.groundColor.setHex(0x88aa77);
    hemi.intensity = 1.6;
    sun.color.setHex(0xfff1dd);
    sun.intensity = 1.6;
    sun.position.set(6, 12, 4);
    rim.intensity = 0;
  }
}
const camera = new THREE.PerspectiveCamera(62, 1, 0.05, 200);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enabled = false;

const groundTex = canvasTexture(256, 256, (g, w, h) => {
  g.fillStyle = '#f1d79a';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#e6c886';
  g.fillRect(0, 0, w, h / 2);
  g.fillStyle = 'rgba(255,255,255,0.65)';
  for (const x of [0.2, 0.8]) g.fillRect(x * w - 3, 0, 6, h);
});
groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
groundTex.repeat.set(1, 40);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(11, 220), new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.9 }));
ground.rotation.x = -Math.PI / 2;
ground.position.z = -80;
scene.add(ground);
const grass = new THREE.Mesh(new THREE.PlaneGeometry(200, 220), new THREE.MeshStandardMaterial({ color: 0x7cc46a, roughness: 0.95 }));
grass.rotation.x = -Math.PI / 2;
grass.position.set(0, -0.01, -80);
scene.add(grass);

// ------------------------------------------------------------------ avatars
interface Slot {
  a: Avatar;
  x0: number;
  z0: number;
  shadow: THREE.Mesh;
  x: number;
  lane: number;
}
let slots: Slot[] = [];
function combos(): [CharacterId, RideId][] {
  if (S.grid) return CHARACTERS.flatMap((c) => RIDES.map((r) => [c, r] as [CharacterId, RideId]));
  const cs = S.char === 'both' ? CHARACTERS : [S.char];
  const rs = S.ride === 'all' ? RIDES : [S.ride];
  return cs.flatMap((c) => rs.map((r) => [c, r] as [CharacterId, RideId]));
}
function rebuild(): void {
  for (const s of slots) {
    s.a.dispose();
    scene.remove(s.shadow);
  }
  slots = [];
  const list = combos();
  const cols = S.grid ? 4 : list.length;
  list.forEach(([c, r], i) => {
    const a = createAvatar(c, r);
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x0 = (col - (cols - 1) / 2) * (S.grid ? 1.7 : 1.6);
    const z0 = -row * 2.6;
    a.root.position.set(x0, 0, z0);
    scene.add(a.root);
    const sh = blobShadow(r === 'bike' ? 0.7 : 0.75, r === 'bike' ? 1.4 : 0.9, 0.3);
    scene.add(sh);
    slots.push({ a, x0, z0, shadow: sh, x: x0, lane: 0 });
  });
  applyStatic();
}
function applyStatic(): void {
  for (const s of slots) {
    s.a.setTeeth({ shine: S.shine, sticky: S.sticky, speck: S.speck });
    s.a.setEyeSparkle(S.sparkle);
    if (S.expr !== 'auto') s.a.setExpression(S.expr, 1e6);
    else s.a.setExpression('happy');
  }
}

// ------------------------------------------------------------------ simulated engine motion
const JUMP_V = 7.6;
const G = 24;
const AIR = (2 * JUMP_V) / G;
function motionAt(t: number, dt: number, s: Slot): AvatarMotion {
  const m: AvatarMotion = {
    time: t, dt, speed: S.speed, lateral: 0, airborne: false, vy: 0, jumpT: -1, sliding: false, slideT: -1,
    landT: 999, bumpT: 999, boost: S.boost, sleepy: S.sleepy, wobble: S.wobble, mood: S.mood, flex: S.flex,
    celebrate: S.celebrate, menu: false,
  };
  let y = 0;
  let x = s.x0;
  if (S.move !== 'none') {
    // stretches play in menus (no forward travel); the clock restarts when a move is picked
    m.speed = 0;
    m.menu = true;
    m.stretch = { move: S.move, t: Math.max(0, t - moveT0), side: S.side };
    s.a.root.position.set(x, 0, s.z0);
    s.shadow.position.set(x, 0.012, s.z0);
    return m;
  }
  switch (S.act) {
    case 'idle':
      m.speed = 0;
      break;
    case 'menu':
      m.speed = 0;
      m.menu = true;
      break;
    case 'leanL':
      m.lateral = -9;
      break;
    case 'leanR':
      m.lateral = 9;
      break;
    case 'lanes': {
      const seq = [0, 1, 0, -1];
      const lane = seq[Math.floor(t / 1.1) % 4];
      const nx = s.x0 + lane * 1.2;
      const px = s.x;
      s.x = px + (nx - px) * (1 - Math.exp(-14 * dt));
      x = s.x;
      m.lateral = dt > 0 ? (s.x - px) / dt : 0;
      break;
    }
    case 'jump': {
      const u = t % 1.35;
      if (u < AIR) {
        m.airborne = true;
        m.jumpT = u;
        m.vy = JUMP_V - G * u;
        y = JUMP_V * u - 0.5 * G * u * u;
      } else m.landT = u - AIR;
      break;
    }
    case 'slide': {
      const u = t % 1.4;
      if (u > 0.2 && u < 0.95) {
        m.sliding = true;
        m.slideT = u - 0.2;
      }
      break;
    }
    case 'land':
      m.landT = t % 1.0;
      break;
    case 'bump':
      m.bumpT = t % 1.3;
      break;
    case 'run':
      break;
  }
  s.a.root.position.set(x, y, s.z0);
  s.shadow.position.set(x, 0.012, s.z0 + (s.a.ride === 'bike' ? -0.05 : 0));
  const k = Math.max(0.4, 1 - y * 0.35);
  s.shadow.scale.set((s.a.ride === 'bike' ? 0.7 : 0.75) * k, (s.a.ride === 'bike' ? 1.4 : 0.9) * k, 1);
  return m;
}

// ------------------------------------------------------------------ cameras
function placeCamera(): void {
  const c = slots.length === 1 ? slots[0].a.root.position : new THREE.Vector3(0, 0, slots.length > 4 ? -1.3 : 0);
  const cx = slots.length === 1 ? c.x : 0;
  const many = slots.length > 1;
  const far = many ? (S.grid ? 2.6 : 1.8) : 1;
  controls.enabled = S.view === 'orbit';
  setLights(S.view !== 'game' && S.view !== 'back');
  if (S.view === 'near') camera.fov = 55;
  camera.fov = 50;
  switch (S.view) {
    case 'game':
      camera.fov = 62;
      camera.position.set(cx, 3.4, c.z + 6.5 + (many ? 1.5 : 0));
      camera.lookAt(cx, 1.1, c.z - 7);
      break;
    case 'front':
      camera.position.set(cx, 1.05, c.z - 3.1 * far);
      camera.lookAt(cx, 0.78, c.z);
      break;
    case 'threeq':
      camera.position.set(cx + 2.0 * far, 1.35 * Math.min(far, 1.6), c.z - 2.5 * far);
      camera.lookAt(cx, 0.75, c.z);
      break;
    case 'menu':
      // like MenuScene (front 3/4 at ~6.5 m), slightly narrower lens for review
      camera.fov = 24;
      camera.position.set(cx + 2.4, 1.6, c.z - 6.1);
      camera.lookAt(cx + (STEP[slots[0]?.a.ride ?? 'shoes'] ?? 0) * -0.5, 0.72, c.z);
      break;
    case 'near':
      camera.position.set(cx + 1.25, 1.2, c.z - 1.75);
      camera.lookAt(cx, 0.78, c.z);
      break;
    case 'back':
      camera.position.set(cx, 1.5, c.z + 3.0 * far);
      camera.lookAt(cx, 0.8, c.z);
      break;
    case 'side':
      camera.position.set(cx + 3.2 * far, 0.95, c.z);
      camera.lookAt(cx, 0.75, c.z);
      break;
    case 'low':
      camera.position.set(cx + 1.6 * far, 0.35, c.z - 2.2 * far);
      camera.lookAt(cx, 0.6, c.z);
      break;
    case 'face': {
      camera.fov = 30;
      const hy = 1.16;
      camera.position.set(cx + 0.35, hy + 0.12, c.z - 1.35);
      camera.lookAt(cx, hy - 0.02, c.z);
      break;
    }
    case 'shoe':
      camera.fov = 28;
      camera.position.set(cx + 0.62, 0.3, c.z - 0.5);
      camera.lookAt(cx + 0.02, 0.07, c.z - 0.04);
      break;
    case 'orbit':
      if (!orbitInit) {
        camera.position.set(cx + 2, 1.4, c.z - 2.6);
        controls.target.set(cx, 0.8, c.z);
        orbitInit = true;
      }
      break;
  }
  camera.updateProjectionMatrix();
}
let orbitInit = false;
/** Camera-centre nudge for the kid's step-off on wheeled rides (kid steps to its own left = -X). */
const STEP: Record<RideId, number> = { shoes: 0, bike: -0.98, scooter: -0.96, skate: -0.8 };

function resize(): void {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

// ------------------------------------------------------------------ stats
interface Stats {
  calls: number;
  triangles: number;
  perAvatar: { id: string; meshes: number; triangles: number }[];
}
function avatarStats(a: Avatar): { meshes: number; triangles: number } {
  let meshes = 0;
  let tris = 0;
  a.root.traverseVisible((o) => {
    const me = o as THREE.Mesh;
    if (me.isMesh || (o as THREE.Sprite).isSprite) {
      meshes++;
      const g = me.geometry;
      tris += g.index ? g.index.count / 3 : g.getAttribute('position').count / 3;
    }
  });
  return { meshes, triangles: Math.round(tris) };
}
const w = window as unknown as {
  __ready: boolean;
  __stats: Stats;
  __heights: () => Record<string, Record<string, number>>;
  __breakdown: () => string[];
};
w.__breakdown = () =>
  slots.flatMap((s) => {
    const rows: [string, number][] = [];
    s.a.root.traverse((o) => {
      const me = o as THREE.Mesh;
      if (!me.isMesh) return;
      const g = me.geometry;
      const tris = g.index ? g.index.count / 3 : g.getAttribute('position').count / 3;
      rows.push([`${s.a.character}/${s.a.ride} ${me.parent?.name || '?'}`, Math.round(tris)]);
    });
    return rows.sort((a, b) => b[1] - a[1]).slice(0, 14).map(([n, t]) => `${n}: ${t}`);
  });
w.__ready = false;
/** Fringe guard check: for every expression (and mid-blink / squint), brow top vs fringe bottom. */
(window as unknown as { __fringe: () => string[] }).__fringe = () => {
  const out: string[] = [];
  const exprs: Expression[] = ['happy', 'grin', 'wow', 'yum', 'oops', 'sleepy', 'droopy', 'tummy', 'determined', 'brr', 'cheer'];
  for (const r of RIDES) {
    const a = createAvatar('ciela', r);
    let worst = 1;
    for (const e of exprs) {
      a.setExpression(e, 99);
      let minC = 1;
      for (let i = 0; i < 240; i++) {
        a.update({ time: i / 60, dt: 1 / 60, speed: 0, lateral: 0, airborne: false, vy: 0, jumpT: -1, sliding: false, slideT: -1, landT: 999, bumpT: i % 80, boost: 0, sleepy: e === 'sleepy' ? 1 : 0, wobble: 0, mood: 0, flex: 0, celebrate: e === 'cheer' ? 1 : 0, menu: true });
        const c = debugFaceClearance(a).clearance ?? 1;
        minC = Math.min(minC, c);
      }
      worst = Math.min(worst, minC);
      if (r === 'shoes') out.push(`${e}: min clearance ${(minC * 1000).toFixed(1)} mm`);
    }
    out.push(`ciela/${r}: worst ${(worst * 1000).toFixed(1)} mm`);
    a.dispose();
  }
  return out;
};

/** Max world height of each combo during slide / run / jump-tuck / menu, by vertex-precise bounds. */
w.__heights = () => {
  const out: Record<string, Record<string, number>> = {};
  const box = new THREE.Box3();
  for (const c of CHARACTERS) {
    for (const r of RIDES) {
      const a = createAvatar(c, r);
      scene.add(a.root);
      const res: Record<string, number> = {};
      const run = (name: string, mk: (t: number) => Partial<AvatarMotion>, t0: number, t1: number) => {
        let mx = 0;
        for (let t = 0; t < t1; t += 1 / 60) {
          const base: AvatarMotion = { time: t, dt: 1 / 60, speed: 11, lateral: 0, airborne: false, vy: 0, jumpT: -1, sliding: false, slideT: -1, landT: 999, bumpT: 999, boost: 0, sleepy: 0, wobble: 0, mood: 0, flex: 0, celebrate: 0, menu: false };
          a.update({ ...base, ...mk(t) });
          if (t >= t0) {
            a.root.updateMatrixWorld(true);
            box.makeEmpty();
            a.root.traverseVisible((o) => {
              if ((o as THREE.Mesh).isMesh) box.expandByObject(o, true);
            });
            mx = Math.max(mx, box.max.y);
          }
        }
        res[name] = Math.round(mx * 1000) / 1000;
      };
      run('stand', () => ({ speed: 0 }), 1.0, 1.5);
      run('run', () => ({}), 1.0, 3.0);
      run('slide', (t) => (t > 0.5 ? { sliding: true, slideT: t - 0.5 } : {}), 0.75, 1.6);
      run('slideEarly', (t) => (t > 0.5 ? { sliding: true, slideT: t - 0.5 } : {}), 0.6, 0.75);
      run('slideBoostSleepy', (t) => (t > 0.5 ? { sliding: true, slideT: t - 0.5, boost: 1, sleepy: 0.6 } : {}), 0.75, 1.6);
      run('slideLeanL', (t) => (t > 0.5 ? { sliding: true, slideT: t - 0.5, lateral: -10 } : {}), 0.75, 1.6);
      run('slideLeanR', (t) => (t > 0.5 ? { sliding: true, slideT: t - 0.5, lateral: 10 } : {}), 0.75, 1.6);
      run('slideBump', (t) => (t > 0.5 ? { sliding: true, slideT: t - 0.5, bumpT: (t - 0.5) % 0.65 } : {}), 0.75, 1.6);
      run('slideWobble', (t) => (t > 0.5 ? { sliding: true, slideT: t - 0.5, wobble: 1, mood: -1 } : {}), 0.75, 2.0);
      run('menu', () => ({ speed: 0, menu: true }), 1.0, 8.0);
      out[`${c}/${r}`] = res;
      a.dispose();
    }
  }
  return out;
};

// ------------------------------------------------------------------ UI
const ui = document.getElementById('ui')!;
const info = document.getElementById('info')!;
function syncUrl(): void {
  const p = new URLSearchParams();
  p.set('char', S.char);
  p.set('ride', S.ride);
  if (S.grid) p.set('grid', '1');
  p.set('view', S.view);
  p.set('act', S.act);
  for (const k of ['speed', 'boost', 'sleepy', 'wobble', 'mood', 'flex', 'celebrate', 'sparkle', 'shine', 'spin'] as const) p.set(k, String(S[k]));
  if (S.sticky) p.set('sticky', '1');
  if (S.speck) p.set('speck', '1');
  if (S.expr !== 'auto') p.set('expr', S.expr);
  if (S.move !== 'none') p.set('move', S.move);
  if (S.side === -1) p.set('side', '-1');
  history.replaceState(null, '', `?${p.toString()}`);
}
function buttons<T extends string>(label: string, opts: readonly T[], get: () => T, set: (v: T) => void): void {
  const lab = document.createElement('div');
  lab.className = 'lab';
  lab.textContent = label;
  ui.append(lab);
  const row = document.createElement('div');
  row.className = 'row';
  const btns: HTMLButtonElement[] = [];
  for (const o of opts) {
    const b = document.createElement('button');
    b.textContent = o;
    b.onclick = () => {
      set(o);
      for (const x of btns) x.classList.toggle('on', x.textContent === get());
      syncUrl();
    };
    b.classList.toggle('on', o === get());
    btns.push(b);
    row.append(b);
  }
  ui.append(row);
}
function slider(label: string, key: 'speed' | 'boost' | 'sleepy' | 'wobble' | 'mood' | 'flex' | 'celebrate' | 'sparkle' | 'shine' | 'spin', min: number, max: number, after?: () => void): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'row';
  const l = document.createElement('label');
  const inp = document.createElement('input');
  inp.type = 'range';
  inp.min = String(min);
  inp.max = String(max);
  inp.step = String((max - min) / 100);
  inp.value = String(S[key]);
  const val = document.createElement('span');
  val.textContent = S[key].toFixed(2);
  inp.oninput = () => {
    S[key] = Number(inp.value);
    val.textContent = S[key].toFixed(2);
    after?.();
    syncUrl();
  };
  l.append(`${label} `, inp, val);
  row.append(l);
  ui.append(row);
  return row;
}
buttons('character', ['ace', 'ciela', 'both'] as const, () => S.char, (v) => {
  S.char = v;
  S.grid = false;
  rebuild();
});
buttons('ride', ['shoes', 'bike', 'scooter', 'skate', 'all'] as const, () => S.ride, (v) => {
  S.ride = v;
  S.grid = false;
  rebuild();
});
buttons('layout', ['single', 'grid'] as const, () => (S.grid ? 'grid' : 'single'), (v) => {
  S.grid = v === 'grid';
  rebuild();
});
buttons('camera', VIEWS, () => S.view, (v) => {
  S.view = v;
  orbitInit = false;
});
buttons('motion', ACTS, () => S.act, (v) => {
  S.act = v;
});
slider('speed', 'speed', 0, 22);
slider('boost', 'boost', 0, 1);
slider('sleepy', 'sleepy', 0, 1);
slider('wobble', 'wobble', 0, 1);
slider('mood', 'mood', -1, 1);
slider('flex', 'flex', 0, 1);
slider('celebrate', 'celebrate', 0, 1);
slider('turntable', 'spin', 0, 2);
buttons('stretch (warm-up / cool-down)', MOVES, () => S.move, (v) => {
  S.move = v;
  moveT0 = simT;
});
buttons('stretch side', ['1', '-1'] as const, () => (S.side === 1 ? '1' : '-1'), (v) => {
  S.side = v === '1' ? 1 : -1;
  moveT0 = simT;
});
buttons('expression', EXPRS, () => S.expr, (v) => {
  S.expr = v;
  applyStatic();
});
slider('eye sparkle', 'sparkle', 0, 1, applyStatic);
slider('teeth shine', 'shine', 0, 1, applyStatic);
buttons('teeth', ['clean', 'sticky', 'speck', 'sticky+speck'] as const, () => (S.sticky && S.speck ? 'sticky+speck' : S.sticky ? 'sticky' : S.speck ? 'speck' : 'clean'), (v) => {
  S.sticky = v === 'sticky' || v === 'sticky+speck';
  S.speck = v === 'speck' || v === 'sticky+speck';
  applyStatic();
});
buttons('blink (invulnerable)', ['off', 'on'] as const, () => (S.blink ? 'on' : 'off'), (v) => {
  S.blink = v === 'on';
  if (!S.blink) for (const s of slots) s.a.setBlink(true);
});

// ------------------------------------------------------------------ loop
resize();
rebuild();
let simT = 0;
function step(dt: number): void {
  simT += dt;
  for (const s of slots) {
    const m = motionAt(simT, dt, s);
    s.a.update(m);
    s.a.root.rotation.y = S.spin ? simT * S.spin : 0;
    if (S.blink) s.a.setBlink(Math.floor(simT * 10) % 2 === 0);
  }
  if (S.act !== 'idle' && S.act !== 'menu') {
    groundTex.offset.y += (S.speed * dt) / (220 / 40);
  }
}
function render(): void {
  placeCamera();
  if (controls.enabled) controls.update();
  renderer.render(scene, camera);
  const per = slots.map((s) => ({ id: `${s.a.character}/${s.a.ride}`, ...avatarStats(s.a) }));
  w.__stats = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, perAvatar: per };
  info.textContent = `calls ${renderer.info.render.calls}  tris ${renderer.info.render.triangles}\n` + per.map((p) => `${p.id}: ${p.meshes} meshes, ${p.triangles} tris`).join('\n');
}
if (S.freezeT !== null) {
  const dt = 1 / 60;
  const n = Math.round(S.freezeT / dt);
  for (let i = 0; i < n; i++) step(dt);
  render();
  requestAnimationFrame(() => {
    render();
    w.__ready = true;
  });
} else {
  let last = performance.now();
  const loop = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    step(dt);
    render();
    w.__ready = true;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

(window as unknown as { __tallest: () => string }).__tallest = () => {
  const out: [string, number][] = [];
  const box = new THREE.Box3();
  for (const s of slots) {
    s.a.root.updateMatrixWorld(true);
    s.a.root.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh && !(o as THREE.Sprite).isSprite) return;
      box.makeEmpty();
      box.expandByObject(o, true);
      out.push([`${o.type} parent=${o.parent?.name} vis=${o.visible}`, box.max.y]);
    });
  }
  return out.sort((a, b) => b[1] - a[1]).slice(0, 6).map(([n, y]) => `${n}: ${y.toFixed(3)}`).join('\n');
};

/**
 * Stretch clip check: for every kid x ride x move, simulate ~7 s (incl. ease in) and record the worst
 * hand/elbow-in-head, hand-in-torso, arm-vs-arm, body-below-floor and body-vs-ride intrusions (metres; > 0 = clip).
 */
(window as unknown as { __clip: (chars?: CharacterId[], rides?: RideId[]) => string[] }).__clip = (chars = [...CHARACTERS], rides = [...RIDES]) => {
  const out: string[] = [];
  const HEAD: Record<CharacterId, { c: THREE.Vector3; r: THREE.Vector3 }> = {
    ace: { c: new THREE.Vector3(0, 0.27, 0), r: new THREE.Vector3(0.272, 0.272, 0.262) },
    ciela: { c: new THREE.Vector3(0, 0.254, 0.01), r: new THREE.Vector3(0.292, 0.279, 0.274) },
  };
  const tmp = new THREE.Vector3();
  const segDist = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3): number => {
    let m = 9;
    for (let i = 0; i <= 8; i++) {
      const p = a.clone().lerp(b, i / 8);
      for (let j = 0; j <= 8; j++) m = Math.min(m, p.distanceTo(c.clone().lerp(d, j / 8)));
    }
    return m;
  };
  for (const c of chars) {
    for (const r of rides) {
      for (const mv of [...WARMUP_MOVES, ...COOLDOWN_MOVES]) {
        for (const side of [1, -1] as const) {
          const a = createAvatar(c, r);
          scene.add(a.root);
          const H = HEAD[c];
          const worst = { head: -1, torso: -1, arms: -1, floor: -1, ride: -1, fringe: 1 };
          // settle in menu idle, then stretch
          for (let f = 0; f < 7.5 * 30; f++) {
            const tt = f / 30;
            const st = tt > 0.5 ? { move: mv, t: tt - 0.5, side } : null;
            a.update({ time: tt, dt: 1 / 30, speed: 0, lateral: 0, airborne: false, vy: 0, jumpT: -1, sliding: false, slideT: -1, landT: 999, bumpT: 999, boost: 0, sleepy: 0, wobble: 0, mood: 1, flex: 0, celebrate: 0, menu: true, stretch: st });
            if (tt < 1.3) continue; // judge after the ease-in
            a.root.updateMatrixWorld(true);
            const R = debugRig(a);
            // hands + elbows vs head (+ hair), sphere radius ~0.05
            for (const p of [...R.hand, ...R.elbow]) {
              tmp.copy(p);
              R.head.worldToLocal(tmp);
              tmp.sub(H.c);
              const k = Math.sqrt((tmp.x / (H.r.x + 0.045)) ** 2 + (tmp.y / (H.r.y + 0.045)) ** 2 + (tmp.z / (H.r.z + 0.045)) ** 2);
              worst.head = Math.max(worst.head, (1 - k) * 0.3);
            }
            // hands vs torso (rounded-box distance in spine space; hand sphere r 0.045)
            for (const p of R.hand) {
              tmp.copy(p);
              R.spine.worldToLocal(tmp);
              const rr = 0.075;
              const qx = Math.abs(tmp.x) - (0.168 - rr);
              const qy = Math.abs(tmp.y - 0.135) - (0.155 - rr);
              const qz = Math.abs(tmp.z) - (0.12 - rr);
              const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - rr;
              worst.torso = Math.max(worst.torso, 0.045 - outside);
            }
            // arms vs each other (forearm / upper arm capsules ~0.05 radius)
            const dArm = Math.min(
              segDist(R.shoulder[0], R.elbow[0], R.elbow[1], R.hand[1]),
              segDist(R.elbow[0], R.hand[0], R.shoulder[1], R.elbow[1]),
              segDist(R.elbow[0], R.hand[0], R.elbow[1], R.hand[1]),
            );
            worst.arms = Math.max(worst.arms, 0.095 - dArm);
            // floor: soles + pelvis bottom (root at y = 0 is the podium top)
            for (const p of R.ankle) worst.floor = Math.max(worst.floor, -(p.y - 0.083));
            worst.floor = Math.max(worst.floor, -(R.pelvis.y - 0.05));
            // ride: nearest ride vertex to each body joint sphere (every 5th frame, vertex-precise)
            if (r !== 'shoes' && f % 5 === 0) {
              const verts: number[] = [];
              R.ride.traverse((o) => {
                const me = o as THREE.Mesh;
                if (!me.isMesh) return;
                const pa = me.geometry.getAttribute('position');
                for (let k = 0; k < pa.count; k += 2) {
                  tmp.fromBufferAttribute(pa, k).applyMatrix4(me.matrixWorld);
                  verts.push(tmp.x, tmp.y, tmp.z);
                }
              });
              const pts: [THREE.Vector3, number][] = [...R.hand.map((p) => [p, 0.05] as [THREE.Vector3, number]), ...R.elbow.map((p) => [p, 0.05] as [THREE.Vector3, number]), ...R.knee.map((p) => [p, 0.055] as [THREE.Vector3, number]), ...R.ankle.map((p) => [p, 0.07] as [THREE.Vector3, number]), ...R.hip.map((p) => [p, 0.07] as [THREE.Vector3, number]), [R.pelvis, 0.13]];
              for (const [p, rad] of pts) {
                let md = 99;
                for (let k = 0; k < verts.length; k += 3) {
                  const dx = verts[k] - p.x, dy = verts[k + 1] - p.y, dz = verts[k + 2] - p.z;
                  const d2 = dx * dx + dy * dy + dz * dz;
                  if (d2 < md) md = d2;
                }
                worst.ride = Math.max(worst.ride, rad - Math.sqrt(md));
              }
            }
            const fc = debugFaceClearance(a).clearance;
            if (fc !== null) worst.fringe = Math.min(worst.fringe, fc);
          }
          a.dispose();
          const flags = Object.entries(worst).filter(([k, v]) => (k === 'fringe' ? v < 0.005 : v > 0.002)).map(([k, v]) => `${k}=${(v * 1000).toFixed(0)}mm`);
          if (flags.length) out.push(`${c}/${r}/${mv}/${side}: ${flags.join(' ')}`);
        }
      }
    }
  }
  out.push(`checked ${chars.length * rides.length * 18 * 2} runs`);
  return out;
};
