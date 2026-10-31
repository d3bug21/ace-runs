// Minimal stage used only if a stage module fails to load (keeps the game playable).
import * as THREE from 'three';
import type { DecorRequest, ObstacleRequest, ObstacleVisual, StageBuildContext, StageModule } from '../contracts';
import { PLATFORM_TOP } from '../contracts';
import { geo, mat, PAL } from '../kit/kit';

export function createFallbackStage(id: StageModule['id'] = 'indoor'): StageModule {
  let group: THREE.Group | null = null;
  let scene: THREE.Scene | null = null;
  return {
    id,
    name: 'Playground',
    length: 1300,
    music: 'mus_indoor',
    sections: [{ id, label: 'Playground', start: 0 }],
    build(ctx: StageBuildContext) {
      scene = ctx.scene;
      group = new THREE.Group();
      ctx.scene.background = new THREE.Color(PAL.sky);
      ctx.scene.fog = new THREE.Fog(PAL.sky, 30, 120);
      group.add(new THREE.HemisphereLight(0xffffff, 0x88aa77, 1.6));
      const sun = new THREE.DirectionalLight(0xfff1dd, 1.6);
      sun.position.set(6, 12, 4);
      group.add(sun);
      ctx.scene.add(group);
    },
    buildDecor(req: DecorRequest) {
      const g = new THREE.Group();
      const len = req.d1 - req.d0;
      const floor = new THREE.Mesh(geo.box(7.4, 0.2, len), mat(PAL.sand));
      floor.position.set(0, -0.1, -(req.d0 + len / 2));
      g.add(floor);
      const grass = new THREE.Mesh(geo.box(60, 0.2, len), mat(PAL.grass));
      grass.position.set(0, -0.12, -(req.d0 + len / 2));
      g.add(grass);
      return g;
    },
    makeObstacle(req: ObstacleRequest): ObstacleVisual {
      const w = req.laneSpan * 2.2 - 0.2;
      const o = new THREE.Group();
      const color = { low: PAL.sun, high: PAL.coral, block: PAL.sea, platform: PAL.teal, ramp: PAL.mint, moverBlock: PAL.lilac, moverLow: PAL.berry }[req.kind];
      if (req.kind === 'high') {
        const bar = new THREE.Mesh(geo.rbox(w, req.height - 1.1, 0.6, 0.15), mat(color));
        bar.position.y = 1.1 + (req.height - 1.1) / 2;
        o.add(bar);
      } else if (req.kind === 'ramp') {
        const r = new THREE.Mesh(geo.box(w, 0.2, Math.hypot(req.length, PLATFORM_TOP)), mat(color));
        r.rotation.x = Math.atan2(PLATFORM_TOP, req.length);
        r.position.y = PLATFORM_TOP / 2;
        o.add(r);
      } else {
        const h = req.kind === 'platform' ? PLATFORM_TOP : req.height;
        const b = new THREE.Mesh(geo.rbox(w, h, req.length, 0.12), mat(color));
        b.position.y = h / 2;
        o.add(b);
      }
      return { object: o };
    },
    update() {},
    ambienceAt: () => 'amb_indoor',
    dispose() {
      if (group && scene) scene.remove(group);
    },
  };
}
