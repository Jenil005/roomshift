import { useGame } from "../game/GameProvider";
import { LifeBar } from "./LifeBar";
import { useServerNow } from "./time";

export function MissionHeader({ step, title, role }: { step: string; title: string; role?: string }) {
  const { state, serverTimeOffset } = useGame();
  const now = useServerNow(serverTimeOffset);
  return (
    <header className="flex flex-col gap-2">
      {state?.timer && <LifeBar now={now} timer={state.timer} />}
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="text-label">{step}</span>
        {role && <span className="ml-auto text-right text-emergency">{role}</span>}
        <span className="mission-heading font-display text-[28px] font-bold leading-none">{title}</span>
      </div>
    </header>
  );
}
