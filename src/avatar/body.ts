// Builds a character rig: bone groups (each with one merged vertex-coloured mesh), hair,
// face and the dynamic little extras (hair spring, bicep bumps).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bodyMaterial, Parts, starGeometry, U, type V3 } from './build';
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
  hair: THREE.Group; // spring pivot (Ciela's puff / Ace's cap tuft)
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
  if (spec.skirt !== null) {
    // sporty skort over the leggings: a short flared skirt with a white hem
    pelvis.add(frustumGeo(), spec.skirt, [0, 0.03, 0.004], [0.158, 0.13, 0.124], [0, 0, 0], 0.18);
    pelvis.add(frustumGeo(), spec.trim, [0, -0.031, 0.004], [0.188, 0.012, 0.148]);
    pelvis.add(U.rbox(0.4), spec.trim, [0, 0.093, 0.004], [0.3, 0.02, 0.23]);
  }
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
    if (spec.shoePatch) {
      const patch = patchMesh();
      ft.add(patch);
      meshes.push(patch);
    }
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
    // lilac sporty tee: white collar trim, sporty side panels, a little bow, a star on the back
    tp.add(U.rbox(0.32, 2), spec.top, [0, 0.135, 0], [0.33, 0.3, 0.235], [0, 0, 0], 0.14);
    tp.add(U.rbox(0.4), spec.topDark, [0, -0.006, 0], [0.336, 0.046, 0.24]);
    tp.add(U.torus(0.24, Math.PI * 2, 8, 22), spec.trim, [0, 0.29, 0.0], [0.07, 0.07, 0.07], [Math.PI / 2, 0, 0]);
    for (const sx of [-1, 1]) tp.add(U.rbox(0.4), spec.trim, [sx * 0.162, 0.13, 0], [0.012, 0.24, 0.05]);
    bowParts(tp, spec.bow ?? spec.trim, new THREE.Vector3(0.0, 0.262, -0.098), new THREE.Vector3(0, 0.25, -1), 0.75);
    const star = new THREE.Matrix4().compose(new THREE.Vector3(0, 0.15, 0.1188), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0)), new THREE.Vector3(0.042, 0.042, 1));
    tp.addMatrix(starGeometry(5, 0.45), spec.trim, star);
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
      // little puff sleeves with a white cuff
      up.add(U.sphere(12, 9), spec.top, [side * -0.002, -0.006, 0], 0.07, [0, 0, 0], 0.1);
      up.limb(spec.top, [0, -0.012, 0], [0, -0.058, 0], 0.067, 0.1);
      up.add(U.cyl(16), spec.trim, [0, -0.08, 0], [0.06, 0.016, 0.06]);
      up.limb(spec.skin, [0, -0.07, 0], [0, -0.145, 0], 0.044);
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
      fp.add(U.cyl(14), spec.bow ?? spec.stripe, [0, -0.112, -0.003], [0.047, 0.018, 0.047]);
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
  const face = new Face(spec, head, hp, seed, ace ? null : FRINGE_BOTTOM - DIM.headC);
  const hair = mk('hair', 'XYZ');
  let headTop: number;
  const hairParts = new Parts();
  if (ace) headTop = buildAceHair(spec, hp, hairParts, hair);
  else headTop = buildCielaHair(spec, hp, hairParts, hair);
  add(head, hp);
  head.add(hair);
  const hairMesh = hairParts.mesh(ace ? bodyMaterial() : hairMaterial());
  hair.add(hairMesh);
  meshes.push(hairMesh);
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
  // Ciela's upper is a touch boxier so the side badges sit flat
  if (spec.shoePatch) p.add(U.rbox(0.3), spec.shoe, [0, -0.039, z0], [0.118, 0.078, 0.236], [0, 0, 0], 0.12);
  else p.add(U.rbox(0.42), spec.shoe, [0, -0.036, z0], [0.118, 0.084, 0.236], [0, 0, 0], 0.12);
  if (spec.shoePatch) p.add(U.sphere(12, 8), spec.shoe, [0, -0.044, z0 - 0.09], [0.059, 0.04, 0.058]);
  else p.add(U.sphere(12, 8), spec.shoe, [0, -0.046, z0 - 0.088], [0.059, 0.043, 0.062]);
  p.add(U.rbox(0.32), spec.sole, [0, -0.068, z0 - 0.002], [0.13, 0.036, 0.258]);
  p.add(U.rbox(0.3), darker(spec.sole, 0.82), [0, -0.0815, z0 - 0.002], [0.128, 0.008, 0.25]);
  p.add(U.cyl(16), spec.shoe, [0, 0.0, 0.0], [0.057, 0.04, 0.057]);
  p.add(U.cyl(16), spec.stripe, [0, 0.02, 0.0], [0.059, 0.01, 0.059]);
  p.add(U.rbox(0.4), spec.stripe, [0, 0.0, 0.058], [0.04, 0.05, 0.02]);
  // side stripes (both sides)
  if (!spec.shoePatch) {
    for (const s of [-1, 1]) p.add(U.rbox(0.4), spec.stripe, [s * 0.0595, -0.038, z0 + 0.01], [0.006, 0.02, 0.12], [-0.4, 0, 0]);
  } else {
    // white rims around the explorer badges + tiny flower prints
    for (const s of [-1, 1]) {
      p.add(U.torus(0.13, Math.PI * 2, 4, 16), spec.sole, [s * PATCH.x, PATCH.y, PATCH.z], PATCH.r, [0, s * Math.PI / 2, 0]);
      flower(p, new THREE.Vector3(s * 0.0598, -0.048, -0.122), new THREE.Vector3(s, 0, -0.35), 1.05);
    }
    flower(p, new THREE.Vector3(0, -0.006, -0.146), new THREE.Vector3(0, 1, -0.6), 1.1);
    flower(p, new THREE.Vector3(0, 0.0, 0.066), new THREE.Vector3(0, 0.2, 1), 0.6);
  }
  // tongue + laces
  p.add(U.rbox(0.4), spec.shoePatch ? spec.lace : spec.shoe, [0, 0.008, -0.03], [0.06, 0.034, 0.05], [0.4, 0, 0]);
  const ly = spec.shoePatch ? 0.008 : 0;
  for (let k = 0; k < 3; k++) p.add(U.rbox(0.4), spec.lace, [0, 0.004 - k * 0.009 + ly, -0.05 - k * 0.026], [0.054, 0.009, 0.012], [0.35, 0, 0]);
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

// ---------------------------------------------------------------- Ciela helpers
let frustum: THREE.BufferGeometry | null = null;
function frustumGeo(): THREE.BufferGeometry {
  if (!frustum) {
    frustum = new THREE.CylinderGeometry(1, 1.2, 1, 22, 1);
    frustum.userData.shared = true;
  }
  return frustum;
}

let hairMat: THREE.MeshStandardMaterial | null = null;
/** Double-sided so the inside of the bob reads as hair, never as a hole. */
function hairMaterial(): THREE.MeshStandardMaterial {
  if (!hairMat) hairMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0, side: THREE.DoubleSide });
  return hairMat;
}

/** Bob geometry constants (head-bone space). The fringe edge is the guard line for the brows. */
export const BOB = {
  c: new THREE.Vector3(0, DIM.headC + 0.004, 0.01),
  r: [0.283, 0.272, 0.262] as const,
  /** Crown cap / fringe cut angle from the top (radians). */
  fringeTheta: Math.PI * 0.318,
  /** Fringe edge tube radius. */
  edge: 0.013,
  /** Face opening half-angle (radians) for the side/back curtain. */
  open: 1.0,
  bottomTheta: Math.PI * 0.66,
};
/** Lowest point of the fringe in head-bone space (brows and eyes must stay below this). */
export const FRINGE_BOTTOM = BOB.c.y + BOB.r[1] * Math.cos(BOB.fringeTheta) - BOB.edge;

function ellipsoidPoint(theta: number, phi: number, r: readonly [number, number, number], c: THREE.Vector3, grow = 0): THREE.Vector3 {
  // phi measured around Y with phi = 0 at the front (-Z), positive toward +X
  const st = Math.sin(theta);
  return new THREE.Vector3((r[0] + grow) * st * Math.sin(phi) + c.x, (r[1] + grow) * Math.cos(theta) + c.y, -(r[2] + grow) * st * Math.cos(phi) + c.z);
}

function tubeAlong(parts: Parts, color: number, pts: THREE.Vector3[], radius: number, shade = 0): void {
  const curve = new THREE.CatmullRomCurve3(pts);
  const g = new THREE.TubeGeometry(curve, Math.max(4, Math.round(pts.length * 1.6)), radius, 5, false);
  parts.addMatrix(g, color, new THREE.Matrix4(), shade);
  g.dispose();
}

/** A small two-loop bow facing `dir`. */
function bowParts(parts: Parts, color: number, pos: THREE.Vector3, dir: THREE.Vector3, size: number): void {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir.clone().normalize());
  const f = new THREE.Matrix4().compose(pos, q, new THREE.Vector3(size, size, size));
  for (const s of [-1, 1]) {
    addIn(parts, f, U.sphere(10, 8), color, [s * 0.026, 0, 0], [0.026, 0.019, 0.011], [0, 0, s * 0.35], 0.12);
    addIn(parts, f, U.sphere(8, 6), color, [s * 0.012, -0.022, 0.002], [0.007, 0.016, 0.006], [0, 0, s * 0.45]);
  }
  addIn(parts, f, U.sphere(8, 6), darker(color, 0.85), [0, 0, -0.004], [0.011, 0.012, 0.01]);
}

/** A tiny five-petal print flower facing `dir`. */
function flower(parts: Parts, pos: THREE.Vector3, dir: THREE.Vector3, size: number): void {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir.clone().normalize());
  const f = new THREE.Matrix4().compose(pos, q, new THREE.Vector3(size, size, size));
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.3;
    addIn(parts, f, U.sphere(5, 3), 0xffffff, [Math.cos(a) * 0.0062, Math.sin(a) * 0.0062, 0], [0.0045, 0.0045, 0.0018]);
  }
  addIn(parts, f, U.sphere(5, 3), 0xffd23f, [0, 0, -0.0012], [0.0032, 0.0032, 0.0018]);
}

const PATCH = { x: 0.0602, y: -0.038, z: -0.05, r: 0.0225 };
let patchTex: THREE.CanvasTexture | null = null;
let patchMat: THREE.MeshStandardMaterial | null = null;
let patchGeo: THREE.BufferGeometry | null = null;

/** Original cartoon explorer-girl badge (sun hat, ginger pigtails, binoculars) — not based on any IP. */
function drawPatch(g: CanvasRenderingContext2D, S: number): void {
  const c = S / 2;
  g.clearRect(0, 0, S, S);
  g.save();
  g.beginPath();
  g.arc(c, c, c - 1, 0, Math.PI * 2);
  g.clip();
  const sky = g.createLinearGradient(0, 0, 0, S);
  sky.addColorStop(0, '#8fd3f4');
  sky.addColorStop(1, '#dff4ff');
  g.fillStyle = sky;
  g.fillRect(0, 0, S, S);
  g.fillStyle = '#ffd23f';
  g.beginPath();
  g.arc(S * 0.8, S * 0.22, S * 0.09, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#7cc46a';
  g.beginPath();
  g.ellipse(c, S * 1.02, S * 0.7, S * 0.26, 0, 0, Math.PI * 2);
  g.fill();
  // shirt (mint) + backpack straps (orange)
  g.fillStyle = '#5fcf9f';
  g.beginPath();
  g.ellipse(c, S * 0.98, S * 0.3, S * 0.2, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ff9a3c';
  g.fillRect(c - S * 0.2, S * 0.8, S * 0.05, S * 0.2);
  g.fillRect(c + S * 0.15, S * 0.8, S * 0.05, S * 0.2);
  // ginger pigtails
  g.fillStyle = '#d0652b';
  for (const sx of [-1, 1]) {
    g.beginPath();
    g.ellipse(c + sx * S * 0.25, S * 0.6, S * 0.07, S * 0.11, sx * 0.5, 0, Math.PI * 2);
    g.fill();
  }
  // face
  g.fillStyle = '#f7cfab';
  g.beginPath();
  g.arc(c, S * 0.56, S * 0.2, 0, Math.PI * 2);
  g.fill();
  // explorer sun hat (khaki) with a band
  g.fillStyle = '#c99a4f';
  g.beginPath();
  g.ellipse(c, S * 0.4, S * 0.33, S * 0.07, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ddb66c';
  g.beginPath();
  g.ellipse(c, S * 0.36, S * 0.19, S * 0.13, 0, Math.PI, 0);
  g.fill();
  g.fillStyle = '#8a5a2b';
  g.fillRect(c - S * 0.19, S * 0.34, S * 0.38, S * 0.04);
  // face details
  g.fillStyle = '#2b2420';
  for (const sx of [-1, 1]) {
    g.beginPath();
    g.arc(c + sx * S * 0.075, S * 0.55, S * 0.026, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#f29a9a';
  for (const sx of [-1, 1]) {
    g.beginPath();
    g.ellipse(c + sx * S * 0.12, S * 0.62, S * 0.035, S * 0.022, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = '#7a2c3a';
  g.lineWidth = S * 0.025;
  g.lineCap = 'round';
  g.beginPath();
  g.arc(c, S * 0.6, S * 0.065, 0.25 * Math.PI, 0.75 * Math.PI);
  g.stroke();
  // binoculars hanging at the chest
  g.fillStyle = '#3b4652';
  for (const sx of [-1, 1]) {
    g.beginPath();
    g.arc(c + sx * S * 0.045, S * 0.86, S * 0.04, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  g.lineWidth = S * 0.05;
  g.strokeStyle = '#ffffff';
  g.beginPath();
  g.arc(c, c, c - S * 0.03, 0, Math.PI * 2);
  g.stroke();
}

/** Both side badges of one sneaker as a single textured mesh (1 draw call). */
function patchMesh(): THREE.Mesh {
  if (!patchMat) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    drawPatch(cv.getContext('2d')!, 128);
    patchTex = new THREE.CanvasTexture(cv);
    patchTex.colorSpace = THREE.SRGBColorSpace;
    patchTex.anisotropy = 4;
    patchMat = new THREE.MeshStandardMaterial({ map: patchTex, roughness: 0.65, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const list: THREE.BufferGeometry[] = [];
    for (const s of [-1, 1]) {
      const g = new THREE.CircleGeometry(PATCH.r, 24);
      g.rotateY((s * Math.PI) / 2);
      g.translate(s * PATCH.x, PATCH.y, PATCH.z);
      list.push(g);
    }
    patchGeo = mergeGeometries(list, false)!;
    patchGeo.userData.shared = true;
    for (const g of list) g.dispose();
  }
  const m = new THREE.Mesh(patchGeo!, patchMat);
  m.name = 'shoePatch';
  return m;
}

/**
 * Ciela: black straight bob with a full straight-cut fringe.
 * Static on the head: crown + fringe (its blunt edge sits above the brows, so it can never cover the
 * eyes or brows). Springy: the side/back curtain, pivoted at the fringe line so only the ends swing.
 */
function buildCielaHair(spec: CharSpec, hp: Parts, spring: Parts, pivot: THREE.Group): number {
  const hair = spec.hair;
  const hi = spec.hairHi;
  const { c, r, fringeTheta: th, edge, open, bottomTheta } = BOB;
  // crown cap (down to the fringe line all round)
  hp.add(U.cap(th, 26, 9), hair, [c.x, c.y, c.z], [r[0], r[1], r[2]], [0, 0, 0], 0.06);
  // static under-layer at the back/sides (inside the face line), so a swinging bob never shows scalp
  hp.add(U.sphere(18, 12), darker(hair, 0.9), [0, DIM.headC - 0.012, 0.05], [0.262, 0.258, 0.226]);
  // blunt fringe edge across the front + soft glossy sheen band
  const fr: THREE.Vector3[] = [];
  for (let k = 0; k <= 14; k++) fr.push(ellipsoidPoint(th, -open - 0.12 + (k / 14) * (2 * open + 0.24), r, c, -edge * 0.4));
  tubeAlong(hp, hair, fr, edge);
  const sh: THREE.Vector3[] = [];
  for (let k = 0; k <= 14; k++) sh.push(ellipsoidPoint(th * 0.5, -1.1 + (k / 14) * 2.2, r, c, 0.002));
  tubeAlong(hp, hi, sh, 0.008);
  // a few straight strand grooves on the fringe
  for (const ph of [-0.62, -0.31, 0, 0.31, 0.62]) {
    tubeAlong(hp, hi, [ellipsoidPoint(th * 0.62, ph, r, c, 0.001), ellipsoidPoint(th * 0.98, ph, r, c, 0.001)], 0.0035);
  }
  // bow on the right side of the crown
  if (spec.bow !== null) {
    const bp = ellipsoidPoint(th * 0.86, 1.65, r, c, 0.012);
    bowParts(hp, spec.bow, bp, new THREE.Vector3(0.9, 0.3, 0.15), 1);
  }
  // ---- springy curtain (pivot at the fringe line)
  pivot.position.set(0, c.y + r[1] * Math.cos(th), 0.0);
  const toPivot = new THREE.Matrix4().makeTranslation(-pivot.position.x, -pivot.position.y, -pivot.position.z);
  const t0 = th - 0.05;
  // SphereGeometry phi: x = -cos(phi), z = sin(phi). Front (-Z) is phi = 3pi/2; skip +-open around it.
  const band = new THREE.SphereGeometry(1, 26, 8, (3 * Math.PI) / 2 + open, Math.PI * 2 - 2 * open, t0, bottomTheta - t0);
  const bm = new THREE.Matrix4().compose(c, new THREE.Quaternion(), new THREE.Vector3(r[0] + 0.005, r[1] + 0.003, r[2] + 0.006));
  spring.addMatrix(band, hair, toPivot.clone().multiply(bm), 0.12);
  band.dispose();
  // blunt bottom edge + the two front edges of the curtain
  const bot: THREE.Vector3[] = [];
  for (let k = 0; k <= 20; k++) bot.push(ellipsoidPoint(bottomTheta, open + (k / 20) * (Math.PI * 2 - 2 * open), r, c, 0.0).applyMatrix4(toPivot));
  tubeAlong(spring, hair, bot, edge * 1.1, 0.1);
  for (const s of [-1, 1]) {
    const e: THREE.Vector3[] = [];
    for (let k = 0; k <= 6; k++) e.push(ellipsoidPoint(t0 + (k / 6) * (bottomTheta - t0), s * open, r, c, 0.002).applyMatrix4(toPivot));
    tubeAlong(spring, hair, e, edge, 0.1);
  }
  // glossy sheen band around the back + soft straight strand lines (keeps it hair, not a helmet)
  const sb: THREE.Vector3[] = [];
  for (let k = 0; k <= 20; k++) sb.push(ellipsoidPoint(Math.PI * 0.43, open + 0.15 + (k / 20) * (Math.PI * 2 - 2 * open - 0.3), r, c, 0.007).applyMatrix4(toPivot));
  tubeAlong(spring, hi, sb, 0.009);
  for (let k = 0; k < 7; k++) {
    const ph = open + 0.3 + (k / 6) * (Math.PI * 2 - 2 * open - 0.6);
    tubeAlong(spring, k % 2 ? hi : darker(hair, 0.7), [ellipsoidPoint(Math.PI * 0.47, ph, r, c, 0.007).applyMatrix4(toPivot), ellipsoidPoint(bottomTheta - 0.03, ph + 0.03, r, c, 0.006).applyMatrix4(toPivot)], 0.0032);
  }
  return c.y + r[1] + 0.005;
}
