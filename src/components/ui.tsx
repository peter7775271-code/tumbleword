"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { GAME_NAME } from "@/lib/game/constants";
import { useMuted } from "@/lib/client/sound";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-amber text-ink-950 shadow-[0_0.3em_0_#b37b00] active:translate-y-[0.15em] active:shadow-[0_0.15em_0_#b37b00]",
  secondary: "bg-ink-700 text-white shadow-[0_0.3em_0_#141c45] active:translate-y-[0.15em] active:shadow-[0_0.15em_0_#141c45]",
  danger: "bg-flame text-ink-950 shadow-[0_0.3em_0_#a8431b] active:translate-y-[0.15em]",
  ghost: "bg-transparent text-ink-300 ring-2 ring-ink-700",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...props}
      className={`rounded-2xl px-6 py-3 font-black tracking-wide transition-transform outline-none focus-visible:ring-4 focus-visible:ring-sky focus-visible:ring-offset-4 focus-visible:ring-offset-ink-950 disabled:opacity-40 disabled:shadow-none ${VARIANTS[variant]} ${className}`}
    />
  );
}

/** Wordmark: each letter is a small tumbling tile. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex select-none gap-[0.08em] font-black ${className}`} aria-label={GAME_NAME} role="img">
      {GAME_NAME.toUpperCase()
        .split("")
        .map((ch, i) => (
          <span
            key={i}
            aria-hidden
            className="grid aspect-square w-[1.15em] place-items-center rounded-[0.18em] bg-cream text-tile-ink shadow-[0_0.1em_0_var(--color-tile-edge)]"
            style={{ transform: `rotate(${[-6, 4, -3, 7, -5, 3, -7, 5, -4, 6][i % 10]}deg)` }}
          >
            {ch}
          </span>
        ))}
    </div>
  );
}

export function Avatar({
  emoji,
  color,
  size = "md",
  dimmed = false,
}: {
  emoji: string;
  color: string;
  size?: "sm" | "md" | "lg" | "xl";
  dimmed?: boolean;
}) {
  const sizes = { sm: "w-8 text-lg", md: "w-12 text-2xl", lg: "w-20 text-4xl", xl: "w-28 text-6xl" };
  return (
    <span
      aria-hidden
      className={`inline-grid aspect-square shrink-0 place-items-center rounded-full ring-4 ${sizes[size]} ${dimmed ? "opacity-40 grayscale" : ""}`}
      style={{ backgroundColor: `${color}33`, ["--tw-ring-color" as string]: color }}
    >
      {emoji}
    </span>
  );
}

export function MuteToggle({ className = "" }: { className?: string }) {
  const [muted, setMuted] = useMuted();
  return (
    <button
      type="button"
      onClick={() => setMuted(!muted)}
      aria-pressed={muted}
      aria-label={muted ? "Unmute sounds" : "Mute sounds"}
      className={`grid aspect-square w-12 place-items-center rounded-full bg-ink-800 text-2xl outline-none focus-visible:ring-4 focus-visible:ring-sky ${className}`}
    >
      {muted ? "🔇" : "🔊"}
    </button>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-3xl bg-ink-900/80 p-6 ring-1 ring-white/10 ${className}`}>{children}</div>;
}

export function Banner({ children }: { children: ReactNode }) {
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-50 bg-flame px-4 py-2 text-center font-bold text-ink-950">
      {children}
    </div>
  );
}
