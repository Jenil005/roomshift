import type { ClientEvent } from "@shared/events";
import { useGame } from "../game/useGame";
import { ErrorLine } from "./kit";
import { useSecondsUntil } from "./time";

/** The latest rejected request (optionally only for some actions), with a retry countdown. */
export function ServerError({ actions }: { actions?: ClientEvent["type"][] }) {
  const { lastError } = useGame();
  const seconds = useSecondsUntil(lastError?.retryAt);
  if (!lastError || (actions && !actions.includes(lastError.action))) return null;
  const wait = lastError.retryAt && seconds > 0 ? ` Retry in ${seconds}s.` : "";
  return <ErrorLine message={`${lastError.message}.${wait}`.replace("..", ".")} />;
}
