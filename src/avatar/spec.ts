// Character look + personality specs and shared rig dimensions.
import type { CharacterId, RideId } from '../contracts';

/** Rig dimensions (metres). The rig faces -Z; +X is the runner's right. */
export const DIM = {
  thigh: 0.23,
  shin: 0.225,
  ankle: 0.085, // ankle joint above the shoe sole
  hipH: 0.54, // standing hip-joint height (thigh + shin + ankle)
  hipX: 0.088,
  spineY: 0.06, // spine root above the hip joint
  neckY: 0.31, // head bone above the spine root
  headC: 0.25, // head-centre above the head bone
  head: [0.255, 0.25, 0.236] as const, // head ellipsoid radii (x, y, z)
  shoulderX: 0.19,
  shoulderY: 0.255,
  upperArm: 0.155,
  foreArm: 0.15,
  hand: 0.045, // hand centre beyond the wrist
};

export interface RideColours {
  frame: number;
  accent: number;
  accent2: number;
  seat: number;
  grip: number;
  tyre: number;
  rim: number;
  wheel: number;
  metal: number;
}

export interface Personality {
  /** Vertical bounce multiplier for running / idle hops. */
  bounce: number;
  /** Hip sway / swish multiplier. */
  sway: number;
  /** Arm swing amplitude multiplier. */
  arms: number;
  /** Cadence multiplier. */
  cadence: number;
  /** Skateboard stance: 1 = regular (left foot forward, faces +X), -1 = goofy. */
  stance: 1 | -1;
  /** Which side the bike/scooter duck leans to (1 = right). */
  duckSide: 1 | -1;
}

export interface CharSpec {
  id: CharacterId;
  name: string;
  height: number;
  skin: number;
  lid: number;
  blush: number;
  nose: number;
  hair: number;
  hairHi: number;
  brow: number;
  iris: number;
  lash: number;
  top: number;
  topDark: number;
  trim: number;
  bottom: number;
  bottomTrim: number;
  sock: number;
  shoe: number;
  sole: number;
  stripe: number;
  lace: number;
  /** Long sleeves (Ace's hoodie) vs short sleeves (Moana's tee). */
  longSleeves: boolean;
  /** Leg covering: shorts above the knee or 3/4 leggings. */
  leggings: boolean;
  rides: Record<Exclude<RideId, 'shoes'>, RideColours>;
  p: Personality;
}

export const ACE: CharSpec = {
  id: 'ace',
  name: 'Ace',
  height: 1.45,
  skin: 0xf3caa6,
  lid: 0xe6b794,
  blush: 0xf0a296,
  nose: 0xe9b494,
  hair: 0x7a4f34,
  hairHi: 0x8c5d3e,
  brow: 0x6b4530,
  iris: 0x6a4429,
  lash: 0x3a2a22,
  top: 0xeebb58, // mustard hoodie
  topDark: 0xd3a24a,
  trim: 0xf6efe2,
  bottom: 0x3f5a6a,
  bottomTrim: 0x35505f,
  sock: 0xf6efe2,
  shoe: 0xf7f3ec,
  sole: 0x4fa39c,
  stripe: 0xe2a94e,
  lace: 0xf0e6d2,
  longSleeves: true,
  leggings: false,
  rides: {
    bike: { frame: 0x3f8fd0, accent: 0xffc94a, accent2: 0xf6efe2, seat: 0x3b4652, grip: 0xffc94a, tyre: 0x3a4048, rim: 0xe9eef2, wheel: 0xffc94a, metal: 0xc9d2da },
    scooter: { frame: 0x2fb5a8, accent: 0xffc94a, accent2: 0xf6efe2, seat: 0x2b3440, grip: 0xe2a94e, tyre: 0x3a4048, rim: 0xe9eef2, wheel: 0xffe066, metal: 0xcfd6dc },
    skate: { frame: 0xffc94a, accent: 0x2fb5a8, accent2: 0xf6efe2, seat: 0x2f3640, grip: 0x353c45, tyre: 0x3a4048, rim: 0xe9eef2, wheel: 0xfff1d6, metal: 0xc6cfd8 },
  },
  p: { bounce: 1.25, sway: 0.6, arms: 1.12, cadence: 1.06, stance: 1, duckSide: -1 },
};

export const MOANA: CharSpec = {
  id: 'moana',
  name: 'Moana',
  height: 1.55,
  skin: 0xa86e4b,
  lid: 0x9a6343,
  blush: 0xd9786a,
  nose: 0x9c6343,
  hair: 0x2a1c17,
  hairHi: 0x3a2820,
  brow: 0x221612,
  iris: 0x3d2617,
  lash: 0x1d1411,
  top: 0x2fb5a8, // teal sporty tee
  topDark: 0x27978d,
  trim: 0xff7a6b, // coral raglan sleeves + hem
  bottom: 0x4b4f80, // indigo 3/4 leggings
  bottomTrim: 0xff8f7f,
  sock: 0xfbf7ef,
  shoe: 0xff8676,
  sole: 0xfbf7ef,
  stripe: 0xffe066,
  lace: 0xfff4e0,
  longSleeves: false,
  leggings: true,
  rides: {
    bike: { frame: 0xff7a6b, accent: 0x2fb5a8, accent2: 0xffe066, seat: 0xf6efe2, grip: 0x2fb5a8, tyre: 0x3a4048, rim: 0xf2f4f6, wheel: 0x2fb5a8, metal: 0xd0d6dc },
    scooter: { frame: 0xb59cf0, accent: 0xff7a6b, accent2: 0xfff4e0, seat: 0x2b3440, grip: 0xff7a6b, tyre: 0x3a4048, rim: 0xf2f4f6, wheel: 0x7fdcc0, metal: 0xe3e8ee },
    skate: { frame: 0xff7a6b, accent: 0xffe066, accent2: 0x7fdcc0, seat: 0x2f3640, grip: 0x353c45, tyre: 0x3a4048, rim: 0xf2f4f6, wheel: 0xb59cf0, metal: 0xc6cfd8 },
  },
  p: { bounce: 0.85, sway: 1.35, arms: 0.95, cadence: 1.0, stance: -1, duckSide: 1 },
};

export const SPECS: Record<CharacterId, CharSpec> = { ace: ACE, moana: MOANA };
