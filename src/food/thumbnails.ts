// Renders every food model once into small transparent PNG thumbnails (3/4 view, soft studio light)
// using one temporary WebGLRenderer that is disposed (forceContextLoss) afterwards.
import * as THREE from 'three';
import { FOODS } from '../content/foods';
import { createFoodModel } from './models';

const thumbs: Record<string, string> = {};
let pending: Promise<Record<string, string>> | null = null;
let renderedSize = 0;

const nextFrame = () => new Promise<void>((res) => setTimeout(res, 0));

async function renderAll(size: number): Promise<Record<string, string>> {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  } catch {
    return thumbs; // no WebGL: callers fall back to their own placeholder
  }
  renderer.setPixelRatio(1);
  renderer.setSize(size, size, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff6e8, 0xb8c8d8, 1.7));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(2.5, 4, 3.5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xcfe6ff, 1.0);
  rim.position.set(-3, 2, -2.5);
  scene.add(rim);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 20);
  const dir = new THREE.Vector3(0.55, 0.42, 1).normalize();
  const box = new THREE.Box3();
  const sphere = new THREE.Sphere();

  for (let i = 0; i < FOODS.length; i++) {
    const id = FOODS[i].id;
    const model = createFoodModel(id);
    model.rotation.y = -0.35;
    scene.add(model);
    model.updateMatrixWorld(true);
    box.setFromObject(model);
    box.getBoundingSphere(sphere);
    const dist = (sphere.radius * 1.08) / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.position.copy(sphere.center).addScaledVector(dir, dist);
    camera.lookAt(sphere.center);
    camera.near = Math.max(0.01, dist - sphere.radius * 2);
    camera.far = dist + sphere.radius * 2;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    thumbs[id] = canvas.toDataURL('image/png');
    scene.remove(model);
    if (i % 6 === 5) await nextFrame();
  }

  renderer.dispose();
  renderer.forceContextLoss();
  renderedSize = size;
  return thumbs;
}

/**
 * Render (once) a transparent thumbnail dataURL for every food id. Cached: later calls with the
 * same or a smaller size resolve immediately.
 */
export function renderFoodThumbnails(size = 192): Promise<Record<string, string>> {
  if (renderedSize >= size && Object.keys(thumbs).length) return Promise.resolve(thumbs);
  if (!pending) pending = renderAll(size).finally(() => (pending = null));
  return pending;
}

/** Sync lookup after renderFoodThumbnails() resolved; null if not rendered yet. */
export function foodThumbnail(id: string): string | null {
  return thumbs[id] ?? null;
}
