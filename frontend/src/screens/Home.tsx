import { useState } from "react";
import { useGame } from "../game/GameProvider";
import { Button, ErrorLine, Screen } from "../ui/kit";

export function Home() {
  const { send } = useGame();
  const initialCode = new URLSearchParams(window.location.search).get("room") ?? ""; // QR codes can link to ?room=K7QX
  const [name, setName] = useState("");
  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState<string | null>(null);

  const join = () => {
    if (!name.trim()) return setError("Enter a callsign first.");
    if (code.trim().length !== 4) return setError("Room codes are 4 characters.");
    send({ type: "room:join", code: code.trim(), name: name.trim() });
  };
  const create = () => {
    if (!name.trim()) return setError("Enter a callsign first.");
    send({ type: "room:create", name: name.trim() });
  };

  return (
    <Screen className="justify-center">
      <h1 className="home-title m-0 font-title font-bold text-emergency title-layered">BLACKOUT<br />PROTOCOL</h1>
      <p className="m-0 text-soft">Facility 04 is on reserve power. Get your team in a room.</p>
      <label className="flex flex-col gap-1">
        <span className="text-label">Callsign</span>
        <input
          value={name}
          onChange={(e) => { setName(e.target.value); setError(null); }}
          maxLength={16}
          autoComplete="nickname"
          placeholder="Maya"
          className="h-14 bg-inset px-3 text-[24px] text-manual bevel-sunken placeholder:text-bevel"
        />
      </label>
      <Button onClick={create}>Create room</Button>
      <div className="mt-2 flex gap-2">
        <input
          value={code}
          onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(null); }}
          maxLength={4}
          autoCapitalize="characters"
          aria-label="Room code"
          placeholder="K7QX"
          className="h-16 w-32 bg-inset px-3 text-center font-display text-[28px] tracking-widest text-manual bevel-sunken placeholder:text-bevel"
        />
        <Button variant="secondary" className="flex-1" onClick={join}>Join</Button>
      </div>
      <ErrorLine message={error} />
    </Screen>
  );
}
