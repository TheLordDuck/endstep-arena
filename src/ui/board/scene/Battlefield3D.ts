// The table in 3D, as Arena's battlefields: a scene seen almost from above, its floor lined up with
// the board (the band across the middle where the board's midline is, a dais under each player's
// picture), with modelled scenery along the edges, lights, shadows and drifting particles. Every
// texture is drawn here, on canvases; nothing is downloaded. See themes.ts for the scenes.

import * as THREE from "three";
import { THEMES, type ThemeName } from "./themes";

/** Where the board's landmarks are, as shares of its width (u) and height (v). */
export interface SceneLayout {
  /** The midline between the two sides. */
  mid: number;
  /** The opponent's and your picture. */
  opp: { u: number; v: number };
  me: { u: number; v: number };
  /** The side columns (plates, piles, stack, buttons): their widths. */
  left: number;
  right: number;
}

/** What a scene is built with (see themes.ts). */
export interface SceneCtx {
  layout: SceneLayout;
  /** The floor point under a spot of the board (u, v), raised by y. */
  at(u: number, v: number, y?: number): THREE.Vector3;
  /** The visible floor's size at the middle of the board (world units). */
  span: { w: number; h: number };
  /** The floor's rectangle (covers the whole view). */
  box: { x0: number; x1: number; z0: number; z1: number };
  /** A canvas texture of the whole floor: `draw` paints it with `px(u, v)` placing board spots on it. */
  floorTexture(draw: (g: CanvasRenderingContext2D, w: number, h: number, px: (u: number, v: number) => [number, number]) => void, color?: boolean): THREE.CanvasTexture;
  /** A canvas texture of any size. */
  texture(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, color?: boolean): THREE.CanvasTexture;
  /** Puts it in the scene (and frees it when the scene changes). */
  add<T extends THREE.Object3D>(obj: T): T;
  /** A repeatable random number in [0, 1). */
  rand(): number;
  /** Drifting particles over a part of the floor. */
  particles(opts: ParticleOpts): void;
  /** The main light: from above at an angle, casting the shadows. */
  sun(color: number, intensity: number, from: [number, number, number]): THREE.DirectionalLight;
  /** A light that flickers like a flame (or pulses, with `pulse`). */
  glow(color: number, intensity: number, at: THREE.Vector3, distance: number, flicker?: number): THREE.PointLight;
  /** Called on every frame with the time (s). `moves` when it moves something that casts a shadow
      (the shadows are otherwise drawn once per scene, as nothing else in it moves). */
  onTick(fn: (t: number, dt: number) => void, moves?: "shadow"): void;
}

export interface ParticleOpts {
  count: number;
  color: number;
  /** Size in world units. */
  size: number;
  /** "rise" (embers), "fall" (snow), "wander" (fireflies, motes). */
  motion: "rise" | "fall" | "wander";
  speed: number;
  /** The part of the board they're over (u0, v0, u1, v1); the whole board by default. */
  area?: [number, number, number, number];
  /** How high above the floor they go (world units). */
  height: number;
  opacity?: number;
}

const DEFAULT_LAYOUT: SceneLayout = { mid: 0.47, opp: { u: 0.5, v: 0.12 }, me: { u: 0.5, v: 0.82 }, left: 0.17, right: 0.17 };
/** The background renders at most this often (frames per second). */
const FPS = 30;

export class Battlefield3D {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(44, 16 / 9, 1, 400);
  private world = new THREE.Group();
  private themeName: ThemeName | null = null;
  private ticks: ((t: number, dt: number) => void)[] = [];
  /** Whether a tick moves something that casts a shadow: the shadows are then drawn every frame. */
  private movingShadows = false;
  private layoutNow: SceneLayout = DEFAULT_LAYOUT;
  private size = { w: 0, h: 0 };
  private raf = 0;
  private last = 0;
  private clock = 0;
  private animated = true;
  private running = false;
  private rebuildTimer = 0;

  /** Null where WebGL isn't available. */
  static create(): Battlefield3D | null {
    try {
      return new Battlefield3D();
    } catch {
      return null;
    }
  }

  private constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "scene3d";
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: "low-power" });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Drawn when the scene is built, and on every frame only where something casting one moves.
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // Down at the board, tilted a little, with a wide enough lens that the scenery at the edges
    // rises toward the viewer, as in Arena; -z is the top of the screen (the opponent's side).
    this.camera.up.set(0, 0, -1);
    this.camera.position.set(0, 40, 8);
    this.camera.lookAt(0, 0, 0.6);
    this.scene.add(this.world);
  }

  setTheme(name: ThemeName): void {
    if (name === this.themeName) return;
    this.themeName = name;
    this.rebuild();
  }

  /** The board's landmarks moved (a resize, the log opening…): the scene follows, a moment later. */
  setLayout(l: SceneLayout): void {
    const a = this.layoutNow;
    const moved = Math.abs(a.mid - l.mid) > 0.01 || Math.abs(a.opp.v - l.opp.v) > 0.01 || Math.abs(a.me.v - l.me.v) > 0.01
      || Math.abs(a.opp.u - l.opp.u) > 0.01 || Math.abs(a.me.u - l.me.u) > 0.01 || Math.abs(a.left - l.left) > 0.01 || Math.abs(a.right - l.right) > 0.01;
    if (!moved) return;
    this.layoutNow = l;
    this.scheduleRebuild();
  }

  resize(w: number, h: number): void {
    w = Math.round(w);
    h = Math.round(h);
    if (!w || !h || (w === this.size.w && h === this.size.h)) return;
    const first = !this.size.w;
    this.size = { w, h };
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (first) this.rebuild();
    else this.scheduleRebuild();
  }

  /** Animations on (particles, flames) or a still picture. */
  setAnimated(on: boolean): void {
    this.animated = on;
    if (!on) this.renderOnce();
  }

  /** Runs while the board is shown; stopped, it costs nothing. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      // Not while the tab or the board is hidden (Endstep's own UI shown).
      if (document.hidden || !this.animated || !this.canvas.offsetParent) return;
      if (now - this.last < 1000 / FPS - 2) return;
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.clock += dt;
      for (const fn of this.ticks) fn(this.clock, dt);
      if (this.movingShadows) this.renderer.shadowMap.needsUpdate = true;
      this.renderer.render(this.scene, this.camera);
    };
    this.raf = requestAnimationFrame(loop);
    this.renderOnce();
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  dispose(): void {
    this.stop();
    this.clear();
    this.renderer.dispose();
    this.canvas.remove();
  }

  private renderOnce(): void {
    if (!this.size.w) return;
    for (const fn of this.ticks) fn(this.clock, 0);
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
  }

  private scheduleRebuild(): void {
    clearTimeout(this.rebuildTimer);
    this.rebuildTimer = window.setTimeout(() => this.rebuild(), 160);
  }

  private clear(): void {
    this.world.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      for (const m of mats) {
        for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
        m.dispose();
      }
    });
    this.world.clear();
    this.ticks = [];
    this.movingShadows = false;
    this.scene.background = null;
    this.scene.fog = null;
  }

  private rebuild(): void {
    if (!this.themeName || !this.size.w) return;
    this.clear();
    // The camera's matrices, which floorAt() casts its rays through (they're otherwise only
    // brought up to date by a render).
    this.camera.updateMatrixWorld();
    THEMES[this.themeName](this.context());
    this.renderOnce();
  }

  /** The floor point under board spot (u, v). */
  private floorAt(u: number, v: number): THREE.Vector3 {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(u * 2 - 1, 1 - v * 2), this.camera);
    const hit = new THREE.Vector3();
    ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit);
    return hit;
  }

  private context(): SceneCtx {
    const corners = [this.floorAt(0, 0), this.floorAt(1, 0), this.floorAt(0, 1), this.floorAt(1, 1)];
    const pad = 4;
    const box = {
      x0: Math.min(...corners.map((c) => c.x)) - pad, x1: Math.max(...corners.map((c) => c.x)) + pad,
      z0: Math.min(...corners.map((c) => c.z)) - pad, z1: Math.max(...corners.map((c) => c.z)) + pad,
    };
    const span = { w: this.floorAt(1, 0.5).x - this.floorAt(0, 0.5).x, h: this.floorAt(0.5, 1).z - this.floorAt(0.5, 0).z };
    let seed = 1337;
    const rand = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    const texture = (w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, color = true) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      draw(c.getContext("2d")!, w, h);
      const t = new THREE.CanvasTexture(c);
      if (color) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = Math.min(8, maxAniso);
      return t;
    };
    // The floor texture covers `box`; 1px is the same size across and down.
    const fw = 2048;
    const fh = Math.round(fw * (box.z1 - box.z0) / (box.x1 - box.x0));
    const floorTexture: SceneCtx["floorTexture"] = (draw, color = true) => texture(fw, fh, (g, w, h) => draw(g, w, h, (u, v) => {
      const p = this.floorAt(u, v);
      return [((p.x - box.x0) / (box.x1 - box.x0)) * w, ((p.z - box.z0) / (box.z1 - box.z0)) * h];
    }), color);
    const add = <T extends THREE.Object3D>(obj: T) => {
      this.world.add(obj);
      return obj;
    };
    const ctx: SceneCtx = {
      layout: this.layoutNow,
      at: (u, v, y = 0) => this.floorAt(u, v).setY(y),
      span, box, floorTexture, texture, add, rand,
      onTick: (fn, moves) => {
        this.ticks.push(fn);
        if (moves === "shadow") this.movingShadows = true;
      },
      sun: (color, intensity, from) => {
        const light = new THREE.DirectionalLight(color, intensity);
        light.position.set(...from);
        light.castShadow = true;
        light.shadow.mapSize.set(1024, 1024);
        const cam = light.shadow.camera;
        const r = Math.max(box.x1 - box.x0, box.z1 - box.z0) / 2;
        cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r; cam.near = 1; cam.far = 300;
        light.shadow.bias = -0.0006;
        light.shadow.normalBias = 0.02;
        add(light);
        add(light.target);
        return light;
      },
      glow: (color, intensity, at, distance, flicker = 0) => {
        const light = new THREE.PointLight(color, intensity, distance, 2);
        light.position.copy(at);
        add(light);
        if (flicker) {
          const phase = rand() * 100;
          ctx.onTick((t) => {
            const n = Math.sin(t * 9 + phase) * 0.5 + Math.sin(t * 23.7 + phase * 2) * 0.3 + Math.sin(t * 4.1 + phase) * 0.2;
            light.intensity = intensity * (1 + n * flicker);
          });
        }
        return light;
      },
      particles: (o) => {
        const [u0, v0, u1, v1] = o.area ?? [0, 0, 1, 1];
        const a = this.floorAt(u0, v0);
        const b = this.floorAt(u1, v1);
        const pos = new Float32Array(o.count * 3);
        const seeds = new Float32Array(o.count);
        for (let i = 0; i < o.count; i++) {
          pos[i * 3] = a.x + rand() * (b.x - a.x);
          pos[i * 3 + 1] = rand() * o.height;
          pos[i * 3 + 2] = a.z + rand() * (b.z - a.z);
          seeds[i] = rand() * 100;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        const sprite = texture(64, 64, (g) => {
          const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
          grad.addColorStop(0, "rgba(255,255,255,1)");
          grad.addColorStop(0.25, "rgba(255,255,255,0.75)");
          grad.addColorStop(1, "rgba(255,255,255,0)");
          g.fillStyle = grad;
          g.fillRect(0, 0, 64, 64);
        });
        const mat = new THREE.PointsMaterial({ color: o.color, size: o.size, map: sprite, transparent: true, opacity: o.opacity ?? 0.9,
          depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
        add(new THREE.Points(geo, mat));
        ctx.onTick((t, dt) => {
          for (let i = 0; i < o.count; i++) {
            const s = seeds[i]!;
            const k = i * 3;
            if (o.motion === "rise") {
              pos[k + 1]! += dt * o.speed * (0.6 + (s % 1));
              pos[k]! += Math.sin(t * 1.3 + s) * dt * o.speed * 0.3;
              if (pos[k + 1]! > o.height) pos[k + 1] = 0;
            } else if (o.motion === "fall") {
              pos[k + 1]! -= dt * o.speed * (0.6 + (s % 1));
              pos[k]! += Math.sin(t * 0.7 + s) * dt * o.speed * 0.4;
              if (pos[k + 1]! < 0) pos[k + 1] = o.height;
            } else {
              pos[k]! += Math.sin(t * 0.5 + s) * dt * o.speed;
              pos[k + 2]! += Math.cos(t * 0.43 + s * 1.7) * dt * o.speed;
              pos[k + 1] = o.height * (0.5 + 0.5 * Math.sin(t * 0.3 + s));
            }
          }
          geo.attributes.position!.needsUpdate = true;
          // Fireflies and motes breathe.
          if (o.motion === "wander") mat.opacity = (o.opacity ?? 0.9) * (0.75 + 0.25 * Math.sin(t * 2.1));
        });
      },
    };
    return ctx;
  }
}
