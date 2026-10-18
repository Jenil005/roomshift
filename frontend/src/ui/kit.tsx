import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Screen({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <main
      className={`screen-shell mx-auto flex h-dvh w-full max-w-md flex-col gap-3 overflow-hidden px-4 pb-[max(0.6rem,env(safe-area-inset-bottom))] ${className}`}
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
  return (
    <div className="flex items-center justify-between gap-3" aria-label={`Power ${value}%`}>
      <span className="font-display text-[24px] font-bold text-emergency">POWER</span>
      <span className="font-numeric text-[30px] font-bold text-emergency">{value}%</span>
    </div>
  );
}
