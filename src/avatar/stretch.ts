// Warm-up (dynamic, looping, calm) and cool-down (static holds with gentle breathing) poses.
// Poses are written kid-centred, standing on the ground (feet never attached to a ride);
// index.ts blends them in/out of idle, cross-fades between moves and steps the kid off wheeled rides.
import type { StretchMove } from '../contracts';
import { ARM, FOOT, type Pose } from './pose';
import { DIM, type Personality } from './spec';

const ANK = DIM.ankle;
const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const smooth = (t: number): number => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};
const frac = (x: number): number => x - Math.floor(x);
/** Phase that slows to a stop at both ends (for reversing circles). */
const easePhase = (u: number): number => u - Math.sin(TAU * u) / TAU;

export interface StretchCtx {
  p: Personality;
  ace: boolean;
  /** Write a rideRoot-space point as arm i's spine-space IK target (uses the pose's hips/spine). */
  handAt(Q: Pose, i: number, x: number, y: number, z: number): void;
  /** Spine-space hand target directly. */
  handSpine(Q: Pose, i: number, x: number, y: number, z: number): void;
}

export const DYNAMIC: ReadonlySet<StretchMove> = new Set<StretchMove>(['look', 'nod', 'arm_circles', 'arm_swings', 'torso_twist', 'side_bend', 'high_knees', 'leg_swings', 'hops', 'ankle_circles', 'breathe']);

function reset(Q: Pose): void {
  for (const k in Q) Q[k as keyof Pose] = 0;
}

/** Relaxed standing base: feet on the ground, arms loose. */
function stand(Q: Pose): void {
  reset(Q);
  Q.hy = DIM.hipH - 0.015;
  for (let i = 0; i < 2; i++) {
    const s = i ? 1 : -1;
    const F = FOOT[i];
    Q[F.x] = s * 0.1;
    Q[F.y] = ANK;
    Q[F.z] = 0;
    Q[F.yaw] = -s * 0.1;
    const A = ARM[i];
    Q[A.z] = s * 0.12;
    Q[A.x] = 0.04;
    Q[A.e] = 0.25;
  }
}

/** Hand resting on the hip (spine-space IK). */
function handOnHip(Q: Pose, ctx: StretchCtx, i: number): void {
  const s = i ? 1 : -1;
  Q[ARM[i].ik] = 1;
  ctx.handSpine(Q, i, s * 0.225, 0.035, 0.02);
}

/** Gentle breathing for holds (tiny, no bounce). */
function breath(Q: Pose, t: number, k = 1): void {
  const b = Math.sin((t * TAU) / 4.2) * k;
  Q.sPitch -= 0.015 * b;
  Q.nPitch -= 0.01 * b;
  Q.hy += 0.002 * b;
  Q.aLz -= 0.015 * b;
  Q.aRz += 0.015 * b;
}

/**
 * Write the pose for `move` at time t (seconds since the move started).
 * side: +1 / -1 picks the variant for one-sided moves (default +1 matches MOVE_PARTS).
 */
export function stretchPose(Q: Pose, move: StretchMove, t: number, side: 1 | -1, ctx: StretchCtx): void {
  stand(Q);
  const tempo = ctx.ace ? 1.06 : 1.0;
  const tt = t * tempo;
  const hold = smooth(t / 1.1); // static holds ease in, then stay
  switch (move) {
    // ======================================================== warm-up (dynamic)
    case 'look': {
      const a = Math.sin((tt * TAU) / 3.4);
      Q.nYaw = 0.62 * a;
      Q.sYaw = 0.07 * a;
      Q.nRoll = -0.05 * a;
      Q.nPitch = -0.03;
      break;
    }
    case 'nod': {
      Q.nPitch = 0.02 + 0.3 * Math.sin((tt * TAU) / 3.0);
      break;
    }
    case 'arm_circles': {
      // three circles forwards, ease to a stop, three backwards
      const u = frac(tt / 8.4) * 2;
      const ph = u < 1 ? TAU * 3 * easePhase(u) : -TAU * 3 * easePhase(u - 1);
      const r = 0.38;
      Q.aRz = 1.42 + r * Math.cos(ph);
      Q.aRx = r * Math.sin(ph);
      Q.aLz = -(1.42 + r * Math.cos(ph));
      Q.aLx = r * Math.sin(ph);
      Q.aLy = Q.aRy = 0;
      Q.eL = Q.eR = 0.08;
      break;
    }
    case 'arm_swings': {
      // big hug-and-open swings at shoulder height (right arm passes just above the left)
      const s = 0.72 + 1.05 * Math.sin((tt * TAU) / 2.3);
      Q.aRz = 1.3;
      Q.aRx = s;
      Q.aLz = -1.14;
      Q.aLx = s;
      Q.aLy = Q.aRy = 0;
      Q.eL = Q.eR = 0.18;
      Q.sPitch = 0.02;
      break;
    }
    case 'torso_twist': {
      const a = Math.sin((tt * TAU) / 3.3);
      Q.sYaw = 0.5 * a;
      Q.hYaw = -0.08 * a;
      Q.nYaw = -0.32 * a;
      for (let i = 0; i < 2; i++) {
        const s = i ? 1 : -1;
        const A = ARM[i];
        Q[A.x] = 0.85;
        Q[A.z] = s * 0.42;
        Q[A.y] = 0;
        Q[A.e] = 1.45;
      }
      break;
    }
    case 'side_bend': {
      const b = Math.sin((tt * TAU) / 3.8);
      Q.sRoll = -0.3 * b; // b > 0: lean right
      Q.hx = -0.018 * b;
      Q.nRoll = 0.1 * b;
      const up = Math.max(0, b);
      const dn = Math.max(0, -b);
      Q.aLz = -lerp(0.14, 2.36, up);
      Q.aLx = 0.1 * up;
      Q.aRz = lerp(0.14, 2.36, dn);
      Q.aRx = 0.1 * dn;
      Q.eL = 0.2;
      Q.eR = 0.2;
      break;
    }
    case 'high_knees': {
      const T = 1.5;
      for (let i = 0; i < 2; i++) {
        const q = frac(tt / T + i * 0.5);
        const lift = q < 0.5 ? Math.sin(Math.PI * (q / 0.5)) : 0;
        const F = FOOT[i];
        Q[F.y] = ANK + 0.25 * lift;
        Q[F.z] = -0.1 * lift;
        Q[F.x] = (i ? 1 : -1) * 0.09;
        Q[F.p] = -0.35 * lift;
      }
      const c = Math.sin((tt * TAU) / T);
      Q.hy = DIM.hipH - 0.02 + 0.008 * Math.abs(c);
      Q.aLx = 0.1 - 0.7 * c;
      Q.aRx = 0.1 + 0.7 * c;
      Q.aLz = -0.18;
      Q.aRz = 0.18;
      Q.eL = Q.eR = 1.35;
      Q.sYaw = 0.08 * c;
      break;
    }
    case 'leg_swings': {
      const li = side > 0 ? 1 : 0; // swinging leg
      const si = 1 - li;
      const ls = li ? 1 : -1;
      const th = 0.52 * Math.sin((tt * TAU) / 2.5);
      Q.hx = -ls * 0.028;
      Q.hy = DIM.hipH - 0.01;
      Q.hRoll = ls * 0.03;
      const hipX = Q.hx + ls * DIM.hipX;
      const F = FOOT[li];
      Q[F.x] = hipX + ls * 0.01;
      Q[F.y] = Q.hy - 0.43 * Math.cos(th) + 0.012;
      Q[F.z] = -0.43 * Math.sin(th);
      Q[F.p] = 0.35 * th;
      const S = FOOT[si];
      Q[S.x] = -ls * 0.085 + Q.hx;
      Q[S.y] = ANK;
      Q[S.z] = 0;
      // balance arm out on the standing side, other hand on the hip
      const B = ARM[si];
      Q[B.z] = -ls * 1.15 + 0.05 * Math.sin(tt * 2);
      Q[B.x] = 0.15;
      Q[B.e] = 0.25;
      handOnHip(Q, ctx, li);
      Q.sRoll = -ls * 0.04;
      break;
    }
    case 'hops': {
      const T = 0.78;
      const u = frac(tt / T);
      const air = u < 0.7 ? Math.sin((Math.PI * u) / 0.7) : 0;
      const squash = u >= 0.7 ? Math.sin((Math.PI * (u - 0.7)) / 0.3) : 0;
      const h = 0.07 * air * (ctx.ace ? 1.1 : 1);
      Q.hy = DIM.hipH - 0.03 + h - 0.05 * squash;
      for (let i = 0; i < 2; i++) {
        const F = FOOT[i];
        Q[F.x] = (i ? 1 : -1) * 0.075;
        Q[F.y] = ANK + h;
        Q[F.p] = -0.25 * air;
      }
      Q.aLx = Q.aRx = 0.3 * air - 0.25 * squash;
      Q.aLz = -0.3;
      Q.aRz = 0.3;
      Q.eL = Q.eR = 0.5;
      Q.sPitch = 0.04 + 0.08 * squash;
      break;
    }
    case 'ankle_circles': {
      const w = 3.4;
      const k = Math.floor(tt / w) % 2; // alternate feet
      const fi = side > 0 ? 1 - k : k;
      const u = tt - Math.floor(tt / w) * w;
      const lift = smooth(u / 0.4) * (1 - smooth((u - (w - 0.4)) / 0.4));
      const ph = (u * TAU) / 1.5;
      const F = FOOT[fi];
      const fs = fi ? 1 : -1;
      Q[F.x] = fs * 0.11;
      Q[F.y] = ANK + 0.065 * lift;
      Q[F.z] = -0.12 * lift;
      Q[F.p] = 0.38 * Math.sin(ph) * lift;
      Q[F.yaw] = -fs * 0.1 + 0.38 * Math.cos(ph) * lift;
      Q.hx = -fs * 0.022 * lift;
      handOnHip(Q, ctx, 0);
      handOnHip(Q, ctx, 1);
      break;
    }
    case 'breathe': {
      // slow breathe in (arms float up, chest lifts) ... and out
      const u = frac(t / 5.2) * 5.2;
      const k = u < 2.4 ? smooth(u / 2.4) : u < 2.8 ? 1 : 1 - smooth((u - 2.8) / 2.4);
      const e = smooth(t / 0.8);
      Q.aLz = -(0.14 + 1.15 * k * e);
      Q.aRz = 0.14 + 1.15 * k * e;
      Q.aLx = Q.aRx = 0.15 * k;
      Q.eL = Q.eR = 0.2;
      Q.sPitch = -0.06 * k;
      Q.nPitch = -0.12 * k;
      Q.hy += 0.006 * k;
      break;
    }
    // ======================================================== cool-down (static holds)
    case 'reach_sky': {
      Q.aLz = -lerp(0.12, 2.5, hold);
      Q.aRz = lerp(0.12, 2.5, hold);
      Q.aLx = Q.aRx = 0.12 * hold;
      Q.eL = Q.eR = lerp(0.25, 0.04, hold);
      Q.sPitch = -0.05 * hold;
      Q.nPitch = -0.24 * hold;
      Q.hy += 0.016 * hold;
      Q.fLy = Q.fRy = ANK + 0.02 * hold;
      Q.fLp = Q.fRp = -0.3 * hold;
      breath(Q, t, hold);
      break;
    }
    case 'side_reach': {
      // reaching arm (side +1 = right) over the head, lean the other way, other hand on hip
      const ri = side > 0 ? 1 : 0;
      const s = ri ? 1 : -1;
      Q.sRoll = s * 0.27 * hold;
      Q.hx = s * 0.02 * hold;
      Q.nRoll = s * 0.08 * hold;
      const A = ARM[ri];
      Q[A.z] = s * lerp(0.12, 2.38, hold);
      Q[A.x] = 0.15 * hold;
      Q[A.e] = 0.22;
      handOnHip(Q, ctx, 1 - ri);
      Q[ARM[1 - ri].ik] = hold;
      breath(Q, t, hold);
      break;
    }
    case 'shoulder_stretch': {
      // straight arm across the chest (side +1 = left arm), the other hand holds it above the elbow
      const ai = side > 0 ? 0 : 1;
      const s = ai ? 1 : -1;
      const A = ARM[ai];
      Q[A.z] = s * lerp(0.12, 1.3, hold);
      Q[A.x] = lerp(0.04, 1.92, hold);
      Q[A.y] = 0;
      Q[A.e] = 0.05;
      // point on the crossing arm, a little above the elbow, in spine space (FK of that arm)
      const ax = Q[A.x];
      const az = Q[A.z];
      // direction of (0,-1,0) after Rz(az)*Rx(ax)
      const dy = -Math.cos(ax);
      const dz = -Math.sin(ax);
      const dirX = -Math.sin(az) * dy;
      const dirY = Math.cos(az) * dy;
      const L = DIM.upperArm * 0.7;
      const px = s * DIM.shoulderX + dirX * L;
      const py = DIM.shoulderY + dirY * L;
      const pz = dz * L;
      const H = 1 - ai;
      Q[ARM[H].ik] = hold;
      // hook the arm from just below / in front (forearms never cross through each other)
      ctx.handSpine(Q, H, px, py - 0.088, pz - 0.1);
      Q.nYaw = -s * 0.2 * hold;
      breath(Q, t, hold);
      break;
    }
    case 'quad_stretch': {
      // stand on one leg, hold the other foot behind (side +1 = right foot); a little wobbly
      const li = side > 0 ? 1 : 0;
      const ls = li ? 1 : -1;
      const wob = hold;
      Q.hx = -ls * 0.03 * hold + 0.014 * Math.sin(t * 1.9) * wob;
      Q.hRoll = 0.035 * Math.sin(t * 2.3 + 1) * wob;
      Q.sRoll = -0.03 * Math.sin(t * 2.3 + 1.4) * wob;
      Q.sPitch = 0.1 * hold;
      Q.hy = DIM.hipH - 0.012;
      const F = FOOT[li];
      const ax = Q.hx + ls * 0.095;
      const ay = lerp(ANK, Q.hy + 0.02, hold);
      const az = lerp(0, 0.19, hold);
      Q[F.x] = ax;
      Q[F.y] = ay;
      Q[F.z] = az;
      Q[F.p] = lerp(0, -1.3, hold);
      const S = FOOT[1 - li];
      Q[S.x] = -ls * 0.06 + Q.hx * 0.3;
      Q[S.y] = ANK;
      Q[S.z] = 0;
      // same-side hand holds the foot (top of the shoe), the free arm out for balance
      Q[ARM[li].ik] = hold;
      ctx.handAt(Q, li, ax + ls * 0.035, ay + 0.03, az + 0.055);
      const B = ARM[1 - li];
      Q[B.z] = -ls * lerp(0.12, 1.2, hold) + 0.1 * Math.sin(t * 2.1) * wob;
      Q[B.x] = 0.2 * hold;
      Q[B.e] = 0.3;
      break;
    }
    case 'calf_stretch': {
      // lunge back (side +1 = left calf stretched), back heel down, hands on the front knee
      const bi = side > 0 ? 0 : 1;
      const fi = 1 - bi;
      const fs = fi ? 1 : -1;
      Q.hy = lerp(DIM.hipH - 0.015, 0.41, hold);
      Q.hz = 0.02 * hold;
      Q.hPitch = 0.12 * hold;
      Q.sPitch = 0.34 * hold;
      Q.nPitch = -0.3 * hold;
      const Fr = FOOT[fi];
      Q[Fr.x] = fs * 0.1;
      Q[Fr.z] = -0.2 * hold;
      Q[Fr.yaw] = -fs * 0.05;
      const Bk = FOOT[bi];
      Q[Bk.x] = -fs * 0.1;
      Q[Bk.z] = 0.36 * hold;
      Q[Bk.p] = 0;
      for (let i = 0; i < 2; i++) {
        Q[ARM[i].ik] = hold;
        ctx.handAt(Q, i, fs * 0.1 + (i ? 1 : -1) * 0.035, 0.33, -0.16 * hold);
      }
      breath(Q, t, hold * 0.6);
      break;
    }
    case 'toe_touch': {
      // gentle forward fold, knees soft, hands reach toward the toes
      Q.hy = lerp(DIM.hipH - 0.015, 0.49, hold);
      Q.hz = 0.09 * hold;
      Q.hPitch = 0.72 * hold;
      Q.sPitch = 0.5 * hold;
      Q.nPitch = -0.05 * hold;
      Q.aLx = Q.aRx = lerp(0.04, 1.3, hold);
      Q.aLz = -0.1;
      Q.aRz = 0.1;
      Q.eL = Q.eR = 0.1;
      breath(Q, t, hold * 0.5);
      break;
    }
    case 'butterfly': {
      // sit on the ground, soles together, knees out, hands holding the feet
      const k = hold;
      Q.hy = lerp(DIM.hipH - 0.015, 0.098, k);
      Q.hz = 0.03 * k;
      Q.hPitch = -0.05 * k;
      Q.sPitch = 0.42 * k;
      Q.nPitch = -0.3 * k;
      Q.kneeOut = k;
      for (let i = 0; i < 2; i++) {
        const s = i ? 1 : -1;
        const F = FOOT[i];
        const fx = s * lerp(0.1, 0.04, k);
        const fy = lerp(ANK, 0.09, k);
        const fz = lerp(0, -0.25, k);
        Q[F.x] = fx;
        Q[F.y] = fy;
        Q[F.z] = fz;
        Q[F.yaw] = s * lerp(-0.1, 0.95, k);
        Q[F.p] = 0.1 * k;
        Q[ARM[i].ik] = k;
        ctx.handAt(Q, i, fx + s * 0.035, fy + 0.04, fz + 0.02);
      }
      breath(Q, t, k * 0.6);
      break;
    }
  }
}
