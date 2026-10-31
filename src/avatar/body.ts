// Builds a character rig: bone groups (each with one merged vertex-coloured mesh), hair,
// face and the dynamic little extras (hair spring, bicep bumps).
import * as THREE from 'three';
import { bodyMaterial, Parts, U, type V3 } from './build';
import { Face } from './face';
import { DIM, type CharSpec } from './spec';

export interface Rig {
  rideRoot: THREE.Group;
  hips: THREE.Group;
  spine: THREE.Group;
  head: THREE.Group;
  thigh: [THREE.Group, THREE.Group];
  shin: [THREE.Group, THREE.Group];
  foot: [THREE.Group, THREE.Group];
  shoulder: [THREE.Group, THREE.Group];
  elbow: [THREE.Group, THREE.Group];
  hand: [THREE.Object3D, THREE.Object3D];
  hair: THREE.Group; // spring pivot (Moana's puff / Ace's cap tuft)
  bicep: [THREE.Mesh, THREE.Mesh];
  face: Face;
  /** Head-bone-space height of the very top (cap button / puff). */
  headTop: number;
  meshes: THREE.Object3D[];
}

const mk = (name: string, order: THREE.EulerOrder = 'YXZ'): THREE.Group => {
  const g = new THREE.Group();
  g.name = name;
  g.rotation.order = order;
  return g;
};

const M = new THREE.Matrix4();
const M2 = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const E = new THREE.Euler();
const P = new THREE.Vector3();
const S = new THREE.Vector3();

/** Add a part inside a local frame matrix. */
function addIn(parts: Parts, frame: THREE.Matrix4, g: THREE.BufferGeometry, color: number, pos: V3, scale: number | V3 = 1, rot: V3 = [0, 0, 0], shade = 0): void {
  P.set(pos[0], pos[1], pos[2]);
  E.set(rot[0], rot[1], rot[2]);
  Q.setFromEuler(E);
  if (typeof scale === 'number') S.setScalar(scale);
  else S.set(scale[0], scale[1], scale[2]);
  M2.compose(P, Q, S);
  M.multiplyMatrices(frame, M2);
  parts.addMatrix(g, color, M, shade);
}

export function buildRig(spec: CharSpec, seed: number): Rig {
  const meshes: THREE.Object3D[] = [];
  const add = (parent: THREE.Object3D, parts: Parts): THREE.Mesh => {
    const m = parts.mesh(bodyMaterial());
    parent.add(m);
    meshes.push(m);
    return m;
  };
  const ace = spec.id === 'ace';
  const rideRoot = mk('rideRoot');
  const hips = mk('hips');
  hips.position.y = DIM.hipH;
  rideRoot.add(hips);

  // ------------------------------------------------------------------ pelvis
  const pelvis = new Parts().add(U.rbox(0.3), spec.bottom, [0, 0.035, 0.005], [0.3, 0.17, 0.22], [0, 0, 0], 0.12);
  if (!ace) pelvis.add(U.rbox(0.3), spec.bottom, [0, -0.02, 0.0], [0.26, 0.1, 0.2], [0, 0, 0], 0.1);
  add(hips, pelvis);

  // ------------------------------------------------------------------ legs
  const thigh: Rig['thigh'] = [mk('thighL'), mk('thighR')];
  const shin: Rig['shin'] = [mk('shinL'), mk('shinR')];
  const foot: Rig['foot'] = [mk('footL'), mk('footR')];
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? -1 : 1;
    const th = thigh[i];
    th.position.set(side * DIM.hipX, 0, 0);
    hips.add(th);
    const tp = new Parts();
    if (ace) {
      tp.limb(spec.bottom, [0, -0.01, 0], [side * 0.006, -0.1, 0], 0.074, 0.1);
      tp.add(U.cyl(16), spec.bottomTrim, [side * 0.006, -0.128, 0], [0.076, 0.018, 0.076]);
      tp.limb(spec.skin, [side * 0.004, -0.12, 0], [0, -DIM.thigh, 0], 0.05);
    } else {
      tp.limb(spec.bottom, [0, -0.01, 0], [0, -0.12, 0], 0.066, 0.08);
      tp.limb(spec.bottom, [0, -0.11, 0], [0, -DIM.thigh, 0], 0.056, 0.06);
      tp.limb(spec.bottomTrim, [side * 0.06, -0.03, 0], [side * 0.05, -DIM.thigh + 0.02, 0], 0.009);
    }
    add(th, tp);
    const sh = shin[i];
    sh.position.y = -DIM.thigh;
    th.add(sh);
    const sp = new Parts();
    if (ace) {
      sp.limb(spec.skin, [0, 0, 0], [0, -0.165, 0.004], 0.047);
      sp.add(U.cyl(14), spec.sock, [0, -0.19, 0.004], [0.051, 0.07, 0.051]);
      sp.add(U.cyl(14), spec.sole, [0, -0.166, 0.004], [0.052, 0.011, 0.052]);
    } else {
      sp.limb(spec.bottom, [0, 0, 0], [0, -0.085, 0], 0.054, 0.05);
      sp.add(U.cyl(14), spec.bottomTrim, [0, -0.098, 0], [0.055, 0.014, 0.055]);
      sp.limb(spec.bottomTrim, [side * 0.052, 0.0, 0], [side * 0.05, -0.09, 0], 0.009);
      sp.limb(spec.skin, [0, -0.1, 0], [0, -0.17, 0.004], 0.043);
      sp.add(U.cyl(14), spec.sock, [0, -0.193, 0.004], [0.048, 0.062, 0.048]);
    }
    add(sh, sp);
    const ft = foot[i];
    ft.position.y = -DIM.shin;
    sh.add(ft);
    add(ft, shoeParts(spec, side));
  }

  // ------------------------------------------------------------------ torso
  const spine = mk('spine');
  spine.position.y = DIM.spineY;
  hips.add(spine);
  const tp = new Parts();
  if (ace) {
    tp.add(U.rbox(0.32, 2), spec.top, [0, 0.135, 0], [0.34, 0.31, 0.245], [0, 0, 0], 0.14);
    tp.add(U.rbox(0.4), spec.topDark, [0, -0.008, 0], [0.346, 0.052, 0.25]);
    tp.add(U.rbox(0.35), spec.topDark, [0, 0.07, -0.121], [0.2, 0.085, 0.02]);
    tp.add(U.rbox(0.35), spec.top, [0, 0.112, -0.128], [0.17, 0.012, 0.012]);
    for (const s of [-1, 1]) {
      tp.limb(spec.trim, [s * 0.034, 0.25, -0.115], [s * 0.04, 0.172, -0.13], 0.0065);
      tp.add(U.sphere(8, 6), spec.trim, [s * 0.04, 0.166, -0.131], 0.011);
    }
    // folded hood behind the neck
    tp.add(U.sphere(12, 9), spec.topDark, [0, 0.282, 0.088], [0.165, 0.085, 0.105]);
    tp.add(U.sphere(10, 8), spec.top, [0, 0.27, 0.13], [0.11, 0.055, 0.05]);
    // kiwifruit patch on the back
    const rx: V3 = [Math.PI / 2, 0, 0];
    tp.add(U.cyl(20), 0x8a6238, [0, 0.135, 0.123], [0.056, 0.006, 0.056], rx);
    tp.add(U.cyl(20), 0x9ccc4c, [0, 0.135, 0.126], [0.047, 0.006, 0.047], rx);
    tp.add(U.cyl(14), 0xf4f0c6, [0, 0.135, 0.1285], [0.016, 0.005, 0.016], rx);
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      tp.add(U.sphere(6, 4), 0x2b2420, [Math.cos(a) * 0.028, 0.135 + Math.sin(a) * 0.028, 0.129], [0.0045, 0.0065, 0.003], [0, 0, a + Math.PI / 2]);
    }
  } else {
    tp.add(U.rbox(0.32, 2), spec.top, [0, 0.135, 0], [0.33, 0.3, 0.235], [0, 0, 0], 0.14);
    tp.add(U.rbox(0.4), spec.trim, [0, -0.006, 0], [0.336, 0.046, 0.24]);
    tp.add(U.torus(0.22, Math.PI * 2, 8, 22), spec.trim, [0, 0.288, 0.0], [0.07, 0.07, 0.07], [Math.PI / 2, 0, 0]);
    // koru swirl on the back, little flower on the front
    tp.add(U.torus(0.2, Math.PI * 1.55, 6, 20), spec.sock, [0, 0.15, 0.1185], [0.034, 0.034, 0.02], [0, 0, -0.4]);
    tp.add(U.sphere(8, 6), spec.sock, [0.009, 0.155, 0.12], 0.011);
    tp.limb(spec.sock, [-0.03, 0.135, 0.118], [-0.03, 0.07, 0.118], 0.0065);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      tp.add(U.sphere(8, 6), 0xfff4e0, [0.075 + Math.cos(a) * 0.014, 0.19 + Math.sin(a) * 0.014, -0.118], [0.01, 0.01, 0.004]);
    }
    tp.add(U.sphere(8, 6), 0xffc94a, [0.075, 0.19, -0.121], [0.007, 0.007, 0.003]);
  }
  tp.limb(spec.skin, [0, 0.26, 0], [0, 0.325, 0], 0.056);
  add(spine, tp);

  // ------------------------------------------------------------------ arms
  const shoulder: Rig['shoulder'] = [mk('shoulderL', 'ZYX'), mk('shoulderR', 'ZYX')];
  const elbow: Rig['elbow'] = [mk('elbowL'), mk('elbowR')];
  const hand: Rig['hand'] = [new THREE.Object3D(), new THREE.Object3D()];
  const bicep: THREE.Mesh[] = [];
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? -1 : 1;
    const sh = shoulder[i];
    sh.position.set(side * DIM.shoulderX, DIM.shoulderY, 0);
    spine.add(sh);
    const up = new Parts();
    if (spec.longSleeves) {
      up.add(U.sphere(12, 9), spec.top, [side * -0.004, -0.004, 0], 0.066);
      up.limb(spec.top, [0, -0.02, 0], [0, -0.135, 0], 0.056, 0.08);
    } else {
      up.add(U.sphere(12, 9), spec.trim, [side * -0.004, -0.004, 0], 0.064);
      up.limb(spec.trim, [0, -0.01, 0], [0, -0.06, 0], 0.062);
      up.add(U.cyl(16), spec.trim, [0, -0.075, 0], [0.063, 0.02, 0.063]);
      up.limb(spec.skin, [0, -0.06, 0], [0, -0.145, 0], 0.045);
    }
    add(sh, up);
    const bump = new Parts().add(U.sphere(12, 10), spec.longSleeves ? spec.top : spec.skin, [0, 0, 0], 1).mesh(bodyMaterial());
    bump.position.set(0, -0.085, -0.032);
    bump.scale.setScalar(0.0001);
    bump.visible = false;
    sh.add(bump);
    bicep.push(bump);
    meshes.push(bump);
    const el = elbow[i];
    el.position.y = -DIM.upperArm;
    sh.add(el);
    const fp = new Parts();
    if (spec.longSleeves) {
      fp.add(U.sphere(10, 8), spec.top, [0, 0, 0], 0.054);
      fp.limb(spec.top, [0, 0, 0], [0, -0.1, -0.004], 0.05, 0.06);
      fp.add(U.cyl(14), spec.trim, [0, -0.125, -0.004], [0.052, 0.036, 0.052]);
    } else {
      fp.add(U.sphere(12, 10), spec.skin, [0, 0, 0], 0.045);
      fp.limb(spec.skin, [0, 0, 0], [0, -0.13, -0.003], 0.042);
      fp.add(U.cyl(14), spec.stripe, [0, -0.112, -0.003], [0.047, 0.018, 0.047]);
    }
    // chunky mitten hand with a thumb (thumb toward -Z when hanging)
    fp.add(U.sphere(12, 9), spec.skin, [0, -DIM.foreArm - DIM.hand + 0.004, -0.004], [0.05, 0.057, 0.045]);
    fp.add(U.sphere(8, 6), spec.skin, [-side * 0.012, -DIM.foreArm - 0.03, -0.036], [0.021, 0.026, 0.021], [0.5, 0, 0]);
    add(el, fp);
    const hd = hand[i];
    hd.position.set(0, -DIM.foreArm - DIM.hand, 0);
    el.add(hd);
  }

  // ------------------------------------------------------------------ head
  const head = mk('head');
  head.position.y = DIM.neckY;
  spine.add(head);
  const hp = new Parts();
  const [ax, by, cz] = DIM.head;
  hp.add(U.sphere(24, 16), spec.skin, [0, DIM.headC, 0], [ax, by, cz], [0, 0, 0], 0.04);
  for (const s of [-1, 1]) {
    hp.add(U.sphere(9, 7), spec.skin, [s * 0.248, DIM.headC - 0.01, 0.014], [0.042, 0.057, 0.034]);
    hp.add(U.sphere(7, 5), spec.lid, [s * 0.266, DIM.headC - 0.012, 0.004], [0.02, 0.032, 0.012]);
  }
  const face = new Face(spec, head, hp, seed);
  const hair = mk('hair', 'XYZ');
  let headTop: number;
  const hairParts = new Parts();
  if (ace) headTop = buildAceHair(spec, hp, hairParts, hair);
  else headTop = buildMoanaHair(spec, hp, hairParts, hair, seed);
  add(head, hp);
  head.add(hair);
  add(hair, hairParts);
  meshes.push(...face.meshes);

  return {
    rideRoot,
    hips,
    spine,
    head,
    thigh,
    shin,
    foot,
    shoulder,
    elbow,
    hand,
    hair,
    bicep: [bicep[0], bicep[1]],
    face,
    headTop,
    meshes,
  };
}

function shoeParts(spec: CharSpec, side: number): Parts {
  const p = new Parts();
  const z0 = -0.052;
  p.add(U.rbox(0.42), spec.shoe, [0, -0.036, z0], [0.118, 0.084, 0.236], [0, 0, 0], 0.12);
  p.add(U.sphere(12, 8), spec.shoe, [0, -0.046, z0 - 0.088], [0.059, 0.043, 0.062]);
  p.add(U.rbox(0.32), spec.sole, [0, -0.068, z0 - 0.002], [0.13, 0.036, 0.258]);
  p.add(U.rbox(0.3), darker(spec.sole, 0.82), [0, -0.0815, z0 - 0.002], [0.128, 0.008, 0.25]);
  p.add(U.cyl(16), spec.shoe, [0, 0.0, 0.0], [0.057, 0.04, 0.057]);
  p.add(U.cyl(16), spec.stripe, [0, 0.02, 0.0], [0.059, 0.01, 0.059]);
  p.add(U.rbox(0.4), spec.stripe, [0, 0.0, 0.058], [0.04, 0.05, 0.02]);
  // side stripes (both sides)
  for (const s of [-1, 1]) {
    p.add(U.rbox(0.4), spec.stripe, [s * 0.0595, -0.038, z0 + 0.01], [0.006, 0.02, 0.12], [-0.4, 0, 0]);
  }
  // tongue + laces
  p.add(U.rbox(0.4), spec.shoe, [0, 0.008, -0.03], [0.06, 0.034, 0.05], [0.4, 0, 0]);
  for (let k = 0; k < 3; k++) p.add(U.rbox(0.4), spec.lace, [0, 0.004 - k * 0.009, -0.05 - k * 0.026], [0.054, 0.009, 0.012], [0.35, 0, 0]);
  void side;
  return p;
}

function darker(c: number, k: number): number {
  const r = ((c >> 16) & 255) * k;
  const g = ((c >> 8) & 255) * k;
  const b = (c & 255) * k;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

/** Ace: teal cap (tilted back a touch so the brows show), brown tufts, snapback strap. */
function buildAceHair(spec: CharSpec, hp: Parts, spring: Parts, pivot: THREE.Group): number {
  const cap = 0x5f9f99;
  const capDark = 0x4a8781;
  const cream = 0xf6efe2;
  const hair = spec.hair;
  // hair under the cap
  hp.add(U.sphere(12, 9), hair, [0, DIM.headC - 0.05, 0.15], [0.205, 0.115, 0.12], [0, 0, 0], 0.1);
  for (const s of [-1, 1]) hp.add(U.sphere(9, 7), hair, [s * 0.232, DIM.headC + 0.045, -0.085], [0.026, 0.05, 0.034], [0, 0, s * 0.15]);
  for (let k = 0; k <= 10; k++) {
    const a = -1.75 + (k / 10) * 3.5; // around the back (a = 0 at +Z)
    const y = DIM.headC + 0.045 - 0.05 * Math.cos(a * 0.9);
    hp.add(U.sphere(8, 6), k % 2 ? spec.hairHi : hair, [Math.sin(a) * 0.238, y, Math.cos(a) * 0.222], [0.052, 0.036, 0.034], [0.25, a, 0]);
  }
  for (const x of [-0.075, -0.02, 0.04, 0.09]) hp.add(U.sphere(8, 6), hair, [x, DIM.headC + 0.128, -0.198], [0.04, 0.026, 0.028], [0.4, 0, x * 3]);
  // cap frame: tilted back so the front edge sits above the brows
  const capFrame = new THREE.Matrix4().compose(new THREE.Vector3(0, DIM.headC + 0.072, 0.0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.16, 0, 0)), new THREE.Vector3(1, 1, 1));
  addIn(hp, capFrame, U.dome(22, 8), cap, [0, 0, 0], [0.272, 0.218, 0.262], [0, 0, 0], 0.1);
  addIn(hp, capFrame, U.cyl(22), capDark, [0, 0.008, 0], [0.274, 0.022, 0.264]);
  // brim
  addIn(hp, capFrame, U.cyl(20), cap, [0, 0.004, -0.21], [0.172, 0.02, 0.158], [0.1, 0, 0], 0.06);
  addIn(hp, capFrame, U.cyl(20), capDark, [0, -0.007, -0.21], [0.169, 0.006, 0.155], [0.1, 0, 0]);
  addIn(hp, capFrame, U.sphere(8, 6), cream, [0, 0.215, 0], [0.028, 0.018, 0.028]);
  // front badge: a little mustard sun with a cream centre
  addIn(hp, capFrame, U.cyl(18), 0xffc94a, [0, 0.11, -0.21], [0.04, 0.008, 0.04], [Math.PI / 2 - 0.55, 0, 0]);
  addIn(hp, capFrame, U.cyl(14), cream, [0, 0.112, -0.214], [0.018, 0.008, 0.018], [Math.PI / 2 - 0.55, 0, 0]);
  // snapback strap arch at the back
  addIn(hp, capFrame, U.torus(0.2, Math.PI, 6, 14), cream, [0, 0.0, 0.258], [0.06, 0.05, 0.03], [0, 0, 0]);
  // a tuft poking out of the snapback (spring)
  pivot.position.set(0, DIM.headC + 0.06, 0.235);
  spring.add(U.sphere(8, 6), spec.hair, [0, 0.012, 0.02], [0.034, 0.026, 0.03], [0.4, 0, 0]);
  spring.add(U.sphere(8, 6), spec.hairHi, [0.016, 0.03, 0.03], [0.022, 0.02, 0.026], [0.6, 0, 0.4]);
  spring.add(U.sphere(8, 6), spec.hair, [-0.014, 0.028, 0.034], [0.02, 0.018, 0.024], [0.6, 0, -0.4]);
  return DIM.headC + 0.072 + 0.218 + 0.02;
}

/** Moana: dark curly hair pulled into a big high puff, lemon scrunchie and a red flower clip. */
function buildMoanaHair(spec: CharSpec, hp: Parts, spring: Parts, pivot: THREE.Group, seed: number): number {
  const hair = spec.hair;
  const hi = spec.hairHi;
  const theta = Math.PI * 0.33;
  hp.add(U.cap(theta, 24, 8), hair, [0, DIM.headC + 0.004, 0.004], [0.268, 0.262, 0.252], [0, 0, 0], 0.05);
  hp.add(U.sphere(18, 12), hair, [0, DIM.headC - 0.004, 0.044], [0.259, 0.252, 0.232], [0, 0, 0], 0.08);
  // curly hairline
  const jit = [0.6, -0.4, 0.9, -0.7, 0.2, -0.9, 0.5, -0.2, 0.8, -0.5, 0.1, -0.8, 0.4];
  for (let k = 0; k <= 12; k++) {
    const phi = -1.4 + (k / 12) * 2.8 + jit[k] * 0.06;
    const th = theta - 0.035 + jit[(k + 3) % 13] * 0.02;
    const st = Math.sin(th);
    const x = 0.262 * st * Math.sin(phi);
    const y = DIM.headC + 0.258 * Math.cos(th);
    const z = -0.246 * st * Math.cos(phi);
    const r = 0.019 + Math.abs(jit[(k + 5) % 13]) * 0.011;
    hp.add(U.sphere(7, 5), k % 3 === 0 ? hi : hair, [x, y, z], [r, r * 0.85, r * 0.7], [0, phi, 0]);
  }
  // baby curls at the temples and the nape
  for (const s of [-1, 1]) {
    hp.add(U.sphere(8, 6), hair, [s * 0.236, DIM.headC + 0.085, -0.07], [0.03, 0.045, 0.034], [0, 0, s * 0.2]);
  }
  for (let k = 0; k < 7; k++) {
    const a = -1.5 + (k / 6) * 3.0;
    hp.add(U.sphere(8, 6), k % 2 ? hi : hair, [Math.sin(a) * 0.205, DIM.headC - 0.17 + Math.abs(a) * 0.035, 0.1 + Math.cos(a) * 0.1], [0.04, 0.035, 0.035]);
  }
  // the puff (springy) — pivot at its base on the crown
  pivot.position.set(0, DIM.headC + 0.17, 0.04);
  const c = new THREE.Vector3(0, 0.105, 0.005);
  const R = 0.118;
  const W: V3 = [1.18, 0.92, 1.1];
  spring.add(U.sphere(16, 12), hair, [c.x, c.y, c.z], [R * W[0], R * W[1], R * W[2]], [0, 0, 0], 0.12);
  let s = (seed * 9301 + 49297) >>> 0;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const n = 20;
  for (let k = 0; k < n; k++) {
    // fibonacci sphere, skip the lowest band (inside the head)
    const yv = 1 - (k / (n - 1)) * 1.55;
    const rr = Math.sqrt(Math.max(0, 1 - yv * yv));
    const a = k * 2.39996;
    const d = new THREE.Vector3(Math.cos(a) * rr, yv, Math.sin(a) * rr);
    const br = 0.044 + rnd() * 0.016;
    const pp = c.clone().add(new THREE.Vector3(d.x * R * W[0], d.y * R * W[1], d.z * R * W[2]).multiplyScalar(0.9));
    spring.add(U.sphere(8, 6), rnd() < 0.35 ? hi : hair, [pp.x, pp.y, pp.z], [br, br * 0.92, br]);
  }
  // scrunchie
  spring.add(U.torus(0.34, Math.PI * 2, 7, 20), spec.stripe, [0, 0.01, 0.0], [0.092, 0.092, 0.06], [Math.PI / 2, 0, 0], 0.1);
  // pohutukawa-red flower clip on the right-back of the puff
  const dir = new THREE.Vector3(0.72, 0.32, 0.62).normalize();
  const fpos = c.clone().add(new THREE.Vector3(dir.x * R * W[0], dir.y * R * W[1], dir.z * R * W[2]).multiplyScalar(1.12));
  const fq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
  const frame = new THREE.Matrix4().compose(fpos, fq, new THREE.Vector3(1, 1, 1));
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    addIn(spring, frame, U.sphere(9, 7), 0xf0564a, [Math.cos(a) * 0.03, Math.sin(a) * 0.03, 0], [0.024, 0.036, 0.01], [0, 0, a - Math.PI / 2]);
  }
  addIn(spring, frame, U.sphere(8, 6), 0xffd23f, [0, 0, -0.008], [0.016, 0.016, 0.01]);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3;
    addIn(spring, frame, U.sphere(6, 4), 0xfff1b0, [Math.cos(a) * 0.014, Math.sin(a) * 0.014, -0.014], 0.005);
  }
  return DIM.headC + 0.17 + c.y + R * W[1] * 0.9 + 0.05;
}
