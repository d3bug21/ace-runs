// Flat numeric pose used to blend procedural animation layers without allocations.
//
// Conventions (rig faces -Z):
//   root*/ride* angles are raw Euler values (rotation.x = pitch, positive lifts the nose;
//   rotation.z = roll, positive tips the top toward -X / screen left).
//   hPitch / sPitch / nPitch: positive = lean / nod FORWARD (applied as rotation.x = -value).
//   hRoll / sRoll / nRoll / *Yaw: raw rotation.z / rotation.y.
//   Arms (shoulder Euler order ZYX): a?x swing (+ forward), a?y twist, a?z raise (right +, left -),
//   e? elbow bend (+ bends forward). ik? = 0..1 weight toward the grip target g?.
//   Feet: ankle targets f?x/y/z (rideRoot space; f?r = 0..1 follows the ride transform),
//   f?p toe pitch (+ = toe up), f?yaw absolute foot yaw.
export const POSE_KEYS = [
  'rootX', 'rootY', 'rootZ', 'rootPitch', 'rootRoll', 'rootYaw',
  'rideY', 'rideZ', 'ridePitch', 'rideRoll', 'rideYaw', 'squash', 'steer',
  'hx', 'hy', 'hz', 'hPitch', 'hRoll', 'hYaw',
  'sPitch', 'sRoll', 'sYaw',
  'nPitch', 'nRoll', 'nYaw',
  'aLx', 'aLy', 'aLz', 'eL', 'aRx', 'aRy', 'aRz', 'eR',
  'ikL', 'ikR', 'gLx', 'gLy', 'gLz', 'gRx', 'gRy', 'gRz',
  'fLx', 'fLy', 'fLz', 'fLp', 'fLyaw', 'fLr',
  'fRx', 'fRy', 'fRz', 'fRp', 'fRyaw', 'fRr',
  'bicep',
] as const;

export type PoseKey = (typeof POSE_KEYS)[number];
export type Pose = Record<PoseKey, number>;

export function newPose(): Pose {
  const p = {} as Pose;
  for (const k of POSE_KEYS) p[k] = 0;
  return p;
}

export function copyPose(dst: Pose, src: Pose): void {
  for (const k of POSE_KEYS) dst[k] = src[k];
}

export function lerpPose(dst: Pose, to: Pose, w: number): void {
  if (w <= 0) return;
  if (w >= 1) {
    copyPose(dst, to);
    return;
  }
  for (const k of POSE_KEYS) dst[k] += (to[k] - dst[k]) * w;
}

/** Foot accessors by index (0 = left, 1 = right). */
export const FOOT = [
  { x: 'fLx', y: 'fLy', z: 'fLz', p: 'fLp', yaw: 'fLyaw', r: 'fLr' },
  { x: 'fRx', y: 'fRy', z: 'fRz', p: 'fRp', yaw: 'fRyaw', r: 'fRr' },
] as const;

export const ARM = [
  { x: 'aLx', y: 'aLy', z: 'aLz', e: 'eL', ik: 'ikL', gx: 'gLx', gy: 'gLy', gz: 'gLz' },
  { x: 'aRx', y: 'aRy', z: 'aRz', e: 'eR', ik: 'ikR', gx: 'gRx', gy: 'gRy', gz: 'gRz' },
] as const;
