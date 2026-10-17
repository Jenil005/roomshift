import { INTRO_DURATION_MS } from "@shared/constants";
import { NARRATION, ROLE_DESCRIPTION, ROLE_TITLE, narrationFor } from "../game/content";
import { useGame, useMe } from "../game/useGame";
import { Button, Label, Screen } from "../ui/kit";
import { ServerError } from "../ui/ServerError";
import { useSecondsUntil } from "../ui/time";

/** INTRO: the server deals roles and puzzle 1 clues, then auto-advances (the host may skip). */
export function RoleReveal() {
  const { room, clue, send, serverTimeOffset } = useGame();
  const me = useMe();
  const seconds = useSecondsUntil(room ? room.phaseStartedAt + INTRO_DURATION_MS - serverTimeOffset : null);
  if (!room) return null;

  return (
    <Screen>
      <span className="text-phosphor">Clearance granted</span>
      <p className="m-0 text-soft">{narrationFor(room, NARRATION.intro)}</p>
      {clue ? (
        <>
          <div className="flex flex-col">
            <Label>Your role</Label>
            <h1 className="role-title m-0 font-display text-[52px] font-bold leading-none text-emergency">{ROLE_TITLE[clue.role]}</h1>
          </div>
          <p className="m-0 text-soft">{ROLE_DESCRIPTION[clue.role]}</p>
          <div className="flex flex-col gap-1 bg-manual p-4 text-bunker bevel-paper">
            <span className="font-display text-[18px] text-panel">Your fragment</span>
            {clue.clues.map((line) => <p key={line} className="m-0 text-[28px] leading-none">{line}</p>)}
          </div>
          <p className="m-0 text-soft">Nobody else can see this. Say it out loud, then look at the room.</p>
        </>
      ) : (
        <p className="m-0 text-emergency" role="status">Receiving your private briefing…</p>
      )}
      <div className="flex-1" />
      <p className="m-0 text-center text-emergency" role="timer">{seconds > 0 ? `Mission starts in ${seconds}s` : "Mission starting…"}</p>
      <ServerError actions={["intro:skip"]} />
      {me?.isHost && <Button onClick={() => void send({ type: "intro:skip" })}>Begin now</Button>}
    </Screen>
  );
}
