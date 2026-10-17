import { initialRoomState, type PeerPresence, type RoomState, type SystemId } from "../types";
import type { RoomSync } from "./RoomSync";
import { tryRestore } from "./rules";

// Same-browser sync using BroadcastChannel: open the host in one tab and the guest in another
// to test "device A hosts, device B joins" before the DeepSpace adapter exists.
// It does NOT work across real phones: that is what the DeepSpace adapter is for.
type Msg =
  | { t: "hello"; from: string }
  | { t: "state"; state: RoomState }
  | { t: "action"; id: SystemId; from: string }
  | { t: "notice"; to: string; msg: string }
  | { t: "presence"; p: PeerPresence };

export class LocalSync implements RoomSync {
  private ch!: BroadcastChannel;
  private state: RoomState = initialRoomState();
  private peers = new Map<string, PeerPresence>();
  private stateCbs: ((s: RoomState) => void)[] = [];
  private peerCbs: ((p: PeerPresence[]) => void)[] = [];
  private noticeCbs: ((m: string) => void)[] = [];
  private timer = 0;

  readonly roomCode: string;
  readonly isHost: boolean;
  readonly playerId: string;
  private name: string;

  constructor(roomCode: string, isHost: boolean, playerId: string, name: string) {
    this.roomCode = roomCode;
    this.isHost = isHost;
    this.playerId = playerId;
    this.name = name;
  }

  start() {
    this.ch = new BroadcastChannel(`roomshift-ar-${this.roomCode}`);
    this.ch.onmessage = (e: MessageEvent<Msg>) => this.handle(e.data);
    if (this.isHost) this.pushState();
    else this.ch.postMessage({ t: "hello", from: this.playerId } satisfies Msg);
    document.addEventListener("visibilitychange", this.onVisible);
    this.timer = window.setInterval(() => {
      const now = Date.now();
      let changed = false;
      for (const [id, p] of this.peers) if (now - p.updatedAt > 3000) { this.peers.delete(id); changed = true; }
      if (changed) this.emitPeers();
    }, 1000);
  }

  stop() {
    window.clearInterval(this.timer);
    document.removeEventListener("visibilitychange", this.onVisible);
    this.ch?.close();
  }

  // A tab that was hidden may have missed updates: the host re-sends state, a guest asks for it.
  private onVisible = () => {
    if (document.hidden) return;
    if (this.isHost) this.pushState();
    else this.ch.postMessage({ t: "hello", from: this.playerId } satisfies Msg);
  };

  onState(cb: (s: RoomState) => void) { this.stateCbs.push(cb); }
  onPeers(cb: (p: PeerPresence[]) => void) { this.peerCbs.push(cb); }
  onNotice(cb: (m: string) => void) { this.noticeCbs.push(cb); }

  interact(id: SystemId) {
    if (this.isHost) this.applyAction(id, this.playerId);
    else this.ch.postMessage({ t: "action", id, from: this.playerId } satisfies Msg);
  }

  sendPresence(yaw: number, pitch: number) {
    this.ch.postMessage({ t: "presence", p: { id: this.playerId, name: this.name, yaw, pitch, updatedAt: Date.now() } } satisfies Msg);
  }

  reset() {
    if (!this.isHost) return;
    this.state = { ...initialRoomState(), version: this.state.version + 1 };
    this.pushState();
  }

  private handle(m: Msg) {
    switch (m.t) {
      case "hello": if (this.isHost) this.pushState(); break;
      case "state":
        if (!this.isHost && m.state.version >= this.state.version) { this.state = m.state; this.stateCbs.forEach((cb) => cb(m.state)); }
        break;
      case "action": if (this.isHost) this.applyAction(m.id, m.from); break;
      case "notice": if (m.to === this.playerId) this.noticeCbs.forEach((cb) => cb(m.msg)); break;
      case "presence":
        this.peers.set(m.p.id, { ...m.p, updatedAt: Date.now() });
        this.emitPeers();
        break;
    }
  }

  private applyAction(id: SystemId, from: string) {
    const result = tryRestore(this.state, id);
    if (result.ok) { this.state = result.state; this.pushState(); return; }
    if (from === this.playerId) this.noticeCbs.forEach((cb) => cb(result.reason));
    else this.ch.postMessage({ t: "notice", to: from, msg: result.reason } satisfies Msg);
  }

  private pushState() {
    this.stateCbs.forEach((cb) => cb(this.state));
    this.ch.postMessage({ t: "state", state: this.state } satisfies Msg);
  }

  private emitPeers() { this.peerCbs.forEach((cb) => cb([...this.peers.values()])); }
}
