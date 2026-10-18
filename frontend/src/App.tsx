import { lazy, Suspense, useEffect, useState } from "react";
import { useGame } from "./game/useGame";
import { Home } from "./screens/Home";
import { Lobby } from "./screens/Lobby";
import { RoleReveal } from "./screens/RoleReveal";
import { Puzzle1 } from "./screens/Puzzle1";
import { Transition } from "./screens/Transition";
import { Puzzle2 } from "./screens/Puzzle2";
import { FinalOverride } from "./screens/FinalOverride";
import { Complete } from "./screens/Complete";
import { Failed } from "./screens/Failed";
import { DevPanel } from "./dev/DevPanel";
import { DebugOverlay } from "./dev/DebugOverlay";
import { FacilityLauncher } from "./facility/launcher";
import { DevScreenPreview, type DevScreen } from "./dev/DevScreenPreview";
import type { ConnectionStatus } from "./game/GameClient";

// Three.js and the facility load only when a player opens it.
const FacilityView = lazy(() => import("./facility/FacilityView"));

/** The server's phase decides the screen. Clients never advance the game themselves. */
function Router() {
  const { room, lastError } = useGame();
  if (!room) return lastError?.code === "room_not_found" || lastError?.code === "not_in_room" ? <Failed /> : <Home />;
  switch (room.phase) {
    case "LOBBY":
    case "READY":
      return <Lobby />;
    case "INTRO":
      return <RoleReveal />;
    case "PUZZLE_1":
      return <Puzzle1 />;
    case "PUZZLE_1_COMPLETE":
      return <Transition which={1} />;
    case "PUZZLE_2":
      return <Puzzle2 />;
    case "PUZZLE_2_COMPLETE":
      return <Transition which={2} />;
    case "FINAL_SEQUENCE":
      return <FinalOverride />;
    case "COMPLETE":
      return <Complete />;
  }
}

export default function App() {
  const { room } = useGame();
  const [facilityOpen, setFacilityOpen] = useState(false);
  const [devScreen, setDevScreen] = useState<DevScreen | null>(null);
  const [landscape, setLandscape] = useState(() => window.matchMedia("(orientation: landscape)").matches);
  const inMission = !!room && room.phase !== "LOBBY" && room.phase !== "READY";
  const showFacility = facilityOpen && inMission;

  useEffect(() => {
    const query = window.matchMedia("(orientation: landscape)");
    const update = () => setLandscape(query.matches);
    const requestPortrait = () => {
      if (window.matchMedia("(min-width: 700px) and (pointer: fine)").matches) return;
      try {
        const orientation = window.screen.orientation;
        if (orientation?.lock) void orientation.lock("portrait-primary").catch(() => {});
      } catch {
        // Some browsers expose the API but reject orientation locking outside fullscreen.
      }
    };
    update();
    requestPortrait();
    query.addEventListener("change", update);
    document.addEventListener("pointerup", requestPortrait);
    document.addEventListener("keydown", requestPortrait);
    return () => {
      query.removeEventListener("change", update);
      document.removeEventListener("pointerup", requestPortrait);
      document.removeEventListener("keydown", requestPortrait);
    };
  }, []);

  // Each phase is a new screen: start it at the top, not at the previous screen's scroll.
  const screenKey = `${room?.phase ?? "home"}:${showFacility}`;
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screenKey]);

  const openFacility = inMission ? () => setFacilityOpen(true) : null;

  return (
    <div className={landscape ? "app-portrait-fallback" : "app-portrait-normal"}>
    <FacilityLauncher.Provider value={openFacility}>
      <PwaStatus />
      {/* The facility and the mission screens never mount together: one camera owner at a time. */}
      {devScreen ? (
        <DevScreenPreview screen={devScreen} />
      ) : showFacility ? (
        <Suspense fallback={<p className="facility-loading" role="status">Loading the facility…</p>}>
          <FacilityView onClose={() => setFacilityOpen(false)} onScan={() => setFacilityOpen(false)} />
        </Suspense>
      ) : (
        <Router />
      )}
      <div className="scanlines" aria-hidden />
      <DevPanel onPreview={setDevScreen} />
      <DebugOverlay />
    </FacilityLauncher.Provider>
    </div>
  );
}

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const CONNECTION_LABEL: Record<ConnectionStatus, string> = {
  idle: "READY",
  connecting: "CONNECTING",
  live: "LIVE",
  reconnecting: "RECONNECTING…",
  offline: "OFFLINE",
};

function PwaStatus() {
  const { mode, connection } = useGame();
  const [online, setOnline] = useState(navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() => window.matchMedia("(display-mode: standalone)").matches);
  const demo = mode === "mock";

  useEffect(() => {
    const setConnection = () => setOnline(navigator.onLine);
    const captureInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const markInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };

    window.addEventListener("online", setConnection);
    window.addEventListener("offline", setConnection);
    window.addEventListener("beforeinstallprompt", captureInstallPrompt);
    window.addEventListener("appinstalled", markInstalled);
    return () => {
      window.removeEventListener("online", setConnection);
      window.removeEventListener("offline", setConnection);
      window.removeEventListener("beforeinstallprompt", captureInstallPrompt);
      window.removeEventListener("appinstalled", markInstalled);
    };
  }, []);

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === "accepted") setInstalled(true);
    setInstallPrompt(null);
  };
  const healthy = online && (connection === "live" || connection === "idle");

  return (
    <div className="pwa-status" role="status">
      <span className={healthy ? "pwa-signal" : "pwa-signal pwa-offline"} aria-hidden="true" />
      <span>{demo ? "LOCAL DEMO · BOTS, NOT MULTIPLAYER" : "ROOMSHIFT · MULTIPLAYER"}</span>
      <span className="pwa-network">{!online ? "NO NETWORK" : demo ? "THIS TAB ONLY" : CONNECTION_LABEL[connection]}</span>
      {(!online || connection === "offline") && <button className="pwa-retry" type="button" onClick={() => window.location.reload()}>RETRY</button>}
      {installPrompt && !installed && <button className="pwa-install" type="button" onClick={() => void install()}>INSTALL</button>}
      {installed && <span className="pwa-installed">INSTALLED</span>}
    </div>
  );
}
