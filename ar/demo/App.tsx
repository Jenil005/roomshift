import { ArrowUpRight } from "../components/ArrowUpRight";
import { useState } from "react";
import { PhysicalPuzzle } from "../PhysicalPuzzle";
import {
  MARKER_IDS,
  MARKER_LABEL,
  type MarkerId,
  type PhysicalPuzzleResult,
} from "../types";

const MARKER_THEME: Record<MarkerId, string> = {
  book: "KNOWLEDGE",
  cup: "CONTAINMENT",
  keyboard: "ACCESS",
};

const clues = [
  {
    role: "THE ANALYST",
    number: "01",
    clue: "Knowledge is scanned before containment.",
    detail: "Scan the book before the cup.",
  },
  {
    role: "THE OPERATOR",
    number: "02",
    clue: "Access is scanned last.",
    detail: "Scan the keyboard last.",
  },
  {
    role: "THE ENGINEER",
    number: "03",
    clue: "Containment is scanned between the other two.",
    detail: "Scan the cup second.",
  },
];

export default function App() {
  const [round, setRound] = useState(0);
  if (new URLSearchParams(window.location.search).has("markers"))
    return <MarkerSheet />;
  return <Mission key={round} onReset={() => setRound((value) => value + 1)} />;
}

function Mission({ onReset }: { onReset: () => void }) {
  const [result, setResult] = useState<PhysicalPuzzleResult | null>(null);
  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="wordmark" href={import.meta.env.BASE_URL}>
          <span className="brand-symbol" aria-hidden="true">
            <ArrowUpRight />
          </span>
          ROOM<span>SHIFT</span>
        </a>
        <span className="session-badge">
          <i /> LOCAL AR MISSION
        </span>
      </header>
      <main>
        <div className="mission-heading">
          <div>
            <p className="eyebrow">
              BLACKOUT PROTOCOL <span>/</span> PHYSICAL PUZZLE 01
            </p>
            <h1>
              Restore the <em>connection.</em>
            </h1>
            <p className="intro">
              Three objects. Three clues. One way to bring the facility back
              online.
            </p>
            <a className="button secondary" href={`${import.meta.env.BASE_URL}ar-room.html`} aria-label="Open life-sized AR facility">EXPLORE 3D FACILITY <ArrowUpRight /></a>
          </div>
          <div className="power-meter">
            <span>POWER CIRCUIT</span>
            <strong>
              {result ? "01" : "00"}
              <small>/ 01</small>
            </strong>
            <div className={result ? "powered" : ""} />
          </div>
        </div>
        <div className="mission-grid">
          <div className="vision-column">
            {result ? (
              <section className="success-panel" aria-live="polite">
                <span className="success-icon" aria-hidden="true">
                  ✓
                </span>
                <p className="eyebrow">
                  PUZZLE 01 /{" "}
                  {result.source === "camera" ? "VERIFIED" : "MANUAL DEMO"}
                </p>
                <h2>
                  {result.source === "camera"
                    ? "Connection restored."
                    : "Sequence matched."}
                </h2>
                <p>
                  {result.source === "camera"
                    ? "All three objects were scanned in the correct sequence. The physical puzzle is complete on this device."
                    : "Your reported sequence matches the clues. Camera verification was not used."}
                </p>
                {result.evidence && (
                  <p className="local-note" aria-label="Evidence">
                    EVIDENCE:{" "}
                    {result.order
                      .map(
                        (id) =>
                          `${MARKER_LABEL[id]} · ${(result.evidence?.[id] ?? "manual").toUpperCase()}`,
                      )
                      .join("  /  ")}
                  </p>
                )}
                <div className="solved-order">
                  {result.order.map((id, index) => (
                    <span key={id}>
                      {index > 0 && <b aria-hidden="true">→</b>}
                      {MARKER_LABEL[id]}
                    </span>
                  ))}
                </div>
                <button className="button primary" onClick={onReset}>
                  Reset puzzle <span aria-hidden="true">↻</span>
                </button>
                <p className="local-note">
                  This local mission tests the AR puzzle. Multiplayer
                  progression will require the game server.
                </p>
              </section>
            ) : (
              <PhysicalPuzzle onResult={setResult} />
            )}
            <div className="setup-strip">
              <span className="step-number">
                <ArrowUpRight />
              </span>
              <div>
                <h3>Make the physical connection.</h3>
                <p>
                  Find a book, a cup and a keyboard, then scan them one at a
                  time in the order the clues describe. No QR code needed;
                  printed tags are an optional backup.
                </p>
              </div>
              <a
                className="button secondary"
                href={`${import.meta.env.BASE_URL}?markers`}
                target="_blank"
                rel="noreferrer"
              >
                Marker cards{" "}
                <span aria-hidden="true">
                  <ArrowUpRight />
                </span>
              </a>
            </div>
          </div>
          <aside className="clue-panel">
            <div className="clue-heading">
              <span className="eyebrow">MISSION INTELLIGENCE</span>
              <h2>Put your clues together.</h2>
              <p>
                Each role holds a piece of the answer. All three are shown for
                this single-device mission.
              </p>
            </div>
            {clues.map((clue) => (
              <article className="clue-card" key={clue.role}>
                <div>
                  <span className="role-number">{clue.number}</span>
                  <span className="eyebrow">{clue.role}</span>
                </div>
                <h3>“{clue.clue}”</h3>
                <details>
                  <summary>Decode clue</summary>
                  <p>{clue.detail}</p>
                </details>
              </article>
            ))}
            <div className="field-note">
              <span aria-hidden="true">⊙</span>
              <p>
                Use good lighting. Point at one object at a time; each one
                stays scanned when you move on.
              </p>
            </div>
          </aside>
        </div>
      </main>
      <footer>
        <span>
          ROOMSHIFT <span className="footer-separator">/</span> REALITY IS PART
          OF THE GAME.
        </span>
        <span>BLACKOUT PROTOCOL — AR FIELD TEST</span>
      </footer>
    </div>
  );
}

function MarkerSheet() {
  return (
    <main className="print-page">
      <div className="print-toolbar">
        <a href={import.meta.env.BASE_URL}>← Back to mission</a>
        <button className="button primary" onClick={() => window.print()}>
          Print marker cards
        </button>
      </div>
      <p className="eyebrow">ROOMSHIFT / FIELD EQUIPMENT</p>
      <h1>Three objects. One connection.</h1>
      <p>
        Print at actual size. Cut along the borders and place each card on its
        matching object. Keep the white border intact. Face all three cards
        toward the camera, spaced apart in a horizontal row.
      </p>
      <div className="print-cards">
        {MARKER_IDS.map((id, index) => (
          <article key={id}>
            <span>ROOMSHIFT / 0{index + 1}</span>
            <img
              src={`${import.meta.env.BASE_URL}markers/${id}.svg`}
              alt={`RoomShift ${MARKER_LABEL[id]} QR marker`}
              width={240}
              height={240}
            />
            <h2>{MARKER_LABEL[id]}</h2>
            <p>{MARKER_THEME[id]}</p>
          </article>
        ))}
      </div>
      <p className="print-note">
        These are visual identifiers only. No account, app installation, or
        external QR service is required.
      </p>
    </main>
  );
}
