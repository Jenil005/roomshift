import { useState } from "react";
import { useGame, useGameContext } from "../game/useGame";

/**
 * LOCAL DEMO ONLY (mock mode). Shows the bot teammates' private clues so one person can
 * play every puzzle against the real engine. Never rendered in live mode.
 */
export function DevPanel() {
  const { demoInfo } = useGameContext();
  const { room } = useGame();
  const [open, setOpen] = useState(false);
  if (!demoInfo || !room) return null;
  const bots = open ? demoInfo().bots : [];

  return (
    <aside className={`fixed bottom-2 left-2 z-[60] max-w-md border-2 border-emergency bg-void/95 p-2 text-[14px] ${open ? "right-2 mx-auto" : ""}`}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full text-left font-display text-emergency">
        {open ? "▼ DEMO: bot teammates’ private clues" : "▶ BOT CLUES"}
      </button>
      {open && (
        <ul className="m-0 mt-1 flex max-h-[30dvh] list-none flex-col gap-1 overflow-y-auto p-0">
          {bots.map((b) => (
            <li key={b.name}>
              <span className="text-label">{b.name}: </span>
              {b.clue.length ? b.clue.join(" ") : <span className="text-bevel">no clue this phase</span>}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
