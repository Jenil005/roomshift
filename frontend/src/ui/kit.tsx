import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Screen({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <main
      className={`screen-shell mx-auto flex min-h-dvh w-full max-w-md flex-col gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] ${className}`}
    >
      {children}
    </main>
  );
}

type Variant = "primary" | "secondary" | "ghost";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-emergency text-bunker bevel-amber font-display font-bold text-[26px]",
  secondary: "bg-panel text-manual bevel-raised font-display font-bold text-[24px]",
  ghost: "bg-transparent text-soft border-2 border-panel font-body text-[22px]",
};

export function Button({ variant = "primary", className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={`min-h-16 px-4 active:translate-x-px active:translate-y-px ${VARIANTS[variant]} ${className}`} {...rest} />;
}

export function Label({ children }: { children: ReactNode }) {
  return <span className="text-label">{children}</span>;
}

export function Heading({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <h1 className={`m-0 font-display text-[40px] font-bold leading-none ${className}`}>{children}</h1>;
}

export function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null;
  return <p role="alert" className="m-0 text-emergency">{message}</p>;
}

/** Mission progress (separate from the LIFE bar, which is time). */
export function PowerBar({ value }: { value: number }) {
  const lit = Math.round(value / 10);
  return (
    <div className="flex items-center gap-2" aria-label={`Power ${value}%`}>
      <Label>Power</Label>
      <div className="grid h-[18px] flex-1 grid-cols-10 gap-[3px]">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className={i < lit ? "bg-emergency" : "bg-rule"} />
        ))}
      </div>
      <span className="font-display">{value}%</span>
    </div>
  );
}
