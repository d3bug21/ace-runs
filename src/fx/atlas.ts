// One procedural sprite atlas (8 x 4 cells of 128 px) holding every particle picture used by the
// food effects. Colours are baked in (tint with white) except the soft white "tintable" shapes.
import * as THREE from 'three';

export const S = {
  GLOW: 0,
  SPARK: 1,
  STAR: 2,
  HEART: 3,
  BUBBLE: 4,
  SNOW: 5,
  Z: 6,
  DROP: 7,
  GERM: 8,
  GERM2: 9,
  BONE: 10,
  TOOTH: 11,
  RING: 12,
  ZAP: 13,
  SWIRL: 14,
  PUFF: 15,
  SPRING: 16,
  BONK: 17,
  BOING: 18,
  BRR: 19,
  TOOTH_BUBBLE: 20,
  TUMMY: 21,
  BURST: 22,
  LEAF: 23,
  DOT: 24,
} as const;
export type SpriteId = (typeof S)[keyof typeof S];

export const ATLAS_COLS = 8;
export const ATLAS_ROWS = 4;
const C = 128;

const FONT = "'Fredoka', ui-rounded, 'Arial Rounded MT Bold', 'Trebuchet MS', system-ui, sans-serif";
const INK = '#2b3440';

type G = CanvasRenderingContext2D;

function star(g: G, n: number, R: number, r: number, rot = -Math.PI / 2): void {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n;
    const rr = i % 2 ? r : R;
    g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  g.closePath();
}

function toothPath(g: G): void {
  g.beginPath();
  g.moveTo(-28, -24);
  g.quadraticCurveTo(-14, -40, 0, -29);
  g.quadraticCurveTo(14, -40, 28, -24);
  g.bezierCurveTo(37, -8, 31, 12, 24, 30);
  g.quadraticCurveTo(19, 43, 12, 36);
  g.quadraticCurveTo(6, 19, 0, 18);
  g.quadraticCurveTo(-6, 19, -12, 36);
  g.quadraticCurveTo(-19, 43, -24, 30);
  g.bezierCurveTo(-31, 12, -37, -8, -28, -24);
  g.closePath();
}

function sparkle(g: G, x: number, y: number, R: number, col = '#ffffff', k = 0.18): void {
  g.save();
  g.translate(x, y);
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(0, -R);
  g.quadraticCurveTo(R * k, -R * k, R, 0);
  g.quadraticCurveTo(R * k, R * k, 0, R);
  g.quadraticCurveTo(-R * k, R * k, -R, 0);
  g.quadraticCurveTo(-R * k, -R * k, 0, -R);
  g.fill();
  g.restore();
}

function outlinedText(g: G, text: string, size: number, fill: string, stroke: string, sw: number): void {
  g.font = `700 ${size}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = sw;
  g.strokeStyle = stroke;
  g.strokeText(text, 0, 2);
  g.fillStyle = fill;
  g.fillText(text, 0, 2);
}

function germ(g: G, body: string, edge: string): void {
  g.fillStyle = body;
  g.strokeStyle = edge;
  g.lineWidth = 5;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    g.beginPath();
    g.arc(Math.cos(a) * 40, Math.sin(a) * 40, 9, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
  g.beginPath();
  g.arc(0, 0, 40, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  // googly eyes
  for (const ex of [-14, 14]) {
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(ex, -8, 12, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = INK;
    g.stroke();
    g.fillStyle = INK;
    g.beginPath();
    g.arc(ex + 4, -5, 5.5, 0, Math.PI * 2);
    g.fill();
  }
  // smile + cheeks
  g.strokeStyle = INK;
  g.lineWidth = 4;
  g.lineCap = 'round';
  g.beginPath();
  g.arc(0, 8, 12, 0.25, Math.PI - 0.25);
  g.stroke();
  g.fillStyle = 'rgba(255,140,160,0.7)';
  for (const cx of [-24, 24]) {
    g.beginPath();
    g.arc(cx, 8, 5, 0, Math.PI * 2);
    g.fill();
  }
}

const DRAW: Record<number, (g: G) => void> = {
  [S.GLOW](g) {
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 62);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(-64, -64, 128, 128);
  },
  [S.SPARK](g) {
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 30);
    gr.addColorStop(0, 'rgba(255,255,255,0.85)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(0, 0, 30, 0, Math.PI * 2);
    g.fill();
    sparkle(g, 0, 0, 60, '#ffffff', 0.07);
    g.save();
    g.rotate(Math.PI / 4);
    sparkle(g, 0, 0, 30, '#ffffff', 0.1);
    g.restore();
  },
  [S.STAR](g) {
    star(g, 5, 54, 25);
    g.lineJoin = 'round';
    g.lineWidth = 10;
    g.strokeStyle = '#f2a51f';
    g.stroke();
    const gr = g.createLinearGradient(0, -50, 0, 50);
    gr.addColorStop(0, '#ffe680');
    gr.addColorStop(1, '#ffc23a');
    g.fillStyle = gr;
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.beginPath();
    g.ellipse(-12, -14, 9, 5, -0.6, 0, Math.PI * 2);
    g.fill();
  },
  [S.HEART](g) {
    g.beginPath();
    g.moveTo(0, 44);
    g.bezierCurveTo(-70, 0, -40, -56, 0, -24);
    g.bezierCurveTo(40, -56, 70, 0, 0, 44);
    g.closePath();
    g.fillStyle = '#ff7a9a';
    g.fill();
    g.lineWidth = 6;
    g.strokeStyle = '#e85d8a';
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.beginPath();
    g.ellipse(-20, -16, 10, 6, -0.7, 0, Math.PI * 2);
    g.fill();
  },
  [S.BUBBLE](g) {
    g.beginPath();
    g.arc(0, 0, 50, 0, Math.PI * 2);
    g.fillStyle = 'rgba(255,255,255,0.32)';
    g.fill();
    g.lineWidth = 11;
    g.strokeStyle = 'rgba(70,110,170,0.45)';
    g.stroke();
    g.lineWidth = 6;
    g.strokeStyle = 'rgba(255,255,255,0.98)';
    g.stroke();
    g.lineCap = 'round';
    g.lineWidth = 8;
    g.beginPath();
    g.arc(0, 0, 34, Math.PI * 1.1, Math.PI * 1.45);
    g.stroke();
  },
  [S.SNOW](g) {
    g.lineCap = 'round';
    for (const [w, c] of [
      [14, '#9fd6f0'],
      [7, '#ffffff'],
    ] as const) {
      g.lineWidth = w;
      g.strokeStyle = c;
      for (let i = 0; i < 6; i++) {
        g.save();
        g.rotate((i * Math.PI) / 3);
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(0, -48);
        g.moveTo(0, -28);
        g.lineTo(-13, -40);
        g.moveTo(0, -28);
        g.lineTo(13, -40);
        g.stroke();
        g.restore();
      }
    }
  },
  [S.Z](g) {
    outlinedText(g, 'Z', 96, '#b59cf0', '#ffffff', 14);
  },
  [S.DROP](g) {
    g.beginPath();
    g.moveTo(0, -50);
    g.quadraticCurveTo(38, 2, 32, 20);
    g.arc(0, 18, 32, 0, Math.PI, false);
    g.quadraticCurveTo(-38, 2, 0, -50);
    g.closePath();
    const gr = g.createLinearGradient(0, -50, 0, 50);
    gr.addColorStop(0, '#b8e8ff');
    gr.addColorStop(1, '#3f9fd8');
    g.fillStyle = gr;
    g.fill();
    g.lineWidth = 5;
    g.strokeStyle = '#ffffff';
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.beginPath();
    g.ellipse(-12, 8, 6, 12, 0.3, 0, Math.PI * 2);
    g.fill();
  },
  [S.GERM](g) {
    germ(g, '#a6dd6a', '#5aa557');
  },
  [S.GERM2](g) {
    germ(g, '#c7b4f5', '#8f74d6');
  },
  [S.BONE](g) {
    g.shadowColor = 'rgba(140,210,255,1)';
    g.shadowBlur = 10;
    g.save();
    g.rotate(-0.6);
    const bone = (grow: number) => {
      g.beginPath();
      g.roundRect(-34, -11 - grow, 68, 22 + grow * 2, 10 + grow);
      g.fill();
      for (const [x, y] of [
        [-38, -12],
        [-38, 12],
        [38, -12],
        [38, 12],
      ]) {
        g.beginPath();
        g.arc(x, y, 15 + grow, 0, Math.PI * 2);
        g.fill();
      }
    };
    g.fillStyle = '#7fc4f0';
    bone(5);
    g.shadowBlur = 0;
    g.fillStyle = '#ffffff';
    bone(0);
    g.fillStyle = '#e3f4ff';
    g.beginPath();
    g.roundRect(-30, 2, 60, 6, 3);
    g.fill();
    g.restore();
  },
  [S.TOOTH](g) {
    g.shadowColor = 'rgba(160,220,255,0.9)';
    g.shadowBlur = 14;
    toothPath(g);
    g.fillStyle = '#ffffff';
    g.fill();
    g.shadowBlur = 0;
    g.lineWidth = 5;
    g.strokeStyle = '#9fb8cc';
    g.stroke();
    g.fillStyle = 'rgba(200,230,255,0.9)';
    g.beginPath();
    g.ellipse(-12, -14, 6, 10, 0.3, 0, Math.PI * 2);
    g.fill();
    sparkle(g, 30, -36, 20, '#ffe066');
  },
  [S.RING](g) {
    g.shadowColor = 'rgba(255,255,255,1)';
    g.shadowBlur = 12;
    g.lineWidth = 9;
    g.strokeStyle = '#ffffff';
    g.beginPath();
    g.arc(0, 0, 50, 0, Math.PI * 2);
    g.stroke();
    g.shadowBlur = 0;
  },
  [S.ZAP](g) {
    g.beginPath();
    g.moveTo(-8, -54);
    g.lineTo(26, -54);
    g.lineTo(8, -12);
    g.lineTo(32, -12);
    g.lineTo(-16, 56);
    g.lineTo(-2, 6);
    g.lineTo(-26, 6);
    g.closePath();
    g.lineJoin = 'round';
    g.lineWidth = 9;
    g.strokeStyle = '#ff9a3c';
    g.stroke();
    g.fillStyle = '#ffe066';
    g.fill();
  },
  [S.SWIRL](g) {
    g.lineCap = 'round';
    g.lineWidth = 9;
    g.strokeStyle = '#ffffff';
    g.beginPath();
    for (let i = 0; i <= 60; i++) {
      const th = (i / 60) * Math.PI * 4;
      const r = 4 + th * 3.6;
      g.lineTo(Math.cos(th) * r, Math.sin(th) * r);
    }
    g.stroke();
  },
  [S.PUFF](g) {
    for (const [x, y, r] of [
      [-22, 6, 30],
      [18, 8, 32],
      [0, -14, 34],
      [0, 16, 30],
    ]) {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.95)');
      gr.addColorStop(0.7, 'rgba(255,255,255,0.75)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  },
  [S.SPRING](g) {
    g.lineCap = 'round';
    for (const [w, c] of [
      [12, '#2fb5a8'],
      [5, '#bff5e6'],
    ] as const) {
      g.lineWidth = w;
      g.strokeStyle = c;
      g.beginPath();
      for (let i = 0; i <= 80; i++) {
        const t = i / 80;
        g.lineTo(Math.sin(t * Math.PI * 8) * 30, -40 + t * 80 + Math.cos(t * Math.PI * 8) * 6);
      }
      g.stroke();
    }
  },
  [S.BONK](g) {
    star(g, 12, 62, 44, 0.1);
    g.fillStyle = '#ffe066';
    g.fill();
    g.lineJoin = 'round';
    g.lineWidth = 6;
    g.strokeStyle = '#ff7a6b';
    g.stroke();
    g.rotate(-0.12);
    outlinedText(g, 'BONK!', 31, INK, '#ffffff', 7);
  },
  [S.BOING](g) {
    star(g, 10, 58, 46, 0);
    g.fillStyle = '#ffffff';
    g.fill();
    g.lineJoin = 'round';
    g.lineWidth = 6;
    g.strokeStyle = '#7fdcc0';
    g.stroke();
    g.rotate(0.1);
    outlinedText(g, 'boing!', 28, '#2fb5a8', '#ffffff', 6);
  },
  [S.BRR](g) {
    g.lineCap = 'round';
    g.lineWidth = 6;
    g.strokeStyle = '#9fd6f0';
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        const x = s * (50 + i * 3);
        g.moveTo(x, -18 + i * 14);
        g.lineTo(x + s * 8, -12 + i * 14);
        g.stroke();
      }
    }
    outlinedText(g, 'brrr', 40, '#ffffff', '#5a8dee', 9);
  },
  [S.TOOTH_BUBBLE](g) {
    g.beginPath();
    g.arc(0, 0, 58, 0, Math.PI * 2);
    g.fillStyle = '#ffffff';
    g.fill();
    g.lineWidth = 4;
    g.strokeStyle = 'rgba(43,52,64,0.35)';
    g.stroke();
    g.save();
    g.scale(0.82, 0.82);
    g.translate(0, 4);
    toothPath(g);
    g.fillStyle = '#fffdf6';
    g.fill();
    g.lineWidth = 5;
    g.strokeStyle = INK;
    g.stroke();
    // sticky caramel on top with drips
    g.fillStyle = '#c98f5a';
    g.beginPath();
    g.moveTo(-27, -22);
    g.quadraticCurveTo(-14, -38, 0, -27);
    g.quadraticCurveTo(14, -38, 27, -22);
    g.lineTo(24, -12);
    g.quadraticCurveTo(20, -4, 16, -12);
    g.quadraticCurveTo(6, -8, 2, 0);
    g.quadraticCurveTo(-2, 6, -6, -6);
    g.quadraticCurveTo(-14, -12, -18, -8);
    g.quadraticCurveTo(-24, 0, -26, -12);
    g.closePath();
    g.fill();
    // little speck + "uh-oh" face
    g.fillStyle = '#6b7480';
    g.beginPath();
    g.arc(14, 14, 4.5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = INK;
    for (const ex of [-9, 9]) {
      g.beginPath();
      g.arc(ex, 6, 3.5, 0, Math.PI * 2);
      g.fill();
    }
    g.lineWidth = 3;
    g.beginPath();
    g.arc(0, 20, 5, Math.PI + 0.4, -0.4);
    g.stroke();
    g.restore();
  },
  [S.TUMMY](g) {
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 62);
    gr.addColorStop(0, 'rgba(255,214,150,1)');
    gr.addColorStop(0.55, 'rgba(255,179,138,0.75)');
    gr.addColorStop(1, 'rgba(255,179,138,0)');
    g.fillStyle = gr;
    g.fillRect(-64, -64, 128, 128);
    g.lineCap = 'round';
    g.lineWidth = 8;
    g.strokeStyle = '#ff7a6b';
    g.beginPath();
    g.arc(0, -2, 22, 0.35, Math.PI - 0.35);
    g.stroke();
    g.fillStyle = 'rgba(255,122,154,0.6)';
    for (const x of [-30, 30]) {
      g.beginPath();
      g.arc(x, 4, 7, 0, Math.PI * 2);
      g.fill();
    }
  },
  [S.BURST](g) {
    star(g, 8, 58, 26, 0.2);
    g.fillStyle = '#ffffff';
    g.fill();
    g.lineJoin = 'round';
    g.lineWidth = 8;
    g.strokeStyle = '#ffe066';
    g.stroke();
  },
  [S.LEAF](g) {
    g.beginPath();
    g.moveTo(0, 50);
    g.bezierCurveTo(-46, 10, -30, -40, 0, -52);
    g.bezierCurveTo(30, -40, 46, 10, 0, 50);
    g.fillStyle = '#7cc46a';
    g.fill();
    g.lineWidth = 5;
    g.strokeStyle = '#4fae5a';
    g.stroke();
    g.beginPath();
    g.moveTo(0, 46);
    g.lineTo(0, -40);
    g.stroke();
  },
  [S.DOT](g) {
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(0, 0, 40, 0, Math.PI * 2);
    g.fill();
  },
};

let atlas: THREE.CanvasTexture | null = null;

/** Shared sprite atlas texture (built once). Raw (no colour-space conversion) on purpose. */
export function spriteAtlas(): THREE.CanvasTexture {
  if (atlas) return atlas;
  const c = document.createElement('canvas');
  c.width = ATLAS_COLS * C;
  c.height = ATLAS_ROWS * C;
  const g = c.getContext('2d')!;
  for (const k of Object.keys(DRAW)) {
    const i = Number(k);
    g.save();
    g.translate((i % ATLAS_COLS) * C + C / 2, Math.floor(i / ATLAS_COLS) * C + C / 2);
    g.beginPath();
    g.rect(-C / 2, -C / 2, C, C);
    g.clip();
    DRAW[i](g);
    g.restore();
  }
  atlas = new THREE.CanvasTexture(c);
  atlas.colorSpace = THREE.NoColorSpace;
  atlas.generateMipmaps = true;
  atlas.minFilter = THREE.LinearMipmapLinearFilter;
  atlas.anisotropy = 2;
  return atlas;
}

/** Drop the cached atlas (after disposing it). */
export function releaseAtlas(): void {
  atlas?.dispose();
  atlas = null;
}
