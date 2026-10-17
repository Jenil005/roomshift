import { useEffect, useState } from "react";
import { useGame } from "./game/GameProvider";
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

const showDev = import.meta.env.VITE_GAME_CLIENT !== "deepspace";

/** The server's phase decides the screen. Clients never advance the game themselves. */
function Router() {
  const { state } = useGame();
  if (!state) return <Home />;
  switch (state.phase) {
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
    case "FINAL_OVERRIDE":
      return <FinalOverride />;
    case "COMPLETE":
      return <Complete />;
    case "FAILED":
      return <Failed />;
  }
}

export default function App() {
  return (
    <>
      <PwaStatus />
      <Router />
      <div className="scanlines" aria-hidden />
      {showDev && <DevPanel />}
    </>
  );
}

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function PwaStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const demo = import.meta.env.VITE_GAME_CLIENT !== "deepspace";

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

    setInstalled(window.matchMedia("(display-mode: standalone)").matches);
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

  return (
    <div className="pwa-status" role="status">
      <span className={online ? "pwa-signal" : "pwa-signal pwa-offline"} aria-hidden="true" />
      <span>{demo ? "LOCAL DEMO · BOTS, NOT MULTIPLAYER" : "ROOMSHIFT"}</span>
      <span className="pwa-network">{online ? "NETWORK AVAILABLE" : "OFFLINE · DEMO ONLY"}</span>
      {!online && <button className="pwa-retry" type="button" onClick={() => window.location.reload()}>RETRY</button>}
      {installPrompt && !installed && <button className="pwa-install" type="button" onClick={() => void install()}>INSTALL</button>}
      {installed && <span className="pwa-installed">INSTALLED</span>}
    </div>
  );
}
