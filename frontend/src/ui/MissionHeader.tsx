import { useGame } from "../game/GameProvider";
import { LifeBar } from "./LifeBar";
import { useServerNow } from "./time";

export function MissionHeader({ step, title }: { step: string; title: string }) {
  const { state, serverTimeOffset } = useGame();
  const now = useServerNow(serverTimeOffset);
  return (
    <header className="flex flex-col gap-2">
      {state?.startedAt && state.deadline && <LifeBar now={now} startedAt={state.startedAt} deadline={state.deadline} />}
      <div className="flex flex-col">
        <span className="text-label">{step}</span>
        <span className="mission-heading font-display text-[28px] font-bold leading-none">{title}</span>
      </div>
    </header>
  );
}
