import { RoomScene } from "../room/RoomScene";
import { blackoutProtocol } from "../templates/blackoutProtocol";
import { LocalSync } from "../sync/LocalSync";
import type { RoomSync } from "../sync/RoomSync";

// Standalone demo. In the real app, build `sync` from DeepSpace instead of LocalSync;
// everything else stays the same.
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const randomCode = () => Array.from({ length: 4 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ"[Math.floor(Math.random() * 24)]).join("");
const playerId = crypto.randomUUID();

let toastTimer = 0;
function toast(msg: string) {
  const el = $("toast");
  el.textContent = msg;
  el.style.opacity = "1";
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.style.opacity = "0"), 2200);
}

function enter(code: string, isHost: boolean) {
  $("landing").style.display = "none";
  $("hud").style.display = "flex";
  $("roomPill").textContent = `Room ${code}${isHost ? " (host)" : ""}`;
  if (isHost) $("resetBtn").style.display = "inline-block";

  const scene = new RoomScene($("view") as HTMLCanvasElement, blackoutProtocol);
  const sync: RoomSync = new LocalSync(code, isHost, playerId, isHost ? "Host" : "Guest");

  let wasDone = false;
  sync.onState((s) => {
    scene.applyState(s);
    const done = s.systems.door;
    if (done && !wasDone) toast("All systems restored. Mission complete.");
    wasDone = done;
  });
  sync.onPeers((p) => {
    scene.setPeers(p);
    $("peerPill").textContent = `${p.length + 1} players`;
  });
  sync.onNotice(toast);
  scene.onInteract((id) => sync.interact(id));

  sync.start();
  scene.start();
  window.setInterval(() => {
    const v = scene.getView();
    sync.sendPresence(v.yaw, v.pitch);
  }, 100);

  $("motionBtn").onclick = async () => toast((await scene.controls.enableGyro()) ? "Motion on: move your phone" : "Motion unavailable. Drag to look.");
  $("recenterBtn").onclick = () => scene.controls.recenter();
  $("resetBtn").onclick = () => sync.reset?.();
}

$("hostBtn").onclick = () => {
  const code = randomCode();
  history.replaceState(null, "", `?room=${code}&host=1`);
  enter(code, true);
  const guestUrl = `${location.origin}${location.pathname}?room=${code}`;
  toast("Open a second tab to join: " + guestUrl);
  console.info("Guest tab:", guestUrl);
};
$("joinBtn").onclick = () => {
  const code = ($("codeInput") as HTMLInputElement).value.trim().toUpperCase();
  if (code.length === 4) enter(code, false);
};

const q = new URLSearchParams(location.search);
const room = q.get("room");
if (room) enter(room.toUpperCase(), q.get("host") === "1");
