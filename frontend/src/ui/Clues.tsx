/** A player's private clue lines, one per paragraph. */
export function Clues({ lines, className = "" }: { lines: string[]; className?: string }) {
  if (lines.length === 0) return <p className={`m-0 leading-none ${className}`}>Receiving…</p>;
  return (
    <div className="flex flex-col gap-2">
      {lines.map((line) => <p key={line} className={`m-0 leading-none ${className}`}>{line}</p>)}
    </div>
  );
}
