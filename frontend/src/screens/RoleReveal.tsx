import { NARRATION, ROLE_DESCRIPTION, ROLE_TITLE, narrationFor } from "../game/content";
import { useGame, useMe } from "../game/useGame";
import { Button, Label, Screen } from "../ui/kit";
import { ServerError } from "../ui/ServerError";
import { FacilityButton } from "../ui/FacilityButton";

/** INTRO: the server deals roles and puzzle 1 clues, then waits for the host to proceed. */
export function RoleReveal() {
  const { room, clue, send, pending } = useGame();
  const me = useMe();
  if (!room) return null;

  return (
    <Screen>
      <div className="flex items-center justify-between gap-2">
        <span className="text-phosphor">Clearance granted</span>
        <FacilityButton />
      </div>
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
      <ServerError actions={["intro:skip"]} />
      {me?.isHost ? (
        <Button disabled={pending === "intro:skip"} onClick={() => void send({ type: "intro:skip" })}>Proceed</Button>
      ) : (
        <p className="m-0 text-center text-emergency" role="status">Waiting for the host to proceed…</p>
      )}
    </Screen>
  );
}
