import { useState } from "react";
import { PLAYER_NAME_MAX_LENGTH, ROOM_CODE_LENGTH } from "@shared/constants";
import { useGame } from "../game/useGame";
import { Button, ErrorLine, Screen } from "../ui/kit";

export function Home() {
  const { send, pending, lastError, resuming, clearError } = useGame();
  const initialCode = new URLSearchParams(window.location.search).get("room") ?? ""; // QR codes can link to ?room=KXQB
  const [name, setName] = useState("");
  const [code, setCode] = useState(initialCode.toUpperCase());
  const [error, setError] = useState<string | null>(null);
  const busy = pending === "room:create" || pending === "room:join" || resuming;

  const edit = () => {
    setError(null);
    clearError();
  };
  const join = () => {
    if (!name.trim()) return setError("Enter a callsign first.");
    if (code.trim().length !== ROOM_CODE_LENGTH) return setError(`Room codes are ${ROOM_CODE_LENGTH} letters.`);
    void send({ type: "room:join", code: code.trim(), playerName: name.trim() });
  };
  const create = () => {
    if (!name.trim()) return setError("Enter a callsign first.");
    void send({ type: "room:create", playerName: name.trim() });
  };

  return (
    <Screen className="justify-center">
      <h1 className="home-title m-0 font-title font-bold text-emergency title-layered">BLACKOUT<br />PROTOCOL</h1>
      <p className="m-0 text-soft">Facility 04 is on reserve power. Get your team in a room.</p>
      {resuming && <p className="m-0 text-phosphor" role="status">Reconnecting to your mission…</p>}
      <label className="flex flex-col gap-1">
        <span className="text-label">Call sign</span>
        <input
          value={name}
          onChange={(e) => { setName(e.target.value); edit(); }}
          maxLength={PLAYER_NAME_MAX_LENGTH}
          autoComplete="nickname"
          enterKeyHint="go"
          placeholder="Maya"
          className="h-14 bg-inset px-3 text-[24px] text-manual bevel-sunken placeholder:text-bevel"
        />
      </label>
      <Button onClick={create} disabled={busy}>{pending === "room:create" ? "Opening room…" : "Create room"}</Button>
      <div className="mt-2 flex gap-2">
        <input
          value={code}
          onChange={(e) => { setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, "")); edit(); }}
          maxLength={ROOM_CODE_LENGTH}
          autoCapitalize="characters"
          autoCorrect="off"
          aria-label="Room code"
          placeholder="KXQB"
          className="h-16 w-32 bg-inset px-3 text-center font-display text-[28px] tracking-widest text-manual bevel-sunken placeholder:text-bevel"
        />
        <Button variant="secondary" className="flex-1" onClick={join} disabled={busy}>{pending === "room:join" ? "Joining…" : "Join"}</Button>
      </div>
      <ErrorLine message={error ?? lastError?.message ?? null} />
    </Screen>
  );
}
