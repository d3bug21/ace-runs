// Generic obstacle patterns (used when a stage has no fitting authored pattern).
// Lanes may be mirrored by the engine at random; every pattern stays passable.
import type { ObstacleKind, PatternItem, StagePattern } from '../contracts';
import { HIGH_CLEARANCE, LOW_MAX, PLATFORM_TOP } from '../contracts';

export const DEFAULT_LENGTH: Record<ObstacleKind, number> = {
  low: 1.0,
  high: 1.0,
  block: 2.0,
  platform: 16,
  ramp: 5,
  moverBlock: 1.6,
  moverLow: 1.0,
};
export const DEFAULT_HEIGHT: Record<ObstacleKind, number> = {
  low: 0.8,
  high: 2.6,
  block: 2.8,
  platform: PLATFORM_TOP,
  ramp: PLATFORM_TOP,
  moverBlock: 2.0,
  moverLow: 0.7,
};
void HIGH_CLEARANCE;
void LOW_MAX;

const I = (dz: number, lane: -1 | 0 | 1, kind: ObstacleKind, extra: Partial<PatternItem> = {}): PatternItem => ({ dz, lane, kind, ...extra });
/** A ramp then a platform in one lane, starting at dz. */
const train = (dz: number, lane: -1 | 0 | 1, len = 16, ramp = true): PatternItem[] => {
  const out: PatternItem[] = [];
  if (ramp) out.push(I(dz + 2.5, lane, 'ramp', { length: 5 }));
  const p0 = dz + (ramp ? 5 : 0);
  out.push(I(p0 + len / 2, lane, 'platform', { length: len }));
  return out;
};

export const GENERIC_PATTERNS: StagePattern[] = [
  // difficulty 1 - one clear idea at a time
  { id: 'g-block-mid', difficulty: 1, length: 4, items: [I(1, 0, 'block')] },
  { id: 'g-block-side', difficulty: 1, length: 4, items: [I(1, -1, 'block')] },
  { id: 'g-gate', difficulty: 1, length: 4, items: [I(1, -1, 'block'), I(1, 1, 'block')] },
  { id: 'g-jump-all', difficulty: 1, length: 2, items: [I(0.5, 0, 'low', { laneSpan: 3 })] },
  { id: 'g-slide-all', difficulty: 1, length: 2, items: [I(0.5, 0, 'high', { laneSpan: 3 })] },
  { id: 'g-low-pair', difficulty: 1, length: 2, items: [I(0.5, -1, 'low'), I(0.5, 0, 'low')] },
  { id: 'g-train', difficulty: 1, length: 22, items: [...train(0, 0, 16)] },
  { id: 'g-low-block', difficulty: 1, length: 4, items: [I(1, -1, 'low'), I(1, 0, 'low'), I(1, 1, 'block')] },
  // difficulty 2 - two ideas, short rhythm
  { id: 'g-zig', difficulty: 2, length: 30, items: [I(1, -1, 'block'), I(1, 0, 'block'), I(15, 0, 'block'), I(15, 1, 'block')] },
  { id: 'g-jump-slide', difficulty: 2, length: 16, items: [I(0.5, 0, 'low', { laneSpan: 3 }), I(14, 0, 'high', { laneSpan: 3 })] },
  {
    id: 'g-twin-trains',
    difficulty: 2,
    length: 24,
    items: [...train(0, -1, 18), ...train(5, 1, 14, false), I(11, 0, 'block')],
  },
  { id: 'g-mover', difficulty: 2, length: 4, items: [I(1, -1, 'moverBlock', { dir: 1 })] },
  { id: 'g-roller', difficulty: 2, length: 3, items: [I(1, 1, 'moverLow', { dir: -1 })] },
  { id: 'g-mixed-row', difficulty: 2, length: 4, items: [I(1, -1, 'low'), I(1, 0, 'block'), I(1, 1, 'high')] },
  // difficulty 3 - flowing combos
  {
    id: 'g-roof-run',
    difficulty: 3,
    length: 26,
    items: [...train(0, 0, 20), ...train(5, -1, 18, false), ...train(5, 1, 18, false)],
  },
  {
    id: 'g-gauntlet',
    difficulty: 3,
    length: 34,
    items: [I(0.5, 0, 'low', { laneSpan: 3 }), I(12, -1, 'block'), I(12, 0, 'block'), I(24, 0, 'high', { laneSpan: 3 })],
  },
  {
    id: 'g-weave',
    difficulty: 3,
    length: 40,
    items: [I(1, 0, 'block'), I(1, 1, 'block'), I(14, -1, 'block'), I(14, 0, 'low'), I(27, 1, 'block'), I(27, 0, 'high')],
  },
];
