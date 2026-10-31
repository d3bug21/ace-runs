// Ace + Moana avatars on four rides. createAvatar(character, ride) implements the Avatar
// contract: a procedural rig (merged vertex-coloured parts per bone, IK legs/arms), per-ride
// locomotion (run / pedal / kick-push / push-carve), layered overlays (lean, jump, slide,
// land, bump, boost, sleepy, wobble, mood, flex, celebrate, menu idle) and an expressive face.
import * as THREE from 'three';
import type { AnchorName, Avatar, AvatarMotion, CharacterId, Expression, RideId, TeethState } from '../contracts';
import { buildRig, type Rig } from './body';
import { solveTwoBone, type TwoBoneResult } from './ik';
import { ARM, copyPose, FOOT, lerpPose, newPose, type Pose } from './pose';
import { BIKE, BikeRide, buildRide, type Ride, SCOOTER, SKATE } from './rides';
import { DIM, SPECS, type CharSpec } from './spec';

export { SPECS } from './spec';

const ANK = DIM.ankle;
const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const smooth = (t: number): number => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};
const frac = (x: number): number => x - Math.floor(x);
const damp = (a: number, b: number, k: number, dt: number): number => a + (b - a) * (1 - Math.exp(-k * dt));
/** 0..1..0 bump over [a, b]. */
const bump = (u: number, a: number, b: number): number => (u <= a || u >= b ? 0 : Math.sin(((u - a) / (b - a)) * Math.PI));

// scratch
const vA = new THREE.Vector3();
const vB = new THREE.Vector3();
const vPole = new THREE.Vector3();
const qA = new THREE.Quaternion();
const qB = new THREE.Quaternion();
const qC = new THREE.Quaternion();
const eA = new THREE.Euler();
const ik: TwoBoneResult = { upper: new THREE.Quaternion(), bend: 0 };
const mA = new THREE.Matrix4();
const IDENT = new THREE.Quaternion();
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);

const LEAN: Record<RideId, [number, number]> = {
  shoes: [0.024, 0.24],
  bike: [0.042, 0.4],
  scooter: [0.034, 0.32],
  skate: [0.036, 0.34],
};

let avatarSeed = 1;

class AvatarImpl implements Avatar {
  readonly root = new THREE.Group();
  readonly character: CharacterId;
  readonly ride: RideId;
  readonly height: number;

  private spec: CharSpec;
  private rig: Rig;
  private rideObj: Ride;
  private anchors = new Map<AnchorName, THREE.Object3D>();
  private feetAnchor = new THREE.Object3D();
  private P = newPose();
  private Q = newPose();
  private R = newPose();

  // clocks + smoothed motion weights
  private t = 0;
  private phase = 0;
  private crank = 0;
  private kick = 0;
  private pushClock = 0;
  private pushT = -1;
  private speedS = 0;
  private lat = 0;
  private w = { air: 0, slide: 0, menu: 0, cele: 0, flex: 0, boost: 0, sleepy: 0, wobble: 0, mood: 0, run: 0 };
  private m: AvatarMotion | null = null;

  // expression
  private explicitExpr: Expression = 'happy';
  private explicitT = 0;
  private menuGrinT = 3;
  // hair spring
  private hairPrev = new THREE.Vector3();
  private hairVel = new THREE.Vector3();
  private hairAng = new THREE.Vector2();
  private hairAngV = new THREE.Vector2();
  private hairInit = false;
  private visibleFlag = true;
  /** Closed-loop slide ceiling guard (extra crouch, radians-ish). */
  private slideFix = 0;
  private duckDir = 0;
  private ownedGeos = new Set<THREE.BufferGeometry>();

  constructor(character: CharacterId, ride: RideId) {
    this.character = character;
    this.ride = ride;
    this.spec = SPECS[character];
    const seed = (avatarSeed++ * 7919 + (character === 'ace' ? 11 : 23)) >>> 0;
    this.rig = buildRig(this.spec, seed);
    this.rideObj = buildRide(ride, this.spec.rides, character);
    this.height = this.spec.height;
    this.root.name = `avatar-${character}-${ride}`;
    this.root.add(this.rig.rideRoot);
    this.rig.rideRoot.add(this.rideObj.group);
    this.root.add(this.feetAnchor);
    this.buildAnchors();
    for (const o of [...this.rig.meshes, ...this.rideObj.meshes]) {
      const me = o as THREE.Mesh;
      if (me.isMesh && me.geometry && !me.geometry.userData.shared) this.ownedGeos.add(me.geometry);
    }
    // settle into a valid pose immediately
    this.update({ time: 0, dt: 1 / 60, speed: 0, lateral: 0, airborne: false, vy: 0, jumpT: -1, sliding: false, slideT: -1, landT: 999, bumpT: 999, boost: 0, sleepy: 0, wobble: 0, mood: 0, flex: 0, celebrate: 0, menu: true });
  }

  private buildAnchors(): void {
    const r = this.rig;
    const mk = (name: AnchorName, parent: THREE.Object3D, x: number, y: number, z: number) => {
      const o = new THREE.Object3D();
      o.name = `anchor-${name}`;
      o.position.set(x, y, z);
      parent.add(o);
      this.anchors.set(name, o);
    };
    mk('head', r.head, 0, DIM.headC, 0);
    mk('aboveHead', r.head, 0, r.headTop + 0.16, 0);
    this.anchors.set('eyeL', r.face.eyeL);
    this.anchors.set('eyeR', r.face.eyeR);
    this.anchors.set('mouth', r.face.mouth);
    mk('chest', r.spine, 0, 0.2, -0.13);
    mk('tummy', r.spine, 0, 0.06, -0.13);
    mk('back', r.spine, 0, 0.16, 0.13);
    mk('armL', r.shoulder[0], 0, -0.08, 0);
    mk('armR', r.shoulder[1], 0, -0.08, 0);
    this.anchors.set('handL', r.hand[0]);
    this.anchors.set('handR', r.hand[1]);
    mk('legL', r.shin[0], 0, -0.04, 0);
    mk('legR', r.shin[1], 0, -0.04, 0);
    this.feetAnchor.name = 'anchor-feet';
    this.anchors.set('feet', this.feetAnchor);
  }

  anchor(name: AnchorName): THREE.Object3D {
    return this.anchors.get(name)!;
  }

  setExpression(e: Expression, holdSeconds = 1.2): void {
    this.explicitExpr = e;
    this.explicitT = e === 'happy' ? 0 : Math.max(0.05, holdSeconds);
  }

  setTeeth(t: TeethState): void {
    this.rig.face.setTeeth(t);
  }

  setEyeSparkle(v: number): void {
    this.rig.face.setSparkle(v);
  }

  setBlink(visible: boolean): void {
    if (visible === this.visibleFlag) return;
    this.visibleFlag = visible;
    for (const o of this.rig.meshes) o.visible = visible;
    for (const o of this.rideObj.meshes) o.visible = visible;
    this.rig.face.setHidden(!visible);
    if (visible && this.m) this.update({ ...this.m, dt: 0 });
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const g of this.ownedGeos) g.dispose();
    this.rig.face.dispose();
  }

  // ================================================================== update
  update(m: AvatarMotion): void {
    this.m = m;
    const dt = clamp(m.dt, 0, 0.05);
    this.t += dt;
    const w = this.w;
    w.air = damp(w.air, m.airborne ? 1 : 0, m.airborne ? 16 : 22, dt);
    w.slide = damp(w.slide, m.sliding ? 1 : 0, m.sliding ? 18 : 12, dt);
    w.menu = damp(w.menu, m.menu ? 1 : 0, 6, dt);
    w.cele = damp(w.cele, clamp(m.celebrate, 0, 1), 6, dt);
    w.flex = damp(w.flex, clamp(m.flex, 0, 1), 8, dt);
    w.boost = damp(w.boost, clamp(m.boost, 0, 1), 5, dt);
    w.sleepy = damp(w.sleepy, clamp(m.sleepy, 0, 1), 4, dt);
    w.wobble = damp(w.wobble, clamp(m.wobble, 0, 1), 4, dt);
    w.mood = damp(w.mood, clamp(m.mood, -1, 1), 3, dt);
    this.speedS = damp(this.speedS, m.menu ? 0 : Math.max(0, m.speed), 6, dt);
    w.run = damp(w.run, m.menu ? 0 : smooth(this.speedS / 2.5), 8, dt);
    this.lat = damp(this.lat, m.lateral, 9, dt);

    const P = this.P;
    this.locomotion(P, dt, m);
    this.overlays(P, dt, m);
    this.apply(P, dt, m);
    this.updateFace(dt, m);
  }

  // ------------------------------------------------------------------ base locomotion
  private locomotion(P: Pose, dt: number, m: AvatarMotion): void {
    const Q = this.Q;
    const R = this.R;
    const ride = this.ride;
    // moving pose
    if (ride === 'shoes') {
      this.standShoes(R);
      this.runShoes(P, dt);
      // blend stand -> run by speed
      copyPose(Q, P);
      copyPose(P, R);
      lerpPose(P, Q, this.w.run);
    } else if (ride === 'bike') this.rideBike(P, dt, m);
    else if (ride === 'scooter') this.rideScooter(P, dt, m);
    else this.rideSkate(P, dt, m);
    // menu idle
    if (this.w.menu > 0.002) {
      copyPose(Q, P);
      if (ride === 'shoes') this.menuShoes(Q);
      else if (ride === 'bike') this.menuBike(Q, dt);
      else if (ride === 'scooter') this.menuScooter(Q);
      else this.menuSkate(Q);
      lerpPose(P, Q, this.w.menu);
    }
  }

  private resetPose(P: Pose): void {
    for (const k in P) P[k as keyof Pose] = 0;
  }

  private standShoes(P: Pose): void {
    this.resetPose(P);
    const t = this.t;
    const br = Math.sin(t * 2.2);
    P.hy = DIM.hipH - 0.018 + br * 0.004;
    P.sPitch = 0.02;
    P.nPitch = -0.02 + br * 0.01;
    for (let i = 0; i < 2; i++) {
      const s = i ? 1 : -1;
      const F = FOOT[i];
      P[F.x] = s * 0.1;
      P[F.y] = ANK;
      P[F.z] = 0.0;
      P[F.yaw] = -s * 0.12;
      const A = ARM[i];
      P[A.z] = s * 0.13;
      P[A.x] = 0.08;
      P[A.e] = 0.28;
    }
  }

  private runShoes(P: Pose, dt: number): void {
    this.resetPose(P);
    const p = this.spec.p;
    const w = this.w;
    const s = this.speedS;
    const b = w.boost;
    const sl = w.sleepy;
    const mood = w.mood;
    const freq = clamp(1.25 + s * 0.085, 1.1, 2.9) * p.cadence * (1 + 0.3 * b) * (1 - 0.38 * sl) * (1 - 0.15 * w.wobble);
    this.phase += freq * dt;
    const ph = this.phase;
    const bounce = p.bounce * (1 + 0.25 * Math.max(0, mood) - 0.35 * Math.max(0, -mood)) * (1 - 0.45 * sl);
    const duty = 0.42;
    const zF = -0.15 - 0.04 * b;
    const zB = 0.19 + 0.02 * b;
    const H = (0.15 + 0.06 * bounce) * (1 - 0.4 * sl);
    for (let i = 0; i < 2; i++) {
      const side = i ? 1 : -1;
      const q = frac(ph + i * 0.5);
      let y: number;
      let z: number;
      let pitch: number;
      if (q < duty) {
        const u = q / duty;
        z = lerp(zF, zB, u);
        const lift = Math.max(0, u - 0.72) / 0.28;
        y = ANK + lift * 0.045;
        pitch = u < 0.15 ? 0.25 * (1 - u / 0.15) : -lift * 0.6;
      } else {
        const u = (q - duty) / (1 - duty);
        z = lerp(zB, zF, smooth(u));
        y = ANK + 0.045 * (1 - u) * (1 - u) + H * Math.sin(Math.PI * Math.pow(u, 0.8));
        pitch = lerp(-0.75, 0.3, smooth(u));
      }
      const F = FOOT[i];
      P[F.x] = side * 0.078;
      P[F.y] = y;
      P[F.z] = z;
      P[F.p] = pitch;
    }
    const t2 = frac(2 * ph);
    const A = 0.045 * bounce;
    P.hy = 0.452 + A * (0.5 + 0.5 * Math.cos(TAU * (t2 - 0.92))) - 0.03 * sl;
    P.hx = -Math.sin(TAU * (ph + 0.04)) * 0.014 * p.sway;
    P.hRoll = -0.05 * p.sway * Math.sin(TAU * ph);
    P.sRoll = 0.6 * -P.hRoll;
    const c = Math.cos(TAU * ph);
    P.hYaw = -0.11 * c;
    P.sYaw = 0.2 * c * p.arms;
    P.nYaw = -0.12 * c;
    P.fLyaw = P.hYaw * 0.6 + 0.08;
    P.fRyaw = P.hYaw * 0.6 - 0.08;
    P.sPitch = 0.12 + 0.012 * s + 0.24 * b + 0.12 * sl;
    P.nPitch = -0.55 * P.sPitch + 0.035 * Math.sin(2 * TAU * ph + 0.5);
    const amp = (0.75 + 0.35 * b) * p.arms * (1 - 0.5 * sl) * (1 + 0.15 * mood);
    P.aLx = 0.1 - amp * c;
    P.aRx = 0.1 + amp * c;
    P.aLz = -0.16 - 0.05 * b;
    P.aRz = 0.16 + 0.05 * b;
    P.aLy = 0.15 * p.sway;
    P.aRy = -0.15 * p.sway;
    const eb = 1 - 0.45 * sl;
    P.eL = (1.25 + 0.45 * Math.max(0, -c)) * eb;
    P.eR = (1.25 + 0.45 * Math.max(0, c)) * eb;
  }

  /** Right-arm wave (mirrored for left with side = -1). */
  private wave(P: Pose, i: number, k: number): void {
    if (k <= 0) return;
    const A = ARM[i];
    const s = i ? 1 : -1;
    const t = this.t;
    P[A.z] = lerp(P[A.z], s * 1.6, k);
    P[A.y] = lerp(P[A.y], -s * Math.PI / 2, k);
    P[A.x] = lerp(P[A.x], 0.25, k);
    P[A.e] = lerp(P[A.e], 0.9 + 0.36 * Math.sin(t * 10), k);
    P[A.ik] = P[A.ik] * (1 - k);
    P.nRoll += -s * 0.1 * k;
  }

  private waveK(period: number, start: number, len: number): number {
    const u = frac(this.t / period) * period;
    return smooth((u - start) / 0.3) * (1 - smooth((u - start - len) / 0.3));
  }

  private lookAround(P: Pose): void {
    const t = this.t;
    P.nYaw += 0.32 * Math.sin(t * 0.55) + 0.12 * Math.sin(t * 1.37);
    P.nPitch += -0.06 + 0.05 * Math.sin(t * 0.8);
  }

  private menuShoes(P: Pose): void {
    this.resetPose(P);
    const t = this.t;
    const ace = this.character === 'ace';
    for (let i = 0; i < 2; i++) {
      const s = i ? 1 : -1;
      const F = FOOT[i];
      P[F.x] = s * (ace ? 0.1 : 0.115);
      P[F.y] = ANK;
      P[F.yaw] = -s * 0.15;
      const A = ARM[i];
      P[A.z] = s * 0.14;
      P[A.x] = 0.05;
      P[A.e] = 0.35;
    }
    if (ace) {
      // bouncing on his toes, ready to go
      const bo = Math.abs(Math.sin(t * 3.4));
      P.hy = DIM.hipH - 0.03 + 0.03 * bo;
      P.fLy = P.fRy = ANK + 0.022 * bo;
      P.fLp = P.fRp = -0.22 * bo;
      P.aLx = 0.2 * Math.sin(t * 3.4);
      P.aRx = -0.2 * Math.sin(t * 3.4);
      P.eL = P.eR = 0.7;
      P.sPitch = 0.04;
      this.lookAround(P);
      this.wave(P, 1, this.waveK(6.5, 0.6, 1.8));
    } else {
      // swishy hip sway, hand on hip
      const sw = Math.sin(t * 1.7);
      P.hy = DIM.hipH - 0.025;
      P.hx = 0.028 * sw;
      P.hRoll = -0.075 * sw;
      P.sRoll = 0.05 * sw;
      P.nRoll = 0.1 * Math.sin(t * 0.9) - 0.04 * sw;
      P.aLz = -0.78;
      P.aLy = -1.45;
      P.aLx = -0.15;
      P.eL = 1.9;
      this.lookAround(P);
      this.wave(P, 1, this.waveK(7, 1.0, 1.8));
    }
  }

  // ------------------------------------------------------------------ bike
  private rideBike(P: Pose, dt: number, m: AvatarMotion): void {
    this.resetPose(P);
    const p = this.spec.p;
    const w = this.w;
    const s = this.speedS;
    const b = w.boost;
    const sl = w.sleepy;
    const coast = m.airborne || m.sliding || m.menu;
    if (!coast) {
      const rate = clamp(0.9 + s * 0.075, 0.7, 2.3) * (1 + 0.5 * b) * (1 - 0.4 * sl) * (s < 0.2 ? 0.0 : 1);
      this.crank += TAU * rate * dt;
    } else if (!m.menu) {
      // freewheel: pedals glide to level
      const tgt = Math.round((this.crank - Math.PI / 2) / Math.PI) * Math.PI + Math.PI / 2;
      this.crank = damp(this.crank, tgt, 10, dt);
    }
    this.pedalFeet(P);
    const seat = BIKE.seat;
    P.hy = seat.y + 0.09 * b;
    P.hz = seat.z - 0.1 * b;
    P.hRoll = 0.04 * Math.sin(this.crank) * p.sway + 0.06 * b * Math.sin(this.crank);
    P.rideRoll = 0.12 * b * Math.sin(this.crank);
    P.sPitch = 0.45 + 0.25 * b + 0.08 * sl;
    P.nPitch = -0.4 - 0.1 * b + 0.35 * sl;
    P.ikL = P.ikR = 1;
    this.gripsToPose(P);
    P.aLz = -0.2;
    P.aRz = 0.2;
    P.aLx = P.aRx = 0.9;
    P.eL = P.eR = 0.5;
    P.steer = -this.lat * 0.03 + 0.02 * Math.sin(this.t * 2.1) * (s > 0.5 ? 1 : 0);
  }

  private pedalFeet(P: Pose): void {
    for (let i = 0; i < 2; i++) {
      BikeRide.pedal(i, this.crank, vA);
      const F = FOOT[i];
      P[F.x] = vA.x * 0.92;
      P[F.y] = vA.y + 0.094;
      P[F.z] = vA.z + 0.07;
      P[F.r] = 1;
      const a = i === 1 ? this.crank : this.crank + Math.PI;
      P[F.p] = -0.12 - 0.22 * Math.sin(a);
      P[F.yaw] = 0;
    }
  }

  private gripsToPose(P: Pose): void {
    const g = this.rideObj.grips;
    if (!g) return;
    P.gLx = g[0].x;
    P.gLy = g[0].y;
    P.gLz = g[0].z;
    P.gRx = g[1].x;
    P.gRy = g[1].y;
    P.gRz = g[1].z;
  }

  private menuBike(P: Pose, dt: number): void {
    const ace = this.character === 'ace';
    this.crank = damp(this.crank, 0.85, 4, dt);
    this.pedalFeet(P);
    // left foot down on the ground, bike leaning onto it
    const roll = 0.075;
    const fx = -0.27;
    P.rootRoll = roll;
    P.fLx = fx;
    P.fLz = 0.08;
    P.fLy = (ANK - fx * Math.sin(roll)) / Math.cos(roll);
    P.fLr = 0;
    P.fLp = 0;
    P.fLyaw = 0.2;
    const t = this.t;
    P.hx = -0.015;
    P.hy = BIKE.seat.y + 0.005 + (ace ? 0.012 * Math.abs(Math.sin(t * 3)) : 0);
    P.hz = BIKE.seat.z;
    P.hRoll = -0.05;
    P.rideRoll = 0;
    P.sPitch = 0.3;
    P.sRoll = -0.03;
    P.nPitch = -0.3;
    P.nRoll = ace ? 0 : 0.08 * Math.sin(t * 0.9);
    this.lookAround(P);
    P.ikL = P.ikR = 1;
    this.gripsToPose(P);
    this.wave(P, 1, this.waveK(ace ? 6.5 : 7, ace ? 1.2 : 2, 1.8));
    P.steer = 0.12 + 0.05 * Math.sin(t * 0.7);
  }

  // ------------------------------------------------------------------ scooter
  private rideScooter(P: Pose, dt: number, m: AvatarMotion): void {
    this.resetPose(P);
    const p = this.spec.p;
    const w = this.w;
    const s = this.speedS;
    const b = w.boost;
    const sl = w.sleepy;
    const kickI = p.stance === 1 ? 1 : 0;
    const deckI = 1 - kickI;
    const ks = kickI ? 1 : -1;
    const rate = (0.8 + s * 0.025) * (1 + 0.45 * b) * (1 - 0.4 * sl);
    if (!m.airborne && !m.sliding && s > 0.3) this.kick += rate * dt;
    else if (frac(this.kick) < 0.8) this.kick += rate * dt * 1.6; // finish the kick, return to the deck
    const u = s > 0.3 || frac(this.kick) < 0.8 ? frac(this.kick) : 0.9;
    const deckY = SCOOTER.deckTop + ANK;
    // deck foot
    const D = FOOT[deckI];
    P[D.x] = -ks * 0.028;
    P[D.y] = deckY;
    P[D.z] = -0.07;
    P[D.r] = 1;
    P[D.yaw] = ks * 0.12;
    // kick foot
    const K = FOOT[kickI];
    const back = vA.set(ks * 0.03, deckY, 0.17);
    const plant = vB.set(ks * 0.16, ANK, -0.03);
    let x: number, y: number, z: number, r: number, pitch = 0;
    if (u < 0.12) {
      const v = smooth(u / 0.12);
      x = lerp(back.x, plant.x, v);
      y = lerp(back.y, plant.y, v) + 0.05 * Math.sin(Math.PI * v);
      z = lerp(back.z, plant.z, v);
      r = 1 - v;
    } else if (u < 0.44) {
      const v = (u - 0.12) / 0.32;
      x = plant.x;
      y = ANK;
      z = lerp(plant.z, 0.24, v);
      r = 0;
      pitch = -0.35 * smooth((v - 0.6) / 0.4);
    } else if (u < 0.62) {
      const v = smooth((u - 0.44) / 0.18);
      x = lerp(plant.x, ks * 0.11, v);
      y = ANK + 0.16 * v;
      z = lerp(0.24, 0.38, v);
      r = 0;
      pitch = -0.4 - 0.2 * v;
    } else if (u < 0.8) {
      const v = smooth((u - 0.62) / 0.18);
      x = lerp(ks * 0.11, back.x, v);
      y = lerp(ANK + 0.16, back.y, v) + 0.04 * Math.sin(Math.PI * v);
      z = lerp(0.38, back.z, v);
      r = v;
      pitch = lerp(-0.6, 0, v);
    } else {
      x = back.x;
      y = back.y;
      z = back.z;
      r = 1;
    }
    P[K.x] = x;
    P[K.y] = y;
    P[K.z] = z;
    P[K.r] = r;
    P[K.p] = pitch;
    P[K.yaw] = ks * 0.05;
    const dip = bump(u, 0.04, 0.52);
    P.hx = ks * 0.012;
    P.hy = 0.618 - 0.115 * dip;
    P.hz = 0.03 + 0.03 * dip;
    P.hYaw = -ks * 0.1;
    P.hRoll = -ks * 0.05 * dip;
    P.sPitch = 0.2 + 0.18 * dip + 0.2 * b + 0.1 * sl;
    P.nPitch = -0.18 - 0.12 * dip + 0.3 * sl;
    P.ikL = P.ikR = 1;
    this.gripsToPose(P);
    P.aLx = P.aRx = 0.9;
    P.eL = P.eR = 0.5;
    P.steer = -this.lat * 0.03;
  }

  private menuScooter(P: Pose): void {
    const p = this.spec.p;
    const kickI = p.stance === 1 ? 1 : 0;
    const ks = kickI ? 1 : -1;
    const t = this.t;
    const ace = this.character === 'ace';
    const K = FOOT[kickI];
    P[K.x] = ks * 0.2;
    P[K.y] = ANK;
    P[K.z] = 0.02;
    P[K.r] = 0;
    P[K.p] = 0;
    P[K.yaw] = ks * 0.25;
    P.hy = 0.565 + (ace ? 0.015 * Math.abs(Math.sin(t * 3.2)) : 0.006 * Math.sin(t * 1.8));
    P.hx = ks * 0.03;
    P.hz = 0.04;
    P.hRoll = ks * 0.05;
    P.sPitch = 0.12;
    P.sRoll = ace ? 0 : 0.04 * Math.sin(t * 1.8);
    P.nPitch = -0.1;
    P.rootRoll = -ks * 0.03;
    this.lookAround(P);
    P.ikL = P.ikR = 1;
    this.gripsToPose(P);
    this.wave(P, kickI, this.waveK(ace ? 6.5 : 7, ace ? 1 : 1.8, 1.8));
    P.steer = 0.1 * Math.sin(t * 0.6);
  }

  // ------------------------------------------------------------------ skateboard
  private skateCruise(P: Pose): void {
    const st = this.spec.p.stance;
    const frontI = st === 1 ? 0 : 1;
    const backI = 1 - frontI;
    const yaw0 = -st * Math.PI / 2;
    const deckY = SKATE.deckTop + ANK;
    const t = this.t;
    P.hy = 0.575 + 0.008 * Math.sin(t * 2.3);
    P.hz = 0.01;
    P.hYaw = yaw0 + st * 0.12;
    P.sPitch = 0.16;
    P.sYaw = st * 0.26;
    P.nYaw = st * 1.12;
    P.nPitch = -0.12;
    const Fr = FOOT[frontI];
    const Bk = FOOT[backI];
    P[Fr.x] = 0;
    P[Fr.y] = deckY;
    P[Fr.z] = -0.16;
    P[Fr.r] = 1;
    P[Fr.yaw] = yaw0 + st * 0.35;
    P[Bk.x] = 0;
    P[Bk.y] = deckY;
    P[Bk.z] = 0.19;
    P[Bk.r] = 1;
    P[Bk.yaw] = yaw0 - st * 0.1;
    // arms relaxed out for balance; leading arm a bit higher
    const AF = ARM[frontI];
    const AB = ARM[backI];
    const sf = frontI ? 1 : -1;
    P[AF.z] = sf * 0.62 + sf * 0.06 * Math.sin(t * 1.4);
    P[AF.x] = 0.25;
    P[AF.e] = 0.45;
    P[AB.z] = -sf * 0.42;
    P[AB.x] = -0.15;
    P[AB.e] = 0.55;
    P.rideRoll += 0.035 * Math.sin(t * 1.4);
    P.rootYaw += 0.03 * Math.sin(t * 1.4 - 0.5);
  }

  private rideSkate(P: Pose, dt: number, m: AvatarMotion): void {
    this.resetPose(P);
    const st = this.spec.p.stance;
    const frontI = st === 1 ? 0 : 1;
    const backI = 1 - frontI;
    const b = this.w.boost;
    const s = this.speedS;
    this.skateCruise(P);
    // periodic push
    if (this.pushT < 0) {
      this.pushClock += dt;
      const every = (2.4 - 0.9 * b) * (1 + 0.6 * this.w.sleepy);
      if (s > 0.5 && !m.airborne && !m.sliding && this.pushClock > every) {
        this.pushT = 0;
        this.pushClock = 0;
      }
    }
    if (this.pushT >= 0) {
      this.pushT += dt * (1 + 0.3 * b);
      const u = this.pushT / 1.0;
      if (u >= 1 || m.airborne) this.pushT = -1;
      else {
        const turn = smooth(u / 0.18) * (1 - smooth((u - 0.78) / 0.22));
        P.hYaw = lerp(P.hYaw, -st * 0.28, turn);
        P.sYaw = lerp(P.sYaw, st * 0.05, turn);
        P.nYaw = lerp(P.nYaw, st * 0.2, turn);
        const Fr = FOOT[frontI];
        P[Fr.yaw] = lerp(P[Fr.yaw], -st * 0.12, turn);
        P[Fr.z] = lerp(P[Fr.z], -0.1, turn);
        const Bk = FOOT[backI];
        const sideX = st * 0.17;
        const bx = P[Bk.x];
        const by = P[Bk.y];
        const bz = P[Bk.z];
        let x = bx, y = by, z = bz, r = 1, pitch = 0;
        if (u < 0.15) {
          /* still on the board */
        } else if (u < 0.3) {
          const v = smooth((u - 0.15) / 0.15);
          x = lerp(bx, sideX, v);
          y = lerp(by, ANK, v) + 0.05 * Math.sin(Math.PI * v);
          z = lerp(bz, -0.02, v);
          r = 1 - v;
        } else if (u < 0.62) {
          const v = (u - 0.3) / 0.32;
          x = sideX;
          y = ANK;
          z = lerp(-0.02, 0.27, v);
          r = 0;
          pitch = -0.35 * smooth((v - 0.6) / 0.4);
        } else if (u < 0.82) {
          const v = smooth((u - 0.62) / 0.2);
          x = lerp(sideX, bx, v);
          y = lerp(ANK, by, v) + 0.08 * Math.sin(Math.PI * v);
          z = lerp(0.27, bz, v);
          r = v;
          pitch = lerp(-0.4, 0, v);
        }
        P[Bk.x] = x;
        P[Bk.y] = y;
        P[Bk.z] = z;
        P[Bk.r] = r;
        P[Bk.p] = pitch;
        P[Bk.yaw] = lerp(P[Bk.yaw], -st * 0.2, turn);
        const dip = bump(u, 0.16, 0.72);
        P.hy -= 0.1 * dip;
        P.hz += 0.03 * dip;
        P.sPitch += 0.16 * dip;
        // arms swing naturally while pushing
        P.aLz = lerp(P.aLz, -0.2, turn);
        P.aRz = lerp(P.aRz, 0.2, turn);
        P.aLx = lerp(P.aLx, 0.3 * Math.sin(u * TAU), turn);
        P.aRx = lerp(P.aRx, -0.3 * Math.sin(u * TAU), turn);
      }
    }
    P.steer = -this.lat * 0.02 + P.rideRoll;
  }

  private menuSkate(P: Pose): void {
    // one foot on the board, the other on the ground, facing forward (reads well front-on)
    const st = this.spec.p.stance;
    const frontI = st === 1 ? 0 : 1;
    const backI = 1 - frontI;
    const t = this.t;
    const ace = this.character === 'ace';
    const deckY = SKATE.deckTop + ANK;
    P.hYaw = -st * 0.22;
    P.sYaw = st * 0.12;
    P.nYaw = st * 0.08;
    P.hy = 0.55 + (ace ? 0.014 * Math.abs(Math.sin(t * 3.2)) : 0.006 * Math.sin(t * 1.7));
    P.hx = st * 0.05;
    P.hz = 0;
    P.hRoll = st * 0.05;
    P.sPitch = 0.06;
    P.nPitch = -0.05;
    const Fr = FOOT[frontI];
    P[Fr.x] = 0;
    P[Fr.y] = deckY;
    P[Fr.z] = -0.12;
    P[Fr.r] = 1;
    P[Fr.yaw] = -st * 0.15;
    P[Fr.p] = 0;
    const Bk = FOOT[backI];
    P[Bk.x] = st * 0.2;
    P[Bk.y] = ANK;
    P[Bk.z] = 0.06;
    P[Bk.r] = 0;
    P[Bk.p] = 0;
    P[Bk.yaw] = -st * 0.3;
    for (let i = 0; i < 2; i++) {
      const A = ARM[i];
      const s = i ? 1 : -1;
      P[A.z] = s * 0.14;
      P[A.x] = 0.05;
      P[A.y] = 0;
      P[A.e] = 0.4;
    }
    if (!ace) {
      // hand on hip
      P.aLz = -0.78;
      P.aLy = -1.45;
      P.aLx = -0.15;
      P.eL = 1.9;
    }
    P.rideYaw = 0.05 * Math.sin(t * 1.1);
    P.rideRoll = 0;
    P.rootYaw = 0;
    this.lookAround(P);
    this.wave(P, 1, this.waveK(ace ? 6.5 : 7, ace ? 1 : 2.2, 1.8));
  }

  // ------------------------------------------------------------------ overlays
  /** Start an overlay layer: Q = copy of P (returns false when the weight is ~0). */
  private beginLayer(P: Pose, w: number): boolean {
    if (w < 0.002) return false;
    copyPose(this.Q, P);
    return true;
  }

  private endLayer(P: Pose, w: number): void {
    lerpPose(P, this.Q, w);
  }

  private overlays(P: Pose, dt: number, m: AvatarMotion): void {
    const w = this.w;
    const ride = this.ride;
    const t = this.t;
    const p = this.spec.p;
    const st = p.stance;
    // ---- lane-change lean (into the turn)
    const [k, max] = LEAN[ride];
    const lean = -clamp(this.lat * k, -max, max) * (1 - 0.6 * w.menu) * (1 - 0.65 * w.slide);
    P.rootRoll += lean;
    P.rootYaw += -clamp(this.lat * 0.012, -0.15, 0.15);
    P.nRoll += -lean * 0.45;
    if (ride === 'shoes') P.sRoll += lean * 0.35;
    if (ride === 'skate') {
      P.rideRoll += lean * 0.55;
      P.steer += lean * 0.6;
    }
    if (ride === 'bike' || ride === 'scooter') P.steer += -lean * 0.15;

    // ---- mood: perkier or droopier posture
    const md = w.mood;
    if (md < 0) {
      P.nPitch += 0.18 * -md;
      P.sPitch += 0.08 * -md;
      P.aLz *= 1 + 0.4 * md;
      P.aRz *= 1 + 0.4 * md;
    } else {
      P.nPitch -= 0.05 * md;
      P.hy += 0.006 * md * Math.abs(Math.sin(t * 6));
    }

    // ---- sleepy: drooping head, lazy slump (+ yawns from the face)
    const sl = w.sleepy;
    if (sl > 0.002) {
      P.nPitch += sl * (0.24 + 0.07 * Math.sin(t * 1.4));
      P.nRoll += sl * 0.12 * Math.sin(t * 0.7);
      P.sPitch += sl * 0.1;
      P.hy -= sl * 0.015;
    }
    const yawn = this.rig.face.yawn;
    if (yawn > 0) {
      P.nPitch -= 0.45 * yawn;
      P.sPitch -= 0.08 * yawn;
    }

    // ---- wobble: gentle side-to-side sway (tummy ache), hand on tummy
    const wb = w.wobble;
    if (wb > 0.002) {
      const ph = t * 4.6;
      P.hx += 0.035 * Math.sin(ph) * wb;
      P.hRoll += 0.1 * Math.sin(ph) * wb;
      P.sRoll += -0.16 * Math.sin(ph + 0.5) * wb;
      P.nRoll += 0.1 * Math.sin(ph + 1.1) * wb;
      P.rideRoll += ride === 'shoes' ? 0 : 0.05 * Math.sin(ph) * wb;
      if (ride === 'shoes' || ride === 'skate') {
        // left hand rubs the tummy
        const k2 = wb * (1 - w.flex) * (1 - w.cele);
        P.aLx = lerp(P.aLx, 0.65, k2);
        P.aLz = lerp(P.aLz, -0.12, k2);
        P.aLy = lerp(P.aLy, 0.9, k2);
        P.eL = lerp(P.eL, 1.75 + 0.15 * Math.sin(t * 6), k2);
      }
    }

    // ---- jump
    if (this.beginLayer(P, w.air)) {
      this.jumpPose(this.Q, m);
      this.endLayer(P, w.air);
    }
    // ---- slide
    const dd = Math.abs(this.lat) > 1.5 ? Math.sign(this.lat) : p.duckSide;
    this.duckDir = damp(this.duckDir, dd, 6, dt);
    if (this.beginLayer(P, w.slide)) {
      this.slidePose(this.Q, m);
      this.endLayer(P, w.slide);
    }
    if (this.slideFix > 0) {
      const c = this.slideFix * w.slide;
      if (ride === 'shoes') {
        P.hPitch -= c * 0.8;
        P.nPitch += c * 0.5;
        P.hy -= c * 0.06;
      } else {
        P.sPitch += c * 0.7;
        P.nPitch += c * 0.35;
        P.hy -= c * 0.12;
      }
    }

    // ---- landing squash (knees bend; never scales the body)
    if (m.landT >= 0 && m.landT < 0.4 && !m.airborne) {
      const e = Math.exp(-m.landT * 9) * Math.min(1, m.landT * 40 + 0.3);
      P.hy -= (ride === 'shoes' ? 0.085 : 0.06) * e;
      P.sPitch += 0.25 * e;
      P.nPitch -= 0.12 * e;
      P.aLz -= 0.3 * e;
      P.aRz += 0.3 * e;
      P.squash += 0.035 * e;
      if (ride === 'skate') P.hy -= 0.02 * e;
    }

    // ---- bump: cute stumble, arms windmill, wobble
    if (m.bumpT >= 0 && m.bumpT < 0.65) {
      const bt = m.bumpT;
      const e = Math.min(1, bt / 0.06) * (1 - smooth(bt / 0.65)) * (1 - 0.9 * w.slide);
      if (this.beginLayer(P, e)) {
        const Q = this.Q;
        const ph = bt * 17;
        const hold = ride === 'bike' || ride === 'scooter';
        Q.aRx = 1.3 * Math.sin(ph);
        Q.aRz = 1.4 + 0.5 * Math.cos(ph);
        Q.aRy = 0;
        Q.eR = 0.35;
        Q.ikR = 0;
        if (!hold) {
          Q.aLx = 1.3 * Math.sin(ph + Math.PI);
          Q.aLz = -1.4 - 0.5 * Math.cos(ph + Math.PI);
          Q.aLy = 0;
          Q.eL = 0.35;
          Q.ikL = 0;
        }
        Q.sRoll += 0.3 * Math.sin(bt * 15);
        Q.nRoll += 0.22 * Math.sin(bt * 19 + 1);
        Q.sPitch -= 0.22;
        Q.nPitch -= 0.15;
        Q.rootRoll += (ride === 'shoes' ? 0.08 : 0.14) * Math.sin(bt * 13);
        Q.steer += 0.35 * Math.sin(bt * 16);
        Q.hy -= 0.03;
        this.endLayer(P, e);
      }
    }

    // ---- flex: double bicep mid-run
    if (this.beginLayer(P, w.flex)) {
      const Q = this.Q;
      const pump = Math.sin(t * 7);
      Q.aRz = 1.68;
      Q.aRy = -Math.PI / 2;
      Q.aRx = -0.12;
      Q.eR = 1.78 + 0.2 * pump;
      Q.aLz = -1.68;
      Q.aLy = Math.PI / 2;
      Q.aLx = -0.12;
      Q.eL = 1.78 + 0.2 * pump;
      Q.sYaw *= 0.3;
      Q.ikL = Q.ikR = 0;
      Q.sPitch -= 0.08;
      Q.nPitch -= 0.08;
      Q.bicep = 1 + 0.12 * pump;
      this.endLayer(P, w.flex);
    }

    // ---- celebrate: cheer, jump for joy
    if (this.beginLayer(P, w.cele)) {
      const Q = this.Q;
      const ace = this.character === 'ace';
      if (ace) {
        const pump = Math.sin(t * 9);
        Q.aRz = 2.7;
        Q.aRy = -0.25;
        Q.aRx = 0.15;
        Q.eR = 0.25 + 0.7 * Math.max(0, pump);
        Q.aLz = -2.7;
        Q.aLy = 0.25;
        Q.aLx = 0.15;
        Q.eL = 0.25 + 0.7 * Math.max(0, -pump);
      } else {
        const sw = Math.sin(t * 6);
        Q.aRz = 2.3 + 0.15 * sw;
        Q.aLz = -2.3 + 0.15 * sw;
        Q.aRy = Q.aLy = 0;
        Q.aRx = Q.aLx = 0.1;
        Q.eR = Q.eL = 0.18;
        Q.hx += 0.025 * Math.sin(t * 3);
        Q.hRoll += -0.08 * Math.sin(t * 3);
        Q.nRoll += 0.1 * Math.sin(t * 3 + 0.6);
      }
      Q.ikL = Q.ikR = 0;
      Q.nPitch -= 0.12;
      const hopRate = ace ? 5.4 : 4.6;
      const hop = Math.abs(Math.sin(t * hopRate));
      if (ride === 'shoes') {
        const h = hop * 0.15 * p.bounce;
        Q.rootY += h;
        Q.fLy += h * 0.45;
        Q.fRy += h * 0.45;
        Q.fLp = Q.fRp = -0.4 * hop;
        Q.hy = Math.min(Q.hy, DIM.hipH - 0.02);
      } else {
        Q.hy += 0.04 * hop;
      }
      this.endLayer(P, w.cele);
    }

    void dt;
    void st;
  }

  private jumpPose(Q: Pose, m: AvatarMotion): void {
    const ride = this.ride;
    const jt = Math.max(0, m.jumpT);
    const up = clamp(m.vy / 4 + 0.5, 0, 1); // 1 rising .. 0 falling
    const ace = this.character === 'ace';
    if (ride === 'shoes') {
      const lead = ace ? 0 : 1;
      const hy = DIM.hipH - 0.02;
      Q.hy = hy;
      Q.hx = 0;
      const tuck = up;
      for (let i = 0; i < 2; i++) {
        const s = i ? 1 : -1;
        const F = FOOT[i];
        const isLead = i === lead;
        Q[F.x] = s * 0.085;
        Q[F.y] = hy - lerp(0.44, isLead ? 0.24 : 0.31, tuck);
        Q[F.z] = lerp(isLead ? -0.08 : 0.06, isLead ? -0.2 : 0.17, tuck);
        Q[F.p] = lerp(0.1, isLead ? 0.2 : -0.6, tuck);
        Q[F.r] = 0;
      }
      Q.hPitch = 0;
      Q.hRoll = 0;
      Q.sRoll = 0;
      Q.sPitch = lerp(0.02, 0.1, tuck);
      Q.nPitch = -0.12;
      Q.aLx = lerp(0.3, ace ? 1.1 : 0.5, tuck);
      Q.aRx = lerp(0.3, ace ? 0.5 : 1.1, tuck);
      Q.aLz = lerp(-0.95, -0.45, tuck);
      Q.aRz = lerp(0.95, 0.45, tuck);
      Q.aLy = Q.aRy = 0;
      Q.eL = Q.eR = lerp(0.4, 1.1, tuck);
    } else if (ride === 'bike') {
      const env = clamp(jt / 0.12, 0, 1) * lerp(0.55, 1, up);
      Q.hy = BIKE.seat.y + 0.075;
      Q.hz = BIKE.seat.z - 0.05;
      Q.rideY = 0.11 * env;
      Q.ridePitch = 0.3 * Math.max(0, 1 - jt / 0.22) - 0.07 * (1 - up);
      Q.sPitch = 0.55;
      Q.nPitch = -0.45;
      Q.rideRoll = 0;
    } else if (ride === 'scooter') {
      const kickI = this.spec.p.stance === 1 ? 1 : 0;
      const ks = kickI ? 1 : -1;
      const K = FOOT[kickI];
      Q[K.x] = ks * 0.03;
      Q[K.y] = SCOOTER.deckTop + ANK;
      Q[K.z] = 0.17;
      Q[K.r] = 1;
      Q[K.p] = 0;
      const env = clamp(jt / 0.12, 0, 1) * lerp(0.5, 1, up);
      Q.rideY = 0.12 * env;
      Q.ridePitch = 0.18 * Math.max(0, 1 - jt / 0.24) - 0.04 * (1 - up);
      Q.hy = 0.6;
      Q.hz = 0.04;
      Q.sPitch = 0.3;
      Q.nPitch = -0.25;
    } else if (ride === 'skate') {
      // ollie: tail pop, front foot slides up, board rises and levels, knees tucked
      this.skateCruise(Q);
      const st = this.spec.p.stance;
      const frontI = st === 1 ? 0 : 1;
      const pop = clamp(jt / 0.09, 0, 1);
      const level = clamp((jt - 0.07) / 0.16, 0, 1);
      Q.ridePitch = 0.45 * pop * (1 - smooth(level));
      Q.rideY = 0.17 * smooth(level) * lerp(0.45, 1, up);
      Q.rideRoll = 0;
      const Fr = FOOT[frontI];
      Q[Fr.z] = -0.16 - 0.09 * pop * (1 - level);
      Q.hy = 0.585;
      Q.sPitch = 0.28;
      Q.nPitch = -0.2;
      const sf = frontI ? 1 : -1;
      Q[ARM[frontI].z] = sf * 1.05;
      Q[ARM[1 - frontI].z] = -sf * 0.95;
      Q[ARM[frontI].e] = 0.6;
      Q[ARM[1 - frontI].e] = 0.7;
    }
  }

  private slidePose(Q: Pose, m: AvatarMotion): void {
    const ride = this.ride;
    const p = this.spec.p;
    const st = p.stance;
    const d = this.duckDir;
    const sT = Math.max(0, m.slideT);
    const ace = this.character === 'ace';
    if (ride === 'shoes') {
      // feet-first slide on the bum, leaning back, one leg out front
      const lead = ace ? 0 : 1;
      Q.hy = 0.19;
      Q.hx = 0;
      Q.hz = 0.07;
      Q.hPitch = -1.2;
      Q.hRoll = 0;
      Q.hYaw = ace ? 0.12 : -0.12;
      Q.sPitch = 0.3;
      Q.sRoll = 0;
      Q.sYaw = 0;
      Q.nPitch = 0.55;
      Q.nYaw = 0;
      for (let i = 0; i < 2; i++) {
        const s = i ? 1 : -1;
        const F = FOOT[i];
        if (i === lead) {
          Q[F.x] = s * 0.07;
          Q[F.y] = ANK + 0.03;
          Q[F.z] = -0.42;
          Q[F.p] = 0.7;
        } else {
          Q[F.x] = s * 0.16;
          Q[F.y] = ANK + 0.005;
          Q[F.z] = -0.12;
          Q[F.p] = 0.1;
        }
        Q[F.yaw] = -s * 0.2;
        Q[F.r] = 0;
      }
      // one hand trailing near the ground, the other up front for balance
      const back = 1 - lead;
      const sb = back ? 1 : -1;
      Q[ARM[back].x] = -0.2;
      Q[ARM[back].z] = sb * 0.75;
      Q[ARM[back].y] = 0;
      Q[ARM[back].e] = 0.2;
      Q[ARM[lead].x] = 1.25;
      Q[ARM[lead].z] = -sb * 0.45;
      Q[ARM[lead].y] = 0;
      Q[ARM[lead].e] = 0.5;
      Q.rootY = 0;
      Q.rootRoll *= 0.5;
    } else if (ride === 'bike') {
      // skid-duck: bike leans and kicks its back wheel out, rider tucks over the bars
      Q.rootRoll += -d * 0.5;
      Q.rootYaw += -d * 0.2;
      Q.hy = 0.53;
      Q.hz = 0.24;
      Q.hx = d * 0.03;
      Q.hRoll = 0;
      Q.sPitch = 1.25;
      Q.sRoll = -d * 0.12;
      Q.sYaw = 0;
      Q.nPitch = -0.75;
      Q.nRoll = d * 0.35;
      Q.nYaw = 0;
      Q.rideY = 0;
      Q.ridePitch = 0;
      Q.rideRoll = 0;
      Q.steer = d * 0.22;
      Q.squash = 0.02;
      Q.ikL = Q.ikR = 1;
      Q.aLz = -0.6;
      Q.aRz = 0.6;
    } else if (ride === 'scooter') {
      const kickI = p.stance === 1 ? 1 : 0;
      const ks = kickI ? 1 : -1;
      const K = FOOT[kickI];
      Q[K.x] = ks * 0.03;
      Q[K.y] = SCOOTER.deckTop + ANK;
      Q[K.z] = 0.17;
      Q[K.r] = 1;
      Q[K.p] = 0;
      Q.hy = 0.34;
      Q.hz = 0.21;
      Q.hx = d * 0.03;
      Q.hRoll = 0;
      Q.hYaw = 0;
      Q.sPitch = 1.05;
      Q.sRoll = -d * 0.1;
      Q.sYaw = 0;
      Q.nPitch = -0.6;
      Q.nRoll = d * 0.3;
      Q.nYaw = 0;
      Q.rootRoll += -d * 0.3;
      Q.ikL = Q.ikR = 1;
      Q.aLz = -0.7;
      Q.aRz = 0.7;
    } else if (ride === 'skate') {
      // crouch low grabbing the toe-side edge of the board
      this.skateCruise(Q);
      const frontI = st === 1 ? 0 : 1;
      Q.hy = 0.325;
      Q.hz = 0.02;
      Q.sPitch = 1.05;
      Q.sYaw = st * 0.15;
      Q.nPitch = -0.7;
      Q.nYaw = st * 1.15;
      const A = ARM[frontI];
      Q[A.ik] = 1;
      Q[A.gx] = st * 0.11;
      Q[A.gy] = SKATE.deckTop + 0.012;
      Q[A.gz] = -0.02;
      const Bk = ARM[1 - frontI];
      const sb = frontI ? -1 : 1;
      Q[Bk.z] = sb * 1.2;
      Q[Bk.x] = -0.6;
      Q[Bk.e] = 0.4;
      Q.rideRoll = 0;
    }
    void sT;
  }

  // ------------------------------------------------------------------ apply pose to the rig
  private apply(P: Pose, dt: number, m: AvatarMotion): void {
    const r = this.rig;
    const ride = this.rideObj;
    r.rideRoot.position.set(P.rootX, P.rootY, P.rootZ);
    r.rideRoot.rotation.set(P.rootPitch, P.rootYaw, P.rootRoll, 'YXZ');
    // ride transform about its pivot
    const g = ride.group;
    g.rotation.set(P.ridePitch, P.rideYaw, P.rideRoll, 'YXZ');
    qA.setFromEuler(g.rotation);
    vA.copy(ride.pivot).applyQuaternion(qA);
    g.position.copy(ride.pivot).sub(vA);
    g.position.y += P.rideY;
    g.position.z += P.rideZ;
    ride.update(dt, this.speedS * (m.menu ? 0 : 1), P.steer, Math.max(0, P.squash), this.crank);
    // body
    r.hips.position.set(P.hx, P.hy, P.hz);
    r.hips.rotation.set(-P.hPitch, P.hYaw, P.hRoll, 'YXZ');
    r.spine.rotation.set(-P.sPitch, P.sYaw, P.sRoll, 'YXZ');
    const shiver = this.rig.face.shiver;
    r.head.rotation.set(-P.nPitch, P.nYaw, P.nRoll + shiver * 0.03 * Math.sin(this.t * 47), 'YXZ');
    this.root.updateMatrixWorld(true);
    g.updateMatrix();

    // legs (IK)
    for (let i = 0; i < 2; i++) {
      const F = FOOT[i];
      vA.set(P[F.x], P[F.y], P[F.z]);
      const fr = clamp(P[F.r], 0, 1);
      if (fr > 0) {
        vB.copy(vA).applyMatrix4(g.matrix);
        vA.lerp(vB, fr);
      }
      r.rideRoot.localToWorld(vA);
      r.hips.worldToLocal(vA);
      vPole.set((i ? 1 : -1) * 0.18, 0.1, -1);
      solveTwoBone(r.thigh[i].position, vA, vPole, DIM.thigh, DIM.shin, -1, ik);
      r.thigh[i].quaternion.copy(ik.upper);
      r.shin[i].rotation.set(ik.bend, 0, 0);
    }
    // arms (FK blended with IK to grips)
    for (let i = 0; i < 2; i++) {
      const A = ARM[i];
      const sh = r.shoulder[i];
      eA.set(P[A.x], P[A.y], P[A.z], 'ZYX');
      qB.setFromEuler(eA);
      let bend = P[A.e];
      const w = clamp(P[A.ik], 0, 1);
      if (w > 0.001) {
        vA.set(P[A.gx], P[A.gy], P[A.gz]).applyMatrix4(g.matrix);
        r.rideRoot.localToWorld(vA);
        r.spine.worldToLocal(vA);
        const s = i ? 1 : -1;
        vPole.set(s * 0.8, -0.5, 0.6);
        solveTwoBone(sh.position, vA, vPole, DIM.upperArm, DIM.foreArm + DIM.hand, 1, ik);
        qB.slerp(ik.upper, w);
        bend = lerp(bend, ik.bend, w);
      }
      sh.quaternion.copy(qB);
      r.elbow[i].rotation.set(bend, 0, 0);
    }
    // bicep bumps (flex pose only — a little cartoon bump, never body growth)
    const bc = clamp(P.bicep, 0, 1.2);
    for (const bm of r.bicep) {
      bm.visible = this.visibleFlag && bc > 0.02;
      bm.scale.setScalar(Math.max(0.0001, 0.044 * bc));
    }
    this.root.updateMatrixWorld(true);
    // feet orientation (world-ish, so soles sit flat on pedals/decks/ground)
    r.rideRoot.getWorldQuaternion(qC);
    for (let i = 0; i < 2; i++) {
      const F = FOOT[i];
      const fr = clamp(P[F.r], 0, 1);
      qA.copy(IDENT).slerp(g.quaternion, fr);
      qB.setFromAxisAngle(Y_AXIS, P[F.yaw]);
      qA.multiply(qB);
      qB.setFromAxisAngle(X_AXIS, P[F.p]);
      qA.multiply(qB);
      qA.premultiply(qC);
      r.shin[i].getWorldQuaternion(qB);
      r.foot[i].quaternion.copy(qB.invert().multiply(qA));
    }
    this.root.updateMatrixWorld(true);
    // feet anchor (root space)
    r.foot[0].getWorldPosition(vA);
    r.foot[1].getWorldPosition(vB);
    vA.add(vB).multiplyScalar(0.5);
    this.root.worldToLocal(vA);
    this.feetAnchor.position.set(vA.x, Math.max(0, vA.y - ANK), vA.z);
    this.springHair(dt, P);
    // slide ceiling guard: keep the highest point (head + hair) under ~0.965 m
    if (m.sliding && this.w.slide > 0.3) {
      const err = this.topHeight() - 0.962;
      this.slideFix = clamp(this.slideFix + err * 40 * Math.max(dt, 1 / 120), 0, 1.0);
    } else this.slideFix = damp(this.slideFix, 0, 5, dt);
  }

  /** Conservative head/hair top height in root space (bounding spheres). */
  topHeight(): number {
    const r = this.rig;
    const ace = this.character === 'ace';
    vA.set(0, DIM.headC + (ace ? 0.045 : 0.0), ace ? 0 : 0.02);
    r.head.localToWorld(vA);
    this.root.worldToLocal(vA);
    let top = vA.y + (ace ? 0.272 : 0.27);
    if (!ace) {
      vB.set(0, 0.105, 0.005);
      r.hair.localToWorld(vB);
      this.root.worldToLocal(vB);
      top = Math.max(top, vB.y + 0.158);
    }
    return top;
  }

  private springHair(dt: number, P: Pose): void {
    const r = this.rig;
    r.head.getWorldPosition(vA);
    if (!this.hairInit || dt <= 0) {
      this.hairPrev.copy(vA);
      this.hairInit = true;
      return;
    }
    vB.subVectors(vA, this.hairPrev).divideScalar(dt);
    // acceleration (world), turned into a lag target for the puff/tuft
    const ax = (vB.x - this.hairVel.x) / dt;
    const ay = (vB.y - this.hairVel.y) / dt;
    this.hairVel.copy(vB);
    this.hairPrev.copy(vA);
    const moana = this.character === 'moana';
    const gain = moana ? 1 : 1.6;
    const tPitch = clamp(-ay * 0.0045 * gain, -0.35, 0.35) + this.w.boost * 0.22 + this.speedS * 0.006;
    const tRoll = clamp(ax * 0.004 * gain, -0.35, 0.35);
    const K = moana ? 140 : 220;
    const D = moana ? 9 : 12;
    const h = this.hairAng;
    const hv = this.hairAngV;
    hv.x += (-K * (h.x - tPitch) - D * hv.x) * dt;
    hv.y += (-K * (h.y - tRoll) - D * hv.y) * dt;
    h.x = clamp(h.x + hv.x * dt, -0.5, 0.5);
    h.y = clamp(h.y + hv.y * dt, -0.5, 0.5);
    r.hair.rotation.set(h.x * (moana ? 0.55 : 1.2), 0, h.y * (moana ? 0.6 : 1));
    void P;
  }

  // ------------------------------------------------------------------ face
  private updateFace(dt: number, m: AvatarMotion): void {
    const w = this.w;
    let e: Expression = 'happy';
    if (this.explicitT > 0) {
      this.explicitT -= dt;
      e = this.explicitExpr;
    } else if (m.bumpT >= 0 && m.bumpT < 0.6) e = 'oops';
    else if (w.cele > 0.4) e = 'cheer';
    else if (w.sleepy > 0.45) e = 'sleepy';
    else if (w.wobble > 0.5) e = 'tummy';
    else if (w.flex > 0.4) e = 'determined';
    else if (w.boost > 0.5) e = 'grin';
    else if (w.mood < -0.4) e = 'droopy';
    else if (m.airborne && m.vy > 1.5) e = 'wow';
    else if (m.sliding) e = 'determined';
    else if (w.menu > 0.5) {
      this.menuGrinT -= dt;
      if (this.menuGrinT < -1.6) this.menuGrinT = 2.5 + Math.sin(this.t * 13.7) * 1.2 + 1.5;
      if (this.menuGrinT < 0) e = 'grin';
    }
    this.rig.face.update(dt, this.t, e);
  }
}

export function createAvatar(character: CharacterId, ride: RideId): Avatar {
  return new AvatarImpl(character, ride);
}

/** Debug helper for harnesses: draw-call-ish mesh count of an avatar. */
export function countMeshes(a: Avatar): number {
  let n = 0;
  a.root.traverseVisible((o) => {
    if ((o as THREE.Mesh).isMesh || (o as THREE.Sprite).isSprite) n++;
  });
  return n;
}

void mA;
