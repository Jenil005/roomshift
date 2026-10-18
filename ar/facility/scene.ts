// Blackout Protocol research facility, life-size (3.4 m x 3.4 m x 2.5 m, meters, floor y=0,
// open entrance at local +Z). Everything that changes is driven by `apply(state)` with
// SERVER state only (room.systems, phase, shared boot draft, final holds). Taps on hotspots
// are reported to the host, which turns them into requests; the scene never decides.
//
// Performance: no real-time shadows (blob shadows), procedural canvas textures (no
// downloads), at most two dynamic lights, shared geometries and materials.
import * as THREE from "three";

export const FACILITY_SIZE = Object.freeze({ width: 3.4, depth: 3.4, height: 2.5 });
export const FACILITY_NAME = "roomshift-facility";

export type FacilityQuality = "high" | "low";
export type ModuleHotspot = { kind: "module"; id: string };
export type Hotspot = ModuleHotspot | { kind: "station"; id: string } | { kind: "door" };

/** Server-derived state the facility renders. */
export interface FacilityState {
  breaker: boolean;
  terminal: boolean;
  door: boolean;
  phase: string;
  draft: readonly string[]; // shared boot order (puzzle 2)
  modules: readonly { id: string; label: string }[];
  holding: number; // players holding the final panel
  players: number; // connected players
}

export interface Facility {
  root: THREE.Group;
  hotspots: THREE.Object3D[]; // each has userData.hotspot: Hotspot
  apply(state: FacilityState): void;
  /** Brief red flash on a part (e.g. after a rejected attempt). */
  flash(part: "terminal" | "breaker"): void;
  update(seconds: number, dt: number): void;
  dispose(): void;
}

const W = FACILITY_SIZE.width / 2;
const D = FACILITY_SIZE.depth / 2;
const H = FACILITY_SIZE.height;

/* ---------- procedural textures ---------- */

function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void, repeat = 1) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  draw(canvas.getContext("2d")!, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Deterministic noise so every phone renders the same facility.
function rng(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

const brushed = (base: string) =>
  canvasTexture(256, (ctx, s) => {
    const r = rng(7);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y++) {
      ctx.fillStyle = `rgba(255,255,255,${r() * 0.07})`;
      ctx.fillRect(0, y, s, 1);
      ctx.fillStyle = `rgba(0,0,0,${r() * 0.08})`;
      ctx.fillRect(r() * s, y, r() * s * 0.6, 1);
    }
  });

const concrete = () =>
  canvasTexture(256, (ctx, s) => {
    const r = rng(11);
    ctx.fillStyle = "#4a4d4f";
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 2600; i++) {
      const v = Math.floor(60 + r() * 50);
      ctx.fillStyle = `rgba(${v},${v},${v + 2},${0.2 + r() * 0.3})`;
      ctx.fillRect(r() * s, r() * s, 1 + r() * 2, 1 + r() * 2);
    }
  });

const hazard = () =>
  canvasTexture(128, (ctx, s) => {
    ctx.fillStyle = "#16181a";
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = "#e0a526";
    for (let i = -s; i < s * 2; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 16, 0);
      ctx.lineTo(i + 16 - s, s);
      ctx.lineTo(i - s, s);
      ctx.fill();
    }
  });

const panelGrid = () =>
  canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = "#2a3034";
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = "#15191c";
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, s - 4, s - 4);
    ctx.strokeRect(s * 0.1, s * 0.1, s * 0.8, s * 0.35);
    ctx.fillStyle = "#3a4247";
    for (let i = 0; i < 6; i++) ctx.fillRect(s * 0.14 + i * s * 0.12, s * 0.6, s * 0.06, s * 0.28); // vents
  });

const blob = () =>
  canvasTexture(128, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, "rgba(0,0,0,0.55)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });

/** Text on a transparent plane. Redrawn in place (same texture) when the text changes. */
class Label {
  readonly mesh: THREE.Mesh;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private readonly px: number;
  private text = "";
  private color = "";
  constructor(width: number, height: number, px = 72) {
    this.px = px;
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = Math.round((1024 * height) / width);
    this.ctx = canvas.getContext("2d")!;
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false, toneMapped: false }),
    );
  }
  set(text: string, color: string) {
    if (text === this.text && color === this.color) return;
    this.text = text;
    this.color = color;
    const { canvas } = this.ctx;
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.ctx.fillStyle = color;
    this.ctx.font = `bold ${this.px}px ui-monospace, Menlo, monospace`;
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.shadowColor = color;
    this.ctx.shadowBlur = 12;
    this.ctx.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width - 24);
    this.texture.needsUpdate = true;
  }
}

/* ---------- facility ---------- */

export function createFacility({ quality = "high" }: { quality?: FacilityQuality } = {}): Facility {
  const root = new THREE.Group();
  root.name = FACILITY_NAME;
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
  const hotspots: THREE.Object3D[] = [];
  const labels: Label[] = [];
  const label = (w: number, h: number, px?: number) => {
    const l = new Label(w, h, px);
    labels.push(l);
    return l;
  };

  // Materials: physically based, believable roughness/metalness.
  const steelMap = keep(brushed("#8a9399"));
  const darkSteelMap = keep(brushed("#3b4247"));
  const concreteMap = keep(concrete());
  const panelMap = keep(panelGrid());
  const hazardMap = keep(hazard());
  const blobMap = keep(blob());
  const steel = keep(new THREE.MeshStandardMaterial({ map: steelMap, metalness: 0.85, roughness: 0.38 }));
  const graphite = keep(new THREE.MeshStandardMaterial({ map: darkSteelMap, metalness: 0.7, roughness: 0.55 }));
  const panel = keep(new THREE.MeshStandardMaterial({ map: panelMap, metalness: 0.5, roughness: 0.62 }));
  const concreteMat = keep(new THREE.MeshStandardMaterial({ map: concreteMap, metalness: 0.0, roughness: 0.95 }));
  const rubber = keep(new THREE.MeshStandardMaterial({ color: 0x111315, metalness: 0.1, roughness: 0.9 }));
  const glass = keep(new THREE.MeshPhysicalMaterial({ color: 0x86a6ad, metalness: 0, roughness: 0.08, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false }));
  const hazardMat = keep(new THREE.MeshStandardMaterial({ map: hazardMap, roughness: 0.8, metalness: 0.1 }));
  const shadowMat = keep(new THREE.MeshBasicMaterial({ map: blobMap, transparent: true, depthWrite: false }));
  // Emissive materials whose intensity follows the power state.
  const emergency = keep(new THREE.MeshStandardMaterial({ color: 0x400608, emissive: 0xff2a1f, emissiveIntensity: 1.2, roughness: 0.4 }));
  const strip = keep(new THREE.MeshStandardMaterial({ color: 0x1b2328, emissive: 0xbfe8ff, emissiveIntensity: 0.02, roughness: 0.5 }));
  const coreGlow = keep(new THREE.MeshStandardMaterial({ color: 0x220405, emissive: 0xff3b2a, emissiveIntensity: 0.25, roughness: 0.3, transparent: true, opacity: 0.92 }));
  const okLamp = keep(new THREE.MeshStandardMaterial({ color: 0x06240f, emissive: 0x45ff8a, emissiveIntensity: 1.4 }));
  const RED = new THREE.Color(0xff2020);
  const screenOff = keep(new THREE.MeshStandardMaterial({ color: 0x050809, emissive: 0x0a1418, emissiveIntensity: 0.3, roughness: 0.25, metalness: 0.2 }));

  const geo = {
    box: keep(new THREE.BoxGeometry(1, 1, 1)),
    cyl: keep(new THREE.CylinderGeometry(1, 1, 1, 24)),
    plane: keep(new THREE.PlaneGeometry(1, 1)),
  };
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material, parent: THREE.Object3D = root) => {
    const m = new THREE.Mesh(geo.box, mat);
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  const cyl = (r: number, h: number, x: number, y: number, z: number, mat: THREE.Material, parent: THREE.Object3D = root) => {
    const m = new THREE.Mesh(geo.cyl, mat);
    m.scale.set(r, h, r);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  const shadow = (w: number, d: number, x: number, z: number) => {
    const m = new THREE.Mesh(geo.plane, shadowMat);
    m.rotation.x = -Math.PI / 2;
    m.scale.set(w, d, 1);
    m.position.set(x, 0.004, z);
    m.renderOrder = -1;
    root.add(m);
  };

  /* Frame: pillars, beams, ceiling conduit and cables. No opaque walls or floor: the real room stays visible. */
  for (const x of [-W, W]) for (const z of [-D, D]) {
    box(0.1, H, 0.1, x, H / 2, z, steel);
    box(0.2, 0.08, 0.2, x, 0.04, z, graphite);
  }
  for (const z of [-D, D]) box(FACILITY_SIZE.width, 0.08, 0.1, 0, H, z, graphite);
  for (const x of [-W, W]) box(0.1, 0.08, FACILITY_SIZE.depth, x, H, 0, graphite);
  for (const x of [-0.9, 0, 0.9]) {
    const pipe = cyl(0.035, FACILITY_SIZE.depth, x, H - 0.12, 0, steel);
    pipe.rotation.x = Math.PI / 2;
  }
  [-0.45, 0.45].forEach((x) => box(0.08, 0.025, FACILITY_SIZE.depth - 0.3, x, H - 0.06, 0, strip));
  // Sagging cable bundles between pillars.
  for (const [x0, x1, z] of [[-W, W, -D + 0.06], [-W, -W, 0]] as const) {
    const curve = new THREE.CatmullRomCurve3(
      x0 === x1
        ? [new THREE.Vector3(x0 + 0.06, H - 0.2, -D), new THREE.Vector3(x0 + 0.06, H - 0.45, 0), new THREE.Vector3(x0 + 0.06, H - 0.2, D)]
        : [new THREE.Vector3(x0, H - 0.2, z), new THREE.Vector3(0, H - 0.5, z), new THREE.Vector3(x1, H - 0.2, z)],
    );
    root.add(new THREE.Mesh(keep(new THREE.TubeGeometry(curve, 24, 0.018, 6)), rubber));
  }
  // Lower wall panels (knee height) and translucent glass above: industrial but see-through.
  box(FACILITY_SIZE.width - 0.1, 0.55, 0.04, 0, 0.275, -D + 0.02, panel);
  box(0.04, 0.55, FACILITY_SIZE.depth - 0.1, -W + 0.02, 0.275, 0, panel);
  box(0.04, 0.55, FACILITY_SIZE.depth - 0.1, W - 0.02, 0.275, 0, panel);
  box(FACILITY_SIZE.width - 0.1, 1.6, 0.012, 0, 1.35, -D + 0.02, glass);
  box(0.012, 1.6, FACILITY_SIZE.depth - 0.1, -W + 0.02, 1.35, 0, glass);
  box(0.012, 1.6, FACILITY_SIZE.depth - 0.1, W - 0.02, 1.35, 0, glass);
  // Footprint border: hazard tape on the floor so players see the 3.4 m boundary.
  for (const [w, d, x, z] of [[FACILITY_SIZE.width, 0.06, 0, -D], [0.06, FACILITY_SIZE.depth, -W, 0], [0.06, FACILITY_SIZE.depth, W, 0]] as const) {
    const tape = new THREE.Mesh(geo.plane, hazardMat);
    tape.rotation.x = -Math.PI / 2;
    tape.scale.set(w, d, 1);
    tape.position.set(x, 0.006, z);
    root.add(tape);
  }
  // Open entrance (+Z) with a header sign.
  box(0.08, 2.3, 0.08, -0.7, 1.15, D, steel);
  box(0.08, 2.3, 0.08, 0.7, 1.15, D, steel);
  box(1.48, 0.1, 0.1, 0, 2.3, D, graphite);
  const entry = label(1.2, 0.16, 84);
  entry.mesh.position.set(0, 2.18, D + 0.06);
  entry.mesh.rotation.y = Math.PI;
  root.add(entry.mesh);
  const entryBack = label(1.2, 0.16, 84);
  entryBack.mesh.position.set(0, 2.18, D - 0.06);
  root.add(entryBack.mesh);

  // Emergency beacons on the four top corners, plus one red light that pulses in blackout.
  const beacons = [-W, W].flatMap((x) => [-D, D].map((z) => cyl(0.05, 0.08, x * 0.94, H - 0.1, z * 0.94, emergency)));
  const alarmLight = new THREE.PointLight(0xff3020, 2.2, 6, 1.6);
  alarmLight.position.set(0, H - 0.3, -0.4);
  root.add(alarmLight);
  const workLight = new THREE.PointLight(0xdff4ff, 0, 8, 1.2);
  workLight.position.set(0, H - 0.2, 0.2);
  root.add(workLight);

  /* Power core + breaker (back wall, center): puzzle 1. */
  const core = new THREE.Group();
  core.position.set(0, 0, -D + 0.42);
  root.add(core);
  box(0.9, 0.12, 0.6, 0, 0.06, 0, graphite, core);
  box(0.9, 0.12, 0.6, 0, 1.94, 0, graphite, core);
  const tube = cyl(0.2, 1.7, 0, 1.0, 0, glass, core);
  tube.renderOrder = 2;
  const coreRod = cyl(0.075, 1.6, 0, 1.0, 0, coreGlow, core);
  const rings = [0.45, 1.0, 1.55].map((y) => {
    const ring = new THREE.Mesh(keep(new THREE.TorusGeometry(0.24, 0.022, 8, 32)), steel);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    core.add(ring);
    return ring;
  });
  for (const x of [-0.36, 0.36]) box(0.08, 1.8, 0.08, x, 1.0, 0.2, steel, core);
  shadow(1.3, 0.9, 0, -D + 0.42);
  const coreLabel = label(1.1, 0.18, 80);
  coreLabel.mesh.position.set(0, 2.15, -D + 0.45);
  root.add(coreLabel.mesh);
  // Breaker cabinet with a lever that flips when the server reports breaker: true.
  const breaker = new THREE.Group();
  breaker.position.set(-0.85, 0, -D + 0.18);
  root.add(breaker);
  box(0.5, 0.8, 0.22, 0, 1.15, 0, panel, breaker);
  const breakerLamp = box(0.08, 0.08, 0.02, 0.15, 1.45, 0.12, emergency, breaker);
  const lever = new THREE.Group();
  lever.position.set(-0.05, 1.15, 0.13);
  breaker.add(lever);
  box(0.04, 0.32, 0.04, 0, 0.14, 0, steel, lever);
  box(0.12, 0.05, 0.05, 0, 0.3, 0, rubber, lever);
  shadow(0.7, 0.4, -0.85, -D + 0.2);

  /* Object stations (left side): research BOOK, containment CUP, access KEYBOARD. */
  const stationLamps: Record<string, THREE.Mesh> = {};
  const stationDefs = [
    { id: "book", name: "RESEARCH", z: -0.75 },
    { id: "cup", name: "CONTAINMENT", z: 0.0 },
    { id: "keyboard", name: "ACCESS", z: 0.75 },
  ];
  for (const s of stationDefs) {
    const g = new THREE.Group();
    g.position.set(-W + 0.42, 0, s.z);
    root.add(g);
    box(0.5, 0.05, 0.5, 0, 0.92, 0, steel, g);
    box(0.36, 0.86, 0.36, 0, 0.45, 0, graphite, g);
    const lampMat = keep(new THREE.MeshStandardMaterial({ color: 0x2a1a04, emissive: 0xffa425, emissiveIntensity: 0.9 }));
    const lamp = box(0.5, 0.02, 0.02, 0, 0.955, 0.25, lampMat, g);
    stationLamps[s.id] = lamp;
    const pad = cyl(0.14, 0.015, 0, 0.955, 0, keep(new THREE.MeshStandardMaterial({ color: 0x0b1316, emissive: 0x3fd0ff, emissiveIntensity: 0.15 })), g);
    pad.userData.hotspot = { kind: "station", id: s.id } satisfies Hotspot;
    hotspots.push(pad);
    const name = label(0.6, 0.1, 64);
    name.set(`${s.name} · ${s.id.toUpperCase()}`, "#ffd28a");
    name.mesh.position.set(0.01, 1.12, 0);
    name.mesh.rotation.y = Math.PI / 2;
    g.add(name.mesh);
    shadow(0.7, 0.7, -W + 0.42, s.z);
  }

  /* Server racks (left back corner) with blinking status LEDs. */
  const ledMats: THREE.MeshStandardMaterial[] = [];
  for (const z of [-D + 0.32]) {
    const rack = new THREE.Group();
    rack.position.set(-W + 0.35 + 0.0, 0, z);
    root.add(rack);
    box(0.5, 1.9, 0.5, 0, 0.95, 0, graphite, rack);
    for (let i = 0; i < (quality === "low" ? 4 : 10); i++) {
      const m = keep(new THREE.MeshStandardMaterial({ color: 0x050505, emissive: i % 3 ? 0x45ff8a : 0xffa020, emissiveIntensity: 0.0 }));
      ledMats.push(m);
      box(0.03, 0.03, 0.01, -0.15 + (i % 5) * 0.075, 0.5 + Math.floor(i / 5) * 0.8 + 0.4, 0.26, m, rack);
    }
    for (let i = 0; i < 7; i++) box(0.44, 0.012, 0.01, 0, 0.3 + i * 0.22, 0.255, steel, rack);
  }

  /* Holo-terminal (right wall, facing -X): puzzle 2's shared boot order. */
  const terminal = new THREE.Group();
  terminal.position.set(W - 0.3, 0, -0.1);
  terminal.rotation.y = -Math.PI / 2;
  root.add(terminal);
  box(1.5, 0.08, 0.5, 0, 0.92, 0, steel, terminal);
  box(1.3, 0.86, 0.4, 0, 0.45, 0, graphite, terminal);
  box(1.5, 0.9, 0.05, 0, 1.55, -0.24, panel, terminal);
  const termHeader = label(1.3, 0.13, 70);
  termHeader.mesh.position.set(0, 1.92, -0.2);
  terminal.add(termHeader.mesh);
  const slotLabels = [0, 1, 2, 3].map((i) => {
    const l = label(0.3, 0.1, 56);
    l.mesh.position.set(-0.51 + i * 0.34, 1.74, -0.2);
    terminal.add(l.mesh);
    return l;
  });
  const moduleScreens: { mesh: THREE.Mesh; label: Label; mat: THREE.MeshStandardMaterial; id: string; base: THREE.Color }[] = [];
  for (let i = 0; i < 4; i++) {
    const mat = keep(new THREE.MeshStandardMaterial({ color: 0x050809, emissive: 0x14323d, emissiveIntensity: 0.3, roughness: 0.25 }));
    const screen = box(0.31, 0.32, 0.02, -0.51 + i * 0.34, 1.42, -0.2, mat, terminal);
    const l = label(0.3, 0.1, 56);
    l.mesh.position.set(-0.51 + i * 0.34, 1.42, -0.185);
    terminal.add(l.mesh);
    screen.userData.hotspot = { kind: "module", id: "" } satisfies Hotspot;
    hotspots.push(screen);
    moduleScreens.push({ mesh: screen, label: l, mat, id: "", base: new THREE.Color(0x050a0c) });
  }
  const keyboard = box(0.9, 0.02, 0.25, 0, 0.955, 0.05, screenOff, terminal);
  keyboard.rotation.x = -0.12;
  shadow(1.7, 0.7, W - 0.3, -0.1);

  /* Blast door (right back corner): the final exit. */
  const door = new THREE.Group();
  door.position.set(W - 0.62, 0, -D + 0.06);
  root.add(door);
  box(1.0, 0.12, 0.16, 0, 2.16, 0, graphite, door);
  box(0.1, 2.2, 0.16, -0.5, 1.1, 0, graphite, door);
  box(0.1, 2.2, 0.16, 0.5, 1.1, 0, graphite, door);
  const beyond = box(0.9, 2.1, 0.01, 0, 1.05, -0.06, keep(new THREE.MeshBasicMaterial({ color: 0xfff6dd, toneMapped: false })), door);
  beyond.visible = false;
  const leaves = [-1, 1].map((side) => {
    const leaf = new THREE.Group();
    leaf.position.set(side * 0.225, 0, 0.02);
    door.add(leaf);
    box(0.45, 2.1, 0.06, 0, 1.05, 0, steel, leaf);
    const stripe = new THREE.Mesh(geo.plane, hazardMat);
    stripe.scale.set(0.45, 0.18, 1);
    stripe.position.set(0, 0.85, 0.031);
    leaf.add(stripe);
    return { leaf, side };
  });
  const doorLamp = box(0.12, 0.06, 0.02, 0, 2.26, 0.09, emergency, door);
  door.userData.hotspot = { kind: "door" } satisfies Hotspot;
  const doorLabel = label(1.0, 0.14, 72);
  doorLabel.mesh.position.set(0, 2.36, 0.09);
  door.add(doorLabel.mesh);
  const holdLabel = label(1.0, 0.11, 60);
  holdLabel.mesh.position.set(0, 1.9, 0.1);
  door.add(holdLabel.mesh);
  // Concrete threshold
  box(1.0, 0.03, 0.4, W - 0.62, 0.015, -D + 0.25, concreteMat);

  const hemi = new THREE.HemisphereLight(0x9fb8c8, 0x1a1c1e, 0.35);
  const sun = new THREE.DirectionalLight(0xdfefff, 0.6);
  sun.position.set(2, 5, 3);
  root.add(hemi, sun);

  /* ---------- state ---------- */

  let state: FacilityState | null = null;
  // Animated values (0..1) eased toward targets set by apply(); jumped on the first apply so
  // a reload never replays a one-off transition.
  const anim = { power: 0, comms: 0, door: 0, flashTerminal: 0, flashBreaker: 0 };
  const target = { power: 0, comms: 0, door: 0 };

  function apply(next: FacilityState) {
    const first = state === null;
    state = next;
    target.power = next.breaker ? 1 : 0;
    target.comms = next.terminal ? 1 : 0;
    target.door = next.door ? 1 : 0;
    if (first) Object.assign(anim, target);

    entry.set("ENTER FACILITY 04", "#c8f1ae");
    entryBack.set(next.door ? "EVACUATE" : "LOCKDOWN", next.door ? "#c8f1ae" : "#ff7a6a");
    coreLabel.set(next.breaker ? "CORE ONLINE" : "CORE OFFLINE", next.breaker ? "#a6ffcf" : "#ff7a6a");
    for (const s of stationDefs) {
      const mat = stationLamps[s.id].material as THREE.MeshStandardMaterial;
      mat.emissive.set(next.breaker ? 0x45ff8a : 0xffa425);
    }
    termHeader.set(
      next.terminal ? "COMMS ONLINE" : next.breaker ? "COMMS BOOT ORDER" : "TERMINAL · NO POWER",
      next.terminal ? "#a6ffcf" : next.breaker ? "#9fe6ff" : "#5d6b70",
    );
    const active = next.breaker && !next.terminal && next.phase === "PUZZLE_2";
    next.modules.forEach((m, i) => {
      const screen = moduleScreens[i];
      if (!screen) return;
      screen.id = m.id;
      (screen.mesh.userData.hotspot as ModuleHotspot).id = m.id;
      const pos = next.draft.indexOf(m.id);
      screen.label.set(next.breaker ? m.label : "", pos >= 0 || next.terminal ? "#a6ffcf" : "#9fe6ff");
      screen.base.set(next.terminal ? 0x1d8a4a : pos >= 0 ? 0x1a6e86 : active ? 0x14323d : 0x050a0c);
      screen.mat.emissive.copy(screen.base);
      screen.mat.emissiveIntensity = next.breaker ? 0.9 : 0.15;
    });
    slotLabels.forEach((l, i) => {
      const id = next.draft[i];
      const name = next.modules.find((m) => m.id === id)?.label;
      l.set(next.breaker ? `${i + 1}:${name ?? "--"}` : "", name ? "#a6ffcf" : "#4f6a73");
    });
    doorLabel.set(next.door ? "EXIT OPEN" : "SECURED EXIT", next.door ? "#a6ffcf" : "#ff7a6a");
    holdLabel.set(
      next.phase === "FINAL_SEQUENCE" ? `HANDS ON PANEL ${next.holding}/${next.players}` : "",
      next.holding > 0 ? "#ffd28a" : "#9fe6ff",
    );
  }

  function update(t: number, dt: number) {
    const ease = (from: number, to: number, rate: number) => from + (to - from) * Math.min(1, dt * rate);
    anim.power = ease(anim.power, target.power, 1.4);
    anim.comms = ease(anim.comms, target.comms, 2);
    anim.door = ease(anim.door, target.door, 0.9);
    anim.flashTerminal = Math.max(0, anim.flashTerminal - dt * 1.5);
    anim.flashBreaker = Math.max(0, anim.flashBreaker - dt * 1.5);
    const p = anim.power;
    const blackout = 1 - p;

    // Blackout: slow red alert pulse; restored: steady white work light.
    const pulse = 0.5 + 0.5 * Math.sin(t * 3.2);
    alarmLight.intensity = blackout * (quality === "low" ? 1.6 : 1.0 + 1.6 * pulse);
    workLight.intensity = p * 6;
    emergency.emissiveIntensity = blackout * (0.4 + 1.4 * pulse) + 0.1;
    strip.emissiveIntensity = 0.02 + p * 2.2;
    hemi.intensity = 0.55 + p * 1.6;
    sun.intensity = 0.6 + p * 0.9;
    coreGlow.emissive.setRGB(1 - p * 0.75, 0.23 + p * 0.72, 0.16 + p * 0.65);
    coreGlow.emissiveIntensity = 0.25 + p * (2.2 + 0.4 * Math.sin(t * 6));
    rings.forEach((ring, i) => (ring.rotation.z += dt * p * (1.5 + i * 0.7)));
    coreRod.scale.x = coreRod.scale.z = 0.075 * (1 + 0.06 * p * Math.sin(t * 9));
    lever.rotation.x = -1.1 + 2.2 * p;
    breakerLamp.material = p > 0.5 ? okLamp : emergency;
    ledMats.forEach((m, i) => (m.emissiveIntensity = p * (Math.sin(t * (2 + i * 0.9) + i * 1.7) > 0.2 ? 1.6 : 0.15)));
    beacons.forEach((b, i) => (b.rotation.y = t * 4 + i));

    // Terminal: flash red after a rejected boot order.
    for (const s of moduleScreens) s.mat.emissive.copy(s.base).lerp(RED, anim.flashTerminal * 0.6);
    if (anim.flashBreaker > 0) coreGlow.emissive.lerp(RED, anim.flashBreaker);

    // Blast door slides open.
    const d = anim.door;
    for (const { leaf, side } of leaves) leaf.position.x = side * (0.225 + 0.42 * d);
    beyond.visible = d > 0.02;
    doorLamp.material = d > 0.5 ? okLamp : emergency;
  }

  return {
    root,
    hotspots,
    apply,
    flash(part) {
      if (part === "terminal") anim.flashTerminal = 1;
      else anim.flashBreaker = 1;
    },
    update,
    dispose() {
      root.removeFromParent();
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh && mesh.geometry !== geo.box && mesh.geometry !== geo.cyl && mesh.geometry !== geo.plane) mesh.geometry.dispose();
      });
      for (const l of labels) {
        (l.mesh.material as THREE.MeshBasicMaterial).map?.dispose();
        (l.mesh.material as THREE.Material).dispose();
        l.mesh.geometry.dispose();
      }
      disposables.forEach((x) => x.dispose());
    },
  };
}
