import { CARD_RULES } from "@/lib/game/cards";
import type { EffectCtx, EffectModule } from "./types";

/** 1 while foggy, easing to 0 over the last couple of seconds. */
const strength = ({ effect, now }: EffectCtx) => Math.max(0, Math.min(1, (effect.expiresAt - now) / CARD_RULES.fogFadeMs));

export const fog: EffectModule = {
  layer: (ctx) => ({ filter: `blur(${(10 * strength(ctx)).toFixed(1)}px)`, transition: "filter 250ms linear" }),
  preview: (ctx) => ({ filter: `blur(${(7 * strength(ctx)).toFixed(1)}px)`, transition: "filter 250ms linear" }),
};
