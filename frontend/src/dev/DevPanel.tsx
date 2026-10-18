import { useState } from "react";
import { useGame, useGameContext } from "../game/useGame";
import type { DevScreen } from "./DevScreenPreview";

/** Development-only screen previews and local-demo bot clues. */
export function DevPanel({ onPreview }: { onPreview: (screen: DevScreen | null) => void }) {
  const { demoInfo } = useGameContext();
  const { room } = useGame();
  const [open, setOpen] = useState(true);
  if (!import.meta.env.DEV) return null;
  const bots = demoInfo && room ? demoInfo().bots : [];

  return (
    <aside className={`fixed bottom-2 left-2 z-[60] max-w-md border-2 border-emergency bg-void/95 p-2 text-[14px] ${open ? "right-2 mx-auto" : ""}`}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full text-left font-display text-emergency">
        {open ? "DEV SCREENS ▾" : "DEV SCREENS ▸"}
      </button>
      {open && (
        <>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => onPreview("lobby")} className="border border-panel px-2 py-1 text-label">LOBBY</button>
            <button type="button" onClick={() => onPreview("puzzle1")} className="border border-panel px-2 py-1 text-label">PUZZLE 1</button>
            <button type="button" onClick={() => onPreview("gameover")} className="border border-panel px-2 py-1 text-label">GAME OVER</button>
            <button type="button" onClick={() => onPreview(null)} className="border border-emergency px-2 py-1 text-emergency">RETURN TO GAME</button>
          </div>
          {bots.length > 0 && (
            <ul className="m-0 mt-2 flex max-h-[20dvh] list-none flex-col gap-1 overflow-hidden border-t border-panel p-1 pt-2">
              {bots.map((b) => <li key={b.name}><span className="text-label">{b.name}: </span>{b.clue.length ? b.clue.join(" ") : <span className="text-bevel">no clue this phase</span>}</li>)}
            </ul>
          )}
        </>
      )}
    </aside>
  );
}
