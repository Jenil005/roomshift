import * as THREE from "three";
import { SYSTEM_ORDER, type PeerPresence, type RoomState, type SystemId } from "../types";
import type { RoomTemplate } from "../templates/blackoutProtocol";
import { LookControls } from "./LookControls";

// Tune these on a real phone: lighting is the first thing to adjust.
const TUNING = { ceilingOn: 3.2, ambientOn: 0.8, ambientOff: 0.12, emergency: 2.2, doorSlide: 2.3 };

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d")!;
  draw(g);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { tex, redraw: (fn: (g: CanvasRenderingContext2D) => void) => { fn(g); tex.needsUpdate = true; } };
}

function gridTexture(base: string, line: string, repX: number, repY: number) {
  const { tex } = canvasTexture(512, 512, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 512, 512);
    g.strokeStyle = line;
    g.lineWidth = 4;
    for (let i = 0; i <= 512; i += 128) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(512, i); g.stroke();
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repX, repY);
  return tex;
}

function drawText(g: CanvasRenderingContext2D, lines: string[], color: string, bg: string, size: number) {
  const { width: w, height: h } = g.canvas;
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = color;
  g.font = `bold ${size}px monospace`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  lines.forEach((t, i) => g.fillText(t, w / 2, h / 2 + (i - (lines.length - 1) / 2) * size * 1.3));
}

const hex = (n: number) => "#" + n.toString(16).padStart(6, "0");

export class RoomScene {
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: LookControls;

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private ambient = new THREE.AmbientLight(0x6688aa, TUNING.ambientOff);
  private ceilingLights: THREE.PointLight[] = [];
  private beacon = new THREE.PointLight(0xff2a2a, TUNING.emergency, 10, 1.2);
  private fixtureMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0x330000, emissiveIntensity: 0.6 });
  private levers: THREE.Mesh[] = [];
  private indicator: Record<SystemId, THREE.MeshStandardMaterial>;
  private monitor!: ReturnType<typeof canvasTexture>;
  private doorLabel!: ReturnType<typeof canvasTexture>;
  private door = new THREE.Mesh();
  private doorTargetY = 0;
  private hotspots: THREE.Object3D[] = [];
  private hints = {} as Record<SystemId, THREE.Mesh>;
  private peers = new Map<string, { mesh: THREE.Mesh; target: THREE.Vector3 }>();
  private interactCb: (id: SystemId) => void = () => {};
  private state: RoomState = { version: 0, systems: { breaker: false, terminal: false, door: false } };
  private raycaster = new THREE.Raycaster();
  private down: { x: number; y: number } | null = null;

  constructor(private canvas: HTMLCanvasElement, private t: RoomTemplate) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene.background = new THREE.Color(0x05070a);
    this.scene.fog = new THREE.FogExp2(0x05070a, 0.045);

    this.camera = new THREE.PerspectiveCamera(75, 1, 0.05, 50);
    this.camera.position.set(0, t.eyeHeight, 0);
    this.controls = new LookControls(this.camera, canvas);

    const mk = () => new THREE.MeshStandardMaterial({ color: 0x888888, emissive: 0x000000 });
    this.indicator = { breaker: mk(), terminal: mk(), door: mk() };

    this.buildShell();
    this.buildLights();
    this.buildBreaker();
    this.buildTerminal();
    this.buildDoor();
    this.buildHints();
    this.buildProps();
    this.scene.add(this.ambient);

    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("webglcontextrestored", this.onContextRestored);
    this.resizeObserver.observe(canvas);
    this.resize();
    this.applyState(this.state);
  }

  private resizeObserver = new ResizeObserver(() => this.resize());

  private onPointerDown = (e: PointerEvent) => {
    this.down = { x: e.clientX, y: e.clientY };
  };

  private onPointerUp = (e: PointerEvent) => {
    if (!this.down) return;
    const moved = Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y);
    this.down = null;
    if (moved <= 8) this.pick(e);
  };

  onInteract(cb: (id: SystemId) => void) { this.interactCb = cb; }

  getView() { return { yaw: this.controls.yaw, pitch: this.controls.pitch }; }

  // The render loop runs only while started and the page is visible (saves battery and heat).
  start() {
    this.running = true;
    document.addEventListener("visibilitychange", this.syncLoop);
    this.syncLoop();
  }

  private running = false;

  private syncLoop = () => {
    const on = this.running && !document.hidden;
    this.renderer.setAnimationLoop(on ? (time) => this.frame(time) : null);
  };

  // Phones may drop the WebGL context while locked. three.js rebuilds GPU state on restore;
  // re-upload the canvas textures and redraw the current state.
  private onContextRestored = () => {
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      mats.forEach((m) => {
        const map = (m as THREE.MeshStandardMaterial).map;
        if (map) map.needsUpdate = true;
      });
    });
    this.applyState(this.state);
  };

  // Release everything this scene holds so a single-page app can unmount and remount it.
  // Phones allow only a few live WebGL contexts, so the context is released explicitly.
  dispose() {
    this.running = false;
    this.renderer.setAnimationLoop(null);
    document.removeEventListener("visibilitychange", this.syncLoop);
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("webglcontextrestored", this.onContextRestored);
    this.controls.dispose();
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      mesh.geometry?.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      mats.forEach((m) => {
        (m as THREE.MeshStandardMaterial).map?.dispose();
        m.dispose();
      });
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  applyState(state: RoomState) {
    this.state = state;
    const s = state.systems;
    const p = this.t.palette;
    const power = s.breaker;

    this.ceilingLights.forEach((l) => (l.intensity = power ? TUNING.ceilingOn : 0));
    this.ambient.intensity = power ? TUNING.ambientOn : TUNING.ambientOff;
    this.beacon.visible = !s.door;
    this.fixtureMat.emissive.setHex(power ? p.online : 0x330000);
    this.fixtureMat.emissiveIntensity = power ? 1.6 : 0.5;
    this.levers.forEach((l) => (l.rotation.z = power ? -0.55 : 0.55));

    (Object.keys(this.indicator) as SystemId[]).forEach((id) => {
      const c = s[id] ? p.ok : p.emergency;
      this.indicator[id].color.setHex(c);
      this.indicator[id].emissive.setHex(c);
      this.indicator[id].emissiveIntensity = 1.4;
    });

    this.monitor.redraw((g) => {
      if (!power) drawText(g, [""], "#000", "#020304", 40);
      else if (!s.terminal) drawText(g, ["SYSTEM LOCKED", "TAP TO RESTORE COMMS"], hex(p.accent), "#0b0f14", 34);
      else drawText(g, ["COMMS ONLINE", "LOCKDOWN OVERRIDE READY"], hex(p.ok), "#06140d", 34);
    });
    this.doorLabel.redraw((g) =>
      s.door ? drawText(g, ["UNLOCKED"], hex(p.ok), "#06140d", 64) : drawText(g, ["LOCKDOWN"], hex(p.emergency), "#1a0707", 64)
    );
    this.doorTargetY = s.door ? 1.2 + TUNING.doorSlide : 1.2;

    const next = SYSTEM_ORDER.find((id) => !s[id]);
    SYSTEM_ORDER.forEach((id) => (this.hints[id].visible = id === next));
  }

  setPeers(list: PeerPresence[]) {
    const seen = new Set<string>();
    list.forEach((p, i) => {
      seen.add(p.id);
      let entry = this.peers.get(p.id);
      if (!entry) {
        const color = [0xffb020, 0xb36bff, 0x39ff88, 0xff6bd6][i % 4];
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 16), new THREE.MeshBasicMaterial({ color }));
        this.scene.add(mesh);
        entry = { mesh, target: new THREE.Vector3() };
        this.peers.set(p.id, entry);
      }
      const cp = Math.cos(p.pitch);
      entry.target.set(
        -Math.sin(p.yaw) * cp * 2.8,
        this.t.eyeHeight + Math.sin(p.pitch) * 2.8,
        -Math.cos(p.yaw) * cp * 2.8
      );
    });
    for (const [id, entry] of this.peers) {
      if (!seen.has(id)) { this.scene.remove(entry.mesh); this.peers.delete(id); }
    }
  }

  // ----- scene construction -----

  private buildShell() {
    const { w, h, d } = this.t.size;
    const p = this.t.palette;
    const mat = (base: string, rx: number, ry: number) =>
      new THREE.MeshStandardMaterial({ map: gridTexture(base, p.line, rx, ry), side: THREE.BackSide, roughness: 0.9 });
    // BoxGeometry face order: +x, -x, +y, -y, +z, -z
    const mats = [
      mat(p.wall, d / 2, h / 2), mat(p.wall, d / 2, h / 2),
      mat(p.ceiling, w / 2, d / 2), mat(p.floor, w / 2, d / 2),
      mat(p.wall, w / 2, h / 2), mat(p.wall, w / 2, h / 2),
    ];
    const shell = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
    shell.position.y = h / 2;
    this.scene.add(shell);
  }

  private buildLights() {
    const { h } = this.t.size;
    for (const [x, z] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) {
      const l = new THREE.PointLight(0xcfeeff, 0, 9, 1);
      l.position.set(x, h - 0.3, z);
      this.scene.add(l);
      this.ceilingLights.push(l);
      const fixture = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.35), this.fixtureMat);
      fixture.position.set(x, h - 0.03, z);
      this.scene.add(fixture);
    }
    this.beacon.position.set(0, h - 0.4, 0);
    this.scene.add(this.beacon);
  }

  private tag(mesh: THREE.Object3D, id: SystemId) {
    mesh.userData.systemId = id;
    this.hotspots.push(mesh);
  }

  private buildBreaker() {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.3, 0.2), new THREE.MeshStandardMaterial({ color: 0x2a3441, metalness: 0.6, roughness: 0.5 }));
    panel.position.set(0, 1.5, -3.9);
    this.scene.add(panel);
    this.tag(panel, "breaker");

    const label = canvasTexture(512, 128, (g) => drawText(g, ["MAIN BREAKER"], "#ffb020", "#10151c", 56));
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.36), new THREE.MeshBasicMaterial({ map: label.tex }));
    plate.position.set(0, 1.95, -3.79);
    this.scene.add(plate);

    for (const x of [-0.5, 0, 0.5]) {
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.04), new THREE.MeshStandardMaterial({ color: 0x0a0d12 }));
      slot.position.set(x, 1.45, -3.78);
      this.scene.add(slot);
      const lever = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.34, 10), new THREE.MeshStandardMaterial({ color: 0xd8dde3, metalness: 0.8, roughness: 0.3 }));
      lever.position.set(x, 1.45, -3.74);
      this.scene.add(lever);
      this.levers.push(lever);
    }
    const light = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.07, 0.04), this.indicator.breaker);
    light.position.set(0, 1.0, -3.78);
    this.scene.add(light);
  }

  private buildTerminal() {
    const desk = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.85, 2.2), new THREE.MeshStandardMaterial({ color: 0x232c38, metalness: 0.4, roughness: 0.6 }));
    desk.position.set(3.5, 0.425, 0);
    this.scene.add(desk);
    this.tag(desk, "terminal");

    this.monitor = canvasTexture(512, 288, (g) => drawText(g, [""], "#000", "#020304", 40));
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.8), new THREE.MeshBasicMaterial({ map: this.monitor.tex }));
    screen.position.set(3.82, 1.35, 0);
    screen.rotation.y = -Math.PI / 2; // face the room center
    this.scene.add(screen);
    this.tag(screen, "terminal");

    const light = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.07, 1.2), this.indicator.terminal);
    light.position.set(3.04, 0.7, 0);
    this.scene.add(light);
  }

  private buildDoor() {
    this.door = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.4, 0.15), new THREE.MeshStandardMaterial({ color: 0x39434f, metalness: 0.7, roughness: 0.45 }));
    this.door.position.set(0, 1.2, 3.85);
    this.scene.add(this.door);
    this.tag(this.door, "door");

    this.doorLabel = canvasTexture(512, 128, (g) => drawText(g, ["LOCKDOWN"], "#ff2a2a", "#1a0707", 64));
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshBasicMaterial({ map: this.doorLabel.tex }));
    plate.position.set(0, 0.5, -0.09);
    plate.rotation.y = Math.PI; // face the room center
    this.door.add(plate);

    const light = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 0.06), this.indicator.door);
    light.position.set(0, 2.55, 3.8);
    this.scene.add(light);
  }

  private buildHints() {
    for (const id of SYSTEM_ORDER) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.13), new THREE.MeshBasicMaterial({ color: this.t.palette.accent, wireframe: true }));
      m.position.set(...this.t.hints[id]);
      m.userData.baseY = m.position.y;
      this.scene.add(m);
      this.tag(m, id);
      this.hints[id] = m;
    }
  }

  private buildProps() {
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x2d3a2f, roughness: 0.8 });
    [[-3, 0.35, -2.6, 0.7], [-3.1, 0.25, -1.8, 0.5], [-2.4, 0.3, 3, 0.6]].forEach(([x, y, z, s]) => {
      const c = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), crateMat);
      c.position.set(x, y, z);
      c.rotation.y = x * 0.7;
      this.scene.add(c);
    });
    const pipeMat = new THREE.MeshStandardMaterial({ color: 0x3a4654, metalness: 0.7, roughness: 0.4 });
    for (const z of [-1.5, 1.5]) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, this.t.size.w, 10), pipeMat);
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set(0, this.t.size.h - 0.25, z);
      this.scene.add(pipe);
    }
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.3), new THREE.MeshBasicMaterial({ color: 0x5a4a10 }));
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(0, 0.01, 3.1);
    this.scene.add(stripe);
  }

  // ----- runtime -----

  private pick(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.hotspots, false)[0];
    const id = hit?.object.userData.systemId as SystemId | undefined;
    if (id) this.interactCb(id);
  }

  private resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private frame(time: number) {
    const t = time / 1000;
    this.controls.update();
    if (this.beacon.visible) this.beacon.intensity = (this.state.systems.breaker ? 0.6 : TUNING.emergency) * (0.55 + 0.45 * Math.sin(t * 4));
    for (const id of SYSTEM_ORDER) {
      const m = this.hints[id];
      if (!m.visible) continue;
      m.position.y = m.userData.baseY + Math.sin(t * 2.5) * 0.06;
      m.rotation.y = t * 1.5;
    }
    this.door.position.y += (this.doorTargetY - this.door.position.y) * 0.06;
    for (const { mesh, target } of this.peers.values()) mesh.position.lerp(target, 0.2);
    this.renderer.render(this.scene, this.camera);
  }
}
