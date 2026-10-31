// Effect surfaces and small props: shield bubble, ground rings, speed streaks, height chart,
// snail buddy and the little junk cloud.
import * as THREE from 'three';
import { geo } from '../kit/kit';
import { buildProp, propSweep, propExtrude, type PropBuilder } from '../food/models';

const TAU = Math.PI * 2;
const HALF = Math.PI / 2;

// ------------------------------------------------------------------ shield bubble
export function makeShieldMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0x7fe8d6) },
      uAlpha: { value: 0 },
      uTime: { value: 0 },
      uFlash: { value: 0 },
      uHit: { value: 0 },
      uHitDir: { value: new THREE.Vector3(0, 0, 1) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        vP = position;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uAlpha, uTime, uFlash, uHit; uniform vec3 uHitDir;
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main() {
        vec3 n = normalize(vN);
        float fr = 1.0 - abs(dot(n, normalize(vV)));
        float rim = pow(fr, 2.2);
        float bands = 0.5 + 0.5 * sin(vP.y * 16.0 - uTime * 2.4 + sin(vP.x * 6.0 + uTime) * 1.5);
        float hit = uHit * smoothstep(0.55, 1.0, dot(normalize(vP), uHitDir));
        float glint = pow(max(0.0, dot(n, normalize(vec3(-0.45, 0.75, 0.5)))), 36.0);
        float a = uAlpha * (0.05 + rim * 0.8 + bands * rim * 0.3 + glint * 0.9) + hit * 0.7 + uFlash * (0.25 + rim * 0.6);
        vec3 col = mix(uColor, vec3(1.0), clamp(glint + uFlash * 0.6 + hit * 0.6, 0.0, 1.0));
        gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

// ------------------------------------------------------------------ ground rings
/** mode 0 = aura ring with fill, 1 = thin pulse ring, 2 = inward magnet ripples. */
export function makeGroundMaterial(mode: 0 | 1 | 2, color: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uAlpha: { value: 0 },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uAlpha, uTime;
      varying vec2 vUv;
      void main() {
        vec2 d = vUv - 0.5;
        float r = length(d) * 2.0;
        float a = 0.0;
        ${
          mode === 0
            ? `float ring = smoothstep(0.6, 0.76, r) * (1.0 - smoothstep(0.8, 1.0, r));
               float fill = (1.0 - smoothstep(0.0, 0.85, r)) * 0.4;
               float sh = 0.8 + 0.2 * sin(atan(d.y, d.x) * 7.0 + uTime * 2.2);
               a = (ring * 0.95 + fill) * sh;`
            : mode === 1
              ? `a = smoothstep(0.72, 0.9, r) * (1.0 - smoothstep(0.92, 1.0, r));`
              : `float f = fract(r * 3.0 + uTime * 0.8);
                 a = smoothstep(0.0, 0.12, f) * (1.0 - smoothstep(0.12, 0.42, f));
                 a *= (1.0 - smoothstep(0.65, 1.0, r)) * smoothstep(0.12, 0.3, r);`
        }
        gl_FragColor = vec4(uColor, clamp(a * uAlpha, 0.0, 1.0));
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

export function groundQuad(m: THREE.Material): THREE.Mesh {
  const me = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m);
  me.rotation.x = -HALF;
  me.position.y = 0.03;
  me.renderOrder = 6;
  me.frustumCulled = false;
  me.visible = false;
  return me;
}

// ------------------------------------------------------------------ speed streaks
export function makeStreaks(n: number): THREE.InstancedMesh {
  const m = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const g = new THREE.BoxGeometry(0.035, 0.035, 2.4);
  const im = new THREE.InstancedMesh(g, m, n);
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) im.setColorAt(i, c.setHex(i % 3 === 0 ? 0xffe066 : 0xffffff));
  im.frustumCulled = false;
  im.visible = false;
  im.renderOrder = 7;
  return im;
}

// ------------------------------------------------------------------ height chart (grow strong)
function starShape(R: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = HALF + (i * Math.PI) / 5;
    const rr = i % 2 ? r : R;
    if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  s.closePath();
  return s;
}

export interface HeightChart {
  root: THREE.Group;
  board: THREE.Group;
  star: THREE.Group;
  sprout: THREE.Group;
  height: number;
}

export function makeHeightChart(): HeightChart {
  const H = 1.75;
  const root = new THREE.Group();
  const board = buildProp((b: PropBuilder) => {
    b.add(geo.rbox(0.44, H, 0.07, 0.06, 3), 0xfff4e0, {}, [0, H / 2, 0]);
    const bands = [0xff7a6b, 0xffb38a, 0xffe066, 0x7fdcc0, 0x9fd6f0, 0xb59cf0];
    const bh = (H - 0.1) / bands.length;
    bands.forEach((c, i) => b.add(geo.rbox(0.12, bh - 0.012, 0.08, 0.02, 2), c, {}, [-0.13, 0.05 + bh * (i + 0.5), 0.004]));
    for (let i = 1; i < 16; i++) {
      const y = i * 0.1;
      const long = i % 5 === 0;
      b.add(geo.rbox(long ? 0.17 : 0.1, 0.018, 0.08, 0.006, 1), 0x2b3440, {}, [long ? 0.06 : 0.095, y, 0.006]);
    }
    // little round top with a smile
    b.add(geo.cyl(0.16, 0.16, 0.07, 24), 0x2fb5a8, {}, [0, H + 0.06, 0], [HALF, 0, 0]);
    b.add(geo.torus(0.05, 0.012, 6, 14, Math.PI), 0xffffff, {}, [0, H + 0.05, 0.04], [0, 0, Math.PI]);
    for (const x of [-0.045, 0.045]) b.add(geo.sphere(0.016, 8, 6), 0xffffff, {}, [x, H + 0.1, 0.04]);
    // feet
    b.add(geo.rbox(0.62, 0.06, 0.26, 0.03, 2), 0xc98f5a, {}, [0, 0.03, 0]);
  });
  const star = buildProp((b) => {
    b.add(propExtrude(starShape(0.15, 0.065), 0.05, 0.02), 0xffc94a, { k: 'gloss' });
    b.add(geo.sphere(0.03, 8, 6), 0xffffff, { k: 'glow' }, [-0.04, 0.05, 0.05], [0, 0, 0], [1, 0.6, 0.3]);
  });
  star.position.set(0.0, 0.2, 0.1);
  const sprout = buildProp((b) => {
    b.add(geo.sphere(0.1, 12, 8), 0x9a6a40, { k: 'rough' }, [0, 0, 0], [0, 0, 0], [1, 0.35, 1]);
    b.add(propSweep([[0, 0, 0], [0.02, 0.12, 0], [0, 0.24, 0]], () => 0.014, 8, 6), 0x5aa557);
    b.add(geo.sphere(1, 12, 8), 0x7cc46a, { k: 'gloss' }, [-0.07, 0.22, 0], [0, 0, 0.5], [0.08, 0.03, 0.045]);
    b.add(geo.sphere(1, 12, 8), 0x7cc46a, { k: 'gloss' }, [0.07, 0.25, 0], [0, 0, -0.5], [0.08, 0.03, 0.045]);
  });
  sprout.position.set(0.36, 0.03, 0.12);
  root.add(board, star, sprout);
  root.visible = false;
  return { root, board, star, sprout, height: H };
}

// ------------------------------------------------------------------ snail buddy (slow)
export interface Snail {
  root: THREE.Group;
  body: THREE.Group;
  shell: THREE.Group;
}

export function makeSnail(): Snail {
  const root = new THREE.Group();
  const body = buildProp((b) => {
    b.add(geo.capsule(0.075, 0.3, 10), 0xffd98a, {}, [0, 0.07, 0], [HALF, 0, 0], [1, 1, 0.75]);
    b.add(geo.sphere(0.09, 16, 12), 0xffd98a, {}, [0, 0.13, -0.2]);
    for (const x of [-0.04, 0.04]) {
      b.add(propSweep([[x, 0.19, -0.22], [x * 1.6, 0.27, -0.24], [x * 2.2, 0.33, -0.22]], () => 0.012, 8, 6), 0xffd98a);
      b.add(geo.sphere(0.035, 12, 10), 0xffffff, { k: 'gloss' }, [x * 2.2, 0.35, -0.22]);
      b.add(geo.sphere(0.017, 8, 6), 0x2b3440, { k: 'gloss' }, [x * 2.2, 0.35, -0.188]);
      // sleepy lids
      b.add(new THREE.SphereGeometry(0.037, 12, 6, 0, TAU, 0, 1.3), 0xf6c66e, {}, [x * 2.2, 0.352, -0.22], [0.45, 0, 0]);
    }
    b.add(geo.torus(0.03, 0.008, 6, 12, Math.PI), 0x2b3440, {}, [0, 0.12, -0.285], [0, 0, Math.PI]);
    for (const x of [-0.055, 0.055]) b.add(geo.sphere(0.014, 8, 6), 0xff9fc0, {}, [x, 0.13, -0.275]);
  });
  const shell = buildProp((b) => {
    b.add(geo.sphere(0.14, 20, 16), 0xb59cf0, { k: 'gloss' }, [0, 0, 0], [0, 0, 0], [0.75, 1, 1]);
    for (const side of [1, -1]) {
      const pts: [number, number, number][] = [];
      for (let i = 0; i <= 40; i++) {
        const th = (i / 40) * Math.PI * 3.2;
        const r = 0.012 + (i / 40) * 0.105;
        pts.push([side * (0.104 - (i / 40) * 0.0), Math.sin(th) * r, Math.cos(th) * r]);
      }
      b.add(propSweep(pts, () => 0.012, 60, 5), 0x8f74d6, {});
    }
  });
  shell.position.set(0, 0.2, 0.04);
  body.add(shell);
  root.add(body);
  root.visible = false;
  return { root, body, shell };
}

// ------------------------------------------------------------------ little junk cloud
export function makeCloud(): THREE.Group {
  const g = buildProp((b) => {
    const puffs: [number, number, number, number][] = [
      [0, 0.02, 0, 0.17],
      [-0.17, -0.03, 0.0, 0.12],
      [0.17, -0.03, 0.0, 0.13],
      [-0.08, 0.1, -0.02, 0.12],
      [0.09, 0.09, -0.02, 0.11],
    ];
    for (const [x, y, z, r] of puffs) b.add(geo.sphere(1, 16, 12), 0xc5ced8, { cf: (_p, n) => (n.y > 0.35 ? 0xe2e8ee : n.y < -0.4 ? 0xaab5c2 : 0xc5ced8) }, [x, y, z], [0, 0, 0], [r, r * 0.85, r * 0.9]);
    // sleepy closed eyes + tiny "o" mouth (a gentle, cute cloud)
    for (const x of [-0.07, 0.07]) b.add(geo.torus(0.028, 0.008, 5, 10, Math.PI), 0x66727f, {}, [x, 0.03, 0.155], [0, 0, Math.PI]);
    b.add(geo.torus(0.016, 0.007, 5, 10), 0x66727f, {}, [0, -0.04, 0.16]);
  });
  g.visible = false;
  return g;
}
