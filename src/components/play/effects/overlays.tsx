"use client";

import type { EffectCtx, EffectModule } from "./types";

/** Reads the finger position from CSS variables the board sets on pointer move (no re-render per move). */
function LightsOutOverlay({ ctx }: { ctx: EffectCtx }) {
  const dark = ctx.calm ? "rgb(3 5 15 / 0.9)" : "rgb(3 5 15 / 0.97)";
  return (
    <div
      className="pointer-events-none absolute inset-0 rounded-[6%]"
      style={{ background: `radial-gradient(circle at var(--lx, -50%) var(--ly, -50%), transparent 0, transparent 15%, ${dark} 24%)` }}
      aria-hidden
    />
  );
}

function BlackHoleOverlay({ ctx }: { ctx: EffectCtx }) {
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center" aria-hidden>
      <div
        className={`aspect-square w-[38%] rounded-full opacity-80 ${ctx.calm ? "" : "animate-vortex"}`}
        style={{
          background: "conic-gradient(from 0deg, #0b1027, #5b2a86, #0b1027, #2a3672, #0b1027, #5b2a86, #0b1027)",
          boxShadow: "0 0 3rem 1rem rgb(91 42 134 / 0.55)",
          maskImage: "radial-gradient(circle, transparent 0 18%, black 22%)",
        }}
      />
    </div>
  );
}

export const lightsOut: EffectModule = { Overlay: LightsOutOverlay };

export const blackHole: EffectModule = {
  Overlay: BlackHoleOverlay,
  tile: ({ effect }, i) => (effect.tiles?.includes(i) ? { hidden: true } : undefined),
};
