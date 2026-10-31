// Ride models: kid's bike (spinning spoked wheels, cranks + level pedals, steering),
// kick scooter and skateboard. Everything faces -Z; ride-local origin on the ground.
import * as THREE from 'three';
import type { RideId } from '../contracts';
import { Parts, rideMaterial, U, type V3 } from './build';
import type { RideColours } from './spec';

export interface RideBase {
  readonly id: RideId;
  /** Child of the rig's rideRoot; posed around `pivot`. */
  readonly group: THREE.Group;
  readonly pivot: THREE.Vector3;
  readonly meshes: THREE.Object3D[];
  /** Handlebar grips (ride-local), if any. */
  readonly grips: [THREE.Vector3, THREE.Vector3] | null;
  /** Top surface height where feet stand (deck) or 0. */
  readonly deckY: number;
  update(dt: number, speed: number, steer: number, squash: number, crank: number): void;
}

const ink = 0x2b3440;
const mesh = (parts: Parts, list: THREE.Object3D[], parent: THREE.Object3D): THREE.Mesh => {
  const m = parts.mesh(rideMaterial());
  parent.add(m);
  list.push(m);
  return m;
};
const RY: V3 = [0, Math.PI / 2, 0];
const RZ: V3 = [0, 0, Math.PI / 2];

// ------------------------------------------------------------------ bike
export const BIKE = {
  wheelR: 0.235,
  rearZ: 0.36,
  frontZ: -0.44,
  bb: new THREE.Vector3(0, 0.25, -0.02),
  crankR: 0.1,
  pedalX: 0.112,
  seat: new THREE.Vector3(0, 0.655, 0.15),
  steerZ: -0.345,
};

function wheelParts(c: RideColours, r: number, beads: boolean): Parts {
  const p = new Parts();
  p.add(U.torus(0.15, Math.PI * 2, 6, 22), c.tyre, [0, 0, 0], [r - 0.03, r - 0.03, 0.2], RY);
  p.add(U.torus(0.12, Math.PI * 2, 4, 22), c.wheel, [0, 0, 0], [r - 0.055, r - 0.055, 0.3], RY);
  p.add(U.cyl(10), c.metal, [0, 0, 0], [0.026, 0.085, 0.026], RZ);
  p.add(U.cyl(10), c.wheel, [0, 0, 0], [0.034, 0.03, 0.034], RZ);
  const n = 10;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const side = k % 2 ? 1 : -1;
    p.limb(c.metal, [side * 0.03, Math.sin(a) * 0.022, Math.cos(a) * 0.022], [side * 0.006, Math.sin(a + 0.25) * (r - 0.052), Math.cos(a + 0.25) * (r - 0.052)], 0.0035, 0, 3);
  }
  if (beads) {
    // colourful spoke beads (they clack and make the spin readable)
    const cols = [c.accent2, c.rim, c.accent2];
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.25;
      const rr = (r - 0.05) * 0.62;
      p.add(U.sphere(6, 4), cols[k], [0, Math.sin(a) * rr, Math.cos(a) * rr], [0.016, 0.02, 0.02]);
    }
  }
  return p;
}

export class BikeRide implements RideBase {
  readonly id = 'bike' as const;
  readonly group = new THREE.Group();
  readonly pivot = new THREE.Vector3(0, 0, BIKE.rearZ);
  readonly meshes: THREE.Object3D[] = [];
  readonly grips: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(-0.215, 0.79, -0.245), new THREE.Vector3(0.215, 0.79, -0.245)];
  readonly deckY = 0;
  private frame = new THREE.Group();
  private steer = new THREE.Group();
  private rear: THREE.Mesh;
  private front: THREE.Mesh;
  private crank: THREE.Mesh;
  private pedals: THREE.Mesh[] = [];
  private spin = 0;
  private gripsBase: THREE.Vector3[];

  constructor(c: RideColours, streamers: boolean) {
    const R = BIKE.wheelR;
    this.group.add(this.frame);
    this.rear = mesh(wheelParts(c, R, true), this.meshes, this.group);
    this.rear.position.set(0, R, BIKE.rearZ);
    // frame
    const f = new Parts();
    const bb = BIKE.bb;
    const seatTop: V3 = [0, 0.57, 0.125];
    const headTop: V3 = [0, 0.6, -0.325];
    const headBot: V3 = [0, 0.455, -0.355];
    const bbv: V3 = [bb.x, bb.y, bb.z];
    f.limb(c.frame, bbv, seatTop, 0.022, 0.1);
    f.limb(c.frame, [0, 0.47, 0.082], [0, 0.565, -0.33], 0.021, 0.08);
    f.limb(c.frame, bbv, headBot, 0.026, 0.1);
    f.limb(c.frame, headBot, headTop, 0.03);
    for (const s of [-1, 1]) {
      f.limb(c.frame, [s * 0.02, bb.y, bb.z + 0.02], [s * 0.046, R, BIKE.rearZ], 0.013, 0, 6);
      f.limb(c.frame, [s * 0.018, 0.52, 0.11], [s * 0.046, R, BIKE.rearZ], 0.012, 0, 6);
    }
    f.add(U.cyl(14), c.frame, bbv, [0.032, 0.09, 0.032], RZ);
    // seat post + kid saddle
    f.limb(c.metal, [0, 0.56, 0.128], [0, 0.615, 0.148], 0.015);
    f.add(U.sphere(12, 8), c.seat, [0, 0.628, 0.16], [0.07, 0.03, 0.115], [0, 0, 0], 0.15);
    f.add(U.rbox(0.45), c.seat, [0, 0.624, 0.19], [0.13, 0.042, 0.1]);
    f.add(U.rbox(0.45), c.accent, [0, 0.61, 0.24], [0.09, 0.016, 0.02]);
    // chain guard (accent) on the right
    f.add(U.cyl(18), c.accent, [0.062, bb.y, bb.z], [0.092, 0.012, 0.092], RZ);
    f.add(U.rbox(0.45), c.accent, [0.062, bb.y + 0.03, (bb.z + BIKE.rearZ) / 2 + 0.01], [0.012, 0.075, 0.36], [0.06, 0, 0]);
    // mudguards
    f.add(U.torus(0.12, Math.PI * 0.55, 6, 16), c.accent, [0, R, BIKE.rearZ], [R + 0.03, R + 0.03, 0.26], [0, Math.PI / 2, Math.PI * 0.32]);
    f.add(U.rbox(0.4), 0xf0564a, [0, 0.49, BIKE.rearZ + 0.13], [0.045, 0.03, 0.012], [-0.9, 0, 0]);
    mesh(f, this.meshes, this.frame);
    // steering assembly (fork, stem, bars, grips, bell, front wheel)
    this.steer.position.set(0, 0, BIKE.steerZ);
    this.frame.add(this.steer);
    const s = new Parts();
    const z = -BIKE.steerZ;
    for (const sd of [-1, 1]) s.limb(c.frame, [sd * 0.034, 0.455, -0.355 + z], [sd * 0.046, R, BIKE.frontZ + z], 0.014);
    s.add(U.rbox(0.4), c.frame, [0, 0.462, -0.352 + z], [0.1, 0.03, 0.05]);
    s.limb(c.metal, [0, 0.6, -0.325 + z], [0, 0.73, -0.3 + z], 0.017);
    s.add(U.rbox(0.4), c.metal, [0, 0.735, -0.3 + z], [0.05, 0.035, 0.05]);
    for (const sd of [-1, 1]) {
      s.limb(c.metal, [0, 0.738, -0.3 + z], [sd * 0.12, 0.765, -0.275 + z], 0.012);
      s.limb(c.metal, [sd * 0.12, 0.765, -0.275 + z], [sd * 0.18, 0.785, -0.25 + z], 0.012);
      s.limb(c.grip, [sd * 0.18, 0.786, -0.25 + z], [sd * 0.25, 0.792, -0.243 + z], 0.022, 0.12);
      s.add(U.sphere(8, 6), c.accent2, [sd * 0.262, 0.793, -0.242 + z], [0.012, 0.025, 0.025]);
      if (streamers) {
        const cols = [c.accent, c.accent2, 0xffffff, c.accent];
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2;
          s.limb(cols[k], [sd * 0.268, 0.793 + Math.sin(a) * 0.01, -0.242 + z + Math.cos(a) * 0.01], [sd * (0.32 + k * 0.006), 0.77 + Math.sin(a) * 0.03, -0.2 + z + 0.09 + k * 0.012], 0.0045, 0, 4);
        }
      }
    }
    // bell
    s.add(U.dome(12, 6), c.accent2, [0.085, 0.785, -0.29 + z], [0.026, 0.022, 0.026]);
    s.add(U.cyl(8), c.metal, [0.085, 0.774, -0.29 + z], [0.008, 0.02, 0.008]);
    // front mudguard + reflector
    s.add(U.torus(0.12, Math.PI * 0.4, 6, 14), c.accent, [0, R, BIKE.frontZ + z], [R + 0.03, R + 0.03, 0.26], [0, Math.PI / 2, Math.PI * 0.32]);
    s.add(U.rbox(0.4), 0xf6efe2, [0, 0.64, -0.335 + z - 0.02], [0.04, 0.05, 0.012], [-0.25, 0, 0]);
    mesh(s, this.meshes, this.steer);
    this.front = mesh(wheelParts(c, R, true), this.meshes, this.steer);
    this.front.position.set(0, R, BIKE.frontZ + z);
    // crank: spindle, chainring, arms (right arm points +Y at angle 0)
    const k = new Parts();
    k.add(U.cyl(10), c.metal, [0, 0, 0], [0.014, 0.25, 0.014], RZ);
    k.add(U.torus(0.12, Math.PI * 2, 6, 24), c.metal, [0.055, 0, 0], [0.075, 0.075, 0.075], RY);
    k.limb(c.metal, [0.105, 0, 0], [0.105, BIKE.crankR, 0], 0.012);
    k.limb(c.metal, [-0.105, 0, 0], [-0.105, -BIKE.crankR, 0], 0.012);
    this.crank = mesh(k, this.meshes, this.frame);
    this.crank.position.copy(bb);
    for (let i = 0; i < 2; i++) {
      const pp = new Parts();
      pp.add(U.rbox(0.3), ink, [0, 0, 0], [0.08, 0.02, 0.055]);
      pp.add(U.rbox(0.3), i ? c.accent : c.accent2, [0, 0, 0], [0.084, 0.012, 0.03]);
      this.pedals.push(mesh(pp, this.meshes, this.frame));
    }
    this.gripsBase = this.grips.map((g) => g.clone());
  }

  /** Pedal centre (ride-local) for leg i (0 = left) at crank angle a. */
  static pedal(i: number, a: number, out: THREE.Vector3): THREE.Vector3 {
    const ang = i === 1 ? a : a + Math.PI;
    return out.set((i === 0 ? -1 : 1) * BIKE.pedalX, BIKE.bb.y + Math.cos(ang) * BIKE.crankR, BIKE.bb.z - Math.sin(ang) * BIKE.crankR);
  }

  update(dt: number, speed: number, steer: number, squash: number, crank: number): void {
    this.spin += (speed / BIKE.wheelR) * dt;
    this.rear.rotation.x = -this.spin;
    this.front.rotation.x = -this.spin;
    this.steer.rotation.y = steer;
    this.frame.position.y = -squash;
    this.crank.rotation.x = -crank;
    for (let i = 0; i < 2; i++) BikeRide.pedal(i, crank, this.pedals[i].position);
    // grips follow the steering + squash (in ride-local space)
    for (let i = 0; i < 2; i++) {
      const b = this.gripsBase[i];
      const lx = b.x;
      const lz = b.z - BIKE.steerZ;
      const c = Math.cos(steer);
      const s = Math.sin(steer);
      this.grips[i].set(lx * c + lz * s, b.y - squash, -lx * s + lz * c + BIKE.steerZ);
    }
  }
}

// ------------------------------------------------------------------ scooter
export const SCOOTER = { deckTop: 0.122, wheelR: 0.07, frontZ: -0.38, rearZ: 0.33 };

export class ScooterRide implements RideBase {
  readonly id = 'scooter' as const;
  readonly group = new THREE.Group();
  readonly pivot = new THREE.Vector3(0, 0, SCOOTER.rearZ);
  readonly meshes: THREE.Object3D[] = [];
  readonly grips: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(-0.235, 0.81, -0.275), new THREE.Vector3(0.235, 0.81, -0.275)];
  readonly deckY = SCOOTER.deckTop;
  private wheels: THREE.Mesh[] = [];
  private steer = new THREE.Group();
  private spin = 0;
  private gripsBase: THREE.Vector3[];

  constructor(c: RideColours) {
    const d = new Parts();
    const wr = SCOOTER.wheelR;
    d.add(U.rbox(0.4), c.frame, [0, 0.1, 0.0], [0.175, 0.04, 0.62], [0, 0, 0], 0.2);
    d.add(U.rbox(0.4), 0x3d4550, [0, 0.12, 0.0], [0.15, 0.006, 0.54]);
    d.add(U.rbox(0.4), c.accent, [0, 0.1235, 0.0], [0.03, 0.004, 0.5]);
    d.add(U.rbox(0.4), c.accent, [0, 0.102, 0.0], [0.18, 0.014, 0.52]);
    // neck + rear brake fender
    d.limb(c.frame, [0, 0.1, -0.27], [0, 0.17, -0.33], 0.03);
    d.add(U.torus(0.18, Math.PI * 0.6, 6, 12), c.metal, [0, wr, SCOOTER.rearZ], [wr + 0.012, wr + 0.012, 0.18], [0, Math.PI / 2, Math.PI * 0.25]);
    d.limb(c.metal, [-0.025, wr, SCOOTER.rearZ], [-0.025, 0.1, 0.27], 0.01);
    d.limb(c.metal, [0.025, wr, SCOOTER.rearZ], [0.025, 0.1, 0.27], 0.01);
    mesh(d, this.meshes, this.group);
    // steering column
    this.steer.position.set(0, 0, -0.33);
    this.group.add(this.steer);
    const s = new Parts();
    const z = 0.33;
    s.limb(c.frame, [0, 0.16, -0.33 + z], [0, 0.5, -0.305 + z], 0.024);
    s.limb(c.metal, [0, 0.48, -0.307 + z], [0, 0.8, -0.28 + z], 0.02);
    s.add(U.cyl(14), c.accent, [0, 0.42, -0.31 + z], [0.026, 0.05, 0.026], [-0.08, 0, 0]);
    s.add(U.cyl(14), c.frame, [0, 0.18, -0.33 + z], [0.03, 0.06, 0.03], [-0.08, 0, 0]);
    for (const sd of [-1, 1]) s.limb(c.metal, [sd * 0.028, 0.17, -0.335 + z], [sd * 0.028, wr, SCOOTER.frontZ + z], 0.011);
    s.limb(c.metal, [-0.27, 0.81, -0.275 + z], [0.27, 0.81, -0.275 + z], 0.016);
    for (const sd of [-1, 1]) {
      s.limb(c.grip, [sd * 0.17, 0.81, -0.275 + z], [sd * 0.285, 0.81, -0.275 + z], 0.026, 0.12);
      s.add(U.sphere(8, 6), c.accent2, [sd * 0.3, 0.81, -0.275 + z], [0.013, 0.028, 0.028]);
    }
    mesh(s, this.meshes, this.steer);
    for (let i = 0; i < 2; i++) {
      const w = new Parts();
      w.add(U.cyl(16), c.wheel, [0, 0, 0], [wr, 0.034, wr], RZ, 0.1);
      w.add(U.torus(0.25, Math.PI * 2, 6, 20), darken(c.wheel), [0, 0, 0], [wr * 0.82, wr * 0.82, 0.06], RY);
      w.add(U.cyl(12), c.rim, [0, 0, 0], [0.027, 0.04, 0.027], RZ);
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        w.add(U.sphere(6, 4), c.metal, [0, Math.sin(a) * 0.016, Math.cos(a) * 0.016], [0.022, 0.005, 0.005]);
      }
      const m = mesh(w, this.meshes, i === 0 ? this.steer : this.group);
      if (i === 0) m.position.set(0, wr, SCOOTER.frontZ + z);
      else m.position.set(0, wr, SCOOTER.rearZ);
      this.wheels.push(m);
    }
    this.gripsBase = this.grips.map((g) => g.clone());
  }

  update(dt: number, speed: number, steer: number): void {
    this.spin += (speed / SCOOTER.wheelR) * dt;
    for (const w of this.wheels) w.rotation.x = -this.spin;
    this.steer.rotation.y = steer;
    for (let i = 0; i < 2; i++) {
      const b = this.gripsBase[i];
      const lz = b.z + 0.33;
      const c = Math.cos(steer);
      const s = Math.sin(steer);
      this.grips[i].set(b.x * c + lz * s, b.y, -b.x * s + lz * c - 0.33);
    }
  }
}

function darken(c: number): number {
  const r = ((c >> 16) & 255) * 0.82;
  const g = ((c >> 8) & 255) * 0.82;
  const b = (c & 255) * 0.82;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

// ------------------------------------------------------------------ skateboard
export const SKATE = { deckTop: 0.128, wheelR: 0.04, truckZ: 0.22, half: 0.3 };

export class SkateRide implements RideBase {
  readonly id = 'skate' as const;
  readonly group = new THREE.Group();
  readonly pivot = new THREE.Vector3(0, 0.02, 0.36);
  readonly meshes: THREE.Object3D[] = [];
  readonly grips = null;
  readonly deckY = SKATE.deckTop;
  private axles: THREE.Mesh[] = [];
  private board = new THREE.Group();
  private spin = 0;

  constructor(c: RideColours, character: 'ace' | 'moana') {
    this.group.add(this.board);
    const d = new Parts();
    const y = 0.11;
    const tail = 0.3;
    const half = SKATE.half;
    d.add(U.rbox(0.45), c.frame, [0, y, 0], [0.235, 0.024, half * 2], [0, 0, 0], 0.15);
    d.add(U.rbox(0.45), c.grip, [0, y + 0.0135, 0], [0.22, 0.005, half * 2 - 0.01]);
    d.add(U.rbox(0.45), c.accent, [0, y + 0.0165, 0], [0.05, 0.003, half * 2 - 0.06]);
    for (const sx of [-1, 1]) d.add(U.rbox(0.45), c.accent2, [sx * 0.07, y + 0.0165, 0], [0.012, 0.003, half * 2 - 0.12]);
    for (const s of [-1, 1]) {
      // kicktails (nose at -Z, tail at +Z)
      const L = 0.13;
      const cz = s * (half + (L / 2) * Math.cos(tail) - 0.012);
      const cy = y + (L / 2) * Math.sin(tail) - 0.002;
      const rx = s < 0 ? tail : -tail;
      d.add(U.rbox(0.45), c.frame, [0, cy, cz], [0.235, 0.024, L], [rx, 0, 0], 0.15);
      d.add(U.rbox(0.45), c.grip, [0, cy + 0.0125 * Math.cos(tail), cz - s * 0.0125 * Math.sin(tail) * 0.3], [0.22, 0.005, L - 0.01], [rx, 0, 0]);
    }
    // underside graphic
    const uy = y - 0.0125;
    if (character === 'ace') {
      // lightning zig-zag
      const pts: [number, number][] = [[-0.06, -0.24], [0.05, -0.08], [-0.03, -0.04], [0.06, 0.12], [-0.04, 0.24]];
      for (let k = 0; k < pts.length - 1; k++) {
        const [x0, z0] = pts[k];
        const [x1, z1] = pts[k + 1];
        const len = Math.hypot(x1 - x0, z1 - z0);
        d.add(U.rbox(0.3), c.accent, [(x0 + x1) / 2, uy, (z0 + z1) / 2], [0.034, 0.004, len + 0.02], [0, Math.atan2(x1 - x0, z1 - z0), 0]);
      }
      for (const s of [-1, 1]) d.add(U.rbox(0.3), c.accent2, [0, uy, s * 0.3], [0.19, 0.004, 0.018]);
    } else {
      // flowers
      const spots: [number, number, number][] = [[0, -0.16, 0.045], [0.045, 0.04, 0.035], [-0.05, 0.16, 0.04], [-0.04, -0.02, 0.022], [0.05, 0.22, 0.02]];
      spots.forEach(([x, z, r], k) => {
        for (let p = 0; p < 5; p++) {
          const a = (p / 5) * Math.PI * 2;
          d.add(U.sphere(8, 6), k % 2 ? c.accent2 : c.accent, [x + Math.cos(a) * r * 0.8, uy, z + Math.sin(a) * r * 0.8], [r * 0.55, 0.003, r * 0.55]);
        }
        d.add(U.sphere(8, 6), 0xfff4e0, [x, uy - 0.0005, z], [r * 0.4, 0.0035, r * 0.4]);
      });
    }
    // trucks
    for (const s of [-1, 1]) {
      const tz = s * SKATE.truckZ;
      d.add(U.rbox(0.3), c.metal, [0, 0.09, tz], [0.06, 0.016, 0.075]);
      d.add(U.rbox(0.3), c.metal, [0, 0.07, tz + s * 0.008], [0.04, 0.034, 0.03], [s * 0.35, 0, 0]);
      d.limb(c.metal, [-0.1, SKATE.wheelR + 0.004, tz], [0.1, SKATE.wheelR + 0.004, tz], 0.012);
      d.add(U.cyl(10), c.accent, [0, 0.078, tz], [0.016, 0.012, 0.016]);
    }
    mesh(d, this.meshes, this.board);
    for (const s of [-1, 1]) {
      const w = new Parts();
      for (const sx of [-1, 1]) {
        w.add(U.cyl(14), c.wheel, [sx * 0.118, 0, 0], [SKATE.wheelR, 0.038, SKATE.wheelR], RZ, 0.15);
        w.add(U.cyl(10), c.metal, [sx * 0.118, 0, 0], [0.014, 0.04, 0.014], RZ);
      }
      const m = mesh(w, this.meshes, this.board);
      m.position.set(0, SKATE.wheelR, s * SKATE.truckZ);
      this.axles.push(m);
    }
  }

  update(dt: number, speed: number, steer: number): void {
    this.spin += (speed / SKATE.wheelR) * dt;
    for (const a of this.axles) a.rotation.x = -this.spin;
    // trucks turn a little when carving
    this.axles[0].rotation.y = steer * 0.6;
    this.axles[1].rotation.y = -steer * 0.6;
  }
}

/** Running shoes: no vehicle, an empty group. */
export class ShoesRide implements RideBase {
  readonly id = 'shoes' as const;
  readonly group = new THREE.Group();
  readonly pivot = new THREE.Vector3();
  readonly meshes: THREE.Object3D[] = [];
  readonly grips = null;
  readonly deckY = 0;
  update(): void {}
}

export type Ride = BikeRide | ScooterRide | SkateRide | ShoesRide;

export function buildRide(id: RideId, colours: Record<Exclude<RideId, 'shoes'>, RideColours>, character: 'ace' | 'moana'): Ride {
  switch (id) {
    case 'bike':
      return new BikeRide(colours.bike, character === 'moana');
    case 'scooter':
      return new ScooterRide(colours.scooter);
    case 'skate':
      return new SkateRide(colours.skate, character);
    default:
      return new ShoesRide();
  }
}
