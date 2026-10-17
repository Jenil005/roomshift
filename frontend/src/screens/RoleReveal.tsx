import { INTRO_DURATION_MS } from "@shared/constants";
import { useGame } from "../game/GameProvider";
import { NARRATION, ROLE_DESCRIPTION } from "../game/content";
import { Button, Label, Screen } from "../ui/kit";
import { useServerNow } from "../ui/time";
import { Clues } from "../ui/Clues";

export function RoleReveal() {
  const { state, selfId, briefing, serverTimeOffset, send } = useGame();
  const now = useServerNow(serverTimeOffset);
  const me = state?.players.find((p) => p.id === selfId);
  if (!state || !briefing) return null;
  // The server starts puzzle 1 on its own when the intro runs out; the host may skip ahead.
  const left = Math.max(0, Math.ceil((state.phaseStartedAt + INTRO_DURATION_MS - now) / 1000));

  return (
    <Screen>
      <span className="text-phosphor">Clearance granted</span>
      <p className="m-0 text-soft">{state.narration ?? NARRATION.intro}</p>
      <div className="flex flex-col">
        <Label>Your role</Label>
        <h1 className="role-title m-0 font-display text-[52px] font-bold leading-none text-emergency">{briefing.title}</h1>
      </div>
      <p className="m-0 text-soft">{ROLE_DESCRIPTION[briefing.role]}</p>
      <div className="flex flex-col gap-1 bg-manual p-4 text-bunker bevel-paper">
        <span className="font-display text-[18px] text-panel">Your fragment</span>
        <Clues lines={briefing.clues} className="text-[32px]" />
      </div>
      <p className="m-0 text-soft">Nobody else can see this. Say it out loud, then look at the room.</p>
      <div className="flex-1" />
      <p className="m-0 text-center text-emergency">Mission starts in {left}s…</p>
      {me?.isHost && <Button onClick={() => send({ type: "intro:skip" })}>Begin mission now</Button>}
    </Screen>
  );
}
