import { MAX_PLAYERS, MIN_PLAYERS } from "@shared/constants";
import { useGame, useMe } from "../game/useGame";
import { Button, Heading, Label, Screen } from "../ui/kit";
import { ServerError } from "../ui/ServerError";

export function Lobby() {
  const { room, selfId, send, pending } = useGame();
  const me = useMe();
  if (!room) return null;
  const connected = room.players.filter((p) => p.connected).length;
  const ready = room.phase === "READY"; // the server decides: enough connected players, all ready
  const joinUrl = `${location.origin}${location.pathname}?room=${room.code}`;

  return (
    <Screen>
      <div className="flex flex-col">
        <Label>Facility 04, sublevel B</Label>
        <Heading className="text-emergency">Room {room.code}</Heading>
      </div>
      <p className="m-0 bg-panel p-3 bevel-raised">
        Teammates open <span className="break-all text-emergency">{joinUrl}</span> or enter code <span className="text-emergency">{room.code}</span>.
      </p>

      <section className="flex flex-col gap-2">
        <h2 className="m-0 font-display text-[20px] font-normal text-label">Operatives {room.players.length} of {MAX_PLAYERS}</h2>
        <ul className="m-0 flex list-none flex-col bg-inset p-0 bevel-sunken">
          {room.players.map((p) => (
            <li key={p.id} className="player-entry flex items-center gap-3 border-b-2 border-rule p-3 last:border-b-0">
              <span className={`flex-1 ${p.connected ? "" : "text-bevel"}`}>
                {p.id === selfId ? `${p.name} (you)` : p.name}{p.isHost ? " · host" : ""}{p.connected ? "" : " · signal lost"}
              </span>
              <span className={p.isReady ? "text-phosphor" : "text-emergency"}>{p.isReady ? "Ready" : "Standing by"}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex-1" />
      <p className="m-0 text-soft">
        {connected < MIN_PLAYERS
          ? `Waiting for at least ${MIN_PLAYERS} operatives.`
          : ready
            ? "Everyone is ready. The host can start the mission."
            : "Roles are assigned when everyone is ready. Each of you will see something the others can’t."}
      </p>
      <ServerError actions={["room:ready", "game:start", "room:leave"]} />
      <Button variant={me?.isReady ? "ghost" : "primary"} disabled={pending === "room:ready"} onClick={() => void send({ type: "room:ready", ready: !me?.isReady })}>
        {me?.isReady ? "Not ready" : "Ready up"}
      </Button>
      {me?.isHost && (
        <Button variant="secondary" disabled={!ready || pending === "game:start"} onClick={() => void send({ type: "game:start" })}>
          Start mission
        </Button>
      )}
      <Button variant="ghost" onClick={() => void send({ type: "room:leave" })}>Leave room</Button>
    </Screen>
  );
}
