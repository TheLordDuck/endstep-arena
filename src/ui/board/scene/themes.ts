// The table's scenes, after the kinds of battlefield Arena has (seen in LegenVD's videos): a floor
// with a large pattern, a band across the middle between the two sides, a dais under each
// player's picture, tall scenery rising along the edges, its own lights and particles. One per
// color of Magic; all drawn and modelled here.

import * as THREE from "three";
import type { SceneCtx } from "./Battlefield3D";

export type ThemeName = "garden" | "glacier" | "cathedral" | "forge" | "academy";

/** The scene for a deck's main color. */
export const THEME_FOR_LAND: Record<string, ThemeName> = {
  Plains: "academy", Island: "glacier", Swamp: "cathedral", Mountain: "forge", Forest: "garden",
};

export const THEMES: Record<ThemeName, (c: SceneCtx) => void> = { garden, glacier, cathedral, forge, academy };

// ------------------------------------------------------------------ helpers

type G = CanvasRenderingContext2D;
type Px = (u: number, v: number) => [number, number];

const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);

/** Speckles: n dots of random size in the colors given. */
function speckle(g: G, w: number, h: number, n: number, colors: string[], r: [number, number], rand: () => number): void {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[Math.floor(rand() * colors.length)]!;
    g.beginPath();
    g.arc(rand() * w, rand() * h, r[0] + rand() * (r[1] - r[0]), 0, Math.PI * 2);
    g.fill();
  }
}

/** Stones laid in rows (cobbles, flagstones): each a rounded block of its own tone, lit on top. */
function stones(g: G, w: number, h: number, rows: number, tones: string[], mortar: string, rand: () => number): void {
  g.fillStyle = mortar;
  g.fillRect(0, 0, w, h);
  const rh = h / rows;
  for (let r = 0; r < rows; r++) {
    let x = -rand() * rh;
    while (x < w) {
      const sw = rh * (0.9 + rand() * 0.8);
      g.fillStyle = tones[Math.floor(rand() * tones.length)]!;
      g.beginPath();
      g.roundRect(x + 2, r * rh + 2, sw - 4, rh - 4, rh * 0.3);
      g.fill();
      g.fillStyle = "rgba(255,255,255,0.09)";
      g.fillRect(x + 6, r * rh + 5, sw - 12, rh * 0.16);
      g.fillStyle = "rgba(0,0,0,0.2)";
      g.fillRect(x + 6, r * rh + rh * 0.74, sw - 12, rh * 0.16);
      x += sw;
    }
  }
}

/** Leaves: overlapping clumps in several greens, darker underneath. */
function leaves(g: G, w: number, h: number, rand: () => number, tones = ["#1f5a50", "#2a7266", "#2f6f8a", "#3a8c76", "#245a6e", "#46a080"]): void {
  g.fillStyle = "#0f2a2a";
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < (w * h) / 90; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const r = 3 + rand() * 7;
    g.fillStyle = "rgba(0,0,0,0.25)";
    g.beginPath();
    g.ellipse(x + 1.5, y + 2, r, r * 0.7, rand() * Math.PI, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = tones[Math.floor(rand() * tones.length)]!;
    g.beginPath();
    g.ellipse(x, y, r, r * 0.65, rand() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
}

const repeatTex = (t: THREE.Texture, x: number, y = 1) => {
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(Math.max(1, x), Math.max(1, y));
  return t;
};

/** A box laid across the whole floor at board height v, `depth` deep and `height` high. */
function band(c: SceneCtx, v: number, depth: number, height: number, mat: THREE.Material | THREE.Material[]): THREE.Mesh {
  const z = c.at(0.5, v).z;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(c.box.x1 - c.box.x0, height, depth), mat);
  mesh.position.set((c.box.x0 + c.box.x1) / 2, height / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return c.add(mesh);
}

/** How many times a texture `aspect` wide (for 1 high) repeats along a band `length` long and `depth` deep. */
const bandRepeat = (c: SceneCtx, depth: number, aspect: number) => Math.round((c.box.x1 - c.box.x0) / (depth * aspect));

/** The floor plane, with its texture (and an emissive one for what glows on it). */
function floor(c: SceneCtx, map: THREE.Texture, o: { roughness?: number; metalness?: number; bump?: number; emissive?: THREE.Texture; emissiveColor?: number; emissiveIntensity?: number } = {}): THREE.MeshStandardMaterial {
  const mat = std({ map, roughness: o.roughness ?? 0.9, metalness: o.metalness ?? 0, bumpMap: map, bumpScale: o.bump ?? 0.6,
    ...(o.emissive ? { emissiveMap: o.emissive, emissive: new THREE.Color(o.emissiveColor ?? 0xffffff), emissiveIntensity: o.emissiveIntensity ?? 1 } : {}) });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(c.box.x1 - c.box.x0, c.box.z1 - c.box.z0), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set((c.box.x0 + c.box.x1) / 2, 0, (c.box.z0 + c.box.z1) / 2);
  mesh.receiveShadow = true;
  c.add(mesh);
  return mat;
}

/** The dais under a player's picture: a round step with a trim. */
function dais(c: SceneCtx, u: number, v: number, top: THREE.Material, trim: THREE.Material): void {
  const H = c.span.h;
  const p = c.at(u, v);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(H * 0.085, H * 0.095, H * 0.014, 48), top);
  base.position.set(p.x, H * 0.007, p.z);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(H * 0.09, H * 0.005, 10, 64), trim);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(p.x, H * 0.014, p.z);
  c.add(shadowed(base));
  c.add(shadowed(ring));
}

const shadowed = <T extends THREE.Object3D>(o: T): T => {
  o.traverse((m) => {
    m.castShadow = true;
    m.receiveShadow = true;
  });
  return o;
};

/** The two side edges of the board: for each, its x on the floor, which way is inward (+1 on the
    left), and the z of the top and bottom of the board there. */
function edges(c: SceneCtx, inset = 0.01): { x: number; inward: number; z0: number; z1: number }[] {
  return [0, 1].map((side) => {
    const u = side ? 1 - inset : inset;
    return { x: c.at(u, 0.5).x, inward: side ? -1 : 1, z0: c.at(u, -0.05).z, z1: c.at(u, 1.05).z };
  });
}

/** Spots down a side edge, evenly spaced with some jitter: n of them between z0 and z1. */
function down(c: SceneCtx, z0: number, z1: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => z0 + ((i + 0.5 + (c.rand() - 0.5) * 0.4) / n) * (z1 - z0));
}

/** Light lying on the floor, as a soft colored pool (from a window, a fire). */
function pool(c: SceneCtx, at: THREE.Vector3, radius: number, color: number, opacity: number, stretch = 1, angle = 0): THREE.Mesh {
  const tex = c.texture(128, 128, (g) => {
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2 * stretch, radius * 2),
    new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.rotation.set(-Math.PI / 2, 0, angle);
  m.position.copy(at).setY(0.05);
  return c.add(m);
}

// ------------------------------------------------------------------ Garden (green)

/** A moonlit garden: hedges curling in scrolls on either side of a cobbled path across the middle,
    tall hedges and lanterns along the edges, stone stairs in the corners, glowing plants and
    fireflies. */
function garden(c: SceneCtx): void {
  const { h: H } = c.span;
  const L = c.layout;
  c.add(new THREE.HemisphereLight(0x9cb8ff, 0x0d1420, 0.9));
  c.sun(0xd8e6ff, 2.6, [-30, 70, -25]);

  // The ground between the hedges: dark gravel.
  const map = c.floorTexture((g, w, h) => {
    g.fillStyle = "#18203a";
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, (w * h) / 50, ["#1e2747", "#232d52", "#151b33", "#2a3460"], [1, 3.5], c.rand);
  });
  floor(c, map, { bump: 1.4 });

  // The hedges: scrolls in 3D, mirrored on either side of the path.
  const leafTex = repeatTex(c.texture(512, 512, (g, w, h) => leaves(g, w, h, c.rand)), 14, 1);
  const hedgeMat = std({ map: leafTex, bumpMap: leafTex, bumpScale: 4, roughness: 1 });
  const midZ = c.at(0.5, L.mid).z;
  const unit = H / 10;
  for (const s of [-1, 1]) {
    for (let k = -3; k <= 3; k++) {
      const cx = c.at(0.5 + k * 0.16, L.mid).x;
      const cz = midZ + s * unit * 2.3;
      const flip = k % 2 ? 1 : -1;
      const pts: THREE.Vector3[] = [];
      for (let a = 0; a <= Math.PI * 3.1; a += 0.12) {
        const r = unit * 1.45 * (1 - a / (Math.PI * 4));
        pts.push(new THREE.Vector3(cx + Math.cos(a * flip) * r, 0, cz + Math.sin(a * flip) * r * s));
      }
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, unit * 0.2, 10, false), hedgeMat);
      tube.scale.y = 0.7;
      c.add(shadowed(tube));
    }
  }

  // The path: cobbles between two raised curbs.
  const depth = H * 0.075;
  const cobble = repeatTex(c.texture(1024, 128, (g, w, h) => stones(g, w, h, 3, ["#6f7480", "#7d828c", "#646a76", "#8a8f99", "#5b616d"], "#23262e", c.rand)), bandRepeat(c, depth, 8));
  band(c, L.mid, depth, H * 0.008, std({ map: cobble, bumpMap: cobble, bumpScale: 3, roughness: 0.95 }));
  const curb = std({ color: 0x4d525e, roughness: 0.9 });
  for (const s of [-1, 1]) band(c, L.mid, H * 0.01, H * 0.016, curb).position.z += s * (depth / 2 + H * 0.004);

  // Tall hedges along both edges, with lanterns at intervals.
  const wallTex = repeatTex(c.texture(512, 512, (g, w, h) => leaves(g, w, h, c.rand)), 2, 8);
  const wallMat = std({ map: wallTex, bumpMap: wallTex, bumpScale: 5, roughness: 1 });
  const post = std({ color: 0x2a2f36, roughness: 0.5, metalness: 0.7 });
  const lampGlass = std({ color: 0xd8ffd0, emissive: 0x9dffb0, emissiveIntensity: 2.2 });
  for (const e of edges(c, 0.015)) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(H * 0.08, H * 0.16, e.z1 - e.z0), wallMat);
    wall.position.set(e.x - e.inward * H * 0.03, H * 0.08, (e.z0 + e.z1) / 2);
    c.add(shadowed(wall));
    for (const z of [c.at(0.5, 0.22).z, c.at(0.5, 0.74).z]) {
      const x = e.x + e.inward * H * 0.04;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(H * 0.004, H * 0.006, H * 0.14, 8), post);
      pole.position.set(x, H * 0.07, z);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(H * 0.014, 16, 12), lampGlass);
      lamp.position.set(x, H * 0.15, z);
      c.add(shadowed(pole));
      c.add(lamp);
      c.glow(0x8dffa8, 70, new THREE.Vector3(x, H * 0.15, z), H * 0.4, 0.06);
      pool(c, new THREE.Vector3(x, 0, z), H * 0.12, 0x6dff9a, 0.18);
    }
  }

  // Stone stairs curving down in the four corners.
  const stoneTex = c.texture(512, 512, (g, w, h) => stones(g, w, h, 6, ["#5a5f6b", "#666b77", "#525764", "#707582"], "#20242c", c.rand));
  const stair = std({ map: stoneTex, bumpMap: stoneTex, bumpScale: 2, roughness: 0.95 });
  for (const side of [0, 1]) for (const top of [0, 1]) {
    const g = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const r = H * (0.3 - i * 0.035);
      const step = new THREE.Mesh(new THREE.CylinderGeometry(r, r, H * 0.018, 48, 1, false, 0, Math.PI / 2), stair);
      step.position.y = H * 0.009 + i * H * 0.018;
      g.add(step);
    }
    g.position.copy(c.at(side, top));
    g.rotation.y = side ? (top ? Math.PI : Math.PI / 2) : (top ? -Math.PI / 2 : 0);
    c.add(shadowed(g));
  }

  // Glowing plants in the gaps between the hedges.
  const stem = std({ color: 0x1f4a3a, roughness: 0.8 });
  const bulb = std({ color: 0x9dffd0, emissive: 0x3dd88a, emissiveIntensity: 0.9, roughness: 0.4 });
  for (let i = 0; i < 10; i++) {
    const p = c.at(0.08 + c.rand() * 0.84, c.rand() < 0.5 ? 0.06 + c.rand() * 0.25 : 0.62 + c.rand() * 0.25);
    const clump = new THREE.Group();
    for (let k = 0; k < 5; k++) {
      const hgt = H * (0.015 + c.rand() * 0.025);
      const s = new THREE.Mesh(new THREE.CylinderGeometry(H * 0.0015, H * 0.0025, hgt, 6), stem);
      const ang = c.rand() * Math.PI * 2;
      const off = c.rand() * H * 0.015;
      s.position.set(Math.cos(ang) * off, hgt / 2, Math.sin(ang) * off);
      const b = new THREE.Mesh(new THREE.SphereGeometry(H * 0.004, 10, 8), bulb);
      b.position.set(s.position.x, hgt, s.position.z);
      clump.add(s, b);
    }
    clump.position.copy(p);
    c.add(shadowed(clump));
  }

  const trim = std({ color: 0x8fd9a8, emissive: 0x2a8a50, emissiveIntensity: 0.5, roughness: 0.5 });
  dais(c, L.opp.u, L.opp.v, stair, trim);
  dais(c, L.me.u, L.me.v, stair, trim);
  c.particles({ count: 70, color: 0xd4ff8a, size: H * 0.011, motion: "wander", speed: H * 0.02, height: H * 0.1 });
}

// ------------------------------------------------------------------ Glacier (blue)

/** A glacier: deep ice with knotwork glowing faintly inside it, a ridge of clear ice across the
    middle, walls of crystal rising along the edges, snow drifting down. */
function glacier(c: SceneCtx): void {
  const { h: H } = c.span;
  const L = c.layout;
  c.add(new THREE.HemisphereLight(0xb8dcff, 0x081228, 1.0));
  c.sun(0xe6f4ff, 1.7, [30, 70, -35]);

  const knots = (g: G, h: number, px: Px, glow: boolean) => {
    const [, my] = px(0.5, L.mid);
    const unit = h / 10;
    g.lineCap = "round";
    const loop = (cx: number, cy: number, rx: number, ry: number, rot: number) => {
      g.beginPath();
      g.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
      g.stroke();
    };
    const draw = (width: number, color: string, blur: number) => {
      g.strokeStyle = color;
      g.lineWidth = width;
      g.shadowColor = color;
      g.shadowBlur = blur;
      for (const s of [-1, 1]) {
        const cy = my + s * unit * 2.5;
        for (let k = -3; k <= 3; k++) {
          const [cx] = px(0.5 + k * 0.15, L.mid);
          loop(cx, cy, unit * 1.6, unit * 0.9, (k % 2 ? 0.6 : -0.6) * s);
          loop(cx, cy, unit * 0.9, unit * 1.6, (k % 2 ? -0.4 : 0.4) * s);
        }
      }
      g.shadowBlur = 0;
    };
    if (glow) draw(unit * 0.035, "#7cc8ff", unit * 0.25);
    else {
      draw(unit * 0.2, "#0f2c58", 0);
      draw(unit * 0.1, "#1d4c8c", 0);
    }
  };
  const map = c.floorTexture((g, w, h, px) => {
    const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.6);
    grad.addColorStop(0, "#14427e");
    grad.addColorStop(1, "#0a1d40");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, (w * h) / 260, ["rgba(200,230,255,0.07)", "rgba(120,180,255,0.06)"], [2, 16], c.rand);
    knots(g, h, px, false);
    g.strokeStyle = "rgba(190,225,255,0.14)";
    g.lineWidth = 1.5;
    for (let i = 0; i < 110; i++) {
      let x = c.rand() * w;
      let y = c.rand() * h;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 5; k++) {
        x += (c.rand() - 0.5) * 70;
        y += (c.rand() - 0.5) * 70;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  });
  const glow = c.floorTexture((g, w, h, px) => {
    g.fillStyle = "#000";
    g.fillRect(0, 0, w, h);
    knots(g, h, px, true);
  });
  const ice = floor(c, map, { roughness: 0.55, metalness: 0.05, bump: 0.5, emissive: glow, emissiveColor: 0x7cc8ff, emissiveIntensity: 0.55 });
  c.onTick((t) => (ice.emissiveIntensity = 0.5 + Math.sin(t * 0.8) * 0.12));

  // The ridge: a slab of clear ice with a glowing seam.
  band(c, L.mid, H * 0.07, H * 0.014, std({ color: 0xbfe4ff, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.55, emissive: 0x2a76c8, emissiveIntensity: 0.4 }));
  const seam = band(c, L.mid, H * 0.005, H * 0.018, std({ color: 0xe8f7ff, emissive: 0x8fd4ff, emissiveIntensity: 2 }));
  seam.castShadow = false;
  c.onTick((t) => ((seam.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.6 + Math.sin(t * 1.4) * 0.5));

  // Walls of crystal along both edges, tallest in the corners.
  const crystal = std({ color: 0xa8d8ff, emissive: 0x1d5fb0, emissiveIntensity: 0.45, roughness: 0.05, metalness: 0.35, transparent: true, opacity: 0.9, flatShading: true });
  const shard = new THREE.OctahedronGeometry(1, 0);
  const spike = (x: number, z: number, hgt: number, lean: number) => {
    const m = new THREE.Mesh(shard, crystal);
    m.scale.set(hgt * 0.22, hgt, hgt * 0.22);
    m.position.set(x, hgt * 0.45, z);
    m.rotation.set((c.rand() - 0.5) * 0.5, c.rand() * Math.PI, lean + (c.rand() - 0.5) * 0.3);
    c.add(shadowed(m));
  };
  for (const e of edges(c, 0.012)) {
    for (const z of down(c, e.z0, e.z1, 22)) {
      const corner = Math.min(Math.abs(z - e.z0), Math.abs(z - e.z1)) < H * 0.2;
      spike(e.x + (c.rand() - 0.7) * e.inward * H * 0.06, z, H * (corner ? 0.18 + c.rand() * 0.14 : 0.08 + c.rand() * 0.12), -e.inward * 0.25);
    }
    for (const z of down(c, e.z0, e.z1, 3)) c.glow(0x6fc8ff, 70, new THREE.Vector3(e.x + e.inward * H * 0.05, H * 0.1, z), H * 0.45, 0.06);
  }

  const trim = std({ color: 0xd8f0ff, emissive: 0x5ab4ff, emissiveIntensity: 1.1, roughness: 0.2 });
  dais(c, L.opp.u, L.opp.v, crystal, trim);
  dais(c, L.me.u, L.me.v, crystal, trim);
  c.particles({ count: 150, color: 0xeaf6ff, size: H * 0.008, motion: "fall", speed: H * 0.02, height: H * 0.45, opacity: 0.8 });
}

// ------------------------------------------------------------------ Cathedral (black)

/** A gothic cathedral at night: a slate floor laid in a diamond lattice with two lines of teal
    light, a band of checkered marble across the middle, high walls of glowing stained glass
    between pillars down both sides throwing colored light on the floor, candles, dust. */
function cathedral(c: SceneCtx): void {
  const { h: H } = c.span;
  const L = c.layout;
  c.add(new THREE.HemisphereLight(0x8a7cc8, 0x0a0710, 0.7));
  c.sun(0xb8b0ff, 1.3, [-25, 70, -40]);

  const lattice = (g: G, w: number, h: number) => {
    const step = h / 18;
    for (let x = -h; x < w + h; x += step) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + h, h);
      g.moveTo(x, h);
      g.lineTo(x + h, 0);
      g.stroke();
    }
  };
  const map = c.floorTexture((g, w, h) => {
    g.fillStyle = "#16131e";
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, (w * h) / 110, ["#1c1926", "#211d2c", "#131018"], [1, 4], c.rand);
    g.strokeStyle = "#09070d";
    g.lineWidth = h / 140;
    lattice(g, w, h);
    g.strokeStyle = "rgba(160,140,210,0.12)";
    g.lineWidth = h / 600;
    g.translate(2, -2);
    lattice(g, w, h);
    g.setTransform(1, 0, 0, 1, 0, 0);
  });
  const lines = c.floorTexture((g, w, h, px) => {
    g.fillStyle = "#000";
    g.fillRect(0, 0, w, h);
    for (const u of [L.left + 0.02, 1 - L.right - 0.02]) {
      const [x] = px(u, 0.5);
      g.strokeStyle = "#5ff0ff";
      g.shadowColor = "#5ff0ff";
      g.shadowBlur = h / 70;
      g.lineWidth = h / 300;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, h);
      g.stroke();
    }
  });
  floor(c, map, { roughness: 0.5, metalness: 0.2, bump: 1, emissive: lines, emissiveColor: 0x7ff4ff, emissiveIntensity: 1.1 });

  // The checkered band.
  const depth = H * 0.05;
  const checks = repeatTex(c.texture(1024, 64, (g, w, h) => {
    const s = h / 2;
    for (let x = 0; x < w; x += s) for (let y = 0; y < h; y += s) {
      g.fillStyle = (x / s + y / s) % 2 ? "#cfc9da" : "#221e2a";
      g.fillRect(x, y, s, s);
    }
  }), bandRepeat(c, depth, 16));
  checks.magFilter = THREE.NearestFilter;
  band(c, L.mid, depth, H * 0.008, std({ map: checks, roughness: 0.25, metalness: 0.2 }));

  // The walls: high, with stained-glass windows between pillars, lit from behind.
  const hues = ["#d6283c", "#2a6cff", "#f2b134", "#8a3cff", "#1fb3a8", "#ff5a2a"];
  const glass = c.texture(256, 512, (g, w, h) => {
    g.fillStyle = "#08060c";
    g.fillRect(0, 0, w, h);
    g.save();
    g.beginPath();
    g.moveTo(w * 0.14, h);
    g.lineTo(w * 0.14, h * 0.32);
    g.quadraticCurveTo(w * 0.14, h * 0.05, w * 0.5, 0.01 * h);
    g.quadraticCurveTo(w * 0.86, h * 0.05, w * 0.86, h * 0.32);
    g.lineTo(w * 0.86, h);
    g.closePath();
    g.clip();
    for (let i = 0; i < 80; i++) {
      g.fillStyle = hues[Math.floor(c.rand() * hues.length)]!;
      g.beginPath();
      const x = c.rand() * w;
      const y = c.rand() * h;
      g.moveTo(x, y);
      for (let k = 0; k < 4; k++) g.lineTo(x + (c.rand() - 0.5) * 90, y + (c.rand() - 0.5) * 90);
      g.fill();
    }
    // Leading: a rose at the top, mullions down.
    g.strokeStyle = "#08060c";
    g.lineWidth = 6;
    g.beginPath();
    g.arc(w / 2, h * 0.22, w * 0.2, 0, Math.PI * 2);
    g.moveTo(w / 2, h * 0.36);
    g.lineTo(w / 2, h);
    for (let y = h * 0.45; y < h; y += h * 0.12) {
      g.moveTo(w * 0.14, y);
      g.lineTo(w * 0.86, y);
    }
    g.stroke();
    g.restore();
  });
  const panes = std({ map: glass, emissiveMap: glass, emissive: 0xffffff, emissiveIntensity: 1.2, roughness: 0.3, side: THREE.DoubleSide });
  const stoneTex = c.texture(256, 512, (g, w, h) => stones(g, w, h, 16, ["#3a3546", "#423c50", "#35303f", "#4a4458"], "#1a1720", c.rand));
  const stoneMat = std({ map: stoneTex, bumpMap: stoneTex, bumpScale: 2, roughness: 0.85 });
  const capital = std({ color: 0x8c7650, roughness: 0.4, metalness: 0.6 });
  const wallH = H * 0.32;
  for (const e of edges(c, 0.035)) {
    const n = 5;
    const step = (e.z1 - e.z0) / n;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(H * 0.04, wallH, e.z1 - e.z0), stoneMat);
    wall.position.set(e.x - e.inward * H * 0.02, wallH / 2, (e.z0 + e.z1) / 2);
    c.add(shadowed(wall));
    for (let i = 0; i <= n; i++) {
      const z = e.z0 + step * i;
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(H * 0.022, H * 0.026, wallH, 16), stoneMat);
      pillar.position.set(e.x + e.inward * H * 0.012, wallH / 2, z);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(H * 0.032, H * 0.024, H * 0.02, 16), capital);
      cap.position.set(pillar.position.x, wallH * 0.62, z);
      c.add(shadowed(pillar));
      c.add(shadowed(cap));
      if (i < n) {
        const zc = z + step / 2;
        const pane = new THREE.Mesh(new THREE.PlaneGeometry(step * 0.72, wallH * 0.82), panes);
        pane.rotation.y = e.inward > 0 ? Math.PI / 2 : -Math.PI / 2;
        pane.position.set(e.x + e.inward * H * 0.001, wallH * 0.45, zc);
        c.add(pane);
        const hue = i % 2 ? 0x4a6cff : 0xff3a5a;
        c.glow(hue, 30, new THREE.Vector3(e.x + e.inward * H * 0.06, wallH * 0.4, zc), H * 0.35);
        pool(c, new THREE.Vector3(e.x + e.inward * H * 0.14, 0, zc), H * 0.12, hue, 0.22, 1.6);
      }
    }
  }

  // Candles at the foot of the walls: wax, a flame, a flickering light.
  const wax = std({ color: 0xe8dcc0, roughness: 0.6 });
  const flame = new THREE.MeshBasicMaterial({ color: 0xffc46a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const e of edges(c, 0.075)) {
    for (const z of [c.at(0.5, 0.3).z, c.at(0.5, 0.66).z]) {
      const g = new THREE.Group();
      for (let k = 0; k < 5; k++) {
        const hgt = H * (0.02 + c.rand() * 0.04);
        const x = (c.rand() - 0.5) * H * 0.05;
        const zz = (c.rand() - 0.5) * H * 0.05;
        const candle = new THREE.Mesh(new THREE.CylinderGeometry(H * 0.006, H * 0.006, hgt, 12), wax);
        candle.position.set(x, hgt / 2, zz);
        const f = new THREE.Mesh(new THREE.SphereGeometry(H * 0.004, 8, 8), flame);
        f.position.set(x, hgt + H * 0.006, zz);
        g.add(candle, f);
        c.onTick((t) => f.scale.set(1 + Math.sin(t * 13 + k) * 0.15, 1.8 + Math.sin(t * 17 + k * 2) * 0.35, 1));
      }
      g.position.set(e.x, 0, z);
      c.add(shadowed(g));
      c.glow(0xffa64a, 24, new THREE.Vector3(e.x, H * 0.06, z), H * 0.25, 0.25);
    }
  }

  const trim = std({ color: 0x9a86c8, emissive: 0x5a3cb0, emissiveIntensity: 0.7, roughness: 0.3, metalness: 0.5 });
  dais(c, L.opp.u, L.opp.v, stoneMat, trim);
  dais(c, L.me.u, L.me.v, stoneMat, trim);
  c.particles({ count: 90, color: 0xb9a6ff, size: H * 0.007, motion: "wander", speed: H * 0.008, height: H * 0.2, opacity: 0.55 });
}

// ------------------------------------------------------------------ Forge (red)

/** A forge in a volcano: basalt tiles with lava glowing in the cracks (hotter toward the middle),
    a river of lava across the middle between stone banks, cliffs of basalt columns along the
    edges, braziers, embers rising. */
function forge(c: SceneCtx): void {
  const { h: H } = c.span;
  const L = c.layout;
  c.add(new THREE.HemisphereLight(0xffb48a, 0x1a0805, 0.6));
  c.sun(0xffd2a8, 1.5, [-30, 70, -20]);

  const hexes = (g: G, w: number, h: number, fill: boolean) => {
    const r = h / 34;
    const dx = r * Math.sqrt(3);
    for (let y = 0, row = 0; y < h + r; y += r * 1.5, row++) {
      for (let x = row % 2 ? dx / 2 : 0; x < w + dx; x += dx) {
        g.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = Math.PI / 6 + (k * Math.PI) / 3;
          const jitter = 1 + (c.rand() - 0.5) * 0.08;
          g.lineTo(x + Math.cos(a) * r * 0.93 * jitter, y + Math.sin(a) * r * 0.93 * jitter);
        }
        g.closePath();
        if (fill) {
          const t = 24 + Math.floor(c.rand() * 18);
          g.fillStyle = `rgb(${t + 8},${t - 1},${t - 6})`;
          g.fill();
          g.strokeStyle = "rgba(255,255,255,0.05)";
          g.lineWidth = 3;
          g.stroke();
        } else g.stroke();
      }
    }
  };
  const map = c.floorTexture((g, w, h) => {
    g.fillStyle = "#0e0605";
    g.fillRect(0, 0, w, h);
    hexes(g, w, h, true);
    speckle(g, w, h, (w * h) / 80, ["rgba(0,0,0,0.25)", "rgba(90,70,60,0.14)"], [1, 3], c.rand);
  });
  const cracks = c.floorTexture((g, w, h, px) => {
    g.fillStyle = "#000";
    g.fillRect(0, 0, w, h);
    const [, my] = px(0.5, L.mid);
    // Hotter toward the river, nearly cold at the far ends.
    const heat = g.createLinearGradient(0, 0, 0, h);
    const m = my / h;
    heat.addColorStop(0, "rgba(255,70,15,0.06)");
    heat.addColorStop(Math.max(0, m - 0.22), "rgba(255,80,20,0.18)");
    heat.addColorStop(Math.max(0, m - 0.05), "rgba(255,150,50,0.95)");
    heat.addColorStop(Math.min(1, m + 0.05), "rgba(255,150,50,0.95)");
    heat.addColorStop(Math.min(1, m + 0.22), "rgba(255,80,20,0.18)");
    heat.addColorStop(1, "rgba(255,70,15,0.06)");
    g.strokeStyle = heat;
    g.lineWidth = h / 320;
    g.shadowColor = "#ff6a1a";
    g.shadowBlur = h / 160;
    hexes(g, w, h, false);
  });
  const ground = floor(c, map, { roughness: 0.85, bump: 1.6, emissive: cracks, emissiveColor: 0xff7a2a, emissiveIntensity: 0.8 });
  c.onTick((t) => (ground.emissiveIntensity = 0.75 + Math.sin(t * 0.9) * 0.12));

  // The river of lava, slowly flowing, between basalt banks.
  const depth = H * 0.055;
  const lava = repeatTex(c.texture(512, 128, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#c22a08");
    grad.addColorStop(0.5, "#ff7a1a");
    grad.addColorStop(1, "#c22a08");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 700, ["#ffb030", "#ff8a1a", "#a82006", "#ffd060", "#6a1203"], [3, 16], c.rand);
  }), bandRepeat(c, depth, 4));
  const river = band(c, L.mid, depth, H * 0.003, std({ map: lava, emissiveMap: lava, emissive: 0xffffff, emissiveIntensity: 1.3, roughness: 0.6 }));
  river.castShadow = false;
  c.onTick((t) => (lava.offset.x = t * 0.03));
  const bank = std({ color: 0x241b18, roughness: 0.9, flatShading: true });
  for (const s of [-1, 1]) band(c, L.mid, H * 0.02, H * 0.02, bank).position.z += s * (depth / 2 + H * 0.01);
  for (let i = 0; i < 4; i++) c.glow(0xff6a20, 55, c.at(0.2 + i * 0.2, L.mid, H * 0.05), H * 0.4, 0.2);

  // Cliffs of basalt columns along both edges.
  const basalt = std({ color: 0x2c2522, roughness: 0.85, flatShading: true });
  const top = std({ color: 0x3a302c, roughness: 0.7, flatShading: true });
  const colGeo = new THREE.CylinderGeometry(1, 1.08, 1, 6);
  for (const e of edges(c, 0.025)) {
    for (const z of down(c, e.z0, e.z1, 26)) {
      for (let k = 0; k < 2; k++) {
        const hgt = H * (0.08 + c.rand() * 0.22) * (k ? 0.6 : 1);
        const r = H * (0.022 + c.rand() * 0.012);
        const col = new THREE.Mesh(colGeo, [basalt, top, basalt]);
        col.scale.set(r, hgt, r);
        col.position.set(e.x - e.inward * H * 0.02 + k * e.inward * H * 0.045 + (c.rand() - 0.5) * H * 0.02, hgt / 2, z + (c.rand() - 0.5) * H * 0.02);
        col.rotation.y = c.rand();
        c.add(shadowed(col));
      }
    }
  }

  // Braziers in front of the cliffs.
  const iron = std({ color: 0x3a302c, roughness: 0.5, metalness: 0.8 });
  const coal = std({ color: 0x8a2a08, emissive: 0xff4a08, emissiveIntensity: 1, roughness: 0.8 });
  const fireMat = new THREE.MeshBasicMaterial({ color: 0xff7a20, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const e of edges(c, 0.075)) for (const v of [0.24, 0.72]) {
    const p = new THREE.Vector3(e.x, 0, c.at(0.5, v).z);
    const g = new THREE.Group();
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(H * 0.032, H * 0.018, H * 0.022, 16, 1, true), iron);
    bowl.position.y = H * 0.07;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(H * 0.005, H * 0.009, H * 0.06, 8), iron);
    leg.position.y = H * 0.03;
    const embers = new THREE.Mesh(new THREE.SphereGeometry(H * 0.026, 14, 10), coal);
    embers.scale.y = 0.45;
    embers.position.y = H * 0.078;
    const fire = new THREE.Mesh(new THREE.ConeGeometry(H * 0.022, H * 0.07, 12, 1, true), fireMat);
    fire.position.y = H * 0.11;
    g.add(bowl, leg, embers, fire);
    g.position.copy(p);
    c.add(shadowed(g));
    c.onTick((t) => fire.scale.set(1 + Math.sin(t * 11 + p.z) * 0.12, 1 + Math.sin(t * 7.3 + p.x) * 0.25, 1 + Math.sin(t * 9 + p.z) * 0.12));
    c.glow(0xff8a3a, 55, p.clone().setY(H * 0.12), H * 0.4, 0.3);
    pool(c, p, H * 0.12, 0xff7a2a, 0.25);
  }

  const trim = std({ color: 0xffa060, emissive: 0xff5a10, emissiveIntensity: 1, roughness: 0.5 });
  dais(c, L.opp.u, L.opp.v, basalt, trim);
  dais(c, L.me.u, L.me.v, basalt, trim);
  c.particles({ count: 130, color: 0xffa040, size: H * 0.007, motion: "rise", speed: H * 0.03, height: H * 0.35 });
}

// ------------------------------------------------------------------ Academy (white)

/** A sunlit academy hall: a marble floor inlaid with gold arcs over teal glass, a raised marble
    walkway with gold trim across the middle, tall bookshelves and columns down the sides, open
    books on desks, shafts of light and golden motes. */
function academy(c: SceneCtx): void {
  const { h: H } = c.span;
  const L = c.layout;
  c.add(new THREE.HemisphereLight(0xfff4e0, 0x403a30, 1.0));
  c.sun(0xfff0d8, 2.4, [-40, 70, -30]);

  const map = c.floorTexture((g, w, h, px) => {
    g.fillStyle = "#bdb5a4";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(100,90,80,0.14)";
    g.lineWidth = 2;
    for (let i = 0; i < 180; i++) {
      let x = c.rand() * w;
      let y = c.rand() * h;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 8; k++) {
        x += (c.rand() - 0.3) * 80;
        y += (c.rand() - 0.5) * 50;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    // Teal glass panes framed in gold arcs, mirrored on either side.
    const [, my] = px(0.5, L.mid);
    const unit = h / 10;
    for (const s of [-1, 1]) {
      for (let k = -3; k <= 3; k++) {
        const [cx] = px(0.5 + k * 0.17, L.mid);
        const cy = my + s * unit * 3.6;
        const glassGrad = g.createRadialGradient(cx - unit * 0.6, cy - unit * 0.6, unit * 0.2, cx, cy, unit * 2.3);
        glassGrad.addColorStop(0, "#3f9e95");
        glassGrad.addColorStop(1, "#1f6b66");
        g.fillStyle = glassGrad;
        g.beginPath();
        g.arc(cx, cy, unit * 2.3, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = "#a8853a";
        g.lineWidth = unit * 0.11;
        g.beginPath();
        g.arc(cx, cy, unit * 2.3, 0, Math.PI * 2);
        g.stroke();
        g.lineWidth = unit * 0.045;
        g.beginPath();
        g.arc(cx, cy, unit * 1.2, 0, Math.PI * 2);
        g.stroke();
      }
    }
    g.strokeStyle = "#a8853a";
    g.lineWidth = unit * 0.06;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(0, my + s * unit * 0.98);
      g.lineTo(w, my + s * unit * 0.98);
      g.stroke();
    }
  });
  floor(c, map, { roughness: 0.32, metalness: 0.05, bump: 0.3 });

  // The walkway, with gold trim along both sides.
  const depth = H * 0.085;
  band(c, L.mid, depth, H * 0.016, std({ color: 0xcfd3da, roughness: 0.3 }));
  const gold = std({ color: 0xd8ac4a, roughness: 0.25, metalness: 1 });
  for (const s of [-1, 1]) band(c, L.mid, H * 0.006, H * 0.02, gold).position.z += s * (depth / 2 + H * 0.002);

  // Tall bookshelves down both edges, with columns between them.
  const wood = std({ color: 0x4a2e1c, roughness: 0.7 });
  const spines = c.texture(512, 512, (g, w, h) => {
    g.fillStyle = "#24160d";
    g.fillRect(0, 0, w, h);
    const colors = ["#7a1f22", "#1f3f7a", "#2f6a3a", "#8a6a1f", "#5a2a6a", "#a0522d", "#2a5a5a", "#6a5a4a"];
    const rows = 6;
    for (let row = 0; row < rows; row++) {
      let x = 0;
      while (x < w) {
        const bw = 8 + c.rand() * 14;
        const bh = h / rows - 10 - c.rand() * 14;
        g.fillStyle = colors[Math.floor(c.rand() * colors.length)]!;
        g.fillRect(x, row * (h / rows) + (h / rows - bh), bw - 1, bh);
        g.fillStyle = "rgba(230,200,120,0.5)";
        g.fillRect(x + 1, row * (h / rows) + (h / rows - bh) + 6, bw - 3, 2);
        x += bw;
      }
      g.fillStyle = "#4a2e1c";
      g.fillRect(0, (row + 1) * (h / rows) - 4, w, 4);
    }
  });
  const shelfH = H * 0.3;
  const marble = std({ color: 0xe6e2da, roughness: 0.35 });
  for (const e of edges(c, 0.006)) {
    const len = e.z1 - e.z0;
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(H * 0.06, shelfH, len), wood);
    shelf.position.set(e.x - e.inward * H * 0.03, shelfH / 2, (e.z0 + e.z1) / 2);
    c.add(shadowed(shelf));
    const front = new THREE.Mesh(new THREE.PlaneGeometry(len, shelfH * 0.92), std({ map: repeatTex(spines.clone(), Math.round(len / (H * 0.32)), 1), roughness: 0.8 }));
    front.rotation.y = e.inward > 0 ? Math.PI / 2 : -Math.PI / 2;
    front.position.set(e.x + e.inward * H * 0.0015, shelfH / 2, (e.z0 + e.z1) / 2);
    c.add(front);
    for (const z of down(c, e.z0, e.z1, 4).map((_, i) => e.z0 + ((i + 1) * len) / 5)) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(H * 0.022, H * 0.026, shelfH * 1.05, 20), marble);
      col.position.set(e.x + e.inward * H * 0.018, shelfH * 0.525, z);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(H * 0.06, H * 0.018, H * 0.06), gold);
      cap.position.set(col.position.x, shelfH * 1.06, z);
      c.add(shadowed(col));
      c.add(shadowed(cap));
    }
  }

  // Desks with open books by the bottom corners.
  const paper = std({ color: 0xf2ead6, roughness: 0.9 });
  for (const u of [0.1, 0.9]) {
    const p = c.at(u, 0.92);
    const desk = new THREE.Mesh(new THREE.BoxGeometry(H * 0.18, H * 0.04, H * 0.08), wood);
    desk.position.set(p.x, H * 0.02, p.z);
    c.add(shadowed(desk));
    for (const s of [-1, 1]) {
      const page = new THREE.Mesh(new THREE.BoxGeometry(H * 0.045, H * 0.003, H * 0.055), paper);
      page.position.set(p.x + s * H * 0.024, H * 0.043, p.z);
      page.rotation.z = s * 0.12;
      c.add(shadowed(page));
    }
  }

  // Shafts of sunlight across the floor, slowly brightening and dimming.
  for (let i = 0; i < 4; i++) {
    const p = c.at(0.18 + i * 0.21, 0.28 + (i % 2) * 0.4);
    const shaft = pool(c, p, H * 0.09, 0xfff1cc, 0.16, 5, 0.7);
    c.onTick((t) => ((shaft.material as THREE.MeshBasicMaterial).opacity = 0.13 + Math.sin(t * 0.4 + i) * 0.04));
  }

  dais(c, L.opp.u, L.opp.v, marble, gold);
  dais(c, L.me.u, L.me.v, marble, gold);
  c.particles({ count: 60, color: 0xffd98a, size: H * 0.007, motion: "wander", speed: H * 0.01, height: H * 0.22, opacity: 0.8 });
}
