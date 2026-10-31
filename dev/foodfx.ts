// Food + FX dev harness. Views (?v=): gallery | play | sheet | fx
import * as THREE from 'three';
import { FOODS } from '../src/content/foods';
import { createFoodModel, foodModelStats } from '../src/food/models';
import { renderFoodThumbnails } from '../src/food/thumbnails';
import { benefitIconSVG, junkIconSVG } from '../src/food/icons';
import type { BenefitId, JunkEffectId } from '../src/contracts';
import { LANE_WIDTH } from '../src/contracts';
import { PAL } from '../src/kit/kit';

const P = new URLSearchParams(location.search);
const view = P.get('v') ?? 'gallery';
if (P.has('clean')) document.body.classList.add('clean');

const ui = document.getElementById('ui')!;
const info = document.getElementById('info')!;
for (const v of ['gallery', 'play', 'sheet', 'fx']) {
  const a = document.createElement('a');
  a.href = `?v=${v}`;
  a.textContent = v;
  if (v === view) a.className = 'on';
  ui.append(a);
}

declare global {
  interface Window {
    __ready?: boolean;
    __fx?: unknown;
  }
}

function makeRenderer(): THREE.WebGLRenderer {
  const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  r.setPixelRatio(Math.min(2, devicePixelRatio));
  r.setSize(innerWidth, innerHeight);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.05;
  document.getElementById('stage')!.append(r.domElement);
  return r;
}

function lights(scene: THREE.Scene): void {
  scene.background = new THREE.Color(PAL.sky);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x88aa77, 1.6));
  const sun = new THREE.DirectionalLight(0xfff1dd, 1.6);
  sun.position.set(4, 10, 6);
  scene.add(sun);
}

function gallery(): void {
  const renderer = makeRenderer();
  const scene = new THREE.Scene();
  lights(scene);
  const cols = Number(P.get('cols') ?? 9);
  const ids = (P.get('ids')?.split(',') ?? FOODS.map((f) => f.id));
  const models: THREE.Object3D[] = [];
  const gap = 0.95;
  const rows = Math.ceil(ids.length / cols);
  ids.forEach((id, i) => {
    const m = createFoodModel(id);
    m.position.set((i % cols - (cols - 1) / 2) * gap, -(Math.floor(i / cols) - (rows - 1) / 2) * gap, 0);
    scene.add(m);
    models.push(m);
  });
  const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 100);
  const elev = Number(P.get('elev') ?? 0.35);
  const dist = Math.max(cols * gap / (2 * Math.tan((15 * Math.PI) / 180) * camera.aspect), rows * gap / (2 * Math.tan((15 * Math.PI) / 180))) * 1.12;
  camera.position.set(0, Math.sin(elev) * dist, Math.cos(elev) * dist);
  camera.lookAt(0, 0, 0);
  const rot = Number(P.get('rot') ?? 0);
  const spin = P.get('spin') !== '0';
  let tris = 0;
  let dc = 0;
  for (const id of ids) {
    const s = foodModelStats(id);
    tris += s.triangles;
    dc += s.drawCalls;
  }
  info.textContent = `${ids.length} models  draw calls ${dc}  tris ${tris}`;
  const t0 = performance.now();
  const loop = () => {
    const t = (performance.now() - t0) / 1000;
    models.forEach((m, i) => (m.rotation.y = rot + (spin ? t * 0.8 + i * 0.2 : 0)));
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  };
  loop();
  setTimeout(() => (window.__ready = true), 400);
}

function play(): void {
  const renderer = makeRenderer();
  const scene = new THREE.Scene();
  lights(scene);
  scene.fog = new THREE.Fog(PAL.sky, 40, 110);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(14, 400), new THREE.MeshStandardMaterial({ color: 0xe9dcc0, roughness: 0.9 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = -180;
  scene.add(ground);
  for (const x of [-1.5, -0.5, 0.5, 1.5]) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 400), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    line.rotation.x = -Math.PI / 2;
    line.position.set(x * LANE_WIDTH, 0.01, -180);
    scene.add(line);
  }
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(200, 400), new THREE.MeshStandardMaterial({ color: PAL.grass }));
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(0, -0.01, -180);
  scene.add(grass);
  const start = Number(P.get('start') ?? 0);
  const ids = FOODS.map((f) => f.id).slice(start, start + 12);
  const models: THREE.Object3D[] = [];
  ids.forEach((id, i) => {
    const m = createFoodModel(id);
    m.position.set(((i % 3) - 1) * LANE_WIDTH, 0.9, -8 - Math.floor(i / 3) * Number(P.get('step') ?? 6) - (i % 3) * 1.2);
    scene.add(m);
    models.push(m);
  });
  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 400);
  camera.position.set(0, 3.4, 6.5);
  camera.lookAt(0, 1.1, -7);
  const t0 = performance.now();
  const loop = () => {
    const t = (performance.now() - t0) / 1000;
    models.forEach((m, i) => {
      m.rotation.y = t * 1.6 + i;
      m.position.y = 0.9 + Math.sin(t * 2.5 + i) * 0.08;
    });
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  };
  loop();
  info.textContent = ids.join(', ');
  setTimeout(() => (window.__ready = true), 400);
}

async function sheet(): Promise<void> {
  const el = document.getElementById('sheet')!;
  el.style.display = 'block';
  const t = await renderFoodThumbnails(Number(P.get('size') ?? 192));
  const h = (s: string) => {
    const e = document.createElement('h2');
    e.textContent = s;
    el.append(e);
  };
  h('Thumbnails');
  const g = document.createElement('div');
  g.className = 'grid';
  for (const f of FOODS) {
    const c = document.createElement('div');
    c.className = 'cell' + (P.has('dark') ? ' dark' : '');
    const img = document.createElement('img');
    img.src = t[f.id] ?? '';
    c.append(img, f.name);
    g.append(c);
  }
  el.append(g);
  h('Benefit + junk pictures');
  const g2 = document.createElement('div');
  g2.className = 'grid';
  const bs: BenefitId[] = ['vision', 'muscles', 'bones', 'shield', 'energy', 'refresh', 'grow', 'tummy'];
  const js: JunkEffectId[] = ['sugar', 'teeth', 'freeze', 'slow', 'tummy'];
  for (const [svg, label] of [...bs.map((b) => [benefitIconSVG(b), b]), ...js.map((j) => [junkIconSVG(j), 'junk ' + j])]) {
    const c = document.createElement('div');
    c.className = 'cell';
    const d = document.createElement('div');
    d.className = 'ic';
    d.innerHTML = svg;
    c.append(d, label);
    g2.append(c);
  }
  el.append(g2);
  window.__ready = true;
}

if (view === 'gallery') gallery();
else if (view === 'play') play();
else if (view === 'sheet') void sheet();
else void runFx(P, ui, info);

// ---------------------------------------------------------------- FX stage
import type { AnchorName, Avatar, AvatarMotion, Expression, PowerState, TeethState, EffectsSystem } from '../src/contracts';
import { createEffects } from '../src/fx/Effects';
import { FOOD_BY_ID } from '../src/content/foods';
import { geo, mat } from '../src/kit/kit';

/** Simple stand-in avatar implementing the Avatar contract (capsule body, head, anchors). */
function stubAvatar(): Avatar & { exprLabel: string } {
  const root = new THREE.Group();
  const skin = mat(0xc98f5a);
  const shirt = mat(PAL.teal);
  const shorts = mat(PAL.blue);
  const body = new THREE.Mesh(geo.capsule(0.24, 0.32, 10), shirt);
  body.position.y = 0.82;
  const hips = new THREE.Mesh(geo.capsule(0.22, 0.08, 10), shorts);
  hips.position.y = 0.55;
  const head = new THREE.Group();
  head.position.y = 1.28;
  const skull = new THREE.Mesh(geo.sphere(0.25, 20, 16), skin);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.26, 20, 12, 0, Math.PI * 2, 0, 1.4), mat(0x2b2420));
  hair.position.set(0, 0.03, 0.02);
  const eyeL = new THREE.Mesh(geo.sphere(0.035, 10, 8), mat(PAL.ink));
  const eyeR = eyeL.clone();
  eyeL.position.set(-0.09, 0.03, -0.225);
  eyeR.position.set(0.09, 0.03, -0.225);
  const spark = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const sL = new THREE.Mesh(geo.sphere(0.013, 6, 4), spark);
  sL.position.set(0.012, 0.012, -0.03);
  eyeL.add(sL);
  eyeR.add(sL.clone());
  const mouth = new THREE.Mesh(geo.torus(0.06, 0.014, 6, 16, Math.PI), mat(0x8a3a3a));
  mouth.position.set(0, -0.09, -0.225);
  mouth.rotation.z = Math.PI;
  const teeth = new THREE.Mesh(geo.rbox(0.09, 0.03, 0.02, 0.01), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0 }));
  teeth.position.set(0, -0.11, -0.235);
  head.add(skull, hair, eyeL, eyeR, mouth, teeth);
  const limb = (x: number, y: number, m: THREE.Material, r: number, len: number) => {
    const piv = new THREE.Group();
    piv.position.set(x, y, 0);
    const me = new THREE.Mesh(geo.capsule(r, len, 8), m);
    me.position.y = -len / 2 - r;
    piv.add(me);
    root.add(piv);
    return piv;
  };
  const armL = limb(-0.32, 1.02, skin, 0.07, 0.34);
  const armR = limb(0.32, 1.02, skin, 0.07, 0.34);
  const legL = limb(-0.11, 0.5, skin, 0.08, 0.32);
  const legR = limb(0.11, 0.5, skin, 0.08, 0.32);
  root.add(body, hips, head);
  const anchors = new Map<AnchorName, THREE.Object3D>();
  const put = (n: AnchorName, parent: THREE.Object3D, x: number, y: number, z: number) => {
    const o = new THREE.Object3D();
    o.position.set(x, y, z);
    parent.add(o);
    anchors.set(n, o);
  };
  put('head', head, 0, 0, 0);
  put('aboveHead', head, 0, 0.36, 0);
  put('eyeL', head, -0.09, 0.03, -0.24);
  put('eyeR', head, 0.09, 0.03, -0.24);
  put('mouth', head, 0, -0.1, -0.24);
  put('chest', root, 0, 0.95, -0.15);
  put('tummy', root, 0, 0.7, -0.2);
  put('back', root, 0, 0.9, 0.2);
  put('armL', armL, 0, -0.2, 0);
  put('armR', armR, 0, -0.2, 0);
  put('handL', armL, 0, -0.45, 0);
  put('handR', armR, 0, -0.45, 0);
  put('legL', legL, 0, -0.2, 0);
  put('legR', legR, 0, -0.2, 0);
  put('feet', root, 0, 0.03, 0);
  const shadow = new THREE.Mesh(geo.circle(0.45, 20), new THREE.MeshBasicMaterial({ color: 0x223040, transparent: true, opacity: 0.25, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.01;
  root.add(shadow);
  let exprUntil = 0;
  let now = 0;
  const av = {
    root,
    character: 'ace' as const,
    ride: 'shoes' as const,
    height: 1.55,
    exprLabel: 'happy',
    update(m: AvatarMotion) {
      now = m.time;
      const run = m.speed > 0 ? Math.sin(m.time * 11) : 0;
      legL.rotation.x = run * 0.7;
      legR.rotation.x = -run * 0.7;
      const flex = m.flex;
      armL.rotation.x = -run * 0.8 * (1 - flex);
      armR.rotation.x = run * 0.8 * (1 - flex);
      armL.rotation.z = -flex * 2.3;
      armR.rotation.z = flex * 2.3;
      root.position.y = Math.abs(run) * 0.05;
      head.rotation.z = m.wobble * Math.sin(m.time * 6) * 0.15;
      head.rotation.x = m.sleepy * 0.25;
      if (now > exprUntil) av.exprLabel = 'happy';
      mouth.scale.set(av.exprLabel === 'wow' || av.exprLabel === 'brr' ? 0.6 : 1, av.exprLabel === 'droopy' || av.exprLabel === 'tummy' || av.exprLabel === 'sleepy' ? -0.6 : 1, 1);
    },
    setExpression(e: Expression, hold = 0.8) {
      av.exprLabel = e;
      exprUntil = now + hold;
    },
    anchor(n: AnchorName) {
      return anchors.get(n)!;
    },
    setTeeth(t: TeethState) {
      const tm = teeth.material as THREE.MeshStandardMaterial;
      tm.color.setHex(t.sticky ? 0xc98f5a : 0xffffff);
      tm.emissiveIntensity = t.shine * 0.8;
    },
    setEyeSparkle(v: number) {
      const s = 1 + v * 1.8;
      eyeL.children[0].scale.setScalar(s);
      eyeR.children[0].scale.setScalar(s);
    },
    setBlink(v: boolean) {
      root.visible = v;
    },
    dispose() {},
  };
  return av;
}

const POWER_MAX = { vision: 8, muscles: 7, bones: 8, shield: 12, energy: 4, magnet: 8, refresh: 1.5, happyTummy: 3 };
function freshPower(): PowerState {
  return {
    vision: 0, muscles: 0, bones: 0, shield: 0, energy: 0, magnet: 0, refresh: 0, happyTummy: 0,
    sugarRush: 0, slump: 0, teeth: 0, freeze: 0, slow: 0, tummyAche: 0,
    junkLoad: 0, glow: 0, glowLevel: 0, happyAndHealthy: false,
  };
}

async function runFx(P: URLSearchParams, ui: HTMLElement, info: HTMLElement): Promise<void> {
  const renderer = makeRenderer();
  const canvas = renderer.domElement;
  canvas.style.transition = 'filter 0.4s ease';
  const overlay = document.createElement('div');
  Object.assign(overlay.style, { position: 'absolute', inset: '0', pointerEvents: 'none', overflow: 'hidden' });
  document.getElementById('stage')!.append(overlay);
  const scene = new THREE.Scene();
  lights(scene);
  scene.fog = new THREE.Fog(PAL.sky, 30, 110);
  const track = new THREE.Group();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 4000), new THREE.MeshStandardMaterial({ color: 0xe9dcc0, roughness: 0.9 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = -1900;
  track.add(ground);
  for (const x of [-1.5, -0.5, 0.5, 1.5]) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 4000), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    line.rotation.x = -Math.PI / 2;
    line.position.set(x * LANE_WIDTH, 0.01, -1900);
    track.add(line);
  }
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(300, 4000), new THREE.MeshStandardMaterial({ color: PAL.grass }));
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(0, -0.01, -1900);
  track.add(grass);
  // a few trees for motion reference
  for (let i = 0; i < 160; i++) {
    const t = new THREE.Mesh(geo.sphere(1.2, 10, 8), mat(PAL.leaf));
    t.position.set((i % 2 ? 1 : -1) * (6 + (i % 5)), 1.6, -i * 12);
    track.add(t);
  }
  scene.add(track);
  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 400);

  let avatar: Avatar = stubAvatar();
  const realMods = import.meta.glob('../src/avatar/index.ts');
  const realKey = Object.keys(realMods)[0];
  if (realKey && P.get('avatar') !== 'stub') {
    try {
      const mod = (await realMods[realKey]()) as { createAvatar?: (c: string, r: string) => Avatar };
      if (mod.createAvatar) avatar = mod.createAvatar(P.get('char') ?? 'ace', P.get('ride') ?? 'shoes');
    } catch (err) {
      console.warn('real avatar failed, using stub', err);
    }
  }
  scene.add(avatar.root);
  const lane = Number(P.get('lane') ?? 0);
  avatar.root.position.x = lane * LANE_WIDTH;

  const fx: EffectsSystem = createEffects({ scene, camera, renderer, canvas, overlay, reducedMotion: P.has('reduced') });
  fx.setAvatar(avatar);
  const power = freshPower();
  let pendingSlump = 0;
  let speed = Number(P.get('speed') ?? 10);
  let view = P.get('cam') ?? 'play';
  let dist = 0;
  let t = 0;
  let flexT = 9;
  let bumpT = 999;
  let frozen = false;

  const updateGlow = () => {
    const lvl = Math.min(5, Math.floor(power.glow * 5 + 1e-6));
    if (lvl > power.glowLevel) {
      power.glowLevel = lvl;
      const full = power.glow >= 0.999;
      if (full) power.happyAndHealthy = true;
      fx.onGlowLevel(lvl, full);
    } else power.glowLevel = lvl;
  };
  const clearJunk = (which: string) => {
    let any = false;
    const z = (k: keyof PowerState) => {
      if ((power[k] as number) > 0) any = true;
      (power[k] as number) = 0;
    };
    if (which === 'all') { z('sugarRush'); z('slump'); z('teeth'); z('freeze'); z('slow'); z('tummyAche'); pendingSlump = 0; }
    else if (which === 'teeth') z('teeth');
    else if (which === 'tummy') { z('tummyAche'); z('slow'); }
    else if (which === 'tired') { z('slump'); z('slow'); }
    return any;
  };
  const eat = (id: string) => {
    const def = FOOD_BY_ID[id];
    if (!def) return;
    if (def.kind === 'healthy') {
      let bounced = false;
      power.junkLoad = Math.max(0, power.junkLoad - 0.03);
      switch (def.benefit) {
        case 'vision': power.vision = POWER_MAX.vision; break;
        case 'muscles': power.muscles = POWER_MAX.muscles; flexT = 0; break;
        case 'bones': power.bones = POWER_MAX.bones; bounced = clearJunk('teeth'); break;
        case 'shield': power.shield = POWER_MAX.shield; break;
        case 'energy': power.energy = POWER_MAX.energy; bounced = clearJunk('tired'); break;
        case 'refresh': power.refresh = POWER_MAX.refresh; power.junkLoad = Math.max(0, power.junkLoad - 0.15); bounced = clearJunk('all'); break;
        case 'grow': power.magnet = POWER_MAX.magnet; break;
        case 'tummy': power.happyTummy = POWER_MAX.happyTummy; power.junkLoad = Math.max(0, power.junkLoad - 0.06); bounced = clearJunk('tummy'); break;
      }
      fx.onHealthy(def, power);
      if (bounced) fx.onBounceBack();
      if (!power.happyAndHealthy) {
        power.glow = Math.min(1 - power.junkLoad * 0.5, power.glow + 0.05);
        updateGlow();
      }
    } else {
      const m = 1 + power.junkLoad;
      switch (def.junk) {
        case 'sugar': power.sugarRush = 2.5; pendingSlump = 4 * m; break;
        case 'teeth': power.teeth = 6 * m; break;
        case 'freeze': power.freeze = 1.6; pendingSlump = Math.max(pendingSlump, 2.5 * m); power.sugarRush = Math.max(power.sugarRush, 0.6); break;
        case 'slow': power.slow = 5 * m; break;
        case 'tummy': power.tummyAche = 5 * m; break;
      }
      power.junkLoad = Math.min(1, power.junkLoad + 0.22);
      if (!power.happyAndHealthy) {
        power.glow = Math.max(0, Math.min(power.glow - 0.12, 1 - power.junkLoad * 0.5));
        power.glowLevel = Math.min(5, Math.floor(power.glow * 5 + 1e-6));
      }
      fx.onJunk(def, power);
    }
  };
  const event = (name: string) => {
    if (name === 'block') { power.shield = 0; fx.onShieldBlock(); }
    else if (name === 'bonk') fx.onBonk();
    else if (name === 'bump') { bumpT = 0; fx.onBump(); }
    else if (name === 'bounce') { clearJunk('all'); fx.onBounceBack(); }
    else if (name.startsWith('glow')) {
      const lvl = Number(name.slice(4));
      power.glow = lvl / 5;
      power.glowLevel = lvl;
      power.happyAndHealthy = lvl >= 5;
      fx.onGlowLevel(lvl, lvl >= 5);
    } else if (name === 'reset') {
      Object.assign(power, freshPower());
      pendingSlump = 0;
      fx.reset();
    }
  };
  const set = (k: string, v: number | boolean) => ((power as unknown as Record<string, number | boolean>)[k] = v);

  // UI
  const btn = (label: string, fn: () => void, cls = '') => {
    const b = document.createElement('button');
    b.textContent = label;
    b.className = cls;
    b.onclick = fn;
    ui.append(b);
  };
  for (const f of FOODS) btn(f.id, () => eat(f.id), f.kind === 'junk' ? 'junk' : '');
  for (const e of ['block', 'bonk', 'bump', 'bounce', 'glow1', 'glow3', 'glow5', 'reset']) btn(e, () => event(e));
  btn('cam', () => (view = view === 'play' ? 'front' : 'play'));
  btn('speed', () => (speed = speed ? 0 : 10));
  const lab = document.createElement('label');
  lab.textContent = 'junk ';
  const sl = document.createElement('input');
  sl.type = 'range';
  sl.min = '0';
  sl.max = '1';
  sl.step = '0.05';
  sl.value = '0';
  sl.oninput = () => (power.junkLoad = Number(sl.value));
  lab.append(sl);
  ui.append(lab);

  window.__fx = {
    eat, event, set, power,
    cam: (v: string) => (view = v),
    speed: (v: number) => (speed = v),
    freeze: (v: boolean) => (frozen = v),
    step: (sec: number) => { for (let i = 0; i < Math.round(sec * 60); i++) frame(1 / 60); },
  };

  const motion: AvatarMotion = {
    time: 0, dt: 0, speed: 0, lateral: 0, airborne: false, vy: 0, jumpT: -1, sliding: false, slideT: -1, landT: 999, bumpT: 999,
    boost: 0, sleepy: 0, wobble: 0, mood: 0, flex: 0, celebrate: 0, menu: false,
  };
  const dec = (k: keyof PowerState, dt: number) => ((power[k] as number) = Math.max(0, (power[k] as number) - dt));
  const frame = (dt: number) => {
    t += dt;
    dist += speed * (power.energy > 0 ? 1.3 : power.slow > 0 ? 0.8 : 1) * dt;
    for (const k of ['vision', 'muscles', 'bones', 'shield', 'energy', 'magnet', 'refresh', 'happyTummy', 'slump', 'teeth', 'freeze', 'slow', 'tummyAche'] as const) dec(k, dt);
    if (power.sugarRush > 0) {
      dec('sugarRush', dt);
      if (power.sugarRush <= 0 && pendingSlump > 0) { power.slump = pendingSlump; pendingSlump = 0; }
    }
    flexT += dt;
    bumpT += dt;
    avatar.root.position.z = -dist;
    motion.time = t;
    motion.dt = dt;
    motion.speed = speed;
    motion.flex = flexT < 1.2 ? Math.sin(Math.min(1, flexT / 1.2) * Math.PI) : 0;
    motion.sleepy = power.slump > 0 ? 1 : 0;
    motion.wobble = power.tummyAche > 0 || power.slump > 0 ? 1 : 0;
    motion.boost = power.energy > 0 ? 1 : 0;
    motion.bumpT = bumpT;
    avatar.update(motion);
    const ax = avatar.root.position.x;
    if (view === 'play') {
      camera.position.set(ax * 0.7, 3.4, -dist + 6.5);
      camera.lookAt(ax * 0.8, 1.1, -dist - 7);
    } else if (view === 'front') {
      camera.position.set(ax + 0.9, 1.45, -dist - 3.3);
      camera.lookAt(ax, 1.0, -dist);
    } else if (view === 'close') {
      camera.position.set(ax + 0.4, 2.3, -dist + 3.4);
      camera.lookAt(ax, 1.1, -dist - 0.5);
    } else {
      camera.position.set(ax + 4.2, 2.2, -dist + 1.5);
      camera.lookAt(ax, 1.0, -dist);
    }
    fx.update(dt, t, power);
    renderer.render(scene, camera);
    const pw = Object.entries(power).filter(([, v]) => typeof v === 'number' && v > 0).map(([k, v]) => `${k}:${(v as number).toFixed(1)}`).join(' ');
    info.textContent = `calls ${renderer.info.render.calls} tris ${renderer.info.render.triangles}  ${(avatar as { exprLabel?: string }).exprLabel ?? ''}\n${pw}`;
  };
  let last = performance.now();
  const loop = () => {
    const nowMs = performance.now();
    const dt = Math.min(0.05, (nowMs - last) / 1000);
    last = nowMs;
    if (!frozen) frame(dt);
    requestAnimationFrame(loop);
  };
  loop();
  window.__ready = true;
}
