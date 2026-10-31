// Dev harness for STAGES-A (indoor playground, indoor arcade, outdoor playground).
// URL params:
//   stage=indoor|arcade|outdoor   view=game|wide|top|side|front   d=<start metres>   speed=<m/s, default 14>
//   run=0 (freeze)   t=<seconds to simulate before freeze>   guides=1 (collision envelopes)   clean=1 (hide UI)
//   lane=-1|0|1 (runner lane)   fov=<deg>   course=kinds|patterns   tm=aces|none   q=low|high
import * as THREE from 'three';
import { LANE_WIDTH, laneX, type ObstacleKind, type ObstacleVisual, type StageModule, type StagePattern, type PatternItem } from '../src/contracts';
import { createIndoorStage } from '../src/stages/indoor';
import { createArcadeStage } from '../src/stages/arcade';
import { createOutdoorStage } from '../src/stages/outdoor';
import { Batch, checkPattern } from '../src/stages/helpersA';
const decorStatsMap: Map<string, number> | null = new URLSearchParams(location.search).get('stats') === '1' ? new Map() : null;
import { rng, mat, geo, disposeTree } from '../src/kit/kit';

const P = new URLSearchParams(location.search);
const stageId = (P.get('stage') ?? 'indoor') as 'indoor' | 'arcade' | 'outdoor';
const view = P.get('view') ?? 'game';
const speed = Number(P.get('speed') ?? 14);
let running = P.get('run') !== '0';
const startD = Number(P.get('d') ?? 0);
const simT = Number(P.get('t') ?? 0);
const guides = P.get('guides') === '1';
const runnerLane = Number(P.get('lane') ?? 0);
const courseMode = P.get('course') ?? 'all';
if (P.get('clean') === '1') document.body.classList.add('clean');

const factories: Record<string, () => StageModule> = { indoor: createIndoorStage, arcade: createArcadeStage, outdoor: createOutdoorStage };

// ---------------------------------------------------------------- renderer / scene
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = P.get('tm') === 'aces' ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const portrait = innerHeight > innerWidth;
const camera = new THREE.PerspectiveCamera(Number(P.get('fov') ?? (portrait ? 66 : 60)), innerWidth / innerHeight, 0.1, 600);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

const stage = factories[stageId]();
stage.build({ scene, renderer, camera, quality: (P.get('q') as 'low' | 'high') ?? 'high' });

// ---------------------------------------------------------------- runner stand-in (1.5 m kid for scale)
const runner = new THREE.Group();
{
  const body = new THREE.Mesh(geo.capsule(0.24, 0.55), mat(0x5a8dee));
  body.position.y = 0.75;
  const head = new THREE.Mesh(geo.sphere(0.22), mat(0xc68a5c));
  head.position.y = 1.3;
  const hair = new THREE.Mesh(geo.sphere(0.23, 16, 8), mat(0x2b2420));
  hair.position.set(0, 1.36, 0.03);
  hair.scale.set(1, 0.8, 1);
  const legL = new THREE.Mesh(geo.capsule(0.08, 0.35), mat(0x2b3440));
  legL.position.set(-0.1, 0.25, 0);
  const legR = legL.clone();
  legR.position.x = 0.1;
  runner.add(body, head, hair, legL, legR);
  runner.position.x = laneX(runnerLane);
  scene.add(runner);
}

// ---------------------------------------------------------------- decor streaming
const STRETCH = 40;
const decor = new Map<number, THREE.Object3D>();
const noDecor = P.get('nodecor') === '1';
function streamDecor(d: number): void {
  if (noDecor) return;
  const first = Math.max(0, Math.floor((d - 30) / STRETCH));
  const last = Math.floor((d + 130) / STRETCH);
  for (let i = first; i <= last; i++) {
    if (decor.has(i)) continue;
    const d0 = i * STRETCH;
    const sec = [...stage.sections].reverse().find((s) => s.start <= d0) ?? stage.sections[0];
    Batch.stats = decorStatsMap;
    const o = stage.buildDecor({ d0, d1: d0 + STRETCH, section: sec, rng: rng(1000 + i * 7919) });
    Batch.stats = null;
    scene.add(o);
    decor.set(i, o);
  }
  for (const [i, o] of decor) {
    if (i < first) {
      scene.remove(o);
      disposeTree(o);
      decor.delete(i);
    }
  }
}

// ---------------------------------------------------------------- course: obstacle kinds showcase + authored patterns
interface Placed {
  d: number;
  item: PatternItem;
  vis?: ObstacleVisual;
  guide?: THREE.Object3D;
  phase: number;
}
const DEF_LEN: Record<ObstacleKind, number> = { low: 1.2, high: 1.0, block: 1.6, platform: 16, ramp: 8, moverBlock: 1.6, moverLow: 1.0 };
const DEF_H: Record<ObstacleKind, number> = { low: 0.8, high: 2.4, block: 2.8, platform: 2.0, ramp: 2.0, moverBlock: 1.8, moverLow: 0.7 };
const course: Placed[] = [];
const showcase: PatternItem[] = [
  { dz: 0, lane: 0, kind: 'low', laneSpan: 3 },
  { dz: 12, lane: 0, kind: 'high', laneSpan: 3 },
  { dz: 24, lane: -1, kind: 'block', laneSpan: 1 },
  { dz: 24, lane: 1, kind: 'moverBlock', dir: -1 },
  { dz: 36, lane: 0, kind: 'moverLow', dir: 1 },
  { dz: 48, lane: 0, kind: 'ramp', length: 8 },
  { dz: 64, lane: 0, kind: 'platform', length: 24 },
  { dz: 62, lane: -1, kind: 'block', laneSpan: 1, height: 3.0 },
  { dz: 62, lane: 1, kind: 'low', laneSpan: 1 },
  { dz: 86, lane: -1, kind: 'low', laneSpan: 2, height: 0.6 },
  { dz: 86, lane: 1, kind: 'block' },
  { dz: 98, lane: 0, kind: 'high', laneSpan: 2 },
  { dz: 98, lane: -1, kind: 'high', laneSpan: 1, height: 2.6 },
  { dz: 110, lane: 0, kind: 'block', laneSpan: 2, height: 2.6 },
  { dz: 122, lane: -1, kind: 'moverLow', dir: -1 },
  { dz: 122, lane: 1, kind: 'moverBlock', dir: 1 },
];
let cursor = 22;
if (courseMode !== 'patterns') {
  for (const it of showcase) course.push({ d: cursor + it.dz, item: it, phase: Math.random() * 6 });
  cursor += 140;
}
const pats: StagePattern[] = stage.patterns ?? [];
const patternProblems = pats.flatMap(checkPattern);
if (courseMode !== 'kinds') {
  for (let rep = 0; rep < 3; rep++)
    for (const p of pats) {
      for (const it of p.items) course.push({ d: cursor + it.dz, item: it, phase: Math.random() * 6 });
      cursor += p.length + 14;
    }
}
const patternStarts: { id: string; d: number }[] = [];
{
  let c = courseMode !== 'patterns' ? 162 : 22;
  for (const p of pats) {
    patternStarts.push({ id: p.id, d: c });
    c += p.length + 14;
  }
}

function placeX(it: PatternItem): number {
  const span = it.laneSpan ?? 1;
  return laneX(it.lane) + (span === 2 ? LANE_WIDTH / 2 : 0);
}

function makeGuide(it: PatternItem): THREE.Object3D {
  const span = it.laneSpan ?? 1;
  const w = span * LANE_WIDTH;
  const len = it.length ?? DEF_LEN[it.kind];
  const h = it.height ?? DEF_H[it.kind];
  let y0 = 0,
    y1 = h;
  if (it.kind === 'high') {
    y0 = 1.05;
  }
  if (it.kind === 'moverBlock' || it.kind === 'moverLow') {
    /* one lane */
  }
  const ww = it.kind === 'moverBlock' || it.kind === 'moverLow' ? LANE_WIDTH : w;
  const box = new THREE.Box3(new THREE.Vector3(-ww / 2, y0, -len / 2), new THREE.Vector3(ww / 2, y1, len / 2));
  const color = { low: 0x00ff66, high: 0xff3366, block: 0xffaa00, platform: 0x33aaff, ramp: 0x33ffff, moverBlock: 0xff00ff, moverLow: 0xffff00 }[it.kind];
  return new THREE.Box3Helper(box, color);
}

// ---------------------------------------------------------------- automated envelope checks
interface CheckResult {
  id: string;
  kind: ObstacleKind;
  span: number;
  ok: boolean;
  msg: string;
  minY: number;
  maxY: number;
  minX: number;
  maxX: number;
}
const checks: CheckResult[] = [];
const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _im = new THREE.Matrix4();
function envelopeCheck(vis: ObstacleVisual, it: PatternItem, label: string): CheckResult {
  const span = it.laneSpan ?? 1;
  const w = span * LANE_WIDTH;
  const len = it.length ?? DEF_LEN[it.kind];
  const h = it.height ?? DEF_H[it.kind];
  const o = vis.object;
  const probs: string[] = [];
  let minY = Infinity,
    maxY = -Infinity,
    minX = Infinity,
    maxX = -Infinity;
  const inv = new THREE.Matrix4();
  for (const tt of [0, 0.37, 0.8, 1.3, 1.9, 2.6, 3.3, 4.1]) {
    vis.update?.(tt, 0.016, 10);
    o.updateMatrixWorld(true);
    inv.copy(o.matrixWorld).invert();
    o.traverse((c) => {
      const me = c as THREE.Mesh;
      if (!me.isMesh || !me.visible) return;
      let vis2 = true;
      for (let p: THREE.Object3D | null = me; p && p !== o; p = p.parent) if (!p.visible) vis2 = false;
      if (!vis2) return;
      const mtl = me.material as THREE.Material;
      if ((mtl as THREE.MeshBasicMaterial).blending === THREE.AdditiveBlending) return; // glow halos
      if (me.userData.noCollide) return;
      const pos = me.geometry.getAttribute('position');
      const inst = (me as THREE.InstancedMesh).isInstancedMesh ? (me as THREE.InstancedMesh) : null;
      const n = inst ? inst.count : 1;
      for (let k = 0; k < n; k++) {
        _m.multiplyMatrices(inv, me.matrixWorld);
        if (inst) {
          inst.getMatrixAt(k, _im);
          _m.multiply(_im);
        }
        for (let i = 0; i < pos.count; i++) {
          _v.fromBufferAttribute(pos, i).applyMatrix4(_m);
          minY = Math.min(minY, _v.y);
          maxY = Math.max(maxY, _v.y);
          minX = Math.min(minX, _v.x);
          maxX = Math.max(maxX, _v.x);
          const inside = Math.abs(_v.x) < w / 2 - 0.03 && Math.abs(_v.z) < len / 2 + 0.6;
          if (it.kind === 'low' && inside && _v.y > h + 0.01) probs.push(`low top ${_v.y.toFixed(2)} > ${h}`);
          if (it.kind === 'high' && inside && _v.y < 1.05 - 0.005 && _v.y > 0.02) probs.push(`high part at y=${_v.y.toFixed(2)} x=${_v.x.toFixed(2)}`);
          if (it.kind === 'moverLow' && _v.y > 0.8 + 0.01) probs.push(`moverLow top ${_v.y.toFixed(2)}`);
          if (it.kind === 'platform' && Math.abs(_v.x) < w / 2 - 0.15 && Math.abs(_v.z) < len / 2 - 0.15 && _v.y > 2.02) probs.push(`platform top ${_v.y.toFixed(2)}`);
          if (it.kind === 'ramp' && Math.abs(_v.x) < w / 2 - 0.2) {
            const slope = (0.5 - _v.z / len) * 2.0; // 0 at +len/2, 2 at -len/2
            if (_v.y > Math.min(2.0, Math.max(0, slope)) + 0.06) probs.push(`ramp above slope y=${_v.y.toFixed(2)} z=${_v.z.toFixed(2)}`);
          }
        }
      }
    });
  }
  if (it.kind === 'block' && (maxY < 2.4 - 0.01 || maxY > 3.25)) probs.push(`block height ${maxY.toFixed(2)}`);
  if (it.kind === 'high' && maxY < 2.2) probs.push(`high top ${maxY.toFixed(2)} < 2.2`);
  if (it.kind === 'moverBlock' && maxY < 1.6) probs.push(`moverBlock height ${maxY.toFixed(2)}`);
  if (it.kind === 'moverBlock' && maxX - minX > LANE_WIDTH + 0.05) probs.push(`moverBlock width ${(maxX - minX).toFixed(2)}`);
  if (it.kind === 'platform' && Math.abs(maxY - 2.0) > 0.25) probs.push(`platform max ${maxY.toFixed(2)}`);
  const uniq = [...new Set(probs)].slice(0, 4);
  return { id: label, kind: it.kind, span, ok: uniq.length === 0, msg: uniq.join('; '), minY, maxY, minX, maxX };
}

// run checks over every kind x span x a few seeds, plus all pattern items
{
  const kinds: ObstacleKind[] = ['low', 'high', 'block', 'platform', 'ramp', 'moverBlock', 'moverLow'];
  for (const kind of kinds)
    for (const span of kind.startsWith('mover') ? [1] : [1, 2, 3])
      for (let s = 0; s < 6; s++) {
        const it: PatternItem = { dz: 0, lane: 0, kind, laneSpan: span as 1 | 2 | 3, dir: s % 2 ? 1 : -1, height: kind === 'low' ? [0.5, 0.7, 0.9][s % 3] : kind === 'block' ? [2.4, 2.8, 3.2][s % 3] : kind === 'high' ? [2.2, 2.5, 2.9][s % 3] : undefined, length: kind === 'platform' ? [8, 16, 24][s % 3] : kind === 'ramp' ? [6, 8, 10][s % 3] : undefined };
        const vis = stage.makeObstacle({
          kind,
          laneSpan: span,
          length: it.length ?? DEF_LEN[kind],
          height: it.height ?? DEF_H[kind],
          dir: it.dir,
          section: stage.sections[0].id,
          rng: rng(77 + s * 13 + span),
        });
        checks.push(envelopeCheck(vis, it, `${kind}/${span}/s${s}`));
      }
}

// ---------------------------------------------------------------- obstacle streaming
const obstGroup = new THREE.Group();
scene.add(obstGroup);
function streamObstacles(d: number, t: number, dt: number): void {
  for (const p of course) {
    const ahead = p.d - d;
    if (!p.vis && ahead < 140 && ahead > -25) {
      const it = p.item;
      const kind = it.kind;
      p.vis = stage.makeObstacle({
        kind,
        laneSpan: it.laneSpan ?? 1,
        length: it.length ?? DEF_LEN[kind],
        height: it.height ?? DEF_H[kind],
        dir: it.dir,
        section: stage.sections[0].id,
        rng: rng(Math.floor(p.d * 31 + it.lane * 7)),
      });
      p.vis.object.position.set(placeX(it), 0, -p.d);
      obstGroup.add(p.vis.object);
      if (guides) {
        p.guide = makeGuide(it);
        p.guide.position.copy(p.vis.object.position);
        obstGroup.add(p.guide);
      }
    }
    if (p.vis && (ahead < -25 || ahead > 160)) {
      obstGroup.remove(p.vis.object);
      if (p.guide) obstGroup.remove(p.guide);
      p.vis.dispose?.();
      disposeTree(p.vis.object);
      p.vis = undefined;
    }
    if (p.vis) {
      const it = p.item;
      if (it.kind === 'moverBlock' || it.kind === 'moverLow') {
        const dir = it.dir ?? 1;
        // walk across lanes as the runner approaches (ping-pong across the track)
        const span = 7.2;
        const u = ((t * 1.6 + p.phase) % (span * 2)) / span;
        const x = (u < 1 ? u : 2 - u) * span - span / 2;
        const xx = u < 1 ? x : x; // keep direction consistent for display: reset at the edges
        p.vis.object.position.x = dir > 0 ? xx : -xx;
        if (u >= 1) p.vis.object.position.x = dir > 0 ? -span / 2 + (u - 1) * span : span / 2 - (u - 1) * span;
        if (p.guide) p.guide.position.x = p.vis.object.position.x;
      }
      p.vis.update?.(t, dt, ahead);
    }
  }
}

/** Surface height under the runner (ramps and platforms in its lane). */
function groundAt(d: number, lane: number): number {
  let y = 0;
  for (const p of course) {
    const it = p.item;
    if (it.kind !== 'ramp' && it.kind !== 'platform') continue;
    const span = it.laneSpan ?? 1;
    const lo = it.lane,
      hi = it.lane + span - 1 - (span === 3 ? 2 : 0);
    const lanes = span === 3 ? [-1, 0, 1] : span === 2 ? [lo, lo + 1] : [lo];
    void hi;
    if (!lanes.includes(lane)) continue;
    const len = it.length ?? DEF_LEN[it.kind];
    const u = (d - (p.d - len / 2)) / len;
    if (u < 0 || u > 1) continue;
    y = Math.max(y, it.kind === 'platform' ? 2 : 2 * u);
  }
  return y;
}

// ---------------------------------------------------------------- camera
function placeCamera(d: number): void {
  const rz = -d;
  const rx = runner.position.x;
  switch (view) {
    case 'wide':
      camera.position.set(rx + 13, 11, rz + 16);
      camera.lookAt(rx, 0, rz - 28);
      break;
    case 'top':
      camera.position.set(0, 46, rz - 30);
      camera.lookAt(0, 0, rz - 31);
      break;
    case 'side':
      camera.position.set(-15, 3.2, rz - 18);
      camera.lookAt(0, 1.2, rz - 18);
      break;
    case 'front':
      camera.position.set(rx, 2.2, rz - 34);
      camera.lookAt(rx, 1.2, rz);
      break;
    case 'low':
      camera.position.set(rx + 1.2, 1.4, rz + 3);
      camera.lookAt(rx, 1.5, rz - 12);
      break;
    default: {
      const ry = runner.position.y * 0.8;
      camera.position.set(rx, 3.4 + ry, rz + 6.5);
      camera.lookAt(rx, 1.1 + ry, rz - 7);
    }
  }
}

// ---------------------------------------------------------------- UI
const ui = document.getElementById('ui')!;
const info = document.getElementById('info')!;
function link(label: string, key: string, val: string): void {
  const a = document.createElement('a');
  const q = new URLSearchParams(location.search);
  q.set(key, val);
  a.href = `?${q}`;
  a.textContent = label;
  if ((P.get(key) ?? (key === 'stage' ? 'indoor' : key === 'view' ? 'game' : '')) === val) a.className = 'on';
  ui.appendChild(a);
}
for (const s of ['indoor', 'arcade', 'outdoor']) link(s, 'stage', s);
for (const v of ['game', 'wide', 'top', 'side', 'front', 'low']) link(v, 'view', v);
link('guides', 'guides', guides ? '0' : '1');
for (const ps of patternStarts) link(ps.id, 'd', String(Math.max(0, ps.d - 8)));
const btn = document.createElement('button');
btn.textContent = 'pause/run';
btn.onclick = () => (running = !running);
ui.appendChild(btn);

// ---------------------------------------------------------------- loop
let dist = startD;
let time = 0;
const playerPos = new THREE.Vector3();
function step(dt: number): void {
  time += dt;
  if (running) dist += speed * dt;
  runner.position.z = -dist;
  runner.children[3].rotation.x = Math.sin(time * 12) * 0.6;
  runner.children[4].rotation.x = -Math.sin(time * 12) * 0.6;
  runner.position.y = groundAt(dist, runnerLane) + Math.abs(Math.sin(time * 12)) * 0.05;
  playerPos.copy(runner.position);
  streamDecor(dist);
  streamObstacles(dist, time, dt);
  stage.update(time, dt, dist, playerPos);
  placeCamera(dist);
}
// optional pre-simulation for deterministic screenshots
{
  const n = Math.round(simT / (1 / 60));
  for (let i = 0; i < n; i++) step(1 / 60);
  step(1 / 60);
}
let last = performance.now();
let fps = 60;
const failing = checks.filter((c) => !c.ok);
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  fps = fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
  step(dt);
  renderer.render(scene, camera);
  const r = renderer.info.render;
  info.textContent = `${stageId} d=${dist.toFixed(0)} calls=${r.calls} tris=${(r.triangles / 1000).toFixed(0)}k fps=${fps.toFixed(0)} geos=${renderer.info.memory.geometries} tex=${renderer.info.memory.textures}\nenvelope checks: ${checks.length - failing.length}/${checks.length} ok${failing.length ? ' FAIL: ' + failing.slice(0, 3).map((f) => `${f.id}: ${f.msg}`).join(' | ') : ''}${patternProblems.length ? '\npattern problems: ' + patternProblems.join(' | ') : ''}`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

(window as unknown as Record<string, unknown>).__harness = {
  ready: true,
  batchStats: () => (decorStatsMap ? [...decorStatsMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15) : []),
  decorStats: () =>
    [...decor.values()].map((o) => {
      let tris = 0,
        meshes = 0;
      o.traverse((c) => {
        const m = c as THREE.Mesh;
        if (!m.isMesh) return;
        meshes++;
        const g = m.geometry;
        tris += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
      });
      return { name: o.name, tris, meshes };
    }),
  info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries, tex: renderer.info.memory.textures, dist, fps }),
  checks,
  failing,
  patternProblems,
  patternStarts,
  patterns: pats.map((p) => p.id),
};
