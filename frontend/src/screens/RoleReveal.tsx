import { useGame } from "../game/GameProvider";
import { NARRATION, ROLE_DESCRIPTION } from "../game/content";
import { Button, Label, Screen } from "../ui/kit";

export function RoleReveal() {
  const { state, selfId, briefing, send } = useGame();
  const me = state?.players.find((p) => p.id === selfId);
  if (!briefing) return null;
  const waiting = state?.players.filter((p) => !p.introAcked).length ?? 0;

  return (
    <Screen>
      <span className="text-phosphor">Clearance granted</span>
      <p className="m-0 text-soft">{NARRATION.intro}</p>
      <div className="flex flex-col">
        <Label>Your role</Label>
        <h1 className="role-title m-0 font-display text-[52px] font-bold leading-none text-emergency">{briefing.title}</h1>
      </div>
      <p className="m-0 text-soft">{ROLE_DESCRIPTION[briefing.role]}</p>
      <div className="flex flex-col gap-1 bg-manual p-4 text-bunker bevel-paper">
        <span className="font-display text-[18px] text-panel">Your fragment</span>
        <p className="m-0 text-[32px] leading-none">{briefing.puzzle1Clue}</p>
      </div>
      <p className="m-0 text-soft">Nobody else can see this. Say it out loud, then look at the room.</p>
      <div className="flex-1" />
      {me?.introAcked ? (
        <p className="m-0 text-center text-emergency">Waiting on {waiting} operative{waiting === 1 ? "" : "s"}…</p>
      ) : (
        <Button onClick={() => send({ type: "intro:ack" })}>Begin mission</Button>
      )}
    </Screen>
  );
}
