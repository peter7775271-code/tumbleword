"use client";

import { useState, type ReactNode } from "react";
import { serverClock } from "@/lib/client/clock";
import type { EffectCtx, EffectModule } from "./types";

/** One full turn over the effect's lifetime, resumed at the right angle after a reconnect. */
function SpinWrap({ ctx, children }: { ctx: EffectCtx; children: ReactNode }) {
  const { startedAt, expiresAt } = ctx.effect;
  const [delay] = useState(() => -(serverClock.now() - startedAt));
  return (
    <div className="h-full w-full" style={{ animation: `board-spin ${expiresAt - startedAt}ms linear ${delay}ms both` }}>
      {children}
    </div>
  );
}

export const spin: EffectModule = {
  motion: true,
  Wrap: SpinWrap,
};
