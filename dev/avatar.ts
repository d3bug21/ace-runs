// Avatar harness: all 8 character x ride combos, every motion state, expression and teeth
// state, preset cameras (incl. the gameplay camera) and perf / slide-height checks.
// URL params (for scripted screenshots): char=ace|moana|both ride=shoes|bike|scooter|skate|all
// grid=1 view=game|front|threeq|back|side|face|low|orbit act=run|idle|menu|lanes|leanL|leanR|jump|slide|land|bump
// speed boost sleepy wobble mood flex celebrate sparkle shine sticky=1 speck=1 expr=<Expression>
// t=<seconds> (simulate then freeze) spin=<rad/s> clean=1
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Avatar, AvatarMotion, CharacterId, Expression, RideId } from '../src/contracts';
import { CHARACTERS, RIDES } from '../src/contracts';
import { createAvatar } from '../src/avatar';
import { blobShadow, canvasTexture } from '../src/kit/kit';

type View = 'game' | 'front' | 'threeq' | 'near' | 'back' | 'side' | 'face' | 'low' | 'orbit';
type Act = 'run' | 'idle' | 'menu' | 'lanes' | 'leanL' | 'leanR' | 'jump' | 'slide' | 'land' | 'bump';
const VIEWS: View[] = ['game', 'front', 'threeq', 'near', 'back', 'side', 'face', 'low', 'orbit'];
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
};
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
buttons('character', ['ace', 'moana', 'both'] as const, () => S.char, (v) => {
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
