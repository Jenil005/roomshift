import { useGame } from "../game/GameProvider";
import { MAX_PLAYERS, MIN_PLAYERS } from "@shared/constants";
import { Button, ErrorLine, Heading, Label, Screen } from "../ui/kit";

export function Lobby() {
  const { state, selfId, send } = useGame();
  if (!state) return null;
  const me = state.players.find((p) => p.id === selfId);
  const allReady = state.players.length >= MIN_PLAYERS && state.players.every((p) => p.ready);

  return (
    <Screen>
      <div className="flex flex-col">
        <Label>Facility 04, sublevel B</Label>
        <Heading className="text-emergency">Room {state.roomCode}</Heading>
      </div>
      <p className="m-0 bg-panel p-3 bevel-raised">
        Join at this site with code <span className="text-emergency">{state.roomCode}</span>.
      </p>

      <section className="flex flex-col gap-2">
        <h2 className="m-0 font-display text-[20px] font-normal text-label">Operatives {state.players.length} of {MAX_PLAYERS}</h2>
        <ul className="m-0 flex list-none flex-col bg-inset p-0 bevel-sunken">
          {state.players.map((p) => (
            <li key={p.id} className="player-entry flex items-center gap-3 border-b-2 border-rule p-3 last:border-b-0">
              <span className="flex-1">{p.id === selfId ? `${p.name} (you)` : p.name}{p.isHost ? " · host" : ""}</span>
              <span className={p.ready ? "text-phosphor" : "text-emergency"}>{!p.connected ? "Signal lost" : p.ready ? "Ready" : "Standing by"}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex-1" />
      <p className="m-0 text-soft">Roles are assigned when everyone is ready. Each of you will see something the others can’t.</p>
      <ErrorLine message={state.lastError} />
      <Button variant={me?.ready ? "ghost" : "primary"} onClick={() => send({ type: "player:ready", ready: !me?.ready })}>
        {me?.ready ? "Not ready" : "Ready up"}
      </Button>
      {me?.isHost && (
        <Button variant="secondary" disabled={!allReady} onClick={() => send({ type: "game:start" })}>
          Start mission
        </Button>
      )}
    </Screen>
  );
}
