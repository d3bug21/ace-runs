// Analytic two-bone IK used for legs (pedals, decks, ground contact) and arms (handlebars).
import * as THREE from 'three';

const D = new THREE.Vector3();
const dir = new THREE.Vector3();
const perp = new THREE.Vector3();
const elbowDir = new THREE.Vector3();
const E = new THREE.Vector3();
const T = new THREE.Vector3();
const fore = new THREE.Vector3();
const X = new THREE.Vector3();
const Y = new THREE.Vector3();
const Z = new THREE.Vector3();
const M = new THREE.Matrix4();
const fallback = new THREE.Vector3();

export interface TwoBoneResult {
  /** Upper bone orientation in its parent's space. */
  upper: THREE.Quaternion;
  /** Lower bone hinge angle (applied as rotation.x on the lower bone). */
  bend: number;
}

/**
 * Solve a two-bone chain. Bones point down their local -Y; the lower bone hinges about its local X.
 * `hinge = +1`: the lower bone bends toward the upper's local -Z (elbows; pole = where the elbow points).
 * `hinge = -1`: bends toward +Z (knees; pole = where the knee points).
 * `start`, `target` and `pole` are all expressed in the upper bone's parent space.
 */
export function solveTwoBone(start: THREE.Vector3, target: THREE.Vector3, pole: THREE.Vector3, a: number, b: number, hinge: 1 | -1, out: TwoBoneResult): TwoBoneResult {
  D.subVectors(target, start);
  let d = D.length();
  if (d < 1e-5) {
    D.set(0, -1, 0);
    d = 1e-5;
  }
  dir.copy(D).divideScalar(d);
  d = THREE.MathUtils.clamp(d, Math.abs(a - b) + 1e-3, a + b - 1e-4);
  const cosB = THREE.MathUtils.clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
  const sinB = Math.sqrt(1 - cosB * cosB);
  perp.copy(pole).addScaledVector(dir, -pole.dot(dir));
  if (perp.lengthSq() < 1e-8) {
    fallback.set(0, 0, hinge > 0 ? 1 : -1);
    perp.copy(fallback).addScaledVector(dir, -fallback.dot(dir));
    if (perp.lengthSq() < 1e-8) perp.set(1, 0, 0);
  }
  perp.normalize();
  elbowDir.copy(dir).multiplyScalar(cosB).addScaledVector(perp, sinB);
  E.copy(start).addScaledVector(elbowDir, a);
  T.copy(start).addScaledVector(dir, d);
  fore.subVectors(T, E).normalize();
  // Upper basis: -Y along the bone; Z chosen so the lower bone bends in the right direction.
  Y.copy(elbowDir).negate();
  Z.copy(fore).addScaledVector(elbowDir, -fore.dot(elbowDir));
  if (Z.lengthSq() < 1e-8) Z.copy(perp).negate();
  Z.normalize();
  if (hinge > 0) Z.negate();
  X.crossVectors(Y, Z).normalize();
  Z.crossVectors(X, Y).normalize();
  M.makeBasis(X, Y, Z);
  out.upper.setFromRotationMatrix(M);
  const cosC = THREE.MathUtils.clamp((a * a + b * b - d * d) / (2 * a * b), -1, 1);
  out.bend = hinge * (Math.PI - Math.acos(cosC));
  return out;
}
