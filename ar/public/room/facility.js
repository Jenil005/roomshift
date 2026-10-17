import * as THREE from "three";

export const FACILITY_SIZE = Object.freeze({
  width: 3.4,
  depth: 3.4,
  height: 2.5,
});

// Geometry extracted from the existing ar-room.js facility on feature/ar-room.
// Retain its open entrance, consoles, translucent walls, and meter-sized layout.
export function createFacility() {
  const room = new THREE.Group();
  room.name = "roomshift-facility";
  const meter = (color, emissive = 0, strength = 0) =>
    new THREE.MeshStandardMaterial({
      color,
      emissive,
      emissiveIntensity: strength,
      metalness: 0.25,
      roughness: 0.45,
    });
  const shell = meter(0x253844);
  const steel = meter(0x527079);
  const teal = meter(0x19c7c4, 0x09a9a7, 0.8);
  const powerMaterial = meter(0x102a34, 0x88d43d, 0.18);
  const glass = new THREE.MeshStandardMaterial({
    color: 0x49848a,
    transparent: true,
    opacity: 0.14,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const gridMaterial = new THREE.LineBasicMaterial({
    color: 0x55bdca,
    transparent: true,
    opacity: 0.85,
  });

  function block(w, h, d, x, y, z, material, parent = room) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  function textPlane(text, color = "#b5fbef", w = 1.6, h = 0.34) {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 220;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, 1024, 220);
    ctx.fillStyle = color;
    ctx.font = "bold 76px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 512, 113, 985);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  }

  function makeRoom() {
    // Dimensions: 3.4 m wide, 3.4 m deep, 2.5 m high.
    // Semi-transparent/open walls preserve camera awareness of the real room.
    const halfW = 1.7,
      halfD = 1.7,
      height = 2.5;
    // Deliberately no opaque floor: real floor remains visible to the player.
    const outlinePts = [
      new THREE.Vector3(-halfW, 0.022, -halfD),
      new THREE.Vector3(halfW, 0.022, -halfD),
      new THREE.Vector3(halfW, 0.022, halfD),
      new THREE.Vector3(-halfW, 0.022, halfD),
      new THREE.Vector3(-halfW, 0.022, -halfD),
    ];
    room.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(outlinePts),
        gridMaterial,
      ),
    );
    for (const x of [-halfW, halfW]) {
      for (const z of [-halfD, halfD]) {
        block(0.07, height, 0.07, x, height / 2, z, steel);
        block(0.16, 0.06, 0.16, x, 0.025, z, teal);
      }
    }
    for (const y of [0.22, 1.3, height]) {
      block(3.4, 0.035, 0.035, 0, y, -halfD, y === 1.3 ? teal : steel);
      block(0.035, 0.035, 3.4, -halfW, y, 0, steel);
      block(0.035, 0.035, 3.4, halfW, y, 0, steel);
    }
    // Translucent back and side wall panels for lab-room effect.
    block(3.3, 1.75, 0.014, 0, 1.32, -halfD + 0.025, glass);
    block(0.014, 1.75, 3.2, -halfW + 0.023, 1.32, 0, glass);
    block(0.014, 1.75, 3.2, halfW - 0.023, 1.32, 0, glass);

    // Back wall: facility core. Its height makes this unmistakably life-sized.
    block(1.6, 1.3, 0.12, 0, 1.37, -1.61, shell);
    block(1.37, 0.88, 0.035, 0, 1.47, -1.53, powerMaterial);
    const title = textPlane("BLACKOUT PROTOCOL", "#b2ffee", 1.2, 0.28);
    title.position.set(0, 1.72, -1.5);
    room.add(title);
    room.userData.title = title;
    const coreLabel = textPlane("CORE OFFLINE", "#ff907a", 1.05, 0.25);
    coreLabel.position.set(0, 1.38, -1.5);
    room.add(coreLabel);
    room.userData.coreLabel = coreLabel;

    // Consoles: spaced to leave a usable walking area.
    const stations = [
      { name: "BOOK", x: -1.02, z: -0.35, color: 0x3abfc0 },
      { name: "CUP", x: 0, z: -0.35, color: 0x84d495 },
      { name: "KEYS", x: 1.02, z: -0.35, color: 0xe9c58a },
    ];
    for (const station of stations) {
      block(0.67, 0.09, 0.65, station.x, 0.87, station.z, steel);
      block(0.12, 0.78, 0.12, station.x, 0.42, station.z, shell);
      const screen = block(
        0.51,
        0.3,
        0.035,
        station.x,
        1.1,
        station.z - 0.22,
        meter(station.color, station.color, 0.35),
      );
      screen.rotation.x = -0.18;
      const label = textPlane(station.name, "#e9fff1", 0.56, 0.18);
      label.position.set(station.x, 1.28, station.z - 0.2);
      room.add(label);
    }

    // Entrance is intentionally open: users can physically walk into the volume.
    const entryLabel = textPlane("ENTER FACILITY", "#c8f1ae", 1.15, 0.2);
    entryLabel.position.set(0, 2.14, halfD);
    // The entrance is on local +Z; keep its text readable from outside.
    entryLabel.rotation.y = 0;
    room.add(entryLabel);
    block(1.3, 0.07, 0.06, 0, 2.41, halfD, teal);
    block(0.06, 2.35, 0.06, -0.68, 1.175, halfD, steel);
    block(0.06, 2.35, 0.06, 0.68, 1.175, halfD, steel);

    room.userData.powerMaterial = powerMaterial;
    room.visible = false;
  }
  makeRoom();

  function setPower(isOn) {
    powerMaterial.emissiveIntensity = isOn ? 1.5 : 0.18;
    room.userData.title.material.color.set(isOn ? 0x16301d : 0xffffff);
    const old = room.userData.coreLabel;
    if (old) {
      room.remove(old);
      old.geometry.dispose();
      old.material.map.dispose();
      old.material.dispose();
    }
    const next = textPlane(
      isOn ? "CORE RESTORED" : "CORE OFFLINE",
      isOn ? "#0a2313" : "#ff907a",
      1.05,
      0.25,
    );
    next.position.set(0, 1.38, -1.5);
    room.add(next);
    room.userData.coreLabel = next;
  }

  return { room, setPower };
}
