// 3D backdrop behind the menus: the kids on a sunny podium with floating food friends.
import * as THREE from 'three';
import type { Avatar, AvatarMotion, CharacterId, RideId, StageId } from '../contracts';
import { blobShadow, damp, geo, mat, PAL } from '../kit/kit';
import type { MenuSceneOptions } from './api';
import { createAvatar, createFoodModel } from './modules';

const STAGE_TINT: Record<StageId, [number, number]> = {
  indoor: [0xffe9c7, 0xffc9a8],
  arcade: [0x3b3f78, 0x6a4c9c],
  outdoor: [0xbfe6f5, 0xfff1c9],
  sports: [0xa9dcf2, 0xd8f0c6],
  jungle: [0xbfe8c8, 0x7fc79a],
  parks: [0xd7ecf7, 0xf4e3c8],
};

function idleMotion(t: number, dt: number, celebrate: number): AvatarMotion {
  return {
    time: t, dt, speed: 0, lateral: 0, airborne: false, vy: 0, jumpT: -1, sliding: false, slideT: -1,
    landT: 999, bumpT: 999, boost: 0, sleepy: 0, wobble: 0, mood: 1, flex: 0, celebrate, menu: true,
  };
}

interface Slot {
  avatar: Avatar;
  key: string;
  target: THREE.Vector3;
  targetRot: number;
  celebrate: number;
  celebrateTarget: number;
  shadow: THREE.Mesh;
}

export class MenuScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
  private slots = new Map<CharacterId, Slot>();
  private foods: { obj: THREE.Object3D; a: number; r: number; h: number; s: number }[] = [];
  private t = 0;
  private opts: MenuSceneOptions = { view: 'title', character: 'ace', ride: 'shoes' };
  private bgTop = new THREE.Color(PAL.sky);
  private bgBottom = new THREE.Color(PAL.cream);
  private bgTarget: [THREE.Color, THREE.Color] = [new THREE.Color(PAL.sky), new THREE.Color(PAL.cream)];
  private bgTex: THREE.CanvasTexture;
  private bgCanvas = document.createElement('canvas');
  private camPos = new THREE.Vector3(0, 1.6, 7);
  private camLook = new THREE.Vector3(0, 1, 0);
  private podium: THREE.Group;
  private confetti: THREE.InstancedMesh;
  private confettiState: { p: THREE.Vector3; v: THREE.Vector3; r: number }[] = [];
  private dummy = new THREE.Object3D();
  aspect = 1;

  constructor() {
    this.bgCanvas.width = 4;
    this.bgCanvas.height = 256;
    this.bgTex = new THREE.CanvasTexture(this.bgCanvas);
    this.bgTex.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = this.bgTex;
    this.paintBg();
    this.scene.add(new THREE.HemisphereLight(0xfff6e8, 0x9cc7a8, 1.7));
    const key = new THREE.DirectionalLight(0xfff0dc, 2.0);
    key.position.set(4, 8, 6);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xbfe6ff, 0.9);
    rim.position.set(-6, 4, -5);
    this.scene.add(rim);

    // Podium: a soft round island of grass with a cream rim.
    this.podium = new THREE.Group();
    const base = new THREE.Mesh(geo.cyl(3.3, 3.5, 0.5, 48), mat(PAL.cream, { rough: 0.85 }));
    base.position.y = -0.25;
    const top = new THREE.Mesh(geo.cyl(3.15, 3.15, 0.08, 48), mat(PAL.grass, { rough: 0.9 }));
    top.position.y = 0.0;
    const ring = new THREE.Mesh(geo.torus(3.32, 0.09, 8, 64), mat(PAL.teal, { rough: 0.6 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.02;
    this.podium.add(base, top, ring);
    // A few flowers and tufts.
    const flowerCols = [PAL.coral, PAL.sun, PAL.pink, PAL.white];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + 0.2;
      const r = 2.55 + (i % 3) * 0.18;
      const f = new THREE.Mesh(geo.sphere(0.08, 8, 6), mat(flowerCols[i % flowerCols.length]));
      f.position.set(Math.cos(a) * r, 0.12, Math.sin(a) * r);
      this.podium.add(f);
    }
    this.scene.add(this.podium);

    // Floating food friends orbiting gently.
    const ids = ['carrot_sticks', 'kiwifruit', 'banana', 'broccoli', 'milk', 'feijoa', 'water', 'apple_slices', 'kumara', 'egg'];
    ids.forEach((id, i) => {
      const obj = createFoodModel(id);
      obj.scale.setScalar(0.62);
      this.scene.add(obj);
      this.foods.push({ obj, a: (i / ids.length) * Math.PI * 2, r: 4.2 + (i % 2) * 0.7, h: 2.3 + (i % 3) * 0.55, s: 0.12 + (i % 3) * 0.03 });
    });

    // Confetti for celebrations.
    const cg = new THREE.PlaneGeometry(0.12, 0.07);
    const cm = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, vertexColors: false });
    this.confetti = new THREE.InstancedMesh(cg, cm, 90);
    const cols = [PAL.coral, PAL.sun, PAL.teal, PAL.sea, PAL.berry, PAL.mint, PAL.lemon];
    for (let i = 0; i < 90; i++) {
      this.confetti.setColorAt(i, new THREE.Color(cols[i % cols.length]));
      this.confettiState.push({ p: new THREE.Vector3(0, -50, 0), v: new THREE.Vector3(), r: Math.random() * 6 });
    }
    this.confetti.frustumCulled = false;
    this.scene.add(this.confetti);
  }

  private paintBg(): void {
    const g = this.bgCanvas.getContext('2d')!;
    const grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, `#${this.bgTop.getHexString()}`);
    grd.addColorStop(1, `#${this.bgBottom.getHexString()}`);
    g.fillStyle = grd;
    g.fillRect(0, 0, 4, 256);
    this.bgTex.needsUpdate = true;
  }

  private ensure(c: CharacterId, ride: RideId): Slot {
    const key = `${c}:${ride}`;
    let s = this.slots.get(c);
    if (s && s.key === key) return s;
    if (s) {
      this.scene.remove(s.avatar.root, s.shadow);
      s.avatar.dispose();
    }
    const avatar = createAvatar(c, ride);
    const shadow = blobShadow(1.6, 1.6, 0.3);
    this.scene.add(avatar.root, shadow);
    const prev = s;
    s = { avatar, key, target: new THREE.Vector3(), targetRot: 0, celebrate: 0, celebrateTarget: 0, shadow };
    if (prev) {
      avatar.root.position.copy(prev.target);
      s.target.copy(prev.target);
    }
    this.slots.set(c, s);
    return s;
  }

  show(o: MenuSceneOptions): void {
    const prevView = this.opts.view;
    this.opts = o;
    const both = o.view === 'title' || o.view === 'character';
    const other: CharacterId = o.character === 'ace' ? 'moana' : 'ace';
    const main = this.ensure(o.character, o.view === 'title' || o.view === 'character' ? 'shoes' : o.ride);
    main.target.set(both ? (o.character === 'ace' ? -0.95 : 0.95) : 0, 0, both ? 0.35 : 0);
    main.targetRot = both ? (o.character === 'ace' ? 0.25 : -0.25) : 0;
    main.celebrateTarget = o.view === 'results' ? (o.celebrate === false ? 0 : 1) : 0;
    if (both) {
      const s2 = this.ensure(other, 'shoes');
      s2.target.set(other === 'ace' ? -0.95 : 0.95, 0, o.view === 'character' ? -0.35 : 0.35);
      s2.targetRot = other === 'ace' ? 0.25 : -0.25;
      s2.celebrateTarget = 0;
      s2.avatar.root.visible = true;
      s2.shadow.visible = true;
    } else {
      const s2 = this.slots.get(other);
      if (s2) {
        s2.avatar.root.visible = false;
        s2.shadow.visible = false;
      }
    }
    main.avatar.root.visible = true;
    main.shadow.visible = true;
    if (o.view === 'character' && prevView === 'character') main.avatar.setExpression('grin', 1.2);
    if (o.view === 'results' && o.celebrate !== false) this.burst();
    const tint = STAGE_TINT[o.stage ?? 'outdoor'];
    const top = o.view === 'stage' || o.view === 'results' ? tint[0] : PAL.sky;
    const bottom = o.view === 'stage' || o.view === 'results' ? tint[1] : PAL.cream;
    this.bgTarget = [new THREE.Color(top), new THREE.Color(bottom)];
  }

  /** Celebrate with confetti. */
  burst(): void {
    for (const c of this.confettiState) {
      c.p.set((Math.random() - 0.5) * 2, 2.2 + Math.random(), (Math.random() - 0.5) * 1.5);
      c.v.set((Math.random() - 0.5) * 6, 4 + Math.random() * 4, (Math.random() - 0.5) * 4);
    }
  }

  update(dt: number): void {
    this.t += dt;
    const t = this.t;
    // Background colour drift.
    this.bgTop.lerp(this.bgTarget[0], 1 - Math.exp(-3 * dt));
    this.bgBottom.lerp(this.bgTarget[1], 1 - Math.exp(-3 * dt));
    this.paintBg();
    const turntable = this.opts.view === 'ride';
    for (const s of this.slots.values()) {
      if (!s.avatar.root.visible) continue;
      const r = s.avatar.root;
      r.position.x = damp(r.position.x, s.target.x, 6, dt);
      r.position.z = damp(r.position.z, s.target.z, 6, dt);
      const rot = turntable ? Math.PI + Math.sin(t * 0.45) * 0.7 : Math.PI + s.targetRot;
      r.rotation.y = damp(r.rotation.y, rot, 4, dt);
      s.celebrate = damp(s.celebrate, s.celebrateTarget, 4, dt);
      s.avatar.update(idleMotion(t, dt, s.celebrate));
      s.shadow.position.set(r.position.x, 0.06, r.position.z);
    }
    for (const f of this.foods) {
      const a = f.a + t * f.s;
      // A gentle ellipse BEHIND the kids so food friends never swing up to the camera.
      f.obj.position.set(Math.cos(a) * (f.r + 1.6), f.h + 0.6 + Math.sin(t * 1.3 + f.a) * 0.18, -3.4 + Math.sin(a) * 1.2);
      f.obj.rotation.y = t * 0.8 + f.a;
    }
    // Confetti.
    for (let i = 0; i < this.confettiState.length; i++) {
      const c = this.confettiState[i];
      if (c.p.y > -5) {
        c.v.y -= 6 * dt;
        c.v.multiplyScalar(1 - 1.2 * dt);
        c.p.addScaledVector(c.v, dt);
        c.r += dt * 5;
      }
      this.dummy.position.copy(c.p);
      this.dummy.rotation.set(c.r, c.r * 0.7, c.r * 0.3);
      this.dummy.updateMatrix();
      this.confetti.setMatrixAt(i, this.dummy.matrix);
    }
    this.confetti.instanceMatrix.needsUpdate = true;
    if (this.opts.view === 'results' && this.opts.celebrate !== false && Math.floor(t * 0.4) !== Math.floor((t - dt) * 0.4)) this.burst();

    // Camera framing per view and aspect (portrait keeps the kids in the upper part; menus sit below).
    const portrait = this.aspect < 0.9;
    const v = this.opts.view;
    const pos = new THREE.Vector3();
    const look = new THREE.Vector3();
    if (v === 'title' || v === 'character') {
      if (portrait) {
        pos.set(0, 2.3, 9.4);
        look.set(0, 0.35, 0);
      } else {
        pos.set(0, 1.9, 6.6);
        look.set(0, 0.95, 0);
      }
    } else if (v === 'ride') {
      if (portrait) {
        pos.set(0, 2.2, 7.4);
        look.set(0, 0.25, 0);
      } else {
        pos.set(-1.4, 1.7, 5.4);
        look.set(-0.9, 0.85, 0);
      }
    } else if (v === 'results') {
      if (portrait) {
        // Results sheet fills the lower ~70%: frame the cheering kid in the top band.
        pos.set(0, 2.3, 8.2);
        look.set(0, -2.1, 0);
      } else {
        pos.set(1.9, 1.6, 5.6);
        look.set(1.3, 0.9, 0);
      }
    } else {
      // stage / book / settings: kid off to one side, softly framed.
      if (portrait) {
        pos.set(0, 2.6, 9.5);
        look.set(0, 0.1, 0);
      } else {
        pos.set(2.6, 1.8, 7.5);
        look.set(1.9, 0.9, 0);
      }
    }
    pos.x += Math.sin(t * 0.3) * 0.18;
    this.camPos.lerp(pos, 1 - Math.exp(-2.5 * dt));
    this.camLook.lerp(look, 1 - Math.exp(-2.5 * dt));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    this.camera.fov = portrait ? 50 : 40;
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Diagnostic for layout tests: screen-space overlaps between visible kids and floating foods. */
  overlapReport(): string[] {
    const out: string[] = [];
    const rect = (o: THREE.Object3D) => {
      const b = new THREE.Box3().setFromObject(o);
      const r = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
      for (let i = 0; i < 8; i++) {
        const v = new THREE.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).project(this.camera);
        r.x0 = Math.min(r.x0, v.x); r.x1 = Math.max(r.x1, v.x); r.y0 = Math.min(r.y0, v.y); r.y1 = Math.max(r.y1, v.y);
      }
      return r;
    };
    this.camera.updateMatrixWorld();
    for (const [c, s] of this.slots) {
      if (!s.avatar.root.visible) continue;
      const a = rect(s.avatar.root);
      for (const f of this.foods) {
        const r = rect(f.obj);
        if (r.x1 > -1 && r.x0 < 1 && r.y1 > -1 && r.y0 < 1 && r.x0 < a.x1 && r.x1 > a.x0 && r.y0 < a.y1 && r.y1 > a.y0) out.push(`${c} x food`);
      }
    }
    return out;
  }

}
