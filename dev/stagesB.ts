// STAGES-B dev harness: fake runner camera flying along the track, decor streaming, obstacle samples,
// authored patterns, collision-envelope checker, draw-call readout.
// URL params: stage=sports|jungle|parks  at=<m>  view=game|wide|high|side|top  mode=kinds|patterns|none
//             run=1|0  speed=14  boxes=1  warm=<s>  freeze=1  clean=1  lane=-1|0|1
import * as THREE from 'three';
import type { StageModule, ObstacleKind, ObstacleVisual, StagePattern, StageSection } from '../src/contracts';
import { laneX, PLATFORM_TOP, HIGH_CLEARANCE } from '../src/contracts';
import { rng, disposeTree, geo, mat, PAL } from '../src/kit/kit';
import { sectionAt } from '../src/stages/helpersB';

const q = new URLSearchParams(location.search);
const stageId = (q.get('stage') ?? 'sports') as 'sports' | 'jungle' | 'parks';
const at = Number(q.get('at') ?? 0);
const view = q.get('view') ?? 'game';
const mode = q.get('mode') ?? 'kinds';
const running = q.get('run') === '1';
const speed = Number(q.get('speed') ?? 14);
const showBoxes = q.get('boxes') === '1';
const warm = Number(q.get('warm') ?? 2.5);
const freeze = q.get('freeze') === '1';
const runnerLane = Number(q.get('lane') ?? 0);
if (q.get('clean') === '1') document.body.classList.add('clean');

// ------------------------------------------------------------------ UI
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const selStage = $<HTMLSelectElement>('stage');
const selSection = $<HTMLSelectElement>('section');
const selView = $<HTMLSelectElement>('view');
const selMode = $<HTMLSelectElement>('mode');
const chkRun = $<HTMLInputElement>('run');
const chkBoxes = $<HTMLInputElement>('boxes');
selStage.value = stageId;
selView.value = view;
selMode.value = mode;
chkRun.checked = running;
chkBoxes.checked = showBoxes;
const go = (patch: Record<string, string>) => {
  const p = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(patch)) p.set(k, v);
  location.search = p.toString();
};
selStage.onchange = () => go({ stage: selStage.value, at: '0' });
selView.onchange = () => go({ view: selView.value });
selMode.onchange = () => go({ mode: selMode.value });
chkRun.onchange = () => go({ run: chkRun.checked ? '1' : '0' });
chkBoxes.onchange = () => go({ boxes: chkBoxes.checked ? '1' : '0' });
selSection.onchange = () => go({ at: selSection.value });

// ------------------------------------------------------------------ three
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 400);
const fitCamera = () => {
  const a = window.innerWidth / window.innerHeight;
  camera.aspect = a;
  camera.fov = a < 0.8 ? 70 : 60;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
};
fitCamera();
window.addEventListener('resize', fitCamera);

// dynamic import so a stage that is mid-edit never breaks the others
const stage: StageModule =
  stageId === 'sports'
    ? (await import('../src/stages/sports')).createSportsStage()
    : stageId === 'jungle'
      ? (await import('../src/stages/jungle')).createJungleStage()
      : (await import('../src/stages/parks')).createParksStage();
stage.build({ scene, renderer, camera, quality: 'high' });

// ------------------------------------------------------------------ authored pattern rule checks
const patternIssues: string[] = [];
function checkPatterns(): void {
  const blocking = (k: ObstacleKind) => k === 'block' || k === 'platform' || k === 'moverBlock';
  for (const pat of stage.patterns ?? []) {
    const lanesOf = (it: StagePattern['items'][number]): number[] => {
      const span = it.laneSpan ?? 1;
      if (span === 3) return [-1, 0, 1];
      if (span === 2) return [it.lane, it.lane + 1];
      return [it.lane];
    };
    // ramps must lead straight onto a platform in the same lane
    for (const it of pat.items) {
      if (it.kind !== 'ramp') continue;
      const rl = it.length ?? DEF_LEN.ramp;
      const ok = pat.items.some((p2) => p2.kind === 'platform' && p2.lane === it.lane && Math.abs(it.dz + rl / 2 - (p2.dz - (p2.length ?? DEF_LEN.platform) / 2)) < 0.01);
      if (!ok) patternIssues.push(`${pat.id}: ramp@${it.dz} not followed by platform`);
    }
    // group rows by dz, every row must leave a way through
    const rows = new Map<number, typeof pat.items>();
    for (const it of pat.items) {
      if (it.kind === 'platform') continue;
      // a ramp's action starts at its front edge
      const key = it.kind === 'ramp' ? it.dz - (it.length ?? DEF_LEN.ramp) / 2 : it.dz;
      const arr = rows.get(key) ?? [];
      arr.push(it);
      rows.set(key, arr);
    }
    const keys = [...rows.keys()].sort((x, y) => x - y);
    for (const k of keys) {
      const its = rows.get(k)!;
      const occ = new Map<number, ObstacleKind>();
      for (const it of its) for (const l of lanesOf(it)) occ.set(l, it.kind);
      const free = [-1, 0, 1].some((l) => !occ.has(l) || !blocking(occ.get(l)!));
      const movers = its.some((it) => it.kind === 'moverBlock');
      if (!free && !movers) patternIssues.push(`${pat.id}: row@${k} fully blocked`);
    }
    for (let i = 1; i < keys.length; i++) {
      const a0 = rows.get(keys[i - 1])!.map((x) => x.kind).sort().join();
      const a1 = rows.get(keys[i])!.map((x) => x.kind).sort().join();
      if (a0 !== a1 && keys[i] - keys[i - 1] < 9) patternIssues.push(`${pat.id}: rows ${keys[i - 1]}->${keys[i]} only ${keys[i] - keys[i - 1]}m apart`);
    }
    const end = Math.max(...pat.items.map((it) => it.dz + (it.length ?? DEF_LEN[it.kind]) / 2));
    if (end > pat.length + 0.6) patternIssues.push(`${pat.id}: items reach ${end.toFixed(1)} > length ${pat.length}`);
  }
}

// section selector (first cycle only)
const seen = new Set<string>();
for (const s of stage.sections) {
  if (s.start > stage.length + 1 && seen.size > 0 && seen.has(s.id)) continue;
  const o = document.createElement('option');
  o.value = String(s.start + 25);
  o.textContent = `${s.label} (${s.start})`;
  selSection.appendChild(o);
  seen.add(s.id);
}
selSection.value = String(sectionAt(stage.sections, at).start + 25);

// ------------------------------------------------------------------ fake runner
const runner = new THREE.Group();
{
  const body = new THREE.Mesh(geo.capsule(0.28, 0.6), mat(PAL.coral));
  body.position.y = 0.75;
  const head = new THREE.Mesh(geo.sphere(0.26), mat(0xf3c9a5));
  head.position.y = 1.35;
  const hair = new THREE.Mesh(geo.sphere(0.27), mat(0x2b2118));
  hair.position.set(0, 1.42, 0.04);
  hair.scale.set(1, 0.8, 1);
  runner.add(body, head, hair);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(geo.capsule(0.1, 0.35), mat(0x3d4a66));
    leg.position.set(s * 0.13, 0.28, 0);
    runner.add(leg);
  }
}
scene.add(runner);

// ------------------------------------------------------------------ decor streaming
const CHUNK = 40;
const chunks = new Map<number, THREE.Object3D>();
const decorViolations: string[] = [];
const _v = new THREE.Vector3();
function checkDecor(o: THREE.Object3D, k: number): void {
  o.updateMatrixWorld(true);
  let bad = 0;
  let worst = '';
  o.traverse((c) => {
    const me = c as THREE.Mesh;
    if (!me.isMesh || (me as THREE.InstancedMesh).isInstancedMesh) return;
    const pos = me.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(me.matrixWorld);
      if (Math.abs(_v.x) < 3.4 && _v.y > 0.05 && _v.y < 6.5) {
        bad++;
        if (!worst) worst = `${me.name || 'mesh'} @(${_v.x.toFixed(2)},${_v.y.toFixed(2)},${_v.z.toFixed(1)})`;
      }
    }
  });
  if (bad) decorViolations.push(`chunk ${k}: ${bad} verts on lanes, e.g. ${worst}`);
}
function streamDecor(d: number): void {
  const k0 = Math.floor((d - 30) / CHUNK);
  const k1 = Math.floor((d + 135) / CHUNK);
  for (const [k, o] of chunks) {
    if (k < k0 || k > k1) {
      o.removeFromParent();
      disposeTree(o);
      chunks.delete(k);
    }
  }
  for (let k = Math.max(0, k0); k <= k1; k++) {
    if (chunks.has(k)) continue;
    const d0 = k * CHUNK;
    const sec = sectionAt(stage.sections, d0);
    const o = stage.buildDecor({ d0, d1: d0 + CHUNK, section: sec, rng: rng(1000 + k * 7919) });
    scene.add(o);
    chunks.set(k, o);
    checkDecor(o, k);
  }
}

// ------------------------------------------------------------------ obstacles
interface Placed {
  d: number;
  x: number;
  kind: ObstacleKind;
  span: number;
  length: number;
  height: number;
  dir: 1 | -1;
  vis: ObstacleVisual;
  box?: THREE.Object3D;
  phase: number;
}
const placed: Placed[] = [];
const obsViolations: string[] = [];
const DEF_LEN: Record<ObstacleKind, number> = { low: 1.2, high: 1.2, block: 2, platform: 16, ramp: 9, moverBlock: 2, moverLow: 1.2 };
const DEF_H: Record<ObstacleKind, number> = { low: 0.8, high: 2.4, block: 2.8, platform: PLATFORM_TOP, ramp: PLATFORM_TOP, moverBlock: 2, moverLow: 0.6 };
let obsSeed = 1;

function envelopeBox(kind: ObstacleKind, w: number, len: number, h: number): THREE.Object3D {
  const lo = kind === 'high' ? HIGH_CLEARANCE : 0;
  const hi = kind === 'high' ? Math.max(2.2, h) : h;
  const g = new THREE.BoxGeometry(w, hi - lo, len);
  const e = new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: 0xff00aa }));
  e.position.y = (hi + lo) / 2;
  return e;
}

function checkVisual(p: Placed, label: string): void {
  // sample animation at a few times, collect extents in obstacle-local space
  const o = p.vis.object;
  const inv = new THREE.Matrix4();
  const hw = (p.span * 2.2) / 2;
  const hl = p.length / 2;
  let maxY = -1e9, maxX = 0, issues = 0;
  let first = '';
  for (const t of [0, 0.37, 0.81, 1.3, 2.05, 2.9, 3.7]) {
    p.vis.update?.(t, 0.016, 10);
    o.updateMatrixWorld(true);
    inv.copy(o.matrixWorld).invert();
    o.traverse((c) => {
      const me = c as THREE.Mesh;
      if (!me.isMesh || me.renderOrder === 1 || !me.visible) return;
      const pos = me.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        _v.fromBufferAttribute(pos, i).applyMatrix4(me.matrixWorld).applyMatrix4(inv);
        const inX = Math.abs(_v.x) < hw - 0.03;
        const inZ = Math.abs(_v.z) <= hl + 0.05;
        if (Math.abs(_v.x) <= hw + 0.05 && inZ) maxY = Math.max(maxY, _v.y);
        maxX = Math.max(maxX, Math.abs(_v.x));
        let bad = '';
        if ((p.kind === 'low' && _v.y > p.height + 0.01) || (p.kind === 'moverLow' && _v.y > Math.min(0.8, p.height) + 0.01)) bad = 'too tall';
        if (p.kind === 'high' && inX && inZ && _v.y > 0.05 && _v.y < HIGH_CLEARANCE - 0.01) bad = 'below clearance';
        if (p.kind === 'block' && _v.y > 3.25) bad = 'block > 3.2';
        if (p.kind === 'platform' && inX && inZ && _v.y > PLATFORM_TOP + 0.03) bad = 'above platform top';
        if (p.kind === 'ramp' && inX && inZ) {
          const slope = (PLATFORM_TOP * (hl - _v.z)) / p.length;
          if (_v.y > slope + 0.08) bad = 'above ramp surface';
        }
        if (bad) {
          issues++;
          if (!first) first = `${bad} (${_v.x.toFixed(2)},${_v.y.toFixed(2)},${_v.z.toFixed(2)}) ${me.name}`;
        }
      }
    });
  }
  const w = p.span * 2.2;
  if (p.kind === 'block' && maxY < 2.35) obsViolations.push(`${label}: block only ${maxY.toFixed(2)} tall`);
  if (p.kind === 'high' && maxY < 2.15) obsViolations.push(`${label}: high body top ${maxY.toFixed(2)} < 2.2`);
  if (p.kind === 'moverBlock' && maxY < 1.6) obsViolations.push(`${label}: moverBlock ${maxY.toFixed(2)} < 1.6`);
  if (p.kind === 'platform' && maxY < PLATFORM_TOP - 0.05) obsViolations.push(`${label}: platform top ${maxY.toFixed(2)}`);
  if ((p.kind === 'low' || p.kind === 'block' || p.kind === 'moverLow' || p.kind === 'moverBlock') && maxX > w / 2 + 0.35)
    obsViolations.push(`${label}: wider than lanes (${(maxX * 2).toFixed(2)} > ${w.toFixed(2)})`);
  if (issues) obsViolations.push(`${label}: ${issues} verts ${first}`);
}

function place(d: number, lane: number, kind: ObstacleKind, span = 1, length?: number, height?: number, dir: 1 | -1 = 1): void {
  const sec = sectionAt(stage.sections, d);
  const len = length ?? DEF_LEN[kind];
  const h = height ?? DEF_H[kind];
  const vis = stage.makeObstacle({ kind, laneSpan: span, length: len, height: h, dir, section: sec.id, season: sec.season, rng: rng(obsSeed++ * 131) });
  const x = span === 2 ? laneX(lane) + 1.1 : laneX(lane);
  const p: Placed = { d, x, kind, span, length: len, height: h, dir, vis, phase: obsSeed * 0.7 };
  vis.object.position.set(x, 0, -d);
  scene.add(vis.object);
  checkVisual(p, `${sec.id}/${kind}x${span}@${d.toFixed(0)}`);
  vis.object.position.set(x, 0, -d);
  if (showBoxes) {
    p.box = envelopeBox(kind, span * 2.2, len, h);
    p.box.position.x = x;
    p.box.position.z = -d;
    p.box.position.y += 0;
    scene.add(p.box);
  }
  placed.push(p);
}

function sampleKinds(d0: number): number {
  // a readable showcase of every obstacle kind
  place(d0 + 14, -1, 'low');
  place(d0 + 14, 0, 'high');
  place(d0 + 14, 1, 'block');
  place(d0 + 30, 0, 'moverLow', 1, 1.2, 0.6, 1);
  place(d0 + 42, 0, 'moverBlock', 1, 2, 2, -1);
  place(d0 + 58, 1, 'ramp', 1, 9, PLATFORM_TOP);
  place(d0 + 58 + 4.5 + 8, 1, 'platform', 1, 16, PLATFORM_TOP);
  place(d0 + 60, -1, 'low', 2, 1.2, 0.8);
  place(d0 + 80, 0, 'high', 3, 1.2, 2.4);
  place(d0 + 96, -1, 'block', 1, 2, 2.8);
  place(d0 + 96, 0, 'low', 1, 1.2, 0.8);
  return d0 + 110;
}

function layPatterns(d0: number, sec: StageSection, maxLen = 400): number {
  const pats: StagePattern[] = (stage.patterns ?? []).filter((p) => !p.section || p.section === sec.id);
  let d = d0 + 14;
  for (const pat of pats) {
    for (const it of pat.items) place(d + it.dz, it.lane, it.kind, it.laneSpan ?? 1, it.length, it.height, it.dir ?? 1);
    d += pat.length + 10;
    if (d - d0 > maxLen) break;
  }
  return d;
}

checkPatterns();
let nextLineup = at;
function ensureObstacles(d: number): void {
  if (mode === 'none') return;
  while (nextLineup < d + 150) {
    const sec = sectionAt(stage.sections, nextLineup + 14);
    if (mode === 'movers') {
      place(nextLineup + 9, 0, 'moverBlock', 1, 2, 2, 1);
      place(nextLineup + 15, 0, 'moverLow', 1, 1.2, 0.7, -1);
      place(nextLineup + 21, 0, 'moverBlock', 1, 2, 2, -1);
      nextLineup += 400;
      continue;
    }
    nextLineup = mode === 'patterns' ? layPatterns(nextLineup, sec, 260) : sampleKinds(nextLineup);
  }
  for (let i = placed.length - 1; i >= 0; i--) {
    const p = placed[i];
    if (p.d < d - 20) {
      p.vis.object.removeFromParent();
      p.vis.dispose?.();
      disposeTree(p.vis.object);
      p.box?.removeFromParent();
      placed.splice(i, 1);
    }
  }
}

// ------------------------------------------------------------------ loop
let playerD = running ? Math.max(0, at - speed * warm) : at;
let time = 0;
const playerPos = new THREE.Vector3();
const look = new THREE.Vector3();
function step(dt: number): void {
  time += dt;
  if (running) playerD += speed * dt;
  playerPos.set(laneX(runnerLane), 0, -playerD);
  runner.position.copy(playerPos);
  runner.children[0].position.y = 0.75 + Math.abs(Math.sin(time * 9)) * 0.06;
  streamDecor(playerD);
  ensureObstacles(playerD);
  for (const p of placed) {
    if (p.kind === 'moverBlock' || p.kind === 'moverLow') {
      const sp = p.kind === 'moverBlock' ? 1.1 : 1.8;
      const span = 7.4;
      const u = (((time * sp + p.phase) % span) + span) % span;
      p.vis.object.position.x = -p.dir * 3.7 + p.dir * u;
      if (p.box) p.box.position.x = p.vis.object.position.x;
    }
    p.vis.update?.(time, dt, p.d - playerD);
  }
  stage.update(time, dt, playerD, playerPos);
  // camera
  const r = playerPos;
  switch (view) {
    case 'wide':
      camera.position.set(r.x + 15, 13, r.z + 14);
      look.set(r.x, 0, r.z - 26);
      break;
    case 'high':
      camera.position.set(r.x, 9, r.z + 12);
      look.set(r.x, 0, r.z - 22);
      break;
    case 'side':
      camera.position.set(r.x + 19, 4.5, r.z - 22);
      look.set(r.x, 1.2, r.z - 22);
      break;
    case 'close':
      camera.position.set(r.x + 3.2, 2.0, r.z + 1);
      look.set(r.x, 1.0, r.z - 12);
      break;
    case 'top':
      camera.position.set(r.x, 70, r.z - 30);
      look.set(r.x, 0, r.z - 30.01);
      break;
    default:
      camera.position.set(r.x * 0.6, 3.4, r.z + 6.5);
      look.set(r.x * 0.8, 1.1, r.z - 7);
  }
  camera.lookAt(look);
}

for (let t = 0; t < warm; t += 1 / 30) step(1 / 30);

const hud = $<HTMLDivElement>('hud');
let last = performance.now();
let fps = 60;
let frames = 0;
const info = { patternIssues, patterns: (stage.patterns ?? []).length, calls: 0, triangles: 0, geometries: 0, textures: 0, d: 0, section: '', fps: 0, decorViolations, obsViolations, frames: 0 };
(window as unknown as { __harness: unknown }).__harness = { ready: false, info };
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!freeze) step(dt);
  renderer.render(scene, camera);
  frames++;
  fps = fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
  const ri = renderer.info;
  Object.assign(info, {
    calls: ri.render.calls,
    triangles: ri.render.triangles,
    geometries: ri.memory.geometries,
    textures: ri.memory.textures,
    d: Math.round(playerD),
    section: sectionAt(stage.sections, playerD).label,
    fps: Math.round(fps),
    frames,
  });
  if (frames % 10 === 0)
    hud.textContent = `${stage.name} · ${info.section} · d=${info.d}m · amb=${stage.ambienceAt(playerD)}\ncalls ${info.calls} · tris ${info.triangles} · geos ${info.geometries} · fps ${info.fps}\ndecor issues ${decorViolations.length} · obstacle issues ${obsViolations.length}${obsViolations.length ? '\n' + obsViolations.slice(0, 6).join('\n') : ''}${decorViolations.length ? '\n' + decorViolations.slice(0, 3).join('\n') : ''}`;
  if (frames === 4) (window as unknown as { __harness: { ready: boolean } }).__harness.ready = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
